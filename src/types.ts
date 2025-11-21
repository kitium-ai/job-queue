/**
 * Type definitions for the Kitium Job Queue processing package
 */

/**
 * Job status enumeration
 */
export enum JobStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  WAITING = 'waiting',
  PAUSED = 'paused',
  DLQ = 'dlq'
}

/**
 * Job result enumeration
 */
export enum JobResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
  RETRY = 'retry',
  SKIPPED = 'skipped'
}

/**
 * Job configuration options
 */
export interface JobOptions {
  /** Maximum number of attempts */
  attempts?: number;
  /** Delay in milliseconds before job execution */
  delay?: number;
  /** Priority of the job (higher values = higher priority) */
  priority?: number;
  /** Remove job after completion */
  removeOnComplete?: boolean | number;
  /** Remove job after failure */
  removeOnFail?: boolean;
  /** Backoff strategy configuration */
  backoff?: BackoffConfig;
  /** Job timeout in milliseconds */
  timeout?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Whether to repeat the job (cron/interval) */
  repeat?: RepeatConfig;
}

/**
 * Backoff strategy configuration
 */
export interface BackoffConfig {
  type: 'exponential' | 'fixed';
  delay: number;
  maxDelay?: number;
}

/**
 * Job repeat configuration
 */
export interface RepeatConfig {
  pattern?: string; // cron pattern
  every?: number; // repeat every N milliseconds
  limit?: number; // maximum number of repetitions
  immediately?: boolean; // start immediately
}

/**
 * Job data structure
 */
export interface JobData {
  [key: string]: unknown;
}

/**
 * Job execution result
 */
export interface JobExecutionResult {
  status: JobResult;
  data?: unknown;
  error?: string;
  timestamp: number;
  attempts?: number;
}

/**
 * Job status information
 */
export interface JobStatusInfo {
  id: string;
  name: string;
  status: JobStatus;
  progress: number;
  data: JobData;
  result?: JobExecutionResult;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  processedAt?: number;
  completedAt?: number;
  failedAt?: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  backoffType: 'exponential' | 'fixed';
  backoffDelay: number;
  maxBackoffDelay?: number;
}

/**
 * Dead Letter Queue configuration
 */
export interface DLQConfig {
  enabled: boolean;
  queueName?: string;
  maxRetries?: number;
  notificationHandler?: (job: any) => Promise<void>;
}

/**
 * Job queue configuration
 */
export interface QueueConfig {
  name: string;
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    retryStrategy?: (times: number) => number;
  };
  defaultJobOptions?: JobOptions;
  retry?: RetryConfig;
  dlq?: DLQConfig;
  settings?: {
    maxStalledCount?: number;
    maxStalledInterval?: number;
    lockDuration?: number;
    lockRenewTime?: number;
  };
}

/**
 * Job processor callback type
 */
export type JobProcessor<T extends JobData = JobData, R = unknown> = (
  job: {
    id: string;
    name: string;
    data: T;
    attempts: number;
    progress: (percentage: number) => void;
  }
) => Promise<R>;

/**
 * Job event handler type
 */
export type JobEventHandler = (job: any, error?: Error) => Promise<void> | void;

/**
 * Queue event names
 */
export enum QueueEvent {
  JOB_ADDED = 'job-added',
  JOB_STARTED = 'job-started',
  JOB_COMPLETED = 'job-completed',
  JOB_FAILED = 'job-failed',
  JOB_RETRYING = 'job-retrying',
  JOB_STALLED = 'job-stalled',
  JOB_PROGRESS = 'job-progress',
  JOB_DLQ = 'job-dlq',
  QUEUE_ERROR = 'queue-error'
}
