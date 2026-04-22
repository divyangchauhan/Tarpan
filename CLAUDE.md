# CLAUDE.md — Agent Context for AfterLight

This file is read by AI coding agents (Claude Code, etc.) at the start of every session.
It contains project conventions, architecture notes, and workflow rules that must be followed.

---

## Project Summary

AfterLight automates the administrative burden families face after a death:
- Parses death certificates via AI (Claude API / GPT-4 Vision)
- Generates institution-specific legal letters and forms
- Provides a guided dashboard to track notifications

**POC status**: Complete — investor-grade demo shipped across Phases 0–5.

**Active roadmap**:
- Phase 6 — Production readiness (monitoring, alerting, secrets rotation, rate limiting)
- Phase 7 — Auth hardening (email verification, password reset, MFA, OAuth2)
- Phase 8 — Billing & payments (Stripe subscriptions, pricing tiers, entitlement guards)
- Phase 9 — Additional institution templates + escalation workflow (brokerage, mortgage, insurance, probate; escalation letters; notification status lifecycle; 30-day SES reminders)
- Phase 10 — Mobile app, Android + iOS *(not yet decided)*

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
└── docs/             # Additional architecture diagrams, API specs
```

Package manager: **pnpm** with workspaces.
Build orchestration: **Turborepo**.

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
- Handler function signature: `def handler(event: dict, context: LambdaContext) -> dict`.
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
ANTHROPIC_API_KEY=...                    # Not used by API directly — only by Lambda
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

# Type check all TypeScript packages (excludes processor — Python only)
pnpm turbo run typecheck --filter=!@afterlight/processor

# Lint all packages (excludes processor from TypeScript turbo run)
pnpm turbo run lint --filter=!@afterlight/processor
cd apps/processor && poetry run ruff check src tests   # Python lint separately

# Run all tests (excludes processor — run Python tests separately above)
pnpm turbo run test --filter=!@afterlight/processor

# Database migrations (from apps/api)
pnpm --filter api typeorm migration:generate -- -n MigrationName
pnpm --filter api typeorm migration:run
pnpm --filter api typeorm migration:revert

# CDK — deploy infrastructure to AWS
cd infra && pnpm install && cdk bootstrap && cdk deploy --all
```

---

## Task Tracking

See [TASKS.md](./TASKS.md). Always reference the task ID (e.g., `P1-03`) in commit messages and PR titles.
When you complete a task, update its status in TASKS.md as part of the same PR.
