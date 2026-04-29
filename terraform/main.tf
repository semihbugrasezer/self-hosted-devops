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

resource "digitalocean_ssh_key" "platform" {
  count      = var.ssh_public_key == "" ? 0 : 1
  name       = "${var.project_name}-ssh-key"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "platform" {
  image    = var.droplet_image
  name     = "${var.project_name}-host"
  region   = var.region
  size     = var.droplet_size
  ssh_keys = var.ssh_public_key == "" ? [] : [digitalocean_ssh_key.platform[0].fingerprint]
  tags     = [var.project_name, "devops-platform"]
}

resource "digitalocean_firewall" "platform" {
  name = "${var.project_name}-firewall"

  droplet_ids = [digitalocean_droplet.platform.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.ssh_allowed_cidrs
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

resource "digitalocean_record" "api" {
  count  = var.domain == "" ? 0 : 1
  domain = var.domain
  type   = "A"
  name   = "api"
  value  = digitalocean_droplet.platform.ipv4_address
  ttl    = 300
}
