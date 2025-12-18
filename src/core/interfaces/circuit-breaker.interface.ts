/**
 * Circuit breaker pattern interface for resilient job processing
 */

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

/**
 * Circuit breaker configuration
 */
export type CircuitBreakerConfig = {
  /**
   * Unique circuit breaker ID
   */
  id: string;

  /**
   * Job name to protect
   */
  jobName: string;

  /**
   * Failure threshold (% or count)
   */
  failureThreshold: number | { percentage: number; minRequests?: number };

  /**
   * Number of failures before opening circuit
   */
  failureWindow?: number;

  /**
   * Time window for failure counting (ms)
   */
  windowMs?: number;

  /**
   * Timeout before trying again (ms)
   */
  timeout?: number;

  /**
   * Number of successful requests needed in half-open to close
   */
  successThreshold?: number;

  /**
   * Callback on state change
   */
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;
}

/**
 * Circuit breaker statistics
 */
export type CircuitBreakerStats = {
  state: CircuitBreakerState;
  successCount: number;
  failureCount: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

/**
 * Interface for circuit breaker pattern
 */
export type ICircuitBreaker = {
  /**
   * Execute operation with circuit breaker protection
   */
  execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Get current state
   */
  getState(): CircuitBreakerState;

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats;

  /**
   * Manually open circuit
   */
  open(): void;

  /**
   * Manually close circuit
   */
  close(): void;

  /**
   * Reset circuit to initial state
   */
  reset(): void;
}

/**
 * Interface for managing multiple circuit breakers
 */
export type ICircuitBreakerManager = {
  /**
   * Create circuit breaker
   */
  createBreaker(config: CircuitBreakerConfig): Promise<ICircuitBreaker>;

  /**
   * Get circuit breaker
   */
  getBreaker(id: string): ICircuitBreaker | null;

  /**
   * List all breakers
   */
  listBreakers(): ICircuitBreaker[];

  /**
   * Remove circuit breaker
   */
  removeBreaker(id: string): Promise<void>;

  /**
   * Get all statistics
   */
  getAllStats(): Map<string, CircuitBreakerStats>;
}
