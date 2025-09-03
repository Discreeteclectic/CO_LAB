const digitalSignatureService = require('../../../src/services/digitalSignature');
const { createTestData, cleanTestData } = require('../../helpers/testHelpers');
const crypto = require('crypto');

describe('Digital Signature Service', () => {
  let testData;

  beforeAll(async () => {
    testData = await createTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  describe('Key Generation', () => {
    test('should generate RSA key pair', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();

      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(typeof keyPair.publicKey).toBe('string');
      expect(typeof keyPair.privateKey).toBe('string');
      expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });

    test('should generate different key pairs on multiple calls', async () => {
      const keyPair1 = await digitalSignatureService.generateKeyPair();
      const keyPair2 = await digitalSignatureService.generateKeyPair();

      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
    });
  });

  describe('Document Signing', () => {
    test('should sign document with private key', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const documentData = 'Test document content for signing';

      const signature = await digitalSignatureService.signDocument(
        documentData,
        keyPair.privateKey
      );

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    test('should create different signatures for different documents', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const document1 = 'First document content';
      const document2 = 'Second document content';

      const signature1 = await digitalSignatureService.signDocument(document1, keyPair.privateKey);
      const signature2 = await digitalSignatureService.signDocument(document2, keyPair.privateKey);

      expect(signature1).not.toBe(signature2);
    });

    test('should handle JSON document data', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const documentObject = {
        orderId: 'ORD-001',
        clientId: 123,
        products: [{ name: 'Oxygen Cylinder', quantity: 5 }],
        totalAmount: 17500.00
      };

      const signature = await digitalSignatureService.signDocument(
        JSON.stringify(documentObject),
        keyPair.privateKey
      );

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
    });
  });

  describe('Signature Verification', () => {
    test('should verify valid signature', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const documentData = 'Test document for verification';
      
      const signature = await digitalSignatureService.signDocument(
        documentData,
        keyPair.privateKey
      );

      const isValid = await digitalSignatureService.verifySignature(
        documentData,
        signature,
        keyPair.publicKey
      );

      expect(isValid).toBe(true);
    });

    test('should reject invalid signature', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const documentData = 'Original document';
      const tamperedData = 'Tampered document';
      
      const signature = await digitalSignatureService.signDocument(
        documentData,
        keyPair.privateKey
      );

      const isValid = await digitalSignatureService.verifySignature(
        tamperedData,
        signature,
        keyPair.publicKey
      );

      expect(isValid).toBe(false);
    });

    test('should reject signature with wrong public key', async () => {
      const keyPair1 = await digitalSignatureService.generateKeyPair();
      const keyPair2 = await digitalSignatureService.generateKeyPair();
      const documentData = 'Test document';
      
      const signature = await digitalSignatureService.signDocument(
        documentData,
        keyPair1.privateKey
      );

      const isValid = await digitalSignatureService.verifySignature(
        documentData,
        signature,
        keyPair2.publicKey
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Document Hash Generation', () => {
    test('should generate consistent hash for same document', async () => {
      const documentData = 'Test document for hashing';
      
      const hash1 = await digitalSignatureService.generateDocumentHash(documentData);
      const hash2 = await digitalSignatureService.generateDocumentHash(documentData);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA-256 hash length in hex
    });

    test('should generate different hashes for different documents', async () => {
      const document1 = 'First document';
      const document2 = 'Second document';
      
      const hash1 = await digitalSignatureService.generateDocumentHash(document1);
      const hash2 = await digitalSignatureService.generateDocumentHash(document2);

      expect(hash1).not.toBe(hash2);
    });

    test('should handle empty document', async () => {
      const hash = await digitalSignatureService.generateDocumentHash('');
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });
  });

  describe('Certificate Management', () => {
    test('should create signed certificate', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const certificateData = {
        userId: testData.user.id,
        userName: testData.user.name,
        email: testData.user.email,
        role: testData.user.role,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      };

      const certificate = await digitalSignatureService.createSignedCertificate(
        certificateData,
        keyPair.privateKey
      );

      expect(certificate).toHaveProperty('data');
      expect(certificate).toHaveProperty('signature');
      expect(certificate).toHaveProperty('hash');
      expect(certificate.data).toEqual(certificateData);
    });

    test('should verify signed certificate', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const certificateData = {
        userId: testData.user.id,
        userName: testData.user.name,
        email: testData.user.email
      };

      const certificate = await digitalSignatureService.createSignedCertificate(
        certificateData,
        keyPair.privateKey
      );

      const isValid = await digitalSignatureService.verifyCertificate(
        certificate,
        keyPair.publicKey
      );

      expect(isValid).toBe(true);
    });

    test('should reject tampered certificate', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const certificateData = { userId: testData.user.id };

      const certificate = await digitalSignatureService.createSignedCertificate(
        certificateData,
        keyPair.privateKey
      );

      // Tamper with certificate data
      certificate.data.userId = 99999;

      const isValid = await digitalSignatureService.verifyCertificate(
        certificate,
        keyPair.publicKey
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid private key for signing', async () => {
      const documentData = 'Test document';
      const invalidPrivateKey = 'invalid-private-key';

      await expect(
        digitalSignatureService.signDocument(documentData, invalidPrivateKey)
      ).rejects.toThrow();
    });

    test('should handle invalid public key for verification', async () => {
      const documentData = 'Test document';
      const signature = 'some-signature';
      const invalidPublicKey = 'invalid-public-key';

      await expect(
        digitalSignatureService.verifySignature(documentData, signature, invalidPublicKey)
      ).rejects.toThrow();
    });

    test('should handle malformed signature', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const documentData = 'Test document';
      const malformedSignature = 'not-a-valid-signature';

      const isValid = await digitalSignatureService.verifySignature(
        documentData,
        malformedSignature,
        keyPair.publicKey
      );

      expect(isValid).toBe(false);
    });

    test('should handle null/undefined inputs gracefully', async () => {
      await expect(
        digitalSignatureService.generateDocumentHash(null)
      ).not.toThrow();

      await expect(
        digitalSignatureService.generateDocumentHash(undefined)
      ).not.toThrow();
    });
  });

  describe('Performance', () => {
    test('should handle large documents efficiently', async () => {
      const keyPair = await digitalSignatureService.generateKeyPair();
      const largeDocument = 'A'.repeat(10000); // 10KB document
      
      const startTime = Date.now();
      const signature = await digitalSignatureService.signDocument(
        largeDocument,
        keyPair.privateKey
      );
      const signingTime = Date.now() - startTime;

      const verifyStartTime = Date.now();
      const isValid = await digitalSignatureService.verifySignature(
        largeDocument,
        signature,
        keyPair.publicKey
      );
      const verificationTime = Date.now() - verifyStartTime;

      expect(isValid).toBe(true);
      expect(signingTime).toBeLessThan(1000); // Should complete within 1 second
      expect(verificationTime).toBeLessThan(1000);
    });
  });
});
