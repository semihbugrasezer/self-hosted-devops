output "project_id" {
  description = "DigitalOcean project ID."
  value       = digitalocean_project.platform.id
}

output "host_ipv4" {
  description = "Public IPv4 address of the platform host."
  value       = digitalocean_droplet.platform.ipv4_address
}

output "api_dns_record" {
  description = "API DNS record when domain is configured."
  value       = var.domain == "" ? null : "api.${var.domain}"
}
