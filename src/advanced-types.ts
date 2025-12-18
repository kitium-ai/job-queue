/**
 * Extended type definitions for advanced job queue features
 * Includes delivery guarantees, FIFO, encryption, and workflows
 */

import type { JobOptions } from './types';

/**
 * Extended job options with delivery guarantees
 */
export type ExtendedJobOptions = {
  /**
   * Delivery guarantee level
   */
  deliveryGuarantee?: 'at-least-once' | 'exactly-once';

  /**
   * If exactly-once, unique idempotency key
   */
  idempotencyKey?: string;

  /**
   * Idempotency TTL in milliseconds (default: 24 hours)
   */
  idempotencyTTL?: number;

  /**
   * FIFO message group ID for ordered processing
   */
  messageGroupId?: string;

  /**
   * Optional deduplication ID for message groups
   */
  deduplicationId?: string;

  /**
   * Encrypt sensitive job data
   */
  encrypted?: boolean;

  /**
   * Circuit breaker ID to protect this job
   */
  circuitBreakerId?: string;

  /**
   * Webhook to call on job completion
   */
  webhookUrl?: string;

  /**
   * Workflow/chain ID this job belongs to
   */
  workflowId?: string;

  /**
   * Parent job IDs this job depends on
   */
  dependsOn?: string[];

  /**
   * Target region for global queue
   */
  region?: string;

  /**
   * Tenant ID for multi-tenancy
   */
  tenantId?: string;
} & JobOptions

/**
 * Batch job options for efficient processing
 */
export type BatchJobOptions = {
  /**
   * Number of jobs to batch together
   */
  batchSize: number;

  /**
   * Maximum wait time before sending partial batch (ms)
   */
  maxWaitMs?: number;

  /**
   * Timeout for batch processing (ms)
   */
  timeoutMs?: number;
}

/**
 * Rate limiting configuration
 */
export type RateLimitConfig = {
  /**
   * Maximum jobs per window
   */
  maxJobs: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Rate limit by tenant or principal
   */
  limitKey?: 'tenant' | 'principal' | 'global';
}

/**
 * Cost optimization configuration
 */
export type CostOptimizationConfig = {
  /**
   * Use cheaper compute resources when available
   */
  preferCheaperResources?: boolean;

  /**
   * Maximum cost threshold per hour
   */
  costThresholdPerHour?: number;

  /**
   * Support spot/preemptible instances
   */
  allowSpotInstances?: boolean;

  /**
   * Batch similar jobs together
   */
  intelligentBatching?: boolean;

  /**
   * Enable cost optimization recommendations
   */
  provideRecommendations?: boolean;
}

/**
 * Monitoring and alerting configuration
 */
export type MonitoringConfig = {
  /**
   * Enable anomaly detection
   */
  anomalyDetection?: boolean;

  /**
   * Alert thresholds
   */
  alertThresholds?: {
    /**
     * Alert if failure rate exceeds this percentage
     */
    failureRatePercent?: number;

    /**
     * Alert if processing latency exceeds this (ms)
     */
    latencyThresholdMs?: number;

    /**
     * Alert if queue depth exceeds this
     */
    queueDepthThreshold?: number;
  };

  /**
   * Enable distributed tracing
   */
  distributedTracing?: boolean;

  /**
   * Trace sampling rate (0-1)
   */
  traceSamplingRate?: number;

  /**
   * Custom metrics to collect
   */
  customMetrics?: string[];
}

/**
 * Compliance configuration
 */
export type ComplianceConfig = {
  /**
   * Data residency requirements
   */
  dataResidency?: {
    /**
     * Allowed regions for data storage
     */
    allowedRegions: string[];

    /**
     * Prohibited regions
     */
    blockedRegions?: string[];
  };

  /**
   * Data retention policy
   */
  dataRetention?: {
    /**
     * How long to keep completed job data (ms)
     */
    completedJobsMs?: number;

    /**
     * How long to keep failed job data (ms)
     */
    failedJobsMs?: number;

    /**
     * How long to keep audit logs (ms)
     */
    auditLogsMs?: number;
  };

  /**
   * Encryption at rest
   */
  encryptionAtRest?: {
    enabled: boolean;
    algorithm?: 'aes-256-gcm' | 'aes-256-cbc';
  };

  /**
   * Audit logging
   */
  auditLogging?: {
    enabled: boolean;
    captureJobData?: boolean;
    captureResults?: boolean;
  };

  /**
   * PII handling
   */
  piiHandling?: {
    /**
     * Mask PII in logs
     */
    maskInLogs?: boolean;

    /**
     * Fields to treat as PII
     */
    piiFields?: string[];
  };
}

/**
 * Advanced queue configuration combining all features
 */
export type AdvancedQueueConfig = {
  /**
   * Exactly-once delivery settings
   */
  exactlyOnce?: {
    enabled: boolean;
    ttlMs?: number;
  };

  /**
   * FIFO queue settings
   */
  fifo?: {
    enabled: boolean;
    highThroughput?: boolean;
  };

  /**
   * Encryption settings
   */
  encryption?: {
    enabled: boolean;
    algorithm?: 'aes-256-gcm' | 'aes-256-cbc';
  };

  /**
   * Job chaining and workflows
   */
  workflows?: {
    enabled: boolean;
    defaultTimeoutMs?: number;
  };

  /**
   * Circuit breaker settings
   */
  circuitBreaker?: {
    enabled: boolean;
    defaultFailureThreshold?: number;
    defaultTimeoutMs?: number;
  };

  /**
   * Webhook delivery
   */
  webhooks?: {
    enabled: boolean;
    defaultDeliveryStrategy?: 'best-effort' | 'reliable' | 'guaranteed';
  };

  /**
   * Global queue settings
   */
  globalQueue?: {
    enabled: boolean;
    regions?: Array<{
      name: string;
      priority?: number;
    }>;
  };

  /**
   * Multi-tenancy
   */
  multiTenancy?: {
    enabled: boolean;
    enableResourceQuotas?: boolean;
  };

  /**
   * Batch processing
   */
  batching?: BatchJobOptions;

  /**
   * Rate limiting
   */
  rateLimiting?: RateLimitConfig;

  /**
   * Cost optimization
   */
  costOptimization?: CostOptimizationConfig;

  /**
   * Monitoring
   */
  monitoring?: MonitoringConfig;

  /**
   * Compliance
   */
  compliance?: ComplianceConfig;
}
