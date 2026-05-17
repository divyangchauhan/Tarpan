# Tarpan — Project Task Tracker

> Tasks are organized by phase and priority. Each task includes an ID for reference in PRs and commits.

## Status Legend

| Symbol | Meaning     |
| ------ | ----------- |
| ⬜     | Not started |
| 🔄     | In progress |
| ✅     | Done        |
| 🚫     | Blocked     |

---

## Phase 0 — Project Foundation

| ID    | Task                                                  | Status | Notes |
| ----- | ----------------------------------------------------- | ------ | ----- |
| P0-01 | README, ARCHITECTURE, TASKS, CLAUDE.md docs           | ✅     | PR #1 |
| P0-02 | Monorepo scaffold (pnpm workspaces + Turborepo)       | ✅     | PR #2 |
| P0-03 | Docker Compose for local dev (PostgreSQL, LocalStack) | ✅     | PR #2 |
| P0-04 | CI pipeline (GitHub Actions: lint, type-check, test)  | ✅     | PR #2 |
| P0-05 | ESLint + Prettier config (shared across workspaces)   | ✅     | PR #2 |
| P0-06 | Shared TypeScript types package (`packages/shared`)   | ✅     | PR #2 |

---

## Phase 1 — Backend API (NestJS)

| ID    | Task                                                                          | Status | Notes                                                                                               |
| ----- | ----------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| P1-01 | NestJS app scaffold with module structure                                     | ✅     | PR #3                                                                                               |
| P1-02 | TypeORM entities: User, Case, Document, GeneratedDocument + initial migration | ✅     | PR #3                                                                                               |
| P1-03 | Auth module: JWT register/login/refresh                                       | ✅     | PR #3                                                                                               |
| P1-04 | Cases module: CRUD for a family's estate case                                 | ✅     | PR #3                                                                                               |
| P1-05 | Documents module: upload initiation, S3 pre-signed URL generation             | ✅     | PR #3                                                                                               |
| P1-06 | SQS publisher: enqueue document for Lambda processing                         | ✅     | PR #3                                                                                               |
| P1-07 | Documents module: PATCH endpoint for Lambda to report results                 | ✅     | PR #3                                                                                               |
| P1-08 | WebSocket gateway: push processing status updates to client                   | ✅     | PR #3                                                                                               |
| P1-09 | Templates module: list available institution templates                        | ✅     | feat/p1-09-templates-module — GET /v1/templates; TemplatesService owns template↔institution mapping |
| P1-10 | Generation module: trigger Lambda for PDF generation, return download URL     | ✅     | PR #5 — SQS-based via tarpan-document-generation queue                                          |
| P1-11 | API unit tests (Jest) — target 80% coverage                                   | ✅     | PR #9 — 88% statement coverage, 72 tests                                                            |
| P1-12 | API e2e tests (Supertest)                                                     | ✅     | PR #9 — auth (13 tests), cases (13 tests), documents + generated-documents (23 tests)               |

---

## Phase 2 — Document Processor (Python Lambda)

| ID     | Task                                                                    | Status | Notes                                                                                  |
| ------ | ----------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| P2-01  | Lambda project scaffold (Poetry, handler structure)                     | ✅     | PR #4                                                                                  |
| P2-02  | S3 download helper                                                      | ✅     | PR #4                                                                                  |
| P2-03  | PDF-to-image preprocessing (PDFPlumber + Pillow)                        | ✅     | PR #4                                                                                  |
| P2-04  | Claude API integration: death certificate extraction prompt             | ✅     | PR #4                                                                                  |
| P2-05  | Structured output parsing & validation (Pydantic)                       | ✅     | PR #4                                                                                  |
| P2-06  | Result upload back to S3 + API PATCH callback                           | ✅     | PR #4                                                                                  |
| P2-07  | Institution template engine (Jinja2 → HTML → PDF via WeasyPrint)        | ✅     | PR #5                                                                                  |
| P2-07b | SQS-based generation worker: dual-queue run_worker.py + handler routing | ✅     | PR #5                                                                                  |
| P2-08  | Template: Social Security Administration (SSA-721)                      | ✅     | PR #5                                                                                  |
| P2-09  | Template: Medicare notification                                         | ✅     | PR #5                                                                                  |
| P2-10  | Template: Generic bank account closure letter                           | ✅     | PR #5                                                                                  |
| P2-11  | Template: Generic credit card cancellation letter                       | ✅     | PR #5                                                                                  |
| P2-12  | Template: Subscription cancellation (streaming, utilities)              | ✅     | PR #5                                                                                  |
| P2-13  | Template: IRS notification                                              | ✅     | PR #5                                                                                  |
| P2-14  | Template: State DMV / driver's license notification                     | ✅     | PR #5                                                                                  |
| P2-15  | Template: Voter registration cancellation                               | ✅     | PR #5                                                                                  |
| P2-16  | Template: USPS mail forwarding / deceased notification                  | ✅     | PR #5                                                                                  |
| P2-17  | Template: Life insurance claim initiation                               | ✅     | PR #5                                                                                  |
| P2-18  | Template: Pension / 401(k) beneficiary notification                     | ✅     | PR #5                                                                                  |
| P2-19  | Template: Veterans Affairs notification                                 | ✅     | PR #5                                                                                  |
| P2-20  | Template: Passport cancellation                                         | ✅     | PR #5                                                                                  |
| P2-21  | Template: Professional license board notification                       | ✅     | PR #5                                                                                  |
| P2-22  | Template: Employer / HR notification                                    | ✅     | PR #5                                                                                  |
| P2-23  | Lambda unit tests (pytest) — target 90% on parser logic                 | ✅     | PR #9 — 94% coverage, 63 tests                                                         |
| P2-24  | Lambda integration test with LocalStack S3 + SQS                        | ✅     | tests/test_integration.py — 11 tests using moto; real S3/SQS calls, 94% total coverage |

---

## Phase 3 — Frontend (React + Tailwind)

| ID    | Task                                                                  | Status | Notes                                                                                                            |
| ----- | --------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| P3-01 | React app scaffold (Vite, React Router, Tailwind)                     | ✅     | PR #7                                                                                                            |
| P3-02 | Auth pages: Login, Register                                           | ✅     | PR #7                                                                                                            |
| P3-03 | Layout: sidebar nav, header, responsive shell                         | ✅     | PR #7                                                                                                            |
| P3-04 | Dashboard: list of cases with status                                  | ✅     | PR #7                                                                                                            |
| P3-05 | New case wizard: step 1 — deceased's information form                 | ✅     | PR #7                                                                                                            |
| P3-06 | New case wizard: step 2 — death certificate upload with drag-and-drop | ✅     | PR #7                                                                                                            |
| P3-07 | Processing screen: animated status with real-time WebSocket updates   | ✅     | PR #7                                                                                                            |
| P3-08 | Review screen: display extracted fields, inline editing               | ✅     | PR #7                                                                                                            |
| P3-09 | Institution selector: checklist of notifications to send              | ✅     | PR #7                                                                                                            |
| P3-10 | Document generation: trigger and loading state                        | ✅     | PR #7                                                                                                            |
| P3-11 | Downloads screen: list generated PDFs with download links             | ✅     | PR #7                                                                                                            |
| P3-12 | Toast notifications system                                            | ✅     | PR #7                                                                                                            |
| P3-13 | Error boundary and empty states                                       | ✅     | PR #7                                                                                                            |
| P3-14 | Frontend unit tests (Vitest + Testing Library)                        | ✅     | PR #9 — unit + integration tests (LoginPage, DownloadsPage, NewCasePage, ReviewPage, InstitutionsPage), 45 tests |

---

## Phase 4 — Infrastructure (AWS CDK)

| ID    | Task                                                                | Status | Notes                     |
| ----- | ------------------------------------------------------------------- | ------ | ------------------------- |
| P4-01 | CDK project scaffold                                                | ✅     | PR #8                     |
| P4-02 | S3 bucket stack (uploads + generated docs)                          | ✅     | PR #8                     |
| P4-03 | SQS queue stack (two queues: processing + generation)               | ✅     | PR #8                     |
| P4-04 | Lambda stack (processor Lambda + both SQS triggers)                 | ✅     | PR #8                     |
| P4-05 | RDS PostgreSQL stack                                                | ✅     | PR #8                     |
| P4-06 | ECS / EC2 stack for NestJS API                                     | ✅     | PR #8 — ECS Fargate + ALB |
| P4-07 | CloudFront + S3 for React app hosting                               | ✅     | PR #8                     |
| P4-08 | Secrets Manager for API keys                                        | ✅     | PR #8                     |
| P4-09 | IAM roles and least-privilege policies                              | ✅     | PR #8                     |

---

## Phase 5 — Polish & Demo Prep

| ID    | Task                                                             | Status | Notes                                                                         |
| ----- | ---------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| P5-01 | Seed script: demo case with real-looking data                    | ✅     | PR #9 — apps/api/src/database/seed.ts                                         |
| P5-02 | Synthetic accuracy report: test parser against generated certificates | ⬜     | Uses synthetic certificate fixtures only; real death certificates are not yet tested |
| P5-03 | Loading performance: add per-stage timing logs to Lambda handler | ✅     | PR #10 — per-stage and total duration_ms logged for processing and generation |
| P5-04 | Mobile responsiveness audit                                      | ✅     | PR #10 — sidebar drawer, responsive form grids, card overflow fix             |
| P5-05 | Demo script and walkthrough notes                                | ✅     | PR #10 (removed before open-sourcing)                                         |

---

## Phase 6 — Production Readiness

| ID    | Task                                                                     | Status | Notes |
| ----- | ------------------------------------------------------------------------ | ------ | ----- |
| P6-01 | CloudWatch dashboards: Lambda duration, error rate, SQS queue depth      | ⬜     |       |
| P6-02 | Structured alerting: SNS alarms for Lambda errors and API 5xx rate       | ⬜     |       |
| P6-03 | Sentry integration: API (NestJS) + Lambda error tracking                 | ⬜     |       |
| P6-04 | Secrets rotation: AWS Secrets Manager rotation lambdas for DB + API keys | ⬜     |       |
| P6-05 | Database backups: automated RDS snapshots + restore runbook              | ⬜     |       |
| P6-06 | Rate limiting: NestJS throttler guard on auth + upload endpoints         | ⬜     |       |
| P6-07 | Health check endpoints + ALB health check hardening                      | ⬜     |       |
| P6-08 | CDK environment promotion: staging → production pipeline                 | ⬜     |       |
| P6-09 | Encrypt SSNs before storing extracted certificate data in the database   | ⬜     | Planned PR #11 — add application-layer encryption for SSN fields in `Document.extractedData`, migration/backfill for existing rows, tests for encryption/decryption boundaries, and update `CLAUDE.md` sensitive-data guidance |

---

## Phase 7 — Auth Hardening

| ID    | Task                                                            | Status | Notes |
| ----- | --------------------------------------------------------------- | ------ | ----- |
| P7-01 | Email verification on registration (SES + token flow)           | ⬜     |       |
| P7-02 | Password reset flow (forgot password → SES email → reset token) | ⬜     |       |
| P7-03 | Account lockout after N failed login attempts                   | ⬜     |       |
| P7-04 | MFA support (TOTP via authenticator app)                        | ⬜     |       |
| P7-05 | Session management: active device list + remote logout          | ⬜     |       |
| P7-06 | OAuth2 social login (Google)                                    | ⬜     |       |

---

## Phase 8 — Billing & Payments

| ID    | Task                                                                    | Status | Notes |
| ----- | ----------------------------------------------------------------------- | ------ | ----- |
| P8-01 | Razorpay integration: customer + subscription creation on register      | ⬜     |       |
| P8-02 | Pricing plans: free tier (1 case) vs paid (unlimited)                   | ⬜     |       |
| P8-03 | Razorpay webhook handler: subscription activated / charged / cancelled / halted | ⬜ |   |
| P8-04 | Entitlement guard: block case creation when over plan limit             | ⬜     |       |
| P8-05 | Subscription management: Razorpay-hosted subscription update/cancel link in account settings | ⬜ |   |
| P8-06 | Usage tracking: per-case and per-document metrics for billing analytics | ⬜     |       |

---

## Phase 9 — Additional Institution Templates

| ID    | Task                                                                                                          | Status | Notes                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| P9-01 | Template: brokerage account closure (Fidelity / Schwab / Vanguard generic)                                    | ⬜     |                                                                                                               |
| P9-02 | Template: mortgage lender / servicer notification                                                             | ⬜     |                                                                                                               |
| P9-03 | Template: auto loan lender notification                                                                       | ⬜     |                                                                                                               |
| P9-04 | Template: health insurance cancellation                                                                       | ⬜     |                                                                                                               |
| P9-05 | Template: homeowners / renters insurance notification                                                         | ⬜     |                                                                                                               |
| P9-06 | Template: property deed / county recorder notification                                                        | ⬜     |                                                                                                               |
| P9-07 | Template: state-specific probate court filing cover letter                                                    | ⬜     |                                                                                                               |
| P9-08 | Template: loyalty / rewards programme cancellation (airlines, hotels)                                         | ⬜     |                                                                                                               |
| P9-09 | Template: alumni association / professional membership cancellation                                           | ⬜     |                                                                                                               |
| P9-10 | Escalation letter templates: one per institution group (federal, financial, insurance, utility, subscription) | ⬜     | Second-wave letters referencing original, citing regulator, firmer tone                                       |
| P9-11 | `GeneratedDocument` status lifecycle: `sent → acknowledged → resolved / escalated` + API PATCH endpoint       | ⬜     | DB migration: add status, sent_at, resolved_at, escalated_at fields                                           |
| P9-12 | Downloads page: status badges + "Mark as sent / resolved / escalate" action buttons                           | ⬜     |                                                                                                               |
| P9-13 | Escalation wizard UI: institution-specific guide, regulator contact details, and links to complaint portals   | ⬜     | Covers SSA/OIG, CFPB, state banking regulators, state insurance commissioner, IRS TAS, VA OIG, FTC, state PUC |
| P9-14 | Email reminder: SES alert after 30 days if a notification is not marked resolved                              | ⬜     | Scheduled Lambda or SQS delayed message                                                                       |

---

## Phase 10 — Mobile App (Optional — Not Yet Decided)

> These tasks are provisional. The decision to build native mobile apps has not been made. Add to PR schedule only once confirmed.

### Android

| ID     | Task                                                      | Status | Notes |
| ------ | --------------------------------------------------------- | ------ | ----- |
| M-A-01 | React Native (or Flutter) project scaffold for Android    | ⬜     |       |
| M-A-02 | Auth screens: login, register, forgot password            | ⬜     |       |
| M-A-03 | Dashboard: case list with status badges                   | ⬜     |       |
| M-A-04 | Camera capture + file picker for death certificate upload | ⬜     |       |
| M-A-05 | Real-time processing status via WebSocket                 | ⬜     |       |
| M-A-06 | Review screen: extracted fields with inline edit          | ⬜     |       |
| M-A-07 | Institution selector + document generation trigger        | ⬜     |       |
| M-A-08 | Downloads screen: in-app PDF viewer + share sheet         | ⬜     |       |
| M-A-09 | Push notifications (FCM) for processing complete          | ⬜     |       |
| M-A-10 | Play Store build pipeline (GitHub Actions)                | ⬜     |       |

### iOS

| ID     | Task                                                               | Status | Notes |
| ------ | ------------------------------------------------------------------ | ------ | ----- |
| M-I-01 | React Native (or Flutter) project scaffold for iOS                 | ⬜     |       |
| M-I-02 | Auth screens: login, register, forgot password                     | ⬜     |       |
| M-I-03 | Dashboard: case list with status badges                            | ⬜     |       |
| M-I-04 | Camera capture + photo library picker for death certificate upload | ⬜     |       |
| M-I-05 | Real-time processing status via WebSocket                          | ⬜     |       |
| M-I-06 | Review screen: extracted fields with inline edit                   | ⬜     |       |
| M-I-07 | Institution selector + document generation trigger                 | ⬜     |       |
| M-I-08 | Downloads screen: in-app PDF viewer + share sheet                  | ⬜     |       |
| M-I-09 | Push notifications (APNs) for processing complete                  | ⬜     |       |
| M-I-10 | App Store build pipeline (GitHub Actions + Fastlane)               | ⬜     |       |

---

## PR Schedule (Actual)

| PR  | Scope                                                     | Phase Tasks                                       |
| --- | --------------------------------------------------------- | ------------------------------------------------- |
| #1  | Project docs (README, ARCHITECTURE, TASKS, CLAUDE.md)     | P0-01                                             |
| #2  | Monorepo scaffold + CI + shared types                     | P0-02 to P0-06                                    |
| #3  | NestJS API core (auth, cases, documents, WebSocket)       | P1-01 to P1-08                                    |
| #4  | Python Lambda: parser + S3 + SQS                          | P2-01 to P2-06                                    |
| #5  | Document templates (15+ institutions) + generation worker | P2-07 to P2-22                                    |
| #6  | Bug fixes: upload flow, CORS, SQS queues                  | —                                                 |
| #7  | React frontend + WebSocket improvements                   | P3-01 to P3-13                                    |
| #8  | AWS CDK infrastructure                                    | P4-01 to P4-09                                    |
| #9  | Tests, polish, demo prep                                  | P1-11, P1-12, P2-23, P2-24, P3-14, P5-01          |
| #10 | Performance logging, mobile responsiveness, demo script   | P5-03, P5-04, P5-05                                |

---

## PR Schedule (Planned)

> Covers Phases 6–9. Phase 10 (mobile app) is excluded — not yet decided.
> One logical concern per PR; kept reviewable (< 600 lines diff target).

### Phase 6 — Production Readiness

| PR  | Scope                                                                 | Phase Tasks    |
| --- | --------------------------------------------------------------------- | -------------- |
| #11 | Security hardening: SSN encryption at rest + `CLAUDE.md` guidance sync | P6-09          |
| #12 | Observability: CloudWatch dashboards + SNS alarms                     | P6-01, P6-02   |
| #13 | Sentry error tracking: NestJS API + Lambda processor                  | P6-03          |
| #14 | Resilience: Secrets Manager rotation + RDS backups & restore runbook  | P6-04, P6-05   |
| #15 | API hardening: rate limiting + health check endpoints                 | P6-06, P6-07   |
| #16 | CDK staging → production promotion pipeline                           | P6-08          |

### Phase 7 — Auth Hardening

| PR  | Scope                                                                 | Phase Tasks    |
| --- | --------------------------------------------------------------------- | -------------- |
| #17 | Email infrastructure (SES) + email verification on registration       | P7-01          |
| #18 | Password reset flow (forgot → SES email → reset token)                | P7-02          |
| #19 | Account lockout after N failed login attempts                         | P7-03          |
| #20 | MFA support (TOTP via authenticator app)                              | P7-04          |
| #21 | Session management: active device list + remote logout                | P7-05          |
| #22 | OAuth2 social login (Google)                                          | P7-06          |

### Phase 8 — Billing & Payments (Razorpay)

| PR  | Scope                                                                 | Phase Tasks    |
| --- | --------------------------------------------------------------------- | -------------- |
| #23 | Razorpay integration: customer + subscription creation on register    | P8-01          |
| #24 | Pricing plans (free vs paid) + entitlement guard on case creation     | P8-02, P8-04   |
| #25 | Razorpay webhook handler: subscription lifecycle events               | P8-03          |
| #26 | Subscription management page + usage tracking for billing analytics   | P8-05, P8-06   |

### Phase 9 — Additional Institution Templates & Escalation

| PR  | Scope                                                                          | Phase Tasks         |
| --- | ------------------------------------------------------------------------------ | ------------------- |
| #27 | Template batch 1 — financial: brokerage, mortgage, auto loan                   | P9-01, P9-02, P9-03 |
| #28 | Template batch 2 — insurance & property: health, home/renters, deed/recorder   | P9-04, P9-05, P9-06 |
| #29 | Template batch 3 — probate & memberships: probate cover, loyalty, alumni       | P9-07, P9-08, P9-09 |
| #30 | Escalation letter templates (per institution group)                            | P9-10               |
| #31 | `GeneratedDocument` status lifecycle: backend + API PATCH endpoint + migration | P9-11               |
| #32 | Downloads page: status badges + sent/resolved/escalate actions                 | P9-12               |
| #33 | Escalation wizard UI: regulator contacts + complaint portal links              | P9-13               |
| #34 | 30-day SES reminder for unresolved notifications                               | P9-14               |
