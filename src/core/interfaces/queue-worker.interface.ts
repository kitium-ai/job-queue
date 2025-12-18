/**
 * Queue worker interface for job processing
 * Abstracts worker implementation details (BullMQ Worker, etc.)
 */

import type { IJob } from './job.interface';

/**
 * Queue worker interface for processing jobs
 */
export type IQueueWorker = {
  /**
   * Register job processor handler
   * @param handler Job processor function
   */
  process(handler: (job: IJob) => Promise<unknown>): void;

  /**
   * Pause worker (stop processing new jobs)
   */
  pause(): Promise<void>;

  /**
   * Resume worker (start processing jobs again)
   */
  resume(): Promise<void>;

  /**
   * Close worker and cleanup resources
   */
  close(): Promise<void>;

  /**
   * Register event listener
   * @param event Event name
   * @param handler Event handler
   */
  on(event: string, handler: (job?: IJob, error?: Error) => void): void;

  /**
   * Register one-time event listener
   * @param event Event name
   * @param handler Event handler
   */
  once(event: string, handler: (job?: IJob, error?: Error) => void): void;

  /**
   * Remove event listener
   * @param event Event name
   * @param handler Event handler
   */
  off(event: string, handler: (job?: IJob, error?: Error) => void): void;
}
