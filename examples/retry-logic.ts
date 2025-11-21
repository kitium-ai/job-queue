/**
 * Retry Logic Example
 * Demonstrates configurable retry strategies with backoff
 */

import { JobQueue, QueueEvent } from '../src/index';

async function retryExample() {
  const queue = new JobQueue({
    name: 'retry-queue',
    redis: {
      host: 'localhost',
      port: 6379,
    },
    // Default retry configuration
    retry: {
      maxAttempts: 3,
      backoffType: 'exponential',
      backoffDelay: 1000,
      maxBackoffDelay: 30000,
    },
  });

  let attemptCount = 0;

  // Register a job that sometimes fails
  queue.process('flaky-api-call', async (job) => {
    const attempt = job.attempts;
    console.log(`Attempt ${attempt + 1}: Calling external API...`);

    // Simulate a flaky API that fails 2 out of 3 times
    if (Math.random() < 0.66) {
      throw new Error('API temporarily unavailable');
    }

    return { data: 'Successfully fetched from API' };
  });

  // Setup event listeners
  queue.on(QueueEvent.JOB_ADDED, (job) => {
    console.log(`📝 Job queued: ${job?.id}`);
  });

  queue.on(QueueEvent.JOB_STARTED, (job) => {
    console.log(`🚀 Job started: ${job?.id}`);
  });

  queue.on(QueueEvent.JOB_RETRYING, (job) => {
    console.log(`⚠️  Job failed, retrying: ${job?.id} (Attempt ${job?.attemptsMade + 1})`);
  });

  queue.on(QueueEvent.JOB_COMPLETED, (job) => {
    console.log(`✅ Job completed: ${job?.id}`);
  });

  queue.on(QueueEvent.JOB_FAILED, (job, error) => {
    console.log(`❌ Job failed: ${job?.id} - ${error?.message}`);
  });

  // Add a job with custom retry configuration
  await queue.addJob(
    'flaky-api-call',
    { endpoint: '/api/data', timeout: 5000 },
    {
      attempts: 5, // Override default 3 attempts
      backoff: {
        type: 'exponential',
        delay: 2000,
        maxDelay: 60000,
      },
      timeout: 10000,
    }
  );

  console.log('Job added with exponential backoff:');
  console.log('- Attempt 1: Immediate');
  console.log('- Attempt 2: After 2 seconds');
  console.log('- Attempt 3: After 4 seconds');
  console.log('- Attempt 4: After 8 seconds');
  console.log('- Attempt 5: After 16 seconds');

  // Get queue stats periodically
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const stats = await queue.getStats();
    console.log(`\nQueue Stats (${i + 1}):`, stats);
  }

  // Cleanup
  await queue.close();
}

retryExample().catch(console.error);
