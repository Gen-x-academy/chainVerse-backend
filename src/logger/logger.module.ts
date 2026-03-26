import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import * as crypto from 'crypto';
import { IncomingMessage } from 'http';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const level = config.get<string>('logLevel') ?? 'info';

        return {
          pinoHttp: {
            level,
            /**
             * Reuse an incoming X-Request-Id header when present so that
             * upstream callers can correlate logs across service boundaries;
             * otherwise generate a fresh UUID.
             */
            genReqId: (req: IncomingMessage) =>
              (req.headers['x-request-id'] as string) ??
              crypto.randomUUID(),

            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode: number }) => ({
                statusCode: res.statusCode,
              }),
            },

            // Avoid logging every request to the liveness probe
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url === '/health/live',
            },
          },
        };
      },
    }),
  ],
})
export class AppLoggerModule {}
