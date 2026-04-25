terraform {
  required_version = ">= 1.6.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.48"
    }
  }
}

provider "digitalocean" {
  token = var.digitalocean_token
}

resource "digitalocean_project" "platform" {
  name        = var.project_name
  description = "Self-hosted DevOps platform infrastructure"
  purpose     = "Platform engineering portfolio"
  environment = "Development"
}
