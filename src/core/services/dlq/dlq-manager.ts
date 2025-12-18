/**
 * Dead Letter Queue (DLQ) manager service
 * Manages jobs that have failed and should not be retried
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';

import type { DLQConfig, DLQJobInfo, JobOptions } from '../../../types';
import type { IJob } from '../../interfaces/job.interface';
import type { IQueueClient } from '../../interfaces/queue-client.interface';
import type { EventCoordinator } from '../events/event-coordinator';
import type { JobMetricsCollector } from '../metrics/job-metrics-collector';

/**
 * Manager for Dead Letter Queue operations
 */
export class DLQManager {
  private readonly logger: ReturnType<typeof getLogger>;

  constructor(
    private readonly primaryQueue: IQueueClient,
    private readonly eventCoordinator: EventCoordinator,
    private readonly metricsCollector: JobMetricsCollector,
    private readonly dlqConfig?: DLQConfig
  ) {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'dlq-manager' })
        : baseLogger;
  }

  /**
   * Check if DLQ is enabled
   * @returns True if DLQ is enabled
   */
  isEnabled(): boolean {
    return this.dlqConfig?.enabled === true;
  }

  /**
   * Move job to DLQ
   * @param job The failed job
   * @param error The error that caused failure
   */
  async moveJobToDLQ(job: IJob, error: Error): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug('DLQ is disabled, skipping move');
      return;
    }

    try {
      this.logger.warn('Moving job to DLQ', {
        jobId: job.id,
        jobName: job.name,
        error: error.message,
        attempts: job.attemptsMade,
      });

      // Record DLQ metric
      this.metricsCollector.recordJobDLQ(job);

      // Emit DLQ event
      await this.eventCoordinator.emitJobDLQ(job, error);

      // Call optional notification handler
      if (this.dlqConfig?.notificationHandler) {
        try {
          const dlqJobInfo: DLQJobInfo = {
            id: job.id,
            name: job.name,
            data: job.data,
            attempts: job.attemptsMade,
            createdAt: job.timestamp,
          };
          await this.dlqConfig.notificationHandler(dlqJobInfo);
        } catch (handlerError) {
          const errorMessage =
            handlerError instanceof Error ? handlerError.message : String(handlerError);
          this.logger.error('Error in DLQ notification handler', {
            jobId: job.id,
            error: errorMessage,
          });
        }
      }
    } catch (error_) {
      const errorMessage = error_ instanceof Error ? error_.message : String(error_);
      this.logger.error('Error moving job to DLQ', {
        jobId: job.id,
        jobName: job.name,
        error: errorMessage,
      });
    }
  }

  /**
   * Get DLQ jobs
   * @param limit Maximum number of jobs to retrieve
   * @returns Array of DLQ job info
   */
  async getDLQJobs(limit = 100): Promise<DLQJobInfo[]> {
    if (!this.isEnabled()) {
      return [];
    }

    try {
      // Get failed jobs from primary queue as DLQ representation
      const jobs = await this.primaryQueue.getJobsByState('failed', 0, limit - 1);

      return jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        attempts: job.attemptsMade,
        createdAt: job.timestamp,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error getting DLQ jobs', { error: errorMessage });
      return [];
    }
  }

  /**
   * Get DLQ job count
   * @returns Number of jobs in DLQ
   */
  async getDLQCount(): Promise<number> {
    if (!this.isEnabled()) {
      return 0;
    }

    try {
      return await this.primaryQueue.getCountByState('failed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error getting DLQ count', { error: errorMessage });
      return 0;
    }
  }

  /**
   * Replay a job from DLQ back to the main queue
   * @param jobId Job ID
   * @param options Optional job options for replay
   * @returns True if successful
   */
  async replayJob(jobId: string, options?: JobOptions): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.warn('DLQ is disabled, cannot replay job');
      return false;
    }

    try {
      const job = await this.primaryQueue.getJob(jobId);
      if (!job) {
        this.logger.error('Job not found for replay', { jobId });
        return false;
      }

      this.logger.info('Replaying job from DLQ', { jobId, jobName: job.name });

      // Add job back to queue
      const newJobId = await this.primaryQueue.addJob(job.name, job.data, options);

      // Remove from DLQ (by removing the failed job)
      await this.primaryQueue.clean(0, 1, 'failed');

      this.logger.info('Job replayed successfully', { originalJobId: jobId, newJobId });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error replaying job from DLQ', { jobId, error: errorMessage });
      return false;
    }
  }

  /**
   * Replay multiple DLQ jobs
   * @param limit Maximum number of jobs to replay
   * @returns Number of jobs replayed
   */
  async replayDLQ(limit = 100): Promise<number> {
    if (!this.isEnabled()) {
      this.logger.warn('DLQ is disabled, cannot replay jobs');
      return 0;
    }

    try {
      const dlqJobs = await this.getDLQJobs(limit);

      let replayed = 0;
      for (const dlqJob of dlqJobs) {
        const success = await this.replayJob(dlqJob.id ?? '');
        if (success) {
          replayed++;
        }
      }

      this.logger.info('DLQ replay completed', { total: dlqJobs.length, replayed });
      return replayed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error replaying DLQ', { error: errorMessage });
      return 0;
    }
  }

  /**
   * Clear DLQ
   * @returns Number of jobs cleared
   */
  async clearDLQ(): Promise<number> {
    if (!this.isEnabled()) {
      return 0;
    }

    try {
      const count = await this.getDLQCount();

      // Clean failed jobs (which represent DLQ)
      await this.primaryQueue.clean(0, count, 'failed');

      this.logger.info('DLQ cleared', { count });
      return count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error clearing DLQ', { error: errorMessage });
      return 0;
    }
  }

  /**
   * Get DLQ configuration
   * @returns DLQ configuration or undefined
   */
  getConfig(): DLQConfig | undefined {
    return this.dlqConfig;
  }
}
