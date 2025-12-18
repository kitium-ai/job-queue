/**
 * Queue client interface for queue operations
 * Abstracts queue implementation details (BullMQ, BeeQueue, etc.)
 */

import type { JobData } from '../../shared/types/job.types';
import type { JobOptions } from '../../types';
import type { IJob } from './job.interface';

/**
 * Queue client interface for queue operations
 */
export type IQueueClient = {
  /**
   * Add job to queue
   * @param name Job name
   * @param data Job data
   * @param options Job options
   * @returns Job ID
   */
  addJob<T extends JobData>(
    name: string,
    data: T,
    options?: JobOptions
  ): Promise<string>;

  /**
   * Get job by ID
   * @param jobId Job ID
   * @returns Job or null if not found
   */
  getJob(jobId: string): Promise<IJob | null>;

  /**
   * Get all jobs by state
   * @param state Job state (e.g., 'active', 'completed', 'failed')
   * @param start Start index for pagination
   * @param end End index for pagination
   * @returns Array of jobs
   */
  getJobsByState(state: string, start?: number, end?: number): Promise<IJob[]>;

  /**
   * Pause queue processing
   */
  pause(): Promise<void>;

  /**
   * Resume queue processing
   */
  resume(): Promise<void>;

  /**
   * Check if queue is paused
   * @returns True if paused
   */
  isPaused(): Promise<boolean>;

  /**
   * Get count of jobs by state
   * @param state Job state
   * @returns Count of jobs in that state
   */
  getCountByState(state: string): Promise<number>;

  /**
   * Close queue
   */
  close(): Promise<void>;

  /**
   * Clean up queue (remove all jobs)
   * @param grace Grace period in milliseconds
   * @param limit Maximum number of jobs to clean
   * @param type Type of jobs to clean (e.g., 'completed', 'failed')
   */
  clean(grace: number, limit: number, type?: string): Promise<void>;
}
