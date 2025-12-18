/**
 * Job processing orchestrator service
 * Coordinates job processing across multiple concerns (events, metrics, telemetry, retry, etc.)
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';

import type { JobData, JobProcessor } from '../../../shared/types/job.types';
import type { RetryConfig } from '../../../types';
import type { IJob } from '../../interfaces/job.interface';
import type { EventCoordinator } from '../events/event-coordinator';
import type { JobMetricsCollector } from '../metrics/job-metrics-collector';
import type { JobRetryCoordinator } from '../retry/job-retry-coordinator';
import type { JobTelemetryService } from '../telemetry/job-telemetry-service';
import { JobProcessorRegistry } from './job-processor-registry';

/**
 * Orchestrator for job processing
 * Coordinates all aspects of job execution: processing, events, metrics, telemetry, retries
 */
export class JobProcessingOrchestrator {
  private readonly logger: ReturnType<typeof getLogger>;
  private readonly processorRegistry: JobProcessorRegistry;

  constructor(
    private readonly eventCoordinator: EventCoordinator,
    private readonly metricsCollector: JobMetricsCollector,
    private readonly telemetryService: JobTelemetryService,
    private readonly retryCoordinator: JobRetryCoordinator,
    private readonly retryConfig: RetryConfig
  ) {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'job-processing-orchestrator' })
        : baseLogger;

    this.processorRegistry = new JobProcessorRegistry();
  }

  /**
   * Register job processor
   * @param jobName Job name
   * @param processor Processor function
   */
  registerProcessor<T extends JobData, R = unknown>(
    jobName: string,
    processor: JobProcessor<T, R>
  ): void {
    this.processorRegistry.register(jobName, processor);
  }

  /**
   * Process a job through the complete lifecycle
   * @param job The job to process
   * @returns Processing result
   */
  async processJob(job: IJob): Promise<unknown> {
    const span = this.telemetryService.startJobSpan(job);
    const startTime = Date.now();

    try {
      // Emit job started event
      await this.eventCoordinator.emitJobStarted(job);
      this.metricsCollector.recordJobStarted(job);

      this.logger.debug('Starting job processing', {
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade + 1,
      });

      // Get processor for this job
      const processor = this.processorRegistry.get(job.name);
      if (!processor) {
        const error = new Error(`No processor registered for job "${job.name}"`);
        this.logger.error('Processor not found', {
          jobId: job.id,
          jobName: job.name,
        });
        throw error;
      }

      // Execute job processor
      const result = await processor({
        id: job.id,
        name: job.name,
        data: job.data,
        attempts: job.attemptsMade,
        progress: (percentage: number) => {
          job.updateProgress(percentage);
          this.eventCoordinator.emitJobProgress(job).catch((error) => {
            this.logger.error('Error emitting job progress event', {
              error: error instanceof Error ? error.message : String(error),
            });
          });
        },
      });

      // Job completed successfully
      await this.eventCoordinator.emitJobCompleted(job, result);
      this.metricsCollector.recordJobCompleted(job, startTime);

      this.logger.info('Job completed successfully', {
        jobId: job.id,
        jobName: job.name,
        duration: Date.now() - startTime,
      });

      span.end();
      return result;
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      span.recordException(error_);
      span.end();

      this.logger.error('Job processing failed', {
        jobId: job.id,
        jobName: job.name,
        error: error_.message,
        attempt: job.attemptsMade + 1,
      });

      // Handle job failure (retry or DLQ)
      await this.handleJobFailure(job, error_);

      throw error_;
    }
  }

  /**
   * Handle job failure - determine retry or DLQ
   * @param job The failed job
   * @param error The error that caused failure
   */
  private async handleJobFailure(job: IJob, error: Error): Promise<void> {
    try {
      const shouldRetry = await this.retryCoordinator.handleFailure(job, error, this.retryConfig);

      if (shouldRetry) {
        await this.eventCoordinator.emitJobRetrying(job, error);
        this.metricsCollector.recordJobRetry(job);
      } else {
        // Job will be moved to DLQ by caller
        await this.eventCoordinator.emitJobFailed(job, error);
        this.metricsCollector.recordJobFailed(job, Date.now());
      }
    } catch (handlerError) {
      const errorMessage =
        handlerError instanceof Error ? handlerError.message : String(handlerError);
      this.logger.error('Error handling job failure', {
        jobId: job.id,
        jobName: job.name,
        error: errorMessage,
      });
    }
  }

  /**
   * Get processor registry
   * @returns The processor registry
   */
  getProcessorRegistry(): JobProcessorRegistry {
    return this.processorRegistry;
  }

  /**
   * Check if job has a processor
   * @param jobName Job name
   * @returns True if processor exists
   */
  hasProcessor(jobName: string): boolean {
    return this.processorRegistry.has(jobName);
  }

  /**
   * Get all registered job names
   * @returns Array of job names with processors
   */
  getRegisteredJobs(): string[] {
    return this.processorRegistry.getRegisteredJobs();
  }
}
