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
 */

export { JobQueue } from './JobQueue';
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
