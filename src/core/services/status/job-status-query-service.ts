/**
 * Job status query service
 * Provides unified interface for querying job status information
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';

import { JobStatus, type JobStatusInfo } from '../../../types';
import type { JobStatusFactory } from '../../factories/job-status.factory';
import type { IJob } from '../../interfaces/job.interface';
import type { IQueueClient } from '../../interfaces/queue-client.interface';
import type { DLQManager } from '../dlq/dlq-manager';

/**
 * Service for querying job status information
 */
export class JobStatusQueryService {
  private readonly logger: ReturnType<typeof getLogger>;

  constructor(
    private readonly queueClient: IQueueClient,
    private readonly statusFactory: JobStatusFactory,
    private readonly dlqManager: DLQManager
  ) {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'job-status-query-service' })
        : baseLogger;
  }

  /**
   * Get detailed status information for a job
   * @param jobId Job ID
   * @returns JobStatusInfo or null if not found
   */
  async getJobStatus(jobId: string): Promise<JobStatusInfo | null> {
    try {
      const job = await this.queueClient.getJob(jobId);
      if (!job) {
        this.logger.debug('Job not found', { jobId });
        return null;
      }

      return this.statusFactory.createStatusInfo(job);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error getting job status', { jobId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Get jobs by status
   * @param status Job status
   * @param limit Maximum number of jobs to retrieve
   * @returns Array of JobStatusInfo
   */
  async getJobsByStatus(status: JobStatus, limit = 100): Promise<JobStatusInfo[]> {
    try {
      let jobs: IJob[] = [];

      // Handle DLQ separately
      if (status === JobStatus.DLQ) {
        const dlqJobs = await this.dlqManager.getDLQJobs(limit);
        return dlqJobs.map((dlqJob) => ({
          id: dlqJob.id ?? '',
          name: dlqJob.name,
          status: JobStatus.DLQ,
          progress: 0,
          data: dlqJob.data,
          attempts: dlqJob.attempts,
          maxAttempts: 0,
          createdAt: dlqJob.createdAt,
        }));
      }

      // Map JobStatus to queue states
      const states = this.mapStatusToStates(status);

      for (const state of states) {
        const stateJobs = await this.queueClient.getJobsByState(state, 0, limit - 1);
        jobs = jobs.concat(stateJobs);
        if (jobs.length >= limit) {
          break;
        }
      }

      return this.statusFactory.createStatusInfos(jobs.slice(0, limit));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error getting jobs by status', { status, error: errorMessage });
      throw error;
    }
  }

  /**
   * Get count of jobs by status
   * @param status Job status
   * @returns Count of jobs with that status
   */
  async getCountByStatus(status: JobStatus): Promise<number> {
    try {
      let count = 0;

      // Handle DLQ separately
      if (status === JobStatus.DLQ) {
        return this.dlqManager.getDLQCount();
      }

      // Map JobStatus to queue states and get count
      const states = this.mapStatusToStates(status);

      for (const state of states) {
        count += await this.queueClient.getCountByState(state);
      }

      return count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error getting job count', { status, error: errorMessage });
      return 0;
    }
  }

  /**
   * Get all jobs in queue
   * @param limit Maximum number of jobs to retrieve
   * @returns Array of all JobStatusInfo
   */
  async getAllJobs(limit = 100): Promise<JobStatusInfo[]> {
    try {
      const statuses: JobStatus[] = [
        JobStatus.PENDING,
        JobStatus.ACTIVE,
        JobStatus.COMPLETED,
        JobStatus.FAILED,
        JobStatus.DELAYED,
        JobStatus.WAITING,
      ];

      let allJobs: JobStatusInfo[] = [];

      for (const status of statuses) {
        const jobs = await this.getJobsByStatus(status, limit - allJobs.length);
        allJobs = allJobs.concat(jobs);
        if (allJobs.length >= limit) {
          break;
        }
      }

      return allJobs.slice(0, limit);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error getting all jobs', { error: errorMessage });
      return [];
    }
  }

  /**
   * Get job counts grouped by status
   * @returns Object with status as key and count as value
   */
  async getStatusCounts(): Promise<Record<JobStatus, number>> {
    try {
      const statuses: JobStatus[] = [
        JobStatus.PENDING,
        JobStatus.ACTIVE,
        JobStatus.COMPLETED,
        JobStatus.FAILED,
        JobStatus.DELAYED,
        JobStatus.WAITING,
        JobStatus.PAUSED,
        JobStatus.DLQ,
      ];

      const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
        JobStatus,
        number
      >;

      for (const status of statuses) {
        counts[status] = await this.getCountByStatus(status);
      }

      return counts;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error getting status counts', { error: errorMessage });
      return {} as Record<JobStatus, number>;
    }
  }

  /**
   * Map JobStatus enum to queue state strings
   * @param status JobStatus value
   * @returns Array of queue state strings
   */
  private mapStatusToStates(status: JobStatus): string[] {
    switch (status) {
      case JobStatus.DLQ:
        return [];
      case JobStatus.COMPLETED:
        return ['completed'];
      case JobStatus.FAILED:
        return ['failed'];
      case JobStatus.ACTIVE:
        return ['active'];
      case JobStatus.WAITING:
        return ['waiting'];
      case JobStatus.PAUSED:
        return ['paused'];
      case JobStatus.DELAYED:
        return ['delayed'];
      case JobStatus.PENDING:
        return ['waiting'];
      default:
        return [];
    }
  }
}
