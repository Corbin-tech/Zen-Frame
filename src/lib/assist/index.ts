import type { AssistProvider, ProviderStatus } from "./types";

export * from "./types";
export * from "./api";
export * from "./sanitize";

// WS8 wires in Plus after entitlement and consent are integrated.
export async function pickProvider(): Promise<{ provider: AssistProvider | null; status: ProviderStatus }> {
  return { provider: null, status: "needs-plus" };
}
