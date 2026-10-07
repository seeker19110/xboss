// S00: inventory cú pháp, KHÔNG suy quyền truy cập chỉ từ tên helper hoặc grep.
import prettier from "prettier";
import ts from "typescript";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classify,
  extractHandwritten,
  findTestMentions,
  readWhitelist,
  renderMarkdown,
} from "./lib/route-scope-report";

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
  /** Dữ kiện cú pháp (S00 scope) — KHÔNG phải kết luận an toàn. */
  facts: RouteFacts;
};

export type RouteFacts = {
  auth: string[];
  permChecks: string[];
  projectResolvers: string[];
  fallbackProject1: boolean;
  clientProjectId: boolean;
  clientProjectChecked: boolean;
  nullAsWide: string[];
  libDomains: string[];
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

const AUTH_SESSION = new Set(["getCurrentUser", "requireAdmin", "getAgentSession"]);
const AUTH_OTHER_TOKEN = new Set([
  "trafficToken",
  "parseTotpPendingToken",
  "parseToken",
  "authorizationCodeGrant",
  "makeToken",
  "verifyPassword",
]);
const CHECK_PROJECT = new Set([
  "chotProjectIdChoGhi",
  "chotProjectIdChoDoc",
  "getVerifiedProjectId",
]);
const RESOLVER_CORE = new Set([
  "getCurrentProjectId",
  "chotProjectIdChoDoc",
  "chotProjectIdChoGhi",
]);
const RESOLVER_OTHER =
  /ProjectId$|InProject$|BelongsToProject$|ForProject$|^withProjectScope$|^visibleProjectIds$|^getVerifiedProjectId$|^projectExists$/;
const CLIENT_SOURCE_CALL = new Set(["json", "formData", "text"]);
const SQL_NULL_WIDE =
  /\?\s+IS\s+NULL\s+OR|\bOR\s+\?\s+IS\s+NULL|project_id\s+IS\s+NULL\s+OR|\bOR\s+\w*\.?project_id\s+IS\s+NULL|COALESCE\(\s*\?\s*,\s*\w*\.?project_id\s*\)/i;
const isProjectName = (text: string) => /project/i.test(text);
// Chỉ chuỗi rỗng (mảnh SQL bị bỏ) mới là "bỏ lọc"; `[]`/`null` là nhánh từ chối (fail-closed).
const isEmptyish = (n: ts.Expression) => ts.isStringLiteralLike(n) && n.text.trim() === "";

function stringTexts(node: ts.Node): string[] {
  const out: string[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n)) out.push(n.text);
    else if (ts.isTemplateExpression(n)) {
      out.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return out;
}

const EQ_OPS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/** Rút dữ kiện cú pháp từ các node đã thăm của một handler (đã theo hàm cục bộ). */
function extractFacts(nodes: ts.Node[], calls: Set<string>, sf: ts.SourceFile): RouteFacts {
  const auth = new Set<string>();
  const perms = new Set<string>();
  const resolvers = new Set<string>();
  const nullWide = new Set<string>();
  const clientVars = new Set<string>();
  let fallback1 = false;
  let clientProject = false;

  for (const call of calls) {
    if (AUTH_SESSION.has(call)) auth.add("session");
    if (call === "checkCronSecret") auth.add("cron-secret");
    if (call === "requireApiKey") auth.add("api-key");
    if (/device/i.test(call)) auth.add("device");
    if (AUTH_OTHER_TOKEN.has(call)) auth.add("token-khac");
    if (call === "requireApiKey" || call === "requireAdmin" || call === "isAdminOrPm") {
      perms.add(call);
    } else if (call === "checkCronSecret") {
      perms.add(call);
    } else if (/^(?:can|require)[A-Z]/.test(call) && !AUTH_SESSION.has(call)) {
      perms.add(call);
    }
    if (RESOLVER_CORE.has(call)) resolvers.add(call);
    else if (RESOLVER_OTHER.test(call)) resolvers.add(`khác:${call}`);
  }

  // Biến nhận dữ liệu thô từ client: `x = await req.json()` / `.formData()` / searchParams.
  for (const n of nodes) {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name)) {
      let fromClient = false;
      const seek = (c: ts.Node) => {
        if (
          ts.isCallExpression(c) &&
          ts.isPropertyAccessExpression(c.expression) &&
          CLIENT_SOURCE_CALL.has(c.expression.name.text)
        ) {
          fromClient = true;
        }
        if (ts.isPropertyAccessExpression(c) && c.name.text === "searchParams") fromClient = true;
        ts.forEachChild(c, seek);
      };
      seek(n.initializer);
      if (fromClient) clientVars.add(n.name.text);
    }
  }

  for (const n of nodes) {
    if (ts.isPropertyAccessExpression(n)) {
      if (ts.isIdentifier(n.expression) && n.expression.text === "CAN") {
        perms.add(`CAN.${n.name.text}`);
      }
      if (
        (n.name.text === "projectId" || n.name.text === "project_id") &&
        ts.isIdentifier(n.expression) &&
        (clientVars.has(n.expression.text) || n.expression.text === "body")
      ) {
        clientProject = true;
      }
    }
    if (
      ts.isBinaryExpression(n) &&
      EQ_OPS.has(n.operatorToken.kind) &&
      (/\.role$/.test(n.left.getText(sf)) || /\.role$/.test(n.right.getText(sf)))
    ) {
      perms.add(".role==");
    }
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "get" &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      /^(projectId|project_id)$/.test(n.arguments[0].text)
    ) {
      clientProject = true;
    }
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer) {
      const names = n.name.elements.map((e) => (e.propertyName ?? e.name).getText(sf));
      const init = n.initializer;
      const fromClient =
        (ts.isIdentifier(init) && (clientVars.has(init.text) || init.text === "body")) ||
        /\.(?:json|formData)\(/.test(init.getText(sf));
      if (fromClient && names.some((x) => x === "projectId" || x === "project_id")) {
        clientProject = true;
      }
    }
    // Literal rơi về dự án 1: `x || 1`, `x ?? 1`, `projectId = 1`.
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
      ts.isNumericLiteral(n.right) &&
      n.right.text === "1"
    ) {
      let owner = "";
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
        if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isParameter(p)) {
          owner = p.name.getText(sf);
          break;
        }
        if (ts.isStatement(p)) break;
      }
      if (isProjectName(n.left.getText(sf)) || isProjectName(owner)) fallback1 = true;
    }
    if (
      (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) &&
      n.initializer &&
      ts.isNumericLiteral(n.initializer) &&
      n.initializer.text === "1" &&
      isProjectName(n.name.getText(sf))
    ) {
      fallback1 = true;
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isNumericLiteral(n.right) &&
      n.right.text === "1" &&
      isProjectName(n.left.getText(sf))
    ) {
      fallback1 = true;
    }

    // NULL-as-wide: SQL tự bỏ lọc khi tham số NULL.
    if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) {
      if (stringTexts(n).some((t) => SQL_NULL_WIDE.test(t))) {
        nullWide.add("SQL `? IS NULL OR` / `project_id IS NULL OR`");
      }
    }
    // NULL-as-wide: `projectId ?? "*"` mở ngữ cảnh RLS cross-project khi projectId null.
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        n.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
      ts.isStringLiteralLike(n.right) &&
      n.right.text === "*" &&
      isProjectName(n.left.getText(sf))
    ) {
      nullWide.add('`projectId ?? "*"` (GUC RLS cross-project khi null)');
    }
    // NULL-as-wide: điều kiện JS chỉ thêm lọc project_id khi projectId có giá trị.
    if (ts.isConditionalExpression(n) && isProjectName(n.condition.getText(sf))) {
      const keep = isEmptyish(n.whenTrue)
        ? n.whenFalse
        : isEmptyish(n.whenFalse)
          ? n.whenTrue
          : null;
      if (keep && stringTexts(keep).some((t) => /project_id/i.test(t))) {
        nullWide.add("điều kiện ?: bỏ mệnh đề project_id khi projectId rỗng");
      }
    }
    if (ts.isIfStatement(n) && !n.elseStatement && isProjectName(n.expression.getText(sf))) {
      const cond = n.expression.getText(sf);
      const positive =
        !/^\s*!(?!=)/.test(cond) && !/(?<![!=])={2,3}\s*(?:null|undefined)/.test(cond);
      if (positive && stringTexts(n.thenStatement).some((t) => /project_id/i.test(t))) {
        nullWide.add("if (projectId) mới thêm lọc project_id, không có else");
      }
    }
  }

  const checked = [...calls].some((c) => CHECK_PROJECT.has(c));
  const libDomains = new Set<string>();
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const m = /^@\/lib\/([^/]+)\//.exec(s.moduleSpecifier.text);
      if (m) libDomains.add(m[1]);
    }
  }
  return {
    auth: [...auth].sort(),
    permChecks: [...perms].sort(),
    projectResolvers: [...resolvers].sort(),
    fallbackProject1: fallback1,
    clientProjectId: clientProject,
    clientProjectChecked: clientProject && checked,
    nullAsWide: [...nullWide].sort(),
    libDomains: [...libDomains].sort(),
  };
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
    const visited: ts.Node[] = [];
    const visit = (current: ts.Node) => {
      if (seen.has(current)) return;
      seen.add(current);
      visited.push(current);
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
    // CRON_SECRET đọc từ env cũng là cơ chế xác thực (Bearer).
    for (const n of visited) {
      if (
        (ts.isIdentifier(n) && n.text === "CRON_SECRET") ||
        (ts.isStringLiteralLike(n) && n.text === "CRON_SECRET") ||
        (ts.isPropertyAccessExpression(n) && n.name.text === "CRON_SECRET")
      ) {
        calls.add("checkCronSecret");
      }
    }
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
      facts: extractFacts(visited, calls, sf),
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

export const SCOPE_DOC = "docs/nang-cap/AUDIT-2026-09-25/S00-SCOPE-INVENTORY.md";

/** Phân loại toàn bộ (file, method) và dựng Markdown; `existingDoc` giữ phần viết tay. */
export async function generateScopeMarkdown(root: string, existingDoc: string | null) {
  const cwd = resolve(root);
  const inv = collectRouteInventory(cwd);
  const ctx = {
    permWhitelist: readWhitelist(resolve(cwd, "scripts/check-route-perms.ts")),
    projectWhitelist: readWhitelist(resolve(cwd, "scripts/check-project-scope.ts")),
  };
  const mentions = findTestMentions(cwd, [...new Set(inv.entries.map((e) => e.file))]);
  const rows = inv.entries.map((e) => classify(e, ctx, mentions.get(e.file) ?? []));
  return {
    inv,
    rows,
    // Qua prettier để `format:check` không đòi chỉnh lại bảng (đầu ra đã ổn định theo prettier).
    markdown: await prettier.format(renderMarkdown(inv, rows, extractHandwritten(existingDoc)), {
      ...((await prettier.resolveConfig(resolve(cwd, SCOPE_DOC))) ?? {}),
      parser: "markdown",
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void (async () => {
    try {
      const args = process.argv.slice(2);
      let format = "json";
      let out: string | null = null;
      let root = process.cwd();
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--format") format = args[++i] ?? "";
        else if (args[i] === "--out") out = args[++i] ?? null;
        else if (args[i].startsWith("--")) throw new Error("inventory_usage");
        else root = args[i];
      }
      if (format !== "json" && format !== "md") throw new Error("inventory_usage");
      if (format === "json") {
        console.log(JSON.stringify(collectRouteInventory(root), null, 2));
      } else {
        const target = resolve(root, out ?? SCOPE_DOC);
        let existing: string | null = null;
        try {
          existing = readFileSync(target, "utf8");
        } catch {
          existing = null;
        }
        const { markdown } = await generateScopeMarkdown(root, existing);
        if (out) {
          writeFileSync(target, markdown);
          console.log(`Đã ghi ${out}`);
        } else {
          process.stdout.write(markdown);
        }
      }
    } catch {
      console.error("Không tạo được inventory; kiểm đường dẫn repo, git và file route.");
      process.exitCode = 1;
    }
  })();
}
