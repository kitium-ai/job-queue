/**
 * Linear backoff retry strategy implementation
 * Increases delay linearly with each retry attempt
 */

import type { BackoffConfig, RetryConfig } from '../../../../types';
import type { IJob } from '../../../interfaces/job.interface';
import type { IJobRetryStrategy } from '../../../interfaces/retry-strategy.interface';

/**
 * Linear backoff retry strategy
 * Delay = baseDelay * (1 + attempt), capped at maxDelay
 */
export class LinearBackoffStrategy implements IJobRetryStrategy {
  /**
   * Determine if job should be retried based on attempt count
   * @param job The failed job
   * @param error The error (not used in this strategy)
   * @param config Retry configuration
   * @returns True if attempts remain
   */
  shouldRetry(job: IJob, _error: Error, config: RetryConfig): boolean {
    const maxAttempts = config.maxAttempts ?? 3;
    return job.attemptsMade < maxAttempts;
  }

  /**
   * Calculate linear backoff delay
   * Formula: delay = baseDelay * (1 + attempt)
   * @param attempt Current attempt number (0-indexed)
   * @param config Backoff configuration
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, config: BackoffConfig): number {
    const baseDelay = config.delay ?? 1000;
    const maxDelay = config.maxDelay ?? 60000;

    // Calculate linear delay: baseDelay * (1 + attempt)
    const delay = baseDelay * (1 + attempt);

    // Cap at maxDelay
    return Math.min(delay, maxDelay);
  }
}
