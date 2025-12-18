/**
 * BullMQ-specific job state mapper
 * Translates between BullMQ states and standardized JobStatus values
 */

import { getLogger } from '@kitiumai/logger';

import type { IJobStateMapper } from '../../../core/interfaces/job-state-mapper.interface';
import { JobStatus } from '../../../types';

/**
 * Mapper for BullMQ job states to standardized JobStatus
 */
export class BullMQStateMapper implements IJobStateMapper {
  private readonly logger: ReturnType<typeof getLogger>;

  constructor() {
    this.logger = getLogger();
  }

  /**
   * Convert BullMQ state string to JobStatus enum
   * @param state BullMQ state string
   * @returns Corresponding JobStatus
   */
  toJobStatus(state: string): Promise<JobStatus> {
    switch (state) {
      case 'completed':
        return Promise.resolve(JobStatus.COMPLETED);
      case 'failed':
        return Promise.resolve(JobStatus.FAILED);
      case 'active':
        return Promise.resolve(JobStatus.ACTIVE);
      case 'waiting':
        return Promise.resolve(JobStatus.WAITING);
      case 'paused':
        return Promise.resolve(JobStatus.PAUSED);
      case 'delayed':
        return Promise.resolve(JobStatus.DELAYED);
      case 'pending':
        return Promise.resolve(JobStatus.PENDING);
      default:
        this.logger.warn('Unknown BullMQ state', { state });
        return Promise.resolve(JobStatus.PENDING);
    }
  }

  /**
   * Convert JobStatus to BullMQ state strings
   * @param status JobStatus enum value
   * @returns Array of BullMQ state strings that match the status
   */
  toBullMQStates(status: Exclude<JobStatus, JobStatus.DLQ>): string[] {
    switch (status) {
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
        return ['waiting']; // BullMQ considers pending as waiting
      default:
        this.logger.warn('Unknown JobStatus', { status });
        return ['waiting'];
    }
  }

  /**
   * Get all supported BullMQ states
   * @returns Array of all state strings
   */
  getAllStates(): string[] {
    return ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused', 'pending'];
  }
}
