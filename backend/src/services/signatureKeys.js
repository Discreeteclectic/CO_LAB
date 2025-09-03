const { PrismaClient } = require('@prisma/client');
const digitalSignatureService = require('./digitalSignature');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

class SignatureKeysService {
  constructor() {
    this.keyStorage = new Map(); // In-memory storage for demo, should use secure storage in production
  }

  // Generate and store user's signature keys
  async generateUserKeys(userId, userInfo) {
    try {
      const existingKeys = await this.getUserKeys(userId);
      if (existingKeys) {
        logger.warn('User already has signature keys', { userId });
        return existingKeys;
      }

      const keyPair = digitalSignatureService.generateKeyPair();
      
      // In production, private keys should be encrypted and stored securely
      const keyData = {
        userId,
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey, // Should be encrypted in production
        createdAt: keyPair.createdAt,
        status: 'ACTIVE',
        userInfo: {
          name: userInfo.name,
          email: userInfo.email,
          role: userInfo.role || 'USER'
        }
      };

      // Store in memory (in production, use secure database storage)
      this.keyStorage.set(userId, keyData);

      logger.info('Generated signature keys for user', {
        userId,
        keyId: keyPair.keyId,
        userName: userInfo.name
      });

      return {
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
        createdAt: keyPair.createdAt,
        status: 'ACTIVE'
      };

    } catch (error) {
      logger.error('Failed to generate user signature keys', {
        error: error.message,
        stack: error.stack,
        userId
      });
      throw new Error('Key generation failed');
    }
  }

  // Get user's signature keys
  async getUserKeys(userId) {
    try {
      const keyData = this.keyStorage.get(userId);
      if (!keyData) {
        return null;
      }

      return {
        keyId: keyData.keyId,
        publicKey: keyData.publicKey,
        createdAt: keyData.createdAt,
        status: keyData.status,
        userInfo: keyData.userInfo
      };
    } catch (error) {
      logger.error('Failed to get user signature keys', {
        error: error.message,
        userId
      });
      return null;
    }
  }

  // Get user's private key (for signing)
  async getUserPrivateKey(userId) {
    try {
      const keyData = this.keyStorage.get(userId);
      if (!keyData || keyData.status !== 'ACTIVE') {
        throw new Error('No valid private key found for user');
      }

      return {
        privateKey: keyData.privateKey,
        keyId: keyData.keyId
      };
    } catch (error) {
      logger.error('Failed to get user private key', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  // Get public key by key ID
  async getPublicKey(keyId) {
    try {
      for (const [userId, keyData] of this.keyStorage.entries()) {
        if (keyData.keyId === keyId) {
          return {
            publicKey: keyData.publicKey,
            userId: keyData.userId,
            userInfo: keyData.userInfo,
            createdAt: keyData.createdAt
          };
        }
      }
      return null;
    } catch (error) {
      logger.error('Failed to get public key', {
        error: error.message,
        keyId
      });
      return null;
    }
  }

  // Revoke user's signature keys
  async revokeUserKeys(userId, reason = 'User request') {
    try {
      const keyData = this.keyStorage.get(userId);
      if (!keyData) {
        throw new Error('No keys found for user');
      }

      keyData.status = 'REVOKED';
      keyData.revokedAt = new Date().toISOString();
      keyData.revokeReason = reason;

      this.keyStorage.set(userId, keyData);

      logger.info('Revoked signature keys for user', {
        userId,
        keyId: keyData.keyId,
        reason
      });

      return {
        success: true,
        keyId: keyData.keyId,
        revokedAt: keyData.revokedAt,
        reason
      };

    } catch (error) {
      logger.error('Failed to revoke user signature keys', {
        error: error.message,
        userId,
        reason
      });
      throw error;
    }
  }

  // List all users with signature keys
  async listUsersWithKeys() {
    try {
      const users = [];
      for (const [userId, keyData] of this.keyStorage.entries()) {
        users.push({
          userId,
          keyId: keyData.keyId,
          status: keyData.status,
          createdAt: keyData.createdAt,
          userInfo: keyData.userInfo,
          revokedAt: keyData.revokedAt || null,
          revokeReason: keyData.revokeReason || null
        });
      }

      return users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      logger.error('Failed to list users with signature keys', {
        error: error.message
      });
      throw error;
    }
  }

  // Verify key ownership
  async verifyKeyOwnership(userId, keyId) {
    try {
      const keyData = this.keyStorage.get(userId);
      return keyData && keyData.keyId === keyId && keyData.status === 'ACTIVE';
    } catch (error) {
      logger.error('Failed to verify key ownership', {
        error: error.message,
        userId,
        keyId
      });
      return false;
    }
  }

  // Get key statistics
  async getKeyStatistics() {
    try {
      let totalKeys = 0;
      let activeKeys = 0;
      let revokedKeys = 0;
      const userRoles = {};

      for (const [userId, keyData] of this.keyStorage.entries()) {
        totalKeys++;
        
        if (keyData.status === 'ACTIVE') {
          activeKeys++;
        } else if (keyData.status === 'REVOKED') {
          revokedKeys++;
        }

        const role = keyData.userInfo?.role || 'UNKNOWN';
        userRoles[role] = (userRoles[role] || 0) + 1;
      }

      return {
        totalKeys,
        activeKeys,
        revokedKeys,
        keysByRole: userRoles,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get key statistics', {
        error: error.message
      });
      throw error;
    }
  }

  // Validate key format and integrity
  validateKeyFormat(publicKey) {
    try {
      // Basic validation for PEM format
      if (!publicKey.startsWith('-----BEGIN PUBLIC KEY-----') ||
          !publicKey.endsWith('-----END PUBLIC KEY-----\n')) {
        return { valid: false, reason: 'Invalid PEM format' };
      }

      // Additional validation could be added here
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  // Cleanup expired or inactive keys (maintenance function)
  async cleanupKeys(olderThanDays = 365) {
    try {
      const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
      let cleanedCount = 0;

      for (const [userId, keyData] of this.keyStorage.entries()) {
        if (keyData.status === 'REVOKED' && 
            keyData.revokedAt && 
            new Date(keyData.revokedAt) < cutoffDate) {
          this.keyStorage.delete(userId);
          cleanedCount++;
        }
      }

      logger.info('Cleaned up signature keys', {
        cleanedCount,
        olderThanDays,
        remainingKeys: this.keyStorage.size
      });

      return {
        cleanedCount,
        remainingKeys: this.keyStorage.size,
        cutoffDate: cutoffDate.toISOString()
      };

    } catch (error) {
      logger.error('Failed to cleanup signature keys', {
        error: error.message
      });
      throw error;
    }
  }
}

// Singleton instance
const signatureKeysService = new SignatureKeysService();

module.exports = signatureKeysService;