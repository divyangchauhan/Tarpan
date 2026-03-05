# System Architecture

## Overview

AfterLight is a document-centric platform with three distinct processing concerns:

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
└──────┬──────────────────────────────────────┬────────────────────┘
       │ PostgreSQL                            │ SQS
┌──────▼──────────┐               ┌───────────▼────────────────────┐
│   PostgreSQL    │               │         AWS Lambda              │
│  (RDS / local)  │               │    Python 3.11 processor        │
└─────────────────┘               │  • Claude API (OCR / parse)    │
                                  │  • PDF generation (WeasyPrint)  │
                                  │  • Result stored back to S3     │
                                  │  • Status update via API        │
                                  └────────────────────────────────┘
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
- Next.js — rejected for POC because SSR/SSG adds complexity without investor-demo benefit; can migrate later if SEO or auth flows require it.
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
- tRPC is excellent but ties frontend and backend more tightly. For a POC that may need a mobile app or third-party integrations later, a REST API is more portable.

---

### Document Processing: Python + AWS Lambda

**Why Python:**
- The best AI/ML library ecosystem (LangChain, Anthropic SDK, PDFPlumber, WeasyPrint, Pillow).
- Claude's official Python SDK is more mature and has more examples than the Node.js version for document parsing use cases.
- PDFPlumber and Pillow are battle-tested for PDF/image preprocessing before sending to vision models.

**Why AWS Lambda:**
- Death certificate parsing involves calling the Claude API (network I/O) and generating PDFs (CPU burst). This workload is bursty — idle between uploads, then potentially concurrent.
- Lambda scales to zero (no cost when idle) and bursts horizontally automatically.
- No container management overhead for a 3-person early-stage company.
- Cold start latency (~1-2s) is acceptable for async document processing.

**Why not a dedicated Python microservice:**
- A long-running service (ECS / EC2) costs money 24/7 even when idle.
- Lambda is operationally simpler for a POC; migration to ECS is straightforward if workloads grow.

**Why not process in NestJS directly:**
- Node.js PDF processing libraries are significantly less capable than Python's.
- Keeping AI processing separate means the API stays responsive; a slow Claude API call never blocks HTTP endpoints.

---

### Queue: AWS SQS

**Why async processing:**
- Claude API calls can take 5-30 seconds for a full death certificate parse.
- A synchronous HTTP call holding a connection open for 30s is fragile (client timeout, Lambda timeout, load balancer timeout).
- SQS decouples upload from processing: API returns immediately with a job ID, Lambda processes in background, frontend polls or receives WebSocket push when done.

**Why SQS over RabbitMQ / Redis Streams:**
- SQS is managed, serverless, and integrates natively with Lambda triggers — zero ops overhead.
- For POC scale, SQS standard queues are sufficient. Can add FIFO queues later if ordering matters.

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
- CDK in TypeScript means the same language as the backend — engineers don't need to learn HCL/Terraform for a POC.
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
5. NestJS creates a Document record (status: PENDING) and publishes
   a message to SQS with { documentId, s3Key }
        │
6. Lambda is triggered by SQS message:
   a. Download file from S3
   b. Pre-process with PDFPlumber / Pillow (convert to high-res image)
   c. Send image to Claude API with structured extraction prompt
   d. Parse Claude response into typed fields (name, DOB, DOD, cause, etc.)
   e. Store extracted JSON back to S3
   f. PATCH /documents/:id with extracted fields and status: PROCESSED
        │
7. NestJS receives PATCH, updates DB, emits WebSocket event to client
        │
8. React receives WebSocket event, redirects user to review screen
        │
9. User reviews and corrects extracted fields
        │
10. User selects institutions to notify → NestJS triggers document generation Lambda
        │
11. Lambda renders institution-specific templates → PDF → S3
        │
12. User downloads PDFs from React UI via pre-signed S3 URLs
```

---

## Security Considerations

- **PII handling**: Death certificates contain highly sensitive PII. S3 buckets are private; all access via pre-signed URLs with short TTLs (15 min).
- **Encryption at rest**: S3 SSE-S3; RDS encryption enabled.
- **Auth**: JWT with short expiry + refresh tokens. All API routes behind auth guard.
- **HIPAA posture**: Not HIPAA-covered for POC, but architecture is compatible with HIPAA-compliant AWS services when required.
- **No logging of PII**: Lambda and NestJS structured logs must not include document content or extracted fields.

---

## Scalability Path

The POC architecture scales to production with minimal changes:

| Concern | POC | Production |
|---|---|---|
| API | Single NestJS instance | ECS Fargate behind ALB |
| DB | Docker Compose PostgreSQL + TypeORM | RDS Multi-AZ |
| Processing | Lambda (SQS trigger) | Lambda remains; increase concurrency |
| Frontend | Vite dev server / S3+CloudFront | S3 + CloudFront |
| Queue | SQS Standard | SQS FIFO for ordering guarantees |
