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
  description = "GCP region for Cloud Run, Artifact Registry, and GCS"
  type        = string
  default     = "us-central1"
}

variable "vertex_location" {
  description = "Vertex AI endpoint location. Use 'global' for preview models."
  type        = string
  default     = "global"
}

variable "ar_repository" {
  description = "Artifact Registry repository name. Set to use an existing repo."
  type        = string
  default     = "pdf-analyzer"
}

variable "image" {
  description = "Container image URI. Build it first with gcloud builds submit. Leave empty to auto-generate from region/project/repository."
  type        = string
  default     = ""
}

variable "service_account_email" {
  description = "Existing service account email to use. If empty, a new one is created with the required IAM roles."
  type        = string
  default     = ""
}

locals {
  service_name   = "pdf-analyzer"
  sa_name        = "pdf-analyzer"
  image          = var.image != "" ? var.image : "${var.region}-docker.pkg.dev/${var.project_id}/${var.ar_repository}/${local.service_name}:latest"
  create_sa      = var.service_account_email == ""
  sa_email       = local.create_sa ? google_service_account.pdf_analyzer[0].email : var.service_account_email
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# --------------------------------------------------------------------------
# APIs
# --------------------------------------------------------------------------

resource "google_project_service" "apis" {
  for_each = toset([
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "storage.googleapis.com",
  ])
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

resource "google_project_iam_member" "vertex_ai_user" {
  count   = local.create_sa ? 1 : 0
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${local.sa_email}"
}

resource "google_project_iam_member" "storage_object_viewer" {
  count   = local.create_sa ? 1 : 0
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${local.sa_email}"
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
          memory = "1Gi"
        }
      }

      image = local.image

      env {
        name  = "PDF_ANALYZER_PROVIDER"
        value = "google-vertex"
      }
      env {
        name  = "VERTEX_PROJECT"
        value = var.project_id
      }
      env {
        name  = "VERTEX_LOCATION"
        value = var.vertex_location
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

# Allow unauthenticated access (public MCP endpoint)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.pdf_analyzer.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --------------------------------------------------------------------------
# Outputs
# --------------------------------------------------------------------------

output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.pdf_analyzer.uri
}

output "mcp_endpoint" {
  description = "MCP endpoint URL for client config"
  value       = "${google_cloud_run_v2_service.pdf_analyzer.uri}/mcp"
}

output "service_account" {
  description = "Service account email"
  value       = local.sa_email
}
