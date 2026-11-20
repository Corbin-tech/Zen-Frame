import { verifyHmac } from "../auth/crypto.ts";
import { unixTime } from "../auth/db.ts";
import { HttpError, readBody } from "../auth/http.ts";

export interface StripeEnv {
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_MONTHLY_PRICE?: string;
    STRIPE_ANNUAL_PRICE?: string;
    STRIPE_AUTOMATIC_TAX?: string;
}

export type Plan = "monthly" | "annual";

type StripeSubscription = {
    status: string;
    items: { data: Array<{ price: { id: string }; current_period_end: number }> };
};

export type StripeEvent = {
    type: string;
    data: { object: { customer?: string; client_reference_id?: string } };
};

const STRIPE_API_VERSION = "2025-04-30.basil";

export function createStripe(env: StripeEnv, transport = fetch) {
    const { STRIPE_SECRET_KEY: key, STRIPE_MONTHLY_PRICE: monthly, STRIPE_ANNUAL_PRICE: annual } = env;
    if (!key || !/^(sk|rk)_test_/.test(key) || !monthly || !annual || monthly === annual
        || ![monthly, annual].every((price) => /^price_[a-zA-Z0-9]+$/.test(price))) {
        throw new Error("Stripe test mode is not configured");
    }

    async function call<T>(path: string, fields?: Record<string, string>, idempotency?: string): Promise<T> {
        const headers = new Headers({ Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_API_VERSION });
        if (idempotency) headers.set("Idempotency-Key", idempotency);
        const response = await transport("https://api.stripe.com/v1" + path, {
            method: fields ? "POST" : "GET",
            headers,
            body: fields ? new URLSearchParams(fields) : undefined,
            redirect: "error",
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error("Stripe API request failed");
        }
        return await response.json() as T;
    }

    function hostedUrl(value: string, hostname: string): string {
        const url = new URL(value);
        if (url.origin !== `https://${hostname}` || url.username || url.password) throw new Error("Invalid Stripe URL");
        return url.href;
    }

    return {
        async customer(accountId: string, email: string): Promise<string> {
            const { id } = await call<{ id: string }>("/customers", { email, "metadata[zen_frame_account]": accountId },
                `zen-frame-customer-${accountId}`);
            if (!isCustomer(id)) throw new Error("Invalid Stripe customer");
            return id;
        },
        async checkout(customer: string, plan: Plan, intent: string, expiresAt: number, origin: URL) {
            const session = await call<{ id: string; url: string }>("/checkout/sessions", {
                customer,
                mode: "subscription",
                client_reference_id: intent,
                "line_items[0][price]": plan === "monthly" ? monthly : annual,
                "line_items[0][quantity]": "1",
                expires_at: String(expiresAt),
                success_url: new URL("/?plus=paid", origin).href,
                cancel_url: new URL("/?plus=cancelled", origin).href,
                ...(env.STRIPE_AUTOMATIC_TAX === "true" ? {
                    "automatic_tax[enabled]": "true",
                    "customer_update[address]": "auto"
                } : {})
            }, `zen-frame-checkout-${intent}`);
            if (!/^cs_test_[a-zA-Z0-9]+$/.test(session.id)) throw new Error("Invalid Stripe Checkout session");
            return { id: session.id, url: hostedUrl(session.url, "checkout.stripe.com") };
        },
        async checkoutStatus(session: string) {
            return (await call<{ status: string }>(`/checkout/sessions/${encodeURIComponent(session)}`)).status;
        },
        async expireCheckout(session: string) {
            await call(`/checkout/sessions/${encodeURIComponent(session)}/expire`, {});
        },
        async portal(customer: string, origin: URL): Promise<string> {
            const { url } = await call<{ url: string }>("/billing_portal/sessions", {
                customer, return_url: new URL("/?plus=portal", origin).href
            });
            return hostedUrl(url, "billing.stripe.com");
        },
        async subscriptionState(customer: string) {
            let plusUntil = 0;
            let hasSubscription = false;
            const query = new URLSearchParams({ customer, status: "all", limit: "100" });
            for (let page = 0; page < 10; page++) {
                const list = await call<{ data: (StripeSubscription & { id: string })[]; has_more: boolean }>(
                    "/subscriptions?" + query
                );
                for (const subscription of list.data) {
                    const items = subscription.items.data.filter(({ price }) => price.id === monthly || price.id === annual);
                    if (items.length && !["canceled", "incomplete_expired"].includes(subscription.status)) {
                        hasSubscription = true;
                    }
                    if (subscription.status === "active") {
                        for (const { current_period_end: end } of items) {
                            if (Number.isSafeInteger(end)) plusUntil = Math.max(plusUntil, end);
                        }
                    }
                }
                if (!list.has_more) return { plusUntil, hasSubscription };
                const lastId = list.data.at(-1)?.id;
                if (!lastId) break;
                query.set("starting_after", lastId);
            }
            throw new Error("Could not reconcile Stripe subscriptions");
        }
    };
}

export function isCustomer(value: unknown): value is string {
    return typeof value === "string" && /^cus_[a-zA-Z0-9]+$/.test(value);
}

export async function verifyStripeEvent(request: Request, env: StripeEnv, now = unixTime()): Promise<StripeEvent> {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret?.startsWith("whsec_")) throw new Error("Stripe webhook not configured");
    const header = request.headers.get("Stripe-Signature");
    const invalid = new HttpError(400, "invalid_stripe_signature");
    if (!header || header.length > 4096) throw invalid;
    const parts = header.split(",").map((part) => part.trim());
    const timestamps = parts.filter((part) => part.startsWith("t="));
    const timestamp = timestamps.length === 1 && /^t=\d{1,12}$/.test(timestamps[0]) ? timestamps[0].slice(2) : "";
    if (!timestamp || Math.abs(now - Number(timestamp)) > 300) throw invalid;

    let text: string;
    try {
        const bytes = await readBody(request, 512 * 1024);
        text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw invalid;
    }
    const signatures = parts.filter((part) => /^v1=[a-fA-F0-9]{64}$/.test(part));
    let verified = false;
    for (const signature of signatures) {
        const bytes = Uint8Array.from(signature.slice(3).match(/../g)!, (byte) => parseInt(byte, 16));
        if (await verifyHmac(secret, timestamp + "." + text, bytes)) {
            verified = true;
            break;
        }
    }
    if (!verified) throw invalid;
    let event: Partial<StripeEvent> & { livemode?: boolean };
    try { event = JSON.parse(text); } catch { throw new HttpError(400, "invalid_stripe_event"); }
    if (!event || event.livemode !== false || typeof event.type !== "string" || !event.data?.object) {
        throw new HttpError(400, "invalid_stripe_event");
    }
    return event as StripeEvent;
}
