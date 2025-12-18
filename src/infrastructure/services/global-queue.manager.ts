/**
 * Global queue manager for multi-region job processing
 */

import { NotFoundError, ValidationError } from '@kitiumai/error';
import { getLogger } from '@kitiumai/logger';
import { Queue } from 'bullmq';
import ioredis from 'ioredis';

import type { GlobalQueueConfig, IGlobalQueueManager, RegionalStats, RegionConfig } from '../../core/interfaces/global-queue.interface';

const logger = getLogger();
const SOURCE = '@kitiumai/job-queue/global-queue-manager';

/**
 * Implementation of global queue manager for multi-region operations
 * Handles replication, failover, and data residency
 */
export class GlobalQueueManager implements IGlobalQueueManager {
  private readonly queues: Map<string, Queue> = new Map();
  private readonly redisClients: Map<string, InstanceType<typeof ioredis>> = new Map();
  private config: GlobalQueueConfig | null = null;
  private primaryRegion: string | null = null;
  private readonly healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Initialize global queue across regions
   */
  async initialize(config: GlobalQueueConfig): Promise<void> {
    try {
      this.validateInitializeConfig(config);
      this.config = config;

      await this.initializeRegions(config.regions);
      this.primaryRegion = this.determinePrimaryRegion(config.regions);
      this.startHealthChecks(config.regions);

      logger.debug(`Global queue initialized across ${config.regions.length} regions`, { source: SOURCE });
    } catch (error) {
      logger.error(
        'Failed to initialize global queue',
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  private validateInitializeConfig(config: GlobalQueueConfig): void {
    if (!config.regions || config.regions.length === 0) {
      throw new ValidationError({
        code: 'global-queue/no_regions',
        message: 'At least one region configuration is required',
        severity: 'error',
        kind: 'validation',
        retryable: false,
        source: SOURCE,
      });
    }
  }

  private async initializeRegions(regions: RegionConfig[]): Promise<void> {
    for (const region of regions) {
      await this.initializeRegion(region);
    }
  }

  private determinePrimaryRegion(regions: RegionConfig[]): string {
    const primary = regions.find((region) => region.isPrimary === true);
    if (primary) {
      return primary.region;
    }
    return regions[0]?.region ?? '';
  }

  private startHealthChecks(regions: RegionConfig[]): void {
    for (const region of regions) {
      this.startHealthCheck(region);
    }
  }

  /**
   * Add job to queue (routed to appropriate region)
   */
  async addJob<T extends Record<string, unknown>>(
    jobName: string,
    data: T,
    options?: Record<string, unknown>
  ): Promise<string> {
    try {
      const primaryQueue = this.getQueue(this.primaryRegion ?? '');
      if (!primaryQueue) {
        throw new ValidationError({
          code: 'global-queue/no_primary_region',
          message: 'No primary region available',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      const job = await primaryQueue.add(jobName, data, options);
      const jobId = job.id?.toString() ?? '';

      // Replicate to other regions if configured
      if (this.config?.replication?.enabled) {
        await this.replicateJob(jobId, this.config.regions?.map((r) => r.region));
      }

      logger.debug(`Added job to global queue: ${jobId}`, { source: SOURCE });

      return jobId;
    } catch (error) {
      logger.error(
        'Failed to add job to global queue',
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get queue for specific region
   */
  getRegionalQueue(region: string): Promise<unknown> {
    const queue = this.queues.get(region);
    if (!queue) {
      throw new NotFoundError({
        code: 'global-queue/region_not_found',
        message: `Region ${region} not found`,
        severity: 'error',
        kind: 'not_found',
        retryable: false,
        source: SOURCE,
      });
    }
    return Promise.resolve(queue);
  }

  /**
   * Get stats for all regions
   */
  async getGlobalStats(): Promise<RegionalStats[]> {
    try {
      const stats: RegionalStats[] = [];

      if (!this.config) {
        return stats;
      }

      for (const region of this.config.regions) {
        const queue = this.queues.get(region.region);
        if (!queue) {
          continue;
        }

        const [active, waiting, completed, failed] = await Promise.all([
          queue.getActiveCount(),
          queue.getWaitingCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);

        const isHealthy = await this.isRegionHealthy(region.region);

        stats.push({
          region: region.region,
          isHealthy,
          active,
          waiting,
          completed,
          failed,
          latencyMs: 0, // Would be calculated based on health check response time
          lastHealthCheckAt: Date.now(),
        });
      }

      return stats;
    } catch (error) {
      logger.error(
        'Failed to get global stats',
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Get primary region
   */
  getPrimaryRegion(): string {
    return this.primaryRegion ?? '';
  }

  /**
   * Failover to another region
   */
  failoverTo(region: string): Promise<void> {
    try {
      const queue = this.queues.get(region);
      if (!queue) {
        throw new NotFoundError({
          code: 'global-queue/region_not_found',
          message: `Region ${region} not found`,
          severity: 'error',
          kind: 'not_found',
          retryable: false,
          source: SOURCE,
        });
      }

      this.primaryRegion = region;
      logger.debug(`Failover to region: ${region}`, { source: SOURCE });
      return Promise.resolve();
    } catch (error) {
      logger.error(
        `Failed to failover to region: ${region}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return Promise.reject(error);
    }
  }

  /**
   * Check region health
   */
  async isRegionHealthy(region: string): Promise<boolean> {
    try {
      const redis = this.redisClients.get(region);
      if (!redis) {
        return false;
      }

      await redis.ping();
      return true;
    } catch (_error) {
      logger.debug(`Region ${region} health check failed`, { source: SOURCE });
      return false;
    }
  }

  /**
   * Replicate job to other regions
   */
  async replicateJob(jobId: string, targetRegions?: string[]): Promise<void> {
    try {
      if (!this.config?.replication?.enabled || !targetRegions || targetRegions.length === 0) {
        return;
      }

      const job = await this.getPrimaryJob(jobId);
      if (!job) {
        return;
      }

      const mode = this.config.replication.mode ?? 'async';
      const regions = targetRegions.filter((region) => region !== this.primaryRegion);

      for (const region of regions) {
        await this.replicateJobToRegion(jobId, job.name, job.data, region, mode);
      }
    } catch (error) {
      logger.error(
        `Failed to replicate job: ${jobId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async getPrimaryJob(jobId: string): Promise<Awaited<ReturnType<Queue['getJob']>> | null> {
    const primaryQueue = this.getQueue(this.primaryRegion ?? '');
    if (!primaryQueue) {
      return null;
    }
    return (await primaryQueue.getJob(jobId)) ?? null;
  }

  private async replicateJobToRegion(
    jobId: string,
    jobName: string,
    jobData: unknown,
    region: string,
    mode: string
  ): Promise<void> {
    const queue = this.queues.get(region);
    if (!queue) {
      return;
    }

    try {
      await queue.add(jobName, jobData as never, { jobId });

      if (mode === 'sync') {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.config?.replication?.syncTimeoutMs ?? 5000);
        });
      }

      logger.debug(`Replicated job ${jobId} to region ${region}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to replicate job ${jobId} to region ${region}`,
        undefined,
        error instanceof Error ? error : undefined
      );

      if (mode === 'sync') {
        throw error;
      }
    }
  }

  /**
   * Get replication status
   */
  async getReplicationStatus(jobId: string): Promise<Map<string, 'pending' | 'replicated' | 'failed'>> {
    try {
      const status = new Map<string, 'pending' | 'replicated' | 'failed'>();

      if (!this.config) {
        return status;
      }

      for (const region of this.config.regions) {
        const queue = this.queues.get(region.region);
        if (queue) {
          const job = await queue.getJob(jobId);
          status.set(region.region, job ? 'replicated' : 'pending');
        }
      }

      return status;
    } catch (error) {
      logger.error(
        `Failed to get replication status for job: ${jobId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return new Map();
    }
  }

  /**
   * Close global queue
   */
  async close(): Promise<void> {
    try {
      // Stop health checks
      for (const [, interval] of this.healthCheckIntervals) {
        clearInterval(interval);
      }

      // Close all queues
      for (const [, queue] of this.queues) {
        await queue.close();
      }

      // Close all Redis connections
      for (const [, redis] of this.redisClients) {
        await redis.quit();
      }

      logger.debug('Global queue closed', { source: SOURCE });
    } catch (error) {
      logger.error(
        'Failed to close global queue',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  private initializeRegion(region: RegionConfig): Promise<void> {
    try {
      const redis = new ioredis({
        host: region.redis.host,
        port: region.redis.port,
        password: region.redis.password,
        username: region.redis.username,
        db: region.redis.db ?? 0,
        tls: region.redis.tls,
      });

      const queueInstance = new Queue(this.config?.name ?? 'global-queue', {
        connection: redis,
      });

      this.redisClients.set(region.region, redis);
      this.queues.set(region.region, queueInstance);

      logger.debug(`Initialized region: ${region.region}`, { source: SOURCE });
      return Promise.resolve();
    } catch (error) {
      logger.error(
        `Failed to initialize region: ${region.region}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return Promise.reject(error);
    }
  }

  private startHealthCheck(region: RegionConfig): void {
    const interval = setInterval(() => {
      void this.healthCheckTick(region);
    }, region.healthCheckIntervalMs ?? 30000);

    this.healthCheckIntervals.set(region.region, interval);
  }

  private async healthCheckTick(region: RegionConfig): Promise<void> {
    const isHealthy = await this.isRegionHealthy(region.region);
    if (isHealthy) {
      return;
    }

    logger.warn(`Region ${region.region} is unhealthy`, { source: SOURCE });
    if (this.config?.failover?.enabled && region.region === this.primaryRegion) {
      await this.handleFailover();
    }
  }

  private async handleFailover(): Promise<void> {
    try {
      if (!this.config) {
        return;
      }

      const healthyRegions = await Promise.all(
        this.config.regions.map(async (region) => ({
          region: region.region,
          priority: region.priority ?? 999,
          healthy: await this.isRegionHealthy(region.region),
        }))
      );

      const newPrimary = healthyRegions
        .filter((r) => r.healthy && r.region !== this.primaryRegion)
        .sort((a, b) => a.priority - b.priority)[0];

      if (newPrimary) {
        await this.failoverTo(newPrimary.region);
        logger.warn(`Automatic failover to region: ${newPrimary.region}`, { source: SOURCE });
      }
    } catch (error) {
      logger.error(
        'Failed to handle failover',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  private getQueue(region: string): Queue | null {
    return this.queues.get(region) ?? null;
  }
}
