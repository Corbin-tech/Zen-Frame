export interface EmailEnv {
    PLUS_EMAIL_PROVIDER?: string;
    PLUS_EMAIL_KEY?: string;
    PLUS_EMAIL_FROM?: string;
}

export async function sendEmail(env: EmailEnv, to: string, code: string): Promise<void> {
    const { PLUS_EMAIL_PROVIDER: provider, PLUS_EMAIL_KEY: key, PLUS_EMAIL_FROM: from } = env;
    if (!key || !from) throw new Error("Email delivery not configured");
    const subject = "Your Zen Frame sign-in code";
    const text = `Your Zen Frame sign-in code is ${code}. It expires in 10 minutes. If you didn’t request it, you can ignore this email.`;
    const headers = new Headers({ "Content-Type": "application/json" });
    let url: string;
    let message: object;
    switch (provider) {
        case "postmark":
            url = "https://api.postmarkapp.com/email";
            headers.set("X-Postmark-Server-Token", key);
            message = { From: from, To: to, Subject: subject, TextBody: text, MessageStream: "outbound" };
            break;
        case "resend":
            url = "https://api.resend.com/emails";
            headers.set("Authorization", `Bearer ${key}`);
            message = { from, to: [to], subject, text };
            break;
        default:
            throw new Error("Email delivery not configured");
    }
    const response = await fetch(url, {
        method: "POST", headers, body: JSON.stringify(message), redirect: "error", signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error("Email delivery failed");
    await response.body?.cancel();
}
