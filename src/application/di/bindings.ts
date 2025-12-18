/**
 * Dependency injection bindings for job queue services
 * Registers all services and their dependencies in the DI container
 */

import { JobOptionsBuilder } from '../../core/factories/job-options.builder';
import { JobQueueErrorFactory } from '../../core/factories/job-queue-error.factory';
import { JobStatusFactory } from '../../core/factories/job-status.factory';
import { LoggerFactory } from '../../core/factories/logger.factory';
import type { IJobRetryStrategy } from '../../core/interfaces/retry-strategy.interface';
import { QueueConnectionManager } from '../../core/services/connection/queue-connection-manager';
import { RedisConnectionManager } from '../../core/services/connection/redis-connection-manager';
import { DLQManager } from '../../core/services/dlq/dlq-manager';
import { EventCoordinator } from '../../core/services/events/event-coordinator';
import { EventHandlerRegistry } from '../../core/services/events/event-handler-registry';
import { JobMetricsCollector } from '../../core/services/metrics/job-metrics-collector';
import { JobProcessingOrchestrator } from '../../core/services/processing/job-processing-orchestrator';
import { JobProcessorRegistry } from '../../core/services/processing/job-processor-registry';
import { JobRetryCoordinator } from '../../core/services/retry/job-retry-coordinator';
import { ExponentialBackoffStrategy } from '../../core/services/retry/retry-strategies/exponential-backoff.strategy';
import { ExponentialBackoffWithJitterStrategy } from '../../core/services/retry/retry-strategies/exponential-backoff-with-jitter.strategy';
import { LinearBackoffStrategy } from '../../core/services/retry/retry-strategies/linear-backoff.strategy';
import { JobStatusQueryService } from '../../core/services/status/job-status-query-service';
import { JobTelemetryService } from '../../core/services/telemetry/job-telemetry-service';
import { BullMQAdapter } from '../../infrastructure/adapters/bullmq/bullmq.adapter';
import { BullMQStateMapper } from '../../infrastructure/adapters/bullmq/bullmq-state-mapper';
import type { QueueConfig } from '../../shared/types/config.types';
import type { DIContainer } from './container';

/**
 * Register all bindings in the DI container
 * @param container DI container to register bindings in
 * @param config Queue configuration
 */
export function registerJobQueueBindings(container: DIContainer, config: QueueConfig): void {
  registerStateMapping(container);
  registerFactories(container);
  registerRetryStrategies(container);
  registerRegistries(container);
  registerConnections(container);
  registerCoreServices(container, config);
  registerAdapters(container);
}

function registerStateMapping(container: DIContainer): void {
  container.bindSingleton('BullMQStateMapper', () => new BullMQStateMapper());
}

function registerFactories(container: DIContainer): void {
  container.bindSingleton('LoggerFactory', () => new LoggerFactory());
  container.bindSingleton(
    'JobQueueErrorFactory',
    () =>
      new JobQueueErrorFactory(
        container.resolve<LoggerFactory>('LoggerFactory').createComponentLogger('job-queue-errors')
      )
  );
  container.bindSingleton(
    'JobStatusFactory',
    () => new JobStatusFactory(container.resolve<BullMQStateMapper>('BullMQStateMapper'))
  );
  container.bindSingleton('JobOptionsBuilder', () => new JobOptionsBuilder());
}

function registerRetryStrategies(container: DIContainer): void {
  container.bind<IJobRetryStrategy>('ExponentialBackoffStrategy', () => new ExponentialBackoffStrategy());
  container.bind<IJobRetryStrategy>('LinearBackoffStrategy', () => new LinearBackoffStrategy());
  container.bind<IJobRetryStrategy>(
    'ExponentialBackoffWithJitterStrategy',
    () => new ExponentialBackoffWithJitterStrategy()
  );
  container.bind<IJobRetryStrategy>('DefaultRetryStrategy', () => new ExponentialBackoffStrategy());
}

function registerRegistries(container: DIContainer): void {
  container.bindSingleton('EventHandlerRegistry', () => new EventHandlerRegistry());
  container.bindSingleton('JobProcessorRegistry', () => new JobProcessorRegistry());
}

function registerConnections(container: DIContainer): void {
  container.bindSingleton('RedisConnectionManager', () => new RedisConnectionManager());
  container.bindSingleton(
    'QueueConnectionManager',
    () =>
      new QueueConnectionManager(container.resolve<RedisConnectionManager>('RedisConnectionManager'))
  );
}

function registerCoreServices(container: DIContainer, config: QueueConfig): void {
  container.bindSingleton(
    'EventCoordinator',
    () => new EventCoordinator(container.resolve<EventHandlerRegistry>('EventHandlerRegistry'))
  );
  container.bindSingleton('JobMetricsCollector', () => new JobMetricsCollector(config.metrics));
  container.bindSingleton('JobTelemetryService', () => new JobTelemetryService(config.telemetry));
  container.bindSingleton(
    'JobRetryCoordinator',
    () => new JobRetryCoordinator(container.resolve<IJobRetryStrategy>('DefaultRetryStrategy'))
  );

  container.bindSingleton('DLQManager', () => {
    const queueClient = container
      .resolve<QueueConnectionManager>('QueueConnectionManager')
      .getQueueClient();
    if (!queueClient) {
      throw new Error('Queue client not initialized');
    }
    return new DLQManager(
      queueClient,
      container.resolve<EventCoordinator>('EventCoordinator'),
      container.resolve<JobMetricsCollector>('JobMetricsCollector'),
      config.dlq
    );
  });

  container.bindSingleton(
    'JobProcessingOrchestrator',
    () =>
      new JobProcessingOrchestrator(
        container.resolve<EventCoordinator>('EventCoordinator'),
        container.resolve<JobMetricsCollector>('JobMetricsCollector'),
        container.resolve<JobTelemetryService>('JobTelemetryService'),
        container.resolve<JobRetryCoordinator>('JobRetryCoordinator'),
        config.retry ?? { maxAttempts: 3, backoffType: 'exponential', backoffDelay: 1000 }
      )
  );

  container.bindSingleton('JobStatusQueryService', () => {
    const queueClient = container
      .resolve<QueueConnectionManager>('QueueConnectionManager')
      .getQueueClient();
    if (!queueClient) {
      throw new Error('Queue client not initialized');
    }
    return new JobStatusQueryService(
      queueClient,
      container.resolve<JobStatusFactory>('JobStatusFactory'),
      container.resolve<DLQManager>('DLQManager')
    );
  });
}

function registerAdapters(container: DIContainer): void {
  container.bindSingleton('QueueAdapter', () => new BullMQAdapter());
}

/**
 * Register test bindings (test doubles for dependencies)
 * @param container DI container to register bindings in
 * @param config Queue configuration
 */
export function registerJobQueueTestBindings(container: DIContainer, config: QueueConfig): void {
  // Use production bindings as base
  registerJobQueueBindings(container, config);

  // Override with test-specific implementations where needed
  // For now, same as production - but this is the place to add test doubles
  // Examples:
  // - MockEventCoordinator that tracks emitted events
  // - MockJobMetricsCollector that tracks recorded metrics
  // - InMemoryQueueClient for testing without Redis/BullMQ
}
