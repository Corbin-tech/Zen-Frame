import { type BillingEnv, handleBilling } from "../../../../server/billing/handler.ts";

export function onRequest({ request, params, env }: { request: Request; params: { action?: string }; env: BillingEnv }) {
    return handleBilling(request, params.action ?? "", env);
}
