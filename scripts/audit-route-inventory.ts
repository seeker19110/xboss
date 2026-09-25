// S00: inventory cú pháp, KHÔNG suy quyền truy cập chỉ từ tên helper hoặc grep.
import ts from "typescript";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

export type RouteInventoryEntry = {
  file: string;
  sourceBlob: string;
  method: string;
  line: number;
  exportKind: string;
  calls: string[];
  reviewStatus: "NOT_MAPPED";
  reason: string;
};

function gitBlob(source: string): string {
  const bytes = Buffer.from(source);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((part) =>
    ts.isBindingElement(part) ? bindingNames(part.name) : [],
  );
}

/** Không import/thực thi route; source hỏng hoặc export chưa giải được luôn hiện trong báo cáo. */
export function inventoryRouteSource(file: string, source: string): RouteInventoryEntry[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const locals = new Map<string, ts.Node>();
  const entries: RouteInventoryEntry[] = [];
  const blob = gitBlob(source);
  const exported = (node: ts.Node) => {
    return (
      ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    );
  };

  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      locals.set(statement.name.text, statement);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          locals.set(declaration.name.text, declaration.initializer);
        }
      }
    }
  }

  const add = (method: string, node: ts.Node, kind: string, target?: ts.Node) => {
    const calls = new Set<string>();
    const seen = new Set<ts.Node>();
    const visit = (current: ts.Node) => {
      if (seen.has(current)) return;
      seen.add(current);
      if (ts.isCallExpression(current)) {
        const expression = current.expression;
        if (ts.isIdentifier(expression)) {
          calls.add(expression.text);
          const local = locals.get(expression.text);
          if (local) visit(local);
        } else if (ts.isPropertyAccessExpression(expression)) {
          // Chỉ identifier, không in argument, SQL, URL, secret hoặc source body.
          calls.add(expression.name.text);
        }
      }
      if (ts.isIdentifier(current)) {
        const local = locals.get(current.text);
        if (local) visit(local);
      }
      ts.forEachChild(current, visit);
    };
    if (target) visit(target);
    entries.push({
      file,
      sourceBlob: blob,
      method,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      exportKind: kind,
      calls: [...calls].sort(),
      reviewStatus: "NOT_MAPPED",
      reason: target
        ? "Cần review auth/scope/parent/DTO và test âm"
        : "Export chưa giải quyết tĩnh",
    });
  };

  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && exported(statement) && statement.name) {
      if (METHODS.has(statement.name.text)) {
        add(statement.name.text, statement, "function", statement);
      }
    } else if (ts.isVariableStatement(statement) && exported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) {
          if (METHODS.has(name)) {
            const target = ts.isIdentifier(declaration.name) ? declaration.initializer : undefined;
            add(name, declaration, target ? "variable" : "destructured", target);
          }
        }
      }
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly || !METHODS.has(element.name.text)) continue;
          const localName = (element.propertyName ?? element.name).text;
          const target = statement.moduleSpecifier ? undefined : locals.get(localName);
          add(
            element.name.text,
            element,
            statement.moduleSpecifier ? "re-export" : "alias",
            target,
          );
        }
      } else {
        add("*", statement, "wildcard-or-namespace");
      }
    }
  }

  // Dùng diagnostics chính thức của transpiler; không truy cập thuộc tính AST nội bộ.
  const diagnostics = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).diagnostics;
  if (diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error)) {
    add("*", sf, "syntax-error");
  }
  if (entries.length === 0) add("*", sf, "no-explicit-method");
  return entries;
}

/** Chỉ file được git theo dõi; symlink bị chặn, không đọc ra ngoài repo. */
export function collectRouteInventory(root: string) {
  const cwd = resolve(root);
  const git = (args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const sourceSha = git(["rev-parse", "HEAD"]).trim();
  const files = git(["ls-files", "-z", "--", "app/api"])
    .split("\0")
    .filter((file) => /\/route\.[cm]?[jt]sx?$/.test(file))
    .sort();
  if (files.length === 0) throw new Error("inventory_no_routes");
  const entries = files.flatMap((file) => {
    const absolute = resolve(cwd, file);
    const local = relative(cwd, absolute);
    if (local.startsWith(`..${sep}`) || local === "..") throw new Error("inventory_path_invalid");
    let parent = cwd;
    for (const part of local.split(sep)) {
      parent = resolve(parent, part);
      if (lstatSync(parent).isSymbolicLink()) throw new Error("inventory_symlink_rejected");
    }
    return inventoryRouteSource(file, readFileSync(absolute, "utf8"));
  });
  return {
    specVersion: "QUALITY-FINAL-1",
    sourceSha,
    workingTreeDirty: git(["status", "--porcelain", "--", "app/api"]).trim().length > 0,
    routeFileCount: files.length,
    explicitMethodCount: entries.filter((entry) => METHODS.has(entry.method)).length,
    unresolvedExportCount: entries.filter(
      (entry) => entry.method === "*" || entry.calls.length === 0,
    ).length,
    reviewStatus: "NOT_MAPPED" as const,
    entries,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error("inventory_usage");
    console.log(JSON.stringify(collectRouteInventory(process.argv[2] ?? process.cwd()), null, 2));
  } catch {
    console.error("Không tạo được inventory; kiểm đường dẫn repo, git và file route.");
    process.exitCode = 1;
  }
}
