# Zen Frame privacy policy

> **DRAFT for the owner's legal sign-off. Not in force. Not legal advice.**
> Replace every `[[OWNER: …]]` before publishing. See [README.md](README.md) for the checklist.

Effective date: [[OWNER: date]]

This policy explains what Zen Frame collects, why, who else handles it, and your choices.
"Zen Frame", "we" and "us" mean [[OWNER: legal name and address]].
Contact: [[OWNER: privacy contact email]].

## The short version

- Your planner (tasks, clusters, schedule, goals, settings) stays in your browser. We never receive it.
- If you use **Plus**, the text you give a helper is sent to our server and to our AI provider, Anthropic, to make suggestions. We don't save or log that text.
- For a Plus account we keep your email address, your plan and how many helper requests you've used.
- We don't sell your data, show ads or use analytics or tracking scripts.

## 1. Using Zen Frame without an account

Zen Frame runs in your browser. Everything you create is saved in your browser's local storage on your device. It is not sent to us. Backups you export are files on your device.

Like any website, our host ([[OWNER: confirm: Cloudflare]]) processes your IP address and basic request details to deliver the site and protect it from abuse. We don't add analytics, advertising or third-party scripts.

## 2. Zen Frame Plus

Plus adds three AI task helpers: Breakdown, Brain dump and Estimate. They work only after you sign in and turn them on in Settings.

### What is sent when you use a helper

| Helper | What is sent |
| --- | --- |
| Breakdown | The task's text, the detail level you pick, and the task's cluster name |
| Brain dump | The text you type, up to 6,000 characters |
| Estimate | The task's text |

Nothing else from your planner is sent. Suggestions come back as a preview; nothing is added to your planner until you choose Accept.

### What happens to that text

- **Zen Frame's server** passes the text to the AI provider and returns the answer. It does not save the text or the answer, and does not write them to logs.
- **Our AI provider, Anthropic** (Anthropic PBC, USA), processes the text to generate the suggestion. We do not let it use tools or take actions.
  - *Until zero data retention is confirmed:* Anthropic may keep API inputs and outputs for a limited time under its [commercial data policy](https://www.anthropic.com/legal/commercial-terms) [[OWNER: verify current retention period and link, and that API data is not used for training]].
  - *After zero data retention is confirmed (replace the line above):* Under our zero data retention arrangement with Anthropic, your text and the answer are not stored after the request. Nothing is stored.

You can turn the helpers off at any time in Settings. That stops sending immediately and clears any suggestion you haven't accepted.

### Account data we keep

| Data | Why | How long |
| --- | --- | --- |
| Email address | Sign-in and billing | Until you ask us to delete your account |
| Account id, plan, paid-until date | Know whether you have Plus | Until account deletion |
| Helper request counts (lifetime trial count, monthly count) | Enforce the 20 free requests and the monthly fair-use limit | Until account deletion. The trial count is kept so clearing the browser can't reset it |
| Sign-in code (stored only as a one-way digest) | Check the 6-digit code | 10 minutes |
| Session (stored only as a one-way hash), in one cookie | Keep you signed in | 30 days, or until you sign out |
| A one-way hash of your IP address and a per-minute counter | Rate limiting and abuse prevention | [[OWNER: set retention once cleanup runs, e.g. 24 hours]] |
| Stripe customer id and checkout status | Link your account to your subscription | Until account deletion |

We store this in a Cloudflare D1 database.

### Cookies

We set one cookie, only after you sign in to Plus. It keeps you signed in. It is HttpOnly, sent only to Zen Frame, and lasts 30 days. We use no advertising or analytics cookies.

## 3. Payments

Payments are handled by **Stripe**. Stripe receives your email address and our account id for you, and collects your card details directly; we never see your full card number. Stripe's [privacy policy](https://stripe.com/privacy) applies to the data it collects.

## 4. Who else handles your data

| Service | What it does | Data it gets |
| --- | --- | --- |
| Cloudflare ([[OWNER: confirm]]) | Hosting, server functions, database | Requests, IP address, account data above |
| Anthropic | AI model for Plus helpers | The helper text in section 2 |
| Stripe | Payments and subscriptions | Email, account id, payment details |
| [[OWNER: Postmark or Resend]] | Sends sign-in codes | Email address and the code |

We share data with others only when the law requires it or to protect our users and service. We don't sell or rent personal data.

## 5. International transfers

These providers may process data in the United States and other countries. [[OWNER/lawyer: add transfer mechanism, e.g. Standard Contractual Clauses, if serving the EU/UK.]]

## 6. Your choices and rights

- **Turn off the helpers** in Settings at any time.
- **Cancel Plus** through Manage billing in Settings.
- **Sign out** to remove the session cookie.
- **Delete your planner data** by clearing this site's data in your browser.
- **Access, correct or delete your account data:** email [[OWNER: privacy contact email]] from the address on the account. We'll respond within 30 days. Deleting the account removes your email, plan and usage counts; Stripe keeps billing records it must keep by law.

Depending on where you live (for example the EU, UK or California), you may have more rights, including to object, restrict processing, port your data or complain to a data protection authority. [[OWNER/lawyer: confirm legal bases (contract for Plus; legitimate interest for security/rate limiting) and add region-specific wording.]]

## 7. Children

Zen Frame Plus is not for anyone under [[OWNER: 16]]. We don't knowingly collect data from children.

## 8. Security

Keys and signing secrets live only on the server. Sign-in codes and sessions are stored only as hashes. Helper answers are validated before they are shown. No system is perfectly secure; contact us if you find a problem.

## 9. Changes

We'll post changes here and update the effective date. For material changes to Plus, we'll tell signed-in users in the app before they take effect.
