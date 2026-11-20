// Structural subset of the Cloudflare D1 binding used by Plus.
export interface Statement {
    bind(...values: (string | number | null)[]): Statement;
    first<T>(): Promise<T | null>;
    run(): Promise<unknown>;
}

export interface PlusDatabase {
    prepare(sql: string): Statement;
}

export interface EntitlementEnv {
    PLUS_DB: PlusDatabase;
    PLUS_SIGNING_KEY: string;
}

export type Account = {
    id: string;
    email: string;
    stripe_customer: string | null;
    plus_until: number;
};

export const unixTime = () => Math.floor(Date.now() / 1000);
