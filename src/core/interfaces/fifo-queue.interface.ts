/**
 * FIFO queue interface for ordered job processing
 */

import type { JobData } from '../../shared/types/job.types';

/**
 * Message group configuration for FIFO ordering
 */
export type MessageGroupConfig = {
  /**
   * Group ID for ordering - jobs in same group processed in order
   */
  groupId: string;

  /**
   * Optional deduplication ID for message groups
   */
  deduplicationId?: string;

  /**
   * If true, ignore ordering within group (process in parallel)
   */
  unordered?: boolean;
}

/**
 * FIFO queue configuration
 */
export type FIFOQueueConfig = {
  /**
   * Enable FIFO ordering
   */
  enabled: boolean;

  /**
   * Default message group if not specified per job
   */
  defaultGroupId?: string;

  /**
   * Enable high throughput mode
   */
  highThroughput?: boolean;

  /**
   * Max concurrent processing per group
   */
  concurrencyPerGroup?: number;
}

/**
 * Interface for FIFO queue operations
 */
export type IFIFOQueueManager = {
  /**
   * Add job to FIFO queue with group ordering
   */
  addToGroup<T extends JobData>(
    jobName: string,
    data: T,
    groupConfig: MessageGroupConfig,
    options?: Record<string, unknown>
  ): Promise<string>;

  /**
   * Get jobs in a message group
   */
  getGroupJobs(groupId: string, limit?: number): Promise<Array<{ id: string; data: JobData }>>;

  /**
   * Get all message groups
   */
  listGroups(): Promise<string[]>;

  /**
   * Get group processing stats
   */
  getGroupStats(groupId: string): Promise<{
    total: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }>;

  /**
   * Drain all jobs in a group
   */
  drainGroup(groupId: string): Promise<number>;

  /**
   * Pause group processing
   */
  pauseGroup(groupId: string): Promise<void>;

  /**
   * Resume group processing
   */
  resumeGroup(groupId: string): Promise<void>;
}
