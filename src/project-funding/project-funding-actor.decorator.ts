import { ProjectFundingActorContext } from './entities';

type FundingRequestUser = {
  sub?: unknown;
  id?: unknown;
  email?: unknown;
  role?: unknown;
};

export type FundingHttpRequest = {
  user?: FundingRequestUser;
  headers?: Record<string, unknown>;
};

export function readProjectFundingActor(
  request: FundingHttpRequest,
): ProjectFundingActorContext {
  const user = request.user ?? {};
  const headers = request.headers ?? {};

  return {
    id:
      typeof user.sub === 'string'
        ? user.sub
        : typeof user.id === 'string'
          ? user.id
          : '',
    email: typeof user.email === 'string' ? user.email : '',
    role: typeof user.role === 'string' ? user.role : '',
    tenantId:
      typeof headers['x-tenant-id'] === 'string' ? headers['x-tenant-id'] : '',
    requestId:
      typeof headers['x-request-id'] === 'string'
        ? headers['x-request-id']
        : '',
  };
}
