// Stub implementation for test-embedded-postgres
// These utilities are only used for local embedded-postgres mode (not used with Supabase)

// Local type stub matching the embedded-postgres instance interface
interface EmbeddedPostgresInstance {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  port: number;
}

export type EmbeddedPostgresTestDatabase = EmbeddedPostgresInstance;
export type EmbeddedPostgresTestSupport = unknown;

export function getEmbeddedPostgresTestSupport(): EmbeddedPostgresTestSupport {
  return null as unknown as EmbeddedPostgresTestSupport;
}

export async function startEmbeddedPostgresTestDatabase(): Promise<EmbeddedPostgresTestDatabase> {
  // Returns a mock that satisfies the type - never actually called in production
  return {
    initialise: async () => {},
    start: async () => {},
    stop: async () => {},
    port: 0,
  };
}
