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

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend API | NestJS (Node.js / TypeScript) |
| Document Processing | Python + AWS Lambda |
| AI / OCR | Claude (Anthropic) via API |
| Database | PostgreSQL + TypeORM |
| File Storage | AWS S3 |
| Queue | AWS SQS |
| Infrastructure | AWS (CDK) |

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

## Key Features (POC Scope)

- [x] Death certificate upload and parsing (AI-powered OCR)
- [x] Extracted data review and correction UI
- [x] Legal document generation (15+ templates)
- [x] PDF export of generated documents
- [x] Notification checklist dashboard
- [ ] Multi-institution submission (post-POC)
- [ ] Family member collaboration (post-POC)
- [ ] Payment / subscription (post-POC)

---

## Contributing

This is a private repository. See [TASKS.md](./TASKS.md) for the current task breakdown and priorities.

---

## License

Private & Confidential — Shado Ventures © 2026
