import type { LogLevel } from '../types/index.js';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

const PREFIX = '[geospatial-audio]';

class Logger {
  private level: LogLevel = 'warn';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  debug(...args: unknown[]): void {
    if (LEVEL_RANK[this.level] <= LEVEL_RANK.debug) {
      console.debug(PREFIX, ...args);
    }
  }

  info(...args: unknown[]): void {
    if (LEVEL_RANK[this.level] <= LEVEL_RANK.info) {
      console.info(PREFIX, ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (LEVEL_RANK[this.level] <= LEVEL_RANK.warn) {
      console.warn(PREFIX, ...args);
    }
  }

  error(...args: unknown[]): void {
    if (LEVEL_RANK[this.level] <= LEVEL_RANK.error) {
      console.error(PREFIX, ...args);
    }
  }
}

/** Shared logger instance for the library. */
export const logger = new Logger();
export { Logger };
