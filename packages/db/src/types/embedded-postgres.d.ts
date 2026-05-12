// Stub type declarations for embedded-postgres native module
// This module is only used for local embedded-postgres mode (not used with Supabase)
declare module 'embedded-postgres' {
  export interface EmbeddedPostgresInstance {
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    port: number;
  }

  export interface EmbeddedPostgresOptions {
    databaseDir?: string;
    user?: string;
    password?: string;
    port?: number;
    persistent?: boolean;
    initdbFlags?: string[];
    onLog?: (message: unknown) => void;
    onError?: (message: unknown) => void;
  }

  declare class EmbeddedPostgres {
    constructor(opts: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    port: number;
  }

  export default EmbeddedPostgres;
}
