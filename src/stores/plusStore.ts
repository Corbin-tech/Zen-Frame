import { formatDate, toDateKey } from "../lib/dates";

type Plan = "monthly" | "annual";
type AccountStatus = { email: string; billingAvailable: boolean } & (
    | { tier: "trial"; trialRemaining: number }
    | { tier: "plus"; plusUntil: number; monthlyRemaining: number }
);
type SessionReply = AccountStatus & { token: string; expiresAt: number };

class PlusError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, status: number) {
        super(code);
        this.code = code;
        this.status = status;
    }
}

const ERROR_MESSAGES: Record<string, string> = {
    invalid_email: "Enter a valid email address.",
    invalid_code: "That code is wrong, expired, or used. Try again or request a new one.",
    try_again_later: "Too many attempts. Wait a bit before trying again.",
    email_unavailable: "We couldn’t send your code. Try again in a moment.",
    sign_in_required: "Your session expired. Sign in again.",
    manage_existing_subscription: "You already have a subscription. Open Manage billing to update it.",
    checkout_pending: "A checkout is already pending. Return to it or cancel it before starting another.",
    billing_not_available: "There’s no billing account to manage yet."
};

async function post<T>(route: string, body: object = {}): Promise<T> {
    const response = await fetch("/api/assist/" + route, {
        method: "POST",
        mode: "same-origin",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
        const { error } = await response.json().catch(() => ({}));
        throw new PlusError(typeof error === "string" ? error : "", response.status);
    }
    return await response.json() as T;
}

function redirectToStripe(value: string, hostname: string) {
    const url = new URL(value);
    if (url.origin !== `https://${hostname}` || url.username || url.password) throw new Error("Invalid Stripe URL");
    window.location.assign(url.href);
}

export function initPlusStore() {
    let token: string | null = null;
    let expiresAt = 0;
    let generation = 0;
    let pendingRefresh: Promise<boolean> | null = null;

    return {
        account: null as AccountStatus | null,
        email: "",
        code: "",
        challenge: "",
        busy: "",
        error: "",
        ready: false,
        refreshing: false,
        checkoutReturn: "",
        checkoutPending: false,

        init() {
            const url = new URL(window.location.href);
            const result = url.searchParams.get("plus");
            if (result === "paid" || result === "cancelled" || result === "portal") {
                this.checkoutReturn = result;
                this.checkoutPending = result === "cancelled";
                url.searchParams.delete("plus");
                window.history.replaceState(window.history.state, "", url);
            }
            void this.refresh();
        },

        get plusUntilLabel(): string {
            return this.account?.tier === "plus"
                ? formatDate(toDateKey(new Date(this.account.plusUntil * 1000)), { month: "short", day: "numeric", year: "numeric" })
                : "";
        },

        applySession(session: SessionReply) {
            const { token: nextToken, expiresAt: nextExpiry, ...account } = session;
            token = nextToken;
            expiresAt = nextExpiry;
            this.account = account;
            this.ready = true;
        },

        forgetSession() {
            generation++;
            token = null;
            expiresAt = 0;
            this.account = null;
            this.ready = true;
            this.checkoutReturn = "";
            this.checkoutPending = false;
        },

        async refresh(): Promise<boolean> {
            if (pendingRefresh) return pendingRefresh;
            const version = generation;
            this.refreshing = true;
            pendingRefresh = (async () => {
                try {
                    const session = await post<SessionReply>("account/session");
                    if (generation !== version) return false;
                    this.applySession(session);
                    this.error = "";
                    return true;
                } catch (error) {
                    if (generation === version) {
                        if (error instanceof PlusError && error.status === 401) {
                            const checkoutReturn = this.checkoutReturn;
                            const checkoutPending = this.checkoutPending;
                            this.forgetSession();
                            this.checkoutReturn = checkoutReturn;
                            this.checkoutPending = checkoutPending;
                            this.error = "";
                        } else {
                            this.showError(error);
                        }
                    }
                    return false;
                } finally {
                    this.refreshing = false;
                    pendingRefresh = null;
                }
            })();
            return pendingRefresh;
        },

        // WS8 calls this only after assist consent. The bearer is never persisted or included in backups.
        async getToken(): Promise<string | null> {
            if (this.busy === "logout") return null;
            if (token && expiresAt > Date.now() / 1000 + 10) return token;
            return await this.refresh() ? token : null;
        },

        showError(error: unknown) {
            const code = error instanceof PlusError ? error.code : "";
            if (code === "sign_in_required") this.forgetSession();
            if (code === "checkout_pending") this.checkoutPending = true;
            this.error = Object.hasOwn(ERROR_MESSAGES, code)
                ? ERROR_MESSAGES[code] : "Zen Frame Plus is unavailable right now. Try again in a moment.";
        },

        async act(name: string, action: () => Promise<void>): Promise<boolean> {
            if (this.busy) return false;
            this.busy = name;
            this.error = "";
            try {
                await action();
                return true;
            } catch (error) {
                this.showError(error);
                return false;
            } finally {
                this.busy = "";
            }
        },

        requestCode() {
            return this.act("code", async () => {
                const { challenge } = await post<{ challenge: string }>("account/code", { email: this.email });
                this.challenge = challenge;
                this.code = "";
            });
        },

        verifyCode() {
            return this.act("verify", async () => {
                const session = await post<SessionReply>("account/verify", {
                    email: this.email, code: this.code, challenge: this.challenge
                });
                generation++;
                this.applySession(session);
                this.editEmail();
                this.email = "";
            });
        },

        editEmail() {
            this.challenge = "";
            this.code = "";
            this.error = "";
        },

        signOut() {
            return this.act("logout", async () => {
                await post("account/logout");
                this.forgetSession();
            });
        },

        checkout(plan: Plan) {
            return this.act("checkout", async () => {
                const { url } = await post<{ url: string }>("billing/checkout", { plan });
                redirectToStripe(url, "checkout.stripe.com");
            });
        },

        cancelCheckout() {
            return this.act("cancelCheckout", async () => {
                await post("billing/cancel-checkout");
                this.checkoutPending = false;
                this.checkoutReturn = "";
            });
        },

        portal() {
            return this.act("portal", async () => {
                const { url } = await post<{ url: string }>("billing/portal");
                redirectToStripe(url, "billing.stripe.com");
            });
        }
    };
}
