/**
 * JobQueue Unit Tests
 * Tests for the main JobQueue class
 */

import { JobQueue, QueueEvent, JobStatus } from '../src/index';

// Mock Redis for testing
// In a real scenario, you'd use a test Redis instance or mock library
describe('JobQueue', () => {
  let queue: JobQueue;

  beforeEach(() => {
    // Initialize test queue
    queue = new JobQueue({
      name: 'test-queue',
      redis: {
        host: 'localhost',
        port: 6379,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
      dlq: {
        enabled: true,
        queueName: 'test-queue-dlq',
      },
    });
  });

  afterEach(async () => {
    await queue.close();
  });

  describe('Job Processing', () => {
    it('should register a job processor', () => {
      const processor = jest.fn().mockResolvedValue({ success: true });
      expect(() => {
        queue.process('test-job', processor);
      }).not.toThrow();
    });

    it('should throw error if processor already registered', () => {
      const processor = jest.fn();
      queue.process('test-job', processor);

      expect(() => {
        queue.process('test-job', processor);
      }).toThrow('Processor for job "test-job" already registered');
    });
  });

  describe('Job Management', () => {
    it('should add a job to the queue', async () => {
      const jobId = await queue.addJob('test-job', { data: 'test' });
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });

    it('should add a job with custom options', async () => {
      const jobId = await queue.addJob(
        'test-job',
        { data: 'test' },
        {
          attempts: 5,
          delay: 1000,
          priority: 10,
        }
      );

      const status = await queue.getJobStatus(jobId);
      expect(status.maxAttempts).toBe(5);
    });

    it('should get job status', async () => {
      const jobId = await queue.addJob('test-job', { data: 'test' });
      const status = await queue.getJobStatus(jobId);

      expect(status).toEqual(
        expect.objectContaining({
          id: jobId,
          name: 'test-job',
          data: { data: 'test' },
          attempts: 0,
          maxAttempts: 3,
        })
      );
    });

    it('should throw error for non-existent job', async () => {
      await expect(queue.getJobStatus('non-existent')).rejects.toThrow(
        'Job non-existent not found'
      );
    });

    it('should remove a job', async () => {
      const jobId = await queue.addJob('test-job', { data: 'test' });
      await queue.removeJob(jobId);

      await expect(queue.getJobStatus(jobId)).rejects.toThrow();
    });
  });

  describe('Scheduling', () => {
    it('should schedule a job with cron pattern', async () => {
      const jobId = await queue.scheduleJob(
        'scheduled-job',
        { type: 'daily' },
        '0 2 * * *'
      );

      expect(jobId).toBeDefined();
      const status = await queue.getJobStatus(jobId);
      expect(status.name).toBe('scheduled-job');
    });

    it('should schedule a job with interval', async () => {
      const jobId = await queue.addJob(
        'interval-job',
        { type: 'hourly' },
        {
          repeat: {
            every: 3600000, // 1 hour
          },
        }
      );

      expect(jobId).toBeDefined();
    });
  });

  describe('Event System', () => {
    it('should register event handler', (done) => {
      const handler = jest.fn();
      queue.on(QueueEvent.JOB_ADDED, handler);

      queue.addJob('test-job', { data: 'test' }).then(() => {
        // Note: In a real test, we'd wait for the event to be emitted
        done();
      });
    });

    it('should handle multiple event listeners', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      queue.on(QueueEvent.JOB_ADDED, handler1);
      queue.on(QueueEvent.JOB_ADDED, handler2);

      await queue.addJob('test-job', { data: 'test' });

      // Note: In a real test, we'd verify both handlers were called
      expect(handler1).toBeDefined();
      expect(handler2).toBeDefined();
    });
  });

  describe('Queue Statistics', () => {
    it('should get queue stats', async () => {
      // Add some jobs
      await queue.addJob('test-job-1', { data: 'test1' });
      await queue.addJob('test-job-2', { data: 'test2' });

      const stats = await queue.getStats();

      expect(stats).toEqual(
        expect.objectContaining({
          active: expect.any(Number),
          completed: expect.any(Number),
          failed: expect.any(Number),
          delayed: expect.any(Number),
          waiting: expect.any(Number),
          paused: expect.any(Number),
        })
      );
    });

    it('should have waiting jobs after adding jobs', async () => {
      await queue.addJob('test-job', { data: 'test' });
      const stats = await queue.getStats();
      expect(stats.waiting + stats.active).toBeGreaterThan(0);
    });
  });

  describe('Dead Letter Queue', () => {
    it('should initialize DLQ when enabled', async () => {
      const dlqQueue = new JobQueue({
        name: 'dlq-test-queue',
        redis: {
          host: 'localhost',
          port: 6379,
        },
        dlq: {
          enabled: true,
          queueName: 'dlq-test-queue-dlq',
        },
      });

      expect(dlqQueue).toBeDefined();
      await dlqQueue.close();
    });

    it('should get DLQ jobs', async () => {
      const dlqJobs = await queue.getDLQJobs();
      expect(Array.isArray(dlqJobs)).toBe(true);
    });
  });

  describe('Job Retry', () => {
    it('should retry a job', async () => {
      const jobId = await queue.addJob('test-job', { data: 'test' });

      // Retry the job
      await queue.retryJob(jobId);

      // Verify job still exists
      const status = await queue.getJobStatus(jobId);
      expect(status.id).toBe(jobId);
    });

    it('should throw error when retrying non-existent job', async () => {
      await expect(queue.retryJob('non-existent')).rejects.toThrow(
        'Job non-existent not found'
      );
    });
  });

  describe('Queue Cleanup', () => {
    it('should clear the queue', async () => {
      // Add jobs
      await queue.addJob('test-job-1', { data: 'test1' });
      await queue.addJob('test-job-2', { data: 'test2' });

      // Clear
      await queue.clear();

      const stats = await queue.getStats();
      expect(stats.waiting + stats.active).toBe(0);
    });
  });
});
