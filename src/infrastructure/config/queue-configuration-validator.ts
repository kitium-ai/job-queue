/**
 * Queue configuration validator
 * Validates queue configuration and ensures all required fields are present
 */

import { ValidationError } from '@kitiumai/error';
import { getLogger } from '@kitiumai/logger';

import type { QueueConfig } from '../../shared/types/config.types';

const SOURCE = '@kitiumai/job-queue';

export class QueueConfigurationValidator {
  private readonly logger = getLogger();

  /**
   * Validate queue configuration
   * @param config Queue configuration to validate
   * @throws ValidationError if configuration is invalid
   */
  validate(config: QueueConfig): void {
    if (!config) {
      throw new ValidationError({
        code: 'queue/invalid_config',
        message: 'Queue configuration is required',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
      throw new ValidationError({
        code: 'queue/invalid_queue_name',
        message: 'Queue name is required and must be a non-empty string',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    // Validate Redis configuration if provided
    if (config.redis) {
      this.validateRedisConfig(config.redis);
    }

    // Validate retry configuration if provided
    if (config.retry) {
      this.validateRetryConfig(config.retry);
    }

    // Validate DLQ configuration if provided
    if (config.dlq) {
      this.validateDLQConfig(config.dlq);
    }

    // Validate worker configuration if provided
    if (config.worker) {
      this.validateWorkerConfig(config.worker);
    }

    this.logger.debug('Queue configuration validated', { queueName: config.name });
  }

  /**
   * Validate Redis configuration
   * @param redis Redis configuration to validate
   * @throws ValidationError if invalid
   */
  private validateRedisConfig(redis: QueueConfig['redis']): void {
    if (!redis) {return;}

    if (redis.port !== undefined && (redis.port < 0 || redis.port > 65535)) {
      throw new ValidationError({
        code: 'queue/invalid_redis_port',
        message: 'Redis port must be between 0 and 65535',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    if (redis.db !== undefined && (redis.db < 0 || redis.db > 15)) {
      throw new ValidationError({
        code: 'queue/invalid_redis_db',
        message: 'Redis db must be between 0 and 15',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    if (redis.connectTimeout !== undefined && redis.connectTimeout <= 0) {
      throw new ValidationError({
        code: 'queue/invalid_redis_timeout',
        message: 'Redis connectTimeout must be greater than 0',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }
  }

  /**
   * Validate retry configuration
   * @param retry Retry configuration to validate
   * @throws ValidationError if invalid
   */
  private validateRetryConfig(retry: QueueConfig['retry']): void {
    if (!retry) {return;}

    if (retry.maxAttempts !== undefined && retry.maxAttempts <= 0) {
      throw new ValidationError({
        code: 'queue/invalid_max_attempts',
        message: 'maxAttempts must be greater than 0',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    if (retry.backoffDelay !== undefined && retry.backoffDelay < 0) {
      throw new ValidationError({
        code: 'queue/invalid_backoff_delay',
        message: 'backoffDelay must be non-negative',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    if (retry.maxBackoffDelay !== undefined && retry.maxBackoffDelay < 0) {
      throw new ValidationError({
        code: 'queue/invalid_max_backoff_delay',
        message: 'maxBackoffDelay must be non-negative',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    if (
      retry.backoffDelay !== undefined &&
      retry.maxBackoffDelay !== undefined &&
      retry.backoffDelay > retry.maxBackoffDelay
    ) {
      throw new ValidationError({
        code: 'queue/invalid_backoff_config',
        message: 'backoffDelay must not exceed maxBackoffDelay',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    this.validateRetryBackoffType(retry.backoffType);
  }

  private validateRetryBackoffType(backoffType: string): void {
    if (!['exponential', 'fixed'].includes(backoffType)) {
      throw new ValidationError({
        code: 'queue/invalid_backoff_type',
        message: 'backoffType must be either "exponential" or "fixed"',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }
  }

  /**
   * Validate DLQ configuration
   * @param dlq DLQ configuration to validate
   * @throws ValidationError if invalid
   */
  private validateDLQConfig(dlq: QueueConfig['dlq']): void {
    if (!dlq) {return;}

    if (dlq.enabled && dlq.notificationHandler && typeof dlq.notificationHandler !== 'function') {
      throw new ValidationError({
        code: 'queue/invalid_dlq_handler',
        message: 'DLQ notificationHandler must be a function',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    if (dlq.maxRetries !== undefined && dlq.maxRetries < 0) {
      throw new ValidationError({
        code: 'queue/invalid_dlq_max_retries',
        message: 'DLQ maxRetries must be non-negative',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }
  }

  /**
   * Validate worker configuration
   * @param worker Worker configuration to validate
   * @throws ValidationError if invalid
   */
  private validateWorkerConfig(worker: QueueConfig['worker']): void {
    if (!worker) {return;}

    if (worker.concurrency !== undefined && worker.concurrency <= 0) {
      throw new ValidationError({
        code: 'queue/invalid_concurrency',
        message: 'Worker concurrency must be greater than 0',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    if (worker.limiter) {
      if (worker.limiter.max <= 0) {
        throw new ValidationError({
          code: 'queue/invalid_limiter_max',
          message: 'Limiter max must be greater than 0',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      if (worker.limiter.duration <= 0) {
        throw new ValidationError({
          code: 'queue/invalid_limiter_duration',
          message: 'Limiter duration must be greater than 0',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }
    }
  }
}
