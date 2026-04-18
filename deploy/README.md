# Deploying PDF Analyzer to Cloud Run

This guide walks you through deploying the PDF Analyzer MCP server to Google Cloud Run. After deployment, any MCP client can connect to it over authenticated HTTP.

## What gets created

| Resource | Purpose |
|----------|---------|
| **Cloud Run service** | Runs the MCP server, listens on `/mcp` |
| **Service account** | Identity for the service. Roles depend on provider choice (see below). Optional if you bring your own. |
| **Artifact Registry repo** | Stores the container image |

The service is deployed **private** (`--no-allow-unauthenticated`). Callers must authenticate with a Google identity token — use `gcloud run services proxy` locally, or add your own `run.invoker` IAM bindings for specific identities.

## Provider and auth matrix

Pick one `PDF_ANALYZER_PROVIDER` value; the deploy scripts handle the rest.

| Provider | Auth | Required config | Roles granted to Cloud Run SA |
|---|---|---|---|
| `google-vertex` | ADC | `VERTEX_LOCATION` | `aiplatform.user`, `storage.objectViewer` |
| `anthropic-vertex` | ADC | `VERTEX_LOCATION` | `aiplatform.user`, `storage.objectViewer` |
| `google` | API key | `API_KEY_SECRET_NAME` | `secretmanager.secretAccessor`, `storage.objectViewer` |
| `anthropic` | API key | `API_KEY_SECRET_NAME` | `secretmanager.secretAccessor`, `storage.objectViewer` |
| `openai` | API key | `API_KEY_SECRET_NAME` | `secretmanager.secretAccessor`, `storage.objectViewer` |

For direct-API providers, create the Secret Manager secret once before deploying:

```bash
echo -n 'YOUR_API_KEY' | gcloud secrets create my-pdf-analyzer-key \
  --project="$PROJECT_ID" --data-file=-
```

The secret name goes into `API_KEY_SECRET_NAME` (gcloud path) or `api_key_secret_name` (Terraform path). The deploy script grants the Cloud Run service account `secretAccessor` on that secret and injects it into the container as `PDF_ANALYZER_API_KEY` at runtime via `--set-secrets`.

## Prerequisites

- A GCP project with billing enabled
- `gcloud` CLI installed and authenticated (`gcloud auth login`)

APIs are enabled automatically: `artifactregistry.googleapis.com`, `cloudbuild.googleapis.com`, `run.googleapis.com`, `storage.googleapis.com`, plus either `aiplatform.googleapis.com` (Vertex providers) or `secretmanager.googleapis.com` (direct-API providers).

## Option A: Deploy with gcloud CLI

1. Copy the config template and fill in your values:

   ```bash
   cp deploy/env.example deploy/env
   # Edit deploy/env: set PROJECT_ID, REGION, PDF_ANALYZER_PROVIDER,
   # and (if using a direct-API provider) API_KEY_SECRET_NAME
   ```

2. Run the deploy script:

   ```bash
   ./deploy/gcloud.sh
   ```

   The script enables APIs, creates resources (service account, Artifact Registry repo), builds the container via Cloud Build, deploys Cloud Run (private), and verifies `/health` with an ADC identity token.

### Configuration (`deploy/env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROJECT_ID` | Yes | | Your GCP project ID |
| `REGION` | Yes | | GCP region (e.g., `us-central1`) |
| `PDF_ANALYZER_PROVIDER` | Yes | | `google`, `google-vertex`, `anthropic`, `anthropic-vertex`, or `openai` |
| `VERTEX_LOCATION` | Vertex only | `global` | Vertex AI endpoint location |
| `API_KEY_SECRET_NAME` | API-key only | | Name of the Secret Manager secret holding the provider API key |
| `PDF_ANALYZER_MODEL` | No | provider default | Pin a specific model |
| `AR_REPOSITORY` | No | `pdf-analyzer` | Artifact Registry repository name |
| `SERVICE_NAME` | No | `pdf-analyzer` | Cloud Run service name |
| `CREATE_SA` | No | `true` | Set `false` to use an existing service account |
| `SA_EMAIL` | No | auto | Full email of an existing service account (used when `CREATE_SA=false`) |
| `SA_NAME` | No | `pdf-analyzer` | Name for auto-created service account |

## Option B: Deploy with Terraform

1. Copy the tfvars template:

   ```bash
   cd deploy
   cp terraform.tfvars.example terraform.tfvars
   # Edit: set project_id, provider_id, and (if direct-API) api_key_secret_name
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
|---|---|---|---|
| `project_id` | Yes | | GCP project ID |
| `provider_id` | Yes | | Provider ID (see matrix above) |
| `region` | No | `us-central1` | GCP region |
| `vertex_location` | Vertex only | `global` | Vertex AI endpoint |
| `api_key_secret_name` | API-key only | | Secret Manager secret name |
| `model_id` | No | provider default | Pin a specific model |
| `ar_repository` | No | `pdf-analyzer` | Artifact Registry repository |
| `service_account_email` | No | (creates new) | Use an existing service account |
| `image` | No | auto | Container image URI |

### Terraform outputs

| Output | Description |
|---|---|
| `service_url` | Cloud Run service URL |
| `mcp_endpoint` | MCP endpoint URL (requires authenticated invocation) |
| `service_account` | Service account email |

## Connecting an MCP client

Because the service is private, MCP clients can't hit the Cloud Run URL directly — identity tokens expire hourly and most clients can't mint them. The supported pattern is a local authenticated proxy:

```bash
gcloud run services proxy pdf-analyzer \
  --project=<project-id> --region=<region> --port=8080
```

Point your MCP client at `http://localhost:8080/mcp`. The proxy forwards each request to Cloud Run with a fresh identity token from your ADC.

Claude Code `.mcp.json` example:

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "type": "http",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

## PDF sources accepted by the deployed server

- **Public web URLs**: `https://example.com/doc.pdf`
- **GCS URIs**: `gs://my-bucket/doc.pdf` (requires `roles/storage.objectViewer` on the bucket)

Local file paths only work with the stdio transport (local development).

## Verifying the deployment

Health check (needs a Google identity token because the service is private):

```bash
TOKEN="$(gcloud auth print-identity-token)"
curl -H "Authorization: Bearer $TOKEN" https://<service-url>/health
# Expected: ok
```

MCP initialize via the local proxy:

```bash
gcloud run services proxy pdf-analyzer \
  --project=<project-id> --region=<region> --port=8080 &

curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

## Updating

Re-running `./deploy/gcloud.sh` (or `terraform apply`) rebuilds and rolls out a new revision with the current config.

## Request timeout and memory

The deploy scripts configure Cloud Run with a **15-minute request timeout** and **4 GiB memory**. Large PDFs (100+ pages) are sent inline and may be chunked into multiple sequential model calls; PDF bytes + base64 + V8 heap overhead can exceed 1 GiB for large documents.

Cloud Run's max timeout is 3600 seconds. Memory can be bumped to `8Gi` if needed.

## Cost considerations

- **Cloud Run**: pay per request, scales to zero when idle.
- **Model provider**: Vertex and direct-API billing are separate lines (Vertex bills against GCP; direct API bills against the provider account). Token costs depend on the model.
- **Artifact Registry**: minimal cost for container image storage.
- **Secret Manager** (direct-API path): a few cents per 10k accesses.
