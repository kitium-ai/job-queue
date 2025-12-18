/**
 * Job status factory for consistent job status information creation
 * Eliminates duplication of job status building logic
 */

import type { JobStatusInfo } from '../../types';
import type { IJob } from '../interfaces/job.interface';
import type { IJobStateMapper } from '../interfaces/job-state-mapper.interface';

/**
 * Factory for creating JobStatusInfo objects from job instances
 * Consolidates all job status building logic in one place
 */
export class JobStatusFactory {
  constructor(private readonly stateMapper: IJobStateMapper) {}

  /**
   * Create JobStatusInfo from a job instance
   * @param job The job to convert
   * @returns JobStatusInfo object
   */
  async createStatusInfo(job: IJob): Promise<JobStatusInfo> {
    const statusInfo: JobStatusInfo = {
      id: job.id?.toString() ?? '',
      name: job.name,
      status: await this.stateMapper.toJobStatus(job.state),
      progress: job.getProgress(),
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

  /**
   * Create JobStatusInfo objects from multiple jobs
   * @param jobs Array of jobs
   * @returns Array of JobStatusInfo objects
   */
  async createStatusInfos(jobs: IJob[]): Promise<JobStatusInfo[]> {
    return Promise.all(jobs.map((job) => this.createStatusInfo(job)));
  }
}
