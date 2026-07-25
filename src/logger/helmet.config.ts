import { HelmetOptions } from "helmet";

export function createHelmetConfig(): HelmetOptions {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:", "http://localhost:3000"],
        fontSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  };
}