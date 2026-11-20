# Legal drafts: launch checklist

The privacy policy and the terms of service in this folder are **drafts**. They are not in force and they are not legal advice. Complete every item below before you publish them or open Plus to real users. Merging the drafts does not need these items.

## 1. Replace every placeholder

Find them all with:

```bash
grep -rn "\[\[OWNER" docs/legal docs/release-notes
```

### [privacy-policy.md](privacy-policy.md)

- [ ] Effective date
- [ ] Legal name and address
- [ ] Privacy contact email (2 places: the header and section 6)
- [ ] Host: confirm Cloudflare (section 1 and the table in section 4)
- [ ] Email provider that sends sign-in codes: Postmark or Resend (section 4)
- [ ] Retention for the IP-address hash and the per-minute counter. Set it after the cleanup job runs, for example 24 hours ("Account data we keep" table)
- [ ] Anthropic: verify the current retention period and link, and that API data is not used for training ("What happens to that text")
- [ ] Minimum age, draft 16 (section 7). Use the same age as the terms
- [ ] With a lawyer: the transfer mechanism for EU and UK users, for example Standard Contractual Clauses (section 5)

### [terms-of-service.md](terms-of-service.md)

- [ ] Effective date
- [ ] Legal name
- [ ] Minimum age, draft 16 (section 2). Use the same age as the privacy policy
- [ ] Notice before a price change, draft 30 days (section 4)
- [ ] Refund policy: pick one (section 5)
- [ ] With a lawyer: disclaimer and liability wording for your jurisdiction (section 10)
- [ ] Contact email for account deletion (section 11)
- [ ] Governing law, and with a lawyer, the courts or dispute process (section 12)
- [ ] Contact email and postal address (Contact)

### [../release-notes/plus-launch.md](../release-notes/plus-launch.md)

- [ ] Release date
- [ ] Public URLs of the published privacy policy and terms
- [ ] The privacy line: change it only after item 3 is done
- [ ] The accessibility line: keep it only after the open follow-ups in [ws8-audit.md](../roadmap/ws8-audit.md) are fixed and the launch accessibility pass is done

## 2. Legal review

- [ ] A lawyer reviews both documents for every country and state where you offer Plus.

## 3. Zero data retention gate

- [ ] Keep `zeroRetentionConfirmed = false` in [PlusConsent.astro](../../src/components/PlusConsent.astro) until Anthropic confirms that zero data retention is active for the account. See [decisions.md](../roadmap/decisions.md), decision 4.
- [ ] After Anthropic confirms it, set `zeroRetentionConfirmed = true`. Then use the "After zero data retention is confirmed" line in the privacy policy ("What happens to that text") and change the privacy line in the release notes. Do these three changes in one pull request.

## 4. Tax

- [ ] Turn on Stripe Tax before go-live. Your accountant decides which tax registrations to file. See [decisions.md](../roadmap/decisions.md), decision 1.

## 5. Publish

- [ ] Publish the final documents at public URLs and put the URLs in the release notes.
- [ ] Remove the "DRAFT" notice at the top of each document only after items 1 to 4 are done.
