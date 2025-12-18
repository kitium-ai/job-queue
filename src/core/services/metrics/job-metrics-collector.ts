/**
 * Job metrics collector service for centralized metrics collection
 * Eliminates scattered metrics recording logic from JobQueue class
 */

import { getLogger } from '@kitiumai/logger';

import type { MetricsAdapter } from '../../../types';
import type { IJob } from '../../interfaces/job.interface';

/**
 * Collector for job queue metrics
 * Centralizes all metrics recording logic
 */
export class JobMetricsCollector {
  private readonly logger: ReturnType<typeof getLogger>;

  constructor(private readonly metrics?: MetricsAdapter) {
    this.logger = getLogger();
  }

  /**
   * Record job added metric
   * @param job The job that was added
   */
  recordJobAdded(job: IJob): void {
    try {
      this.metrics?.increment('jobqueue.job.added', 1, { name: job.name });
    } catch (error) {
      this.logger.debug('Error recording job added metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record job started metric
   * @param job The job that started
   */
  recordJobStarted(job: IJob): void {
    try {
      this.metrics?.increment('jobqueue.job.started', 1, { name: job.name });
    } catch (error) {
      this.logger.debug('Error recording job started metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record job completed metric
   * @param job The completed job
   * @param startTime Job start time in milliseconds
   */
  recordJobCompleted(job: IJob, startTime: number): void {
    try {
      const duration = Date.now() - startTime;
      this.metrics?.increment('jobqueue.job.completed', 1, { name: job.name });
      this.metrics?.observe('jobqueue.job.duration', duration, { name: job.name });
    } catch (error) {
      this.logger.debug('Error recording job completed metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record job failed metric
   * @param job The failed job
   * @param startTime Job start time in milliseconds
   */
  recordJobFailed(job: IJob, startTime: number): void {
    try {
      const duration = Date.now() - startTime;
      this.metrics?.increment('jobqueue.job.failed', 1, { name: job.name });
      this.metrics?.observe('jobqueue.job.duration', duration, { name: job.name });
    } catch (error) {
      this.logger.debug('Error recording job failed metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record job retry metric
   * @param job The job being retried
   */
  recordJobRetry(job: IJob): void {
    try {
      this.metrics?.increment('jobqueue.job.retried', 1, { name: job.name });
    } catch (error) {
      this.logger.debug('Error recording job retry metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record job stalled metric
   * @param job The stalled job
   */
  recordJobStalled(job: IJob): void {
    try {
      this.metrics?.increment('jobqueue.job.stalled', 1, { name: job.name });
    } catch (error) {
      this.logger.debug('Error recording job stalled metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record job moved to DLQ metric
   * @param job The job moved to DLQ
   */
  recordJobDLQ(job: IJob): void {
    try {
      this.metrics?.increment('jobqueue.job.dlq', 1, { name: job.name });
    } catch (error) {
      this.logger.debug('Error recording job DLQ metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record queue operation metric (generic)
   * @param operation Operation name
   * @param value Value to record (default 1)
   * @param tags Optional tags
   */
  recordOperation(operation: string, value = 1, tags?: Record<string, string>): void {
    try {
      this.metrics?.increment(`jobqueue.operation.${operation}`, value, tags);
    } catch (error) {
      this.logger.debug('Error recording operation metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record queue metric observation
   * @param metric Metric name
   * @param value Value to observe
   * @param tags Optional tags
   */
  recordObservation(metric: string, value: number, tags?: Record<string, string>): void {
    try {
      this.metrics?.observe(`jobqueue.${metric}`, value, tags);
    } catch (error) {
      this.logger.debug('Error recording observation metric', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if metrics are enabled
   * @returns True if metrics adapter is configured
   */
  isEnabled(): boolean {
    return this.metrics !== undefined;
  }
}
