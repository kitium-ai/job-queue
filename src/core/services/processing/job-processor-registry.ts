/**
 * Job processor registry service
 * Manages registration and retrieval of job processors
 */

import { ValidationError } from '@kitiumai/error';
import { getLogger } from '@kitiumai/logger';

import type { JobData, JobProcessor } from '../../../shared/types/job.types';

const SOURCE = '@kitiumai/job-queue';

/**
 * Registry for managing job processors
 */
export class JobProcessorRegistry {
  private readonly processors = new Map<string, JobProcessor<any, any>>();
  private readonly logger: ReturnType<typeof getLogger>;

  constructor() {
    this.logger = getLogger();
  }

  /**
   * Register a job processor
   * @param jobName Job name
   * @param processor Processor function
   */
  register<T extends JobData, R = unknown>(jobName: string, processor: JobProcessor<T, R>): void {
    if (this.processors.has(jobName)) {
      const error = new ValidationError({
        code: 'queue/processor_exists',
        message: `Processor for job "${jobName}" already registered`,
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
      this.logger.error('Duplicate processor registration attempt', { jobName }, error);
      throw error;
    }

    this.processors.set(jobName, processor);
    this.logger.debug('Job processor registered', { jobName });
  }

  /**
   * Get processor for a job
   * @param jobName Job name
   * @returns Processor function or undefined
   */
  get<T extends JobData, R = unknown>(jobName: string): JobProcessor<T, R> | undefined {
    return this.processors.get(jobName);
  }

  /**
   * Check if processor is registered
   * @param jobName Job name
   * @returns True if processor exists
   */
  has(jobName: string): boolean {
    return this.processors.has(jobName);
  }

  /**
   * Unregister processor
   * @param jobName Job name
   * @returns True if processor was removed
   */
  unregister(jobName: string): boolean {
    const removed = this.processors.delete(jobName);
    if (removed) {
      this.logger.debug('Job processor unregistered', { jobName });
    }
    return removed;
  }

  /**
   * Get all registered job names
   * @returns Array of job names
   */
  getRegisteredJobs(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * Get count of registered processors
   * @returns Number of processors
   */
  getCount(): number {
    return this.processors.size;
  }

  /**
   * Clear all processors
   */
  clear(): void {
    this.processors.clear();
    this.logger.debug('All job processors cleared');
  }
}
