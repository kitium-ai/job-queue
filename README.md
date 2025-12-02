# @kitiumai/job-queue

Enterprise-ready background job processing package built on **BullMQ** and **Redis**, featuring comprehensive job scheduling, retry logic, status tracking, and dead letter queue handling.

## Features

✨ **Core Capabilities**

- **Job Queue Management**: Robust background job processing powered by BullMQ
- **Job Scheduling**: Support for cron expressions and interval-based scheduling with jitter
- **Retry Logic**: Configurable retry strategies with exponential and fixed backoff
- **Job Status Tracking**: Real-time monitoring of job states and progress
- **Dead Letter Queue (DLQ)**: Automatic handling of permanently failed jobs with replay helpers
- **Event-Driven Architecture**: Comprehensive event system for job lifecycle hooks
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Enterprise-Ready**: Hardened Redis defaults (TLS, ready checks) and worker concurrency controls
- **Observability Hooks**: Pluggable metrics and tracing adapters for fleet-level insight

## Installation

```bash
npm install @kitiumai/job-queue bullmq ioredis
```

## Quick Start

### Basic Job Processing

```typescript
import { JobQueue } from '@kitiumai/job-queue';

// Initialize the queue
const queue = new JobQueue({
  name: 'my-queue',
  redis: {
    host: 'localhost',
    port: 6379,
  },
});

// Register a job processor
queue.process('send-email', async (job) => {
  console.log(`Sending email to ${job.data.email}`);
  // Your job logic here
  return { success: true };
});

// Add a job
await queue.addJob('send-email', {
  email: 'user@example.com',
  subject: 'Hello',
});

// Listen for events
queue.on('job-completed', (job) => {
  console.log(`Job ${job?.id} completed!`);
});
```

## Configuration

### Queue Configuration

```typescript
const queue = new JobQueue({
  name: 'my-queue',

  // Redis connection options
  redis: {
    host: 'localhost',
    port: 6379,
    username: 'default',
    password: 'your-password', // Optional
    db: 0,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    enableReadyCheck: true,
    tls: {}, // Provide TLS options for production Redis
  },

  // Default job options
  defaultJobOptions: {
    attempts: 3,
    delay: 0,
    priority: 0,
    backoff: {
      type: 'exponential',
      delay: 1000,
      maxDelay: 30000,
    },
    timeout: 30000,
    removeOnComplete: true,
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    backoffType: 'exponential',
    backoffDelay: 1000,
    maxBackoffDelay: 30000,
  },

  // Dead Letter Queue configuration
  dlq: {
    enabled: true,
    queueName: 'my-queue-dlq',
    notificationHandler: async (job) => {
      // Send alert, log, etc.
      console.error('Job moved to DLQ:', job);
    },
  },

  // Queue settings
  settings: {
    maxStalledCount: 2,
    maxStalledInterval: 5000,
    lockDuration: 30000,
    lockRenewTime: 15000,
  },

  // Worker controls
  worker: {
    concurrency: 20,
    limiter: {
      max: 100,
      duration: 1000,
    },
  },

  // Observability hooks
  telemetry: tracer,
  metrics: metricsAdapter,
});
```

## API Reference

### Job Processing

#### `process(jobName, processor)`

Register a processor function for a job type.

```typescript
queue.process('task-name', async (job) => {
  job.progress(50); // Report progress
  return { result: 'data' };
});
```

### Job Management

#### `addJob(jobName, data, options?)`

Add a job to the queue.

```typescript
const jobId = await queue.addJob(
  'send-email',
  {
    to: 'user@example.com',
  },
  {
    attempts: 5,
    delay: 1000,
    priority: 10,
    idempotencyKey: 'send-email-user@example.com',
    jitter: 500,
  }
);
```

#### `scheduleJob(jobName, data, cronPattern, options?)`

Schedule a recurring job with a cron expression.

```typescript
// Run daily at 2 AM
await queue.scheduleJob('daily-report', { type: 'full' }, '0 2 * * *');
```

#### `scheduleEvery(jobName, data, intervalMs, options?)`

Schedule a recurring job on a fixed interval with optional jitter.

```typescript
// Run every 30 seconds with up to 2 seconds of jitter
await queue.scheduleEvery('heartbeat', { service: 'api' }, 30_000, { jitter: 2000 });
```

#### `retryJob(jobId)`

Manually retry a job.

```typescript
await queue.retryJob(jobId);
```

#### `removeJob(jobId)`

Remove a job from the queue.

```typescript
await queue.removeJob(jobId);
```

#### `clear()`

Clear all jobs from the queue.

```typescript
await queue.clear();
```

#### `bulkRetry(status, limit?)`

Retry jobs in bulk for a given status (e.g., failed).

```typescript
await queue.bulkRetry(JobStatus.FAILED, 100);
```

#### `pause()` / `resume()` / `drain()`

Operational controls for pausing workers, resuming processing, or draining the queue safely.

```typescript
await queue.pause();
// maintenance window
await queue.resume();
await queue.drain();
```

### Status Tracking

#### `getJobStatus(jobId)`

Get detailed status information for a specific job.

```typescript
const status = await queue.getJobStatus(jobId);
console.log(status);
// {
//   id: 'job-1',
//   name: 'send-email',
//   status: 'completed',
//   progress: 100,
//   attempts: 1,
//   maxAttempts: 3,
//   createdAt: 1234567890,
//   ...
// }
```

#### `getJobsByStatus(status, limit?)`

Query jobs by their current status.

```typescript
const activeJobs = await queue.getJobsByStatus(JobStatus.ACTIVE);
const failedJobs = await queue.getJobsByStatus(JobStatus.FAILED, 50);
```

#### `getStats()`

Get queue statistics.

```typescript
const stats = await queue.getStats();
console.log(stats);
// {
//   active: 5,
//   waiting: 10,
//   completed: 1000,
//   failed: 2,
//   delayed: 3,
//   paused: 0,
//   latencyMs: 15,
// }
```

#### `healthCheck()`

Verify Redis connectivity and queue health.

```typescript
const healthy = await queue.healthCheck();
```

### Dead Letter Queue

#### `getDLQJobs(limit?)`

Get jobs that have failed and moved to the DLQ.

```typescript
const dlqJobs = await queue.getDLQJobs(100);
dlqJobs.forEach((job) => {
  console.log(`Failed job: ${job.id} - ${job.data.error}`);
});
```

#### `replayDLQ(limit?)`

Replay DLQ jobs back to the primary queue.

```typescript
// Move up to 50 DLQ jobs back into the main queue
const replayed = await queue.replayDLQ(50);
console.log(`Replayed ${replayed} jobs`);
```

### Event System

#### `on(event, handler)`

Register an event handler.

```typescript
queue.on(QueueEvent.JOB_COMPLETED, async (job) => {
  console.log(`Job completed: ${job?.name}`);
});

queue.on(QueueEvent.JOB_FAILED, async (job, error) => {
  console.error(`Job failed: ${error?.message}`);
});

queue.on(QueueEvent.JOB_PROGRESS, (job) => {
  console.log(`Progress: ${job?.progress()}%`);
});
```

**Available Events:**

- `JOB_ADDED` - Job added to queue
- `JOB_STARTED` - Job processing started
- `JOB_COMPLETED` - Job completed successfully
- `JOB_FAILED` - Job failed
- `JOB_RETRYING` - Job being retried
- `JOB_STALLED` - Job stalled (worker crashed)
- `JOB_PROGRESS` - Job progress updated
- `JOB_DLQ` - Job moved to dead letter queue
- `QUEUE_ERROR` - Queue error occurred

### Cleanup

#### `close()`

Close the queue and release all resources.

```typescript
await queue.close();
```

## Retry Strategies

### Exponential Backoff

Delay increases exponentially with each retry.

```typescript
await queue.addJob('api-call', data, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s * 2^0
    maxDelay: 60000, // Cap at 60s
  },
});
// Delays: 1s, 2s, 4s, 8s, 16s
```

### Fixed Backoff

Constant delay between retries.

```typescript
await queue.addJob('task', data, {
  attempts: 3,
  backoff: {
    type: 'fixed',
    delay: 5000, // Always 5 seconds
  },
});
// Delays: 5s, 5s, 5s
```

## Error Handling

### Job Processing Errors

```typescript
queue.process('sensitive-task', async (job) => {
  try {
    // Your task logic
    const result = await performTask(job.data);
    return result;
  } catch (error) {
    // Error will trigger retry logic
    throw new Error(`Task failed: ${error.message}`);
  }
});
```

### Event-Based Error Handling

```typescript
queue.on(QueueEvent.JOB_FAILED, async (job, error) => {
  // Log the error
  console.error(`Job ${job?.id} failed:`, error?.message);

  // Send alert
  await alerting.sendAlert({
    jobId: job?.id,
    error: error?.message,
  });
});

queue.on(QueueEvent.JOB_DLQ, async (job) => {
  // Handle dead letter queue entry
  await database.logFailedJob({
    jobId: job?.id,
    reason: job?.failedReason,
  });
});
```

## Job Status Types

```typescript
enum JobStatus {
  PENDING = 'pending', // Job created but not yet queued
  WAITING = 'waiting', // Waiting to be processed
  ACTIVE = 'active', // Currently being processed
  COMPLETED = 'completed', // Completed successfully
  FAILED = 'failed', // Failed (will retry)
  DELAYED = 'delayed', // Waiting for delay to expire
  PAUSED = 'paused', // Queue is paused
  DLQ = 'dlq', // Dead Letter Queue
}
```

## Best Practices

### 1. **Error Handling**

Always handle errors gracefully in your processors:

```typescript
queue.process('task', async (job) => {
  try {
    return await performTask(job.data);
  } catch (error) {
    console.error(`Task failed on attempt ${job.attempts}`, error);
    throw error;
  }
});
```

### 2. **Progress Reporting**

Report progress for long-running jobs:

```typescript
queue.process('big-task', async (job) => {
  for (let i = 0; i < 10; i++) {
    await doWork();
    job.progress((i + 1) * 10);
  }
});
```

### 3. **Observability Hooks**

Wire the queue into your metrics and tracing stacks using lightweight adapters.

```typescript
const metricsAdapter = {
  increment: (name, value = 1, tags) => statsd.increment(name, value, tags),
  observe: (name, value, tags) => statsd.histogram(name, value, tags),
};

const tracerAdapter = {
  startSpan: (name, attributes) => {
    const span = tracer.startSpan(name, { attributes });
    return {
      setAttribute: (key, value) => span.setAttribute(key, value),
      recordException: (error) => span.recordException(error),
      end: () => span.end(),
    };
  },
};

const queue = new JobQueue({ name: 'observability-demo', metrics: metricsAdapter, telemetry: tracerAdapter });
```

### 3. **Resource Cleanup**

Always close the queue when done:

```typescript
process.on('SIGTERM', async () => {
  await queue.close();
  process.exit(0);
});
```

### 4. **Monitoring**

Set up event handlers for monitoring:

```typescript
queue.on(QueueEvent.JOB_FAILED, (job, error) => {
  monitoring.increment('jobs.failed');
  monitoring.increment(`jobs.failed.${job?.name}`);
});

queue.on(QueueEvent.JOB_DLQ, (job) => {
  monitoring.increment('jobs.dlq');
  alerting.notify(`Job moved to DLQ: ${job?.id}`);
});
```

### 5. **Idempotency**

Design jobs to be idempotent when possible:

```typescript
queue.process('payment', async (job) => {
  // Check if payment already processed
  const existing = await db.getPayment(job.data.paymentId);
  if (existing?.status === 'completed') {
    return existing;
  }

  // Process payment
  const result = await stripe.createPayment(job.data);
  return result;
});
```

## Examples

See the `examples/` directory for detailed examples:

- **[basic-usage.ts](examples/basic-usage.ts)** - Simple job queue setup
- **[scheduling.ts](examples/scheduling.ts)** - Cron and interval scheduling
- **[retry-logic.ts](examples/retry-logic.ts)** - Retry strategies and backoff
- **[job-tracking.ts](examples/job-tracking.ts)** - Status tracking and monitoring
- **[dlq-handling.ts](examples/dlq-handling.ts)** - Dead letter queue operations

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import {
  JobQueue,
  JobStatus,
  QueueEvent,
  JobProcessor,
  QueueConfig,
  JobOptions,
} from '@kitiumai/job-queue';

interface EmailData {
  to: string;
  subject: string;
  body: string;
}

const processor: JobProcessor<EmailData> = async (job) => {
  console.log(`Sending to: ${job.data.to}`);
  return { sent: true };
};

queue.process('send-email', processor);
```

## Security Considerations

- **Redis Connection**: Use authentication and TLS for production
- **Job Data**: Avoid storing sensitive data in jobs; use references instead
- **Error Messages**: Be cautious with error details in logs (may contain sensitive info)
- **Timeout Configuration**: Set appropriate timeouts to prevent hung workers
- **DLQ Monitoring**: Regularly review DLQ to catch systemic issues

## Performance Tips

1. **Batch Operations**: Group related jobs when possible
2. **Concurrency**: Adjust worker concurrency based on workload
3. **Memory**: Use `removeOnComplete: true` to clean up finished jobs
4. **Monitoring**: Track queue depth and processing times
5. **Connection Pooling**: Reuse Redis connections

## Contributing

Contributions are welcome! Please ensure:

- Code is properly typed with TypeScript
- All tests pass
- Examples demonstrate the feature
- Documentation is updated

## License

MIT

## Support

For issues and questions, please visit [https://github.com/anthropics/claude-code/issues](https://github.com/anthropics/claude-code/issues)
