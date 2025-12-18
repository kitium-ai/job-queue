/**
 * Multi-tenancy and access control interface
 */

/**
 * Role definition
 */
export enum QueueRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  DEVELOPER = 'developer',
  VIEWER = 'viewer',
}

/**
 * Queue permissions
 */
export type QueuePermissions = {
  canAddJob: boolean;
  canViewJob: boolean;
  canModifyJob: boolean;
  canDeleteJob: boolean;
  canManageQueue: boolean;
  canManageWorkers: boolean;
  canViewMetrics: boolean;
}

/**
 * Tenant configuration
 */
export type TenantConfig = {
  /**
   * Unique tenant ID
   */
  tenantId: string;

  /**
   * Tenant name
   */
  name: string;

  /**
   * Resource quota
   */
  quota?: {
    /**
     * Max jobs in queue
     */
    maxQueueSize?: number;

    /**
     * Max concurrent jobs
     */
    maxConcurrency?: number;

    /**
     * Max job size (bytes)
     */
    maxJobSizeBytes?: number;

    /**
     * Rate limit (jobs per second)
     */
    rateLimit?: number;

    /**
     * Storage quota (bytes)
     */
    storageQuotaBytes?: number;
  };

  /**
   * Allowed regions for data residency
   */
  allowedRegions?: string[];

  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * Created timestamp
   */
  createdAt: number;

  /**
   * Enabled status
   */
  enabled: boolean;
}

/**
 * Access control entry
 */
export type AccessControlEntry = {
  /**
   * Principal ID (user, service, or role)
   */
  principalId: string;

  /**
   * Principal type
   */
  principalType: 'user' | 'service' | 'role';

  /**
   * Queue name or * for all
   */
  queuePattern: string;

  /**
   * Permissions
   */
  permissions: QueuePermissions;

  /**
   * Conditions for access
   */
  conditions?: {
    /**
     * Time range
     */
    timeRange?: { startHour: number; endHour: number };

    /**
     * IP whitelist
     */
    ipWhitelist?: string[];

    /**
     * Custom condition checker
     */
    custom?: (context: Record<string, unknown>) => boolean;
  };

  /**
   * Created timestamp
   */
  createdAt: number;

  /**
   * Expiration time
   */
  expiresAt?: number;
}

/**
 * Interface for multi-tenancy and access control
 */
export type IAccessControlManager = {
  /**
   * Create tenant
   */
  createTenant(config: TenantConfig): Promise<void>;

  /**
   * Update tenant
   */
  updateTenant(tenantId: string, config: Partial<TenantConfig>): Promise<void>;

  /**
   * Get tenant
   */
  getTenant(tenantId: string): Promise<TenantConfig>;

  /**
   * List tenants
   */
  listTenants(): Promise<TenantConfig[]>;

  /**
   * Delete tenant
   */
  deleteTenant(tenantId: string): Promise<void>;

  /**
   * Grant access to principal
   */
  grantAccess(ace: AccessControlEntry): Promise<void>;

  /**
   * Revoke access
   */
  revokeAccess(principalId: string, queuePattern: string): Promise<void>;

  /**
   * Check access for principal
   */
  checkAccess(
    principalId: string,
    queueName: string,
    permission: keyof QueuePermissions,
    context?: Record<string, unknown>
  ): Promise<boolean>;

  /**
   * Get access for principal
   */
  getPrincipalAccess(principalId: string): Promise<AccessControlEntry[]>;

  /**
   * Get queue access list
   */
  getQueueAccess(queueName: string): Promise<AccessControlEntry[]>;

  /**
   * Audit access (who did what)
   */
  auditAccess(
    principalId: string,
    action: string,
    queueName: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Get audit log
   */
  getAuditLog(filters?: {
    principalId?: string;
    queueName?: string;
    action?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<Array<{ principalId: string; action: string; queueName: string; timestamp: number; metadata?: Record<string, unknown> }>>;
}
