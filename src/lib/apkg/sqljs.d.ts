declare module 'sql.js' {
  export interface Statement {
    bind(values?: readonly (string | number | null | Uint8Array)[]): boolean
    step(): boolean
    get(): unknown[]
    getAsObject(): Record<string, string | number | Uint8Array | null>
    run(values?: readonly (string | number | null | Uint8Array)[]): void
    free(): void
  }

  export interface Database {
    run(sql: string): Database
    exec(sql: string): { columns: string[]; values: unknown[][] }[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => Database
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string
    wasmBinary?: ArrayBuffer | Uint8Array
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>
}
