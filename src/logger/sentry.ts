import * as Sentry from "@sentry/node";
import { 
  httpIntegration, 
  onUncaughtExceptionIntegration, 
  onUnhandledRejectionIntegration,
  expressIntegration,
  getDefaultIntegrations
} from "@sentry/node";
import { logger } from "./logger";

const dsn = process.env.SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
const release = process.env.SENTRY_RELEASE || process.env.npm_package_version || "unknown";
const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1");

export const initSentry = () => {
  if (!dsn) {
    logger.info("Sentry DSN not set; Sentry initialization skipped");
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    integrations: [
      ...getDefaultIntegrations({}),
      expressIntegration(),
      onUncaughtExceptionIntegration({
        onFatalError: (error) => {
          logger.error({ error }, "Sentry uncaught exception");
          process.exit(1);
        },
      }),
      onUnhandledRejectionIntegration({ mode: "warn" }),
    ],
    attachStacktrace: true,
    normalizeDepth: 5,
    beforeSend(event) {
      if (event.request && typeof event.request === "object") {
        delete (event.request as any).data;
      }
      return event;
    },
  });

  logger.info(
    {
      environment,
      release,
      tracesSampleRate,
    },
    "Sentry initialized",
  );
};

export const captureException = (exception: unknown) => {
  if (Sentry.getCurrentHub().getClient()) {
    Sentry.captureException(exception);
  }
};

export const addBreadcrumb = (breadcrumb: Sentry.Breadcrumb) => {
  if (Sentry.getCurrentHub().getClient()) {
    Sentry.addBreadcrumb(breadcrumb);
  }
};