const express = require('express');
const { PrismaClient } = require('@prisma/client');
const digitalSignatureService = require('../services/digitalSignature');
const signatureKeysService = require('../services/signatureKeys');
const { logger, logBusinessEvent } = require('../utils/logger');
const Joi = require('joi');
const { validate } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const generateKeysSchema = Joi.object({
  regenerate: Joi.boolean().default(false)
});

const signDocumentSchema = Joi.object({
  contractId: Joi.string().required(),
  documentData: Joi.string().required(), // Base64 encoded document content
  signerInfo: Joi.object({
    role: Joi.string().optional(),
    comments: Joi.string().optional().allow(''),
    ipAddress: Joi.string().optional(),
    userAgent: Joi.string().optional()
  }).optional()
});

const verifySignatureSchema = Joi.object({
  contractId: Joi.string().required(),
  documentData: Joi.string().required(),
  signatureId: Joi.string().optional() // If not provided, verify all signatures
});

const signatureRequestSchema = Joi.object({
  contractId: Joi.string().required(),
  requiredSigners: Joi.array().items(
    Joi.object({
      userId: Joi.string().optional(),
      email: Joi.string().email().required(),
      name: Joi.string().required(),
      role: Joi.string().default('Signer'),
      required: Joi.boolean().default(true)
    })
  ).min(1).required(),
  expirationHours: Joi.number().min(1).max(168).default(72), // Max 1 week
  message: Joi.string().optional().allow('')
});

// POST /api/digital-signatures/keys/generate - Generate signature keys for user
router.post('/keys/generate', validate(generateKeysSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { regenerate } = req.body;

    // Check if user already has keys
    const existingKeys = await signatureKeysService.getUserKeys(userId);
    if (existingKeys && !regenerate) {
      return res.json({
        message: 'User already has signature keys',
        keys: existingKeys,
        regenerated: false
      });
    }

    // Revoke existing keys if regenerating
    if (existingKeys && regenerate) {
      await signatureKeysService.revokeUserKeys(userId, 'Key regeneration requested');
    }

    // Generate new keys
    const keys = await signatureKeysService.generateUserKeys(userId, {
      name: req.user.name || req.user.email,
      email: req.user.email,
      role: req.user.role || 'USER'
    });

    logBusinessEvent('signature_keys_generated', req, {
      keyId: keys.keyId,
      regenerated: !!regenerate
    });

    res.json({
      message: 'Signature keys generated successfully',
      keys: {
        keyId: keys.keyId,
        publicKey: keys.publicKey,
        createdAt: keys.createdAt,
        status: keys.status
      },
      regenerated: !!regenerate
    });

  } catch (error) {
    logger.error('Failed to generate signature keys', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// GET /api/digital-signatures/keys - Get user's signature keys
router.get('/keys', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const keys = await signatureKeysService.getUserKeys(userId);

    if (!keys) {
      return res.status(404).json({
        error: 'No signature keys found for user',
        hasKeys: false
      });
    }

    res.json({
      hasKeys: true,
      keys: {
        keyId: keys.keyId,
        publicKey: keys.publicKey,
        createdAt: keys.createdAt,
        status: keys.status
      }
    });

  } catch (error) {
    logger.error('Failed to get user signature keys', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// POST /api/digital-signatures/sign - Sign a contract document
router.post('/sign', validate(signDocumentSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { contractId, documentData, signerInfo = {} } = req.body;

    // Verify contract exists and user has access
    const contract = await prisma.contract.findFirst({
      where: {
        id: contractId,
        OR: [
          { userId: userId },
          { responsibleManager: req.user.email }
        ]
      },
      include: {
        client: {
          select: { name: true, email: true }
        }
      }
    });

    if (!contract) {
      return res.status(404).json({
        error: 'Contract not found or access denied'
      });
    }

    // Get user's private key
    const userKeys = await signatureKeysService.getUserPrivateKey(userId);
    if (!userKeys) {
      return res.status(400).json({
        error: 'No signature keys found. Please generate keys first.',
        needsKeys: true
      });
    }

    // Prepare signer info
    const completeSignerInfo = {
      userId,
      name: req.user.name || req.user.email,
      email: req.user.email,
      role: signerInfo.role || 'Contract Manager',
      comments: signerInfo.comments || '',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    };

    // Create digital signature
    const documentBuffer = Buffer.from(documentData, 'base64');
    const signature = digitalSignatureService.signDocument(
      documentBuffer,
      userKeys.privateKey,
      completeSignerInfo
    );

    // Create signature certificate
    const certificate = digitalSignatureService.createSignatureCertificate(
      signature,
      {
        title: `Contract ${contract.contractNumber}`,
        type: 'CONTRACT',
        contractNumber: contract.contractNumber,
        documentId: contractId
      }
    );

    // Store signature in database (you may want to create a signatures table)
    // For now, we'll use the contract metadata field
    const existingMetadata = contract.metadata ? JSON.parse(contract.metadata) : {};
    const signatures = existingMetadata.signatures || [];
    
    signatures.push({
      signatureId: signature.signatureId,
      certificateId: certificate.certificateId,
      signerId: userId,
      signerName: completeSignerInfo.name,
      signerEmail: completeSignerInfo.email,
      signedAt: signature.createdAt,
      keyId: userKeys.keyId,
      verified: true
    });

    // Update contract with signature info
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        metadata: JSON.stringify({
          ...existingMetadata,
          signatures,
          lastSignedAt: signature.createdAt
        }),
        status: signatures.length > 0 ? 'SIGNED' : contract.status
      }
    });

    logBusinessEvent('contract_signed', req, {
      contractId,
      contractNumber: contract.contractNumber,
      signatureId: signature.signatureId,
      certificateId: certificate.certificateId
    });

    res.json({
      message: 'Contract signed successfully',
      signature: {
        signatureId: signature.signatureId,
        certificateId: certificate.certificateId,
        signedAt: signature.createdAt,
        signerInfo: {
          name: completeSignerInfo.name,
          email: completeSignerInfo.email,
          role: completeSignerInfo.role
        }
      },
      contract: {
        id: contract.id,
        contractNumber: contract.contractNumber,
        status: 'SIGNED',
        totalSignatures: signatures.length
      }
    });

  } catch (error) {
    logger.error('Failed to sign contract', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      contractId: req.body.contractId
    });
    next(error);
  }
});

// POST /api/digital-signatures/verify - Verify contract signatures
router.post('/verify', validate(verifySignatureSchema), async (req, res, next) => {
  try {
    const { contractId, documentData, signatureId } = req.body;

    // Get contract with signatures
    const contract = await prisma.contract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const metadata = contract.metadata ? JSON.parse(contract.metadata) : {};
    const signatures = metadata.signatures || [];

    if (signatures.length === 0) {
      return res.json({
        message: 'No signatures found on this contract',
        hasSignatures: false,
        totalSignatures: 0
      });
    }

    const documentBuffer = Buffer.from(documentData, 'base64');
    const verificationResults = [];

    // Verify specific signature or all signatures
    const signaturesToVerify = signatureId 
      ? signatures.filter(s => s.signatureId === signatureId)
      : signatures;

    for (const sig of signaturesToVerify) {
      try {
        // Get signer's public key
        const publicKeyInfo = await signatureKeysService.getPublicKey(sig.keyId);
        
        if (!publicKeyInfo) {
          verificationResults.push({
            signatureId: sig.signatureId,
            valid: false,
            reason: 'Public key not found',
            signerInfo: {
              name: sig.signerName,
              email: sig.signerEmail
            }
          });
          continue;
        }

        // For verification, we need the full signature data
        // In a real implementation, this would be stored separately
        const mockSignatureData = {
          signature: 'mock-signature', // Would be real signature from storage
          payload: {
            documentHash: digitalSignatureService.createDocumentHash(documentBuffer),
            signerInfo: {
              userId: sig.signerId,
              name: sig.signerName,
              email: sig.signerEmail,
              timestamp: sig.signedAt
            }
          }
        };

        const verification = digitalSignatureService.verifySignature(
          documentBuffer,
          mockSignatureData,
          publicKeyInfo.publicKey
        );

        verificationResults.push({
          signatureId: sig.signatureId,
          certificateId: sig.certificateId,
          ...verification,
          signerInfo: {
            name: sig.signerName,
            email: sig.signerEmail,
            signedAt: sig.signedAt
          }
        });

      } catch (error) {
        verificationResults.push({
          signatureId: sig.signatureId,
          valid: false,
          reason: `Verification failed: ${error.message}`,
          signerInfo: {
            name: sig.signerName,
            email: sig.signerEmail
          }
        });
      }
    }

    const validSignatures = verificationResults.filter(r => r.valid).length;
    const allValid = validSignatures === verificationResults.length;

    res.json({
      message: 'Signature verification completed',
      contractId,
      hasSignatures: true,
      totalSignatures: signatures.length,
      verifiedSignatures: verificationResults.length,
      validSignatures,
      allSignaturesValid: allValid,
      verificationResults,
      verifiedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to verify signatures', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      contractId: req.body.contractId
    });
    next(error);
  }
});

// GET /api/digital-signatures/contract/:contractId - Get contract signature status
router.get('/contract/:contractId', async (req, res, next) => {
  try {
    const { contractId } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        client: {
          select: { name: true, email: true }
        }
      }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const metadata = contract.metadata ? JSON.parse(contract.metadata) : {};
    const signatures = metadata.signatures || [];

    // Get signature workflow status if required signers are defined
    const requiredSigners = metadata.requiredSigners || [];
    let workflowStatus = null;
    
    if (requiredSigners.length > 0) {
      workflowStatus = digitalSignatureService.getSignatureWorkflowStatus(
        signatures.map(s => ({
          payload: {
            signerInfo: { userId: s.signerId }
          }
        })),
        requiredSigners
      );
    }

    res.json({
      contractId,
      contractNumber: contract.contractNumber,
      contractType: contract.contractType,
      status: contract.status,
      client: contract.client,
      signatures: signatures.map(s => ({
        signatureId: s.signatureId,
        certificateId: s.certificateId,
        signerName: s.signerName,
        signerEmail: s.signerEmail,
        signedAt: s.signedAt,
        verified: s.verified
      })),
      signatureStats: {
        totalSignatures: signatures.length,
        hasSignatures: signatures.length > 0,
        lastSignedAt: metadata.lastSignedAt || null,
        allVerified: signatures.every(s => s.verified)
      },
      workflowStatus,
      requiredSigners: requiredSigners.length
    });

  } catch (error) {
    logger.error('Failed to get contract signature status', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      contractId: req.params.contractId
    });
    next(error);
  }
});

// POST /api/digital-signatures/request - Create signature request for multiple signers
router.post('/request', validate(signatureRequestSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { contractId, requiredSigners, expirationHours, message } = req.body;

    // Verify contract exists
    const contract = await prisma.contract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Generate signature request
    const signatureRequest = digitalSignatureService.generateSignatureRequest(
      contractId,
      requiredSigners,
      {
        userId,
        name: req.user.name || req.user.email,
        email: req.user.email
      },
      expirationHours
    );

    // Update contract metadata with signature request info
    const existingMetadata = contract.metadata ? JSON.parse(contract.metadata) : {};
    
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        metadata: JSON.stringify({
          ...existingMetadata,
          signatureRequest: {
            requestId: signatureRequest.requestId,
            requiredSigners: signatureRequest.requiredSigners,
            createdAt: signatureRequest.createdAt,
            expiresAt: signatureRequest.expiresAt,
            status: signatureRequest.status,
            message: message || ''
          },
          requiredSigners: signatureRequest.requiredSigners
        }),
        status: 'SENT' // Update contract status to SENT
      }
    });

    logBusinessEvent('signature_request_created', req, {
      contractId,
      requestId: signatureRequest.requestId,
      requiredSigners: requiredSigners.length,
      expirationHours
    });

    res.json({
      message: 'Signature request created successfully',
      signatureRequest: {
        requestId: signatureRequest.requestId,
        contractId,
        contractNumber: contract.contractNumber,
        requiredSigners: signatureRequest.requiredSigners.map(s => ({
          email: s.email,
          name: s.name,
          role: s.role,
          required: s.required
        })),
        createdAt: signatureRequest.createdAt,
        expiresAt: signatureRequest.expiresAt,
        status: signatureRequest.status,
        signatureUrl: `${req.protocol}://${req.get('host')}${signatureRequest.signatureUrl}`
      }
    });

  } catch (error) {
    logger.error('Failed to create signature request', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      contractId: req.body.contractId
    });
    next(error);
  }
});

// GET /api/digital-signatures/keys/statistics - Get signature keys statistics (admin)
router.get('/keys/statistics', async (req, res, next) => {
  try {
    // Check if user has admin privileges (implement your own logic)
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const statistics = await signatureKeysService.getKeyStatistics();
    
    res.json({
      message: 'Signature keys statistics',
      statistics
    });

  } catch (error) {
    logger.error('Failed to get signature keys statistics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// DELETE /api/digital-signatures/keys - Revoke user's signature keys
router.delete('/keys', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    const result = await signatureKeysService.revokeUserKeys(
      userId,
      reason || 'User requested key revocation'
    );

    logBusinessEvent('signature_keys_revoked', req, {
      keyId: result.keyId,
      reason: result.reason
    });

    res.json({
      message: 'Signature keys revoked successfully',
      result
    });

  } catch (error) {
    logger.error('Failed to revoke signature keys', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

module.exports = router;