/**
 * Job Status Tracking Example
 * Demonstrates monitoring and querying job status
 */

import { JobQueue, QueueEvent, JobStatus } from '../src/index';

async function jobTrackingExample() {
  const queue = new JobQueue({
    name: 'tracking-queue',
    redis: {
      host: 'localhost',
      port: 6379,
    },
  });

  // Register a job processor with progress reporting
  queue.process('file-processing', async (job) => {
    console.log(`Starting file processing: ${job.data.filename}`);

    const steps = 5;
    for (let i = 0; i < steps; i++) {
      // Simulate processing step
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Report progress
      const progress = ((i + 1) / steps) * 100;
      job.progress(progress);
      console.log(`  Progress: ${progress}% - Processing ${job.data.filename}`);
    }

    return { processed: job.data.filename, lines: 1000 };
  });

  // Setup event listeners
  queue.on(QueueEvent.JOB_ADDED, (job) => {
    console.log(`📝 Job added: ${job?.id}`);
  });

  queue.on(QueueEvent.JOB_PROGRESS, (job) => {
    console.log(`📊 Progress update: ${job?.progress()}%`);
  });

  queue.on(QueueEvent.JOB_COMPLETED, (job) => {
    console.log(`✅ Job completed: ${job?.id}`);
  });

  // Add multiple jobs
  const jobIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const jobId = await queue.addJob('file-processing', {
      filename: `file-${i + 1}.csv`,
      size: 1024 * (i + 1),
    });
    jobIds.push(jobId);
  }

  console.log('Added 3 file processing jobs\n');

  // Monitor job status
  console.log('Monitoring job progress:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const monitoringInterval = setInterval(async () => {
    try {
      for (const jobId of jobIds) {
        const status = await queue.getJobStatus(jobId);
        const progressBar = createProgressBar(status.progress);
        console.log(
          `${jobId.substring(0, 8)}: [${progressBar}] ${status.progress.toFixed(0)}% - ${status.status}`
        );
      }
      console.log('');
    } catch (error) {
      // Job might be cleared, ignore
    }
  }, 2000);

  // Query jobs by status
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('\n📋 Jobs by Status:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const status of [JobStatus.ACTIVE, JobStatus.WAITING, JobStatus.COMPLETED]) {
    const jobs = await queue.getJobsByStatus(status);
    console.log(`\n${status.toUpperCase()}:`);
    jobs.forEach((job) => {
      console.log(`  - ${job.id}: ${job.name} (Attempt ${job.attempts + 1}/${job.maxAttempts})`);
    });
  }

  // Get detailed status for first job
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log('\n📊 Detailed Job Status:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const jobId of jobIds) {
    try {
      const status = await queue.getJobStatus(jobId);
      console.log(`
Job: ${status.id}
Name: ${status.name}
Status: ${status.status}
Progress: ${status.progress}%
Attempts: ${status.attempts + 1}/${status.maxAttempts}
Created: ${new Date(status.createdAt).toISOString()}
Completed: ${status.completedAt ? new Date(status.completedAt).toISOString() : 'N/A'}
      `);
    } catch (error) {
      console.log(`Job ${jobId} no longer available`);
    }
  }

  // Get overall queue stats
  const stats = await queue.getStats();
  console.log('\n📈 Queue Statistics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Active: ${stats.active}`);
  console.log(`Waiting: ${stats.waiting}`);
  console.log(`Completed: ${stats.completed}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Delayed: ${stats.delayed}`);

  clearInterval(monitoringInterval);
  await queue.close();
}

/**
 * Create a visual progress bar
 */
function createProgressBar(percentage: number): string {
  const width = 20;
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

jobTrackingExample().catch(console.error);
