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
      await this.onJobStarted(job);
      const processor = this.getProcessorOrThrow(job);
      const result = await this.executeProcessor(job, processor);
      await this.onJobCompleted(job, result, startTime);
      span.end();
      return result;
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      span.recordException(error_);
      span.end();
      await this.onJobFailed(job, error_);
      throw error_;
    }
  }

  private async onJobStarted(job: IJob): Promise<void> {
    await this.eventCoordinator.emitJobStarted(job);
    this.metricsCollector.recordJobStarted(job);
    this.logger.debug('Starting job processing', {
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    });
  }

  private getProcessorOrThrow(job: IJob): JobProcessor<JobData, unknown> {
    const processor = this.processorRegistry.get(job.name);
    if (processor) {
      return processor;
    }

    this.logger.error('Processor not found', { jobId: job.id, jobName: job.name });
    throw new Error(`No processor registered for job "${job.name}"`);
  }

  private executeProcessor(
    job: IJob,
    processor: JobProcessor<JobData, unknown>
  ): Promise<unknown> {
    const progress = this.createProgressReporter(job);
    return processor({
      id: job.id,
      name: job.name,
      data: job.data,
      attempts: job.attemptsMade,
      progress,
    });
  }

  private createProgressReporter(job: IJob): (percentage: number) => void {
    return (percentage: number) => {
      job.updateProgress(percentage);
      void this.emitJobProgress(job);
    };
  }

  private async emitJobProgress(job: IJob): Promise<void> {
    try {
      await this.eventCoordinator.emitJobProgress(job);
    } catch (error) {
      this.logger.error('Error emitting job progress event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async onJobCompleted(job: IJob, result: unknown, startTime: number): Promise<void> {
    await this.eventCoordinator.emitJobCompleted(job, result);
    this.metricsCollector.recordJobCompleted(job, startTime);
    this.logger.info('Job completed successfully', {
      jobId: job.id,
      jobName: job.name,
      duration: Date.now() - startTime,
    });
  }

  private async onJobFailed(job: IJob, error: Error): Promise<void> {
    this.logger.error('Job processing failed', {
      jobId: job.id,
      jobName: job.name,
      error: error.message,
      attempt: job.attemptsMade + 1,
    });
    await this.handleJobFailure(job, error);
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
