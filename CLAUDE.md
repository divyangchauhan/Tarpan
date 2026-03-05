# CLAUDE.md — Agent Context for AfterLight

This file is read by AI coding agents (Claude Code, etc.) at the start of every session.
It contains project conventions, architecture notes, and workflow rules that must be followed.

---

## Project Summary

AfterLight automates the administrative burden families face after a death:
- Parses death certificates via AI (Claude API / GPT-4 Vision)
- Generates institution-specific legal letters and forms
- Provides a guided dashboard to track notifications

**POC goal**: investor-grade demo ready in 3–4 weeks.

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
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=afterlight-uploads
AWS_SQS_QUEUE_URL=https://sqs...
ANTHROPIC_API_KEY=...
```

### apps/processor (Lambda env)

```
AWS_S3_BUCKET=afterlight-uploads
ANTHROPIC_API_KEY=...
API_CALLBACK_URL=https://api.afterlight.com
API_INTERNAL_SECRET=...
```

### apps/web

```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
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

| Layer | Framework | Coverage Target |
|---|---|---|
| NestJS unit | Jest | 80% |
| NestJS e2e | Supertest + Jest | Critical paths |
| Python unit | pytest | 90% (parser logic) |
| React | Vitest + Testing Library | Key user flows |

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
# Run all apps in dev mode
pnpm dev

# Run only the API
pnpm --filter api dev

# Run only the web app
pnpm --filter web dev

# Run Python Lambda locally (via AWS SAM or direct invocation)
cd apps/processor && poetry run python -m pytest

# Type check all TypeScript packages
pnpm typecheck

# Lint all packages
pnpm lint

# Run all tests
pnpm test

# Database migrations (from apps/api)
pnpm --filter api typeorm migration:generate -- -n MigrationName
pnpm --filter api typeorm migration:run
pnpm --filter api typeorm migration:revert
```

---

## Task Tracking

See [TASKS.md](./TASKS.md). Always reference the task ID (e.g., `P1-03`) in commit messages and PR titles.
When you complete a task, update its status in TASKS.md as part of the same PR.
