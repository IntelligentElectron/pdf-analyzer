# Terraform configuration for deploying pdf-analyzer to Cloud Run.
#
# Usage:
#   cd deploy
#   cp terraform.tfvars.example terraform.tfvars  # edit with your values
#   terraform init
#   terraform apply
#
# Prerequisites:
#   - Terraform >= 1.5
#   - gcloud CLI authenticated (for building the container image)
#   - Container image must be built before applying:
#       gcloud builds submit --tag <region>-docker.pkg.dev/<project>/pdf-analyzer/pdf-analyzer:latest ..
#   - For direct-API providers (google, anthropic, openai): a Secret Manager
#     secret containing the API key must already exist. Create once with:
#       echo -n 'YOUR_KEY' | gcloud secrets create <name> \
#         --project=<project> --data-file=-

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0"
    }
  }
}

# --------------------------------------------------------------------------
# Variables
# --------------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for Cloud Run, Artifact Registry, and Cloud Build"
  type        = string
  default     = "us-central1"
}

variable "provider_id" {
  description = "PDF_ANALYZER_PROVIDER. One of: google, google-vertex, anthropic, anthropic-vertex, openai."
  type        = string

  validation {
    condition     = contains(["google", "google-vertex", "anthropic", "anthropic-vertex", "openai"], var.provider_id)
    error_message = "provider_id must be one of: google, google-vertex, anthropic, anthropic-vertex, openai."
  }
}

variable "model_id" {
  description = "Optional: pin a specific model. Leave empty to use the provider's default."
  type        = string
  default     = ""
}

variable "vertex_location" {
  description = "Vertex AI endpoint location (used when provider_id is a *-vertex variant)."
  type        = string
  default     = "global"
}

variable "api_key_secret_name" {
  description = "Secret Manager secret name holding the provider API key (required when provider_id is google, anthropic, or openai; ignored otherwise)."
  type        = string
  default     = ""
}

variable "ar_repository" {
  description = "Artifact Registry repository name."
  type        = string
  default     = "pdf-analyzer"
}

variable "image" {
  description = "Container image URI. Build it first with gcloud builds submit. Leave empty to auto-generate."
  type        = string
  default     = ""
}

variable "service_account_email" {
  description = "Existing service account email to use. If empty, a new one is created with the required IAM roles."
  type        = string
  default     = ""
}

locals {
  service_name = "pdf-analyzer"
  sa_name      = "pdf-analyzer"
  image        = var.image != "" ? var.image : "${var.region}-docker.pkg.dev/${var.project_id}/${var.ar_repository}/${local.service_name}:latest"
  create_sa    = var.service_account_email == ""
  sa_email     = local.create_sa ? google_service_account.pdf_analyzer[0].email : var.service_account_email

  uses_vertex = contains(["google-vertex", "anthropic-vertex"], var.provider_id)
  uses_apikey = !local.uses_vertex

  # Base env vars always set on the service.
  base_env = concat(
    [{ name = "PDF_ANALYZER_PROVIDER", value = var.provider_id }],
    local.uses_vertex ? [
      { name = "VERTEX_PROJECT", value = var.project_id },
      { name = "VERTEX_LOCATION", value = var.vertex_location },
    ] : [],
    var.model_id != "" ? [
      { name = "PDF_ANALYZER_MODEL", value = var.model_id },
    ] : [],
  )
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# --------------------------------------------------------------------------
# Config validation: api-key providers must supply a secret name.
# --------------------------------------------------------------------------

check "api_key_secret_provided" {
  assert {
    condition     = !local.uses_apikey || var.api_key_secret_name != ""
    error_message = "api_key_secret_name is required when provider_id is google, anthropic, or openai."
  }
}

# --------------------------------------------------------------------------
# APIs
# --------------------------------------------------------------------------

resource "google_project_service" "apis" {
  for_each = toset(concat(
    [
      "artifactregistry.googleapis.com",
      "cloudbuild.googleapis.com",
      "run.googleapis.com",
      "storage.googleapis.com",
    ],
    local.uses_vertex ? ["aiplatform.googleapis.com"] : ["secretmanager.googleapis.com"],
  ))
  service            = each.value
  disable_on_destroy = false
}

# --------------------------------------------------------------------------
# Artifact Registry
# --------------------------------------------------------------------------

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.ar_repository
  format        = "DOCKER"
  description   = "pdf-analyzer container images"
  depends_on    = [google_project_service.apis]
}

# --------------------------------------------------------------------------
# Service account
# --------------------------------------------------------------------------

resource "google_service_account" "pdf_analyzer" {
  count        = local.create_sa ? 1 : 0
  account_id   = local.sa_name
  display_name = "PDF Analyzer MCP Server"
  depends_on   = [google_project_service.apis]
}

# All providers read PDFs from GCS (gs:// URIs).
resource "google_project_iam_member" "storage_object_viewer" {
  count   = local.create_sa ? 1 : 0
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${local.sa_email}"
}

# Vertex providers need aiplatform.user.
resource "google_project_iam_member" "vertex_ai_user" {
  count   = local.create_sa && local.uses_vertex ? 1 : 0
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${local.sa_email}"
}

# API-key providers need read access to the specific Secret Manager secret.
resource "google_secret_manager_secret_iam_member" "api_key_accessor" {
  count     = local.uses_apikey && var.api_key_secret_name != "" ? 1 : 0
  project   = var.project_id
  secret_id = var.api_key_secret_name
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.sa_email}"
}

# --------------------------------------------------------------------------
# Cloud Run
# --------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "pdf_analyzer" {
  name     = local.service_name
  location = var.region

  template {
    service_account = local.sa_email
    timeout         = "900s"

    containers {
      resources {
        limits = {
          memory = "4Gi"
        }
      }

      image = local.image

      dynamic "env" {
        for_each = local.base_env
        content {
          name  = env.value.name
          value = env.value.value
        }
      }

      # API key for direct-API providers, sourced from Secret Manager at runtime.
      dynamic "env" {
        for_each = local.uses_apikey && var.api_key_secret_name != "" ? [1] : []
        content {
          name = "PDF_ANALYZER_API_KEY"
          value_source {
            secret_key_ref {
              secret  = var.api_key_secret_name
              version = "latest"
            }
          }
        }
      }

      ports {
        container_port = 8080
      }
    }
  }

  depends_on = [
    google_project_service.apis,
  ]
}

# NOTE: This configuration does NOT grant public (allUsers) access to the
# service. Callers must authenticate with a Google identity token. For local
# development, use `gcloud run services proxy` to forward authenticated
# requests to http://localhost:<port>. Add your own run.invoker IAM bindings
# here if you have specific identities that should invoke the service.

# --------------------------------------------------------------------------
# Outputs
# --------------------------------------------------------------------------

output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.pdf_analyzer.uri
}

output "mcp_endpoint" {
  description = "MCP endpoint URL (requires authenticated invocation)"
  value       = "${google_cloud_run_v2_service.pdf_analyzer.uri}/mcp"
}

output "service_account" {
  description = "Service account email"
  value       = local.sa_email
}
