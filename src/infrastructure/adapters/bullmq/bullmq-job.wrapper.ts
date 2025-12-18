/**
 * BullMQ job wrapper implementation of IJob interface
 * Wraps BullMQ Job to provide standardized interface
 */

import type { Job as BullJob } from 'bullmq';

import type { IJob } from '../../../core/interfaces/job.interface';
import type { JobData } from '../../../shared/types/job.types';
import type { JobOptions } from '../../../types';

/**
 * Wrapper for BullMQ Job providing standardized IJob interface
 */
export class BullMQJobWrapper implements IJob {
  constructor(private readonly bullJob: BullJob<JobData>) {}

  get id(): string {
    return this.bullJob.id ?? '';
  }

  get name(): string {
    return this.bullJob.name;
  }

  get data(): JobData {
    return this.bullJob.data;
  }

  get attemptsMade(): number {
    return this.bullJob.attemptsMade;
  }

  get timestamp(): number {
    return this.bullJob.timestamp;
  }

  get processedOn(): number | undefined {
    return this.bullJob.processedOn;
  }

  get finishedOn(): number | undefined {
    return this.bullJob.finishedOn;
  }

  get state(): string {
    // BullMQ doesn't directly expose state, we need to infer from other properties
    if (this.bullJob.finishedOn) {
      return this.bullJob.failedReason ? 'failed' : 'completed';
    }
    if (this.bullJob.processedOn) {
      return 'active';
    }
    if (this.bullJob.delay) {
      return 'delayed';
    }
    return 'waiting';
  }

  get opts(): JobOptions {
    return this.bullJob.opts as unknown as JobOptions;
  }

  /**
   * Get current job progress (0-100)
   */
  getProgress(): number {
    return typeof this.bullJob.progress === 'number' ? this.bullJob.progress : 0;
  }

  /**
   * Update job progress
   * @param percentage Progress percentage (0-100)
   */
  updateProgress(percentage: number): void {
    void this.bullJob.updateProgress(percentage);
  }

  /**
   * Retry job with optional delay
   * @param _delay Delay in milliseconds before retry
   */
  async retry(_delay?: number): Promise<void> {
    // BullMQ handles retry internally through the queue
    // This is called when manually retrying
    await this.bullJob.retry();
  }

  /**
   * Mark job as failed
   * @param _error Error that caused the failure
   */
  fail(_error: Error): Promise<void> {
    this.bullJob.discard();
    return Promise.resolve();
  }

  /**
   * Mark job as completed
   * @param result Job result
   */
  async complete(result?: unknown): Promise<void> {
    await this.bullJob.moveToCompleted(result ?? null, '', false);
  }

  /**
   * Update job data
   * @param data New job data
   */
  async update(data: JobData): Promise<void> {
    this.bullJob.data = { ...this.bullJob.data, ...data };
    await this.bullJob.updateData(this.bullJob.data);
  }

  /**
   * Get job log entries
   * @param start Start index
   * @param end End index
   * @param asc Sort ascending
   */
  getLogs(_start?: number, _end?: number, _asc?: boolean): Promise<string[]> {
    // BullMQ doesn't have a logs method that returns structured log objects
    // We'll return an empty array for now
    return Promise.resolve([]);
  }

  /**
   * Add log entry
   * @param log Log message
   */
  async log(log: string): Promise<void> {
    await this.bullJob.log(log);
  }

  /**
   * Get wrapped BullMQ job
   * @returns The underlying BullMQ job
   */
  getUnderlyingJob(): BullJob<JobData> {
    return this.bullJob;
  }
}
