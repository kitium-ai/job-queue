/**
 * Redis-based encryption manager for sensitive job data
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ValidationError } from '@kitiumai/error';
import { getLogger } from '@kitiumai/logger';
import type ioredis from 'ioredis';

import {
  type EncryptedData,
  type EncryptionAlgorithm,
  EncryptionAlgorithm as EncryptionAlgorithmEnum,
  type EncryptionKeyConfig,
  type IEncryptionManager,
} from '../../core/interfaces/encryption.interface';

const logger = getLogger();
const SOURCE = '@kitiumai/job-queue/encryption-manager';

/**
 * Implementation of encryption manager for sensitive job data
 */
export class EncryptionManager implements IEncryptionManager {
  private readonly redis: InstanceType<typeof ioredis>;
  private readonly keyPrefix: string;
  private activeKeyId: string | null = null;
  private readonly keysCache: Map<string, EncryptionKeyConfig> = new Map();

  constructor(redis: InstanceType<typeof ioredis>, keyPrefix = 'encryption-keys') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Initialize encryption manager with keys from Redis
   */
  async initialize(): Promise<void> {
    try {
      const keys = await this.getKeys();
      const active = keys.find((k) => k.isActive);
      if (active) {
        this.activeKeyId = active.keyId;
      }
      logger.debug('Encryption manager initialized', { source: SOURCE });
    } catch (error) {
      logger.error(
        'Failed to initialize encryption manager',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data: string | Record<string, unknown>): Promise<EncryptedData> {
    try {
      if (!this.activeKeyId) {
        throw new ValidationError({
          code: 'encryption/no_active_key',
          message: 'No active encryption key configured',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      const keyConfig = this.keysCache.get(this.activeKeyId);
      if (!keyConfig) {
        throw new ValidationError({
          code: 'encryption/key_not_found',
          message: `Encryption key ${this.activeKeyId} not found`,
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
      const key = Buffer.from(keyConfig.key, 'base64');

      if (keyConfig.algorithm === EncryptionAlgorithmEnum.AES_256_GCM) {
        return Promise.resolve(this.encryptGCM(plaintext, key, keyConfig));
      } else if (keyConfig.algorithm === EncryptionAlgorithmEnum.AES_256_CBC) {
        return Promise.resolve(this.encryptCBC(plaintext, key, keyConfig));
      }

      throw new ValidationError({
        code: 'encryption/unsupported_algorithm',
        message: `Unsupported algorithm: ${keyConfig.algorithm}`,
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    } catch (error) {
      logger.error(
        'Encryption failed',
        undefined,
        error instanceof Error ? error : undefined
      );
      return Promise.reject(error);
    }
  }

  /**
   * Decrypt encrypted data
   */
  decrypt(encrypted: EncryptedData): Promise<string | Record<string, unknown>> {
    try {
      const plaintext = this.decryptToPlaintext(encrypted);
      return Promise.resolve(this.parsePlaintext(plaintext));
    } catch (error) {
      logger.error(
        'Decryption failed',
        undefined,
        error instanceof Error ? error : undefined
      );
      return Promise.reject(error);
    }
  }

  private decryptToPlaintext(encrypted: EncryptedData): string {
    const keyConfig = this.keysCache.get(encrypted.keyId);
    if (!keyConfig) {
      throw new ValidationError({
        code: 'encryption/key_not_found',
        message: `Decryption key ${encrypted.keyId} not found`,
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    const key = Buffer.from(keyConfig.key, 'base64');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
    const iv = Buffer.from(encrypted.iv, 'base64');

    if (encrypted.algorithm === EncryptionAlgorithmEnum.AES_256_GCM) {
      const tag = Buffer.from(encrypted.tag ?? '', 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    }

    if (encrypted.algorithm === EncryptionAlgorithmEnum.AES_256_CBC) {
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    }

    throw new ValidationError({
      code: 'encryption/unsupported_algorithm',
      message: `Unsupported algorithm: ${encrypted.algorithm}`,
      severity: 'error',
      kind: 'validation',
      retryable: false,
      source: SOURCE,
    });
  }

  private parsePlaintext(plaintext: string): string | Record<string, unknown> {
    try {
      return JSON.parse(plaintext) as Record<string, unknown>;
    } catch {
      return plaintext;
    }
  }

  /**
   * Add new encryption key
   */
  async addKey(config: EncryptionKeyConfig): Promise<void> {
    try {
      const key = this.buildKeyName(config.keyId);
      await this.redis.set(key, JSON.stringify(config));
      this.keysCache.set(config.keyId, config);
      logger.debug(`Added encryption key: ${config.keyId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to add encryption key: ${config.keyId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Rotate active encryption key
   */
  async rotateKey(newKey: EncryptionKeyConfig): Promise<void> {
    try {
      // Deactivate old key
      if (this.activeKeyId) {
        const oldKey = this.keysCache.get(this.activeKeyId);
        if (oldKey) {
          oldKey.isActive = false;
          await this.addKey(oldKey);
        }
      }

      // Activate new key
      newKey.isActive = true;
      await this.addKey(newKey);
      this.activeKeyId = newKey.keyId;

      logger.debug(`Rotated encryption key to: ${newKey.keyId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        'Failed to rotate encryption key',
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get all available keys
   */
  async getKeys(): Promise<EncryptionKeyConfig[]> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redis.keys(pattern);

      const configs: EncryptionKeyConfig[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          configs.push(JSON.parse(data) as EncryptionKeyConfig);
        }
      }

      return configs;
    } catch (error) {
      logger.error(
        'Failed to get encryption keys',
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Mark key as inactive
   */
  async deactivateKey(keyId: string): Promise<void> {
    try {
      const keyConfig = this.keysCache.get(keyId);
      if (keyConfig) {
        keyConfig.isActive = false;
        await this.addKey(keyConfig);
        logger.debug(`Deactivated encryption key: ${keyId}`, { source: SOURCE });
      }
    } catch (error) {
      logger.error(
        `Failed to deactivate encryption key: ${keyId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Remove key (use with caution)
   */
  async removeKey(keyId: string): Promise<void> {
    try {
      const key = this.buildKeyName(keyId);
      await this.redis.del(key);
      this.keysCache.delete(keyId);
      logger.debug(`Removed encryption key: ${keyId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to remove encryption key: ${keyId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  private encryptGCM(plaintext: string, key: Buffer, keyConfig: EncryptionKeyConfig): EncryptedData {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      keyId: keyConfig.keyId,
      algorithm: keyConfig.algorithm as EncryptionAlgorithm,
    };
  }

  private encryptCBC(plaintext: string, key: Buffer, keyConfig: EncryptionKeyConfig): EncryptedData {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      keyId: keyConfig.keyId,
      algorithm: keyConfig.algorithm as EncryptionAlgorithm,
    };
  }

  private buildKeyName(keyId: string): string {
    return `${this.keyPrefix}:${keyId}`;
  }
}
