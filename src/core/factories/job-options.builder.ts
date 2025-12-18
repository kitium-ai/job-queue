/**
 * Job options builder for fluent job options construction
 * Eliminates duplication of job options building logic
 */

import type { BackoffConfig, JobOptions, RepeatConfig } from '../../types';

/**
 * Fluent builder for constructing JobOptions
 * Consolidates all job options building logic in one place
 */
export class JobOptionsBuilder {
  private options: Partial<JobOptions> = {};

  /**
   * Set maximum number of attempts
   * @param attempts Max attempts
   * @returns This builder for chaining
   */
  withAttempts(attempts: number): this {
    this.options.attempts = attempts;
    return this;
  }

  /**
   * Set backoff configuration
   * @param backoff Backoff config
   * @returns This builder for chaining
   */
  withBackoff(backoff: BackoffConfig): this {
    this.options.backoff = backoff;
    return this;
  }

  /**
   * Set delay before execution
   * @param delay Delay in milliseconds
   * @returns This builder for chaining
   */
  withDelay(delay: number): this {
    this.options.delay = delay;
    return this;
  }

  /**
   * Set job priority
   * @param priority Priority (higher = more important)
   * @returns This builder for chaining
   */
  withPriority(priority: number): this {
    this.options.priority = priority;
    return this;
  }

  /**
   * Set jitter to add randomness to delays
   * @param jitter Jitter in milliseconds
   * @returns This builder for chaining
   */
  withJitter(jitter: number): this {
    this.options.jitter = jitter;
    return this;
  }

  /**
   * Set idempotency key for deduplication
   * @param idempotencyKey Unique key
   * @returns This builder for chaining
   */
  withIdempotencyKey(idempotencyKey: string): this {
    this.options.idempotencyKey = idempotencyKey;
    return this;
  }

  /**
   * Set repeat configuration for recurring jobs
   * @param repeat Repeat config
   * @returns This builder for chaining
   */
  withRepeat(repeat: RepeatConfig): this {
    this.options.repeat = repeat;
    return this;
  }

  /**
   * Set whether to remove job on completion
   * @param removeOnComplete Boolean or time in ms
   * @returns This builder for chaining
   */
  withRemoveOnComplete(removeOnComplete: boolean | number): this {
    this.options.removeOnComplete = removeOnComplete;
    return this;
  }

  /**
   * Set whether to remove job on failure
   * @param removeOnFail Whether to remove
   * @returns This builder for chaining
   */
  withRemoveOnFail(removeOnFail: boolean): this {
    this.options.removeOnFail = removeOnFail;
    return this;
  }

  /**
   * Set job timeout
   * @param timeout Timeout in milliseconds
   * @returns This builder for chaining
   */
  withTimeout(timeout: number): this {
    this.options.timeout = timeout;
    return this;
  }

  /**
   * Set custom metadata
   * @param metadata Metadata object
   * @returns This builder for chaining
   */
  withMetadata(metadata: Record<string, unknown>): this {
    this.options.metadata = metadata;
    return this;
  }

  /**
   * Build the final JobOptions object
   * @returns JobOptions object
   */
  build(): JobOptions {
    return { ...this.options } as JobOptions;
  }

  /**
   * Reset builder to initial state
   * @returns This builder for chaining
   */
  reset(): this {
    this.options = {};
    return this;
  }
}
