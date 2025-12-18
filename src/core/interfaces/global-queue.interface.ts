/**
 * Multi-region and global distribution interface
 */

// QueueConfig is not used in this file

/**
 * Region configuration
 */
export type RegionConfig = {
  /**
   * Region identifier
   */
  region: string;

  /**
   * Redis connection for this region
   */
  redis: {
    host: string;
    port: number;
    password?: string;
    username?: string;
    db?: number;
    tls?: Record<string, unknown>;
  };

  /**
   * If true, this region is primary
   */
  isPrimary?: boolean;

  /**
   * Priority for failover (lower = higher priority)
   */
  priority?: number;

  /**
   * Health check interval (ms)
   */
  healthCheckIntervalMs?: number;
}

/**
 * Global queue configuration
 */
export type GlobalQueueConfig = {
  /**
   * Queue name
   */
  name: string;

  /**
   * Regions configuration
   */
  regions: RegionConfig[];

  /**
   * Replication strategy
   */
  replication?: {
    /**
     * Replicate jobs to all regions
     */
    enabled: boolean;

    /**
     * Replication mode: synchronous or asynchronous
     */
    mode?: 'sync' | 'async';

    /**
     * Timeout for sync replication (ms)
     */
    syncTimeoutMs?: number;
  };

  /**
   * Failover strategy
   */
  failover?: {
    /**
     * Enable automatic failover
     */
    enabled: boolean;

    /**
     * Failover timeout (ms)
     */
    timeoutMs?: number;

    /**
     * Number of health check failures before failover
     */
    failureThreshold?: number;
  };

  /**
   * Data residency requirements
   */
  dataResidency?: {
    /**
     * Regions where data must be stored
     */
    allowedRegions: string[];

    /**
     * Regions where data is prohibited
     */
    blockedRegions?: string[];
  };
}

/**
 * Regional queue statistics
 */
export type RegionalStats = {
  region: string;
  isHealthy: boolean;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  latencyMs: number;
  lastHealthCheckAt: number;
}

/**
 * Interface for multi-region queue operations
 */
export type IGlobalQueueManager = {
  /**
   * Initialize global queue across regions
   */
  initialize(config: GlobalQueueConfig): Promise<void>;

  /**
   * Add job to queue (routed to appropriate region)
   */
  addJob<T extends Record<string, unknown>>(
    jobName: string,
    data: T,
    options?: Record<string, unknown>
  ): Promise<string>;

  /**
   * Get queue for specific region
   */
  getRegionalQueue(region: string): Promise<unknown>;

  /**
   * Get stats for all regions
   */
  getGlobalStats(): Promise<RegionalStats[]>;

  /**
   * Get primary region
   */
  getPrimaryRegion(): string;

  /**
   * Failover to another region
   */
  failoverTo(region: string): Promise<void>;

  /**
   * Check region health
   */
  isRegionHealthy(region: string): Promise<boolean>;

  /**
   * Replicate job to other regions
   */
  replicateJob(jobId: string, targetRegions?: string[]): Promise<void>;

  /**
   * Get replication status
   */
  getReplicationStatus(jobId: string): Promise<Map<string, 'pending' | 'replicated' | 'failed'>>;

  /**
   * Close global queue
   */
  close(): Promise<void>;
}
