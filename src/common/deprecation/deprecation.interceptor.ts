import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import {
  DEPRECATION_METADATA_KEY,
  DeprecationOptions,
} from './deprecation.decorator';

@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const deprecationOptions =
      this.reflector.get<DeprecationOptions>(
        DEPRECATION_METADATA_KEY,
        handler,
      ) ||
      this.reflector.get<DeprecationOptions>(
        DEPRECATION_METADATA_KEY,
        controller,
      );

    if (deprecationOptions) {
      const httpContext = context.switchToHttp();
      const response = httpContext.getResponse();

      if (deprecationOptions.sunset) {
        response.setHeader('Sunset', deprecationOptions.sunset);
      }

      if (deprecationOptions.successorUrl) {
        let linkHeader = `<${deprecationOptions.successorUrl}>; rel="successor"`;
        if (deprecationOptions.documentationUrl) {
          linkHeader += `, <${deprecationOptions.documentationUrl}>; rel="documentation"`;
        }
        response.setHeader('Link', linkHeader);
      }
    }

    return next.handle();
  }
}
