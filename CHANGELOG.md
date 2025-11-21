# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-11-21

### Added

#### Core Features
- **JobQueue Class**: Main class for managing background job processing with BullMQ
  - Job addition and management
  - Worker lifecycle management
  - Event emission system
  - Graceful shutdown support

- **Job Scheduling**
  - Cron expression support for recurring jobs
  - Interval-based job scheduling
  - Delayed job execution
  - Flexible repeat configurations with limits

- **Retry Logic**
  - Exponential backoff strategy
  - Fixed backoff strategy with configurable delays
  - Maximum backoff delay caps
  - Configurable max attempts per job
  - Automatic retry on job failure
  - Manual job retry functionality

- **Job Status Tracking**
  - Real-time job status queries
  - 8 distinct job states (pending, waiting, active, completed, failed, delayed, paused, dlq)
  - Progress reporting with percentage tracking
  - Detailed status information with timestamps
  - Batch job queries by status
  - Queue statistics (active, waiting, completed, failed, delayed, paused)

- **Dead Letter Queue (DLQ)**
  - Automatic DLQ creation for failed jobs
  - Jobs moved to DLQ after max retries exceeded
  - Custom notification handlers for DLQ events
  - DLQ job retrieval and inspection
  - Original job metadata preservation in DLQ

- **Event System**
  - Job lifecycle events:
    - `JOB_ADDED`: Job queued
    - `JOB_STARTED`: Processing began
    - `JOB_COMPLETED`: Successfully finished
    - `JOB_FAILED`: Processing failed
    - `JOB_RETRYING`: Retry attempt initiated
    - `JOB_STALLED`: Worker crashed/stalled
    - `JOB_PROGRESS`: Progress updated
    - `JOB_DLQ`: Moved to dead letter queue
    - `QUEUE_ERROR`: Queue error occurred
  - Async event handler support
  - Multiple handlers per event
  - Error handling in event handlers

- **Redis Integration**
  - Secure Redis connection defaults
  - Connection retry strategy with exponential backoff
  - Custom Redis configuration support
  - Connection pooling
  - Authentication support (password)
  - Database selection (db parameter)

#### Type Safety
- Comprehensive TypeScript type definitions
- Type-safe job processors with generics
- Configuration interfaces for all components
- Enum types for job statuses, results, and events
- Job data and execution result types

#### Configuration Options
- Default job options for all queues
- Per-job option overrides
- Retry strategy configuration
- DLQ configuration
- Queue settings (stall detection, lock management)
- Redis connection configuration

#### Examples
- **basic-usage.ts**: Simple job queue setup with email processing
- **scheduling.ts**: Cron-based and interval scheduling examples
- **retry-logic.ts**: Exponential backoff retry demonstration
- **job-tracking.ts**: Status monitoring with progress reporting
- **dlq-handling.ts**: Dead letter queue operations and monitoring

#### Documentation
- Comprehensive README with:
  - Feature overview
  - Installation instructions
  - Quick start guide
  - Complete API reference
  - Configuration guide
  - Retry strategy explanations
  - Error handling patterns
  - Best practices
  - Security considerations
  - Performance tips
  - TypeScript support documentation

#### Testing
- Jest configuration with TypeScript support
- Unit test suite covering:
  - Job processing registration
  - Job management (add, remove, status)
  - Job scheduling
  - Event system
  - Queue statistics
  - Dead letter queue operations
  - Job retry functionality
  - Queue cleanup

#### Build & Tooling
- TypeScript strict mode configuration
- Source maps for debugging
- Declaration files for type checking
- ESM and CommonJS compatibility
- Linting ready configuration

### Features in Detail

#### Job Processing
```typescript
queue.process('job-name', async (job) => {
  job.progress(50);
  return { result: 'data' };
});
```

#### Scheduling
```typescript
// Cron scheduling
await queue.scheduleJob('daily-job', data, '0 2 * * *');

// Interval scheduling
await queue.addJob('job', data, {
  repeat: { every: 3600000 }
});
```

#### Retry Configuration
```typescript
await queue.addJob('job', data, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000,
    maxDelay: 60000
  }
});
```

#### Status Tracking
```typescript
const status = await queue.getJobStatus(jobId);
const stats = await queue.getStats();
const activeJobs = await queue.getJobsByStatus(JobStatus.ACTIVE);
```

#### Event Handling
```typescript
queue.on(QueueEvent.JOB_COMPLETED, (job) => {
  console.log(`Completed: ${job?.name}`);
});

queue.on(QueueEvent.JOB_DLQ, (job, error) => {
  console.error(`Failed: ${error?.message}`);
});
```

#### DLQ Management
```typescript
const dlqJobs = await queue.getDLQJobs();
dlqJobs.forEach(job => {
  console.log(`${job.id}: ${job.data.error}`);
});
```

### Security Features
- Secure Redis defaults (no anonymous connections)
- Connection retry strategy to prevent connection storms
- Error message sanitization in logs
- Timeout configuration for job processing
- Resource cleanup to prevent memory leaks
- Job data isolation from sensitive information

### Performance Features
- Configurable worker concurrency
- Job priority support
- Batch job operations
- Connection pooling
- Memory cleanup on job completion
- Stall detection and recovery

### Compatibility
- Node.js 16+
- TypeScript 5.0+
- BullMQ 5.0+
- Redis 5.0+ (with ioredis 5.3+)

### Project Structure
```
├── src/
│   ├── JobQueue.ts      # Main JobQueue class
│   ├── types.ts         # Type definitions
│   └── index.ts         # Public API exports
├── examples/
│   ├── basic-usage.ts
│   ├── scheduling.ts
│   ├── retry-logic.ts
│   ├── job-tracking.ts
│   └── dlq-handling.ts
├── tests/
│   └── JobQueue.test.ts # Unit tests
├── package.json         # Package metadata
├── tsconfig.json        # TypeScript config
├── jest.config.js       # Jest config
├── README.md            # Documentation
└── CHANGELOG.md         # This file
```

---

## [Unreleased]

### Planned Features
- [ ] Cluster-aware job distribution
- [ ] Job rate limiting
- [ ] Webhook notifications
- [ ] Job metrics and observability
- [ ] GraphQL subscriptions for job updates
- [ ] WebSocket real-time job monitoring
- [ ] Redis Cluster support
- [ ] Sentinel support
- [ ] Job hooks (before/after processors)
- [ ] Batch job operations
- [ ] Priority queue optimization
- [ ] Job dependencies
- [ ] Circuit breaker pattern
- [ ] Bulkhead isolation pattern
- [ ] Dashboard/UI for monitoring

### Under Consideration
- Multi-queue coordination
- Queue prioritization
- Job cancellation
- Pause/resume individual jobs
- Job templating
- Advanced filtering and querying
- Rate limiting per job type
- Per-processor configuration

---

## Versioning Notes

- **1.0.0**: Initial production release with all core features
  - BullMQ integration
  - Job scheduling
  - Retry logic with exponential backoff
  - Dead letter queue handling
  - Comprehensive status tracking
  - Event-driven architecture
  - Full TypeScript support
  - Complete documentation and examples

---

## Upgrade Guide

### From Pre-Release

This is the initial release. No upgrades necessary.

---

## Known Issues

None reported in 1.0.0

---

## Security

For security vulnerabilities, please email security@kitiumai.com instead of using the issue tracker.

Supported versions receiving security updates:
- 1.0.x (current)

---

## Support

- **Documentation**: See [README.md](README.md)
- **Examples**: See [examples/](examples/) directory
- **Issues**: GitHub Issues
- **Security**: security@kitiumai.com

---

## Contributors

- Kitium AI Development Team

---

## License

MIT License - See LICENSE file for details

---

[1.0.0]: https://github.com/kitium-ai/job-queue/releases/tag/v1.0.0
[Unreleased]: https://github.com/kitium-ai/job-queue/compare/v1.0.0...HEAD
