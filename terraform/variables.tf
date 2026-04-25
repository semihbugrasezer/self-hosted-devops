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
