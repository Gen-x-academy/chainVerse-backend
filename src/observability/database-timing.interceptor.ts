import { 
  Injectable, 
  NestInterceptor, 
  ExecutionContext, 
  CallHandler 
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class DatabaseTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    
    // If request has timing capabilities, we can track database operations
    if ((request as any).startDatabaseTimer && (request as any).endDatabaseTimer) {
      // Store the original methods that might interact with the database
      // This is a simplified version - in a real app, you'd want to hook into your ORM
      // For TypeORM specifically, we can use event subscribers or query runners
      
      // For now, we'll add a helper that services can use to time database operations
      (request as any).trackDatabaseOperation = (operation: string, table: string, fn: Promise<any>) => {
        (request as any).startDatabaseTimer();
        return fn.finally(() => {
          (request as any).endDatabaseTimer(operation, table);
        });
      };
    }

    return next.handle();
  }
}