# AfterLight — Project Task Tracker

> Tasks are organized by phase and priority. Each task includes an ID for reference in PRs and commits.

## Status Legend

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done |
| 🚫 | Blocked |

---

## Phase 0 — Project Foundation

| ID | Task | Status | Notes |
|---|---|---|---|
| P0-01 | README, ARCHITECTURE, TASKS, CLAUDE.md docs | ✅ | PR #1 |
| P0-02 | Monorepo scaffold (pnpm workspaces + Turborepo) | ✅ | PR #2 |
| P0-03 | Docker Compose for local dev (PostgreSQL, LocalStack) | ✅ | PR #2 |
| P0-04 | CI pipeline (GitHub Actions: lint, type-check, test) | ✅ | PR #2 |
| P0-05 | ESLint + Prettier config (shared across workspaces) | ✅ | PR #2 |
| P0-06 | Shared TypeScript types package (`packages/shared`) | ✅ | PR #2 |

---

## Phase 1 — Backend API (NestJS)

| ID | Task | Status | Notes |
|---|---|---|---|
| P1-01 | NestJS app scaffold with module structure | ✅ | PR #3 |
| P1-02 | TypeORM entities: User, Case, Document, GeneratedDocument + initial migration | ✅ | PR #3 |
| P1-03 | Auth module: JWT register/login/refresh | ✅ | PR #3 |
| P1-04 | Cases module: CRUD for a family's estate case | ✅ | PR #3 |
| P1-05 | Documents module: upload initiation, S3 pre-signed URL generation | ✅ | PR #3 |
| P1-06 | SQS publisher: enqueue document for Lambda processing | ✅ | PR #3 |
| P1-07 | Documents module: PATCH endpoint for Lambda to report results | ✅ | PR #3 |
| P1-08 | WebSocket gateway: push processing status updates to client | ✅ | PR #3 |
| P1-09 | Templates module: list available institution templates | ⬜ | |
| P1-10 | Generation module: trigger Lambda for PDF generation, return download URL | ✅ | PR #5 — SQS-based via afterlight-document-generation queue |
| P1-11 | API unit tests (Jest) — target 80% coverage | ⬜ | |
| P1-12 | API e2e tests (Supertest) | ⬜ | |

---

## Phase 2 — Document Processor (Python Lambda)

| ID | Task | Status | Notes |
|---|---|---|---|
| P2-01 | Lambda project scaffold (Poetry, handler structure) | ✅ | PR #4 |
| P2-02 | S3 download helper | ✅ | PR #4 |
| P2-03 | PDF-to-image preprocessing (PDFPlumber + Pillow) | ✅ | PR #4 |
| P2-04 | Claude API integration: death certificate extraction prompt | ✅ | PR #4 |
| P2-05 | Structured output parsing & validation (Pydantic) | ✅ | PR #4 |
| P2-06 | Result upload back to S3 + API PATCH callback | ✅ | PR #4 |
| P2-07 | Institution template engine (Jinja2 → HTML → PDF via WeasyPrint) | ✅ | PR #5 |
| P2-07b | SQS-based generation worker: dual-queue run_worker.py + handler routing | ✅ | PR #5 |
| P2-08 | Template: Social Security Administration (SSA-721) | ✅ | PR #5 |
| P2-09 | Template: Medicare notification | ✅ | PR #5 |
| P2-10 | Template: Generic bank account closure letter | ✅ | PR #5 |
| P2-11 | Template: Generic credit card cancellation letter | ✅ | PR #5 |
| P2-12 | Template: Subscription cancellation (streaming, utilities) | ✅ | PR #5 |
| P2-13 | Template: IRS notification | ✅ | PR #5 |
| P2-14 | Template: State DMV / driver's license notification | ✅ | PR #5 |
| P2-15 | Template: Voter registration cancellation | ✅ | PR #5 |
| P2-16 | Template: USPS mail forwarding / deceased notification | ✅ | PR #5 |
| P2-17 | Template: Life insurance claim initiation | ✅ | PR #5 |
| P2-18 | Template: Pension / 401(k) beneficiary notification | ✅ | PR #5 |
| P2-19 | Template: Veterans Affairs notification | ✅ | PR #5 |
| P2-20 | Template: Passport cancellation | ✅ | PR #5 |
| P2-21 | Template: Professional license board notification | ✅ | PR #5 |
| P2-22 | Template: Employer / HR notification | ✅ | PR #5 |
| P2-23 | Lambda unit tests (pytest) — target 90% on parser logic | ⬜ | |
| P2-24 | Lambda integration test with LocalStack S3 + SQS | ⬜ | |

---

## Phase 3 — Frontend (React + Tailwind)

| ID | Task | Status | Notes |
|---|---|---|---|
| P3-01 | React app scaffold (Vite, React Router, Tailwind) | ⬜ | |
| P3-02 | Auth pages: Login, Register | ⬜ | |
| P3-03 | Layout: sidebar nav, header, responsive shell | ⬜ | |
| P3-04 | Dashboard: list of cases with status | ⬜ | |
| P3-05 | New case wizard: step 1 — deceased's information form | ⬜ | |
| P3-06 | New case wizard: step 2 — death certificate upload with drag-and-drop | ⬜ | |
| P3-07 | Processing screen: animated status with real-time WebSocket updates | ⬜ | |
| P3-08 | Review screen: display extracted fields, inline editing | ⬜ | |
| P3-09 | Institution selector: checklist of notifications to send | ⬜ | |
| P3-10 | Document generation: trigger and loading state | ⬜ | |
| P3-11 | Downloads screen: list generated PDFs with download links | ⬜ | |
| P3-12 | Toast notifications system | ⬜ | |
| P3-13 | Error boundary and empty states | ⬜ | |
| P3-14 | Frontend unit tests (Vitest + Testing Library) | ⬜ | |

---

## Phase 4 — Infrastructure (AWS CDK)

| ID | Task | Status | Notes |
|---|---|---|---|
| P4-01 | CDK project scaffold | ⬜ | |
| P4-02 | S3 bucket stack (uploads + generated docs) | ⬜ | |
| P4-03 | SQS queue stack (two queues: processing + generation) | ⬜ | |
| P4-04 | Lambda stack (processor Lambda + both SQS triggers) | ⬜ | |
| P4-05 | RDS PostgreSQL stack | ⬜ | |
| P4-06 | ECS / EC2 stack for NestJS API (or Elastic Beanstalk for POC speed) | ⬜ | |
| P4-07 | CloudFront + S3 for React app hosting | ⬜ | |
| P4-08 | Secrets Manager for API keys | ⬜ | |
| P4-09 | IAM roles and least-privilege policies | ⬜ | |

---

## Phase 5 — Polish & Demo Prep

| ID | Task | Status | Notes |
|---|---|---|---|
| P5-01 | Seed script: demo case with real-looking data | ⬜ | |
| P5-02 | Accuracy report: test parser against 20 sample certificates | ⬜ | |
| P5-03 | Loading performance: ensure upload → extraction < 45s end-to-end | ⬜ | |
| P5-04 | Mobile responsiveness audit | ⬜ | |
| P5-05 | Investor demo script and walkthrough notes | ⬜ | |

---

## PR Schedule (Suggested)

| PR | Scope | Phase Tasks |
|---|---|---|
| #1 | Project docs (README, ARCHITECTURE, TASKS, CLAUDE.md) | P0-01 |
| #2 | Monorepo scaffold + CI + shared types | P0-02 to P0-06 |
| #3 | NestJS API core (auth, cases, documents) | P1-01 to P1-08 |
| #4 | Python Lambda: parser + S3 + SQS | P2-01 to P2-06 |
| #5 | Document templates (15+ institutions) | P2-07 to P2-22 |
| #6 | React frontend: auth + upload + review flow | P3-01 to P3-11 |
| #7 | Infrastructure CDK | P4-01 to P4-09 |
| #8 | Tests, polish, demo prep | P2-23, P2-24, P3-14, P5-01 to P5-05 |
