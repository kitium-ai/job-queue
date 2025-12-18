/**
 * Circuit breaker pattern implementation for resilient job processing
 */

import { getLogger } from '@kitiumai/logger';

import {
  type CircuitBreakerConfig,
  type CircuitBreakerState,
  CircuitBreakerState as CircuitBreakerStateEnum,
  type CircuitBreakerStats,
  type ICircuitBreaker,
  type ICircuitBreakerManager,
} from '../../core/interfaces/circuit-breaker.interface';

const logger = getLogger();
const SOURCE = '@kitiumai/job-queue/circuit-breaker';

/**
 * Circuit breaker implementation using state machine pattern
 */
export class CircuitBreaker implements ICircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerStateEnum.CLOSED;
  private stats: CircuitBreakerStats = {
    state: CircuitBreakerStateEnum.CLOSED,
    successCount: 0,
    failureCount: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
  };

  private readonly config: CircuitBreakerConfig;
  private nextAttemptAt = 0;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerStateEnum.OPEN) {
      if (Date.now() < this.nextAttemptAt) {
        throw new Error(`Circuit breaker is OPEN for ${this.config.id}`);
      }
      this.transitionTo(CircuitBreakerStateEnum.HALF_OPEN);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return { ...this.stats };
  }

  /**
   * Manually open circuit
   */
  open(): void {
    this.transitionTo(CircuitBreakerStateEnum.OPEN);
  }

  /**
   * Manually close circuit
   */
  close(): void {
    this.transitionTo(CircuitBreakerStateEnum.CLOSED);
  }

  /**
   * Reset circuit to initial state
   */
  reset(): void {
    this.stats = {
      state: CircuitBreakerStateEnum.CLOSED,
      successCount: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
    };
    this.transitionTo(CircuitBreakerStateEnum.CLOSED);
  }

  private onSuccess(): void {
    this.stats.successCount += 1;
    this.stats.consecutiveSuccesses += 1;
    this.stats.consecutiveFailures = 0;
    this.stats.lastSuccessAt = Date.now();

    if (this.state === CircuitBreakerStateEnum.HALF_OPEN) {
      const threshold = this.config.successThreshold ?? 2;
      if (this.stats.consecutiveSuccesses >= threshold) {
        this.transitionTo(CircuitBreakerStateEnum.CLOSED);
      }
    }
  }

  private onFailure(): void {
    this.stats.failureCount += 1;
    this.stats.consecutiveFailures += 1;
    this.stats.consecutiveSuccesses = 0;
    this.stats.lastFailureAt = Date.now();

    if (this.state === CircuitBreakerStateEnum.HALF_OPEN || this.shouldOpen()) {
      this.transitionTo(CircuitBreakerStateEnum.OPEN);
    }
  }

  private shouldOpen(): boolean {
    if (typeof this.config.failureThreshold === 'number') {
      return this.stats.consecutiveFailures >= this.config.failureThreshold;
    }

    const { percentage, minRequests = 5 } = this.config.failureThreshold;
    const totalRequests = this.stats.successCount + this.stats.failureCount;

    if (totalRequests < minRequests) {
      return false;
    }

    const failurePercentage = (this.stats.failureCount / totalRequests) * 100;
    return failurePercentage >= percentage;
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.stats.state = newState;

      if (newState === CircuitBreakerStateEnum.OPEN) {
        this.nextAttemptAt = Date.now() + (this.config.timeout ?? 60000);
      }

      logger.debug(`Circuit breaker ${this.config.id} transitioned: ${oldState} -> ${newState}`, {
        source: SOURCE,
      });

      this.config.onStateChange?.(oldState, newState);
    }
  }
}

/**
 * Circuit breaker manager for managing multiple breakers
 */
export class CircuitBreakerManager implements ICircuitBreakerManager {
  private readonly breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Create circuit breaker
   */
  createBreaker(config: CircuitBreakerConfig): Promise<ICircuitBreaker> {
    const breaker = new CircuitBreaker(config);
    this.breakers.set(config.id, breaker);
    logger.debug(`Created circuit breaker: ${config.id}`, { source: SOURCE });
    return Promise.resolve(breaker);
  }

  /**
   * Get circuit breaker
   */
  getBreaker(id: string): ICircuitBreaker | null {
    return this.breakers.get(id) ?? null;
  }

  /**
   * List all breakers
   */
  listBreakers(): ICircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  /**
   * Remove circuit breaker
   */
  removeBreaker(id: string): Promise<void> {
    this.breakers.delete(id);
    logger.debug(`Removed circuit breaker: ${id}`, { source: SOURCE });
    return Promise.resolve();
  }

  /**
   * Get all statistics
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    for (const [id, breaker] of this.breakers) {
      stats.set(id, breaker.getStats());
    }
    return stats;
  }
}
