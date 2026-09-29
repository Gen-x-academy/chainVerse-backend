import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ScholarshipProgramsController } from '../controllers/scholarship-programs.controller';
import { ScholarshipProgramsService } from '../services/scholarship-programs.service';

/**
 * The public route surface of `scholarships/programs` (#1248).
 *
 * `PATCH :programId/status` used to write an arbitrary `status` straight to the
 * document, skipping the lifecycle state machine and the `statusHistory` audit
 * trail. It has been removed, and these tests lock that in: any future
 * re-introduction of a non-validating status route has to change this file,
 * which makes the bypass visible in review.
 */
describe('ScholarshipProgramsController route surface', () => {
  type RouteInfo = { method: string; path: string };

  /** Every route Nest would register for this controller. */
  function routes(): RouteInfo[] {
    const controllerPath =
      Reflect.getMetadata(PATH_METADATA, ScholarshipProgramsController) ?? '';
    const prototype = ScholarshipProgramsController.prototype as Record<
      string,
      unknown
    >;

    const found: RouteInfo[] = [];
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor') continue;
      const handler = prototype[name];
      if (typeof handler !== 'function') continue;

      const path = Reflect.getMetadata(PATH_METADATA, handler as object);
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        handler as object,
      ) as RequestMethod | undefined;
      if (path === undefined || method === undefined) continue;

      found.push({
        method: RequestMethod[method],
        path: ['', controllerPath, path].filter(Boolean).join('/'),
      });
    }
    return found;
  }

  it('registers no direct program status route', () => {
    const statusRoutes = routes().filter((r) => r.path.endsWith('/status'));
    expect(statusRoutes).toEqual([]);
  });

  it('exposes exactly one route that can change a program status', () => {
    const mutating = routes()
      .filter((r) => r.method !== RequestMethod.GET)
      .map((r) => `${r.method} ${r.path}`)
      .sort();

    expect(mutating).toEqual([
      'PATCH /scholarships/programs/:programId/applications/:applicationId',
      'PATCH /scholarships/programs/:programId/transition',
      'POST /scholarships/programs',
      'POST /scholarships/programs/:programId/terms',
      'POST /scholarships/programs/:programId/terms/:versionId/publish',
    ]);
  });

  it('routes every status change through the validated transition endpoint', () => {
    const transition = routes().find(
      (r) => r.path === '/scholarships/programs/:programId/transition',
    );
    expect(transition).toEqual({
      method: 'PATCH',
      path: '/scholarships/programs/:programId/transition',
    });
  });

  it('keeps the transition handler bound to the validating service method', () => {
    const prototype = ScholarshipProgramsController.prototype as Record<
      string,
      unknown
    >;
    const handler = prototype['transitionStatus'] as (...args: unknown[]) => unknown;

    const programsService = {
      transitionProgramStatus: jest.fn().mockResolvedValue({ status: 'published' }),
    } as unknown as ScholarshipProgramsService;

    const controller = new ScholarshipProgramsController(
      programsService,
      {} as never,
    );

    handler.call(
      controller,
      'program-1',
      { organizationId: 'org-1' },
      { status: 'published' },
      'staff-1',
    );

    expect(programsService.transitionProgramStatus).toHaveBeenCalledWith(
      'org-1',
      'program-1',
      'published',
      'staff-1',
    );
  });

  it('has no handler left that calls a non-validating status setter', () => {
    // Defence in depth: even if a route were added back by mistake, the
    // service it would have to use no longer exists.
    const serviceSurface = Object.getOwnPropertyNames(
      ScholarshipProgramsService.prototype,
    );
    expect(serviceSurface).not.toContain('setProgramStatus');
  });
});
