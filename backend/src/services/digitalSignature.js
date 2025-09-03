const crypto = require('crypto');
const { logger } = require('../utils/logger');

class DigitalSignatureService {
  constructor() {
    this.signatureAlgorithm = 'RSA-SHA256';
    this.keyLength = 2048;
    this.initializeService();
  }

  initializeService() {
    logger.info('Digital signature service initialized', {
      algorithm: this.signatureAlgorithm,
      keyLength: this.keyLength
    });
  }

  // Generate RSA key pair for digital signatures
  generateKeyPair() {
    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: this.keyLength,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      return {
        publicKey,
        privateKey,
        keyId: this.generateKeyId(publicKey),
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to generate key pair', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Key generation failed');
    }
  }

  // Generate unique key ID from public key
  generateKeyId(publicKey) {
    return crypto.createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .substring(0, 16);
  }

  // Create digital signature for document
  signDocument(documentData, privateKey, signerInfo) {
    try {
      // Create document hash
      const documentHash = this.createDocumentHash(documentData);
      
      // Create signature payload
      const signaturePayload = {
        documentHash,
        signerInfo: {
          userId: signerInfo.userId,
          name: signerInfo.name,
          email: signerInfo.email,
          role: signerInfo.role,
          timestamp: new Date().toISOString(),
          ipAddress: signerInfo.ipAddress || null,
          userAgent: signerInfo.userAgent || null
        },
        algorithm: this.signatureAlgorithm,
        version: '1.0'
      };

      // Sign the payload
      const payloadString = JSON.stringify(signaturePayload, null, 0);
      const signature = crypto.sign(this.signatureAlgorithm, Buffer.from(payloadString), {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      });

      return {
        signature: signature.toString('base64'),
        payload: signaturePayload,
        signatureId: this.generateSignatureId(signature),
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to create digital signature', {
        error: error.message,
        stack: error.stack,
        userId: signerInfo?.userId
      });
      throw new Error('Document signing failed');
    }
  }

  // Verify digital signature
  verifySignature(documentData, signatureData, publicKey) {
    try {
      const { signature, payload } = signatureData;
      
      // Verify document hasn't been tampered with
      const currentDocumentHash = this.createDocumentHash(documentData);
      if (currentDocumentHash !== payload.documentHash) {
        return {
          valid: false,
          reason: 'Document has been modified after signing',
          timestamp: new Date().toISOString()
        };
      }

      // Verify signature
      const payloadString = JSON.stringify(payload, null, 0);
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      const isValid = crypto.verify(
        this.signatureAlgorithm,
        Buffer.from(payloadString),
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        },
        signatureBuffer
      );

      return {
        valid: isValid,
        reason: isValid ? 'Signature is valid' : 'Invalid signature',
        signerInfo: payload.signerInfo,
        algorithm: payload.algorithm,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to verify digital signature', {
        error: error.message,
        stack: error.stack
      });
      return {
        valid: false,
        reason: 'Signature verification failed',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Create document hash
  createDocumentHash(documentData) {
    // Normalize document data for consistent hashing
    let dataToHash;
    if (typeof documentData === 'string') {
      dataToHash = documentData;
    } else if (Buffer.isBuffer(documentData)) {
      dataToHash = documentData;
    } else {
      dataToHash = JSON.stringify(documentData, null, 0);
    }

    return crypto.createHash('sha256')
      .update(dataToHash)
      .digest('hex');
  }

  // Generate unique signature ID
  generateSignatureId(signature) {
    return crypto.createHash('sha256')
      .update(signature)
      .digest('hex')
      .substring(0, 32);
  }

  // Create signature certificate
  createSignatureCertificate(signatureData, documentInfo) {
    return {
      certificateId: crypto.randomUUID(),
      documentInfo: {
        title: documentInfo.title || 'Contract Document',
        type: documentInfo.type || 'CONTRACT',
        contractNumber: documentInfo.contractNumber || null,
        documentId: documentInfo.documentId || null
      },
      signatureInfo: {
        signatureId: signatureData.signatureId,
        signerName: signatureData.payload.signerInfo.name,
        signerEmail: signatureData.payload.signerInfo.email,
        signerRole: signatureData.payload.signerInfo.role,
        signedAt: signatureData.payload.signerInfo.timestamp,
        ipAddress: signatureData.payload.signerInfo.ipAddress,
        userAgent: signatureData.payload.signerInfo.userAgent
      },
      verification: {
        algorithm: signatureData.payload.algorithm,
        version: signatureData.payload.version,
        documentHash: signatureData.payload.documentHash
      },
      issuedAt: new Date().toISOString(),
      issuer: 'CO-LAB CRM Digital Signature Service'
    };
  }

  // Batch verify multiple signatures on a document
  verifyMultipleSignatures(documentData, signatures, publicKeys) {
    const results = [];
    
    for (let i = 0; i < signatures.length; i++) {
      const signature = signatures[i];
      const publicKey = publicKeys[i] || publicKeys[signature.keyId];
      
      if (!publicKey) {
        results.push({
          signatureId: signature.signatureId,
          valid: false,
          reason: 'Public key not found for signature verification'
        });
        continue;
      }

      const verification = this.verifySignature(documentData, signature, publicKey);
      results.push({
        signatureId: signature.signatureId,
        ...verification
      });
    }

    const allValid = results.every(result => result.valid);
    
    return {
      allSignaturesValid: allValid,
      totalSignatures: signatures.length,
      validSignatures: results.filter(r => r.valid).length,
      results,
      verifiedAt: new Date().toISOString()
    };
  }

  // Generate signature request token for email workflows
  generateSignatureRequest(documentId, requiredSigners, requestingUser, expirationHours = 72) {
    const requestData = {
      documentId,
      requiredSigners: requiredSigners.map(signer => ({
        userId: signer.userId || null,
        email: signer.email,
        name: signer.name,
        role: signer.role || 'Signer',
        required: signer.required !== false
      })),
      requestingUser: {
        userId: requestingUser.userId,
        name: requestingUser.name,
        email: requestingUser.email
      },
      requestId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (expirationHours * 60 * 60 * 1000)).toISOString(),
      status: 'PENDING'
    };

    // Generate secure token for signature request
    const token = crypto.createHash('sha256')
      .update(JSON.stringify(requestData) + process.env.JWT_SECRET)
      .digest('hex');

    return {
      ...requestData,
      token,
      signatureUrl: `/signature/${token}`
    };
  }

  // Validate signature request token
  validateSignatureRequestToken(token, documentId) {
    try {
      // In a real implementation, this would be stored in database
      // For now, we'll just validate the token format
      if (!token || token.length !== 64) {
        return { valid: false, reason: 'Invalid token format' };
      }

      return {
        valid: true,
        documentId,
        message: 'Token is valid'
      };
    } catch (error) {
      return {
        valid: false,
        reason: 'Token validation failed',
        error: error.message
      };
    }
  }

  // Get signature workflow status
  getSignatureWorkflowStatus(signatures, requiredSigners) {
    const signedUsers = new Set(signatures.map(sig => sig.payload.signerInfo.userId));
    const requiredUserIds = requiredSigners.filter(s => s.required).map(s => s.userId);
    const optionalUserIds = requiredSigners.filter(s => !s.required).map(s => s.userId);

    const requiredSigned = requiredUserIds.filter(id => signedUsers.has(id));
    const optionalSigned = optionalUserIds.filter(id => signedUsers.has(id));

    const allRequiredSigned = requiredSigned.length === requiredUserIds.length;
    const completionPercentage = Math.round((signedUsers.size / requiredSigners.length) * 100);

    return {
      status: allRequiredSigned ? 'COMPLETED' : 'PENDING',
      totalSigners: requiredSigners.length,
      signedCount: signatures.length,
      requiredSigners: requiredUserIds.length,
      requiredSigned: requiredSigned.length,
      optionalSigners: optionalUserIds.length,
      optionalSigned: optionalSigned.length,
      completionPercentage,
      allRequiredSigned,
      pendingSigners: requiredSigners.filter(s => !signedUsers.has(s.userId)),
      lastSignedAt: signatures.length > 0 
        ? Math.max(...signatures.map(s => new Date(s.payload.signerInfo.timestamp).getTime()))
        : null
    };
  }
}

// Singleton instance
const digitalSignatureService = new DigitalSignatureService();

module.exports = digitalSignatureService;