import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Static regression guard for `src/app.module.ts` (#1246).
 *
 * `AppModule` previously imported `CourseAnalyticsModule` twice, registered it
 * twice in the `imports` array, and registered `ScholarshipsModule` twice as
 * well.  Duplicate registrations are not a compile error — they are a Nest
 * runtime problem, because the same module class is instantiated more than
 * once and its providers stop being singletons.
 *
 * A bootstrap test would only catch this indirectly (and would need Mongo,
 * Redis and a live config to boot), so this spec inspects the decorator
 * metadata statically with the TypeScript compiler API: deterministic,
 * side-effect free, and it runs in milliseconds.
 */
describe('AppModule composition', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const appModulePath = path.join(repoRoot, 'src', 'app.module.ts');

  /** Parses `app.module.ts` and returns its @Module decorator metadata. */
  function parseAppModule() {
    const text = fs.readFileSync(appModulePath, 'utf8');
    const source = ts.createSourceFile(
      appModulePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    let metadata: ts.ObjectLiteralExpression | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node)) {
        // TypeScript 5 removed `node.decorators`; `getDecorators` is the
        // supported accessor and is present on every 5.x release this repo
        // can install (^5.7.3).
        for (const decorator of ts.getDecorators(node) ?? []) {
          // `decorator.expression` is the whole `Module({...})` call, so the
          // callee has to be unwrapped before its name can be compared.
          const call = decorator.expression;
          if (!ts.isCallExpression(call)) continue;
          if (!ts.isIdentifier(call.expression) || call.expression.text !== 'Module') {
            continue;
          }
          const arg = call.arguments[0];
          if (arg && ts.isObjectLiteralExpression(arg)) metadata = arg;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    if (!metadata) throw new Error('No @Module decorator metadata found in app.module.ts');
    return { source, text, metadata };
  }

  /** Returns the array literal assigned to `metadata.<key>`, if present. */
  function arrayProperty(
    source: ts.SourceFile,
    metadata: ts.ObjectLiteralExpression,
    key: string,
  ): ts.ArrayLiteralExpression | undefined {
    for (const prop of metadata.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (prop.name.getText(source) !== key) continue;
      if (!ts.isArrayLiteralExpression(prop.initializer)) continue;
      return prop.initializer;
    }
    return undefined;
  }

  /**
   * Every bare `Identifier` element of an array, e.g. `ScholarshipsModule`.
   */
  function bareClassNames(
    source: ts.SourceFile,
    array: ts.ArrayLiteralExpression,
  ): string[] {
    return array.elements.filter(ts.isIdentifier).map((el) => el.text);
  }

  /**
   * The name of a dynamic registration in the `imports` array, keyed by the
   * module class it configures.
   *
   * `ConfigModule.forRootAsync({...})` is a `CallExpression` whose callee is a
   * `PropertyAccessExpression`, so reading `.expression.text` off it yields
   * `undefined` — and five `undefined()` strings then look like five duplicate
   * registrations. This returns `ConfigModule` for that element.
   */
  function dynamicModuleNames(
    source: ts.SourceFile,
    array: ts.ArrayLiteralExpression,
  ): string[] {
    return array.elements
      .filter(ts.isCallExpression)
      .map((el) => {
        const callee = el.expression;
        return ts.isPropertyAccessExpression(callee)
          ? callee.expression.getText(source)
          : callee.getText(source);
      });
  }

  it('declares no duplicated import for the same module specifier', () => {
    const { source } = parseAppModule();
    const bySpecifier = new Map<string, string[]>();

    source.forEachChild((node) => {
      if (!ts.isImportDeclaration(node)) return;
      if (!ts.isStringLiteral(node.moduleSpecifier)) return;
      const specifier = node.moduleSpecifier.text;
      const names = node.importClause?.namedBindings;
      if (!names || !ts.isNamedImports(names)) return;
      for (const el of names.elements) {
        bySpecifier.set(specifier, [
          ...(bySpecifier.get(specifier) ?? []),
          (el.propertyName ?? el.name).text,
        ]);
      }
    });

    const duplicates: string[] = [];
    for (const [specifier, names] of bySpecifier) {
      const seen = new Set<string>();
      for (const name of names) {
        if (seen.has(name)) duplicates.push(`${name} <- ${specifier}`);
        seen.add(name);
      }
    }

    expect(duplicates).toEqual([]);
  });

  it('registers every module class exactly once in the imports array', () => {
    const { source, metadata } = parseAppModule();
    const imports = arrayProperty(source, metadata, 'imports');
    expect(imports).toBeDefined();

    const names = bareClassNames(source, imports!);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates).toEqual([]);
  });

  it('registers every dynamic module factory exactly once in the imports array', () => {
    const { source, metadata } = parseAppModule();
    const imports = arrayProperty(source, metadata, 'imports')!;

    const factories = imports.elements
      .filter(ts.isCallExpression)
      .map((el) => el.expression.getText(source));

    const duplicates = factories.filter((n, i) => factories.indexOf(n) !== i);
    expect(duplicates).toEqual([]);
  });

  it('keeps the scholarship feature modules registered once each', () => {
    const { source, metadata } = parseAppModule();
    const names = bareClassNames(
      source,
      arrayProperty(source, metadata, 'imports')!,
    );

    for (const moduleName of [
      'ScholarshipsModule',
      'ScholarshipModule',
      'ScholarshipDisbursementModule',
      'ScholarshipFinanceModule',
      'CourseAnalyticsModule',
    ]) {
      expect({
        moduleName,
        count: names.filter((n) => n === moduleName).length,
      }).toEqual({ moduleName, count: 1 });
    }
  });

  it('registers every controller and provider exactly once', () => {
    const { source, metadata } = parseAppModule();

    for (const key of ['controllers', 'providers'] as const) {
      const array = arrayProperty(source, metadata, key);
      expect(array).toBeDefined();
      const names = bareClassNames(source, array!);
      const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
      expect({ key, duplicates }).toEqual({ key, duplicates: [] });
    }
  });

  it('does not repeat a key in the @Module metadata object', () => {
    // A truncated block comment silently swallows the imports that follow it,
    // so a "second" half of the decorator reaches Nest as `undefined`
    // providers. The compiler flags repeated `imports`/`controllers` keys;
    // this turns that into an actionable failure instead of a DI crash.
    const { source, metadata } = parseAppModule();
    const keys = metadata.properties
      .filter(ts.isPropertyAssignment)
      .map((p) => p.name.getText(source));

    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('does not import AppModule into itself', () => {
    const { text } = parseAppModule();
    expect(text).not.toMatch(/from\s+['"]\.\/app\.module['"]/);
  });

  it('registers every imported module class in the imports array', () => {
    // Catches the "imported but never wired" case, which silently disables a
    // whole feature module at runtime.
    const { source, metadata } = parseAppModule();
    const imports = arrayProperty(source, metadata, 'imports')!;

    const registered = new Set(bareClassNames(source, imports));
    const registeredFactories = new Set(dynamicModuleNames(source, imports));

    // `Module` is the @Module decorator and `NestModule` is the interface
    // `AppModule implements`. Both are imported from '@nestjs/common' and end in
    // "Module", but neither is a Nest module that belongs in the imports array.
    const notAFeatureModule = new Set(['Module', 'NestModule']);

    const orphans: string[] = [];
    for (const stmt of source.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      const names = stmt.importClause?.namedBindings;
      if (!names || !ts.isNamedImports(names)) continue;
      for (const el of names.elements) {
        const local = el.name.text;
        const specifier = stmt.moduleSpecifier.getText(source);
        // Only Nest modules matter here; local helpers, config and enums do
        // not belong in the `imports` array.
        if (!/Module$/.test(local)) continue;
        if (notAFeatureModule.has(local)) continue;
        if (registered.has(local) || registeredFactories.has(local)) continue;
        orphans.push(`${local} <- ${specifier}`);
      }
    }

    expect(orphans).toEqual([]);
  });
});
