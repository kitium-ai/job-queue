/**
 * Webhook and external integration interface
 */

// JobStatusInfo is not used in this file

/**
 * Webhook delivery strategy
 */
export enum WebhookDeliveryStrategy {
  /**
   * Fire-and-forget: no retries
   */
  BEST_EFFORT = 'best-effort',

  /**
   * Retry with exponential backoff
   */
  RELIABLE = 'reliable',

  /**
   * At-least-once delivery with idempotency
   */
  GUARANTEED = 'guaranteed',
}

/**
 * Webhook event types
 */
export enum WebhookEventType {
  JOB_COMPLETED = 'job.completed',
  JOB_FAILED = 'job.failed',
  JOB_STARTED = 'job.started',
  JOB_PROGRESS = 'job.progress',
  JOB_RETRYING = 'job.retrying',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_FAILED = 'workflow.failed',
}

/**
 * Webhook payload
 */
export type WebhookPayload = {
  /**
   * Event type
   */
  eventType: WebhookEventType;

  /**
   * Queue name
   */
  queue: string;

  /**
   * Job information
   */
  job: {
    id: string;
    name: string;
    status: string;
    data: Record<string, unknown>;
    attempts: number;
  };

  /**
   * Additional context
   */
  context?: Record<string, unknown>;

  /**
   * Timestamp
   */
  timestamp: number;

  /**
   * Unique event ID for deduplication
   */
  eventId: string;
}

/**
 * Webhook configuration
 */
export type WebhookConfig = {
  /**
   * Webhook URL
   */
  url: string;

  /**
   * Event types to subscribe to
   */
  events: WebhookEventType[];

  /**
   * Delivery strategy
   */
  deliveryStrategy?: WebhookDeliveryStrategy;

  /**
   * Custom headers
   */
  headers?: Record<string, string>;

  /**
   * Authentication
   */
  auth?: {
    type: 'bearer' | 'api-key' | 'hmac';
    credentials: string;
  };

  /**
   * Timeout for webhook delivery (ms)
   */
  timeoutMs?: number;

  /**
   * Max retry attempts
   */
  maxRetries?: number;

  /**
   * Batch webhooks (number of events per delivery)
   */
  batchSize?: number;

  /**
   * Active status
   */
  active: boolean;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Webhook delivery attempt record
 */
export type WebhookDeliveryAttempt = {
  /**
   * Event ID
   */
  eventId: string;

  /**
   * Webhook ID
   */
  webhookId: string;

  /**
   * HTTP status code
   */
  statusCode?: number;

  /**
   * Response body
   */
  response?: string;

  /**
   * Error message
   */
  error?: string;

  /**
   * Attempt number
   */
  attemptNumber: number;

  /**
   * Timestamp
   */
  timestamp: number;

  /**
   * Next retry at (if applicable)
   */
  nextRetryAt?: number;
}

/**
 * Interface for webhook management and delivery
 */
export type IWebhookManager = {
  /**
   * Register webhook
   */
  registerWebhook(config: WebhookConfig): Promise<string>;

  /**
   * Update webhook
   */
  updateWebhook(webhookId: string, config: Partial<WebhookConfig>): Promise<void>;

  /**
   * Delete webhook
   */
  deleteWebhook(webhookId: string): Promise<void>;

  /**
   * Get webhook configuration
   */
  getWebhook(webhookId: string): Promise<WebhookConfig>;

  /**
   * List all webhooks
   */
  listWebhooks(): Promise<WebhookConfig[]>;

  /**
   * Send webhook event
   */
  sendEvent(payload: WebhookPayload): Promise<void>;

  /**
   * Get delivery history
   */
  getDeliveryHistory(webhookId: string, limit?: number): Promise<WebhookDeliveryAttempt[]>;

  /**
   * Retry failed delivery
   */
  retryDelivery(eventId: string, webhookId: string): Promise<void>;

  /**
   * Test webhook
   */
  testWebhook(webhookId: string): Promise<{ statusCode: number; response: string }>;

  /**
   * Enable webhook
   */
  enableWebhook(webhookId: string): Promise<void>;

  /**
   * Disable webhook
   */
  disableWebhook(webhookId: string): Promise<void>;
}
