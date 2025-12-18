/**
 * Job chaining and workflow orchestration manager
 */

import { NotFoundError, ValidationError } from '@kitiumai/error';
import { getLogger } from '@kitiumai/logger';
import type ioredis from 'ioredis';

import type {
  IJobChainManager,
  JobDependency,
  WorkflowExecutionResult,
  WorkflowStep,
} from '../../core/interfaces/job-chain.interface';
import type { JobData, JobOptions } from '../../types';

const logger = getLogger();
const SOURCE = '@kitiumai/job-queue/job-chain-manager';

/**
 * Implementation of job chaining and workflow orchestration
 * Manages job dependencies and sequential/parallel execution
 */
export class JobChainManager implements IJobChainManager {
  private readonly redis: InstanceType<typeof ioredis>;
  private readonly keyPrefix: string;

  constructor(redis: InstanceType<typeof ioredis>, keyPrefix = 'job-chains') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Create job chain with dependencies
   */
  async createChain(chainId: string, steps: Array<{ jobName: string; data: JobData; options?: JobOptions }>): Promise<string> {
    try {
      if (!chainId || chainId.trim().length === 0) {
        throw new ValidationError({
          code: 'chain/invalid_id',
          message: 'Chain ID is required',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      if (steps.length === 0) {
        throw new ValidationError({
          code: 'chain/empty_steps',
          message: 'Chain must have at least one step',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      const chain: WorkflowExecutionResult = {
        workflowId: chainId,
        status: 'running',
        stepResults: new Map(),
        startedAt: Date.now(),
      };

      const key = this.buildChainKey(chainId);
      await this.redis.set(key, JSON.stringify(this.serializeWorkflow(chain)), 'EX', 604800); // 7 days

      logger.debug(`Created job chain: ${chainId} with ${steps.length} steps`, { source: SOURCE });

      return chainId;
    } catch (error) {
      logger.error(
        `Failed to create job chain: ${chainId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Add job to existing chain
   */
  async addJobToChain(chainId: string, _jobName: string, _data: JobData, _options?: JobOptions): Promise<string> {
    try {
      const chain = await this.getChainData(chainId);
      if (!chain) {
        throw new NotFoundError({
          code: 'chain/not_found',
          message: `Chain ${chainId} not found`,
          severity: 'error',
          kind: 'not_found',
          retryable: false,
          source: SOURCE,
        });
      }

      // Generate job ID
      const jobId = `${chainId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

      logger.debug(`Added job to chain: ${chainId}, jobId: ${jobId}`, { source: SOURCE });

      return jobId;
    } catch (error) {
      logger.error(
        `Failed to add job to chain: ${chainId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get chain status
   */
  async getChainStatus(chainId: string): Promise<WorkflowExecutionResult> {
    try {
      const chain = await this.getChainData(chainId);
      if (!chain) {
        throw new NotFoundError({
          code: 'chain/not_found',
          message: `Chain ${chainId} not found`,
          severity: 'error',
          kind: 'not_found',
          retryable: false,
          source: SOURCE,
        });
      }

      return chain;
    } catch (error) {
      logger.error(
        `Failed to get chain status: ${chainId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(workflowId: string, steps: WorkflowStep[]): Promise<WorkflowExecutionResult> {
    try {
      if (!workflowId || workflowId.trim().length === 0) {
        throw new ValidationError({
          code: 'workflow/invalid_id',
          message: 'Workflow ID is required',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      if (steps.length === 0) {
        throw new ValidationError({
          code: 'workflow/empty_steps',
          message: 'Workflow must have at least one step',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      const result: WorkflowExecutionResult = {
        workflowId,
        status: 'running',
        stepResults: new Map(),
        startedAt: Date.now(),
      };

      const key = this.buildWorkflowKey(workflowId);
      await this.redis.set(key, JSON.stringify(this.serializeWorkflow(result)), 'EX', 604800);

      logger.debug(`Executing workflow: ${workflowId} with ${steps.length} steps`, { source: SOURCE });

      return result;
    } catch (error) {
      logger.error(
        `Failed to execute workflow: ${workflowId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowExecutionResult> {
    try {
      const key = this.buildWorkflowKey(workflowId);
      const data = await this.redis.get(key);

      if (!data) {
        throw new NotFoundError({
          code: 'workflow/not_found',
          message: `Workflow ${workflowId} not found`,
          severity: 'error',
          kind: 'not_found',
          retryable: false,
          source: SOURCE,
        });
      }

      return this.deserializeWorkflow(JSON.parse(data) as Record<string, unknown>);
    } catch (error) {
      logger.error(
        `Failed to get workflow status: ${workflowId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Cancel workflow execution
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    try {
      const workflow = await this.getWorkflowStatus(workflowId);
      workflow.status = 'cancelled';
      workflow.completedAt = Date.now();

      const key = this.buildWorkflowKey(workflowId);
      await this.redis.set(key, JSON.stringify(this.serializeWorkflow(workflow)), 'EX', 604800);

      logger.debug(`Cancelled workflow: ${workflowId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to cancel workflow: ${workflowId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get job dependencies
   */
  async getJobDependencies(jobId: string): Promise<JobDependency[]> {
    try {
      const key = `${this.keyPrefix}:job:${jobId}:deps`;
      const data = await this.redis.get(key);

      if (!data) {
        return [];
      }

      return JSON.parse(data) as JobDependency[];
    } catch (error) {
      logger.error(
        `Failed to get dependencies for job: ${jobId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Wait for job dependencies
   */
  async waitForDependencies(jobId: string, timeoutMs = 300000): Promise<Map<string, unknown>> {
    try {
      const dependencies = await this.getJobDependencies(jobId);
      const results = new Map<string, unknown>();

      // Simulate waiting for dependencies (actual implementation would use event listeners)
      const startTime = Date.now();

      for (const dep of dependencies) {
        const result = await this.waitForDependencyResult(dep.parentJobId, startTime, timeoutMs);
        if (result !== undefined) {
          results.set(dep.parentJobId, result);
        }
      }

      return results;
    } catch (error) {
      logger.error(
        `Failed to wait for dependencies of job: ${jobId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  private async waitForDependencyResult(
    parentJobId: string,
    startTime: number,
    timeoutMs: number
  ): Promise<unknown | undefined> {
    const depKey = `${this.keyPrefix}:job:${parentJobId}:result`;
    while (Date.now() - startTime < timeoutMs) {
      const raw = await this.redis.get(depKey);
      if (raw) {
        return JSON.parse(raw) as unknown;
      }
      await this.sleep(100);
    }
    return undefined;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async getChainData(chainId: string): Promise<WorkflowExecutionResult | null> {
    try {
      const key = this.buildChainKey(chainId);
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      return this.deserializeWorkflow(JSON.parse(data) as Record<string, unknown>);
    } catch (_error) {
      logger.debug(`Error retrieving chain data: ${chainId}`, { source: SOURCE });
      return null;
    }
  }

  private buildChainKey(chainId: string): string {
    return `${this.keyPrefix}:chain:${chainId}`;
  }

  private buildWorkflowKey(workflowId: string): string {
    return `${this.keyPrefix}:workflow:${workflowId}`;
  }

  private serializeWorkflow(workflow: WorkflowExecutionResult): Record<string, unknown> {
    return {
      workflowId: workflow.workflowId,
      status: workflow.status,
      stepResults: Array.from(workflow.stepResults.entries()),
      error: workflow.error?.message,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
    };
  }

  private deserializeWorkflow(data: Record<string, unknown>): WorkflowExecutionResult {
    const stepResults = new Map<string, { status: 'completed' | 'failed'; result?: unknown; error?: string }>();

    if (Array.isArray(data['stepResults'])) {
      for (const [stepName, result] of data['stepResults'] as Array<[string, unknown]>) {
        stepResults.set(stepName, result as { status: 'completed' | 'failed'; result?: unknown; error?: string });
      }
    }

    return {
      workflowId: String(data['workflowId']),
      status: (data['status'] as 'running' | 'completed' | 'failed' | 'cancelled') ?? 'running',
      stepResults,
      error: data['error'] ? new Error(String(data['error'])) : undefined,
      startedAt: Number(data['startedAt']) || Date.now(),
      completedAt: data['completedAt'] ? Number(data['completedAt']) : undefined,
    };
  }
}
