#!/usr/bin/env bash
#
# Deploy pdf-analyzer to Cloud Run.
#
# Configuration is read from deploy/env (see deploy/env.example). The script
# supports all PDF_ANALYZER_PROVIDER values:
#
#   Vertex providers (ADC auth, no API key):
#     - google-vertex       Gemini via Vertex AI
#     - anthropic-vertex    Claude via Vertex AI
#
#   Direct API providers (API key from Secret Manager):
#     - google              Gemini Developer API
#     - anthropic           Anthropic direct API
#     - openai              OpenAI API
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - A GCP project with billing enabled
#   - For direct-API providers: a Secret Manager secret containing the API key.
#     Create it once with:
#       echo -n 'YOUR_KEY' | gcloud secrets create <name> \
#         --project=<project> --data-file=-
#
# Usage:
#   cp deploy/env.example deploy/env   # edit with your values
#   ./deploy/gcloud.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Error: ${ENV_FILE} not found."
  echo "Copy deploy/env.example to deploy/env and fill in your values."
  exit 1
fi

# shellcheck source=/dev/null
source "${ENV_FILE}"

# Required config
: "${PROJECT_ID:?PROJECT_ID is required in deploy/env}"
: "${REGION:?REGION is required in deploy/env}"
: "${PDF_ANALYZER_PROVIDER:?PDF_ANALYZER_PROVIDER is required in deploy/env (see deploy/env.example for valid values)}"

# Classify provider: vertex providers use ADC, api-key providers pull from Secret Manager.
case "${PDF_ANALYZER_PROVIDER}" in
  google-vertex|anthropic-vertex)
    PROVIDER_AUTH="vertex"
    ;;
  google|anthropic|openai)
    PROVIDER_AUTH="apikey"
    ;;
  *)
    echo "Error: unknown PDF_ANALYZER_PROVIDER='${PDF_ANALYZER_PROVIDER}'."
    echo "Valid values: google, google-vertex, anthropic, anthropic-vertex, openai"
    exit 1
    ;;
esac

if [[ "${PROVIDER_AUTH}" == "apikey" ]]; then
  : "${API_KEY_SECRET_NAME:?API_KEY_SECRET_NAME is required for provider ${PDF_ANALYZER_PROVIDER}. Create a Secret Manager secret with your API key and set API_KEY_SECRET_NAME in deploy/env.}"
fi

# Defaults
SERVICE_NAME="${SERVICE_NAME:-pdf-analyzer}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
AR_REPOSITORY="${AR_REPOSITORY:-${SERVICE_NAME}}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${SERVICE_NAME}:latest"
CREATE_SA="${CREATE_SA:-true}"
SA_NAME="${SA_NAME:-pdf-analyzer}"
# If SA_EMAIL is set, use it directly. Otherwise, derive from SA_NAME.
SA_EMAIL="${SA_EMAIL:-${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com}"

echo "==> Project:    ${PROJECT_ID}"
echo "==> Region:     ${REGION}"
echo "==> Provider:   ${PDF_ANALYZER_PROVIDER} (${PROVIDER_AUTH})"
if [[ "${PROVIDER_AUTH}" == "vertex" ]]; then
  echo "==> Location:   ${VERTEX_LOCATION}"
else
  echo "==> Secret:     ${API_KEY_SECRET_NAME}"
fi
if [[ -n "${PDF_ANALYZER_MODEL:-}" ]]; then
  echo "==> Model:      ${PDF_ANALYZER_MODEL}"
fi
echo "==> SA:         ${SA_EMAIL}"
echo "==> Repository: ${AR_REPOSITORY}"
echo "==> Image:      ${IMAGE}"
echo ""

# ---- Enable required APIs ----
echo "==> Enabling APIs..."
APIS=(
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
  run.googleapis.com
  storage.googleapis.com
)
if [[ "${PROVIDER_AUTH}" == "vertex" ]]; then
  APIS+=(aiplatform.googleapis.com)
else
  APIS+=(secretmanager.googleapis.com)
fi
gcloud services enable "${APIS[@]}" --project="${PROJECT_ID}" --quiet

# ---- Artifact Registry ----
echo "==> Creating Artifact Registry repository (if needed)..."
gcloud artifacts repositories describe "${AR_REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" --format="value(name)" 2>/dev/null \
  || gcloud artifacts repositories create "${AR_REPOSITORY}" \
    --project="${PROJECT_ID}" --location="${REGION}" \
    --repository-format=docker --description="pdf-analyzer container images" --quiet

# ---- Service account ----
if [[ "${CREATE_SA}" == "true" ]]; then
  echo "==> Creating service account (if needed)..."
  gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" 2>/dev/null \
    || gcloud iam service-accounts create "${SA_NAME}" \
      --project="${PROJECT_ID}" --display-name="PDF Analyzer MCP Server"

  echo "==> Granting IAM roles..."
  # All providers need GCS read for gs:// PDF sources.
  ROLES=(roles/storage.objectViewer)
  if [[ "${PROVIDER_AUTH}" == "vertex" ]]; then
    ROLES+=(roles/aiplatform.user)
  fi
  for ROLE in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="${ROLE}" --condition=None --quiet > /dev/null
  done
else
  echo "==> Using existing service account: ${SA_EMAIL}"
  echo "    Required roles: roles/storage.objectViewer"
  if [[ "${PROVIDER_AUTH}" == "vertex" ]]; then
    echo "                    roles/aiplatform.user"
  else
    echo "                    roles/secretmanager.secretAccessor on ${API_KEY_SECRET_NAME}"
  fi
fi

# ---- Secret Manager access (api-key providers only) ----
if [[ "${PROVIDER_AUTH}" == "apikey" ]]; then
  echo "==> Verifying secret ${API_KEY_SECRET_NAME} exists..."
  if ! gcloud secrets describe "${API_KEY_SECRET_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
    echo ""
    echo "Error: Secret '${API_KEY_SECRET_NAME}' not found in project ${PROJECT_ID}."
    echo "Create it once with your provider API key:"
    echo ""
    echo "  echo -n 'YOUR_API_KEY' | gcloud secrets create ${API_KEY_SECRET_NAME} \\"
    echo "    --project=${PROJECT_ID} --data-file=-"
    echo ""
    exit 1
  fi
  echo "==> Granting secretAccessor on ${API_KEY_SECRET_NAME}..."
  gcloud secrets add-iam-policy-binding "${API_KEY_SECRET_NAME}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor --quiet > /dev/null
fi

# ---- Build container image ----
echo "==> Building container image via Cloud Build..."
gcloud builds submit \
  --tag "${IMAGE}" \
  --project="${PROJECT_ID}" --quiet

# ---- Deploy to Cloud Run ----
echo "==> Deploying to Cloud Run..."

# Env vars to pass to the service.
ENV_VARS="PDF_ANALYZER_PROVIDER=${PDF_ANALYZER_PROVIDER}"
if [[ "${PROVIDER_AUTH}" == "vertex" ]]; then
  ENV_VARS="${ENV_VARS},VERTEX_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION}"
fi
if [[ -n "${PDF_ANALYZER_MODEL:-}" ]]; then
  ENV_VARS="${ENV_VARS},PDF_ANALYZER_MODEL=${PDF_ANALYZER_MODEL}"
fi

DEPLOY_ARGS=(
  "${SERVICE_NAME}"
  --image "${IMAGE}"
  --project="${PROJECT_ID}"
  --platform=managed
  --region="${REGION}"
  --service-account="${SA_EMAIL}"
  --set-env-vars="${ENV_VARS}"
  --timeout=900
  --memory=4Gi
  --no-allow-unauthenticated
  --quiet
)
if [[ "${PROVIDER_AUTH}" == "apikey" ]]; then
  DEPLOY_ARGS+=(--set-secrets="PDF_ANALYZER_API_KEY=${API_KEY_SECRET_NAME}:latest")
fi

gcloud run deploy "${DEPLOY_ARGS[@]}"

# ---- Verify ----
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format="value(status.url)")

echo ""
echo "==> Verifying health..."
ID_TOKEN="$(gcloud auth print-identity-token 2>/dev/null || true)"
if [[ -n "${ID_TOKEN}" ]]; then
  curl -sf -H "Authorization: Bearer ${ID_TOKEN}" "${SERVICE_URL}/health" && echo " OK"
else
  echo " (skipped: could not mint identity token; run \`gcloud auth login\` first)"
fi

echo ""
echo "==================================="
echo "Deployment complete!"
echo ""
echo "Service URL:  ${SERVICE_URL}"
echo "MCP endpoint: ${SERVICE_URL}/mcp"
echo ""
echo "The service is private (--no-allow-unauthenticated)."
echo "To call it from an MCP client, run the gcloud proxy locally:"
echo ""
echo "  gcloud run services proxy ${SERVICE_NAME} \\"
echo "    --project=${PROJECT_ID} --region=${REGION} --port=8080"
echo ""
echo "Then point your MCP client at http://localhost:8080/mcp"
echo "==================================="
