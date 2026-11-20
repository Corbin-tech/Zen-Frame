import type { AssistProvider, ProviderStatus } from "./types.ts";

export * from "./types.ts";
export * from "./api.ts";
export * from "./sanitize.ts";

// WS8 wires in Plus after entitlement and consent are integrated.
export async function pickProvider(): Promise<{ provider: AssistProvider | null; status: ProviderStatus }> {
  return { provider: null, status: "needs-plus" };
}
