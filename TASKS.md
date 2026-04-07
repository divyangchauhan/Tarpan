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
| P1-09 | Templates module: list available institution templates | ✅ | feat/p1-09-templates-module — GET /v1/templates; TemplatesService owns template↔institution mapping |
| P1-10 | Generation module: trigger Lambda for PDF generation, return download URL | ✅ | PR #5 — SQS-based via afterlight-document-generation queue |
| P1-11 | API unit tests (Jest) — target 80% coverage | ✅ | PR #9 — 88% statement coverage, 72 tests |
| P1-12 | API e2e tests (Supertest) | ✅ | PR #9 — auth (13 tests), cases (13 tests), documents + generated-documents (23 tests) |

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
| P2-23 | Lambda unit tests (pytest) — target 90% on parser logic | ✅ | PR #9 — 94% coverage, 63 tests |
| P2-24 | Lambda integration test with LocalStack S3 + SQS | ✅ | tests/test_integration.py — 11 tests using moto; real S3/SQS calls, 94% total coverage |

---

## Phase 3 — Frontend (React + Tailwind)

| ID | Task | Status | Notes |
|---|---|---|---|
| P3-01 | React app scaffold (Vite, React Router, Tailwind) | ✅ | PR #7 |
| P3-02 | Auth pages: Login, Register | ✅ | PR #7 |
| P3-03 | Layout: sidebar nav, header, responsive shell | ✅ | PR #7 |
| P3-04 | Dashboard: list of cases with status | ✅ | PR #7 |
| P3-05 | New case wizard: step 1 — deceased's information form | ✅ | PR #7 |
| P3-06 | New case wizard: step 2 — death certificate upload with drag-and-drop | ✅ | PR #7 |
| P3-07 | Processing screen: animated status with real-time WebSocket updates | ✅ | PR #7 |
| P3-08 | Review screen: display extracted fields, inline editing | ✅ | PR #7 |
| P3-09 | Institution selector: checklist of notifications to send | ✅ | PR #7 |
| P3-10 | Document generation: trigger and loading state | ✅ | PR #7 |
| P3-11 | Downloads screen: list generated PDFs with download links | ✅ | PR #7 |
| P3-12 | Toast notifications system | ✅ | PR #7 |
| P3-13 | Error boundary and empty states | ✅ | PR #7 |
| P3-14 | Frontend unit tests (Vitest + Testing Library) | ✅ | PR #9 — unit + integration tests (LoginPage, DownloadsPage, NewCasePage, ReviewPage, InstitutionsPage), 45 tests |

---

## Phase 4 — Infrastructure (AWS CDK)

| ID | Task | Status | Notes |
|---|---|---|---|
| P4-01 | CDK project scaffold | ✅ | PR #8 |
| P4-02 | S3 bucket stack (uploads + generated docs) | ✅ | PR #8 |
| P4-03 | SQS queue stack (two queues: processing + generation) | ✅ | PR #8 |
| P4-04 | Lambda stack (processor Lambda + both SQS triggers) | ✅ | PR #8 |
| P4-05 | RDS PostgreSQL stack | ✅ | PR #8 |
| P4-06 | ECS / EC2 stack for NestJS API (or Elastic Beanstalk for POC speed) | ✅ | PR #8 — ECS Fargate + ALB |
| P4-07 | CloudFront + S3 for React app hosting | ✅ | PR #8 |
| P4-08 | Secrets Manager for API keys | ✅ | PR #8 |
| P4-09 | IAM roles and least-privilege policies | ✅ | PR #8 |

---

## Phase 5 — Polish & Demo Prep

| ID | Task | Status | Notes |
|---|---|---|---|
| P5-01 | Seed script: demo case with real-looking data | ✅ | PR #9 — apps/api/src/database/seed.ts |
| P5-02 | Accuracy report: test parser against 20 sample certificates | ⬜ | Requires real certificate samples — deferred |
| P5-03 | Loading performance: add per-stage timing logs to Lambda handler | ✅ | PR #10 — per-stage and total duration_ms logged for processing and generation |
| P5-04 | Mobile responsiveness audit | ✅ | PR #10 — sidebar drawer, responsive form grids, card overflow fix |
| P5-05 | Investor demo script and walkthrough notes | ✅ | PR #10 — docs/DEMO.md |

---

## PR Schedule (Actual)

| PR | Scope | Phase Tasks |
|---|---|---|
| #1 | Project docs (README, ARCHITECTURE, TASKS, CLAUDE.md) | P0-01 |
| #2 | Monorepo scaffold + CI + shared types | P0-02 to P0-06 |
| #3 | NestJS API core (auth, cases, documents, WebSocket) | P1-01 to P1-08 |
| #4 | Python Lambda: parser + S3 + SQS | P2-01 to P2-06 |
| #5 | Document templates (15+ institutions) + generation worker | P2-07 to P2-22 |
| #6 | Bug fixes: upload flow, CORS, SQS queues | — |
| #7 | React frontend + WebSocket improvements | P3-01 to P3-13 |
| #8 | AWS CDK infrastructure | P4-01 to P4-09 |
| #9 | Tests, polish, demo prep | P1-11, P1-12, P2-23, P2-24, P3-14, P5-01 to P5-05 |
