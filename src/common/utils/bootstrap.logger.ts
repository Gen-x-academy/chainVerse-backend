import { Logger } from '@nestjs/common';

const logger = new Logger('Bootstrap');

/**
 * Logs a standardised startup banner once the app is listening.
 */
export function logStartup(port: number, env: string): void {
  logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logger.log(` ChainVerse API is running`);
  logger.log(` Port    : ${port}`);
  logger.log(` Env     : ${env}`);
  logger.log(` Swagger : http://localhost:${port}/api`);
  logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Logs a graceful-shutdown notice with the reason signal.
 */
export function logShutdown(signal: NodeJS.Signals): void {
  logger.warn(`Received ${signal} — initiating graceful shutdown`);
}

/**
 * Attaches one-time listeners for SIGTERM and SIGINT that call logShutdown.
 * Call this in bootstrap() after app.enableShutdownHooks().
 */
export function attachShutdownLogger(): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const sig of signals) {
    process.once(sig, () => logShutdown(sig));
  }
}

/**
 * Returns the current timestamp as an ISO string — handy for log prefixes.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Wraps bootstrap execution with top-level error handling so unhandled
 * rejections during startup are logged before the process exits.
 */
export function runBootstrap(fn: () => Promise<void>): void {
  fn().catch((err: unknown) => {
    logger.error('Fatal error during bootstrap', err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
}
