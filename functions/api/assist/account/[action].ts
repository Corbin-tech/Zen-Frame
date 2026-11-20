import { type AccountEnv, handleAccount } from "../../../../server/auth/handler.ts";

export function onRequest({ request, params, env }: { request: Request; params: { action?: string }; env: AccountEnv }) {
    return handleAccount(request, params.action ?? "", env);
}
