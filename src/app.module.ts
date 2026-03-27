import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import appConfig from './config/app.config';
import { envValidationSchema } from './config/env.validation';
import { AppService } from './app.service';
import { WorkerModule } from './worker/worker.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppCacheModule } from './cache/app-cache.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true },
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    AppCacheModule,
    WorkerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply the throttler guard to every route in the application
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
