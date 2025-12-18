/**
 * FIFO queue manager for ordered job processing
 */

import { ValidationError } from '@kitiumai/error';
import { getLogger } from '@kitiumai/logger';
import type { Queue } from 'bullmq';

import type { IFIFOQueueManager, MessageGroupConfig } from '../../core/interfaces/fifo-queue.interface';
import type { JobData } from '../../shared/types/job.types';

const logger = getLogger();
const SOURCE = '@kitiumai/job-queue/fifo-queue-manager';

/**
 * Implementation of FIFO queue manager for ordered job processing
 * Groups jobs by messageGroupId to ensure sequential processing
 */
export class FIFOQueueManager implements IFIFOQueueManager {
  private readonly queues: Map<string, Queue> = new Map();
  private readonly groupStates: Map<string, { paused: boolean; concurrency: number }> = new Map();

  constructor(private readonly defaultConcurrencyPerGroup = 1) {}

  /**
   * Add job to FIFO queue with group ordering
   */
  async addToGroup<T extends JobData>(
    jobName: string,
    data: T,
    groupConfig: MessageGroupConfig,
    options?: Record<string, unknown>
  ): Promise<string> {
    try {
      // Validate group ID
      if (!groupConfig.groupId || groupConfig.groupId.trim().length === 0) {
        throw new ValidationError({
          code: 'fifo/invalid_group_id',
          message: 'Message group ID is required for FIFO queue',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      // Get or create group queue
      let groupQueue = this.queues.get(groupConfig.groupId);
      if (!groupQueue) {
        this.initializeGroup(groupConfig.groupId);
        groupQueue = this.queues.get(groupConfig.groupId);
        if (!groupQueue) {
          throw new Error('Failed to initialize group queue');
        }
      }

      // Add job with group ID for ordering
      const jobOptions: Record<string, unknown> = {
        ...(options ?? {}),
        group: groupConfig.groupId,
      };

      // Use deduplication ID if provided for exactly-once semantics
      if (groupConfig.deduplicationId) {
        jobOptions['jobId'] = `${groupConfig.groupId}:${groupConfig.deduplicationId}`;
      }

      const job = await groupQueue.add(jobName, data, jobOptions as Parameters<typeof groupQueue.add>[2]);

      logger.debug(`Added job to FIFO group: ${groupConfig.groupId}`, {
        source: SOURCE,
        jobId: job.id,
        jobName,
      });

      return job.id?.toString() ?? '';
    } catch (error) {
      logger.error(
        `Failed to add job to FIFO group: ${groupConfig.groupId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get jobs in a message group
   */
  async getGroupJobs(groupId: string, limit = 100): Promise<Array<{ id: string; data: JobData }>> {
    try {
      const groupQueue = this.queues.get(groupId);
      if (!groupQueue) {
        return [];
      }

      const jobs = await groupQueue.getJobs(['waiting', 'active'], 0, limit - 1);
      return jobs.map((job) => ({
        id: job.id?.toString() ?? '',
        data: job.data,
      }));
    } catch (error) {
      logger.error(
        `Failed to get jobs for group: ${groupId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Get all message groups
   */
  listGroups(): Promise<string[]> {
    return Promise.resolve(Array.from(this.queues.keys()));
  }

  /**
   * Get group processing stats
   */
  async getGroupStats(groupId: string): Promise<{
    total: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    try {
      const groupQueue = this.getGroupQueueOrThrow(groupId);

      const [waiting, active, completed, failed] = await Promise.all([
        groupQueue.getWaitingCount(),
        groupQueue.getActiveCount(),
        groupQueue.getCompletedCount(),
        groupQueue.getFailedCount(),
      ]);

      return {
        total: waiting + active + completed + failed,
        waiting,
        active,
        completed,
        failed,
      };
    } catch (error) {
      logger.error(
        `Failed to get stats for group: ${groupId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Drain all jobs in a group
   */
  async drainGroup(groupId: string): Promise<number> {
    try {
      const groupQueue = this.queues.get(groupId);
      if (!groupQueue) {
        return 0;
      }

      const jobs = await this.getGroupJobs(groupId, 10000);
      let drained = 0;

      for (const job of jobs) {
        const bullJob = await groupQueue.getJob(job.id);
        if (!bullJob) {
          continue;
        }
        await bullJob.remove();
        drained += 1;
      }

      logger.debug(`Drained ${drained} jobs from group: ${groupId}`, { source: SOURCE });
      return drained;
    } catch (error) {
      logger.error(
        `Failed to drain group: ${groupId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Pause group processing
   */
  async pauseGroup(groupId: string): Promise<void> {
    try {
      const groupQueue = this.getGroupQueueOrThrow(groupId);

      await groupQueue.pause();

      const state = this.groupStates.get(groupId) ?? { paused: false, concurrency: this.defaultConcurrencyPerGroup };
      this.groupStates.set(groupId, { ...state, paused: true });

      logger.debug(`Paused group: ${groupId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to pause group: ${groupId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Resume group processing
   */
  async resumeGroup(groupId: string): Promise<void> {
    try {
      const groupQueue = this.getGroupQueueOrThrow(groupId);

      await groupQueue.resume();

      const state = this.groupStates.get(groupId) ?? { paused: false, concurrency: this.defaultConcurrencyPerGroup };
      this.groupStates.set(groupId, { ...state, paused: false });

      logger.debug(`Resumed group: ${groupId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to resume group: ${groupId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Initialize a message group (internal)
   */
  private getGroupQueueOrThrow(groupId: string): Queue {
    const groupQueue = this.queues.get(groupId);
    if (groupQueue) {
      return groupQueue;
    }

    throw new ValidationError({
      code: 'fifo/group_not_found',
      message: `Group ${groupId} not found`,
      severity: 'error',
      kind: 'validation',
      retryable: false,
      source: SOURCE,
    });
  }

  private initializeGroup(groupId: string): void {
    // Store group state
    this.groupStates.set(groupId, {
      paused: false,
      concurrency: this.defaultConcurrencyPerGroup,
    });

    logger.debug(`Initialized FIFO group: ${groupId}`, { source: SOURCE });
  }
}
