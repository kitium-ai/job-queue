/**
 * Event handler registry for managing job queue event listeners
 */

import type { JobEventHandler, QueueEvent } from '../../../types';

/**
 * Registry for managing event handlers
 * Eliminates event handler map management from JobQueue class
 */
export class EventHandlerRegistry {
  private readonly handlers = new Map<QueueEvent, Set<JobEventHandler>>();

  /**
   * Register an event handler
   * @param event Event name
   * @param handler Event handler function
   */
  register(event: QueueEvent, handler: JobEventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  /**
   * Unregister an event handler
   * @param event Event name
   * @param handler Event handler function
   * @returns True if handler was removed
   */
  unregister(event: QueueEvent, handler: JobEventHandler): boolean {
    const handlers = this.handlers.get(event);
    if (!handlers) {
      return false;
    }
    return handlers.delete(handler);
  }

  /**
   * Get all handlers for an event
   * @param event Event name
   * @returns Set of handlers for the event
   */
  getHandlers(event: QueueEvent): Set<JobEventHandler> {
    return this.handlers.get(event) ?? new Set();
  }

  /**
   * Clear handlers for a specific event or all events
   * @param event Optional event name; if not provided, clears all
   */
  clear(event?: QueueEvent): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Check if there are handlers for an event
   * @param event Event name
   * @returns True if handlers exist
   */
  hasHandlers(event: QueueEvent): boolean {
    const handlers = this.handlers.get(event);
    return handlers !== undefined && handlers.size > 0;
  }

  /**
   * Get count of handlers for an event
   * @param event Event name
   * @returns Number of handlers
   */
  getHandlerCount(event: QueueEvent): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * Get all registered events
   * @returns Array of event names with handlers
   */
  getRegisteredEvents(): QueueEvent[] {
    return Array.from(this.handlers.keys());
  }
}
