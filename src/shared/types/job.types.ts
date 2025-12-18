/**
 * Shared job type definitions
 */

/**
 * Job data object type
 */
export type JobData = {
  [key: string]: unknown;
};

/**
 * Job processor callback type
 */
export type JobProcessor<T extends JobData = JobData, R = unknown> = (job: {
  id: string;
  name: string;
  data: T;
  attempts: number;
  progress: (percentage: number) => void;
}) => Promise<R>;
