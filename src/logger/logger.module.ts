import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import * as crypto from 'crypto';
import { IncomingMessage } from 'http';
import { redact } from '../common/utils/redaction';

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
            genReqId: (req: IncomingMessage) =>
              (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
            serializers: {
              req: (req) => redact(req),
              res: (res) => redact(res),
            },
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
