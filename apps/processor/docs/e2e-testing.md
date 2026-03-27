# Processor — End-to-End Testing Guide

Two pipelines can be tested end-to-end locally:

| Pipeline | Trigger | What it tests |
|---|---|---|
| **Processing** | SQS → Lambda | S3 download → Claude extraction → API callback |
| **Generation** | Direct invoke | GenerationRequest → Jinja2/WeasyPrint → S3 upload |

---

## Prerequisites

| Requirement | Check |
|---|---|
| Docker running | `docker info` |
| AWS CLI installed | `aws --version` |
| Poetry installed | `poetry --version` |
| Real Anthropic API key | see `.env` setup below |

> **Generation-only testing** (`generate` mode) does not need the NestJS API running and does not call the real Claude API — templates render from pre-supplied data.

---

## Quick Start (automated)

```bash
cd apps/processor

# One-time setup: copy .env and set your real API key
cp .env.example .env
# Edit .env → set ANTHROPIC_API_KEY=sk-ant-...

# Test processing pipeline only (typed + scanned fixtures)
./scripts/e2e-test.sh both --email user@example.com --password s3cr3t

# Test generation pipeline only (no API auth needed)
./scripts/e2e-test.sh generate

# Test a specific template
./scripts/e2e-test.sh generate --template irs-notification

# Test everything
./scripts/e2e-test.sh all --email user@example.com --password s3cr3t
```

---

## Available Modes

| Mode | Description | Requires API? |
|---|---|---|
| `typed` | Process typed/text-extractable fixture via SQS | Yes |
| `scanned` | Process scanned/image-only fixture via SQS (Claude Vision) | Yes |
| `minimal` | Process minimal-fields fixture via SQS | Yes |
| `both` | `typed` + `scanned` (default) | Yes |
| `generate` | Direct-invoke handler with generation event, verify PDF in S3 | No |
| `all` | `both` + `generate` | Yes |

---

## Manual Steps — Processing Pipeline

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
- S3 bucket: `afterlight-generated-docs`
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

The extracted fields map to `ExtractedCertificateData`:

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

## Manual Steps — Generation Pipeline

The generation pipeline is triggered by a **direct Lambda invocation** (no SQS). The handler renders a Jinja2 template to PDF via WeasyPrint and uploads the result to S3.

### Step 1 — Ensure LocalStack is running and buckets exist

```bash
# From repo root
docker compose up localstack -d

# Create the generated-docs bucket if it doesn't already exist
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  s3 mb s3://afterlight-generated-docs 2>/dev/null || true
```

### Step 2 — Direct-invoke the handler

```bash
cd apps/processor

poetry run python - <<'EOF'
import json
from src.handler import handler

event = {
    "generatedDocumentId": "test-gen-001",
    "templateId": "ssa-721",          # any registered template ID
    "caseId": "test-case-001",
    "deceased": {
        "full_name": "Jane A. Smith",
        "first_name": "Jane",
        "last_name": "Smith",
        "date_of_birth": "1945-03-15",
        "date_of_death": "2024-11-20",
        "place_of_death": "Springfield, IL",
        "state": "IL",
        "certificate_number": "2024-IL-001234",
        "certifier_name": "Dr. John Doe",
        "certifier_title": "Attending Physician",
    },
    "executorName": "Robert Smith",
    "executorAddress": "456 Elm Street\nSpringfield, IL 62701",
    "executorRelationship": "Son",
    "executorPhone": "(217) 555-0100",
    "executorEmail": "robert.smith@example.com",
}

result = handler(event, object())
print(json.dumps(result, indent=2))
EOF
```

#### Expected output

```json
{
  "generatedDocumentId": "test-gen-001",
  "status": "COMPLETED",
  "s3Key": "generated/test-case-001/ssa-721/test-gen-001.pdf"
}
```

> **Note:** The `status` will be `COMPLETED` only if the API callback succeeds. If NestJS is not running or the `/api/v1/generated-documents/{id}/result` endpoint is not yet implemented (task P1-10), the handler returns `FAILED` after a successful S3 upload. Check S3 directly to confirm the PDF was generated.

### Step 3 — Verify the PDF in S3

```bash
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  s3 ls s3://afterlight-generated-docs/generated/ --recursive
```

Download and inspect:

```bash
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  s3 cp s3://afterlight-generated-docs/generated/test-case-001/ssa-721/test-gen-001.pdf \
  /tmp/test-gen-001.pdf

open /tmp/test-gen-001.pdf   # macOS
xdg-open /tmp/test-gen-001.pdf  # Linux
```

---

## Available Template IDs

| Template ID | Institution |
|---|---|
| `ssa-721` | Social Security Administration |
| `medicare` | Centers for Medicare & Medicaid Services |
| `bank-closure` | Generic bank account closure |
| `credit-card-cancellation` | Generic credit card cancellation |
| `subscription-cancellation` | Streaming / utility subscriptions |
| `irs-notification` | Internal Revenue Service |
| `dmv-notification` | State DMV / driver's license |
| `voter-registration` | State Board of Elections |
| `usps-notification` | USPS mail forwarding |
| `life-insurance` | Life insurance claim initiation |
| `pension-401k` | Pension / 401(k) beneficiary |
| `veterans-affairs` | U.S. Department of Veterans Affairs |
| `passport-cancellation` | U.S. Department of State |
| `professional-license` | State professional licensing board |
| `employer-notification` | Employer / HR department |

Generic templates (`bank-closure`, `credit-card-cancellation`, `subscription-cancellation`, `dmv-notification`, `voter-registration`, `professional-license`, `employer-notification`) accept optional `institutionName` and `institutionAddress` fields in the generation event to customise the recipient block.

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

## API Callback Behaviour

| Callback | Endpoint | Status |
|---|---|---|
| Processing result | `PATCH /api/v1/documents/{id}/processing-result` | Implemented (PR #3) |
| Generation result | `PATCH /api/v1/generated-documents/{id}/result` | Pending (task P1-10) |

- **NestJS running** → full round-trip completes for both pipelines.
- **NestJS not running (processing)** → worker logs an error after extraction but extraction still succeeds.
- **NestJS not running (generation)** → handler returns `FAILED` but the PDF is still uploaded to S3.

To silence callback errors without starting the API, set in `.env`:

```
API_CALLBACK_URL=https://httpbin.org/patch
```

---

## Cleanup

```bash
# Stop LocalStack
docker compose down

# Remove uploaded test objects
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  s3 rm s3://afterlight-uploads/documents/ --recursive

# Remove generated PDFs
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  s3 rm s3://afterlight-generated-docs/generated/ --recursive
```
