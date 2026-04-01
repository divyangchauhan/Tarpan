# AfterLight Processor

Python Lambda function for processing death certificates and generating legal documents.

## Architecture

This processor runs as a **background worker** in local development that:
1. Polls SQS queues for document processing and generation jobs
2. Downloads documents from S3
3. Extracts data using Claude API
4. Generates PDFs using WeasyPrint
5. Reports results back to the NestJS API

## Local Development Setup

### Prerequisites

- Python 3.11+
- Poetry
- LocalStack (running via docker-compose)
- NestJS API (running)

### Installation

```bash
cd apps/processor
poetry install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `ANTHROPIC_API_KEY` - Your Claude API key
- `AWS_ENDPOINT_URL` - LocalStack endpoint (default: http://localhost:4566)
- `SQS_DOCUMENT_PROCESSING_QUEUE_URL` - Processing queue URL
- `SQS_DOCUMENT_GENERATION_QUEUE_URL` - Generation queue URL
- `API_CALLBACK_URL` - NestJS API URL (default: http://localhost:3001)

### Running the Worker

**Option 1: Using the helper script (recommended)**
```bash
./start_worker.sh
```

**Option 2: Using pnpm (from monorepo root)**
```bash
pnpm --filter @afterlight/processor dev
```

**Option 3: Using poetry directly**
```bash
poetry run python run_worker.py
```

**Option 4: Include in full dev workflow**
```bash
# From monorepo root
pnpm dev
```

### Important Notes

⚠️ **The processor must be running for document uploads to complete processing!**

Without the worker running:
- Documents will be uploaded to S3 successfully
- Messages will be added to SQS queue
- But documents will remain stuck in "PROCESSING" status
- Once you start the worker, it will process all queued messages

### How It Works

1. **Document Processing Flow:**
   - User uploads death certificate via web UI
   - NestJS API creates document record with status "PENDING"
   - Frontend uploads file to S3 using pre-signed URL
   - Frontend calls `/enqueue-processing` endpoint
   - NestJS API updates status to "PROCESSING" and sends SQS message
   - **Worker polls SQS, processes document, extracts data**
   - Worker calls API to update document status to "PROCESSED"

2. **Document Generation Flow:**
   - User requests a generated document (letter/form)
   - NestJS API sends SQS message with generation request
   - **Worker polls SQS, renders PDF from template**
   - Worker uploads PDF to S3
   - Worker calls API to update generated document status

## Testing

```bash
# Run all tests
poetry run pytest

# Run with coverage
poetry run pytest --cov=src --cov-report=term-missing

# Run specific test file
poetry run pytest tests/test_extractor.py
```

## Linting and Type Checking

```bash
# Lint with ruff
poetry run ruff check src tests

# Format with black
poetry run black src tests

# Type check with mypy
poetry run mypy src
```

## Production Deployment

In production, this code runs as an AWS Lambda function triggered by SQS events (not as a polling worker).

The CDK infrastructure (in `/infra`) sets up:
- Lambda function with proper IAM roles
- SQS event source mapping
- Dead letter queues for failed messages
- CloudWatch logs for monitoring
