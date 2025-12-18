/**
 * BullMQ queue client implementation of IQueueClient interface
 */

import { getLogger } from '@kitiumai/logger';
import { type JobType, Queue as BullQueue, type QueueOptions } from 'bullmq';
import type Redis from 'ioredis';

import type { IJob } from '../../../core/interfaces/job.interface';
import type { IQueueClient } from '../../../core/interfaces/queue-client.interface';
import type { QueueConfig } from '../../../shared/types/config.types';
import type { JobData } from '../../../shared/types/job.types';
import type { JobOptions } from '../../../types';
import { BullMQJobWrapper } from './bullmq-job.wrapper';

/**
 * BullMQ queue client implementation
 */
export class BullMQQueueClient implements IQueueClient {
  private readonly queue: BullQueue<JobData, unknown, string, JobData, unknown, string>;
  private readonly logger: ReturnType<typeof getLogger>;

  constructor(config: QueueConfig, redisConnection: Redis) {
    this.logger = getLogger();
    const queueOptions: QueueOptions = {
      connection: redisConnection,
      defaultJobOptions: config.defaultJobOptions as QueueOptions['defaultJobOptions'],
      settings: config.settings as QueueOptions['settings'],
    };
    this.queue = new BullQueue<JobData>(config.name, queueOptions);
  }

  /**
   * Add job to queue
   * @param name Job name
   * @param data Job data
   * @param options Job options
   * @returns Job ID
   */
  async addJob<T extends JobData>(
    name: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    try {
      const job = await this.queue.add(name, data, options);
      this.logger.debug('Job added to queue', { jobId: job.id, jobName: name });
      return job.id ?? '';
    } catch (error) {
      this.logger.error('Failed to add job', {
        error: error instanceof Error ? error.message : String(error),
        jobName: name,
      });
      throw error;
    }
  }

  /**
   * Get job by ID
   * @param jobId Job ID
   * @returns Job or null if not found
   */
  async getJob(jobId: string): Promise<IJob | null> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return null;
      }
      return new BullMQJobWrapper(job);
    } catch (error) {
      this.logger.error('Failed to get job', {
        error: error instanceof Error ? error.message : String(error),
        jobId,
      });
      throw error;
    }
  }

  /**
   * Get all jobs by state
   * @param state Job state
   * @param start Start index for pagination
   * @param end End index for pagination
   * @returns Array of jobs
   */
  async getJobsByState(state: string, start?: number, end?: number): Promise<IJob[]> {
    try {
      const jobs = await this.queue.getJobs([state as JobType], start ?? 0, end ?? -1);
      return jobs.map((job) => new BullMQJobWrapper(job));
    } catch (error) {
      this.logger.error('Failed to get jobs by state', {
        error: error instanceof Error ? error.message : String(error),
        state,
      });
      throw error;
    }
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    try {
      await this.queue.pause();
      this.logger.info('Queue paused');
    } catch (error) {
      this.logger.error('Failed to pause queue', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Resume queue processing
   */
  async resume(): Promise<void> {
    try {
      await this.queue.resume();
      this.logger.info('Queue resumed');
    } catch (error) {
      this.logger.error('Failed to resume queue', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if queue is paused
   * @returns True if paused
   */
  async isPaused(): Promise<boolean> {
    try {
      const isPaused = await this.queue.isPaused();
      return isPaused;
    } catch (error) {
      this.logger.error('Failed to check queue pause status', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get count of jobs by state
   * @param state Job state
   * @returns Count of jobs in that state
   */
  async getCountByState(state: string): Promise<number> {
    try {
      const count = await this.queue.getJobCountByTypes(state as JobType);
      return count;
    } catch (error) {
      this.logger.error('Failed to get job count', {
        error: error instanceof Error ? error.message : String(error),
        state,
      });
      throw error;
    }
  }

  /**
   * Close queue
   */
  async close(): Promise<void> {
    try {
      await this.queue.close();
      this.logger.info('Queue closed');
    } catch (error) {
      this.logger.error('Failed to close queue', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up queue (remove jobs)
   * @param grace Grace period in milliseconds
   * @param limit Maximum number of jobs to clean
   * @param type Type of jobs to clean
   */
  async clean(grace: number, limit: number, type?: string): Promise<void> {
    try {
      type CleanType = Parameters<BullQueue<JobData>['clean']>[2];
      await this.queue.clean(grace, limit, type as CleanType);
      this.logger.info('Queue cleaned', { grace, limit, type });
    } catch (error) {
      this.logger.error('Failed to clean queue', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the underlying BullMQ queue
   * @returns The underlying queue instance
   */
  getUnderlyingQueue(): BullQueue<JobData, unknown, string, JobData, unknown, string> {
    return this.queue;
  }
}
