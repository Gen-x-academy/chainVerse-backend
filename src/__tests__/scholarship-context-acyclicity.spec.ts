import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Static guard for the bounded-context dependency rules (#1247).
 *
 * ADR 0001 fixes one direction for money flow: everything points AT
 * `scholarship-finance`, and `scholarship-finance` points at nothing. A cycle, or
 * a back-edge into finance, reintroduces exactly the ambiguity the ADR removes —
 * and it is invisible at runtime, because Nest will happily wire a circular
 * module graph as long as the classes resolve.
 *
 * This spec therefore inspects the import graph directly. It is deterministic,
 * needs no database and runs in milliseconds, which makes it a far cheaper trip
 * wire than an integration test that would only fail on the first request that
 * touched the cycle.
 */
describe('Scholarship bounded-context dependency rules (#1247)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');

  /** The four scholarship bounded contexts and their directory roots. */
  const CONTEXTS = {
    scholarships: path.join(repoRoot, 'src', 'scholarships'),
    scholarship: path.join(repoRoot, 'src', 'scholarship'),
    'scholarship-disbursement': path.join(repoRoot, 'src', 'scholarship-disbursement'),
    'scholarship-finance': path.join(repoRoot, 'src', 'scholarship-finance'),
  } as const;

  type ContextName = keyof typeof CONTEXTS;

  /** Every `.ts` file under `dir`, relative to `dir`. */
  function filesIn(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...filesIn(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out.sort();
  }

  const contextOf = (file: string): ContextName | null => {
    for (const [name, dir] of Object.entries(CONTEXTS)) {
      if (file.startsWith(dir + path.sep)) return name as ContextName;
    }
    return null;
  };

  /**
   * Resolves a relative import specifier to a context, or null when it leaves
   * the scholarship area (a shared module, a Nest package, a test helper).
   */
  function resolvesToContext(
    from: string,
    specifier: string,
  ): ContextName | null {
    if (!specifier.startsWith('.')) return null;
    const resolved = path.resolve(path.dirname(from), specifier);
    return contextOf(resolved);
  }

  /** `context -> set of contexts it imports from`. */
  function buildGraph(): Map<ContextName, Set<ContextName>> {
    const graph = new Map<ContextName, Set<ContextName>>();
    for (const root of Object.values(CONTEXTS)) {
      for (const file of filesIn(root)) {
        const from = contextOf(file);
        if (!from) continue;
        const source = ts.createSourceFile(
          file,
          fs.readFileSync(file, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        );
        for (const stmt of source.statements) {
          if (!ts.isImportDeclaration(stmt)) continue;
          if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
          const to = resolvesToContext(file, stmt.moduleSpecifier.text);
          if (!to || to === from) continue;
          const edges = graph.get(from) ?? new Set<ContextName>();
          edges.add(to);
          graph.set(from, edges);
        }
      }
    }
    return graph;
  }

  const FINANCE: ContextName = 'scholarship-finance';

  it('has scholarship-finance as a leaf — nothing it owns points back', () => {
    const graph = buildGraph();
    const violations: string[] = [];

    for (const [from, edges] of graph) {
      for (const to of edges) {
        // The rule: no context imports FROM scholarship-finance.
        if (to === FINANCE) violations.push(`${from} -> ${to}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps each of the four contexts internally connected to itself', () => {
    // Guards against a context being emptied by an over-eager rename: each one
    // must still contain files that belong to it.
    for (const [name, dir] of Object.entries(CONTEXTS)) {
      expect(
        { context: name, files: filesIn(dir).length },
        `context "${name}" should still contain source files`,
      ).toEqual({ context: name, files: filesIn(dir).length });
      expect(filesIn(dir).length).toBeGreaterThan(0);
    }
  });

  it('has no cycle in the inter-context import graph', () => {
    const graph = buildGraph();
    const visiting = new Set<ContextName>();
    const done = new Set<ContextName>();

    const visit = (node: ContextName, trail: ContextName[]): void => {
      if (done.has(node)) return;
      if (visiting.has(node)) {
        throw new Error(
          `circular dependency: ${[...trail, node].join(' -> ')}`,
        );
      }
      visiting.add(node);
      for (const next of graph.get(node) ?? []) visit(next, [...trail, node]);
      visiting.delete(node);
      done.add(node);
    };

    for (const node of Object.keys(CONTEXTS) as ContextName[]) visit(node, []);
  });

  it('declares the finance context as the money-flow leaf in the ADR', () => {
    // Keeps the documentation and the enforced rule from drifting apart: if
    // someone adds a back-edge, this fails too, so the spec cannot be satisfied
    // by the ADR quietly going stale.
    const adr = fs.readFileSync(
      path.join(repoRoot, 'docs', 'adr', '0001-scholarship-bounded-contexts.md'),
      'utf8',
    );
    expect(adr).toMatch(/scholarship-finance[\s\S]{0,400}leaf/i);
  });
});
