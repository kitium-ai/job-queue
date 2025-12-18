/**
 * Retry strategy interface for customizable retry logic
 * Implements the Strategy pattern for pluggable retry behaviors
 */

import type { BackoffConfig, RetryConfig } from '../../types';
import type { IJob } from './job.interface';

/**
 * Retry strategy interface for determining retry behavior
 */
export type IJobRetryStrategy = {
  /**
   * Determine if job should be retried
   * @param job The failed job
   * @param error The error that caused failure
   * @param config Retry configuration
   * @returns True if job should be retried
   */
  shouldRetry(job: IJob, error: Error, config: RetryConfig): boolean;

  /**
   * Calculate delay before next retry attempt
   * @param attempt Current attempt number (0-indexed)
   * @param config Backoff configuration
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, config: BackoffConfig): number;
}
