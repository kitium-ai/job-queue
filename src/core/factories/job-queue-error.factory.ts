/**
 * Job queue error factory for consistent error creation
 * Implements the Factory pattern for error standardization
 */

import { type KitiumError, NotFoundError, toKitiumError, ValidationError } from '@kitiumai/error';
import { getLogger } from '@kitiumai/logger';

const SOURCE = '@kitiumai/job-queue';

/**
 * Factory for creating standardized job queue errors
 * Consolidates all error creation logic in one place
 */
export class JobQueueErrorFactory {
  constructor(private readonly logger: ReturnType<typeof getLogger>) {}

  /**
   * Create job not found error
   * @param jobId Job ID
   * @param context Additional context
   * @returns KitiumError
   */
  createJobNotFoundError(jobId: string, context?: Record<string, unknown>): KitiumError {
    const error = new NotFoundError({
      code: 'queue/job_not_found',
      message: `Job ${jobId} not found in queue`,
      severity: 'error',
      kind: 'not_found',
      retryable: false,
      source: SOURCE,
    });
    this.logger.error('Job not found', { jobId, ...context }, error);
    return error;
  }

  /**
   * Create processor already exists error
   * @param jobName Job name
   * @param context Additional context
   * @returns KitiumError
   */
  createProcessorExistsError(jobName: string, context?: Record<string, unknown>): KitiumError {
    const error = new ValidationError({
      code: 'queue/processor_exists',
      message: `Processor for job "${jobName}" already registered`,
      severity: 'error',
      kind: 'validation',
      retryable: false,
      source: SOURCE,
    });
    this.logger.error('Duplicate processor', { jobName, ...context }, error);
    return error;
  }

  /**
   * Create processor not found error
   * @param jobName Job name
   * @param context Additional context
   * @returns KitiumError
   */
  createProcessorNotFoundError(jobName: string, context?: Record<string, unknown>): KitiumError {
    const error = new NotFoundError({
      code: 'queue/processor_not_found',
      message: `No processor registered for job "${jobName}"`,
      severity: 'error',
      kind: 'not_found',
      retryable: false,
      source: SOURCE,
    });
    this.logger.error('Processor not found', { jobName, ...context }, error);
    return error;
  }

  /**
   * Create job processing error
   * @param jobId Job ID
   * @param error Original error
   * @param context Additional context
   * @returns KitiumError
   */
  createJobProcessingError(
    jobId: string,
    error: unknown,
    context?: Record<string, unknown>
  ): KitiumError {
    const kitiumError = toKitiumError(error, {
      code: 'queue/job_processing_failed',
      message: 'Job processing failed',
      severity: 'error',
      kind: 'internal',
      retryable: true,
      source: SOURCE,
    });
    this.logger.error('Job processing failed', { jobId, ...context }, kitiumError);
    return kitiumError;
  }

  /**
   * Create generic queue error
   * @param message Error message
   * @param error Original error
   * @param context Additional context
   * @returns KitiumError
   */
  createQueueError(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>
  ): KitiumError {
    const kitiumError = toKitiumError(error, {
      code: 'queue/operation_failed',
      message,
      severity: 'error',
      kind: 'internal',
      retryable: false,
      source: SOURCE,
    });
    this.logger.error(message, context, kitiumError);
    return kitiumError;
  }

  /**
   * Create DLQ error when moving job to dead letter queue
   * @param jobId Job ID
   * @param error Original error
   * @param context Additional context
   * @returns KitiumError
   */
  createDLQError(
    jobId: string,
    error: unknown,
    context?: Record<string, unknown>
  ): KitiumError {
    const kitiumError = toKitiumError(error, {
      code: 'queue/dlq_operation_failed',
      message: 'Failed to move job to dead letter queue',
      severity: 'error',
      kind: 'internal',
      retryable: true,
      source: SOURCE,
    });
    this.logger.error('DLQ operation failed', { jobId, ...context }, kitiumError);
    return kitiumError;
  }
}
