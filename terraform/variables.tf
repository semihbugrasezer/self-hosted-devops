variable "digitalocean_token" {
  description = "DigitalOcean API token."
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Project name for provisioned resources."
  type        = string
  default     = "self-hosted-devops"
}

variable "region" {
  description = "DigitalOcean region."
  type        = string
  default     = "fra1"
}

variable "droplet_size" {
  description = "Droplet size for the Docker host."
  type        = string
  default     = "s-2vcpu-2gb"
}

variable "droplet_image" {
  description = "Base image for the Docker host."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "ssh_public_key" {
  description = "Public SSH key used to access the host."
  type        = string
  default     = ""
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to access SSH."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "domain" {
  description = "Optional DigitalOcean DNS zone for api.<domain>."
  type        = string
  default     = ""
}
