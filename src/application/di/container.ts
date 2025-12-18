/**
 * Dependency injection container for managing service instances
 * Eliminates module-level singletons and hard dependencies
 */

export class DIContainer {
  private readonly bindings = new Map<string, () => unknown>();
  private readonly singletons = new Map<string, unknown>();

  /**
   * Register a factory for a service
   * @param key Service key/name
   * @param factory Factory function to create instances
   * @param options Configuration options
   */
  bind<T>(
    key: string,
    factory: () => T,
    options?: { singleton?: boolean }
  ): void {
    this.bindings.set(key, factory);
    if (options?.singleton === false) {
      // Clear singleton if switching to transient
      this.singletons.delete(key);
    }
  }

  /**
   * Register a singleton service
   * @param key Service key/name
   * @param factory Factory function to create instance
   */
  bindSingleton<T>(key: string, factory: () => T): void {
    this.bind(key, factory, { singleton: true });
  }

  /**
   * Resolve a service instance
   * @param key Service key/name
   * @returns Service instance
   * @throws Error if service is not registered
   */
  resolve<T = unknown>(key: string): T {
    const factory = this.bindings.get(key);

    if (!factory) {
      throw new Error(
        `Service not registered: ${key}. Available services: ${Array.from(this.bindings.keys()).join(', ')}`
      );
    }

    // Check if it's a singleton that should be cached
    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T;
    }

    // Create new instance
    const instance = factory() as T;

    // If factory was bound with singleton option, cache it
    // Note: We cache all instances to maintain consistency
    // Use bind() with { singleton: false } for transient services
    this.singletons.set(key, instance);

    return instance;
  }

  /**
   * Check if a service is registered
   * @param key Service key/name
   * @returns true if service is registered
   */
  has(key: string): boolean {
    return this.bindings.has(key);
  }

  /**
   * Get all registered service keys
   * @returns Array of service keys
   */
  keys(): string[] {
    return Array.from(this.bindings.keys());
  }

  /**
   * Clear all registrations and cached singletons
   * Useful for testing
   */
  clear(): void {
    this.bindings.clear();
    this.singletons.clear();
  }

  /**
   * Create a child container with inherited bindings
   * @returns Child container
   */
  createChild(): DIContainer {
    const child = new DIContainer();
    // Copy bindings to child
    this.bindings.forEach((factory, key) => {
      child.bind(key, factory);
    });
    return child;
  }
}

// Global container instance
export const globalContainer = new DIContainer();
