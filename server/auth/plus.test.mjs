import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { onRequest as accountRoute } from "../../functions/api/assist/account/[action].ts";
import { handleBilling } from "../billing/handler.ts";
import { handleAccount } from "./handler.ts";
import { unixTime } from "./db.ts";
import { createEntitlementService, issueEntitlement } from "./entitlement.ts";

const origin = "https://zen-frame.example";
const email = "reader@example.com";
const customer = "cus_fixture";
const subscription = "sub_fixture";
const checkoutSession = "cs_test_fixture";
const checkoutUrl = "https://checkout.stripe.com/c/pay/fixture";
const portalUrl = "https://billing.stripe.com/p/session/fixture";

function database() {
    const sqlite = new DatabaseSync(":memory:");
    let afterFirst = async () => {};
    sqlite.exec(readFileSync(new URL("./migrations/0001_plus.sql", import.meta.url), "utf8"));
    const d1 = {
        prepare(query) {
            const statement = sqlite.prepare(query);
            let args = [];
            return {
                bind(...values) {
                    args = query.includes("?1")
                        ? [Object.fromEntries(values.map((value, index) => [`?${index + 1}`, value]))]
                        : values;
                    return this;
                },
                async first() {
                    const result = statement.get(...args) ?? null;
                    await afterFirst(query);
                    return result;
                },
                async run() { return statement.run(...args); }
            };
        }
    };
    return { sqlite, d1, interceptFirst(handler) { afterFirst = handler; } };
}

function fixtures() {
    const { sqlite, d1, interceptFirst } = database();
    const env = {
        PLUS_DB: d1, PLUS_ORIGIN: origin, PLUS_SIGNING_KEY: randomBytes(32).toString("hex"),
        STRIPE_SECRET_KEY: ["sk", "test", "fixture"].join("_"),
        STRIPE_WEBHOOK_SECRET: "whsec_" + randomBytes(32).toString("hex"),
        STRIPE_MONTHLY_PRICE: "price_monthly", STRIPE_ANNUAL_PRICE: "price_annual"
    };
    const codes = new Map();
    const mailer = async (to, code) => {
        assert.match(code, /^\d{6}$/);
        codes.set(to, code);
    };
    const request = (area, action, body = {}, headers = {}) => new Request(`${origin}/api/assist/${area}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body)
    });
    const account = (action, body, headers) => handleAccount(request("account", action, body, headers), action, env, mailer);

    async function getCode(address = email) {
        const response = await account("code", { email: address });
        assert.equal(response.status, 200);
        const { challenge } = await response.json();
        return { email: address, challenge, code: codes.get(address.trim().toLowerCase()) };
    }

    async function signIn(address = email) {
        const payload = await getCode(address);
        const response = await account("verify", payload);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        const cookie = response.headers.get("Set-Cookie");
        assert.match(cookie, /^__Host-zen-plus=.*; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Strict; Secure$/);
        return { session: await response.json(), headers: { Cookie: cookie.split(";")[0] }, payload };
    }

    return { sqlite, env, account, getCode, signIn, request, interceptFirst };
}

test("codes are one-use, expire after ten minutes, and lock after five wrong attempts", async () => {
    const f = fixtures();
    const { session, payload } = await f.signIn(" Reader@EXAMPLE.COM ");
    assert.equal(session.email, email);
    assert.equal(session.trialRemaining, 20);
    assert.equal((await f.account("verify", payload)).status, 401);
    const expiring = await f.getCode("expired@example.com");
    const row = f.sqlite.prepare("SELECT sent_at, expires_at, digest FROM plus_codes WHERE email = ?").get(expiring.email);
    assert.equal(row.expires_at - row.sent_at, 600);
    assert.notEqual(row.digest, expiring.code);
    f.sqlite.prepare("UPDATE plus_codes SET expires_at = ? WHERE email = ?").run(unixTime(), expiring.email);
    assert.equal((await f.account("verify", expiring)).status, 401);
    const locked = await f.getCode("locked@example.com");
    const wrong = locked.code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) assert.equal((await f.account("verify", { ...locked, code: wrong })).status, 401);
    assert.equal((await f.account("verify", locked)).status, 401);
    assert.equal(f.sqlite.prepare("SELECT attempts FROM plus_codes WHERE email = ?").get(locked.email).attempts, 0);
});

test("account HTTP rejects cross-origin requests and limits sends by email and IP", async () => {
    const f = fixtures();
    const cors = await accountRoute({
        request: f.request("account", "code", { email }, { Origin: "https://elsewhere.example" }), params: { action: "code" }, env: f.env
    });
    assert.equal(cors.status, 403);
    assert.equal(cors.headers.get("Access-Control-Allow-Origin"), null);
    for (let i = 0; i < 4; i++) {
        await f.getCode(email);
        f.sqlite.prepare("UPDATE plus_codes SET sent_at = 0 WHERE email = ?").run(email);
    }
    assert.equal((await f.account("code", { email })).status, 429);
    const headers = { "CF-Connecting-IP": "192.0.2.42" };
    for (let i = 0; i < 20; i++) {
        assert.equal((await f.account("code", { email: `reader${i}@example.com` }, headers)).status, 200);
    }
    assert.equal((await f.account("code", { email: "extra@example.com" }, headers)).status, 429);
});

test("a concurrent verification cannot reuse the last failed attempt", async () => {
    const f = fixtures();
    const valid = await f.getCode();
    const invalid = { ...valid, code: valid.code === "000000" ? "000001" : "000000" };
    for (let i = 0; i < 4; i++) assert.equal((await f.account("verify", invalid)).status, 401);
    const mutation = Promise.withResolvers();
    const resume = Promise.withResolvers();
    f.interceptFirst(async (sql) => {
        if (/plus_codes.*[\s\S]*RETURNING/i.test(sql)) {
            f.interceptFirst(async () => {});
            mutation.resolve();
            await resume.promise;
        }
    });
    const lastAttempt = f.account("verify", invalid);
    try {
        await Promise.race([mutation.promise, lastAttempt]);
        assert.equal((await f.account("verify", valid)).status, 401);
    } finally {
        resume.resolve();
    }
    assert.equal((await lastAttempt).status, 401);
});

test("signed bearer authenticates, but payload and signature tampering, expiry and logout all reject", async () => {
    const f = fixtures();
    const { session, headers } = await f.signIn();
    const service = createEntitlementService(f.env);
    const identity = await service.authenticate(session.token);
    assert.ok(identity);
    const [original, signature] = session.token.split(".");
    const claims = JSON.parse(Buffer.from(original, "base64url"));
    const changed = Buffer.from(JSON.stringify({ ...claims, tier: "plus", plusUntil: unixTime() + 1_000_000 })).toString("base64url");
    assert.equal(await service.authenticate(changed + "." + signature), null);
    assert.equal(await service.authenticate(original + "." + (signature[0] === "A" ? "B" : "A") + signature.slice(1)), null);
    assert.equal(await service.authenticate(session.token + "="), null);
    assert.equal(await createEntitlementService(f.env, () => session.expiresAt).authenticate(session.token), null);
    const logout = await f.account("logout", {}, headers);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
    assert.equal(await service.authenticate(session.token), null);
    assert.equal((await f.account("session", {}, headers)).status, 401);
});

test("concurrent holds enforce the lifetime cap, release does not charge, and new sign-in retains usage", async () => {
    const f = fixtures();
    const { session, headers } = await f.signIn();
    const service = createEntitlementService(f.env);
    const identity = await service.authenticate(session.token);
    const held = (await Promise.all(Array.from({ length: 25 }, () => service.reserve(identity)))).filter(Boolean);
    assert.equal(held.length, 20);
    assert.equal((await (await f.account("session", {}, headers)).json()).trialRemaining, 20);
    await held[0].release();
    assert.equal(await held[0].complete(), false);
    const last = await service.reserve(identity);
    assert.ok(last);
    for (const hold of [...held.slice(1), last]) assert.equal(await hold.complete(), true);
    assert.equal(await last.complete(), false);
    assert.equal(await service.reserve(identity), null);
    const second = await f.signIn("READER@example.com");
    assert.equal(second.session.trialRemaining, 0);
    assert.equal((await service.authenticate(second.session.token)).accountId, identity.accountId);
});

test("expired holds free capacity without a charge; Plus has a separate 1,000-answer UTC month meter", async () => {
    const f = fixtures();
    const { session } = await f.signIn();
    const initial = createEntitlementService(f.env);
    const identity = await initial.authenticate(session.token);
    let now = unixTime();
    const service = createEntitlementService(f.env, () => now);
    const expiring = await service.reserve(identity);
    now += 121;
    assert.equal(await expiring.complete(), false);
    assert.equal(await (await service.reserve(identity)).complete(), true);
    f.sqlite.prepare("UPDATE plus_accounts SET plus_until = ? WHERE id = ?").run(now + 120 * 86400, identity.accountId);
    const account = f.sqlite.prepare("SELECT * FROM plus_accounts WHERE id = ?").get(identity.accountId);
    const month = new Date(now * 1000).toISOString().slice(0, 7);
    f.sqlite.prepare("INSERT INTO plus_usage VALUES (?, ?, 999)").run(account.id, month);
    // The original, still-signed trial token identifies the account, but cannot choose the meter.
    const paid = await service.reserve(identity);
    assert.ok(paid);
    assert.equal(await service.reserve(identity), null);
    assert.equal(await paid.complete(), true);
    assert.equal((await issueEntitlement(f.env, account, identity.sessionId, now)).monthlyRemaining, 0);
    const date = new Date(now * 1000);
    now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000;
    assert.equal((await issueEntitlement(f.env, account, identity.sessionId, now)).monthlyRemaining, 1000);
    assert.equal((await issueEntitlement(f.env, { ...account, plus_until: 0 }, identity.sessionId, now)).trialRemaining, 19);
});

test("mock Stripe Checkout, cancel and retry, webhook reconciliation and customer portal", async (t) => {
    t.mock.method(console, "error", () => {});
    const f = fixtures();
    const { headers } = await f.signIn();
    let state = "open";
    let subscriptions = [];
    let intent;
    let checkoutCalls = 0;
    const transport = async (url, init) => {
        assert.equal(new URL(url).origin, "https://api.stripe.com");
        assert.match(init.headers.get("Authorization"), /^Bearer sk_test_/);
        const path = new URL(url).pathname;
        if (path === "/v1/customers") {
            assert.equal(init.body.get("email"), email);
            assert.match(init.headers.get("Idempotency-Key"), /^zen-frame-customer-/);
            return Response.json({ id: customer });
        }
        if (path === "/v1/subscriptions") {
            assert.equal(new URL(url).searchParams.get("customer"), customer);
            return Response.json({ data: subscriptions, has_more: false });
        }
        if (path === "/v1/checkout/sessions") {
            checkoutCalls++;
            intent = init.body.get("client_reference_id");
            state = "open";
            assert.equal(init.body.get("mode"), "subscription");
            assert.equal(init.body.get("customer"), customer);
            assert.equal(init.body.get("line_items[0][price]"), checkoutCalls === 1 ? "price_monthly" : "price_annual");
            assert.equal(init.body.get("success_url"), origin + "/?plus=paid");
            return Response.json({ id: checkoutSession, url: checkoutUrl });
        }
        if (path === `/v1/checkout/sessions/${checkoutSession}`) return Response.json({ status: state });
        if (path === `/v1/checkout/sessions/${checkoutSession}/expire`) {
            state = "expired";
            return Response.json({ status: state });
        }
        if (path === "/v1/billing_portal/sessions") {
            assert.equal(init.body.get("customer"), customer);
            return Response.json({ url: portalUrl });
        }
        assert.fail(path);
    };
    const billing = (action, body, reqHeaders = headers, env = f.env) => handleBilling(
        f.request("billing", action, body, reqHeaders), action, env, transport
    );
    const checkout = await billing("checkout", { plan: "monthly" });
    assert.equal(checkout.status, 200);
    assert.equal((await checkout.json()).url, checkoutUrl);
    assert.equal((await billing("checkout", { plan: "monthly" })).status, 200);
    assert.equal((await billing("checkout", { plan: "annual" })).status, 409);
    assert.equal(checkoutCalls, 1);
    assert.equal((await billing("cancel-checkout")).status, 200);
    assert.equal(state, "expired");
    assert.equal((await billing("checkout", { plan: "annual" })).status, 200);
    assert.equal(checkoutCalls, 2);

    const secret = f.env.STRIPE_WEBHOOK_SECRET;
    const event = (type, livemode = false) => JSON.stringify({
        type, livemode, data: { object: { customer, client_reference_id: intent, description: "é" } }
    });
    function signed(body, time = unixTime()) {
        const signature = createHmac("sha256", secret).update(`${time}.${body}`).digest("hex");
        return { Origin: "", "Stripe-Signature": `t=${time},v1=${"0".repeat(64)},v1=${signature}` };
    }
    const completed = event("checkout.session.completed");
    assert.equal((await billing("webhook", completed + " ", signed(completed))).status, 400);
    assert.equal((await billing("webhook", completed, signed(completed, unixTime() - 301))).status, 400);
    const live = event("checkout.session.completed", true);
    assert.equal((await billing("webhook", live, signed(live))).status, 400);

    const ends = unixTime() + 30 * 86400;
    subscriptions = [{ id: subscription, status: "active", items: { data: [{
        price: { id: "price_annual" }, current_period_end: ends
    }] } }];
    assert.equal((await billing("webhook", completed, signed(completed))).status, 200);
    const plus = await (await f.account("session", {}, headers)).json();
    assert.equal(plus.tier, "plus");
    assert.equal(plus.plusUntil, ends);
    assert.equal(plus.monthlyRemaining, 1000);
    assert.equal((await (await billing("portal")).json()).url, portalUrl);
    assert.equal((await billing("checkout", { plan: "annual" })).status, 409);

    subscriptions[0].status = "canceled";
    const deleted = event("customer.subscription.deleted");
    assert.equal((await billing("webhook", deleted, signed(deleted))).status, 200);
    assert.equal((await billing("webhook", completed, signed(completed))).status, 200);
    assert.equal((await (await f.account("session", {}, headers)).json()).trialRemaining, 20);
    assert.equal((await billing("portal", {}, headers, {
        ...f.env, STRIPE_SECRET_KEY: ["sk", "live", "forbidden"].join("_")
    })).status, 503);
});

test("webhook logs only safe failure codes and keeps failure responses generic", async (t) => {
    const log = t.mock.method(console, "error", () => {});
    const f = fixtures();
    await f.signIn();
    f.sqlite.prepare("UPDATE plus_accounts SET stripe_customer = ? WHERE email = ?").run(customer, email);
    const body = JSON.stringify({
        type: "customer.subscription.updated", livemode: false, data: { object: { customer, email } }
    });
    const time = unixTime();
    const signature = createHmac("sha256", f.env.STRIPE_WEBHOOK_SECRET).update(`${time}.${body}`).digest("hex");
    const webhook = (env, signingHeader = `t=${time},v1=${signature}`) => handleBilling(
        f.request("billing", "webhook", body, { Origin: "", "Stripe-Signature": signingHeader }),
        "webhook", env, async () => { throw new Error("private Stripe response or credentials"); }
    );

    const malformedSecret = await webhook({ ...f.env, STRIPE_WEBHOOK_SECRET: "invalid private value" });
    assert.equal(malformedSecret.status, 503);
    assert.deepEqual(await malformedSecret.json(), { error: "plus_unavailable" });
    assert.deepEqual(log.mock.calls[0].arguments, [
        "Plus request failed", { scope: "stripe_webhook", reason: "stripe_webhook_not_configured" }
    ]);

    const wrongSecret = await webhook({ ...f.env, STRIPE_WEBHOOK_SECRET: "whsec_" + randomBytes(32).toString("hex") });
    assert.equal(wrongSecret.status, 400);
    assert.deepEqual(await wrongSecret.json(), { error: "invalid_stripe_signature" });
    assert.equal(log.mock.callCount(), 1);

    const reconciliation = await webhook(f.env);
    assert.equal(reconciliation.status, 503);
    assert.deepEqual(await reconciliation.json(), { error: "plus_unavailable" });
    assert.deepEqual(log.mock.calls[1].arguments, [
        "Plus request failed", { scope: "stripe_webhook", reason: "stripe_reconciliation_failed" }
    ]);
    assert.equal((await webhook(f.env, "")).status, 400);
    assert.equal(log.mock.callCount(), 2);
});
