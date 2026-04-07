# Deploying PDF Analyzer to Cloud Run

This guide walks you through deploying the PDF Analyzer MCP server to Google Cloud Run. After deployment, any MCP client can connect to it over HTTP.

## What gets created

| Resource | Purpose |
|----------|---------|
| **Cloud Run service** | Runs the MCP server, listens on `/mcp` |
| **Service account** | Identity for the service (Vertex AI + GCS read access). Optional if you bring your own. |
| **Artifact Registry repo** | Stores the container image |

## Prerequisites

- A GCP project with billing enabled
- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- These APIs will be enabled automatically by the deploy script:
  - Vertex AI (`aiplatform.googleapis.com`)
  - Artifact Registry (`artifactregistry.googleapis.com`)
  - Cloud Build (`cloudbuild.googleapis.com`)
  - Cloud Run (`run.googleapis.com`)
  - Cloud Storage (`storage.googleapis.com`)

## Finding your GCP values

| Variable | Where to find it |
|----------|-----------------|
| `PROJECT_ID` | GCP Console top-left project dropdown, or **IAM & Admin > Settings**. Use the **ID** (e.g., `my-project-123`), not the display name. |
| `REGION` | Your choice. [Cloud Run regions list](https://cloud.google.com/run/docs/locations). `us-central1` (Iowa) is a common low-cost default. |
| `VERTEX_LOCATION` | Use `global` for preview models (`gemini-3-flash-preview`, `gemini-3.1-pro-preview`). Use a region like `us-central1` for GA models. |
| `AR_REPOSITORY` | Your choice of name, or find existing ones at **Artifact Registry > Repositories**. The script creates it if it doesn't exist. |
| `SERVICE_NAME` | Your choice of name, or find existing ones at **Cloud Run > Services**. |

Only `PROJECT_ID` requires a lookup. The rest are either your choice or have sensible defaults.

## Option A: Deploy with gcloud CLI

1. Copy the config template and fill in your values:

```bash
cp deploy/env.example deploy/env
# Edit deploy/env with your project ID and region
```

2. Run the deploy script:

```bash
./deploy/gcloud.sh
```

The script enables APIs, creates resources (service account, Artifact Registry repo), builds the container image via Cloud Build, deploys to Cloud Run, and verifies the health endpoint.

### Configuration (`deploy/env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROJECT_ID` | Yes | | Your GCP project ID |
| `REGION` | Yes | | GCP region (e.g., `us-central1`) |
| `VERTEX_LOCATION` | No | `global` | Vertex AI endpoint location (see note below) |
| `AR_REPOSITORY` | No | `pdf-analyzer` | Artifact Registry repository name |
| `SERVICE_NAME` | No | `pdf-analyzer` | Cloud Run service name |
| `CREATE_SA` | No | `true` | Set `false` to use an existing service account |
| `SA_EMAIL` | No | auto | Full email of an existing service account (used when `CREATE_SA=false`) |
| `SA_NAME` | No | `pdf-analyzer` | Name for auto-created service account |

## Option B: Deploy with Terraform

1. Copy the config template and fill in your values:

```bash
cd deploy
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars
```

2. Initialize and build the container image (Terraform does not run Cloud Build):

```bash
terraform init

gcloud builds submit \
  --tag <region>-docker.pkg.dev/<project-id>/pdf-analyzer/pdf-analyzer:latest \
  --project=<project-id> ..
```

3. Apply:

```bash
terraform apply
```

### Terraform variables (`deploy/terraform.tfvars`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `project_id` | Yes | | Your GCP project ID |
| `region` | No | `us-central1` | GCP region |
| `vertex_location` | No | `global` | Vertex AI endpoint location |
| `ar_repository` | No | `pdf-analyzer` | Artifact Registry repository name |
| `service_account_email` | No | (creates new) | Email of an existing service account to use |
| `image` | No | auto-generated | Container image URI |

### Terraform outputs

| Output | Description |
|--------|-------------|
| `service_url` | Cloud Run service URL |
| `mcp_endpoint` | Full MCP endpoint URL for client config |
| `service_account` | Service account email |

## Service account and IAM

The Cloud Run service needs a service account with two IAM roles:

| Role | Why |
|------|-----|
| `roles/aiplatform.user` | Call Vertex AI Gemini models |
| `roles/storage.objectViewer` | Read PDFs from GCS buckets (when using gs:// URLs) |

**Option 1: Let the script create one** (default). Both the gcloud script and Terraform config create a `pdf-analyzer` service account and grant these roles automatically.

**Option 2: Bring your own.** If you already have a service account with the right permissions:

- **gcloud**: Set `CREATE_SA=false` and `SA_EMAIL=your-sa@project.iam.gserviceaccount.com` in `deploy/env`
- **Terraform**: Set `service_account_email = "your-sa@project.iam.gserviceaccount.com"` in `deploy/terraform.tfvars`

## Environment variables

The Cloud Run service is configured with these env vars:

| Variable | Value | Purpose |
|----------|-------|---------|
| `PDF_ANALYZER_PROVIDER` | `google-vertex` | Use Gemini via Vertex AI (ADC auth, no API key needed) |
| `VERTEX_PROJECT` | your project ID | Which GCP project to call Vertex AI in |
| `VERTEX_LOCATION` | `global` | Vertex AI endpoint (see note below) |
| `PORT` | `8080` (set in Dockerfile) | Triggers HTTP mode instead of stdio |

### PDF sources

The deployed server accepts these PDF sources in `analyze_pdf`:

- **Public web URLs**: `https://example.com/doc.pdf`
- **GCS URIs**: `gs://my-bucket/doc.pdf` (requires `roles/storage.objectViewer` on the bucket)

Local file paths only work with the stdio transport (local development).

### Using Anthropic Claude via Vertex AI

To use Claude models instead of Gemini, change the provider:

```
PDF_ANALYZER_PROVIDER=anthropic-vertex
```

This uses Anthropic Claude models routed through Vertex AI. Same service account, same ADC auth. No Anthropic API key needed.

### Vertex AI location: why "global"?

Preview models like `gemini-3-flash-preview` and `gemini-3.1-pro-preview` are only available on the [global endpoint](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations). If you switch to GA models (e.g., `gemini-2.5-flash`), you can use a regional location like `us-central1` instead.

## Request timeout and memory

The deploy scripts configure Cloud Run with a **15-minute request timeout** and **1 GiB memory**. This is needed because large PDFs (100+ pages) are sent inline to Vertex AI and may require chunking into multiple sequential API calls.

To adjust after deployment:

```bash
gcloud run services update pdf-analyzer \
  --timeout=900 \
  --memory=1Gi \
  --project=<project-id> --region=<region>
```

The maximum Cloud Run timeout is 3600 seconds (60 minutes). If you're analyzing very large documents and hitting timeouts, increase it. Memory can also be bumped to `2Gi` if needed for very large PDFs held in memory.

## Connecting MCP clients

After deployment, add the HTTP MCP server to your client config.

### Claude Code

```bash
claude mcp add pdf-analyzer --transport http https://<your-service-url>/mcp
```

### JSON config (Claude Code, VS Code, etc.)

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "type": "url",
      "url": "https://<your-service-url>/mcp"
    }
  }
}
```

## Verifying the deployment

Health check:

```bash
curl https://<your-service-url>/health
# Expected: ok
```

MCP initialize:

```bash
curl -X POST https://<your-service-url>/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Full E2E test suite (from repo root):

```bash
CLOUD_RUN_URL=https://<your-service-url> npx tsx test/test-e2e-cloud-run.ts
```

## Updating

To deploy a new version after code changes:

```bash
# Rebuild and push
gcloud builds submit \
  --tag <region>-docker.pkg.dev/<project-id>/pdf-analyzer/pdf-analyzer:latest \
  --project=<project-id>

# Deploy new revision
gcloud run deploy pdf-analyzer \
  --image <region>-docker.pkg.dev/<project-id>/pdf-analyzer/pdf-analyzer:latest \
  --project=<project-id> --region=<region> --quiet
```

## Cost considerations

- **Cloud Run**: Pay per request. Scales to zero when idle (no cost when not in use).
- **Vertex AI**: Pay per token. Gemini 3 Flash is significantly cheaper than Gemini 3.1 Pro.
- **Artifact Registry**: Minimal cost for container image storage.
