/**
 * Job state mapper interface for translating between queue-specific and standardized job states
 */

import type { JobStatus } from '../../types';

/**
 * Job state mapper interface for state translation
 */
export type IJobStateMapper = {
  /**
   * Convert queue-specific state to standardized JobStatus
   * @param state Queue-specific state string
   * @returns Standardized JobStatus
   */
  toJobStatus(state: string): Promise<JobStatus>;

  /**
   * Convert standardized JobStatus to queue-specific states
   * @param status JobStatus enum value
   * @returns Array of queue-specific state strings
   */
  toBullMQStates(status: Exclude<JobStatus, JobStatus.DLQ>): string[];

  /**
   * Get all supported states
   * @returns Array of all supported state names
   */
  getAllStates(): string[];
}
