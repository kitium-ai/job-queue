/**
 * Job telemetry service for distributed tracing
 */

import { getLogger } from '@kitiumai/logger';

import type { SpanHandle, TelemetryAdapter } from '../../../types';
import type { IJob } from '../../interfaces/job.interface';

/**
 * Service for job telemetry and distributed tracing
 */
export class JobTelemetryService {
  private readonly logger: ReturnType<typeof getLogger>;

  constructor(private readonly telemetry?: TelemetryAdapter) {
    this.logger = getLogger();
  }

  /**
   * Start a trace span for job processing
   * @param job The job being processed
   * @returns Span handle for recording events
   */
  startJobSpan(job: IJob): SpanHandle {
    if (!this.telemetry) {
      return this.getNoOpSpan();
    }

    try {
      return this.telemetry.startSpan(`jobqueue.process.${job.name}`, {
        jobId: job.id,
        jobName: job.name,
        attempt: String(job.attemptsMade),
      });
    } catch (error) {
      this.logger.debug('Error starting telemetry span', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.getNoOpSpan();
    }
  }

  /**
   * Start a trace span for queue operation
   * @param operation Operation name
   * @param attributes Optional attributes
   * @returns Span handle for recording events
   */
  startOperationSpan(
    operation: string,
    attributes?: Record<string, string | number | boolean>
  ): SpanHandle {
    if (!this.telemetry) {
      return this.getNoOpSpan();
    }

    try {
      return this.telemetry.startSpan(`jobqueue.${operation}`, attributes);
    } catch (error) {
      this.logger.debug('Error starting operation span', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.getNoOpSpan();
    }
  }

  /**
   * Check if telemetry is enabled
   * @returns True if telemetry adapter is configured
   */
  isEnabled(): boolean {
    return this.telemetry !== undefined;
  }

  /**
   * Get a no-op span for when telemetry is disabled
   * @returns No-op span handle
   */
  private getNoOpSpan(): SpanHandle {
    return {
      setAttribute: () => {
        /* no-op */
      },
      recordException: () => {
        /* no-op */
      },
      end: () => {
        /* no-op */
      },
    };
  }
}
