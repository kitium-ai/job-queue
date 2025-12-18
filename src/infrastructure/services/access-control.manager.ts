/**
 * Access control and multi-tenancy manager
 */

import { getLogger } from '@kitiumai/logger';
import type ioredis from 'ioredis';

import type {
  AccessControlEntry,
  IAccessControlManager,
  QueuePermissions,
  TenantConfig,
} from '../../core/interfaces/access-control.interface';

const logger = getLogger();
const SOURCE = '@kitiumai/job-queue/access-control-manager';

/**
 * Implementation of access control manager for multi-tenancy
 */
export class AccessControlManager implements IAccessControlManager {
  private readonly redis: InstanceType<typeof ioredis>;
  private readonly keyPrefix: string;
  private readonly tenantCache: Map<string, TenantConfig> = new Map();
  private readonly aclCache: Map<string, AccessControlEntry[]> = new Map();

  constructor(redis: InstanceType<typeof ioredis>, keyPrefix = 'acl') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Create tenant
   */
  async createTenant(config: TenantConfig): Promise<void> {
    try {
      const key = this.buildTenantKey(config.tenantId);
      await this.redis.set(key, JSON.stringify(config), 'EX', 31536000);
      this.tenantCache.set(config.tenantId, config);

      logger.debug(`Created tenant: ${config.tenantId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to create tenant: ${config.tenantId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId: string, config: Partial<TenantConfig>): Promise<void> {
    try {
      const existing = await this.getTenant(tenantId);
      const updated = { ...existing, ...config, tenantId };

      const key = this.buildTenantKey(tenantId);
      await this.redis.set(key, JSON.stringify(updated), 'EX', 31536000);
      this.tenantCache.set(tenantId, updated as TenantConfig);

      logger.debug(`Updated tenant: ${tenantId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to update tenant: ${tenantId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get tenant
   */
  async getTenant(tenantId: string): Promise<TenantConfig> {
    try {
      const cached = this.tenantCache.get(tenantId);
      if (cached) {
        return cached;
      }

      const key = this.buildTenantKey(tenantId);
      const data = await this.redis.get(key);

      if (!data) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      const config = JSON.parse(data) as TenantConfig;
      this.tenantCache.set(tenantId, config);
      return config;
    } catch (error) {
      logger.error(
        `Failed to get tenant: ${tenantId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * List tenants
   */
  async listTenants(): Promise<TenantConfig[]> {
    try {
      const pattern = `${this.keyPrefix}:tenant:*`;
      const keys = await this.redis.keys(pattern);

      const tenants: TenantConfig[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          tenants.push(JSON.parse(data) as TenantConfig);
        }
      }

      return tenants;
    } catch (error) {
      logger.error(
        'Failed to list tenants',
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Delete tenant
   */
  async deleteTenant(tenantId: string): Promise<void> {
    try {
      const key = this.buildTenantKey(tenantId);
      await this.redis.del(key);
      this.tenantCache.delete(tenantId);

      logger.debug(`Deleted tenant: ${tenantId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to delete tenant: ${tenantId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Grant access to principal
   */
  async grantAccess(ace: AccessControlEntry): Promise<void> {
    try {
      const key = this.buildACEKey(ace.principalId, ace.queuePattern);
      await this.redis.set(key, JSON.stringify(ace), 'EX', 31536000);
      this.aclCache.delete(ace.principalId);

      logger.debug(`Granted access to ${ace.principalId} for queue pattern ${ace.queuePattern}`, {
        source: SOURCE,
      });
    } catch (error) {
      logger.error(
        `Failed to grant access`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Revoke access
   */
  async revokeAccess(principalId: string, queuePattern: string): Promise<void> {
    try {
      const key = this.buildACEKey(principalId, queuePattern);
      await this.redis.del(key);
      this.aclCache.delete(principalId);

      logger.debug(`Revoked access from ${principalId} for queue pattern ${queuePattern}`, {
        source: SOURCE,
      });
    } catch (error) {
      logger.error(
        `Failed to revoke access`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Check access for principal
   */
  async checkAccess(
    principalId: string,
    queueName: string,
    permission: keyof QueuePermissions,
    context?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const aces = await this.getPrincipalAccess(principalId);

      for (const ace of aces) {
        if (this.isAceAllowed(ace, queueName, permission, context)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(
        `Failed to check access for ${principalId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  private isAceAllowed(
    ace: AccessControlEntry,
    queueName: string,
    permission: keyof QueuePermissions,
    context?: Record<string, unknown>
  ): boolean {
    const now = Date.now();
    return (
      this.matchesPattern(queueName, ace.queuePattern) &&
      ace.permissions[permission] === true &&
      (ace.expiresAt === undefined || ace.expiresAt >= now) &&
      (ace.conditions === undefined || this.checkConditions(ace.conditions, context))
    );
  }

  /**
   * Get access for principal
   */
  async getPrincipalAccess(principalId: string): Promise<AccessControlEntry[]> {
    try {
      const cached = this.aclCache.get(principalId);
      if (cached) {
        return cached;
      }

      const pattern = `${this.keyPrefix}:ace:${principalId}:*`;
      const keys = await this.redis.keys(pattern);

      const aces: AccessControlEntry[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          aces.push(JSON.parse(data) as AccessControlEntry);
        }
      }

      this.aclCache.set(principalId, aces);
      return aces;
    } catch (error) {
      logger.error(
        `Failed to get principal access for ${principalId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Get queue access list
   */
  async getQueueAccess(queueName: string): Promise<AccessControlEntry[]> {
    try {
      const pattern = `${this.keyPrefix}:ace:*:*`;
      const keys = await this.redis.keys(pattern);

      const aces: AccessControlEntry[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (!data) {
          continue;
        }

        const ace = JSON.parse(data) as AccessControlEntry;
        if (!this.matchesPattern(queueName, ace.queuePattern)) {
          continue;
        }
        aces.push(ace);
      }

      return aces;
    } catch (error) {
      logger.error(
        `Failed to get queue access for ${queueName}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Audit access (who did what)
   */
  async auditAccess(
    principalId: string,
    action: string,
    queueName: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const auditEntry = {
        principalId,
        action,
        queueName,
        timestamp: Date.now(),
        metadata,
      };

      const key = `${this.keyPrefix}:audit:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await this.redis.set(key, JSON.stringify(auditEntry), 'EX', 31536000);

      logger.debug(`Audit: ${principalId} performed ${action} on ${queueName}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        'Failed to record audit entry',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get audit log
   */
  async getAuditLog(
    filters?: {
      principalId?: string;
      queueName?: string;
      action?: string;
      startTime?: number;
      endTime?: number;
      limit?: number;
    }
  ): Promise<Array<{ principalId: string; action: string; queueName: string; timestamp: number; metadata?: Record<string, unknown> }>> {
    try {
      const pattern = `${this.keyPrefix}:audit:*`;
      const keys = await this.redis.keys(pattern);

      const entries: Array<{ principalId: string; action: string; queueName: string; timestamp: number; metadata?: Record<string, unknown> }> = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (!data) {
          continue;
        }

        const entry = JSON.parse(data) as {
          principalId: string;
          action: string;
          queueName: string;
          timestamp: number;
          metadata?: Record<string, unknown>;
        };

        if (filters && !this.matchesAuditFilters(entry, filters)) {
          continue;
        }

        entries.push(entry);
      }

      entries.sort((a, b) => b.timestamp - a.timestamp);
      return entries.slice(0, filters?.limit ?? 100);
    } catch (error) {
      logger.error(
        'Failed to get audit log',
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  private matchesAuditFilters(
    entry: { principalId: string; action: string; queueName: string; timestamp: number },
    filters: {
      principalId?: string;
      queueName?: string;
      action?: string;
      startTime?: number;
      endTime?: number;
    }
  ): boolean {
    return (
      (filters.principalId === undefined || entry.principalId === filters.principalId) &&
      (filters.queueName === undefined || entry.queueName === filters.queueName) &&
      (filters.action === undefined || entry.action === filters.action) &&
      (filters.startTime === undefined || entry.timestamp >= filters.startTime) &&
      (filters.endTime === undefined || entry.timestamp <= filters.endTime)
    );
  }

  private matchesPattern(queueName: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern === queueName) {
      return true;
    }

    return this.matchesWildcardPattern(queueName, pattern);
  }

  private matchesWildcardPattern(value: string, pattern: string): boolean {
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

  private checkConditions(
    conditions: { timeRange?: { startHour: number; endHour: number }; ipWhitelist?: string[]; custom?: (context: Record<string, unknown>) => boolean },
    context?: Record<string, unknown>
  ): boolean {
    if (conditions.timeRange) {
      const now = new Date();
      const hour = now.getHours();
      if (hour < conditions.timeRange.startHour || hour >= conditions.timeRange.endHour) {
        return false;
      }
    }

    if (conditions.custom && context) {
      return conditions.custom(context);
    }

    return true;
  }

  private buildTenantKey(tenantId: string): string {
    return `${this.keyPrefix}:tenant:${tenantId}`;
  }

  private buildACEKey(principalId: string, queuePattern: string): string {
    return `${this.keyPrefix}:ace:${principalId}:${queuePattern}`;
  }
}
