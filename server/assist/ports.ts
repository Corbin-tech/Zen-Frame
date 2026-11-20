export interface ModelClient {
  generate(input: { system: string; user: string; schema: unknown; maxTokens: number; signal: AbortSignal }): Promise<{ kind: 'ok'; json: unknown } | { kind: 'refusal' | 'error' | 'timeout' }>;
}
export type Identity = { accountId: string; sessionId: string };
export interface EntitlementGate {
  authenticate(token: string): Promise<Identity | null>;
  reserve(identity: Identity): Promise<{ complete(): Promise<boolean>; release(): Promise<void> } | null>;
}
export interface RateLimiter { limit(key: string): Promise<boolean> | boolean }
