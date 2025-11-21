/**
 * Basic Usage Example
 * Demonstrates fundamental job queue operations
 */

import { JobQueue, QueueEvent } from '../src/index';

async function basicExample() {
  // Initialize the job queue
  const queue = new JobQueue({
    name: 'basic-queue',
    redis: {
      host: 'localhost',
      port: 6379,
    },
  });

  // Register a job processor
  queue.process('send-email', async (job) => {
    console.log(`Processing job ${job.id}: Send email to ${job.data.email}`);

    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`Email sent to ${job.data.email}`);
    return { success: true, email: job.data.email };
  });

  // Setup event listeners
  queue.on(QueueEvent.JOB_ADDED, (job) => {
    console.log(`✓ Job added: ${job?.name} (${job?.id})`);
  });

  queue.on(QueueEvent.JOB_COMPLETED, (job) => {
    console.log(`✓ Job completed: ${job?.name} (${job?.id})`);
  });

  queue.on(QueueEvent.JOB_FAILED, (job, error) => {
    console.log(`✗ Job failed: ${job?.name} (${job?.id}) - ${error?.message}`);
  });

  // Add jobs to the queue
  const job1 = await queue.addJob('send-email', {
    email: 'user@example.com',
    subject: 'Welcome!',
  });

  const job2 = await queue.addJob('send-email', {
    email: 'admin@example.com',
    subject: 'Admin Alert',
  });

  console.log(`Added jobs: ${job1}, ${job2}`);

  // Get queue statistics
  const stats = await queue.getStats();
  console.log('Queue Stats:', stats);

  // Get job status
  const status = await queue.getJobStatus(job1);
  console.log('Job Status:', status);

  // Cleanup
  await queue.close();
}

basicExample().catch(console.error);
