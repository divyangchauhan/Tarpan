# Processor — End-to-End Testing Guide

Tests the full pipeline locally:
**S3 upload → SQS message → Lambda handler → Claude extraction → API callback**

---

## Prerequisites

| Requirement | Check |
|---|---|
| Docker running | `docker info` |
| AWS CLI installed | `aws --version` |
| Poetry installed | `poetry --version` |
| Real Anthropic API key | `echo $ANTHROPIC_API_KEY` |

---

## Quick Start (automated)

```bash
cd apps/processor

# 1. Add your real API key to .env first (one-time setup)
cp .env.example .env
# Edit .env → set ANTHROPIC_API_KEY=sk-ant-...

# 2. Run the automated setup + test script
./scripts/e2e-test.sh
```

The script handles everything from Step 2 onwards. See below for what it does and how to run steps manually.

---

## Manual Steps

### Step 1 — Configure `.env`

```bash
cd apps/processor
cp .env.example .env
```

Edit `.env` and set your real API key:

```
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

All other values in `.env.example` work as-is for local testing.

---

### Step 2 — Start LocalStack

```bash
# From repo root
docker compose up localstack -d

# Tail logs until you see "LocalStack resources initialized."
docker compose logs -f localstack
```

This automatically creates:
- S3 bucket: `afterlight-uploads`
- SQS queue: `afterlight-document-processing`

---

### Step 3 — Install dependencies

```bash
cd apps/processor
poetry install
```

---

### Step 4 — Upload a fixture to S3

**Text-extractable PDF** (exercises the fast text path):

```bash
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  s3 cp tests/fixtures/sample_death_cert_typed.pdf \
  s3://afterlight-uploads/documents/test-doc-001.pdf
```

**Scanned / image-only PDF** (exercises the Claude Vision path):

```bash
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  s3 cp tests/fixtures/sample_death_cert_scanned.pdf \
  s3://afterlight-uploads/documents/test-doc-002.pdf
```

---

### Step 5 — Enqueue an SQS message

```bash
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  sqs send-message \
  --queue-url http://localhost:4566/000000000000/afterlight-document-processing \
  --message-body '{"documentId":"test-doc-001","s3Key":"documents/test-doc-001.pdf"}'
```

For the scanned fixture, change both IDs to `test-doc-002`.

---

### Step 6 — Run the local worker

```bash
cd apps/processor
poetry run python run_worker.py
```

Press `Ctrl+C` to stop.

#### Expected log output

```
INFO worker          Worker started, polling queue: http://localhost:4566/...
INFO src.s3_client   Downloading object  bucket=afterlight-uploads  key=documents/test-doc-001.pdf
INFO src.pdf_processor Using text extraction for PDF  text_length=2098
INFO src.extractor   Calling Claude API for extraction  block_count=1
INFO src.extractor   Extraction complete
INFO src.api_client  Reporting processing result  document_id=test-doc-001  status=PROCESSED
INFO worker          Message processed and deleted  message_id=...
```

For the scanned fixture you will see instead:

```
INFO src.pdf_processor PDF has insufficient text; falling back to vision
```

---

### Step 7 — Inspect the extracted data (optional)

Add a temporary print to verify what Claude returned, or check logs for the
`Extraction complete` line. The extracted fields map to `ExtractedCertificateData`:

| Field | Expected value (typed fixture) |
|---|---|
| `full_name` | John Robert Smith |
| `date_of_death` | 2024-11-20 |
| `place_of_death` | Springfield, Illinois |
| `state` | IL |
| `certificate_number` | 2024-IL-048291 |
| `certifier_name` | Dr. Emily J. Chen |
| `certifier_title` | Medical Examiner |

---

## API Callback

The worker calls `PATCH /api/v1/documents/{id}/processing-result` on the NestJS API after extraction.

- **NestJS running** → full round-trip completes.
- **NestJS not running** → the worker logs an error after extraction but the extraction itself still succeeds. This is expected during isolated processor testing.

To silence the callback error without starting the API, set in `.env`:

```
API_CALLBACK_URL=https://httpbin.org/patch
```

---

## Available Test Fixtures

| File | Type | Exercises |
|---|---|---|
| `sample_death_cert_typed.pdf` | Filled form, text-extractable | Text extraction path (`pdfplumber`) |
| `sample_death_cert_minimal.pdf` | Minimal fields, text-extractable | Text extraction path — sparse data |
| `sample_death_cert_scanned.pdf` | Image-only (rasterised) | Claude Vision path |
| `blank_us_death_certificate.pdf` | CDC blank form (official) | Reference / visual comparison |

Fixtures are generated from the [US Standard Certificate of Death (CDC, 2003)](https://www.cdc.gov/nchs/data/dvs/DEATH11-03final-ACC.pdf)
using entirely fabricated data. To regenerate:

```bash
cd apps/processor
poetry run python tests/fixtures/generate_fixtures.py
```

---

## Cleanup

```bash
# Stop LocalStack
docker compose down

# Remove uploaded test objects
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  s3 rm s3://afterlight-uploads/documents/ --recursive
```
