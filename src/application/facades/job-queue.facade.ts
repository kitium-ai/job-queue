/**
 * Job Queue Facade - Backward Compatibility Layer
 *
 * @deprecated Use individual services from DI container instead.
 * This facade will be removed in v2.0.0
 *
 * Migration guide:
 * - Instead of: const queue = new JobQueue(config)
 * - Use: const container = new DIContainer(); registerJobQueueBindings(container, config);
 * - Then resolve individual services: container.resolve('JobProcessingOrchestrator')
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';

import type { QueueConnectionManager } from '../../core/services/connection/queue-connection-manager';
import type { DLQManager } from '../../core/services/dlq/dlq-manager';
import type { EventCoordinator } from '../../core/services/events/event-coordinator';
import type { JobProcessingOrchestrator } from '../../core/services/processing/job-processing-orchestrator';
import type { JobStatusQueryService } from '../../core/services/status/job-status-query-service';
import type { JobData } from '../../shared/types/job.types';
import type {
  DLQJobInfo,
  JobEventHandler,
  JobOptions,
  JobProcessor,
  JobStatus,  JobStatusInfo,
  QueueConfig,
  QueueEvent } from '../../types';
import { DIContainer, registerJobQueueBindings } from '../di/index';

const SOURCE = '@kitiumai/job-queue';

/**
 * Backward compatibility facade for the legacy JobQueue API
 * Delegates to new modular services through dependency injection
 *
 * @deprecated Use services from DIContainer instead
 */
export class JobQueueFacade {
  private readonly logger: ReturnType<typeof getLogger>;
  private readonly container: DIContainer;
  private readonly config: QueueConfig;

  // Service references
  private eventCoordinator!: EventCoordinator;
  private processingOrchestrator!: JobProcessingOrchestrator;
  private statusQueryService!: JobStatusQueryService;
  private dlqManager!: DLQManager;
  private connectionManager!: QueueConnectionManager;

  constructor(config: QueueConfig) {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'job-queue-facade' })
        : baseLogger;

    this.config = config;
    this.container = new DIContainer();

    // Register all services
    registerJobQueueBindings(this.container, config);

    // Initialize service references
    this.initializeServices();

    this.logger.warn('JobQueue is deprecated and will be removed in v2.0.0. Use services from DIContainer instead.', {
      source: SOURCE,
    });
  }

  /**
   * Initialize all service references
   */
  private initializeServices(): void {
    this.eventCoordinator = this.container.resolve('EventCoordinator');
    this.processingOrchestrator = this.container.resolve('JobProcessingOrchestrator');
    this.statusQueryService = this.container.resolve('JobStatusQueryService');
    this.dlqManager = this.container.resolve('DLQManager');
    this.connectionManager = this.container.resolve('QueueConnectionManager');
  }

  /**
   * Connect to the queue
   */
  async connect(): Promise<void> {
    try {
      await this.connectionManager.connect(this.config);
      this.logger.info('Queue connected', { queue: this.config.name });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to connect to queue', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Register a job processor
   * @param jobName Name of the job type
   * @param processor Processor function
   */
  registerProcessor<T extends JobData = JobData, R = unknown>(jobName: string, processor: JobProcessor<T, R>): void {
    this.processingOrchestrator.registerProcessor(jobName, processor);
  }

  /**
   * Add a job to the queue
   * @param jobName Name of the job
   * @param data Job data
   * @param options Job options
   * @returns Job ID
   */
  async addJob<T extends JobData = JobData>(jobName: string, data: T, options?: JobOptions): Promise<string> {
    try {
      const jobId = await this.connectionManager.addJob(jobName, data, options);
      this.logger.debug('Job added', { jobId, jobName });
      return jobId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to add job', { jobName, error: errorMessage });
      throw error;
    }
  }

  /**
   * Schedule a job to run at a specific time
   * @param jobName Name of the job
   * @param data Job data
   * @param timestamp Unix timestamp in milliseconds
   * @param options Job options
   * @returns Job ID
   */
  scheduleJob<T extends JobData = JobData>(
    jobName: string,
    data: T,
    timestamp: number,
    options?: JobOptions
  ): Promise<string> {
    const delay = Math.max(0, timestamp - Date.now());
    return this.addJob(jobName, data, { ...options, delay });
  }

  /**
   * Schedule a job to repeat at intervals
   * @param jobName Name of the job
   * @param data Job data
   * @param intervalMs Interval in milliseconds
   * @param options Job options
   * @returns Job ID
   */
  scheduleEvery<T extends JobData = JobData>(
    jobName: string,
    data: T,
    intervalMs: number,
    options?: JobOptions
  ): Promise<string> {
    return this.addJob(jobName, data, {
      ...options,
      repeat: { every: intervalMs },
    });
  }

  /**
   * Get status of a job
   * @param jobId Job ID
   * @returns Job status information
   */
  async getJobStatus(jobId: string): Promise<JobStatusInfo | null> {
    try {
      return await this.statusQueryService.getJobStatus(jobId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get job status', { jobId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Get jobs by status
   * @param status Job status to filter
   * @param limit Maximum number of jobs to return
   * @returns Array of job status information
   */
  async getJobsByStatus(status: JobStatus, limit = 100): Promise<JobStatusInfo[]> {
    try {
      return await this.statusQueryService.getJobsByStatus(status, limit);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get jobs by status', { status, error: errorMessage });
      throw error;
    }
  }

  /**
   * Get DLQ jobs
   * @param limit Maximum number of jobs to return
   * @returns Array of DLQ job information
   */
  async getDLQJobs(limit = 100): Promise<DLQJobInfo[]> {
    try {
      return await this.dlqManager.getDLQJobs(limit);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get DLQ jobs', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Replay jobs from DLQ
   * @param limit Maximum number of jobs to replay
   * @returns Number of jobs replayed
   */
  async replayDLQ(limit = 100): Promise<number> {
    try {
      return await this.dlqManager.replayDLQ(limit);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to replay DLQ', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    try {
      await this.connectionManager.pause();
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
    try {
      await this.connectionManager.resume();
      this.logger.info('Queue resumed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to resume queue', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Check if queue is paused
   */
  async isPaused(): Promise<boolean> {
    try {
      return await this.connectionManager.isPaused();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to check if queue is paused', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Register an event handler
   * @param event Queue event
   * @param handler Event handler function
   */
  on(event: QueueEvent, handler: JobEventHandler): void {
    this.eventCoordinator.on(event, handler);
  }

  /**
   * Remove an event handler
   * @param event Queue event
   * @param handler Event handler function
   */
  off(event: QueueEvent, handler: JobEventHandler): void {
    this.eventCoordinator.off(event, handler);
  }

  /**
   * Health check - verify queue is operational
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await this.connectionManager.healthCheck();
    } catch (error) {
      this.logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Close queue and clean up resources
   */
  async close(): Promise<void> {
    try {
      await this.connectionManager.disconnect();
      this.logger.info('Queue closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error closing queue', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Get the underlying DI container
   * For advanced use cases
   */
  getContainer(): DIContainer {
    return this.container;
  }
}
