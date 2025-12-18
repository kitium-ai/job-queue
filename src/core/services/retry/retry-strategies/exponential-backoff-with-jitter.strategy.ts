/**
 * Exponential backoff with jitter retry strategy implementation
 * Exponential backoff with randomized jitter to prevent thundering herd problem
 */

import type { BackoffConfig, RetryConfig } from '../../../../types';
import type { IJob } from '../../../interfaces/job.interface';
import type { IJobRetryStrategy } from '../../../interfaces/retry-strategy.interface';

/**
 * Exponential backoff with jitter retry strategy
 * Delay = (baseDelay * (2 ^ attempt)) + jitter, capped at maxDelay
 * Jitter helps prevent thundering herd when many jobs retry simultaneously
 */
export class ExponentialBackoffWithJitterStrategy implements IJobRetryStrategy {
  /**
   * Jitter percentage (as decimal, e.g., 0.1 = 10%)
   */
  private readonly jitterPercentage: number;

  constructor(jitterPercentage = 0.1) {
    if (jitterPercentage < 0 || jitterPercentage > 1) {
      throw new Error('Jitter percentage must be between 0 and 1');
    }
    this.jitterPercentage = jitterPercentage;
  }

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
   * Calculate exponential backoff delay with jitter
   * Formula: delay = (baseDelay * (2 ^ attempt)) + random(0, baseDelay * (2 ^ attempt) * jitterPercentage)
   * @param attempt Current attempt number (0-indexed)
   * @param config Backoff configuration
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, config: BackoffConfig): number {
    const baseDelay = config.delay ?? 1000;
    const maxDelay = config.maxDelay ?? 60000;

    // Calculate exponential backoff
    const exponentialDelay = baseDelay * 2**attempt;

    // Add jitter: random value between 0 and (exponentialDelay * jitterPercentage)
    const jitter = Math.random() * exponentialDelay * this.jitterPercentage;
    const delayWithJitter = exponentialDelay + jitter;

    // Cap at maxDelay
    return Math.min(delayWithJitter, maxDelay);
  }
}
