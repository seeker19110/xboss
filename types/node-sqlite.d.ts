// Khai báo type cho node:sqlite (builtin Node 22.5+/24) vì @types/node có thể chưa có.
declare module "node:sqlite" {
  type SqlValue = string | number | bigint | null | Uint8Array;
  interface StatementSync {
    all(...params: unknown[]): Record<string, SqlValue>[];
    get(...params: unknown[]): Record<string, SqlValue> | undefined;
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean; open?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
