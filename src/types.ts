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
  DLQ = 'dlq',
}

/**
 * Job result enumeration
 */
export enum JobResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
  RETRY = 'retry',
  SKIPPED = 'skipped',
}

/**
 * Job configuration options
 */
export type JobOptions = {
  /** Maximum number of attempts */
  attempts?: number;
  /** Unique key to deduplicate jobs (mapped to BullMQ jobId) */
  idempotencyKey?: string;
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
  /** Optional jitter (milliseconds) to avoid thundering herds */
  jitter?: number;
}

/**
 * Backoff strategy configuration
 */
export type BackoffConfig = {
  type: 'exponential' | 'fixed';
  delay: number;
  maxDelay?: number;
}

/**
 * Job repeat configuration
 */
export type RepeatConfig = {
  pattern?: string; // cron pattern
  every?: number; // repeat every N milliseconds
  limit?: number; // maximum number of repetitions
  immediately?: boolean; // start immediately
}

/**
 * Job data structure
 */
export type JobData = {
  [key: string]: unknown;
}

/**
 * Job execution result
 */
export type JobExecutionResult = {
  status: JobResult;
  data?: unknown;
  error?: string;
  timestamp: number;
  attempts?: number;
}

/**
 * Job status information
 */
export type JobStatusInfo = {
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
export type RetryConfig = {
  maxAttempts: number;
  backoffType: 'exponential' | 'fixed';
  backoffDelay: number;
  maxBackoffDelay?: number;
}

/**
 * Dead Letter Queue configuration
 */
export type DLQConfig = {
  enabled: boolean;
  queueName?: string;
  maxRetries?: number;
  notificationHandler?: (job: unknown) => Promise<void>;
}

/**
 * Job queue configuration
 */
export type QueueConfig = {
  name: string;
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    username?: string;
    db?: number;
    retryStrategy?: (times: number) => number;
    tls?: Record<string, unknown>;
    enableReadyCheck?: boolean;
    maxRetriesPerRequest?: number | null;
    connectTimeout?: number;
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
  worker?: {
    concurrency?: number;
    limiter?: {
      max: number;
      duration: number;
    };
  };
  telemetry?: TelemetryAdapter;
  metrics?: MetricsAdapter;
}

/**
 * Job processor callback type
 */
export type JobProcessor<T extends JobData = JobData, R = unknown> = (job: {
  id: string;
  name: string;
  data: T;
  attempts: number;
  progress: (percentage: number) => void;
}) => Promise<R>;

/**
 * Job event handler type
 */
export type DLQJobInfo = {
  id: string | null | undefined;
  name: string;
  data: JobData;
  attempts: number;
  createdAt: number;
}

export type JobEventHandler = (job: unknown, error?: Error) => Promise<void> | void;

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
  QUEUE_ERROR = 'queue-error',
}

/**
 * Minimal telemetry interface to integrate with tracing providers
 */
export type TelemetryAdapter = {
  startSpan: (
    name: string,
    attributes?: Record<string, string | number | boolean | undefined>
  ) => SpanHandle;
}

export type SpanHandle = {
  setAttribute: (key: string, value: string | number | boolean) => void;
  recordException: (error: Error) => void;
  end: () => void;
}

/**
 * Metrics adapter interface for reporting queue metrics
 */
export type MetricsAdapter = {
  increment: (name: string, value?: number, tags?: Record<string, string>) => void;
  observe: (name: string, value: number, tags?: Record<string, string>) => void;
}
