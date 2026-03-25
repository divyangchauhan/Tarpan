#!/usr/bin/env bash
# =============================================================================
# AfterLight Processor — End-to-End Test Script
#
# Usage (from apps/processor/):
#   ./scripts/e2e-test.sh                                       # prompts for credentials
#   ./scripts/e2e-test.sh --email user@example.com --password s3cr3t
#   ./scripts/e2e-test.sh typed   --email ... --password ...
#   ./scripts/e2e-test.sh scanned --email ... --password ...
#   ./scripts/e2e-test.sh minimal --email ... --password ...
#
# Credentials can also be supplied via environment variables:
#   E2E_EMAIL=... E2E_PASSWORD=... ./scripts/e2e-test.sh
#
# Prerequisites:
#   - apps/processor/.env with a real ANTHROPIC_API_KEY
#   - Docker running (LocalStack)
#   - NestJS API running on localhost:3001
#   - AWS CLI + Poetry installed
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROCESSOR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PROCESSOR_DIR/../.." && pwd)"

AWS_LOCAL="aws --endpoint-url=http://localhost:4566 --region us-east-1"
BUCKET="afterlight-uploads"
FIXTURES_DIR="$PROCESSOR_DIR/tests/fixtures"
API_BASE="http://localhost:3001/api/v1"

MODE="both"
EMAIL="${E2E_EMAIL:-}"
PASSWORD="${E2E_PASSWORD:-}"
ACCESS_TOKEN=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()  { echo ""; echo "▶  $*"; }
ok()   { echo "   ✓ $*"; }
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
    --email)    EMAIL="$2";    shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    typed|scanned|minimal|both) MODE="$1"; shift ;;
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
# Prompt for credentials if not supplied
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
$AWS_LOCAL s3 mb "s3://$BUCKET" 2>/dev/null || true
ok "S3 bucket ready"

# ---------------------------------------------------------------------------
# Check NestJS API is reachable
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
# Setup: create case + document via API, upload fixture, enqueue job
# ---------------------------------------------------------------------------

setup_document() {
  local fixture_path="$1"
  local label="$2"

  log "[$label] Creating test case..."
  local case_body='{"deceasedInfo":{"firstName":"E2E","lastName":"Test","dateOfBirth":"1940-06-15","dateOfDeath":"2026-01-10","placeOfDeath":"Springfield, IL"}}'
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
  $AWS_LOCAL s3 cp "$fixture_path" "s3://$BUCKET/$s3_key" --quiet
  ok "Uploaded: s3://$BUCKET/$s3_key"

  log "[$label] Triggering processing (API enqueues SQS job)..."
  api_post "$API_BASE/cases/$case_id/documents/$doc_id/process" > /dev/null
  ok "Job enqueued — document $doc_id"
}

case "$MODE" in
  typed)
    setup_document "$FIXTURES_DIR/sample_death_cert_typed.pdf"   "TEXT PATH"
    ;;
  minimal)
    setup_document "$FIXTURES_DIR/sample_death_cert_minimal.pdf" "MINIMAL"
    ;;
  scanned)
    setup_document "$FIXTURES_DIR/sample_death_cert_scanned.pdf" "VISION PATH"
    ;;
  both|*)
    setup_document "$FIXTURES_DIR/sample_death_cert_typed.pdf"   "TEXT PATH"
    setup_document "$FIXTURES_DIR/sample_death_cert_scanned.pdf" "VISION PATH"
    ;;
esac

# ---------------------------------------------------------------------------
# Run the worker (polls queue until all jobs are consumed)
# ---------------------------------------------------------------------------

log "Starting local worker (processes queue then exits)..."
echo ""
echo "──────────────────────────────────────────────────────────────────────"
echo "  Jobs were enqueued via the NestJS API."
echo "  Results will be posted back to: $API_BASE"
echo "──────────────────────────────────────────────────────────────────────"
echo ""

cd "$PROCESSOR_DIR"

EXPECTED_MESSAGES=1
[ "$MODE" = "both" ] && EXPECTED_MESSAGES=2

poetry run python - <<PYEOF
import subprocess, sys

expected = $EXPECTED_MESSAGES
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

echo ""
echo "──────────────────────────────────────────────────────────────────────"
log "End-to-end test complete."
echo ""
echo "   To re-run, simply run this script again."
echo "   To stop LocalStack: docker compose down  (from repo root)"
echo ""
