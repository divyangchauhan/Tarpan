# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

It contains project conventions, architecture notes, and workflow rules that must be followed.

---

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Project Summary

Tarpan automates the administrative burden families face after a death:

- Parses death certificates via AI (Claude API)
- Generates institution-specific legal letters and forms
- Provides a guided dashboard to track notifications

**POC status**: Complete — investor-grade demo shipped across Phases 0–5.

**Active roadmap**:

- Phase 6 — Production readiness (monitoring, alerting, secrets rotation, rate limiting)
- Phase 7 — Auth hardening (email verification, password reset, MFA, OAuth2)
- Phase 8 — Billing & payments (Stripe subscriptions, pricing tiers, entitlement guards)
- Phase 9 — Additional institution templates + escalation workflow (brokerage, mortgage, insurance, probate; escalation letters; notification status lifecycle; 30-day SES reminders)
- Phase 10 — Mobile app, Android + iOS _(not yet decided)_

---

## Monorepo Structure

```
AfterLight/
├── apps/
│   ├── api/          # NestJS backend (TypeScript)
│   ├── web/          # React 18 + Vite + Tailwind frontend
│   └── processor/    # Python Lambda (document parsing + PDF generation)
├── packages/
│   └── shared/       # Shared TypeScript types and constants
├── infra/            # AWS CDK (TypeScript)
└── docs/             # Investor demo script and supporting documentation
```

Package manager: **pnpm** with workspaces.
Build orchestration: **Turborepo**.

### packages/shared

`@tarpan/shared` is the canonical source of truth for all TypeScript types (`Case`, `Document`, `GeneratedDocument`, `ExtractedCertificateData`, `WsEvent`, enums). Both `apps/api` and `apps/web` import from it. When changing a shared type, update it here first, then fix downstream compilation errors.

---

## Coding Conventions

### TypeScript (API + Web + Shared)

- **Strict TypeScript** — `"strict": true` in all tsconfig files. No `any` without an explanatory comment.
- **NestJS patterns**: use modules, services, controllers, guards, DTOs, TypeORM repositories. Never put business logic in controllers.
- **Validation**: use `class-validator` + `class-transformer` on all incoming DTOs; `ValidationPipe` is global.
- **Error handling**: throw `HttpException` subclasses from services; never expose stack traces.
- **Naming**: `PascalCase` for classes/types, `camelCase` for variables/functions, `SCREAMING_SNAKE_CASE` for env vars and constants.
- **File naming**: `kebab-case.ts` for all files (e.g., `document.service.ts`, `create-case.dto.ts`).
- **Imports**: use path aliases (`@api/`, `@shared/`) not relative `../../` chains.
- **No default exports** in TypeScript files.

### Python (Lambda)

- **Python 3.11+**.
- **Poetry** for dependency management.
- **Pydantic v2** for all data models and validation.
- **Type hints** on every function signature.
- **Ruff** for linting; **Black** for formatting. Both run in CI.
- Handler function signature: `def handler(event: dict[str, Any], context: object) -> dict[str, Any]`.
- Never log PII (names, dates of birth, SSNs, cause of death).

### General

- **No secrets in code** — all secrets via environment variables or AWS Secrets Manager.
- **No `console.log` in TypeScript** — use NestJS `Logger` service.
- **No `print()` in Python** — use `logging` module with structured JSON output.
- Write tests alongside code. Do not skip tests.

---

## Environment Variables

### apps/api

```
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://afterlight:afterlight@localhost:5432/afterlight
JWT_SECRET=...
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=7d
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT_URL=http://localhost:4566   # LocalStack — omit in production
S3_UPLOADS_BUCKET=afterlight-uploads
S3_GENERATED_DOCS_BUCKET=afterlight-generated-docs
SQS_DOCUMENT_PROCESSING_QUEUE_URL=http://localhost:4566/000000000000/afterlight-document-processing
SQS_DOCUMENT_GENERATION_QUEUE_URL=http://localhost:4566/000000000000/afterlight-document-generation
INTERNAL_API_SECRET=...
ANTHROPIC_API_KEY=...                    # Not read by the API at runtime — only by the Lambda processor. Included here for completeness when running the full local stack.
CORS_ORIGIN=http://localhost:5173
```

### apps/processor (Lambda env)

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT_URL=http://localhost:4566   # LocalStack — omit in production
S3_UPLOADS_BUCKET=afterlight-uploads
S3_GENERATED_DOCS_BUCKET=afterlight-generated-docs
SQS_DOCUMENT_PROCESSING_QUEUE_URL=http://localhost:4566/000000000000/afterlight-document-processing
SQS_DOCUMENT_GENERATION_QUEUE_URL=http://localhost:4566/000000000000/afterlight-document-generation
ANTHROPIC_API_KEY=...
API_CALLBACK_URL=http://localhost:3001
INTERNAL_API_SECRET=...
```

### apps/web

```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001        # http:// not ws:// — socket.io handles transport
```

---

## Key Architecture Decisions

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full rationale. Summary:

- **NestJS over Express**: enforces module structure; first-class TypeScript; easier to onboard future engineers.
- **Python Lambda over Node Lambda**: superior PDF/image processing libraries; Claude Python SDK is more mature for doc parsing.
- **Async via SQS**: Claude API calls can take 5–30s; never block HTTP endpoints.
- **S3 pre-signed URLs**: sensitive legal documents never pass through API server memory.
- **PostgreSQL + TypeORM**: relational model fits the data; JSONB columns for flexible extracted fields per state; repository pattern for testability.

### Async Data Flow

```
User uploads death certificate
  → API: POST /documents  (presigned URL returned)
  → Client: PUT directly to S3
  → API: PATCH /documents/:id/confirm  →  SQS (afterlight-document-processing)
  → Lambda: downloads from S3, calls Claude Vision API, POSTs result to API
  → API: PATCH /documents/:id/callback  (InternalSecretGuard)
  → API: emits WebSocket event (document.processing.complete | failed) to user's room
  → Client: navigates to ReviewPage on success

User requests PDF generation
  → API: POST /generated-documents  →  SQS (afterlight-document-generation)
  → Lambda: direct invocation renders Jinja2 HTML template → WeasyPrint PDF → S3
  → Lambda: POSTs result to API callback
  → API: emits generation.complete WebSocket event
  → Client: shows download link (pre-signed S3 URL)
```

### Lambda Routing

`apps/processor/src/handler.py` has a single entry point. If `event["Records"]` is non-empty it's an SQS trigger → `_handle_processing`. If the event has no `Records` it's a direct Lambda invocation (generation request) → `_handle_generation`.

### API Guards

Two guard types protect different route classes:

- `JwtAuthGuard` — validates the user's Bearer JWT. Applied to all user-facing routes.
- `InternalSecretGuard` — validates the `x-internal-secret` header against `INTERNAL_API_SECRET`. Used exclusively on Lambda callback endpoints (`/documents/:id/callback`, `/generated-documents/:id/callback`). Never apply this to user-facing routes.

### PDF Templates

16 Jinja2/HTML templates live in `apps/processor/src/templates/`. Each file's stem (e.g. `ssa-721`, `bank-closure`) is the `templateId` referenced in generation requests. WeasyPrint renders them to PDF.

---

## PR Workflow

1. Branch from `main` using naming: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.
2. One logical concern per PR. Keep PRs reviewable (< 600 lines diff ideally).
3. PR title format: `[TASK-ID] Short description` (e.g., `[P1-01] NestJS app scaffold`).
4. Every PR must pass CI (lint, type-check, tests) before merge.
5. Reference task IDs from [TASKS.md](./TASKS.md) in PR descriptions.
6. Do not force-push to `main`.

---

## Testing Standards

| Layer       | Framework                | Coverage Target    |
| ----------- | ------------------------ | ------------------ |
| NestJS unit | Jest                     | 80%                |
| NestJS e2e  | Supertest + Jest         | Critical paths     |
| Python unit | pytest                   | 90% (parser logic) |
| React       | Vitest + Testing Library | Key user flows     |

---

## Sensitive Data Handling

- Death certificates are **highly sensitive PII**. Never log document content.
- S3 objects must be **private** (no public ACLs).
- Pre-signed URLs must have **max 15-minute TTL**.
- Extracted data (names, SSNs, DOBs) must be **encrypted at rest** in the database (use PostgreSQL column encryption or a TypeORM subscriber for SSN specifically).
- Log only: document IDs, processing status, timing metrics.

---

## Useful Commands

```bash
# Start local infrastructure (PostgreSQL + LocalStack)
docker compose up -d

# Run all apps in dev mode
pnpm dev

# Run only the API
pnpm --filter api dev

# Run only the web app
pnpm --filter web dev

# Run the Python SQS worker locally
cd apps/processor && ./start_worker.sh

# Run Python tests
cd apps/processor && poetry run pytest

# Run a single Python test file or test by name
cd apps/processor && poetry run pytest tests/test_extractor.py
cd apps/processor && poetry run pytest -k "test_parse_dates"

# Type check all TypeScript packages (excludes processor — Python only)
pnpm turbo run typecheck --filter=!@tarpan/processor

# Lint all packages (excludes processor from TypeScript turbo run)
pnpm turbo run lint --filter=!@tarpan/processor
cd apps/processor && poetry run ruff check src tests   # Python lint separately

# Run all tests (excludes processor — run Python tests separately above)
pnpm turbo run test --filter=!@tarpan/processor

# Run a single NestJS test file
pnpm --filter api test -- --testPathPattern=cases.service

# Run a single Vitest test file
pnpm --filter web test -- src/pages/cases/NewCasePage.integration.test.tsx

# Seed the database (from apps/api)
pnpm --filter api seed

# Database migrations (from apps/api)
pnpm --filter api migration:generate -- src/database/migrations/MigrationName
pnpm --filter api migration:run
pnpm --filter api migration:revert

# CDK — deploy infrastructure to AWS
cd infra && pnpm install && cdk bootstrap && cdk deploy --all
```

---

## Task Tracking

See [TASKS.md](./TASKS.md). Always reference the task ID (e.g., `P1-03`) in commit messages and PR titles.
When you complete a task, update its status in TASKS.md as part of the same PR.
