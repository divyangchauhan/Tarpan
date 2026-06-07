# System Architecture

## Overview

Tarpan is a document-centric platform with three distinct processing concerns:

1. **User interaction** — a fast, guided UI for uploading documents and reviewing/downloading outputs.
2. **API orchestration** — a typed, testable backend that manages users, cases, documents, and workflows.
3. **Heavy document processing** — AI-powered OCR parsing and PDF generation, which are CPU/time-intensive and must not block the API.

This separation drives every architectural decision below.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser                                 │
│                    React + Tailwind (Vite)                       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS / REST + WebSocket
┌────────────────────────────▼─────────────────────────────────────┐
│                       NestJS API                                 │
│  • Auth (JWT)    • Case management    • Document orchestration   │
│  • TypeORM       • S3 pre-signed URLs • SQS message publishing   │
└──────┬──────────────────┬──────────────────────────┬─────────────┘
       │ PostgreSQL        │ SQS (processing queue)   │ SQS (generation queue)
┌──────▼──────────┐        └──────────┬───────────────┘
│   PostgreSQL    │                   │
│  (RDS / local)  │        ┌──────────▼────────────────────────────┐
└─────────────────┘        │         AWS Lambda                    │
                           │    Python 3.11 processor              │
                           │  • Routes by message shape            │
                           │    ├─ processing: Claude API (OCR)    │
                           │    └─ generation: Jinja2 + WeasyPrint │
                           │  • Uploads result PDF to S3           │
                           │  • PATCH callback → NestJS API        │
                           └──────────┬────────────────────────────┘
                                      │ S3
                           ┌──────────▼─────────────┐
                           │       AWS S3            │
                           │  • Raw uploads          │
                           │  • Generated PDFs       │
                           └─────────────────────────┘
```

---

## Technology Choices

### Frontend: React 18 + Vite + Tailwind CSS

**Why React:**

- Largest ecosystem; easiest to hire for as the team grows.
- Component model is a natural fit for the step-by-step wizard UI.
- React 18 concurrent features (Suspense, transitions) make file-upload UX smooth.

**Why Vite:**

- Dramatically faster dev server than Create React App / Webpack.
- Native ESM; simpler configuration.

**Why Tailwind CSS:**

- Utility-first approach keeps styles co-located with components.
- No CSS naming conventions to enforce on a small team.
- Excellent design system (spacing scale, color palette) out of the box.

**Alternatives considered:**

- Next.js — rejected because SSR/SSG adds complexity without benefit at this stage; can migrate later if SEO or auth flows require it.
- Styled Components — rejected; runtime CSS-in-JS has perf overhead and Tailwind is faster to iterate with.

---

### Backend: NestJS (TypeScript)

**Why NestJS:**

- Opinionated, module-based structure enforces clean separation of concerns from day one — critical for a codebase that will be handed to a team.
- First-class TypeScript: end-to-end type safety from DB (TypeORM entities) through API to frontend (shared types package).
- Built-in support for guards, interceptors, pipes — auth, validation, and logging are solved problems.
- Decorator-based routing is familiar to developers coming from Spring / .NET, which broadens hiring options.

**Why not Express / Fastify directly:**

- Raw frameworks require re-inventing structure. NestJS gives us that structure and still compiles to Node.js, so performance is equivalent.

**Why not tRPC:**

- tRPC is excellent but ties frontend and backend more tightly. For a project that may need a mobile app or third-party integrations later, a REST API is more portable.

---

### Document Processing: Python + AWS Lambda

**Why Python:**

- The best AI/ML library ecosystem (Anthropic SDK, PDFPlumber, WeasyPrint, Pillow, Jinja2).
- Claude's official Python SDK is more mature and has more examples than the Node.js version for document parsing use cases.
- PDFPlumber and Pillow are battle-tested for PDF/image preprocessing before sending to vision models.

**Why AWS Lambda:**

- Death certificate parsing involves calling the Claude API (network I/O) and generating PDFs (CPU burst). This workload is bursty — idle between uploads, then potentially concurrent.
- Lambda scales to zero (no cost when idle) and bursts horizontally automatically.
- No container management overhead for a 3-person early-stage company.
- Cold start latency (~1-2s) is acceptable for async document processing.

**Why not a dedicated Python microservice:**

- A long-running service (ECS / EC2) costs money 24/7 even when idle.
- Lambda is operationally simpler at this scale; migration to ECS is straightforward if workloads grow.

**Why not process in NestJS directly:**

- Node.js PDF processing libraries are significantly less capable than Python's.
- Keeping AI processing separate means the API stays responsive; a slow Claude API call never blocks HTTP endpoints.

---

### Queue: AWS SQS (two queues)

Two SQS queues are used — one per workload type — both consumed by the same Lambda function:

| Queue                            | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `tarpan-document-processing` | Death certificate parse jobs (`{ documentId, caseId, s3Key }`)   |
| `tarpan-document-generation` | PDF generation jobs (`{ generatedDocumentId, templateId, ... }`) |

The Lambda handler routes messages by inspecting the body: presence of `generatedDocumentId` identifies a generation job; otherwise it is a processing job.

**Why async processing for generation:**

- WeasyPrint PDF rendering can take several seconds, especially for complex templates.
- A user triggering 16 simultaneous institution letters must not wait — the API returns `202 Accepted` immediately and the frontend polls.
- Using SQS for generation is consistent with the processing path: same worker, same retry/DLQ semantics, same back-pressure behaviour under load.

**Why not direct Lambda invocation for generation:**

- Direct invocation couples the API's response latency to WeasyPrint render time.
- Direct invocation bypasses SQS retry and dead-letter-queue semantics.
- Generating all 16 institution letters in parallel would require 16 simultaneous direct invocations from the API; SQS naturally queues and throttles them.

**Why async processing for certificate parsing:**

- Claude API calls can take 5-30 seconds for a full death certificate parse.
- A synchronous HTTP call holding a connection open for 30s is fragile (client timeout, Lambda timeout, load balancer timeout).
- SQS decouples upload from processing: API returns immediately with a job ID, Lambda processes in background, frontend polls or receives WebSocket push when done.

**Why SQS over RabbitMQ / Redis Streams:**

- SQS is managed, serverless, and integrates natively with Lambda triggers — zero ops overhead.
- At the current scale, SQS standard queues are sufficient. Can add FIFO queues later if ordering matters.

---

### Database: PostgreSQL + TypeORM

**Why PostgreSQL:**

- Relational model fits our data well: Users → Cases → Documents → GeneratedDocuments.
- JSONB columns let us store flexible extracted data (death certificate fields vary by state) without a schema migration on every edge case.
- Strong ACID guarantees for legal document management.

**Why TypeORM:**

- First-class NestJS integration via `@nestjs/typeorm` — entities, repositories, and data sources wire in as injectable providers.
- Decorator-based entity definitions keep schema co-located with domain models.
- Migration system (`typeorm migration:generate` / `migration:run`) gives full control over schema evolution.
- Active Record and Data Mapper patterns both supported; we use **Data Mapper** (repository pattern) for testability.
- No separate schema language to learn — entities are plain TypeScript classes.

**Why TypeORM over alternatives (Prisma, Knex):**

- TypeORM is more idiomatic in the NestJS ecosystem; most NestJS documentation and examples use it.
- Repository injection pattern integrates cleanly with NestJS DI and makes unit testing with mock repositories straightforward.
- No code generation step required during development — entities are the source of truth.

---

### Storage: AWS S3

- Death certificates and generated PDFs are binary blobs, not relational data.
- S3 is the de facto standard: durable, cheap, integrates with Lambda natively.
- Pre-signed URLs keep sensitive legal documents out of API server memory.

---

### Infrastructure: AWS CDK (TypeScript)

- Infrastructure-as-code prevents configuration drift between environments.
- CDK in TypeScript means the same language as the backend — engineers don't need to learn HCL/Terraform.
- Can define Lambda, SQS, S3, RDS in one place with type safety.

---

## Data Flow: Death Certificate Processing

```
1. User uploads death certificate (PDF or image) via React UI
        │
2. React requests a pre-signed S3 upload URL from NestJS API
        │
3. React uploads directly to S3 (bypasses API server, no memory overhead)
        │
4. React notifies API: "file uploaded at s3://bucket/key"
        │
5. NestJS creates a Document record (status: PENDING), then updates it to
   PROCESSING and publishes { documentId, s3Key } to SQS processing queue
        │
6. Lambda picks up SQS message:
   a. Download file from S3
   b. Pre-process with PDFPlumber / Pillow (convert to high-res image)
   c. Send image to Claude API with structured extraction prompt
   d. Parse Claude response into typed fields (name, DOB, DOD, cause, etc.)
   e. PATCH /api/v1/documents/:id/processing-result with extracted fields
        │
7. NestJS receives PATCH, updates DB (status: PROCESSED), emits WebSocket event
        │
8. React receives WebSocket event, redirects user to review screen
        │
9. User reviews and corrects extracted fields
```

---

## Data Flow: Legal Document Generation

```
1. User selects one or more institutions to notify (React UI)
        │
2. React POSTs to NestJS: POST /api/v1/cases/:id/generated-documents
   body: { documentId, institutionType, institutionName? }
        │
3. NestJS:
   a. Validates the source Document has status PROCESSED (extractedData present)
   b. Validates the Case has executorInfo (name, address, relationship)
   c. Creates GeneratedDocument record (status: GENERATING)
   d. Maps institutionType → templateId
   e. Publishes DocumentGenerationJob to SQS generation queue:
      { generatedDocumentId, templateId, caseId, deceased, executorName, ... }
   f. Returns 202 Accepted
        │
4. Lambda picks up SQS message (routes via generatedDocumentId key):
   a. Loads Jinja2 template matching templateId
   b. Renders HTML with deceased + executor context
   c. Converts HTML → PDF via WeasyPrint
   d. Uploads PDF to S3: generated/{caseId}/{templateId}/{generatedDocumentId}.pdf
   e. PATCH /api/v1/generated-documents/:id/result
      body: { status: READY, s3Key } or { status: FAILED, errorMessage }
        │
5. NestJS receives PATCH (guarded by X-Internal-Secret header):
   a. Updates GeneratedDocument status + s3Key / errorMessage
        │
6. React polls GET /api/v1/cases/:id/generated-documents
   a. When status = READY, API returns a 15-min pre-signed S3 URL
   b. User clicks to download the PDF
```

---

## Security Considerations

- **PII handling**: Death certificates contain highly sensitive PII. S3 buckets are private; all access via pre-signed URLs with short TTLs (15 min).
- **Encryption at rest**: S3 SSE-S3 and RDS encryption are enabled. Application-layer encryption for SSNs before storage in `Document.extractedData` is tracked as production-readiness task `P6-09`.
- **Auth**: JWT with short expiry + refresh tokens. All API routes behind auth guard.
- **HIPAA posture**: Not HIPAA-covered currently, but architecture is compatible with HIPAA-compliant AWS services when required.
- **No logging of PII**: Lambda and NestJS structured logs must not include document content or extracted fields.

---

## Scalability Path

The current architecture scales to production with minimal changes:

| Concern    | Current                             | Production                           |
| ---------- | ----------------------------------- | ------------------------------------ |
| API        | Single NestJS instance              | ECS Fargate behind ALB               |
| DB         | Docker Compose PostgreSQL + TypeORM | RDS Multi-AZ                         |
| Processing | Lambda (SQS trigger)                | Lambda remains; increase concurrency |
| Frontend   | Vite dev server / S3+CloudFront     | S3 + CloudFront                      |
| Queue      | SQS Standard                        | SQS FIFO for ordering guarantees     |

---

## Roadmap

### Phase 6 — Production Readiness

CloudWatch dashboards and SNS alarms for Lambda error rate and SQS queue depth. Sentry integration for both NestJS and Lambda. Secrets Manager rotation lambdas, automated RDS snapshots, NestJS throttler guards on auth and upload endpoints, and a staging → production CDK promotion pipeline.

### Phase 7 — Auth Hardening

Email verification via SES on registration, forgot-password flow, account lockout after repeated failures, TOTP-based MFA, active session management with remote logout, and Google OAuth2 social login.

### Phase 9 — Additional Institution Templates + Escalation

New institution templates: brokerage accounts, mortgage lenders, auto loan lenders, health insurance, homeowners/renters insurance, county recorder/property deed, state probate court filing cover letters, loyalty/rewards programme cancellations, and professional membership cancellations.

**Escalation workflow** for when an authority fails to act:

- `GeneratedDocument` gains a status lifecycle: `sent → acknowledged → resolved / escalated`, with timestamps stored in the DB.
- Escalation letter templates (second-wave letters that reference the original, cite the applicable regulator, and use a firmer tone).
- Escalation wizard UI: institution-specific step-by-step guide with regulator contact details and direct links to complaint portals (CFPB, SSA OIG, IRS Taxpayer Advocate Service, VA OIG, FTC, state insurance commissioner, state PUC, etc.).
- SES-triggered 30-day reminder email if a notification is not marked resolved.

### Phase 10 — Mobile App _(not yet decided)_

React Native or Flutter apps for Android (FCM push notifications, Play Store pipeline) and iOS (APNs push notifications, App Store + Fastlane pipeline). Full feature parity with the web app: camera capture, real-time WebSocket status, inline field editing, in-app PDF viewer.
