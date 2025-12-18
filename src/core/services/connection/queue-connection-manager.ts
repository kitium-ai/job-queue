/**
 * Queue connection manager service
 * Manages queue and worker lifecycle and provides high-level queue operations
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';

import { BullMQAdapter } from '../../../infrastructure/adapters/bullmq/bullmq.adapter';
import type { QueueConfig } from '../../../shared/types/config.types';
import type { JobData } from '../../../shared/types/job.types';
import type { JobOptions } from '../../../types';
import type { IJob } from '../../interfaces/job.interface';
import type { IQueueAdapter } from '../../interfaces/queue-adapter.interface';
import type { IQueueClient } from '../../interfaces/queue-client.interface';
import type { IQueueWorker } from '../../interfaces/queue-worker.interface';
import type { RedisConnectionManager } from './redis-connection-manager';

/**
 * Manager for queue client and worker lifecycle
 */
export class QueueConnectionManager {
  private static readonly queueNotConnectedMessage = 'Queue not connected. Call connect() first.';
  private queueClient: IQueueClient | null = null;
  private workers: IQueueWorker[] = [];
  private adapter: IQueueAdapter | null = null;
  private readonly logger: ReturnType<typeof getLogger>;
  private isConnected = false;

  constructor(private readonly redisManager: RedisConnectionManager) {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'queue-connection-manager' })
        : baseLogger;
  }

  /**
   * Initialize queue connection
   * @param config Queue configuration
   */
  async connect(config: QueueConfig): Promise<void> {
    if (this.isConnected && this.queueClient) {
      this.logger.debug('Queue already connected');
      return;
    }

    try {
      // Ensure Redis is connected first
      await this.redisManager.connect(config);

      // Initialize adapter (using BullMQ as default)
      this.adapter = new BullMQAdapter();

      // Create queue client
      this.queueClient = this.adapter.createQueue(config);

      this.isConnected = true;
      this.logger.info('Queue connection established', { queue: config.name });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to connect to queue', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Get queue client
   * @returns Queue client instance
   */
  getQueueClient(): IQueueClient | null {
    return this.queueClient;
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
    if (!this.queueClient) {
      throw new Error(QueueConnectionManager.queueNotConnectedMessage);
    }

    try {
      const jobId = await this.queueClient.addJob(name, data, options);
      this.logger.debug('Job added', { jobId, jobName: name });
      return jobId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to add job', { error: errorMessage, jobName: name });
      throw error;
    }
  }

  /**
   * Get job by ID
   * @param jobId Job ID
   * @returns Job or null if not found
   */
  getJob(jobId: string): Promise<IJob | null> {
    if (!this.queueClient) {
      throw new Error(QueueConnectionManager.queueNotConnectedMessage);
    }

    return this.queueClient.getJob(jobId);
  }

  /**
   * Get jobs by state
   * @param state Job state
   * @param start Start index
   * @param end End index
   * @returns Array of jobs
   */
  getJobsByState(state: string, start?: number, end?: number): Promise<IJob[]> {
    if (!this.queueClient) {
      throw new Error(QueueConnectionManager.queueNotConnectedMessage);
    }

    return this.queueClient.getJobsByState(state, start, end);
  }

  /**
   * Get count of jobs in a state
   * @param state Job state
   * @returns Count of jobs
   */
  getCountByState(state: string): Promise<number> {
    if (!this.queueClient) {
      throw new Error(QueueConnectionManager.queueNotConnectedMessage);
    }

    return this.queueClient.getCountByState(state);
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    if (!this.queueClient) {
      throw new Error(QueueConnectionManager.queueNotConnectedMessage);
    }

    try {
      await this.queueClient.pause();
      this.logger.info('Queue paused');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to pause queue', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Resume queue processing
   */
  async resume(): Promise<void> {
    if (!this.queueClient) {
      throw new Error(QueueConnectionManager.queueNotConnectedMessage);
    }

    try {
      await this.queueClient.resume();
      this.logger.info('Queue resumed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to resume queue', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Check if queue is paused
   * @returns True if paused
   */
  isPaused(): Promise<boolean> {
    if (!this.queueClient) {
      throw new Error(QueueConnectionManager.queueNotConnectedMessage);
    }

    return this.queueClient.isPaused();
  }

  /**
   * Register worker with job processor
   * @param config Queue configuration
   * @returns Worker instance
   */
  registerWorker(config: QueueConfig): IQueueWorker {
    if (!this.adapter) {
      throw new Error('Queue adapter not initialized. Call connect() first.');
    }

    try {
      const worker = this.adapter.createWorker(config, (job) => {
        // This handler will be overridden by JobProcessingOrchestrator
        this.logger.debug('Job processed', { jobId: job.id });
        return Promise.resolve();
      });

      this.workers.push(worker);
      this.logger.debug('Worker registered', { workerCount: this.workers.length });

      return worker;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to register worker', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Get all registered workers
   * @returns Array of workers
   */
  getWorkers(): IQueueWorker[] {
    return [...this.workers];
  }

  /**
   * Disconnect queue and clean up resources
   */
  async disconnect(): Promise<void> {
    try {
      // Close all workers
      for (const worker of this.workers) {
        try {
          await worker.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error('Error closing worker', { error: errorMessage });
        }
      }
      this.workers = [];

      // Close queue client
      if (this.queueClient) {
        try {
          await this.queueClient.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error('Error closing queue client', { error: errorMessage });
        }
      }

      // Close Redis connection
      await this.redisManager.disconnect();

      this.queueClient = null;
      this.adapter = null;
      this.isConnected = false;

      this.logger.info('Queue disconnected');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error during disconnect', { error: errorMessage });
    }
  }

  /**
   * Reset connection state
   */
  reset(): void {
    this.queueClient = null;
    this.workers = [];
    this.adapter = null;
    this.isConnected = false;
    this.redisManager.reset();
  }

  /**
   * Health check - verify queue is responsive
   * @returns True if queue is healthy
   */
  async healthCheck(): Promise<boolean> {
    if (!this.queueClient) {
      return false;
    }

    try {
      // Try to get queue count as a health check
      await this.queueClient.getCountByState('active');
      return true;
    } catch (error) {
      this.logger.error('Queue health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Check if queue is connected
   * @returns True if connected
   */
  isQueueConnected(): boolean {
    return this.isConnected && this.queueClient !== null;
  }
}
