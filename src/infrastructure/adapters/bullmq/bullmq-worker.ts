/**
 * BullMQ worker implementation of IQueueWorker interface
 */

import { getLogger } from '@kitiumai/logger';
import { Worker as BullWorker } from 'bullmq';
import type Redis from 'ioredis';

import type { IJob } from '../../../core/interfaces/job.interface';
import type { IQueueWorker } from '../../../core/interfaces/queue-worker.interface';
import type { QueueConfig } from '../../../shared/types/config.types';
import type { JobData } from '../../../shared/types/job.types';
import { BullMQJobWrapper } from './bullmq-job.wrapper';

/**
 * BullMQ worker implementation
 */
export class BullMQWorker implements IQueueWorker {
  private worker: BullWorker<JobData> | null = null;
  private readonly logger: ReturnType<typeof getLogger>;

  constructor(
    private readonly config: QueueConfig,
    private readonly redisConnection: Redis
  ) {
    this.logger = getLogger();
  }

  /**
   * Register job processor handler
   * @param handler Job processor function
   */
  process(handler: (job: IJob) => Promise<unknown>): void {
    if (!this.worker) {
      // @ts-ignore - BullMQ type definitions are incompatible with our typed config
      this.worker = new BullWorker<JobData>(this.config.name, async (bullJob) => {
        const job = new BullMQJobWrapper(bullJob);
        return handler(job);
      }, {
        connection: this.redisConnection,
        concurrency: this.config.worker?.concurrency ?? 5,
        limiter: this.config.worker?.limiter,
        settings: this.config.settings as any,
      });

      this.logger.info('Worker registered', { queue: this.config.name });
    }
  }

  /**
   * Pause worker (stop processing new jobs)
   */
  async pause(): Promise<void> {
    if (!this.worker) {
      return;
    }

    try {
      await this.worker.pause();
      this.logger.info('Worker paused');
    } catch (error) {
      this.logger.error('Failed to pause worker', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Resume worker (start processing jobs again)
   */
  async resume(): Promise<void> {
    if (!this.worker) {
      return;
    }

    try {
      await this.worker.resume();
      this.logger.info('Worker resumed');
    } catch (error) {
      this.logger.error('Failed to resume worker', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Close worker and cleanup resources
   */
  async close(): Promise<void> {
    if (!this.worker) {
      return;
    }

    try {
      await this.worker.close();
      this.worker = null;
      this.logger.info('Worker closed');
    } catch (error) {
      this.logger.error('Failed to close worker', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Register event listener
   * @param event Event name
   * @param handler Event handler
   */
  on(event: string, handler: (job?: IJob, error?: Error) => void): void {
    if (!this.worker) {
      this.logger.warn('Worker not initialized, cannot register event listener', { event });
      return;
    }

    this.worker.on(event as any, (job: any, error: any) => {
      const wrappedJob = job ? new BullMQJobWrapper(job) : undefined;
      handler(wrappedJob, error);
    });
  }

  /**
   * Register one-time event listener
   * @param event Event name
   * @param handler Event handler
   */
  once(event: string, handler: (job?: IJob, error?: Error) => void): void {
    if (!this.worker) {
      this.logger.warn('Worker not initialized, cannot register event listener', { event });
      return;
    }

    this.worker.once(event as any, (job: any, error: any) => {
      const wrappedJob = job ? new BullMQJobWrapper(job) : undefined;
      handler(wrappedJob, error);
    });
  }

  /**
   * Remove event listener
   * @param event Event name
   * @param handler Event handler
   */
  off(event: string, handler: (job?: IJob, error?: Error) => void): void {
    if (!this.worker) {
      return;
    }

    this.worker.off(event as any, handler as any);
  }

  /**
   * Get the underlying BullMQ worker
   * @returns The underlying worker instance or null if not initialized
   */
  getUnderlyingWorker(): BullWorker<JobData> | null {
    return this.worker;
  }
}
