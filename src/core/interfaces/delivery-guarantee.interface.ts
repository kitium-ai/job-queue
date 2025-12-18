/**
 * Delivery guarantee strategies interface
 * Implements exactly-once processing and deduplication
 */

import type { JobData } from '../../shared/types/job.types';

/**
 * Delivery guarantee levels
 */
export enum DeliveryGuarantee {
  /**
   * At-least-once: Job may be processed multiple times
   */
  AT_LEAST_ONCE = 'at-least-once',

  /**
   * Exactly-once: Job guaranteed to be processed exactly once
   */
  EXACTLY_ONCE = 'exactly-once',
}

/**
 * Idempotency record for exactly-once processing
 */
export type IdempotencyRecord = {
  idempotencyKey: string;
  jobId: string;
  jobName: string;
  result: unknown;
  createdAt: number;
  expiresAt: number;
}

/**
 * Interface for managing idempotency and deduplication
 */
export type IIdempotencyManager = {
  /**
   * Register job execution result for idempotency
   */
  recordExecution(
    idempotencyKey: string,
    jobId: string,
    jobName: string,
    result: unknown,
    ttlMs?: number
  ): Promise<void>;

  /**
   * Check if job was already executed
   */
  getExecutionResult(idempotencyKey: string): Promise<IdempotencyRecord | null>;

  /**
   * Clean expired idempotency records
   */
  cleanExpired(): Promise<number>;

  /**
   * Clear specific idempotency record
   */
  clear(idempotencyKey: string): Promise<void>;
}

/**
 * Deduplication context for tracking identical jobs
 */
export type DeduplicationContext = {
  /**
   * Unique key for deduplication
   */
  deduplicationKey: string;

  /**
   * Time window for deduplication in milliseconds
   */
  windowMs?: number;

  /**
   * Custom matcher function
   */
  matcher?: (job1: JobData, job2: JobData) => boolean;
}

/**
 * Interface for managing job deduplication
 */
export type IDeduplicationManager = {
  /**
   * Register job for deduplication tracking
   */
  registerJob(jobId: string, data: JobData, context: DeduplicationContext): Promise<void>;

  /**
   * Check if identical job exists
   */
  findDuplicate(data: JobData, context: DeduplicationContext): Promise<string | null>;

  /**
   * Remove deduplication record
   */
  removeRecord(jobId: string): Promise<void>;

  /**
   * Clean expired deduplication records
   */
  cleanExpired(): Promise<number>;
}
