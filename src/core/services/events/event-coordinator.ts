/**
 * Event coordinator service for centralized event emission
 * Eliminates scattered event emission logic from JobQueue class
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';

import { QueueEvent } from '../../../types';
import type { IJob } from '../../interfaces/job.interface';
import type { EventHandlerRegistry } from './event-handler-registry';

/**
 * Coordinator for job queue events
 * Centralizes all event emission logic
 */
export class EventCoordinator {
  private readonly logger: ReturnType<typeof getLogger>;

  constructor(private readonly registry: EventHandlerRegistry) {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'event-coordinator' })
        : baseLogger;
  }

  /**
   * Register event handler
   * @param event Event name
   * @param handler Event handler
   */
  on(event: QueueEvent, handler: (job: unknown, error?: Error) => Promise<void> | void): void {
    this.registry.register(event, handler);
  }

  /**
   * Unregister event handler
   * @param event Event name
   * @param handler Event handler
   */
  off(event: QueueEvent, handler: (job: unknown, error?: Error) => Promise<void> | void): void {
    this.registry.unregister(event, handler);
  }

  /**
   * Emit job added event
   * @param job The job that was added
   */
  async emitJobAdded(job: IJob): Promise<void> {
    await this.emit(QueueEvent.JOB_ADDED, job);
  }

  /**
   * Emit job started event
   * @param job The job that started
   */
  async emitJobStarted(job: IJob): Promise<void> {
    await this.emit(QueueEvent.JOB_STARTED, job);
  }

  /**
   * Emit job completed event
   * @param job The completed job
   * @param result Job result (optional)
   */
  async emitJobCompleted(job: IJob, result?: unknown): Promise<void> {
    this.logger.debug('Job completed', { jobId: job.id, jobName: job.name, result });
    await this.emit(QueueEvent.JOB_COMPLETED, job);
  }

  /**
   * Emit job failed event
   * @param job The failed job
   * @param error The error
   */
  async emitJobFailed(job: IJob, error: Error): Promise<void> {
    this.logger.debug('Job failed', {
      jobId: job.id,
      jobName: job.name,
      error: error.message,
    });
    await this.emit(QueueEvent.JOB_FAILED, job, error);
  }

  /**
   * Emit job retrying event
   * @param job The job being retried
   * @param error The error that caused the retry
   */
  async emitJobRetrying(job: IJob, error: Error): Promise<void> {
    this.logger.debug('Job retrying', {
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
      error: error.message,
    });
    await this.emit(QueueEvent.JOB_RETRYING, job, error);
  }

  /**
   * Emit job stalled event
   * @param job The stalled job
   */
  async emitJobStalled(job: IJob): Promise<void> {
    this.logger.warn('Job stalled', { jobId: job.id, jobName: job.name });
    await this.emit(QueueEvent.JOB_STALLED, job);
  }

  /**
   * Emit job progress event
   * @param job The job with progress update
   */
  async emitJobProgress(job: IJob): Promise<void> {
    this.logger.debug('Job progress', { jobId: job.id, progress: job.getProgress() });
    await this.emit(QueueEvent.JOB_PROGRESS, job);
  }

  /**
   * Emit job moved to DLQ event
   * @param job The job moved to DLQ
   * @param error The error that caused DLQ move
   */
  async emitJobDLQ(job: IJob, error: Error): Promise<void> {
    this.logger.error(
      'Job moved to DLQ',
      {
        jobId: job.id,
        jobName: job.name,
        error: error.message,
      },
      error
    );
    await this.emit(QueueEvent.JOB_DLQ, job, error);
  }

  /**
   * Emit generic queue error event
   * @param error The error
   */
  async emitQueueError(error: Error): Promise<void> {
    this.logger.error('Queue error', { error: error.message }, error);
    await this.emit(QueueEvent.QUEUE_ERROR, undefined, error);
  }

  /**
   * Internal method to emit event to all registered handlers
   * @param event Event name
   * @param job Associated job (if any)
   * @param error Associated error (if any)
   */
  private async emit(
    event: QueueEvent,
    job?: IJob,
    error?: Error
  ): Promise<void> {
    const handlers = this.registry.getHandlers(event);

    if (handlers.size === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        const result = handler(job, error);
        if (result instanceof Promise) {
          await result;
        }
      } catch (handlerError) {
        const errorMessage =
          handlerError instanceof Error ? handlerError.message : String(handlerError);
        this.logger.error(
          `Error in ${event} handler`,
          { error: errorMessage },
          handlerError instanceof Error ? handlerError : undefined
        );
      }
    }
  }
}
