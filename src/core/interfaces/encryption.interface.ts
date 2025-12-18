/**
 * Encryption interface for job data security
 */

/**
 * Encryption algorithm types
 */
export enum EncryptionAlgorithm {
  AES_256_GCM = 'aes-256-gcm',
  AES_256_CBC = 'aes-256-cbc',
}

/**
 * Encryption key configuration
 */
export type EncryptionKeyConfig = {
  /**
   * Key identifier for rotation
   */
  keyId: string;

  /**
   * Encryption key (base64 encoded)
   */
  key: string;

  /**
   * Algorithm used
   */
  algorithm: EncryptionAlgorithm;

  /**
   * When key was created
   */
  createdAt: number;

  /**
   * Optional expiration time
   */
  expiresAt?: number;

  /**
   * If true, use for encryption; if false, only for decryption (rotation)
   */
  isActive: boolean;
}

/**
 * Encrypted data container
 */
export type EncryptedData = {
  /**
   * Encrypted payload (base64 encoded)
   */
  ciphertext: string;

  /**
   * IV or nonce (base64 encoded)
   */
  iv: string;

  /**
   * Authentication tag for GCM (base64 encoded)
   */
  tag?: string;

  /**
   * Key ID used for encryption
   */
  keyId: string;

  /**
   * Algorithm used
   */
  algorithm: EncryptionAlgorithm;
}

/**
 * Interface for encrypting/decrypting sensitive job data
 */
export type IEncryptionManager = {
  /**
   * Encrypt sensitive data
   */
  encrypt(data: string | Record<string, unknown>): Promise<EncryptedData>;

  /**
   * Decrypt encrypted data
   */
  decrypt(encrypted: EncryptedData): Promise<string | Record<string, unknown>>;

  /**
   * Add new encryption key
   */
  addKey(config: EncryptionKeyConfig): Promise<void>;

  /**
   * Rotate active encryption key
   */
  rotateKey(newKey: EncryptionKeyConfig): Promise<void>;

  /**
   * Get all available keys
   */
  getKeys(): Promise<EncryptionKeyConfig[]>;

  /**
   * Mark key as inactive (for rotation)
   */
  deactivateKey(keyId: string): Promise<void>;

  /**
   * Remove key (use with caution)
   */
  removeKey(keyId: string): Promise<void>;
}
