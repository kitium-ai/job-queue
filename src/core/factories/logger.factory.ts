/**
 * Logger factory for creating component-specific loggers
 * Eliminates duplication of logger initialization logic
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';

export class LoggerFactory {
  /**
   * Create a logger for a specific component
   * @param component Component name (e.g., 'job-queue', 'event-coordinator', 'retry-coordinator')
   * @returns Logger instance with component context
   */
  createComponentLogger(component: string): ReturnType<typeof getLogger> {
    const baseLogger = getLogger();

    // Check if logger supports child context creation
    if ('child' in baseLogger && typeof baseLogger.child === 'function') {
      return (baseLogger as IAdvancedLogger).child({ component });
    }

    // Fallback to base logger if child is not supported
    return baseLogger;
  }
}
