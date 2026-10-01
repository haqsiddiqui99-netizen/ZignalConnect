declare module "node:sqlite" {
  export type SQLInputValue = string | number | bigint | null | Uint8Array;

  interface StatementResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface StatementSync {
    run(...params: SQLInputValue[]): StatementResult;
    get(...params: SQLInputValue[]): unknown;
    all(...params: SQLInputValue[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
