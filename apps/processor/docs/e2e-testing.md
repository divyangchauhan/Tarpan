# Processor — End-to-End Testing Guide

Two pipelines can be tested end-to-end locally:

| Pipeline | Trigger | What it tests |
|---|---|---|
| **Processing** | SQS processing queue → Lambda | S3 download → Claude extraction → API callback |
| **Generation** | SQS generation queue → Lambda | GenerationRequest → Jinja2/WeasyPrint → S3 upload → API callback |

Both pipelines are handled by the same Lambda function (`src/handler.py`). The handler routes by message shape: messages containing `generatedDocumentId` go to the generation path; all others go to the processing path.

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
| `typed` | Process typed/text-extractable fixture via SQS processing queue | Yes |
| `scanned` | Process scanned/image-only fixture via SQS processing queue (Claude Vision) | Yes |
| `minimal` | Process minimal-fields fixture via SQS processing queue | Yes |
| `both` | `typed` + `scanned` (default) | Yes |
| `generate` | Send generation event to SQS generation queue, verify PDF in S3 | No |
| `all` | `both` + `generate` | Yes |

> **Queue hygiene**: the script automatically purges both SQS queues at startup to prevent stale messages from a prior run being counted as current-run completions.

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
- SQS queue: `afterlight-document-generation`

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
INFO worker          Worker started, polling queues: ['http://localhost:4566/.../afterlight-document-processing', 'http://localhost:4566/.../afterlight-document-generation']
INFO src.s3_client   Downloading object  bucket=afterlight-uploads  key=documents/test-doc-001.pdf
INFO src.pdf_processor Using text extraction for PDF  text_length=2098
INFO src.extractor   Calling Claude API for extraction  block_count=1
INFO src.extractor   Extraction complete
INFO src.api_client  Reporting processing result  document_id=test-doc-001  status=PROCESSED
INFO worker          Message deleted from queue  message_id=...
```

For the scanned fixture you will see instead:

```
INFO src.pdf_processor PDF has insufficient text; falling back to vision
```

The worker polls both queues in sequence. When both are empty it sleeps 2 s before the next cycle.

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

The generation pipeline now runs through the **SQS generation queue** — the same pattern as the processing pipeline. The worker picks up a `DocumentGenerationJob` message, renders the Jinja2 template via WeasyPrint, uploads the PDF to S3, and calls back the NestJS API.

### Step 1 — Ensure LocalStack is running

```bash
# From repo root
docker compose up localstack -d
```

LocalStack initialises both S3 buckets and both SQS queues automatically via the init scripts.

### Step 2 — Start the local worker (separate terminal)

```bash
cd apps/processor
poetry run python run_worker.py
```

The worker polls both queues. Press `Ctrl+C` to stop.

### Step 3 — Send a generation message to SQS

```bash
aws --endpoint-url=http://localhost:4566 --region us-east-1 \
  sqs send-message \
  --queue-url http://localhost:4566/000000000000/afterlight-document-generation \
  --message-body '{
    "generatedDocumentId": "test-gen-001",
    "templateId": "ssa-721",
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
      "certifier_title": "Attending Physician"
    },
    "executorName": "Robert Smith",
    "executorAddress": "456 Elm Street\nSpringfield, IL 62701",
    "executorRelationship": "Son",
    "executorPhone": "(217) 555-0100",
    "executorEmail": "robert.smith@example.com"
  }'
```

#### Expected worker log output

```
INFO src.handler     Generating document  generated_document_id=test-gen-001  template_id=ssa-721
INFO src.s3_client   Uploading object  bucket=afterlight-generated-docs  key=generated/test-case-001/ssa-721/test-gen-001.pdf
INFO src.handler     Document generated successfully  generated_document_id=test-gen-001  s3_key=...
INFO worker          Message deleted from queue  message_id=...
```

> **Note:** The API callback (`PATCH /api/v1/generated-documents/{id}/result`) requires NestJS to be running. If NestJS is not running, the handler logs a warning but the PDF is still uploaded to S3 — verify via Step 4.

### (Alternative) Direct-invoke the handler without SQS

For quick one-off testing without a running worker:

```bash
cd apps/processor

poetry run python - <<'EOF'
import json
from src.handler import handler

event = {
    "generatedDocumentId": "test-gen-001",
    "templateId": "ssa-721",
    "caseId": "test-case-001",
    "deceased": {
        "full_name": "Jane A. Smith",
        "date_of_death": "2024-11-20",
        "place_of_death": "Springfield, IL",
    },
    "executorName": "Robert Smith",
    "executorAddress": "456 Elm Street\nSpringfield, IL 62701",
    "executorRelationship": "Son",
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

### Step 4 — Verify the PDF in S3

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

| Callback | Endpoint | Auth | Status |
|---|---|---|---|
| Processing result | `PATCH /api/v1/documents/{id}/processing-result` | `X-Internal-Secret` | Implemented (PR #3) |
| Generation result | `PATCH /api/v1/generated-documents/{id}/result` | `X-Internal-Secret` | Implemented (PR #5) |

Both callbacks use the `X-Internal-Secret` header (value from `INTERNAL_API_SECRET` env var).

- **NestJS running** → full round-trip completes for both pipelines.
- **NestJS not running (processing)** → worker logs an error after extraction but extraction still succeeds.
- **NestJS not running (generation)** → handler logs a warning but PDF is still uploaded to S3; status stays `GENERATING` in DB until the callback eventually reaches the API.

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
