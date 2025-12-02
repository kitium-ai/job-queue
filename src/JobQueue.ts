import { Queue, Worker, Job as BullJob, type JobsOptions } from 'bullmq';
import ioredis from 'ioredis';
import { getLogger } from '@kitiumai/logger';
import { KitiumError } from '@kitiumai/error';
import {
  QueueConfig,
  JobOptions,
  JobProcessor,
  JobStatus,
  JobStatusInfo,
  QueueEvent,
  JobEventHandler,
  DLQJobInfo,
} from './types';

/**
 * Enterprise-ready job queue implementation using BullMQ
 * Handles job scheduling, retries, status tracking, and dead letter queues
 */
const logger = getLogger();

export class JobQueue {
  private queue: Queue;
  private worker: Worker | null = null;
  private redis: InstanceType<typeof ioredis>;
  private dlqQueue: Queue | null = null;
  private config: QueueConfig;
  private eventHandlers: Map<QueueEvent, Set<JobEventHandler>> = new Map();
  private processors: Map<string, JobProcessor<Record<string, unknown>, unknown>> = new Map();

  constructor(config: QueueConfig) {
    this.config = config;

    // Initialize Redis connection with secure defaults
    this.redis = new ioredis({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db || 0,
      retryStrategy: config.redis?.retryStrategy || this.defaultRetryStrategy,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Create main queue
    this.queue = new Queue(config.name, {
      connection: this.redis,
      defaultJobOptions: this.buildDefaultJobOptions(config.defaultJobOptions),
    });

    // Initialize DLQ if enabled
    if (config.dlq?.enabled) {
      this.initializeDLQ();
    }

    // Setup event listeners
    this.setupQueueEventListeners();
  }

  /**
   * Default retry strategy for Redis connection
   */
  private defaultRetryStrategy = (times: number): number => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  };

  /**
   * Build default job options from configuration
   */
  private buildDefaultJobOptions(options?: JobOptions): JobsOptions {
    return {
      attempts: options?.attempts || 3,
      delay: options?.delay || 0,
      priority: options?.priority || 0,
      removeOnComplete: options?.removeOnComplete !== false,
      removeOnFail: options?.removeOnFail === true,
      backoff: options?.backoff || {
        type: 'exponential' as const,
        delay: 1000,
      },
      timeout: options?.timeout || 30000,
      ...options,
    };
  }

  /**
   * Initialize Dead Letter Queue
   */
  private initializeDLQ(): void {
    const dlqName = this.config.dlq?.queueName || `${this.config.name}-dlq`;
    this.dlqQueue = new Queue(dlqName, {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  /**
   * Setup queue event listeners
   */
  private setupQueueEventListeners(): void {
    this.queue.on('error', (error: Error) => {
      this.emit(QueueEvent.QUEUE_ERROR, null, error);
    });
  }

  /**
   * Register a job processor
   */
  public process<T extends Record<string, unknown>>(
    jobName: string,
    processor: JobProcessor<T>
  ): void {
    if (this.processors.has(jobName)) {
      throw new KitiumError({
        code: 'queue/processor_exists',
        message: `Processor for job "${jobName}" already registered`,
        severity: 'error',
        kind: 'business',
        retryable: false,
        source: '@kitiumai/job-queue',
      });
    }

    this.processors.set(
      jobName,
      processor as JobProcessor<Record<string, unknown>, unknown>
    );

    // Create or update worker
    if (this.worker) {
      // Remove old worker
      this.worker.close().catch((err) => {
        logger.error('Error closing old worker', { error: err as Error });
      });
    }

    // Create new worker with all registered processors
    this.worker = new Worker(this.config.name, this.createWorkerHandler(), {
      connection: this.redis,
      concurrency: 5,
    });

    // Setup worker event listeners
    this.setupWorkerEventListeners();
  }

  /**
   * Create worker handler that processes all registered jobs
   */
  private createWorkerHandler(): (job: BullJob) => Promise<unknown> {
    return async (job: BullJob) => {
      const processor = this.processors.get(job.name);
      if (!processor) {
        throw new Error(`No processor registered for job: ${job.name}`);
      }

      this.emit(QueueEvent.JOB_STARTED, job);

      try {
        const result = await processor({
          id: job.id || '',
          name: job.name,
          data: job.data,
          attempts: job.attemptsMade,
          progress: (percentage: number) => {
            // BullMQ v5 uses updateProgress instead of callable progress
            void job.updateProgress(percentage);
            this.emit(QueueEvent.JOB_PROGRESS, job);
          },
        });

        this.emit(QueueEvent.JOB_COMPLETED, job);
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // Check if we should move to DLQ
        if (job.attemptsMade >= (job.opts.attempts || 3) && this.config.dlq?.enabled) {
          await this.moveJobToDLQ(job, err);
          this.emit(QueueEvent.JOB_DLQ, job, err);
        } else {
          this.emit(QueueEvent.JOB_FAILED, job, err);
          if (job.attemptsMade < (job.opts.attempts || 3)) {
            this.emit(QueueEvent.JOB_RETRYING, job);
          }
        }

        throw err;
      }
    };
  }

  /**
   * Setup worker event listeners
   */
  private setupWorkerEventListeners(): void {
    if (!this.worker) {
      return;
    }

    this.worker.on('stalled', (jobId: string) => {
      this.queue
        .getJob(jobId)
        .then((job) => {
          if (job) {
            this.emit(QueueEvent.JOB_STALLED, job);
          }
        })
        .catch((err) => {
          logger.error('Error getting stalled job', { error: err });
        });
    });

    this.worker.on('error', (error: Error) => {
      this.emit(QueueEvent.QUEUE_ERROR, null, error);
    });
  }

  /**
   * Add a job to the queue
   */
  public async addJob<T extends Record<string, unknown>>(
    jobName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const jobOptions = {
      ...this.buildDefaultJobOptions(this.config.defaultJobOptions),
      ...options,
    };

    const job = await this.queue.add(jobName, data, jobOptions);

    this.emit(QueueEvent.JOB_ADDED, job);

    return job.id || '';
  }

  /**
   * Schedule a job with cron expression
   */
  public async scheduleJob<T extends Record<string, unknown>>(
    jobName: string,
    data: T,
    cronPattern: string,
    options?: JobOptions
  ): Promise<string> {
    const jobOptions = {
      ...this.buildDefaultJobOptions(this.config.defaultJobOptions),
      ...options,
      repeat: {
        pattern: cronPattern,
      },
    };

    const job = await this.queue.add(jobName, data, jobOptions);

    this.emit(QueueEvent.JOB_ADDED, job);

    return job.id || '';
  }

  /**
   * Retry a job
   */
  public async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // BullMQ v5 method name changed
    await job.moveToWait();
    this.emit(QueueEvent.JOB_RETRYING, job);
  }

  /**
   * Move job to Dead Letter Queue
   */
  private async moveJobToDLQ(job: BullJob, error: Error): Promise<void> {
    if (!this.dlqQueue) {
      return;
    }

    const dlqJob = await this.dlqQueue.add(
      job.name,
      {
        originalJobId: job.id,
        originalData: job.data,
        originalQueue: this.config.name,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      {
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    // Call custom notification handler if provided
    if (this.config.dlq?.notificationHandler) {
      try {
        await this.config.dlq.notificationHandler(dlqJob);
      } catch (err) {
        logger.error('Error in DLQ notification handler', { error: err as Error });
      }
    }
  }

  /**
   * Get job status
   */
  public async getJobStatus(jobId: string): Promise<JobStatusInfo> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new KitiumError({
        code: 'queue/not_found',
        message: `Job ${jobId} not found`,
        severity: 'error',
        kind: 'not_found',
        retryable: false,
        source: '@kitiumai/job-queue',
      });
    }

    const status = await this.getJobState(job);

    return {
      id: job.id || '',
      name: job.name,
      status,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      data: job.data,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts || 3,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      completedAt: job.finishedOn,
    };
  }

  /**
   * Get job state
   */
  private async getJobState(job: BullJob): Promise<JobStatus> {
    if (job.finishedOn) {
      return job.failedReason ? JobStatus.FAILED : JobStatus.COMPLETED;
    }
    if (job.processedOn) {
      return JobStatus.ACTIVE;
    }
    if (job.delay && job.delay > 0) {
      return JobStatus.DELAYED;
    }
    return JobStatus.WAITING;
  }

  /**
   * Get all jobs with a specific status
   */
  public async getJobsByStatus(status: JobStatus, limit: number = 100): Promise<JobStatusInfo[]> {
    let jobs: BullJob[] = [];

    switch (status) {
      case JobStatus.ACTIVE:
        jobs =
          (await this.queue.getActiveCount()) > 0
            ? await this.queue.getJobs(['active'], 0, limit - 1)
            : [];
        break;
      case JobStatus.COMPLETED:
        jobs = await this.queue.getJobs(['completed'], 0, limit - 1);
        break;
      case JobStatus.FAILED:
        jobs = await this.queue.getJobs(['failed'], 0, limit - 1);
        break;
      case JobStatus.DELAYED:
        jobs = await this.queue.getJobs(['delayed'], 0, limit - 1);
        break;
      case JobStatus.WAITING:
        jobs = await this.queue.getJobs(['waiting'], 0, limit - 1);
        break;
      default:
        return [];
    }

    return Promise.all(
      jobs.map(async (job) => ({
        id: job.id || '',
        name: job.name,
        status: await this.getJobState(job),
        progress: typeof job.progress === 'number' ? job.progress : 0,
        data: job.data,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts || 3,
        createdAt: job.timestamp,
        processedAt: job.processedOn,
        completedAt: job.finishedOn,
      }))
    );
  }

  /**
   * Get Dead Letter Queue jobs
   */
  public async getDLQJobs(limit: number = 100): Promise<DLQJobInfo[]> {
    if (!this.dlqQueue) {
      return [];
    }

    const jobs = await this.dlqQueue.getJobs(['waiting'], 0, limit - 1);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      attempts: job.attemptsMade,
      createdAt: job.timestamp,
    }));
  }

  /**
   * Remove a job from the queue
   */
  public async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  /**
   * Clear the entire queue
   */
  public async clear(): Promise<void> {
    await this.queue.clean(0, 10000);
  }

  /**
   * Register event handler
   */
  public on(event: QueueEvent, handler: JobEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Emit event to handlers
   */
  private emit(event: QueueEvent, job: BullJob | null, error?: Error): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => {
      try {
        const result = handler(job, error);
        if (result instanceof Promise) {
          result.catch((err) => {
            logger.error(`Error in ${event} handler`, { error: err });
          });
        }
      } catch (err) {
        logger.error(`Error in ${event} handler`, { error: err });
      }
    });
  }

  /**
   * Get queue statistics
   */
  public async getStats(): Promise<{
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    waiting: number;
    paused: number;
  }> {
    const [active, completed, failed, delayed, waiting, isPaused] = await Promise.all([
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
      this.queue.getWaitingCount(),
      this.queue.isPaused(),
    ]);

    const paused = isPaused ? 1 : 0;
    return { active, completed, failed, delayed, waiting, paused };
  }

  /**
   * Close the queue and cleanup resources
   */
  public async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.dlqQueue) {
      await this.dlqQueue.close();
    }
    await this.queue.close();
    await this.redis.quit();
  }
}
