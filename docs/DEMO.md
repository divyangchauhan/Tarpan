# AfterLight — Investor Demo Script

## Overview

**Audience:** Seed-stage investors  
**Duration:** 12–15 minutes  
**Format:** Live walkthrough of the running app + brief architecture slide

**Core narrative:**  
> "When someone dies, their family faces 500+ hours of administrative work — notifying banks, government agencies, insurance companies, utilities. AfterLight eliminates 80% of that burden in under 10 minutes."

---

## Pre-Demo Checklist

- [ ] App is live and reachable (CloudFront URL or localhost)
- [ ] Demo account seeded: `pnpm --filter api seed` (creates Robert Mitchell case with SSA, Medicare, IRS letters ready)
- [ ] Demo account credentials ready: `demo@afterlight.app` / ask for password in `.env`
- [ ] Backup PDF prepared and saved to `docs/sample-death-certificate.pdf` (not committed — use any synthetic death certificate scan; needed only if live upload fails)
- [ ] Second browser tab open on the downloads page for instant "wow" moment

---

## Walkthrough (Step by Step)

### 1. The Problem (1 min)

> "When my [friend's / relative's] parent died, they spent three weeks writing the same letter over and over to notify every institution. Banks, Social Security, Medicare, utilities — each one wants a certified letter on paper. That's 500 hours of work at the worst possible time."

Open the landing page / login screen. Don't log in yet.

> "We built AfterLight to automate all of it. You upload one document — the death certificate — and we generate every legal letter in under a minute."

---

### 2. Create a New Case (2 min)

Log in as `demo@afterlight.app`.

Click **New Case**.

> "Step one — tell us about the deceased. This takes about 30 seconds."

Fill in (or use the pre-seeded case):
- First name: **Robert**, Last name: **Mitchell**
- Date of birth: **July 14, 1942**
- Date of death: **November 3, 2024**
- Place of death: **Springfield, IL**
- SSN: **123-45-6789** *(point out: "stored encrypted, never logged")*

Click **Continue to upload**.

---

### 3. Upload the Death Certificate (1 min)

> "Step two — upload the death certificate. Any format: PDF, JPEG, even a photo taken on a phone."

Drag `sample-death-certificate.pdf` onto the drop zone (or click to select).

Click **Upload and process**.

> "The file goes directly to S3 via a pre-signed URL — it never touches our API server. Then our AI pipeline kicks off asynchronously."

---

### 4. Real-Time Processing (2 min)

The processing screen shows live status updates.

> "This is our Python Lambda running on AWS. It downloads the certificate, preprocesses it, then sends it to Claude — Anthropic's model — which extracts every structured field: name, dates, SSN, cause of death."

Point to the animated steps as they complete.

> "Claude returns structured JSON validated against a Pydantic schema. The whole extraction takes 8–15 seconds depending on document quality. We log every stage — download, preprocessing, extraction — so we have full visibility into where time is spent."

The screen auto-redirects to Review when done (typically 10–20 seconds).

---

### 5. Review Extracted Fields (2 min)

> "Claude correctly extracted all the fields directly from the certificate — name, dates, place of death. If anything is wrong, the family can edit it inline."

Point to the extracted fields panel.

> "Now we add the executor — the person managing the estate. This information will appear on every letter we generate."

Fill in executor:
- Name: **Sarah Mitchell**
- Relationship: **Daughter**
- Address: **412 Maple Ave, Springfield, IL 62701**

Click **Save executor info**, then **Continue to institutions**.

---

### 6. Select Institutions (1 min)

> "Here's where it gets powerful. We support 16 institution types covering government, financial, utilities, and professional. The family selects who to notify."

Click **Select all**.

> "For a real case, you'd pick the ones that apply. For the demo, let's generate all 16."

Click **Generate selected**.

> "Each one queues a separate Lambda invocation — they run in parallel. Each renders a Jinja2 template with the extracted data, generates a PDF using WeasyPrint, and uploads it to S3."

---

### 7. Downloads — The "Wow" Moment (2 min)

The downloads page shows all 16 letters with their status badges.

> "In under 60 seconds, 16 institution-specific legal letters — ready to print and mail. Each one has the correct agency address, legal language, and all the extracted information pre-filled."

Click **Download** on the Social Security letter. Open it.

> "This is a real SSA-721 form, filled out correctly. Same for Medicare, IRS, the bank closure letter — each template is institution-specific, not a generic form letter."

Scroll through 2–3 different downloaded PDFs.

---

### 8. The Bigger Picture (2 min)

Close the app and switch to the architecture slide (optional).

> "Under the hood: React frontend on CloudFront, NestJS API on ECS Fargate, PostgreSQL on RDS, Python Lambda triggered by SQS. Everything is async — no blocking HTTP calls to Claude."

Key metrics to mention:
- **500+ hours** of admin work automated to **< 10 minutes**
- **16 institution types** supported at launch, extensible to any institution
- **HIPAA-conscious design** — death certificates never logged, SSNs encrypted at rest, pre-signed URLs with 15-minute TTL

---

## Anticipated Questions

**"How accurate is the AI extraction?"**  
> "We've tested against a range of certificate formats — typed, handwritten, and photocopied. Claude handles all of them. Structured extraction with Pydantic validation catches any fields it can't confidently extract, and the Review screen lets families correct anything."

**"What's stopping someone from just doing this in ChatGPT?"**  
> "Workflow integration, security, and templates. ChatGPT can't generate a correctly formatted SSA-721 form, doesn't know the right mailing address for each agency, and has no audit trail. We own the full stack — upload, extraction, template library, and delivery."

**"What does the go-to-market look like?"**  
> "Direct-to-family for quick adoption, but the real opportunity is B2B: funeral homes, estate attorneys, and banks. They're the first call a family makes — we become their value-add service."

**"How much does a run cost?"**  
> "Claude API for extraction: ~$0.05–0.15 per document depending on length. Lambda, S3, SQS for a full 16-letter run: under $0.01. Marginal cost per case is under $0.20."

**"Is this HIPAA compliant?"**  
> "We're not yet HIPAA-certified, but the architecture is designed for it: data encrypted at rest and in transit, no PII in logs, pre-signed URLs, audit trail via CloudWatch. Certification is on the roadmap before enterprise sales."

---

## If Something Goes Wrong

| Problem | Recovery |
|---|---|
| Upload stalls | Switch to the pre-seeded Robert Mitchell case — it's already in state `PROCESSED` |
| Letters don't appear | Refresh — SQS polling has a ~5s delay |
| Login fails | Use incognito + re-enter credentials |
| CloudFront down | Switch to localhost (`pnpm dev`) |

---

## After the Demo

Send the investor:
1. This deck: `docs/ARCHITECTURE.md`
2. GitHub repo link (if sharing)
3. A live link to the deployed app with a personal demo account

Ask: *"What part resonated most? Is the B2C or B2B angle more interesting to you?"*
