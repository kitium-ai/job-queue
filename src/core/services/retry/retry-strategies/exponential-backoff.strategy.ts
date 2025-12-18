/**
 * Exponential backoff retry strategy implementation
 * Increases delay exponentially with each retry attempt
 */

import type { BackoffConfig, RetryConfig } from '../../../../types';
import type { IJob } from '../../../interfaces/job.interface';
import type { IJobRetryStrategy } from '../../../interfaces/retry-strategy.interface';

/**
 * Exponential backoff retry strategy
 * Delay = baseDelay * (2 ^ attempt), capped at maxDelay
 */
export class ExponentialBackoffStrategy implements IJobRetryStrategy {
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
   * Calculate exponential backoff delay
   * Formula: delay = baseDelay * (2 ^ attempt)
   * @param attempt Current attempt number (0-indexed)
   * @param config Backoff configuration
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, config: BackoffConfig): number {
    const baseDelay = config.delay ?? 1000;
    const maxDelay = config.maxDelay ?? 60000;

    // Calculate exponential delay: baseDelay * (2 ^ attempt)
    const delay = baseDelay * 2**attempt;

    // Cap at maxDelay
    return Math.min(delay, maxDelay);
  }
}
