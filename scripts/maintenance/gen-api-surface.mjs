#!/usr/bin/env node
/**
 * Derives `packages/{core,client}/api-surface.json` from the TypeScript source of each
 * package's barrel (`src/index.ts`).
 *
 * It uses the TypeScript compiler API on the source files only: nothing from the project is
 * imported or executed, nothing is emitted, and there is no network access or randomness. The
 * same source and TypeScript version always give byte-identical output.
 *
 *   node scripts/maintenance/gen-api-surface.mjs            # write both files
 *   node scripts/maintenance/gen-api-surface.mjs --check    # exit 1 if either file is stale
 *
 * Snapshot schema (`api-surface.json`):
 *   constants  name -> typeof of a non-function value export ("bigint", "object", ...)
 *   functions  name -> "function" (functions, arrow-function consts, and classes the snapshot
 *              test does not list as classes or errors)
 *   types      name -> "class" | "interface" | "type"
 *   errors     name -> "class" (classes that extend Error)
 *
 * The categorisation deliberately mirrors the rules in `src/api-surface.test.ts` of each
 * package. If a rule changes there, change `PACKAGES` here in the same commit.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * - `typeSources`: the files the snapshot test scans for `export interface|type Name`. Only
 *   types declared in these files can be verified by the test, so only they are recorded.
 * - `classTypes`: value classes the test records under `types` rather than `functions`.
 */
const PACKAGES = [
  {
    name: "core",
    dir: "packages/core",
    typeSources: ["identity.ts", "tree.ts", "errors.ts"],
    classTypes: ["MerkleTree"],
  },
  {
    name: "client",
    dir: "packages/client",
    typeSources: [
      "identity.ts",
      "tree.ts",
      "prove.ts",
      "contract.ts",
      "config.ts",
      "errors.ts",
      "artifacts.ts",
      "brand.ts",
      "sdk.ts",
    ],
    classTypes: ["MerkleTree", "SdkEventEmitter", "SureCirclesSDK"],
  },
];

function loadProgram(pkgDir, entry) {
  const configPath = path.join(pkgDir, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, pkgDir);
  const options = { ...parsed.options, noEmit: true };
  return ts.createProgram({ rootNames: [entry], options });
}

function runtimeTypeof(checker, type) {
  const F = ts.TypeFlags;
  if (type.flags & F.StringLike) return "string";
  if (type.flags & F.NumberLike) return "number";
  if (type.flags & F.BigIntLike) return "bigint";
  if (type.flags & F.BooleanLike) return "boolean";
  if (type.flags & F.ESSymbolLike) return "symbol";
  if (type.flags & F.Undefined) return "undefined";
  return "object";
}

function extendsError(checker, classSymbol) {
  const seen = new Set();
  const visit = (sym) => {
    if (seen.has(sym)) return false;
    seen.add(sym);
    if (sym.getName() === "Error") return true;
    const declared = checker.getDeclaredTypeOfSymbol(sym);
    for (const base of checker.getBaseTypes(declared) ?? []) {
      const baseSym = base.getSymbol();
      if (baseSym && visit(baseSym)) return true;
    }
    return false;
  };
  return visit(classSymbol);
}

/**
 * Names the barrel exports at runtime. `export type *` and `export { type X }` re-export a name
 * for the type checker only, so the compiler's export table alone would over-report values.
 */
function runtimeExportNames(checker, entryFile) {
  const names = new Set();
  for (const statement of entryFile.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    const clause = statement.exportClause;
    if (!clause) {
      const target =
        statement.moduleSpecifier && checker.getSymbolAtLocation(statement.moduleSpecifier);
      if (target)
        for (const symbol of checker.getExportsOfModule(target)) names.add(symbol.getName());
    } else if (ts.isNamedExports(clause)) {
      for (const element of clause.elements) {
        if (!element.isTypeOnly) names.add(element.name.text);
      }
    }
  }
  return names;
}

function sorted(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function deriveSurface(pkg) {
  const pkgDir = path.join(repoRoot, pkg.dir);
  const entry = path.join(pkgDir, "src", "index.ts");
  const program = loadProgram(pkgDir, entry);
  const checker = program.getTypeChecker();
  const entryFile = program.getSourceFile(entry);
  const moduleSymbol = entryFile && checker.getSymbolAtLocation(entryFile);
  if (!moduleSymbol) throw new Error(`${pkg.name}: cannot resolve the module symbol of ${entry}`);

  const runtimeNames = runtimeExportNames(checker, entryFile);
  const scoped = new Set(pkg.typeSources.map((f) => path.join(pkgDir, "src", f)));
  const surface = { constants: {}, functions: {}, types: {}, errors: {} };
  const looseClasses = [];

  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const name = exported.getName();
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const F = ts.SymbolFlags;

    if (!runtimeNames.has(name)) {
      // Type-only at the barrel: recorded under `types` below, never as a value.
    } else if (symbol.flags & F.Class) {
      if (extendsError(checker, symbol)) surface.errors[name] = "class";
      else if (pkg.classTypes.includes(name)) surface.types[name] = "class";
      else {
        // typeof class === "function", which is how the snapshot test files it.
        surface.functions[name] = "function";
        looseClasses.push(name);
      }
    } else if (symbol.flags & F.Function) {
      surface.functions[name] = "function";
    } else if (symbol.flags & (F.Variable | F.Enum)) {
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      const type = declaration
        ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
        : checker.getTypeOfSymbol(symbol);
      if (type.getCallSignatures().length > 0) surface.functions[name] = "function";
      else surface.constants[name] = runtimeTypeof(checker, type);
    }

    if (!(name in surface.types)) {
      for (const declaration of symbol.declarations ?? []) {
        if (!scoped.has(path.normalize(declaration.getSourceFile().fileName))) continue;
        if (ts.isInterfaceDeclaration(declaration)) surface.types[name] = "interface";
        else if (ts.isTypeAliasDeclaration(declaration)) surface.types[name] = "type";
      }
    }
  }

  return {
    json:
      JSON.stringify(
        {
          constants: sorted(surface.constants),
          functions: sorted(surface.functions),
          types: sorted(surface.types),
          errors: sorted(surface.errors),
        },
        null,
        2,
      ) + "\n",
    looseClasses,
  };
}

const check = process.argv.includes("--check");
let stale = false;

for (const pkg of PACKAGES) {
  const { json, looseClasses } = deriveSurface(pkg);
  const target = path.join(repoRoot, pkg.dir, "api-surface.json");
  if (looseClasses.length > 0) {
    console.error(
      `${pkg.name}: classes recorded under "functions" (not errors, not in classTypes): ${looseClasses.join(", ")}`,
    );
  }
  if (check) {
    const current = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (current !== json) {
      stale = true;
      console.error(`${pkg.dir}/api-surface.json is out of date`);
    }
  } else {
    writeFileSync(target, json);
    console.error(`wrote ${pkg.dir}/api-surface.json`);
  }
}

if (stale) process.exit(1);
