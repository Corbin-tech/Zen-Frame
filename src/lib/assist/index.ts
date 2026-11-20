import type { AssistProvider, ProviderStatus } from "./types.ts";
import { createCloudProvider } from "./cloudProvider.ts";
import type { initPlusStore } from "../../stores/plusStore.ts";

export * from "./types.ts";
export * from "./api.ts";
export * from "./sanitize.ts";

export async function pickProvider(consent = false): Promise<{ provider: AssistProvider | null; status: ProviderStatus }> {
  const plus = typeof window !== 'undefined' && window.Alpine?.store('plus') as ReturnType<typeof initPlusStore> | undefined;
  if (!plus?.account) return { provider: null, status: 'needs-plus' };
  if (!consent) return { provider: null, status: 'needs-consent' };
  return {
    provider: createCloudProvider({ getToken: async () => {
      const assist = window.Alpine.store('assist') as { consent: boolean } | undefined;
      if (!assist?.consent || !plus.account) return null;
      const email = plus.account.email;
      const token = await plus.getToken();
      return assist.consent && plus.account?.email === email ? token : null;
    } }),
    status: 'ready'
  };
}
