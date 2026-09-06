Markdown
# Infrastructure & Self-Hosting Configuration

This directory contains template orchestration manifests and reverse-proxy configurations used for the blind storage node (Nextcloud) and ingress traffic termination.

## Containerized Services

The self-hosted storage layer relies on a micro-services topology deployed via Docker Compose:

* **NGINX:** Edge reverse-proxy handling HTTPS / TLS termination, HSTS, and request routing.
* **Nextcloud (`nextcloud:fpm-alpine`):** Sovereignty storage backend holding masked one-time key pools and encrypted attachments.
* **PostgreSQL (`postgres:15-alpine`):** Relational database managing internal application state[cite: 2].
* **Redis (`redis:alpine`):** In-memory cache for distributed locking and session performance optimization[cite: 2].

---

##  Deployment Setup

1. Copy the template Compose file:
   ```bash
   cp docker-compose.example.yml docker-compose.yml