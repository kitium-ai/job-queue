/**
 * Queue configuration loader
 * Loads and validates queue configuration from various sources
 */

import { getLogger } from '@kitiumai/logger';

import type { QueueConfig } from '../../shared/types/config.types';
import { QueueConfigurationValidator } from './queue-configuration-validator';

export class QueueConfigurationLoader {
  private readonly logger = getLogger();
  private readonly validator: QueueConfigurationValidator;

  constructor() {
    this.validator = new QueueConfigurationValidator();
  }

  /**
   * Load queue configuration from multiple sources
   * Priority: Programmatic > File > Environment > Default
   *
   * @param config Programmatic configuration (highest priority)
   * @returns Merged queue configuration
   */
  loadConfiguration(config?: Partial<QueueConfig>): QueueConfig {
    // Start with defaults
    const merged = this.getDefaultConfig();

    // Merge programmatic config (highest priority)
    if (config) {
      this.mergeConfigs(merged, config);
    }

    // Validate the final configuration
    this.validator.validate(merged);

    this.logger.debug('Configuration loaded', {
      queueName: merged.name,
      hasRedisConfig: !!merged.redis,
      hasRetryConfig: !!merged.retry,
      hasDLQConfig: !!merged.dlq,
    });

    return merged;
  }

  /**
   * Load configuration from environment variables
   * Supports: QUEUE_NAME, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, etc.
   *
   * @returns Configuration from environment variables
   */
  loadFromEnvironment(): Partial<QueueConfig> {
    const environment = process.env as Record<string, string | undefined>;
    const config: Partial<QueueConfig> = {};

    this.applyQueueNameFromEnv(config, environment);
    this.applyRedisConfigFromEnv(config, environment);
    this.applyRetryConfigFromEnv(config, environment);
    this.applyDlqConfigFromEnv(config, environment);
    this.applyWorkerConfigFromEnv(config, environment);

    if (Object.keys(config).length > 0) {
      this.logger.debug('Configuration loaded from environment variables', {
        keys: Object.keys(config),
      });
    }

    return config;
  }

  private applyQueueNameFromEnv(
    config: Partial<QueueConfig>,
    environment: Record<string, string | undefined>
  ): void {
    if (environment['QUEUE_NAME']) {
      config.name = environment['QUEUE_NAME'];
    }
  }

  private applyRedisConfigFromEnv(
    config: Partial<QueueConfig>,
    environment: Record<string, string | undefined>
  ): void {
    const redisEnvironmentKeys = [
      'REDIS_HOST',
      'REDIS_PORT',
      'REDIS_PASSWORD',
      'REDIS_DB',
      'REDIS_USERNAME',
      'REDIS_CONNECT_TIMEOUT',
    ] as const;
    const hasRedisEnvironment = redisEnvironmentKeys.some((key) => environment[key] !== undefined);
    if (!hasRedisEnvironment) {
      return;
    }

    config.redis = {};
    this.setIfDefined(config.redis, 'host', environment['REDIS_HOST']);
    this.setIfDefined(
      config.redis,
      'port',
      environment['REDIS_PORT'] ? parseInt(environment['REDIS_PORT'], 10) : undefined
    );
    this.setIfDefined(config.redis, 'password', environment['REDIS_PASSWORD']);
    this.setIfDefined(
      config.redis,
      'db',
      environment['REDIS_DB'] ? parseInt(environment['REDIS_DB'], 10) : undefined
    );
    this.setIfDefined(config.redis, 'username', environment['REDIS_USERNAME']);
    this.setIfDefined(
      config.redis,
      'connectTimeout',
      environment['REDIS_CONNECT_TIMEOUT']
        ? parseInt(environment['REDIS_CONNECT_TIMEOUT'], 10)
        : undefined
    );
  }

  private setIfDefined<T extends Record<string, unknown>, K extends keyof T>(
    target: T,
    key: K,
    value: T[K] | undefined
  ): void {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  private applyRetryConfigFromEnv(
    config: Partial<QueueConfig>,
    environment: Record<string, string | undefined>
  ): void {
    const hasRetryEnvironment =
      environment['RETRY_MAX_ATTEMPTS'] !== undefined ||
      environment['RETRY_BACKOFF_TYPE'] !== undefined ||
      environment['RETRY_BACKOFF_DELAY'] !== undefined ||
      environment['RETRY_MAX_BACKOFF_DELAY'] !== undefined;
    if (!hasRetryEnvironment) {
      return;
    }

    config.retry = {
      maxAttempts: parseInt(environment['RETRY_MAX_ATTEMPTS'] ?? '3', 10),
      backoffType:
        (environment['RETRY_BACKOFF_TYPE'] as 'exponential' | 'fixed' | undefined) ?? 'exponential',
      backoffDelay: parseInt(environment['RETRY_BACKOFF_DELAY'] ?? '1000', 10),
      maxBackoffDelay: environment['RETRY_MAX_BACKOFF_DELAY']
        ? parseInt(environment['RETRY_MAX_BACKOFF_DELAY'], 10)
        : undefined,
    };
  }

  private applyDlqConfigFromEnv(
    config: Partial<QueueConfig>,
    environment: Record<string, string | undefined>
  ): void {
    if (environment['DLQ_ENABLED'] === undefined) {
      return;
    }

    config.dlq = {
      enabled: environment['DLQ_ENABLED'] === 'true',
      queueName: environment['DLQ_QUEUE_NAME'],
      maxRetries: environment['DLQ_MAX_RETRIES']
        ? parseInt(environment['DLQ_MAX_RETRIES'], 10)
        : undefined,
    };
  }

  private applyWorkerConfigFromEnv(
    config: Partial<QueueConfig>,
    environment: Record<string, string | undefined>
  ): void {
    if (environment['WORKER_CONCURRENCY'] === undefined && environment['WORKER_LIMITER_MAX'] === undefined) {
      return;
    }

    config.worker = {};
    if (environment['WORKER_CONCURRENCY']) {
      config.worker.concurrency = parseInt(environment['WORKER_CONCURRENCY'], 10);
    }
    if (environment['WORKER_LIMITER_MAX']) {
      config.worker.limiter = {
        max: parseInt(environment['WORKER_LIMITER_MAX'], 10),
        duration: parseInt(environment['WORKER_LIMITER_DURATION'] ?? '1000', 10),
      };
    }
  }

  /**
   * Get default queue configuration
   * @returns Default configuration
   */
  private getDefaultConfig(): QueueConfig {
    return {
      name: 'default-queue',
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        enableReadyCheck: true,
        maxRetriesPerRequest: null,
        connectTimeout: 10000,
      },
      retry: {
        maxAttempts: 3,
        backoffType: 'exponential',
        backoffDelay: 1000,
        maxBackoffDelay: 60000,
      },
      dlq: {
        enabled: false,
      },
      worker: {
        concurrency: 5,
      },
    };
  }

  /**
   * Merge two configuration objects (right side overrides left side)
   * @param target Target configuration
   * @param source Source configuration
   */
  private mergeConfigs(target: QueueConfig, source: Partial<QueueConfig>): void {
    // Simple merge - only copy provided properties
    if (source.name !== undefined) {target.name = source.name;}
    if (source.defaultJobOptions !== undefined) {target.defaultJobOptions = source.defaultJobOptions;}
    if (source.settings !== undefined) {target.settings = source.settings;}
    if (source.telemetry !== undefined) {target.telemetry = source.telemetry;}
    if (source.metrics !== undefined) {target.metrics = source.metrics;}

    // Merge nested objects
    if (source.redis) {
      target.redis = { ...target.redis, ...source.redis };
    }

    if (source.retry) {
      target.retry = { ...target.retry, ...source.retry };
    }

    if (source.dlq) {
      target.dlq = { ...target.dlq, ...source.dlq };
    }

    if (source.worker) {
      target.worker = { ...target.worker, ...source.worker };
    }
  }
}
