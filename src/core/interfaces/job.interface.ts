/**
 * Job interface for abstracting job details
 * Enables support for different job types and implementations
 */

import type { JobData } from '../../shared/types/job.types';
import type { JobOptions } from '../../types';

/**
 * Job interface representing a job in the queue
 */
export type IJob = {
  /**
   * Unique job ID
   */
  id: string;

  /**
   * Job name/type
   */
  name: string;

  /**
   * Job data payload
   */
  data: JobData;

  /**
   * Number of attempts made
   */
  attemptsMade: number;

  /**
   * Job creation timestamp
   */
  timestamp: number;

  /**
   * When job processing started
   */
  processedOn: number | undefined;

  /**
   * When job completed/failed
   */
  finishedOn: number | undefined;

  /**
   * Current job state
   */
  state: string;

  /**
   * Job options
   */
  opts: JobOptions;

  /**
   * Get current job progress (0-100)
   */
  getProgress(): number;

  /**
   * Update job progress
   * @param percentage Progress percentage (0-100)
   */
  updateProgress(percentage: number): void;

  /**
   * Retry job with optional delay
   * @param delay Delay in milliseconds before retry
   */
  retry(delay?: number): Promise<void>;

  /**
   * Mark job as failed
   * @param error Error that caused the failure
   */
  fail(error: Error): Promise<void>;

  /**
   * Mark job as completed
   * @param result Job result
   */
  complete(result?: unknown): Promise<void>;

  /**
   * Update job data
   * @param data New job data
   */
  update(data: JobData): Promise<void>;

  /**
   * Get job log entries
   * @param start Start index
   * @param end End index
   * @param asc Sort ascending
   */
  getLogs(start?: number, end?: number, asc?: boolean): Promise<string[]>;

  /**
   * Add log entry
   * @param log Log message
   */
  log(log: string): Promise<void>;
}
