/**
 * Shared configuration type definitions
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
};

export type RetryConfig = {
  maxAttempts: number;
  backoffType: 'exponential' | 'fixed';
  backoffDelay: number;
  maxBackoffDelay?: number;
  backoff?: BackoffConfig;
};

export type DLQConfig = {
  enabled: boolean;
  queueName?: string;
  maxRetries?: number;
  notificationHandler?: (job: unknown) => Promise<void>;
};

export type JobOptions = {
  attempts?: number;
  idempotencyKey?: string;
  delay?: number;
  priority?: number;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean;
  backoff?: BackoffConfig;
  timeout?: number;
  metadata?: Record<string, unknown>;
  repeat?: RepeatConfig;
  jitter?: number;
};

export type BackoffConfig = {
  type: 'exponential' | 'fixed';
  delay: number;
  maxDelay?: number;
};

export type RepeatConfig = {
  pattern?: string;
  every?: number;
  limit?: number;
  immediately?: boolean;
};

export type TelemetryAdapter = {
  startSpan: (
    name: string,
    attributes?: Record<string, string | number | boolean | undefined>
  ) => SpanHandle;
};

export type SpanHandle = {
  setAttribute: (key: string, value: string | number | boolean) => void;
  recordException: (error: Error) => void;
  end: () => void;
};

export type MetricsAdapter = {
  increment: (name: string, value?: number, tags?: Record<string, string>) => void;
  observe: (name: string, value: number, tags?: Record<string, string>) => void;
};
