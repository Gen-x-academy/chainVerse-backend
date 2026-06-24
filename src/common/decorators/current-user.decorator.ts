import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (key: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as Record<string, unknown> | undefined;
    if (!user) return undefined;
    return key ? user[key] : user;
  },
);
