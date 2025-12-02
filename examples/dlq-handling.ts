/**
 * Dead Letter Queue (DLQ) Example
 * Demonstrates handling jobs that fail after all retries
 */

import { JobQueue, QueueEvent } from '../src/index';

async function dlqExample() {
  const queue = new JobQueue({
    name: 'critical-queue',
    redis: {
      host: 'localhost',
      port: 6379,
    },
    defaultJobOptions: {
      attempts: 2, // Low attempts to trigger DLQ quickly
    },
    dlq: {
      enabled: true,
      queueName: 'critical-queue-dlq',
      maxRetries: 5,
      // Custom notification handler for DLQ jobs
      notificationHandler: async (job) => {
        console.log(`
🚨 CRITICAL: Job moved to DLQ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Job ID: ${job.id}
Job Name: ${job.name}
Original Queue: ${job.data.originalQueue}
Attempts: ${job.data.attempts}/${job.data.maxAttempts}
Error: ${job.data.error}
Time: ${job.data.timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `);

        // Here you might:
        // - Send alerts to monitoring system
        // - Log to external service
        // - Trigger manual intervention workflow
        // - Archive for investigation
      },
    },
  });

  // Register a processor for a task that will consistently fail
  queue.process('process-payment', async (job) => {
    console.log(`Processing payment: ${job.data.orderId}`);

    // Simulate a consistent failure
    throw new Error('Payment gateway permanently unavailable');
  });

  // Setup event listeners
  queue.on(QueueEvent.JOB_ADDED, (job) => {
    console.log(`📝 Job added: ${job?.name} (${job?.id})`);
  });

  queue.on(QueueEvent.JOB_STARTED, (job) => {
    console.log(`🚀 Processing: ${job?.name}`);
  });

  queue.on(QueueEvent.JOB_FAILED, (job, error) => {
    console.log(`❌ Job failed: ${job?.name} - ${error?.message}`);
  });

  queue.on(QueueEvent.JOB_RETRYING, (job) => {
    console.log(`⚠️  Retrying job: ${job?.name} (Attempt ${job?.attemptsMade + 1})`);
  });

  queue.on(QueueEvent.JOB_DLQ, (job, error) => {
    console.log(`☠️  Job moved to DLQ: ${job?.name} (${job?.id})`);
  });

  // Add a job to the queue
  const jobId = await queue.addJob('process-payment', {
    orderId: 'ORD-12345',
    amount: 99.99,
    currency: 'USD',
  });

  console.log(`Payment job created: ${jobId}`);
  console.log('Waiting for job to fail and move to DLQ...\n');

  // Wait and check DLQ
  await new Promise((resolve) => setTimeout(resolve, 10000));

  const dlqJobs = await queue.getDLQJobs();
  console.log('\n📋 Dead Letter Queue Contents:');
  console.log(`Total DLQ jobs: ${dlqJobs.length}`);
  dlqJobs.forEach((job) => {
    console.log(
      `
  - Job ID: ${job.id}
    Name: ${job.name}
    Attempts: ${job.attempts}
    Created: ${new Date(job.createdAt).toISOString()}
    `,
      job.data
    );
  });

  // Get queue statistics
  const stats = await queue.getStats();
  console.log('\n📊 Queue Statistics:', stats);

  // Cleanup
  await queue.close();
}

dlqExample().catch(console.error);
