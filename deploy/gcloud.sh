#!/usr/bin/env bash
#
# Deploy pdf-analyzer to Cloud Run using gcloud CLI.
#
# Configuration is read from deploy/env (see deploy/env.example).
# The script creates resources that don't exist yet and skips ones that do.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - A GCP project with billing enabled
#   - Copy deploy/env.example to deploy/env and fill in your values
#
# Usage:
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

# Validate required variables
: "${PROJECT_ID:?PROJECT_ID is required in deploy/env}"
: "${REGION:?REGION is required in deploy/env}"

# Defaults
SERVICE_NAME="${SERVICE_NAME:-pdf-analyzer}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
AR_REPOSITORY="${AR_REPOSITORY:-${SERVICE_NAME}}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${SERVICE_NAME}:latest"
CREATE_SA="${CREATE_SA:-true}"
SA_NAME="${SA_NAME:-pdf-analyzer}"
# If SA_EMAIL is set in env, use it directly (existing service account).
# Otherwise, derive from SA_NAME.
SA_EMAIL="${SA_EMAIL:-${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com}"

echo "==> Project:    ${PROJECT_ID}"
echo "==> Region:     ${REGION}"
echo "==> SA:         ${SA_EMAIL}"
echo "==> Repository: ${AR_REPOSITORY}"
echo "==> Image:      ${IMAGE}"
echo ""

# ---- Enable required APIs ----
echo "==> Enabling APIs..."
gcloud services enable \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  storage.googleapis.com \
  --project="${PROJECT_ID}" --quiet

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
  for ROLE in roles/aiplatform.user roles/storage.objectViewer; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="${ROLE}" --condition=None --quiet > /dev/null
  done
else
  echo "==> Using existing service account: ${SA_EMAIL}"
  echo "    Make sure it has roles/aiplatform.user and roles/storage.objectViewer"
fi

# ---- Build container image ----
echo "==> Building container image via Cloud Build..."
gcloud builds submit \
  --tag "${IMAGE}" \
  --project="${PROJECT_ID}" --quiet

# ---- Deploy to Cloud Run ----
echo "==> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --project="${PROJECT_ID}" \
  --platform managed \
  --region "${REGION}" \
  --set-env-vars "PDF_ANALYZER_PROVIDER=google-vertex,VERTEX_PROJECT=${PROJECT_ID},VERTEX_LOCATION=${VERTEX_LOCATION}" \
  --service-account "${SA_EMAIL}" \
  --allow-unauthenticated \
  --quiet

# ---- Verify ----
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format="value(status.url)")

echo ""
echo "==> Verifying health..."
curl -sf "${SERVICE_URL}/health" && echo " OK"

echo ""
echo "==================================="
echo "Deployment complete!"
echo ""
echo "Service URL: ${SERVICE_URL}"
echo "MCP endpoint: ${SERVICE_URL}/mcp"
echo ""
echo "Add to your MCP client config:"
echo ""
echo "  {"
echo "    \"mcpServers\": {"
echo "      \"pdf-analyzer\": {"
echo "        \"type\": \"url\","
echo "        \"url\": \"${SERVICE_URL}/mcp\""
echo "      }"
echo "    }"
echo "  }"
echo "==================================="
