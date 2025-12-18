/**
 * @kitiumai/job-queue
 * Enterprise-ready BullMQ job processing package
 *
 * Provides comprehensive job queue management with:
 * - Job scheduling and cron support
 * - Configurable retry logic with exponential backoff
 * - Complete job status tracking
 * - Dead Letter Queue handling
 * - Event-driven architecture
 * - Full dependency injection support
 * - Multiple queue adapter support
 */

// Legacy API (backward compatibility)
export { JobQueue } from './JobQueue';

// Types
export type {
  BackoffConfig,
  DLQConfig,
  JobData,
  JobEventHandler,
  JobExecutionResult,
  JobOptions,
  JobProcessor,
  JobStatusInfo,
  MetricsAdapter,
  QueueConfig,
  RepeatConfig,
  RetryConfig,
  TelemetryAdapter,
} from './types';
export {
  JobResult,
  JobStatus,
  QueueEvent,
} from './types';

// Core Interfaces (dependency inversion)
export type { IJob } from './core/interfaces/job.interface';
export type { IJobStateMapper } from './core/interfaces/job-state-mapper.interface';
export type { IQueueAdapter } from './core/interfaces/queue-adapter.interface';
export type { IQueueClient } from './core/interfaces/queue-client.interface';
export type { IQueueWorker } from './core/interfaces/queue-worker.interface';
export type { IJobRetryStrategy } from './core/interfaces/retry-strategy.interface';

// Core Factories
export { JobOptionsBuilder } from './core/factories/job-options.builder';
export { JobQueueErrorFactory } from './core/factories/job-queue-error.factory';
export { JobStatusFactory } from './core/factories/job-status.factory';
export { LoggerFactory } from './core/factories/logger.factory';

// Retry Strategies
export { JobRetryCoordinator } from './core/services/retry/job-retry-coordinator';
export { ExponentialBackoffStrategy } from './core/services/retry/retry-strategies/exponential-backoff.strategy';
export { ExponentialBackoffWithJitterStrategy } from './core/services/retry/retry-strategies/exponential-backoff-with-jitter.strategy';
export { LinearBackoffStrategy } from './core/services/retry/retry-strategies/linear-backoff.strategy';

// Core Services
export { QueueConnectionManager } from './core/services/connection/queue-connection-manager';
export { RedisConnectionManager } from './core/services/connection/redis-connection-manager';
export { DLQManager } from './core/services/dlq/dlq-manager';
export { EventCoordinator } from './core/services/events/event-coordinator';
export { EventHandlerRegistry } from './core/services/events/event-handler-registry';
export { JobMetricsCollector } from './core/services/metrics/job-metrics-collector';
export { JobProcessingOrchestrator } from './core/services/processing/job-processing-orchestrator';
export { JobProcessorRegistry } from './core/services/processing/job-processor-registry';
export { JobStatusQueryService } from './core/services/status/job-status-query-service';
export { JobTelemetryService } from './core/services/telemetry/job-telemetry-service';

// Infrastructure Adapters
export { BullMQAdapter } from './infrastructure/adapters/bullmq/bullmq.adapter';
export { BullMQStateMapper } from './infrastructure/adapters/bullmq/bullmq-state-mapper';

// Dependency Injection
export { registerJobQueueBindings, registerJobQueueTestBindings } from './application/di/bindings';
export { DIContainer, globalContainer } from './application/di/container';
