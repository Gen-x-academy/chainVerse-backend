import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * Logs graceful shutdown events triggered by enableShutdownHooks().
 * Extend this class (or inject it) to add cleanup logic per module.
 */
@Injectable()
export class ShutdownHook implements OnModuleDestroy {
  private readonly logger = new Logger(ShutdownHook.name);

  onModuleDestroy(): void {
    this.logger.log('Received shutdown signal — cleaning up resources...');
  }
}

/**
 * Utility that registers a one-time SIGTERM/SIGINT listener and resolves
 * a promise when the signal arrives. Useful in bootstrap for ordered teardown.
 */
export function waitForShutdownSignal(): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => resolve();
    process.once('SIGTERM', handler);
    process.once('SIGINT', handler);
  });
}

/**
 * Returns a human-readable uptime string from process.uptime().
 */
export function formatUptime(): string {
  const seconds = Math.floor(process.uptime());
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

/**
 * Logs process memory usage to the supplied logger instance.
 */
export function logMemoryUsage(logger: Logger): void {
  const { heapUsed, heapTotal, rss } = process.memoryUsage();
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  logger.debug(`Memory — heap: ${mb(heapUsed)}/${mb(heapTotal)}, rss: ${mb(rss)}`);
}
