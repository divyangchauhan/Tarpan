#!/usr/bin/env bash
# =============================================================================
# AfterLight Processor — End-to-End Test Script
#
# Usage (from apps/processor/):
#   ./scripts/e2e-test.sh                                       # prompts for credentials
#   ./scripts/e2e-test.sh --email user@example.com --password s3cr3t
#
# Processing modes (death certificate extraction via SQS):
#   ./scripts/e2e-test.sh typed   --email ... --password ...
#   ./scripts/e2e-test.sh scanned --email ... --password ...
#   ./scripts/e2e-test.sh minimal --email ... --password ...
#   ./scripts/e2e-test.sh both    --email ... --password ...   (typed + scanned)
#
# Generation modes (PDF generation via direct Lambda invocation):
#   ./scripts/e2e-test.sh generate [--template ssa-721]        (requires API + credentials)
#   ./scripts/e2e-test.sh generate --all-templates             (generates all 15 templates)
#
# Combined:
#   ./scripts/e2e-test.sh all --email ... --password ...       (both + generate)
#
# Credentials can also be supplied via environment variables:
#   E2E_EMAIL=... E2E_PASSWORD=... ./scripts/e2e-test.sh
#
# Prerequisites:
#   - apps/processor/.env with a real ANTHROPIC_API_KEY
#   - Docker running (LocalStack)
#   - NestJS API running on localhost:3001  (required for processing modes)
#   - AWS CLI + Poetry installed
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROCESSOR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PROCESSOR_DIR/../.." && pwd)"

# LocalStack accepts any non-empty credentials — export so the AWS CLI picks them up
# without requiring the caller to have ~/.aws/credentials configured.
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

AWS_LOCAL="aws --endpoint-url=http://localhost:4566 --region us-east-1"
UPLOADS_BUCKET="afterlight-uploads"
GENERATED_DOCS_BUCKET="afterlight-generated-docs"
FIXTURES_DIR="$PROCESSOR_DIR/tests/fixtures"
API_BASE="http://localhost:3001/api/v1"

MODE="both"
TEMPLATE_ID="ssa-721"
ALL_TEMPLATES=false

ALL_TEMPLATE_IDS=(
  ssa-721
  medicare
  bank-closure
  credit-card-cancellation
  subscription-cancellation
  irs-notification
  dmv-notification
  voter-registration
  usps-notification
  life-insurance
  pension-401k
  veterans-affairs
  passport-cancellation
  professional-license
  employer-notification
)
EMAIL="${E2E_EMAIL:-}"
PASSWORD="${E2E_PASSWORD:-}"
ACCESS_TOKEN=""

# Set by setup_document (first call wins); reused by run_generation.
E2E_PROC_CASE_ID=""
E2E_PROC_DOC_ID=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { echo ""; echo "▶  $*"; }
ok()   { echo "   ✓ $*"; }
warn() { echo "   ⚠  $*"; }
fail() { echo ""; echo "✗  ERROR: $*" >&2; exit 1; }

check_cmd() {
  command -v "$1" &>/dev/null || fail "'$1' is not installed or not in PATH"
}

# Parse a single key from a JSON string passed via stdin.
# Usage: echo "$json" | json_field key
# Usage: echo "$json" | json_nested outer inner
json_field()  { python3 -c "import sys,json; print(json.load(sys.stdin)['$1'])"; }
json_nested() { python3 -c "import sys,json; print(json.load(sys.stdin)['$1']['$2'])"; }

# Authenticated POST using Python urllib — avoids curl Content-Type ambiguity.
# Usage: api_post <url> <json-body>
api_post() {
  local url="$1" data="${2:-}"
  python3 - "$url" "$data" "$ACCESS_TOKEN" <<'PYEOF'
import sys, json, urllib.request, urllib.error

url, data, token = sys.argv[1], sys.argv[2], sys.argv[3]
encoded = data.encode("utf-8") if data else None
req = urllib.request.Request(
    url,
    data=encoded,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode("utf-8"), end="")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    print(f"\n✗  API call failed: POST {url}", file=sys.stderr)
    print(f"   HTTP {e.code} — {body}", file=sys.stderr)
    sys.exit(1)
PYEOF
}

# Authenticated GET using Python urllib.
# Usage: api_get <url>
api_get() {
  local url="$1"
  python3 - "$url" "$ACCESS_TOKEN" <<'PYEOF'
import sys, urllib.request, urllib.error

url, token = sys.argv[1], sys.argv[2]
req = urllib.request.Request(
    url,
    headers={"Authorization": f"Bearer {token}"},
    method="GET",
)
try:
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode("utf-8"), end="")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    print(f"\n✗  API call failed: GET {url}", file=sys.stderr)
    print(f"   HTTP {e.code} — {body}", file=sys.stderr)
    sys.exit(1)
PYEOF
}

wait_for_localstack() {
  log "Waiting for LocalStack to be ready..."
  local max_attempts=30 attempt=0
  until curl -sf http://localhost:4566/_localstack/health 2>/dev/null | grep -q '"s3": "available"'; do
    attempt=$((attempt + 1))
    [ "$attempt" -ge "$max_attempts" ] && fail "LocalStack did not become healthy after ${max_attempts}s"
    printf "."
    sleep 1
  done
  echo ""
  ok "LocalStack is ready"
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)         EMAIL="$2";    shift 2 ;;
    --password)      PASSWORD="$2"; shift 2 ;;
    --template)      TEMPLATE_ID="$2"; shift 2 ;;
    --all-templates) ALL_TEMPLATES=true; shift ;;
    typed|scanned|minimal|both|generate|all) MODE="$1"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

log "Pre-flight checks..."

check_cmd docker
check_cmd aws
check_cmd poetry
check_cmd curl
check_cmd python3

ENV_FILE="$PROCESSOR_DIR/.env"
[ -f "$ENV_FILE" ] || fail ".env not found. Run: cp apps/processor/.env.example apps/processor/.env\n   Then set ANTHROPIC_API_KEY."

API_KEY=$(grep -E '^ANTHROPIC_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d ' ')
if [ -z "$API_KEY" ] || [[ "$API_KEY" == sk-ant-... ]] || [[ "$API_KEY" == sk-ant-YOUR* ]]; then
  fail "ANTHROPIC_API_KEY is not set in apps/processor/.env."
fi
ok ".env found with API key set"

docker info &>/dev/null || fail "Docker is not running"
ok "Docker is running"

# ---------------------------------------------------------------------------
# Prompt for credentials
# ---------------------------------------------------------------------------

if [ -z "$EMAIL" ]; then
  printf "\n   API email: "
  read -r EMAIL
fi
if [ -z "$PASSWORD" ]; then
  printf "   API password: "
  read -r -s PASSWORD
  echo ""
fi

# ---------------------------------------------------------------------------
# LocalStack
# ---------------------------------------------------------------------------

log "Checking LocalStack..."

if ! curl -sf http://localhost:4566/_localstack/health &>/dev/null; then
  log "Starting LocalStack via docker compose..."
  (cd "$REPO_ROOT" && docker compose up localstack -d)
  wait_for_localstack
else
  ok "LocalStack already running"
fi

sleep 2
$AWS_LOCAL s3 mb "s3://$UPLOADS_BUCKET" 2>/dev/null || true
ok "S3 bucket ready: $UPLOADS_BUCKET"
$AWS_LOCAL s3 mb "s3://$GENERATED_DOCS_BUCKET" 2>/dev/null || true
ok "S3 bucket ready: $GENERATED_DOCS_BUCKET"

SQS_QUEUE_NAME="afterlight-document-processing"
SQS_QUEUE_URL="http://localhost:4566/000000000000/$SQS_QUEUE_NAME"
$AWS_LOCAL sqs create-queue --queue-name "$SQS_QUEUE_NAME" 2>/dev/null || true
$AWS_LOCAL sqs purge-queue --queue-url "$SQS_QUEUE_URL" 2>/dev/null || true
ok "SQS queue ready and flushed: $SQS_QUEUE_NAME"

# ---------------------------------------------------------------------------
# Check NestJS API
# ---------------------------------------------------------------------------

log "Checking NestJS API (localhost:3001)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "000")
[ "$HTTP_CODE" = "000" ] && fail "NestJS API is not running on localhost:3001.\n   Start it with: pnpm --filter api dev"
ok "NestJS API is reachable"

# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

log "Logging in as $EMAIL..."

LOGIN_JSON=$(python3 - "$API_BASE/auth/login" "$EMAIL" "$PASSWORD" <<'PYEOF'
import sys, json, urllib.request, urllib.error

url, email, password = sys.argv[1], sys.argv[2], sys.argv[3]
payload = json.dumps({"email": email, "password": password}).encode("utf-8")
req = urllib.request.Request(url, data=payload,
    headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode("utf-8"), end="")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    print(f"Login failed (HTTP {e.code}): {body}", file=sys.stderr)
    sys.exit(1)
PYEOF
) || fail "Login failed. Check email/password."

ACCESS_TOKEN=$(echo "$LOGIN_JSON" | json_field "accessToken")
ok "Authenticated"

# ---------------------------------------------------------------------------
# Install Python dependencies
# ---------------------------------------------------------------------------

log "Installing Poetry dependencies..."
(cd "$PROCESSOR_DIR" && poetry install --quiet)
ok "Dependencies installed"

# ---------------------------------------------------------------------------
# Processing flow helpers
# ---------------------------------------------------------------------------

setup_document() {
  local fixture_path="$1"
  local label="$2"

  log "[$label] Creating test case..."
  local case_body
  case_body=$(python3 -c "import json; print(json.dumps({
    'deceasedInfo': {
      'firstName': 'E2E', 'lastName': 'Test',
      'dateOfBirth': '1940-06-15', 'dateOfDeath': '2026-01-10',
      'placeOfDeath': 'Springfield, IL'
    },
    'executorInfo': {
      'name': 'Jane E2E Executor',
      'address': '123 Test Street\nSpringfield, IL 62701',
      'relationship': 'Daughter',
      'phone': '(217) 555-0001',
      'email': 'executor@e2e-test.local'
    }
  }))")
  local case_json
  case_json=$(api_post "$API_BASE/cases" "$case_body")
  local case_id
  case_id=$(echo "$case_json" | json_field "id")
  ok "Case: $case_id"

  log "[$label] Initiating document upload..."
  local upload_body upload_json
  upload_body="{\"caseId\":\"$case_id\",\"fileName\":\"death_certificate.pdf\",\"contentType\":\"application/pdf\"}"
  upload_json=$(api_post "$API_BASE/cases/$case_id/documents/initiate-upload" "$upload_body")
  local doc_id s3_key
  doc_id=$(echo "$upload_json" | json_nested "document" "id")
  s3_key=$(echo "$upload_json" | json_nested "document" "s3Key")
  ok "Document: $doc_id"

  log "[$label] Uploading fixture to S3..."
  $AWS_LOCAL s3 cp "$fixture_path" "s3://$UPLOADS_BUCKET/$s3_key" --quiet
  ok "Uploaded: s3://$UPLOADS_BUCKET/$s3_key"

  log "[$label] Triggering processing (API enqueues SQS job)..."
  api_post "$API_BASE/cases/$case_id/documents/$doc_id/process" > /dev/null
  ok "Job enqueued — document $doc_id"

  # Record the first processed case/doc so run_generation can reuse them.
  if [ -z "$E2E_PROC_CASE_ID" ]; then
    E2E_PROC_CASE_ID="$case_id"
    E2E_PROC_DOC_ID="$doc_id"
  fi
}

run_processing_worker() {
  local expected_messages="$1"

  log "Starting local worker (processes queue then exits)..."
  echo ""
  echo "──────────────────────────────────────────────────────────────────────"
  echo "  Jobs enqueued. Results will post back to: $API_BASE"
  echo "──────────────────────────────────────────────────────────────────────"
  echo ""

  cd "$PROCESSOR_DIR"

  poetry run python - <<PYEOF
import subprocess, sys

expected = $expected_messages
processed = 0

proc = subprocess.Popen(
    ["poetry", "run", "python", "run_worker.py"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
)

try:
    for line in proc.stdout:
        print(line, end="", flush=True)
        if "Message deleted from queue" in line or "Document processed successfully" in line:
            processed += 1
        if processed >= expected:
            break
finally:
    proc.terminate()
    proc.stdout.close()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()

print("")
print(f"Worker stopped.  Messages processed: {processed} / {expected}")
if processed < expected:
    print("WARNING: Not all messages were processed. Check logs above.", file=sys.stderr)
    sys.exit(1)
PYEOF
}

# ---------------------------------------------------------------------------
# Generation flow helper
# ---------------------------------------------------------------------------

run_generation() {
  local template_id="$1"
  local gen_doc_id="e2e-gen-$(date +%s)-$$"

  log "[GENERATION] Testing template: $template_id"

  # In standalone generate mode there is no prior processing case.
  # Run a quick setup + extraction now so extractedData is available.
  if [ -z "$E2E_PROC_CASE_ID" ]; then
    log "[GENERATION] No prior processing case — running extraction first..."
    setup_document "$FIXTURES_DIR/sample_death_cert_typed.pdf" "GEN SETUP"
    run_processing_worker 1
  fi

  local case_id="$E2E_PROC_CASE_ID"
  local doc_id="$E2E_PROC_DOC_ID"

  # Fetch executorInfo from the case.
  local fetched_case
  fetched_case=$(api_get "$API_BASE/cases/$case_id")

  # Fetch extractedData from the processed document.
  local fetched_doc
  fetched_doc=$(api_get "$API_BASE/cases/$case_id/documents/$doc_id")

  local expected_s3_key="generated/${case_id}/${template_id}/${gen_doc_id}.pdf"

  cd "$PROCESSOR_DIR"

  # Start a mock HTTP server to absorb the API callback from the handler.
  # This avoids 404 errors when the NestJS generated-documents endpoint
  # isn't yet implemented — the core test is that the PDF lands in S3.
  local mock_port=3099
  local mock_script
  mock_script=$(mktemp /tmp/e2e-mock-server.XXXXXX.py)
  cat > "$mock_script" <<'PYEOF_MOCK'
import http.server, sys

class _Handler(http.server.BaseHTTPRequestHandler):
    def do_PATCH(self):
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
    def log_message(self, *args):
        pass  # suppress access log

http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), _Handler).serve_forever()
PYEOF_MOCK

  python3 "$mock_script" "$mock_port" &
  local mock_pid=$!
  sleep 0.3  # let the server bind

  cleanup_mock() {
    kill "$mock_pid" 2>/dev/null || true
    rm -f "$mock_script"
  }
  trap cleanup_mock EXIT INT TERM

  # Direct-invoke the handler.
  # CASE_JSON and DOC_JSON are passed via env; API_CALLBACK_URL points to the mock.
  CASE_JSON="$fetched_case" \
  DOC_JSON="$fetched_doc" \
  API_CALLBACK_URL="http://127.0.0.1:$mock_port" \
  poetry run python - "$gen_doc_id" "$template_id" "$case_id" <<'PYEOF' 2>&1 || true
import json, os, sys

gen_doc_id, template_id, case_id = sys.argv[1], sys.argv[2], sys.argv[3]
case    = json.loads(os.environ["CASE_JSON"])
doc     = json.loads(os.environ["DOC_JSON"])

executor  = case["executorInfo"]
extracted = doc["extractedData"]  # populated by the processor after extraction

if extracted is None:
    print(f"✗  extractedData is null for document {doc['id']} (status: {doc['status']})", file=sys.stderr)
    print("   Processing either failed or the worker processed stale queue messages.", file=sys.stderr)
    print("   Re-run the script — the queue has been flushed and will start clean.", file=sys.stderr)
    sys.exit(1)

from src.handler import handler

event = {
    "generatedDocumentId": gen_doc_id,
    "templateId": template_id,
    "caseId": case_id,
    "deceased": extracted,  # full ExtractedCertificateData from the API
    "executorName":         executor["name"],
    "executorAddress":      executor["address"],
    "executorRelationship": executor["relationship"],
    "executorPhone":        executor.get("phone"),
    "executorEmail":        executor.get("email"),
}

result = handler(event, object())
print(json.dumps(result, indent=2))
PYEOF

  echo ""

  cleanup_mock

  # Validate the PDF landed in S3 (independent of whether the API callback succeeded).
  if $AWS_LOCAL s3 ls "s3://$GENERATED_DOCS_BUCKET/$expected_s3_key" &>/dev/null; then
    local pdf_size
    pdf_size=$($AWS_LOCAL s3 ls "s3://$GENERATED_DOCS_BUCKET/$expected_s3_key" | awk '{print $3}')
    ok "PDF generated and uploaded to S3"
    ok "Key  : $expected_s3_key"
    ok "Size : ${pdf_size} bytes"
  else
    fail "Generated PDF not found in S3 at: s3://$GENERATED_DOCS_BUCKET/$expected_s3_key\n   Template rendering or S3 upload failed. Check logs above."
  fi
}

# ---------------------------------------------------------------------------
# Run selected mode(s)
# ---------------------------------------------------------------------------

EXPECTED_MESSAGES=1

case "$MODE" in
  typed)
    setup_document "$FIXTURES_DIR/sample_death_cert_typed.pdf"   "TEXT PATH"
    run_processing_worker 1
    ;;
  minimal)
    setup_document "$FIXTURES_DIR/sample_death_cert_minimal.pdf" "MINIMAL"
    run_processing_worker 1
    ;;
  scanned)
    setup_document "$FIXTURES_DIR/sample_death_cert_scanned.pdf" "VISION PATH"
    run_processing_worker 1
    ;;
  both)
    setup_document "$FIXTURES_DIR/sample_death_cert_typed.pdf"   "TEXT PATH"
    setup_document "$FIXTURES_DIR/sample_death_cert_scanned.pdf" "VISION PATH"
    run_processing_worker 2
    ;;
  generate)
    if $ALL_TEMPLATES; then
      for tid in "${ALL_TEMPLATE_IDS[@]}"; do
        run_generation "$tid"
      done
    else
      run_generation "$TEMPLATE_ID"
    fi
    ;;
  all)
    setup_document "$FIXTURES_DIR/sample_death_cert_typed.pdf"   "TEXT PATH"
    setup_document "$FIXTURES_DIR/sample_death_cert_scanned.pdf" "VISION PATH"
    run_processing_worker 2
    if $ALL_TEMPLATES; then
      for tid in "${ALL_TEMPLATE_IDS[@]}"; do
        run_generation "$tid"
      done
    else
      run_generation "$TEMPLATE_ID"
    fi
    ;;
esac

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo "──────────────────────────────────────────────────────────────────────"
log "End-to-end test complete."
echo ""
echo "   To re-run, simply run this script again."
echo "   To stop LocalStack: docker compose down  (from repo root)"
echo ""
