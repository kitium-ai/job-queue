/**
 * Job retry coordinator service
 * Coordinates retry logic and determines if jobs should be retried or moved to DLQ
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';

import type { BackoffConfig, RetryConfig } from '../../../types';
import type { IJob } from '../../interfaces/job.interface';
import type { IJobRetryStrategy } from '../../interfaces/retry-strategy.interface';

/**
 * Coordinator for job retry logic
 * Delegates to retry strategy and handles retry/DLQ decisions
 */
export class JobRetryCoordinator {
  private readonly logger: ReturnType<typeof getLogger>;

  constructor(private readonly strategy: IJobRetryStrategy) {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'job-retry-coordinator' })
        : baseLogger;
  }

  /**
   * Handle job failure and determine retry or DLQ
   * @param job The failed job
   * @param error The error that caused failure
   * @param config Retry configuration
   * @returns True if job will be retried, false if DLQ
   */
  async handleFailure(job: IJob, error: Error, config: RetryConfig): Promise<boolean> {
    try {
      const shouldRetry = this.strategy.shouldRetry(job, error, config);

      if (shouldRetry) {
        const delay = this.strategy.calculateDelay(job.attemptsMade, { delay: config.backoffDelay, maxDelay: config.maxBackoffDelay } as BackoffConfig);
        this.logger.debug('Job will be retried', {
          jobId: job.id,
          jobName: job.name,
          attempt: job.attemptsMade + 1,
          maxAttempts: config.maxAttempts ?? 3,
          retryDelay: delay,
        });

        // Job will be retried by the queue infrastructure
        return true;
      } else {
        this.logger.warn('Job exceeded max retry attempts', {
          jobId: job.id,
          jobName: job.name,
          attempts: job.attemptsMade,
          maxAttempts: config.maxAttempts ?? 3,
          error: error.message,
        });

        // Job should go to DLQ (caller handles this)
        return false;
      }
    } catch (error_) {
      const errorMessage = error_ instanceof Error ? error_.message : String(error_);
      this.logger.error('Error in retry coordinator', { jobId: job.id, error: errorMessage });
      throw error_;
    }
  }

  /**
   * Calculate retry delay for a job
   * @param job The job
   * @param config Retry configuration
   * @returns Delay in milliseconds
   */
  getRetryDelay(job: IJob, config: RetryConfig): number {
    return this.strategy.calculateDelay(job.attemptsMade, { delay: config.backoffDelay, maxDelay: config.maxBackoffDelay } as BackoffConfig);
  }

  /**
   * Determine if a job can be retried
   * @param job The job
   * @param config Retry configuration
   * @returns True if job can be retried
   */
  canRetry(job: IJob, config: RetryConfig): boolean {
    const maxAttempts = config.maxAttempts ?? 3;
    return job.attemptsMade < maxAttempts;
  }

  /**
   * Get remaining attempts for a job
   * @param job The job
   * @param config Retry configuration
   * @returns Number of remaining attempts (0 or more)
   */
  getRemainingAttempts(job: IJob, config: RetryConfig): number {
    const maxAttempts = config.maxAttempts ?? 3;
    const remaining = maxAttempts - job.attemptsMade;
    return Math.max(0, remaining);
  }
}
