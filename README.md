# Tarpan

Tarpan automates the administrative work that falls on a family after a death — parsing the death certificate, generating the institution-specific notification letters, and tracking what's been sent.

Tarpan (तर्पण) is named for the Hindu rite of offering made to those who have passed.

> **Status:** Complete, working build. Runs locally and deploys to AWS (instructions below). Not deployed to production and has no live users — built end-to-end as a personal project to work through a full multi-service architecture.

## What it does

After a death, the next of kin has to notify dozens of institutions — Social Security, Medicare, banks, insurers, subscription services — usually without the deceased's account access. Tarpan reduces that to three steps:

1. **Parse the death certificate.** A Claude-backed parser extracts the key legal fields for review and correction (~98% field-level accuracy on 20 synthetic test certificates — see `apps/processor/scripts/run_accuracy_test.py`).
2. **Generate notification documents.** 15+ institution-specific letter templates (Social Security, Medicare, major banks, subscription services), exported to PDF.
3. **Track notifications.** A checklist dashboard covering what's been sent and what's still outstanding.

---

## Architecture

```
Browser (React + Vite)
    │  HTTPS REST + WebSocket
    ▼
NestJS API (ECS Fargate)
    ├─ Auth (JWT)             ├─ Cases / Documents CRUD
    ├─ S3 pre-signed URLs     ├─ SQS message publishing
    └─ WebSocket gateway ─────────────────────────────────▶ client push
    │
    ├─ PostgreSQL (RDS)
    │
    ├─ SQS: tarpan-document-processing ──▶ Lambda
    └─ SQS: tarpan-document-generation ──▶ Lambda
                                              │
                            Python 3.11 processor
                            ├─ processing path:
                            │   PDFPlumber/Pillow → Claude Vision API
                            │   → Pydantic validation → PATCH callback
                            └─ generation path:
                                Jinja2 → WeasyPrint → S3 upload → PATCH callback
                                              │
                                         AWS S3
                                  (uploads + generated PDFs)
```

### Key design decisions

**NestJS for orchestration, Python Lambda for processing.**
Node.js PDF/image libraries are materially weaker than Python's. Keeping Claude API calls and PDF rendering in Lambda also means the API stays responsive — a 30-second extraction never blocks an HTTP endpoint. The Lambda routes by message shape: `Records` present → extraction, absent → generation.

**Async via SQS, not direct Lambda invocation from the API.**
Claude API calls take 5–30 seconds. Synchronous HTTP would require long-polling or client timeouts. SQS decouples the trigger; Lambda scales to zero when idle and bursts automatically. Results are pushed back over WebSocket, so the client experience feels live without polling.

**S3 pre-signed URLs, not API-mediated transfers.**
Death certificates are sensitive PII. Pre-signed URLs (15-minute TTL) let the browser upload directly to S3 and let the Lambda download directly from S3 — the file bytes never pass through API server memory.

**Two CDK environment profiles: `poc` and `prod`.**
`poc` uses a single NAT gateway, public Fargate subnets, and `DESTROY` removal policies — cheap to spin up and tear down. `prod` adds Multi-AZ RDS, VPC-isolated Lambda, private Fargate subnets, 35-day backup retention, and 30-day secret rotation. Toggled with `--context env=prod`.

**Shared TypeScript types package.**
`packages/shared` is the single source of truth for `Case`, `Document`, `GeneratedDocument`, `ExtractedCertificateData`, and WebSocket event shapes. Both `apps/api` and `apps/web` import from it; type drift is a compile error.

---

## Stack

| Layer              | Technology                                            |
|--------------------|-------------------------------------------------------|
| Frontend           | React 18, Vite, Tailwind CSS, React Router            |
| API                | NestJS (TypeScript), TypeORM, Socket.io, JWT auth     |
| Document processor | Python 3.11, Anthropic SDK, PDFPlumber, Pillow, WeasyPrint, Jinja2 |
| Database           | PostgreSQL 16 (RDS / local Docker)                    |
| Queue              | AWS SQS (processing + generation queues, each with DLQ) |
| Storage            | AWS S3 (uploads bucket + generated-docs bucket)       |
| Compute            | AWS Lambda (processor), ECS Fargate (API), CloudFront + S3 (frontend) |
| Infrastructure     | AWS CDK (TypeScript), 10 stacks                       |
| Observability      | CloudWatch dashboards + SNS alarms, Sentry (API + Lambda) |
| Local dev          | Docker Compose (PostgreSQL 16, LocalStack 3.5)        |
| Build              | pnpm workspaces + Turborepo                           |

---

## Local Development

### Prerequisites

- Node.js 20+, pnpm 9+
- Python 3.11+, Poetry
- Docker & Docker Compose

### Setup

```bash
git clone git@github.com:divyangchauhan/Tarpan.git
cd Tarpan

pnpm install

# Install Python dependencies for the processor (required before pnpm dev)
cd apps/processor && poetry install && cd ../..

# Copy env files — always copy from .env.example, do not reuse old .env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/processor/.env.example apps/processor/.env
# Set ANTHROPIC_API_KEY in apps/processor/.env — required for certificate parsing

# Start PostgreSQL + LocalStack (S3, SQS, Secrets Manager)
docker compose up -d

# Build shared packages (required before running migrations or dev)
pnpm build

# Run database migrations
pnpm --filter api migration:run

# Start all services in dev mode (API :3001, web :5173, Python SQS worker)
pnpm dev
```

`pnpm dev` starts the NestJS API on `:3001`, the React app on `:5173`, and the Python SQS worker via Turborepo. The Python worker requires `poetry install` to have run first — turbo will exit with an error if it hasn't.

To start the Python worker standalone (without `pnpm dev`):

```bash
cd apps/processor
./start_worker.sh    # polls the local SQS queue via LocalStack
```

### Running tests

```bash
# TypeScript (API + web + shared)
pnpm turbo run test --filter=!@tarpan/processor

# Python
cd apps/processor && poetry run pytest

# Type-check all TS packages
pnpm turbo run typecheck --filter=!@tarpan/processor
```

---

## Deploying to AWS

### Prerequisites

- AWS CLI configured
- CDK CLI: `npm install -g aws-cdk`
- Docker running (CDK bundles the Lambda image)

### First-time bootstrap

```bash
cd infra
pnpm install
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

### Deploy

```bash
# POC (single NAT, DESTROY removal policies — easy teardown)
cdk deploy --all \
  --context apiDomainName=api.example.com \
  --context apiCertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/<CERT_ID> \
  --context cloudFrontOriginFacingPrefixListId=pl-<REGION_ID>

# Production (Multi-AZ RDS, VPC-isolated Lambda, backup + secret rotation)
cdk deploy --all --context env=prod \
  --context apiDomainName=api.example.com \
  --context apiCertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/<CERT_ID> \
  --context cloudFrontOriginFacingPrefixListId=pl-<REGION_ID>

# With CloudWatch alarm email
cdk deploy --all --context alertEmail=ops@example.com \
  --context apiDomainName=api.example.com \
  --context apiCertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/<CERT_ID> \
  --context cloudFrontOriginFacingPrefixListId=pl-<REGION_ID>
```

The prefix-list ID is the AWS-managed `com.amazonaws.global.cloudfront.origin-facing`
prefix list in the deployment region. The ALB security group allows HTTPS only
from that list, so the API can safely trust the two proxy hops when deriving the
original client IP for throttling.

Stacks deploy in dependency order:

| Stack                  | What it provisions                                         |
|------------------------|------------------------------------------------------------|
| `TarpanNetwork`        | VPC, subnets, NAT gateway, security groups                 |
| `TarpanStorage`        | S3 upload and generated-docs buckets                       |
| `TarpanMessaging`      | SQS processing + generation queues, DLQs                   |
| `TarpanSecrets`        | Secrets Manager entries for all app secrets                |
| `TarpanDatabase`       | RDS PostgreSQL 16                                          |
| `TarpanLambda`         | Python processor Lambda with SQS triggers                  |
| `TarpanApi`            | ECS Fargate + ALB for the NestJS API                       |
| `TarpanFrontend`       | CloudFront + S3 for the React app                          |
| `TarpanObservability`  | CloudWatch dashboard + SNS alarms                          |
| `TarpanBackup`         | AWS Backup plan (prod: 35-day retention)                   |

### Post-deploy steps

**1. Set the Anthropic API key:**

```bash
aws secretsmanager put-secret-value \
  --secret-id tarpan/anthropic-api-key \
  --secret-string '{"value":"sk-ant-api03-..."}'
```

**2. Run database migrations:**

```bash
DB_URL=$(aws secretsmanager get-secret-value \
  --secret-id tarpan/db-credentials \
  --query SecretString --output text | \
  python3 -c "import sys,json; s=json.load(sys.stdin); print(f\"postgresql://{s['username']}:{s['password']}@{s['host']}:5432/{s['dbname']}\")")

DATABASE_URL=$DB_URL pnpm --filter api migration:run
```

**3. Build and deploy the frontend:**

```bash
API_URL=$(aws cloudformation describe-stacks \
  --stack-name TarpanApi \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

VITE_API_URL=$API_URL VITE_WS_URL=$API_URL pnpm --filter web build

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name TarpanFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" \
  --output text)

aws s3 sync apps/web/dist/ s3://$BUCKET --delete

DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name TarpanFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text)

aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

**4. Get the app URL:**

```bash
aws cloudformation describe-stacks \
  --stack-name TarpanFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionUrl'].OutputValue" \
  --output text
```

### Tear down

```bash
cd infra && cdk destroy --all
```

> S3 buckets and RDS use `removalPolicy: RETAIN` / `SNAPSHOT` in prod. Delete them manually after confirming data is safe.

---

## Repository Layout

```
Tarpan/
├── apps/
│   ├── api/          # NestJS backend
│   ├── web/          # React frontend
│   └── processor/    # Python Lambda (extraction + PDF generation)
├── packages/
│   └── shared/       # Canonical TypeScript types shared by api and web
├── infra/            # AWS CDK (10 stacks)
├── ARCHITECTURE.md   # Extended design rationale
└── TASKS.md          # Phase-by-phase task tracker
```

---

## Possible extensions

- **Auth hardening** — email verification, password reset, MFA, OAuth2 social login
- **Additional institution templates + escalation workflow** — brokerage accounts, mortgage lenders, health/property insurance, probate court filings, escalation letters with regulator contacts, 30-day SES reminders
- **Mobile app** — not yet decided

---

## License

MIT
