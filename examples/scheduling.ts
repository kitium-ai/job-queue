/**
 * Job Scheduling Example
 * Demonstrates cron-based job scheduling
 */

import { JobQueue, QueueEvent } from '../src/index';

async function schedulingExample() {
  const queue = new JobQueue({
    name: 'scheduled-queue',
    redis: {
      host: 'localhost',
      port: 6379,
    },
  });

  // Register a scheduled job processor
  queue.process('daily-report', async (job) => {
    console.log(`Generating daily report at ${new Date().toISOString()}`);
    // Simulate report generation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return { report: 'Daily summary report generated' };
  });

  queue.process('hourly-sync', async (job) => {
    console.log(`Syncing data at ${new Date().toISOString()}`);
    // Simulate data sync
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { synced: true };
  });

  // Setup event listeners
  queue.on(QueueEvent.JOB_COMPLETED, (job) => {
    console.log(`✓ ${job?.name} executed successfully`);
  });

  // Schedule jobs with cron patterns
  // Run daily at 2 AM
  await queue.scheduleJob('daily-report', { date: new Date().toISOString() }, '0 2 * * *');

  // Run every hour
  await queue.scheduleJob('hourly-sync', { timestamp: Date.now() }, '0 * * * *');

  // Run every 5 minutes (using interval instead of cron)
  await queue.addJob(
    'cleanup-task',
    { target: 'temp-files' },
    {
      repeat: {
        every: 5 * 60 * 1000, // 5 minutes in milliseconds
      },
    }
  );

  console.log('Scheduled jobs:');
  console.log('- Daily report: 0 2 * * * (2 AM every day)');
  console.log('- Hourly sync: 0 * * * * (Every hour)');
  console.log('- Cleanup: Every 5 minutes');

  // Get queue stats
  const stats = await queue.getStats();
  console.log('Queue Stats:', stats);

  // Keep the queue running
  console.log('Queue is running. Press Ctrl+C to stop.');
  // await new Promise((resolve) => setTimeout(resolve, 60000));

  // Cleanup
  await queue.close();
}

schedulingExample().catch(console.error);
