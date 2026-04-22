# AfterLight

> Automating the 500-hour burden families face after losing a loved one.

## What Is AfterLight?

When someone dies, their family must notify Social Security, Medicare, banks, insurance companies, and dozens of subscription services — all without access to the deceased's passwords, and often while deep in grief. The average family spends **500+ hours** on this administrative work. **3.3 million American families** face this every year, yet no modern tooling exists to help them.

AfterLight is the first AI-powered platform to automate this process end-to-end:

1. **Upload a death certificate** — our parser (powered by GPT-4 Vision / Claude) extracts the key legal data with 95%+ accuracy.
2. **Generate institution-specific legal documents** — 15+ pre-built templates for Social Security, Medicare, major banks, and subscription services.
3. **Track and manage notifications** — a guided dashboard that walks families through every required step.

---

## Tech Stack

| Layer               | Technology                     |
| ------------------- | ------------------------------ |
| Frontend            | React 18 + Vite + Tailwind CSS |
| Backend API         | NestJS (Node.js / TypeScript)  |
| Document Processing | Python + AWS Lambda            |
| AI / OCR            | Claude (Anthropic) via API     |
| Database            | PostgreSQL + TypeORM           |
| File Storage        | AWS S3                         |
| Queue               | AWS SQS                        |
| Infrastructure      | AWS (CDK)                      |

Full rationale in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Repository Structure

```
AfterLight/
├── apps/
│   ├── api/          # NestJS backend
│   ├── web/          # React frontend
│   └── processor/    # Python Lambda for document processing
├── packages/
│   └── shared/       # Shared TypeScript types / constants
├── infra/            # AWS CDK infrastructure code
├── docs/             # Additional documentation
├── ARCHITECTURE.md   # System design & decisions
├── TASKS.md          # Project task tracker
└── CLAUDE.md         # AI agent context file
```

---

## Getting Started (Local Development)

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- AWS CLI (configured)
- pnpm 9+

### Setup

```bash
# Clone the repository
git clone git@github.com:divyangchauhan/AfterLight.git
cd AfterLight

# Install dependencies
pnpm install

# Copy environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start local services (PostgreSQL, S3-compatible storage)
docker compose up -d

# Run database migrations
pnpm --filter api typeorm migration:run

# Start all apps in development mode
pnpm dev
```

---

## Deploying to AWS

### Prerequisites

- AWS CLI configured (`aws configure`)
- AWS CDK CLI: `npm install -g aws-cdk`
- Docker running (CDK uses it to bundle the Lambda)
- Node.js 20+

### First-time bootstrap

```bash
cd infra
npm install
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

### Deploy all stacks

```bash
cdk deploy --all
```

Stacks deploy in dependency order automatically:

| Stack                 | What it creates                                |
| --------------------- | ---------------------------------------------- |
| `AfterLightNetwork`   | VPC, subnets, NAT Gateway, security groups     |
| `AfterLightStorage`   | S3 buckets for uploads and generated PDFs      |
| `AfterLightMessaging` | SQS queues (processing + generation) with DLQs |
| `AfterLightSecrets`   | Secrets Manager entries for all app secrets    |
| `AfterLightDatabase`  | RDS PostgreSQL 16 (db.t3.micro)                |
| `AfterLightLambda`    | Python processor Lambda with SQS triggers      |
| `AfterLightApi`       | ECS Fargate + ALB for the NestJS API           |
| `AfterLightFrontend`  | CloudFront + S3 for the React app              |

### Post-deploy steps

**1. Set the Anthropic API key** (created as a placeholder):

```bash
aws secretsmanager put-secret-value \
  --secret-id afterlight/anthropic-api-key \
  --secret-string '{"value":"sk-ant-api03-..."}'
```

**2. Run database migrations:**

```bash
# Get the DB connection string from Secrets Manager
DB_URL=$(aws secretsmanager get-secret-value \
  --secret-id afterlight/db-credentials \
  --query SecretString --output text | \
  python3 -c "import sys,json; s=json.load(sys.stdin); print(f\"postgresql://{s['username']}:{s['password']}@{s['host']}:5432/{s['dbname']}\")")

DATABASE_URL=$DB_URL pnpm --filter api typeorm migration:run
```

**3. Build and deploy the frontend:**

```bash
# Get the API URL from CDK outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name AfterLightApi \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

# Build with the production API URL
VITE_API_URL=$API_URL VITE_WS_URL=$API_URL pnpm --filter web build

# Sync to S3
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name AfterLightFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" \
  --output text)

aws s3 sync apps/web/dist/ s3://$BUCKET --delete

# Invalidate CloudFront cache
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name AfterLightFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text)

aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

**4. Get the app URL:**

```bash
aws cloudformation describe-stacks \
  --stack-name AfterLightFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionUrl'].OutputValue" \
  --output text
```

### Tear down

```bash
cd infra && cdk destroy --all
```

> **Note:** The S3 buckets and RDS instance have `removalPolicy: RETAIN` / `SNAPSHOT` to protect legal document data. Delete them manually after confirming data is safe.

---

## Key Features (POC — Complete)

- [x] Death certificate upload and parsing (AI-powered OCR)
- [x] Extracted data review and correction UI
- [x] Legal document generation (15+ templates)
- [x] PDF export of generated documents
- [x] Notification checklist dashboard

## Roadmap

| Phase    | Scope                                                                                                                                            | Status |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Phase 6  | Production readiness — monitoring, alerting, secrets rotation, rate limiting, staging pipeline                                                   | ⬜     |
| Phase 7  | Auth hardening — email verification, password reset, MFA, OAuth2                                                                                 | ⬜     |
| Phase 8  | Billing & payments — Stripe subscriptions, pricing tiers, entitlement guards                                                                     | ⬜     |
| Phase 9  | Additional institution templates + escalation tracking — brokerage, mortgage, insurance, probate, escalation letters, 30-day follow-up reminders | ⬜     |
| Phase 10 | Mobile app (Android + iOS) — _not yet decided_                                                                                                   | ⬜     |

See [TASKS.md](./TASKS.md) for the full task breakdown.

---

## Contributing

This is a private repository. See [TASKS.md](./TASKS.md) for the current task breakdown and priorities.

---

## License

Private & Confidential — Shado Ventures © 2026
