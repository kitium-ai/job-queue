/**
 * Queue adapter interface for abstracting queue implementation details
 * Enables support for multiple queue backends (BullMQ, BeeQueue, RabbitMQ, etc.)
 */

import type { QueueConfig } from '../../shared/types/config.types';
import type { JobData, JobProcessor } from '../../shared/types/job.types';
import type { IQueueClient } from './queue-client.interface';
import type { IQueueWorker } from './queue-worker.interface';

/**
 * Queue adapter factory interface for creating queue and worker instances
 * Implements the Adapter pattern to support multiple queue backends
 */
export type IQueueAdapter = {
  /**
   * Unique identifier for this adapter
   */
  readonly name: string;

  /**
   * Create a queue client instance
   * @param config Queue configuration
   * @returns Configured queue client instance
   */
  createQueue(config: QueueConfig): IQueueClient;

  /**
   * Create a worker instance
   * @param config Queue configuration
   * @param handler Job processor handler
   * @returns Configured worker instance
   */
  createWorker<T extends JobData, R = unknown>(
    config: QueueConfig,
    handler: JobProcessor<T, R>
  ): IQueueWorker;
}
