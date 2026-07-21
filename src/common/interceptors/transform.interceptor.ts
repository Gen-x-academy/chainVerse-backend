import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../dto/api-response.dto';

/**
 * TransformInterceptor wraps every successful controller response in the
 * standard {@link ApiResponse} envelope so the frontend `api-client.ts`
 * can reliably parse all responses.
 *
 * Error responses are NOT touched here — they are handled by
 * {@link AllExceptionsFilter} and already carry a consistent shape.
 *
 * Registration: `app.useGlobalInterceptors(new TransformInterceptor())` in main.ts
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
