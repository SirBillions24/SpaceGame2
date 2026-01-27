/**
 * Dedicated Error Logger
 * 
 * Writes critical errors to a separate log file for historical analysis.
 * Separate from stdout/systemd journal - only captures problems.
 * 
 * Log location: /home/bone/oldschoolempire/logs/errors.log
 * Format: JSON Lines (one JSON object per line)
 * 
 * Categories:
 * - REDIS_CONNECTION: Redis client connection errors
 * - REDIS_READONLY: Redis read-only mode detected
 * - WORKER_ERROR: BullMQ worker errors
 * - QUEUE_ERROR: BullMQ queue errors
 * - SOCKET_ERROR: Socket.IO errors
 * - UNCAUGHT_EXCEPTION: process.on('uncaughtException')
 * - UNHANDLED_REJECTION: process.on('unhandledRejection')
 * - STARTUP_FAILURE: Server failed to start
 */

import fs from 'fs';
import path from 'path';

export type ErrorCategory = 
  | 'REDIS_CONNECTION'
  | 'REDIS_READONLY'
  | 'WORKER_ERROR'
  | 'QUEUE_ERROR'
  | 'SOCKET_ERROR'
  | 'UNCAUGHT_EXCEPTION'
  | 'UNHANDLED_REJECTION'
  | 'STARTUP_FAILURE';

interface ErrorLogEntry {
  timestamp: string;
  category: ErrorCategory;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

// Log directory at project root (outside server/src)
const LOG_DIR = path.join(__dirname, '../../../logs');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');

// Ensure log directory exists on module load
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create log directory:', err);
}

/**
 * Log an error to the dedicated error log file.
 * Non-blocking - errors are appended asynchronously.
 * Also logs to console for systemd journal capture.
 */
export function logError(
  category: ErrorCategory, 
  error: Error | string, 
  metadata?: Record<string, unknown>
): void {
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    category,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    metadata,
  };

  const line = JSON.stringify(entry) + '\n';
  
  // Append to file (non-blocking)
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) {
      // Don't throw - just warn to console
      console.error('Failed to write to error log:', err.message);
    }
  });

  // Also log to console for systemd journal
  console.error(`[${category}] ${entry.message}`);
}

/**
 * Synchronous version for use in crash handlers where async might not complete.
 */
export function logErrorSync(
  category: ErrorCategory, 
  error: Error | string, 
  metadata?: Record<string, unknown>
): void {
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    category,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    metadata,
  };

  const line = JSON.stringify(entry) + '\n';
  
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (err) {
    console.error('Failed to write to error log:', err);
  }

  console.error(`[${category}] ${entry.message}`);
}

/**
 * Check if an error message indicates Redis read-only mode.
 */
export function isRedisReadOnlyError(error: Error | string): boolean {
  const message = error instanceof Error ? error.message : error;
  return message.includes('READONLY') || 
         message.includes('read only replica') ||
         message.includes('read-only');
}

/**
 * Get the path to the error log file (for external tools).
 */
export function getErrorLogPath(): string {
  return LOG_FILE;
}



