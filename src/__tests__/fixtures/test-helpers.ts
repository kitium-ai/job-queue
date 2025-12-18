/**
 * Test fixtures and mocks for job queue enhancement services
 * Provides reusable test utilities for all managers
 */

import type { Job, Queue } from 'bullmq';
import type ioredis from 'ioredis';

function matchesWildcardPattern(value: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return value === pattern;
  }

  const parts = pattern.split('*').filter((part) => part.length > 0);
  if (parts.length === 0) {
    return true;
  }

  const firstPart = parts[0];
  const lastPart = parts[parts.length - 1];
  if (!firstPart || !lastPart) {
    return true;
  }

  let position = 0;
  for (const part of parts) {
    const index = value.indexOf(part, position);
    if (index === -1) {
      return false;
    }
    position = index + part.length;
  }

  const hasLeadingWildcard = pattern.startsWith('*');
  const hasTrailingWildcard = pattern.endsWith('*');
  const isStartOk = hasLeadingWildcard || value.startsWith(firstPart);
  const isEndOk = hasTrailingWildcard || value.endsWith(lastPart);
  return isStartOk && isEndOk;
}

/**
 * Mock Redis for testing
 */
export class MockRedis {
  private readonly store: Map<string, string> = new Map();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.has(key)) {
        this.store.delete(key);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  keys(pattern: string): Promise<string[]> {
    return Promise.resolve(Array.from(this.store.keys()).filter((key) => matchesWildcardPattern(key, pattern)));
  }

  ping(): Promise<string> {
    return Promise.resolve('PONG');
  }

  quit(): Promise<string> {
    this.store.clear();
    return Promise.resolve('OK');
  }

  flushall(): Promise<string> {
    this.store.clear();
    return Promise.resolve('OK');
  }
}

/**
 * Mock Queue for testing
 */
export class MockQueue {
  private readonly jobs: Map<string, { name: string; data: unknown; state: string; id: string }> = new Map();
  private paused = false;

  add(name: string, data: unknown): Promise<Job> {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const job = { name, data, state: 'waiting', id } as unknown as Job;
    this.jobs.set(id, { name, data, state: 'waiting', id });
    return Promise.resolve(job);
  }

  getJob(id: string): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) {
      return Promise.resolve() as Promise<undefined>;
    }
    return Promise.resolve({ name: job.name, data: job.data, id: job.id } as unknown as Job);
  }

  getJobs(types?: string | string[], start = 0, end = -1): Promise<Job[]> {
    let states: string[] = ['waiting'];
    if (Array.isArray(types)) {
      states = types;
    } else if (types) {
      states = [types];
    }
    const result: unknown[] = [];
    let count = 0;

    for (const [, job] of this.jobs) {
      if (states.includes(job.state)) {
        if (count >= start && (end === -1 || count <= end)) {
          result.push(job);
        }
        count += 1;
      }
    }

    return Promise.resolve(result as Job[]);
  }

  getWaitingCount(): Promise<number> {
    return Promise.resolve(Array.from(this.jobs.values()).filter((index) => index.state === 'waiting').length);
  }

  getActiveCount(): Promise<number> {
    return Promise.resolve(Array.from(this.jobs.values()).filter((index) => index.state === 'active').length);
  }

  getCompletedCount(): Promise<number> {
    return Promise.resolve(Array.from(this.jobs.values()).filter((index) => index.state === 'completed').length);
  }

  getFailedCount(): Promise<number> {
    return Promise.resolve(Array.from(this.jobs.values()).filter((index) => index.state === 'failed').length);
  }

  getDelayedCount(): Promise<number> {
    return Promise.resolve(Array.from(this.jobs.values()).filter((index) => index.state === 'delayed').length);
  }

  pause(): Promise<void> {
    this.paused = true;
    return Promise.resolve();
  }

  resume(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  isPaused(): Promise<boolean> {
    return Promise.resolve(this.paused);
  }

  drain(): Promise<void> {
    this.jobs.clear();
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.jobs.clear();
    return Promise.resolve();
  }

  isPausedValue(): boolean {
    return this.paused;
  }
}

/**
 * Test data builders
 */
export class TestDataBuilder {
  static buildIdempotencyKey(jobName: string, correlationId: string): string {
    return `${jobName}:${correlationId}:${Date.now()}`;
  }

  static buildMessageGroupId(tenantId: string, entityType: string, entityId: string): string {
    return `${tenantId}:${entityType}:${entityId}`;
  }

  static buildWorkflowId(prefix = 'workflow'): string {
    return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 11)}`;
  }

  static buildWebhookConfig(overrides: Partial<TestWebhookConfig> = {}): TestWebhookConfig {
    return {
      url: 'https://example.com/webhooks',
      events: ['job.completed'],
      deliveryStrategy: 'reliable',
      maxRetries: 3,
      active: true,
      createdAt: Date.now(),
      ...overrides,
    };
  }

  static buildTenantConfig(overrides: Partial<TestTenantConfig> = {}): TestTenantConfig {
    return {
      tenantId: `tenant-${Date.now()}`,
      name: 'Test Tenant',
      quota: {
        maxQueueSize: 10000,
        maxConcurrency: 50,
        rateLimit: 1000,
      },
      enabled: true,
      createdAt: Date.now(),
      ...overrides,
    };
  }

  static buildAccessControlEntry(
    overrides: Partial<TestAccessControlEntry> = {}
  ): TestAccessControlEntry {
    return {
      principalId: `principal-${Date.now()}`,
      principalType: 'user',
      queuePattern: 'test-*',
      permissions: {
        canAddJob: true,
        canViewJob: true,
        canModifyJob: false,
        canDeleteJob: false,
        canManageQueue: false,
        canManageWorkers: false,
        canViewMetrics: true,
      },
      createdAt: Date.now(),
      ...overrides,
    };
  }

  static buildRegionConfig(region: string, overrides: Partial<TestRegionConfig> = {}): TestRegionConfig {
    return {
      region,
      redis: {
        host: `redis-${region}.example.com`,
        port: 6379,
        db: 0,
      },
      isPrimary: region === 'us-east-1',
      priority: 1,
      healthCheckIntervalMs: 30000,
      ...overrides,
    };
  }
}

export type TestWebhookConfig = {
  url: string;
  events: string[];
  deliveryStrategy: string;
  maxRetries: number;
  active: boolean;
  createdAt: number;
} & Record<string, unknown>;

export type TestTenantConfig = {
  tenantId: string;
  name: string;
  quota: {
    maxQueueSize: number;
    maxConcurrency: number;
    rateLimit: number;
  };
  enabled: boolean;
  createdAt: number;
} & Record<string, unknown>;

export type TestAccessControlEntry = {
  principalId: string;
  principalType: string;
  queuePattern: string;
  permissions: {
    canAddJob: boolean;
    canViewJob: boolean;
    canModifyJob: boolean;
    canDeleteJob: boolean;
    canManageQueue: boolean;
    canManageWorkers: boolean;
    canViewMetrics: boolean;
  };
  createdAt: number;
} & Record<string, unknown>;

export type TestRegionConfig = {
  region: string;
  redis: {
    host: string;
    port: number;
    db: number;
  };
  isPrimary: boolean;
  priority: number;
  healthCheckIntervalMs: number;
} & Record<string, unknown>;

/**
 * Test assertion helpers
 */
export class TestAssertions {
  static assertValidIdempotencyRecord(record: unknown): void {
    if (!record || typeof record !== 'object') {
      throw new Error('Invalid idempotency record');
    }

    const rec = record as Record<string, unknown>;
    if (!rec['idempotencyKey'] || !rec['jobId'] || !rec['result'] || !rec['createdAt'] || !rec['expiresAt']) {
      throw new Error('Idempotency record missing required fields');
    }
  }

  static assertValidWorkflowStatus(status: unknown): void {
    if (!status || typeof status !== 'object') {
      throw new Error('Invalid workflow status');
    }

    const s = status as Record<string, unknown>;
    if (!s['workflowId'] || !s['status'] || !s['stepResults'] || !s['startedAt']) {
      throw new Error('Workflow status missing required fields');
    }
  }

  static assertValidCircuitBreakerState(state: unknown): void {
    const validStates = ['closed', 'open', 'half-open'];
    if (!validStates.includes(String(state))) {
      throw new Error(`Invalid circuit breaker state: ${state}`);
    }
  }

  static assertValidWebhookDelivery(attempt: unknown): void {
    if (!attempt || typeof attempt !== 'object') {
      throw new Error('Invalid webhook delivery attempt');
    }

    const a = attempt as Record<string, unknown>;
    if (!a['eventId'] || !a['webhookId'] || !a['attemptNumber'] || !a['timestamp']) {
      throw new Error('Webhook delivery attempt missing required fields');
    }
  }
}

/**
 * Cleanup helpers
 */
export class TestCleanup {
  static async cleanRedis(redis: InstanceType<typeof ioredis>): Promise<void> {
    await redis.flushall();
  }

  static async cleanQueues(queues: Queue[]): Promise<void> {
    for (const queue of queues) {
      await queue.drain();
      await queue.close();
    }
  }

  static async cleanAll(redis: InstanceType<typeof ioredis>, queues: Queue[]): Promise<void> {
    await TestCleanup.cleanQueues(queues);
    await TestCleanup.cleanRedis(redis);
  }
}

/**
 * Test timeout helpers
 */
export const TestTimeouts = {
  SHORT: 100,
  MEDIUM: 500,
  LONG: 2000,
  VERY_LONG: 5000,
};

/**
 * Retry helpers for flaky tests
 */
export async function retryTest(
  fn: () => Promise<void>,
  maxAttempts = 3,
  delayMs = 100
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }
  }

  if (!lastError) {
    throw new Error('retryTest failed without an error');
  }
  throw lastError;
}
