import { type Account, type PlusDatabase, unixTime } from "../auth/db.ts";
import { appOrigin, handlePost, HttpError, json, type OriginEnv, readJson, requireSameOrigin, ServiceError } from "../auth/http.ts";
import { requireSession } from "../auth/session.ts";
import { createStripe, isCustomer, type Plan, type StripeEnv, type StripeEvent, verifyStripeEvent } from "./stripe.ts";

export type BillingEnv = OriginEnv & StripeEnv & { PLUS_DB: PlusDatabase };

type Checkout = {
    checkout_id: string | null;
    checkout_session: string | null;
    checkout_url: string | null;
    checkout_plan: Plan | null;
    checkout_until: number;
};

const SUBSCRIPTION_EVENTS = new Set([
    "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
    "customer.subscription.paused", "customer.subscription.resumed", "checkout.session.completed",
    "checkout.session.async_payment_succeeded"
]);

function clearCheckout(db: PlusDatabase, accountId: string, intent: string) {
    return db.prepare(`
        UPDATE plus_accounts SET checkout_id = NULL, checkout_session = NULL, checkout_url = NULL,
            checkout_plan = NULL, checkout_until = 0
        WHERE id = ? AND checkout_id = ?
    `).bind(accountId, intent).run();
}

function readCheckout(db: PlusDatabase, accountId: string) {
    return db.prepare(`
        SELECT checkout_id, checkout_session, checkout_url, checkout_plan, checkout_until FROM plus_accounts WHERE id = ?
    `).bind(accountId).first<Checkout>();
}

async function startCheckout(env: BillingEnv, stripe: ReturnType<typeof createStripe>, account: Account, plan: Plan, origin: URL) {
    const db = env.PLUS_DB;
    const now = unixTime();
    const existing = await readCheckout(db, account.id);
    if (account.plus_until > now) throw new HttpError(409, "manage_existing_subscription");
    if (existing && existing.checkout_until > now) {
        if (existing.checkout_plan === plan && existing.checkout_url) return existing.checkout_url;
        throw new HttpError(409, "checkout_pending");
    }

    const intent = crypto.randomUUID();
    // One active Checkout per account, including across devices and payment attempts.
    const until = now + 35 * 60;
    const claimed = await db.prepare(`
        UPDATE plus_accounts SET checkout_id = ?1, checkout_until = ?2, checkout_plan = ?3,
            checkout_session = NULL, checkout_url = NULL
        WHERE id = ?4 AND checkout_until <= ?5 AND plus_until <= ?5 RETURNING stripe_customer
    `).bind(intent, until, plan, account.id, now).first<{ stripe_customer: string | null }>();
    if (!claimed) throw new HttpError(409, "checkout_pending");

    let customer = claimed.stripe_customer;
    try {
        if (!customer) {
            customer = await stripe.customer(account.id, account.email);
            await db.prepare("UPDATE plus_accounts SET stripe_customer = ? WHERE id = ?").bind(customer, account.id).run();
        }
        if ((await stripe.subscriptionState(customer)).hasSubscription) throw new HttpError(409, "manage_existing_subscription");
    } catch (error) {
        await clearCheckout(db, account.id, intent);
        throw error;
    }

    // Once a Checkout create was attempted, a transport error doesn't prove Stripe didn't create it.
    // Keep the lock through Stripe's expiry in that case, rather than allow a second subscription.
    const session = await stripe.checkout(customer, plan, intent, until, origin);
    await db.prepare("UPDATE plus_accounts SET checkout_session = ?, checkout_url = ? WHERE id = ? AND checkout_id = ?")
        .bind(session.id, session.url, account.id, intent).run();
    return session.url;
}

async function cancelCheckout(db: PlusDatabase, stripe: ReturnType<typeof createStripe>, account: Account) {
    const existing = await readCheckout(db, account.id);
    if (!existing?.checkout_id || existing.checkout_until <= unixTime()) return;
    if (!existing.checkout_session) throw new HttpError(409, "checkout_pending");

    // A second tab may finish payment while this tab asks to abandon Checkout.
    const state = await stripe.checkoutStatus(existing.checkout_session);
    if (state === "complete") throw new HttpError(409, "manage_existing_subscription");
    if (state === "open") await stripe.expireCheckout(existing.checkout_session);
    else if (state !== "expired") throw new Error("Unexpected Stripe Checkout status");
    await clearCheckout(db, account.id, existing.checkout_id);
}

async function reconcileStripeEvent(event: StripeEvent, env: BillingEnv, transport: typeof fetch) {
    const expired = event.type === "checkout.session.expired";
    if (!expired && !SUBSCRIPTION_EVENTS.has(event.type)) return;
    const { customer, client_reference_id: intent } = event.data.object;
    if (!isCustomer(customer)) return;
    const db = env.PLUS_DB;
    if (expired) {
        if (typeof intent === "string") {
            const account = await db.prepare("SELECT id FROM plus_accounts WHERE stripe_customer = ?").bind(customer).first<{ id: string }>();
            if (account) await clearCheckout(db, account.id, intent);
        }
        return;
    }

    // Every relevant event reads the current Stripe state rather than applying a possibly stale event payload.
    // A slower earlier fetch cannot overwrite a newer reconciliation that already committed.
    const account = await db.prepare(`
        UPDATE plus_accounts SET billing_sync_version = billing_sync_version + 1 WHERE stripe_customer = ?
        RETURNING id, billing_sync_version
    `).bind(customer).first<{ id: string; billing_sync_version: number }>();
    if (account) {
        const { plusUntil } = await createStripe(env, transport).subscriptionState(customer);
        await db.prepare(`
            UPDATE plus_accounts SET plus_until = ?1, billing_applied_version = ?2
            WHERE id = ?3 AND billing_applied_version < ?2
        `).bind(plusUntil, account.billing_sync_version, account.id).run();
        if (event.type.startsWith("checkout.session.") && typeof intent === "string") await clearCheckout(db, account.id, intent);
    }
}

export function handleBilling(request: Request, action: string, env: BillingEnv, transport = fetch) {
    return handlePost(request, action === "webhook" ? "stripe_webhook" : "billing", async () => {
        const origin = appOrigin(request, env);
        if (action === "webhook") {
            const event = await verifyStripeEvent(request, env);
            try {
                await reconcileStripeEvent(event, env, transport);
            } catch {
                throw new ServiceError("stripe_reconciliation_failed");
            }
            return json({ ok: true });
        }
        requireSameOrigin(request, origin);
        const account = await requireSession(env.PLUS_DB, request, origin);
        const stripe = createStripe(env, transport);
        switch (action) {
            case "checkout": {
                const { plan } = await readJson(request);
                if (plan !== "monthly" && plan !== "annual") throw new HttpError(400, "invalid_plan");
                return json({ url: await startCheckout(env, stripe, account, plan, origin) });
            }
            case "cancel-checkout":
                await cancelCheckout(env.PLUS_DB, stripe, account);
                return json({ ok: true });
            case "portal":
                if (!account.stripe_customer) throw new HttpError(409, "billing_not_available");
                return json({ url: await stripe.portal(account.stripe_customer, origin) });
            default:
                throw new HttpError(404, "not_found");
        }
    });
}
