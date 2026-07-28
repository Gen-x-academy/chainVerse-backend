import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { databaseQueryDuration } from '../metrics/prom-client';

@Injectable()
export class DatabaseTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle();
  }

  static trackDatabaseOperation<T>(
    operation: string,
    table: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const end = databaseQueryDuration.startTimer({ operation, table });
    return fn().finally(end);
  }
}
