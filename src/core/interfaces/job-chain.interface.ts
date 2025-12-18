/**
 * Job chaining and workflow orchestration interface
 */

import type { JobData, JobOptions } from '../../types';

/**
 * Job dependency information
 */
export type JobDependency = {
  /**
   * Job ID that must complete before this job
   */
  parentJobId: string;

  /**
   * If true, parent job must succeed; if false, always proceed
   */
  requiresSuccess: boolean;

  /**
   * Optional condition checker for conditional dependencies
   */
  condition?: (parentResult: unknown) => boolean | Promise<boolean>;
}

/**
 * Job chain configuration
 */
export type JobChainConfig = {
  /**
   * Unique chain ID
   */
  chainId?: string;

  /**
   * Dependencies for this job
   */
  dependencies?: JobDependency[];

  /**
   * Maximum time to wait for parent jobs (ms)
   */
  timeoutMs?: number;

  /**
   * Pass parent job result as input to this job
   */
  inheritParentData?: boolean;

  /**
   * Data transformation function
   */
  dataTransformer?: (parentResult: unknown) => JobData;
}

/**
 * Workflow step configuration
 */
export type WorkflowStep = {
  /**
   * Step name/identifier
   */
  name: string;

  /**
   * Job type to execute
   */
  jobName: string;

  /**
   * Job data
   */
  data: JobData;

  /**
   * Job options
   */
  options?: JobOptions;

  /**
   * Dependencies on previous steps
   */
  dependsOn?: string[];

  /**
   * Parallel execution with other steps
   */
  parallelWith?: string[];

  /**
   * Timeout for this step (ms)
   */
  timeoutMs?: number;

  /**
   * Retry configuration for this step
   */
  retryAttempts?: number;

  /**
   * On step failure: continue, retry, or abort
   */
  onFailure?: 'continue' | 'retry' | 'abort';

  /**
   * Data transformation from previous step
   */
  dataTransformer?: (previousResult: unknown) => JobData;
}

/**
 * Workflow execution result
 */
export type WorkflowExecutionResult = {
  /**
   * Workflow ID
   */
  workflowId: string;

  /**
   * Overall status
   */
  status: 'running' | 'completed' | 'failed' | 'cancelled';

  /**
   * Results per step
   */
  stepResults: Map<string, { status: 'completed' | 'failed'; result?: unknown; error?: string }>;

  /**
   * Overall execution error
   */
  error?: Error;

  /**
   * Execution start time
   */
  startedAt: number;

  /**
   * Execution end time
   */
  completedAt?: number;
}

/**
 * Interface for job chaining and workflow orchestration
 */
export type IJobChainManager = {
  /**
   * Create job chain with dependencies
   */
  createChain(
    chainId: string,
    steps: Array<{ jobName: string; data: JobData; options?: JobOptions }>
  ): Promise<string>;

  /**
   * Add job to existing chain
   */
  addJobToChain(chainId: string, jobName: string, data: JobData, options?: JobOptions): Promise<string>;

  /**
   * Get chain status
   */
  getChainStatus(chainId: string): Promise<WorkflowExecutionResult>;

  /**
   * Execute workflow
   */
  executeWorkflow(
    workflowId: string,
    steps: WorkflowStep[]
  ): Promise<WorkflowExecutionResult>;

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): Promise<WorkflowExecutionResult>;

  /**
   * Cancel workflow execution
   */
  cancelWorkflow(workflowId: string): Promise<void>;

  /**
   * Get job dependencies
   */
  getJobDependencies(jobId: string): Promise<JobDependency[]>;

  /**
   * Wait for job dependencies
   */
  waitForDependencies(jobId: string, timeoutMs?: number): Promise<Map<string, unknown>>;
}
