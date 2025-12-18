import { NotFoundError, ValidationError } from '@kitiumai/error';
import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';
import { type Job as BullJob, type JobsOptions, Queue, Worker } from 'bullmq';
import ioredis from 'ioredis';

import {
  type DLQJobInfo,
  type JobEventHandler,
  type JobOptions,
  type JobProcessor,
  JobStatus,
  type JobStatusInfo,
  type MetricsAdapter,
  type QueueConfig,
  QueueEvent,
  type TelemetryAdapter,
} from './types';

/**
 * Enterprise-ready job queue implementation using BullMQ
 * Handles job scheduling, retries, status tracking, and dead letter queues
 */
const baseLogger = getLogger();
const logger: ReturnType<typeof getLogger> =
  'child' in baseLogger && typeof baseLogger.child === 'function'
    ? (baseLogger as IAdvancedLogger).child({ component: 'job-queue' })
    : baseLogger;

const SOURCE = '@kitiumai/job-queue';

export class JobQueue {
  private readonly queue: Queue;
  private readonly workers: Worker[] = [];
  private readonly redis: InstanceType<typeof ioredis>;
  private dlqQueue: Queue | null = null;
  private readonly config: QueueConfig;
  private readonly eventHandlers: Map<QueueEvent, Set<JobEventHandler>> = new Map();
  private readonly processors: Map<string, JobProcessor<Record<string, unknown>, unknown>> = new Map();
  private readonly telemetry: TelemetryAdapter | undefined;
  private readonly metrics: MetricsAdapter | undefined;

  constructor(config: QueueConfig) {
    this.config = config;
    this.telemetry = config.telemetry;
    this.metrics = config.metrics;

    this.redis = this.createRedisConnection(config);

    // Create main queue
    this.queue = new Queue(config.name, {
      connection: this.redis,
      defaultJobOptions: this.buildDefaultJobOptions(config.defaultJobOptions),
    });

    // Initialize DLQ if enabled
    if (config.dlq?.enabled === true) {
      this.initializeDLQ();
    }

    // Setup event listeners
    this.setupQueueEventListeners();
  }

  private createRedisConnection(config: QueueConfig): InstanceType<typeof ioredis> {
    const redisConfig = config.redis ?? {};
    const redisConnectionObj = {
      host: redisConfig.host ?? 'localhost',
      port: redisConfig.port ?? 6379,
      password: redisConfig.password,
      username: redisConfig.username,
      db: redisConfig.db ?? 0,
      retryStrategy: redisConfig.retryStrategy ?? this.defaultRetryStrategy,
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest ?? 5,
      enableReadyCheck: redisConfig.enableReadyCheck ?? true,
      tls: redisConfig.tls,
      connectTimeout: redisConfig.connectTimeout ?? 2000,
    } as unknown as { host: string; port: number };
    return new ioredis(redisConnectionObj);
  }

  /**
   * Default retry strategy for Redis connection
   */
  private readonly defaultRetryStrategy = (times: number): number => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  };

  /**
   * Build default job options from configuration
   */
  private buildDefaultJobOptions(options: JobOptions = {}): JobsOptions {
    const removeOnComplete = options.removeOnComplete ?? true;
    const shouldRemoveOnFail = options.removeOnFail ?? false;

    return {
      attempts: options.attempts ?? 3,
      delay: options.delay ?? 0,
      priority: options.priority ?? 0,
      backoff: options.backoff ?? {
        type: 'exponential' as const,
        delay: 1000,
      },
      timeout: options.timeout ?? 30000,
      ...options,
      removeOnComplete,
      removeOnFail: shouldRemoveOnFail,
    };
  }

  private buildJobOptions(options?: JobOptions): JobsOptions {
    const baseOptions = this.buildDefaultJobOptions(this.config.defaultJobOptions);
    const jobOptions: JobsOptions = { ...baseOptions, ...(options ?? {}) };
    if (options?.idempotencyKey) {
      jobOptions.jobId = options.idempotencyKey;
    }
    return jobOptions;
  }

  private applyJitter(jobOptions: JobsOptions, jitterMs: number | undefined): void {
    const jitter = jitterMs ?? 0;
    if (jitter <= 0) {
      return;
    }
    jobOptions.delay = (jobOptions.delay ?? 0) + Math.floor(Math.random() * jitter);
  }

  /**
   * Initialize Dead Letter Queue
   */
  private initializeDLQ(): void {
    const dlqName = this.config.dlq?.queueName ?? `${this.config.name}-dlq`;
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
      throw new ValidationError({
        code: 'queue/processor_exists',
        message: `Processor for job "${jobName}" already registered`,
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    this.processors.set(jobName, processor as JobProcessor<Record<string, unknown>, unknown>);

    if (this.workers.length === 0) {
      const concurrency = this.config.worker?.concurrency ?? 5;
      const workerOptions: { connection: InstanceType<typeof ioredis>; concurrency: number; limiter?: { max: number; duration: number } } = {
        connection: this.redis,
        concurrency,
      };
      if (this.config.worker?.limiter !== undefined) {
        workerOptions.limiter = this.config.worker.limiter;
      }
      const worker = new Worker(this.config.name, this.createWorkerHandler(), workerOptions);
      this.workers.push(worker);
      this.setupWorkerEventListeners(worker);
    }
  }

  /**
   * Create worker handler that processes all registered jobs
   */
  private createWorkerHandler(): (job: BullJob) => Promise<unknown> {
    return (job: BullJob) => this.processJob(job);
  }

  private async processJob(job: BullJob): Promise<unknown> {
    const processor = this.processors.get(job.name);
    if (!processor) {
      throw new ValidationError({
        code: 'queue/processor_not_found',
        message: `No processor registered for job: ${job.name}`,
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }

    this.emit(QueueEvent.JOB_STARTED, job);
    this.metrics?.increment('jobqueue.job.started', 1, { name: job.name });

    const span = this.telemetry?.startSpan('jobqueue.process', {
      jobName: job.name,
      queue: this.config.name,
    });
    const startTime = Date.now();

    try {
      const result = await processor({
        id: job.id?.toString() ?? '',
        name: job.name,
        data: job.data,
        attempts: job.attemptsMade,
        progress: (percentage: number) => {
          void job.updateProgress(percentage);
          this.emit(QueueEvent.JOB_PROGRESS, job);
        },
      });

      this.emit(QueueEvent.JOB_COMPLETED, job);
      this.metrics?.increment('jobqueue.job.completed', 1, { name: job.name });
      this.observeDuration(job, 'jobqueue.job.duration_ms', startTime);
      span?.end();
      return result;
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      await this.handleJobFailure(job, error_, startTime, span);
      throw error_;
    }
  }

  private async handleJobFailure(
    job: BullJob,
    error: Error,
    startTime: number,
    span: ReturnType<TelemetryAdapter['startSpan']> | undefined
  ): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 3;
    const isDlqEnabled = this.config.dlq?.enabled === true;

    if (isDlqEnabled) {
      if (job.attemptsMade >= maxAttempts) {
        await this.moveJobToDLQ(job, error);
        this.emit(QueueEvent.JOB_DLQ, job, error);
        this.metrics?.increment('jobqueue.job.dlq', 1, { name: job.name });
      } else {
        this.emit(QueueEvent.JOB_FAILED, job, error);
        this.emit(QueueEvent.JOB_RETRYING, job);
        this.metrics?.increment('jobqueue.job.retrying', 1, { name: job.name });
      }
    } else {
      this.emit(QueueEvent.JOB_FAILED, job, error);
      if (job.attemptsMade < maxAttempts) {
        this.emit(QueueEvent.JOB_RETRYING, job);
        this.metrics?.increment('jobqueue.job.retrying', 1, { name: job.name });
      }
    }

    span?.recordException(error);
    span?.end();
    this.observeDuration(job, 'jobqueue.job.duration_ms', startTime);
  }

  /**
   * Setup worker event listeners
   */
  private setupWorkerEventListeners(worker: Worker): void {
    worker.on('stalled', (jobId: string) => {
      void this.handleWorkerStalled(jobId);
    });

    worker.on('error', (error: Error) => {
      this.emit(QueueEvent.QUEUE_ERROR, null, error);
    });
  }

  private async handleWorkerStalled(jobId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return;
      }
      this.emit(QueueEvent.JOB_STALLED, job);
      this.metrics?.increment('jobqueue.job.stalled', 1, { name: job.name });
    } catch (error) {
      logger.error('Error getting stalled job', undefined, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Add a job to the queue
   */
  public async addJob<T extends Record<string, unknown>>(
    jobName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const jobOptions = this.buildJobOptions(options);
    this.applyJitter(jobOptions, options?.jitter);

    const job = await this.queue.add(jobName, data, jobOptions);

    this.emit(QueueEvent.JOB_ADDED, job);
    this.metrics?.increment('jobqueue.job.added', 1, { name: job.name });

    return job.id?.toString() ?? '';
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
    const jobOptions = this.buildJobOptions(options);
    jobOptions.repeat = { pattern: cronPattern };

    const job = await this.queue.add(jobName, data, jobOptions);

    this.emit(QueueEvent.JOB_ADDED, job);

    return job.id?.toString() ?? '';
  }

  /**
   * Schedule a job on a fixed interval with optional jitter
   */
  public async scheduleEvery<T extends Record<string, unknown>>(
    jobName: string,
    data: T,
    everyMs: number,
    options?: JobOptions
  ): Promise<string> {
    const jobOptions = this.buildJobOptions(options);
    jobOptions.repeat = {
      every: everyMs,
      immediately: options?.repeat?.immediately ?? true,
    };
    this.applyJitter(jobOptions, options?.jitter);

    const job = await this.queue.add(jobName, data, jobOptions);
    this.emit(QueueEvent.JOB_ADDED, job);
    return job.id?.toString() ?? '';
  }

  /**
   * Retry a job
   */
  public async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundError({
        code: 'queue/job_not_found',
        message: `Job ${jobId} not found`,
        severity: 'error',
        kind: 'not_found',
        retryable: false,
        source: SOURCE,
      });
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
      } catch (error_) {
        logger.error('Error in DLQ notification handler', undefined, error_ instanceof Error ? error_ : undefined);
      }
    }
  }

  /**
   * Replay DLQ jobs back to the main queue
   */
  public async replayDLQ(limit = 100): Promise<number> {
    if (!this.dlqQueue) {
      return 0;
    }

    const jobs = await this.dlqQueue.getJobs(['waiting'], 0, limit - 1);
    let moved = 0;
    for (const job of jobs) {
      await this.queue.add(job.name, job.data, {
        ...this.buildDefaultJobOptions(this.config.defaultJobOptions),
        jobId: job.id as string,
      });
      await job.remove();
      moved += 1;
    }
    return moved;
  }

  /**
   * Get job status
   */
  public async getJobStatus(jobId: string): Promise<JobStatusInfo> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundError({
        code: 'queue/job_not_found',
        message: `Job ${jobId} not found`,
        severity: 'error',
        kind: 'not_found',
        retryable: false,
        source: SOURCE,
      });
    }

    const status = await this.getJobState(job);

    const statusInfo: JobStatusInfo = {
      id: job.id?.toString() ?? '',
      name: job.name,
      status,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      data: job.data,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 3,
      createdAt: job.timestamp,
    };
    if (job.processedOn !== undefined) {
      statusInfo.processedAt = job.processedOn;
    }
    if (job.finishedOn !== undefined) {
      statusInfo.completedAt = job.finishedOn;
      if (job.failedReason) {
        statusInfo.failedAt = job.finishedOn;
      }
    }
    return statusInfo;
  }

  /**
   * Get job state
   */
  private async getJobState(job: BullJob): Promise<JobStatus> {
    const state = await job.getState();
    const stateString = String(state);
    switch (stateString) {
      case 'completed':
        return JobStatus.COMPLETED;
      case 'failed':
        return JobStatus.FAILED;
      case 'active':
        return JobStatus.ACTIVE;
      case 'delayed':
        return JobStatus.DELAYED;
      case 'paused':
        return JobStatus.PAUSED;
      case 'prioritized':
      case 'waiting-children':
      case 'waiting':
      case 'wait':
        return JobStatus.WAITING;
      case 'unknown':
        return JobStatus.PENDING;
      default:
        return JobStatus.PENDING;
    }
  }

  /**
   * Get all jobs with a specific status
   */
  public async getJobsByStatus(status: JobStatus, limit = 100): Promise<JobStatusInfo[]> {
    if (status === JobStatus.DLQ) {
      return this.getDLQStatusInfos(limit);
    }

    const bullmqStatuses = this.getBullmqStatusesForJobStatus(status);
    // @ts-ignore - BullMQ type definitions use different state type
    const jobs = (await this.queue.getJobs(bullmqStatuses, 0, limit - 1)) as BullJob[];
    return this.toJobStatusInfos(jobs);
  }

  private getBullmqStatusesForJobStatus(status: Exclude<JobStatus, JobStatus.DLQ>): string[] {
    switch (status) {
      case JobStatus.ACTIVE:
        return ['active'];
      case JobStatus.COMPLETED:
        return ['completed'];
      case JobStatus.FAILED:
        return ['failed'];
      case JobStatus.DELAYED:
        return ['delayed'];
      case JobStatus.PAUSED:
        return ['paused'];
      case JobStatus.PENDING:
      case JobStatus.WAITING:
        return ['waiting', 'wait', 'prioritized'];
      default:
        return this.assertNever(status);
    }
  }

  private toJobStatusInfos(jobs: BullJob[]): Promise<JobStatusInfo[]> {
    return Promise.all(jobs.map((job) => this.toJobStatusInfo(job)));
  }

  private async toJobStatusInfo(job: BullJob): Promise<JobStatusInfo> {
    const statusInfo: JobStatusInfo = {
      id: job.id?.toString() ?? '',
      name: job.name,
      status: await this.getJobState(job),
      progress: typeof job.progress === 'number' ? job.progress : 0,
      data: job.data,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 3,
      createdAt: job.timestamp,
    };

    if (job.processedOn !== undefined) {
      statusInfo.processedAt = job.processedOn;
    }
    if (job.finishedOn !== undefined) {
      statusInfo.completedAt = job.finishedOn;
    }

    return statusInfo;
  }

  private assertNever(value: never): never {
    throw new ValidationError({
      code: 'queue/unhandled_status',
      message: `Unhandled JobStatus: ${String(value)}`,
      severity: 'error',
      kind: 'validation',
      retryable: false,
      source: SOURCE,
    });
  }

  private async getDLQStatusInfos(limit: number): Promise<JobStatusInfo[]> {
    if (!this.dlqQueue) {
      return [];
    }

    const jobs = await this.dlqQueue.getJobs(['waiting'], 0, limit - 1);
    return jobs.map((job) => {
      const statusInfo: JobStatusInfo = {
        id: job.id?.toString() ?? '',
        name: job.name,
        status: JobStatus.DLQ,
        progress: typeof job.progress === 'number' ? job.progress : 0,
        data: job.data,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 3,
        createdAt: job.timestamp,
      };
      if (job.processedOn !== undefined) {
        statusInfo.processedAt = job.processedOn;
      }
      if (job.finishedOn !== undefined) {
        statusInfo.completedAt = job.finishedOn;
      }
      return statusInfo;
    });
  }

  /**
   * Get Dead Letter Queue jobs
   */
  public async getDLQJobs(limit = 100): Promise<DLQJobInfo[]> {
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
   * Bulk retry jobs in a given status
   */
  public async bulkRetry(status: JobStatus, limit = 100): Promise<number> {
    const jobs = await this.getJobsByStatus(status, limit);
    let retried = 0;
    for (const job of jobs) {
      await this.retryJob(job.id);
      retried += 1;
    }
    return retried;
  }

  /**
   * Clear the entire queue
   */
  public async clear(): Promise<void> {
    await this.queue.clean(0, 10000);
  }

  /**
   * Pause processing for the queue
   */
  public async pause(): Promise<void> {
    await this.queue.pause();
  }

  /**
   * Resume processing for the queue
   */
  public async resume(): Promise<void> {
    await this.queue.resume();
  }

  /**
   * Drain queue and stop accepting new jobs
   */
  public async drain(): Promise<void> {
    await this.queue.drain();
  }

  /**
   * Register event handler
   */
  public on(event: QueueEvent, handler: JobEventHandler): void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler);
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
      void (async () => {
        try {
          await handler(job, error);
        } catch (error_) {
          logger.error(`Error in ${event} handler`, undefined, error_ instanceof Error ? error_ : undefined);
        }
      })();
    });
  }

  /**
   * Record timing metrics for job execution
   */
  private observeDuration(job: BullJob, metricName: string, startTime: number): void {
    if (!this.metrics) {
      return;
    }

    const duration = Date.now() - startTime;
    this.metrics.observe(metricName, duration, { name: job.name });
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
    latencyMs: number;
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
    const totalPending = waiting + active;
    return { active, completed, failed, delayed, waiting, paused, latencyMs: totalPending };
  }

  /**
   * Simple health check to validate Redis connectivity
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      logger.error('Health check failed', undefined, error instanceof Error ? error : undefined);
      return false;
    }
  }

  /**
   * Close the queue and cleanup resources
   */
  public async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    if (this.dlqQueue) {
      await this.dlqQueue.close();
    }
    await this.queue.close();
    await this.redis.quit();
  }
}
