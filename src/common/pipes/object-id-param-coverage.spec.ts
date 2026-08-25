import * as fs from 'fs';
import * as path from 'path';

/**
 * Guards the "every Mongo identifier is validated at the edge" rule.
 *
 * A pipe that exists but is applied inconsistently is the same bug as no pipe
 * at all, so this walks every controller and fails when an identifier-shaped
 * route parameter reaches a handler without a pipe. Parameters that are not
 * MongoDB identifiers are opted out explicitly below, with the reason, rather
 * than by loosening the check.
 */
const SRC_ROOT = path.join(__dirname, '..', '..');

/** `<controller path relative to src>:<param name>` → why it is not an ObjectId. */
const NON_OBJECT_ID_PARAMS: Record<string, string> = {
  'badge/badge.controller.ts:tokenId':
    'on-chain NFT token id, not a Mongo document id',
  'certification/certification.controller.ts:id':
    'on-chain certificate id looked up via CertificateTx, not a Mongo document id',
  'reports/reports.controller.ts:id':
    'stub report endpoint backed by static data, not Mongo',
  'addup/organization-user.controller.ts:id':
    'numeric TypeORM organization id, not a Mongo document id',
  'verification/verification.controller.ts:eventId':
    'event UUID, already validated with ParseUUIDPipe',
};

const IDENTIFIER_PARAM = /^(id|.*Id)$/;

// Captures the parameter name and whatever follows it inside the @Param(...) call.
const PARAM_DECORATOR = /@Param\(\s*['"]([^'"]+)['"]\s*(,[^)]*)?\)/g;

function collectControllers(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      found.push(...collectControllers(full));
    } else if (entry.name.endsWith('.controller.ts')) {
      found.push(full);
    }
  }
  return found;
}

describe('ObjectId route parameter coverage', () => {
  const controllers = collectControllers(SRC_ROOT);

  it('finds the controllers to check', () => {
    expect(controllers.length).toBeGreaterThan(10);
  });

  it('validates every MongoDB identifier parameter with a pipe', () => {
    const unguarded: string[] = [];

    for (const file of controllers) {
      const relative = path.relative(SRC_ROOT, file).split(path.sep).join('/');
      const source = fs.readFileSync(file, 'utf8');

      for (const match of source.matchAll(PARAM_DECORATOR)) {
        const [, name, pipeArgument] = match;
        if (!IDENTIFIER_PARAM.test(name)) continue;
        if (NON_OBJECT_ID_PARAMS[`${relative}:${name}`]) continue;
        if (pipeArgument && pipeArgument.trim().length > 1) continue;

        unguarded.push(`${relative}: @Param('${name}')`);
      }
    }

    expect(unguarded).toEqual([]);
  });

  it('keeps the opt-out list free of stale entries', () => {
    const stale = Object.keys(NON_OBJECT_ID_PARAMS).filter((key) => {
      const [relative, name] = key.split(':');
      const file = path.join(SRC_ROOT, relative);
      if (!fs.existsSync(file)) return true;

      const source = fs.readFileSync(file, 'utf8');
      return ![...source.matchAll(PARAM_DECORATOR)].some(
        ([, param]) => param === name,
      );
    });

    expect(stale).toEqual([]);
  });
});
