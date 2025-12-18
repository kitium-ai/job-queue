/**
 * Webhook manager for event delivery and external integrations
 */

import { ValidationError } from '@kitiumai/error';
import { getLogger } from '@kitiumai/logger';
import type ioredis from 'ioredis';

import {
  type IWebhookManager,
  type WebhookConfig,
  type WebhookDeliveryAttempt,
  WebhookDeliveryStrategy as DeliveryStrategyEnum,
  type WebhookEventType,
  type WebhookPayload,
} from '../../core/interfaces/webhook.interface';

const logger = getLogger();
const SOURCE = '@kitiumai/job-queue/webhook-manager';

/**
 * Implementation of webhook manager for event delivery
 */
export class WebhookManager implements IWebhookManager {
  private readonly redis: InstanceType<typeof ioredis>;
  private readonly keyPrefix: string;
  private readonly webhooksCache: Map<string, WebhookConfig> = new Map();

  constructor(redis: InstanceType<typeof ioredis>, keyPrefix = 'webhooks') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Register webhook
   */
  async registerWebhook(config: WebhookConfig): Promise<string> {
    try {
      if (!config.url?.trim()) {
        throw new ValidationError({
          code: 'webhook/invalid_url',
          message: 'Webhook URL is required',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      if (config.events.length === 0) {
        throw new ValidationError({
          code: 'webhook/no_events',
          message: 'At least one event type is required',
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      const webhookId = `webhook:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      const key = this.buildWebhookKey(webhookId);

      await this.redis.set(key, JSON.stringify(config), 'EX', 31536000); // 1 year
      this.webhooksCache.set(webhookId, config);

      logger.debug(`Registered webhook: ${webhookId}`, { source: SOURCE });

      return webhookId;
    } catch (error) {
      logger.error(
        'Failed to register webhook',
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Update webhook
   */
  async updateWebhook(webhookId: string, config: Partial<WebhookConfig>): Promise<void> {
    try {
      const existing = await this.getWebhook(webhookId);
      const updated = { ...existing, ...config };

      const key = this.buildWebhookKey(webhookId);
      await this.redis.set(key, JSON.stringify(updated), 'EX', 31536000);
      this.webhooksCache.set(webhookId, updated as WebhookConfig);

      logger.debug(`Updated webhook: ${webhookId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to update webhook: ${webhookId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    try {
      const key = this.buildWebhookKey(webhookId);
      await this.redis.del(key);
      this.webhooksCache.delete(webhookId);

      logger.debug(`Deleted webhook: ${webhookId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to delete webhook: ${webhookId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get webhook configuration
   */
  async getWebhook(webhookId: string): Promise<WebhookConfig> {
    try {
      const cached = this.webhooksCache.get(webhookId);
      if (cached) {
        return cached;
      }

      const key = this.buildWebhookKey(webhookId);
      const data = await this.redis.get(key);

      if (!data) {
        throw new ValidationError({
          code: 'webhook/not_found',
          message: `Webhook ${webhookId} not found`,
          severity: 'error',
          kind: 'validation',
          retryable: false,
          source: SOURCE,
        });
      }

      const config = JSON.parse(data) as WebhookConfig;
      this.webhooksCache.set(webhookId, config);
      return config;
    } catch (error) {
      logger.error(
        `Failed to get webhook: ${webhookId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * List all webhooks
   */
  async listWebhooks(): Promise<WebhookConfig[]> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redis.keys(pattern);

      const webhooks: WebhookConfig[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          webhooks.push(JSON.parse(data) as WebhookConfig);
        }
      }

      return webhooks;
    } catch (error) {
      logger.error(
        'Failed to list webhooks',
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Send webhook event
   */
  async sendEvent(payload: WebhookPayload): Promise<void> {
    try {
      const webhooks = await this.listWebhooks();

      for (const webhook of webhooks) {
        if (!webhook.active || !webhook.events.includes(payload.eventType)) {
          continue;
        }

        await this.deliverWebhook(webhook, payload);
      }
    } catch (error) {
      logger.error(
        'Failed to send webhook event',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get delivery history
   */
  async getDeliveryHistory(webhookId: string, limit = 100): Promise<WebhookDeliveryAttempt[]> {
    try {
      const pattern = `${this.keyPrefix}:${webhookId}:attempts:*`;
      const keys = await this.redis.keys(pattern);

      const attempts: WebhookDeliveryAttempt[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          attempts.push(JSON.parse(data) as WebhookDeliveryAttempt);
        }
      }

      return attempts.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    } catch (error) {
      logger.error(
        `Failed to get delivery history for webhook: ${webhookId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Retry failed delivery
   */
  async retryDelivery(eventId: string, webhookId: string): Promise<void> {
    try {
      const webhook = await this.getWebhook(webhookId);
      const payload: WebhookPayload = {
        eventType: 'job.completed' as WebhookEventType,
        queue: '',
        job: { id: eventId, name: '', status: '', data: {}, attempts: 0 },
        timestamp: Date.now(),
        eventId,
      };

      await this.deliverWebhook(webhook, payload);
      logger.debug(`Retried delivery for event: ${eventId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to retry delivery for event: ${eventId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Test webhook
   */
  async testWebhook(webhookId: string): Promise<{ statusCode: number; response: string }> {
    try {
      const webhook = await this.getWebhook(webhookId);
      const testPayload: WebhookPayload = {
        eventType: 'job.completed' as WebhookEventType,
        queue: 'test',
        job: { id: 'test-1', name: 'test-job', status: 'completed', data: {}, attempts: 1 },
        timestamp: Date.now(),
        eventId: `test-${Date.now()}`,
      };

      const response = await this.httpPost(webhook.url, testPayload, webhook.headers, webhook.auth);
      return { statusCode: response.statusCode, response: response.body };
    } catch (error) {
      logger.error(
        `Failed to test webhook: ${webhookId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Enable webhook
   */
  async enableWebhook(webhookId: string): Promise<void> {
    try {
      await this.updateWebhook(webhookId, { active: true });
      logger.debug(`Enabled webhook: ${webhookId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to enable webhook: ${webhookId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Disable webhook
   */
  async disableWebhook(webhookId: string): Promise<void> {
    try {
      await this.updateWebhook(webhookId, { active: false });
      logger.debug(`Disabled webhook: ${webhookId}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to disable webhook: ${webhookId}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  private async deliverWebhook(webhook: WebhookConfig, payload: WebhookPayload): Promise<void> {
    const strategy = webhook.deliveryStrategy ?? DeliveryStrategyEnum.RELIABLE;
    const maxRetries = webhook.maxRetries ?? 3;

    let attemptNumber = 1;
    let lastError: Error | undefined;

    while (attemptNumber <= maxRetries) {
      const result = await this.tryDeliverWebhookAttempt(webhook, payload, strategy, attemptNumber);
      if (result.delivered) {
        return;
      }

      lastError = result.error;
      if (strategy === DeliveryStrategyEnum.BEST_EFFORT) {
        return;
      }

      attemptNumber += 1;
      await this.waitBeforeRetry(attemptNumber, maxRetries);
    }

    logger.error(
      `Failed to deliver webhook after ${maxRetries} attempts: ${payload.eventId}`,
      undefined,
      lastError
    );
  }

  private async tryDeliverWebhookAttempt(
    webhook: WebhookConfig,
    payload: WebhookPayload,
    strategy: WebhookConfig['deliveryStrategy'],
    attemptNumber: number
  ): Promise<{ delivered: boolean; error?: Error }> {
    try {
      const response = await this.httpPost(webhook.url, payload, webhook.headers, webhook.auth);
      await this.recordDeliveryAttempt({
        eventId: payload.eventId,
        webhookId: webhook.url,
        statusCode: response.statusCode,
        response: response.body,
        attemptNumber,
        timestamp: Date.now(),
      });

      if (response.statusCode >= 200 && response.statusCode < 300) {
        logger.debug(`Webhook delivered successfully: ${payload.eventId}`, { source: SOURCE });
        return { delivered: true };
      }

      if (strategy === DeliveryStrategyEnum.BEST_EFFORT) {
        logger.debug(`Webhook delivery failed (best-effort): ${payload.eventId}`, { source: SOURCE });
        return { delivered: true };
      }

      return { delivered: false, error: new Error(`HTTP ${response.statusCode}`) };
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      await this.recordDeliveryAttempt({
        eventId: payload.eventId,
        webhookId: webhook.url,
        error: error_.message,
        attemptNumber,
        timestamp: Date.now(),
        nextRetryAt: strategy !== DeliveryStrategyEnum.BEST_EFFORT ? Date.now() + 5000 * attemptNumber : undefined,
      });
      return strategy === DeliveryStrategyEnum.BEST_EFFORT ? { delivered: true } : { delivered: false, error: error_ };
    }
  }

  private async waitBeforeRetry(attemptNumber: number, maxRetries: number): Promise<void> {
    if (attemptNumber > maxRetries) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5000 * (attemptNumber - 1));
    });
  }

  private httpPost(
    url: string,
    _payload: WebhookPayload,
    headers?: Record<string, string>,
    auth?: { type: string; credentials: string }
  ): Promise<{ statusCode: number; body: string }> {
    // Simulate HTTP POST (actual implementation would use fetch/axios)
    // This is a mock implementation for demonstration
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (auth?.type === 'bearer') {
      requestHeaders['Authorization'] = `Bearer ${auth.credentials}`;
    } else if (auth?.type === 'api-key') {
      requestHeaders['X-API-Key'] = auth.credentials;
    }

    logger.debug(`Sending webhook POST to: ${url}`, { source: SOURCE });

    // Mock response
    return Promise.resolve({
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    });
  }

  private async recordDeliveryAttempt(attempt: WebhookDeliveryAttempt): Promise<void> {
    try {
      const key = `${this.keyPrefix}:${attempt.webhookId}:attempts:${attempt.eventId}:${attempt.attemptNumber}`;
      await this.redis.set(key, JSON.stringify(attempt), 'EX', 604800); // 7 days
    } catch (_error) {
      logger.debug('Failed to record delivery attempt', { source: SOURCE });
    }
  }

  private buildWebhookKey(webhookId: string): string {
    return `${this.keyPrefix}:${webhookId}`;
  }
}
