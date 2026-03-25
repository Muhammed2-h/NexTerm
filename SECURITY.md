# NexTerm Security Model

## Overview

NexTerm is an interactive, browser-based web terminal that provides direct shell access to the host system. Because of the inherent risks associated with exposing a real system shell over a network, this application has been designed with a strict security model.

## Authentication & Authorization

- **Token-Based Access**: The server requires a mandatory `SECRET_TOKEN` to be passed as a Bearer token for all API endpoints, and as a query parameter for WebSocket connections (`ws://host/ws/terminal?token=<SECRET_TOKEN>`).
- If no token is configured in `.env.local` upon the first startup, a cryptographically secure 256-bit token is automatically generated and saved.

## Privilege Management

- **Root Prevention**: Starting the application as the `root` user is explicitly blocked by default to prevent a full system compromise in the event of a vulnerability. Running as root requires the explicit `--allow-root` flag.
- **Environment**: The environment PS1 is sanitized and avoids defaulting to a root prompt.

## Network Security

- **CORS Protection**: Cross-Origin Resource Sharing is locked down to specific allowed origins derived from `ALLOWED_ORIGINS` environment variables, defaulting securely.
- **Security Headers**: Standard security headers are enforced via `helmet`, including a strict Content-Security Policy (CSP), to mitigate Cross-Site Scripting (XSS) and Clickjacking.

## Session Management

- **Server-Controlled IDs**: Session IDs are generated securely on the server using `crypto.randomUUID()` to prevent ID prediction and session hijacking.
- **Process Isolation**: Terminal instances are managed carefully, and inputs sent to spawned processes are protected against shell injection attacks. Command operations utilize safe execution methods (like `execFileSync` with argument arrays) ensuring proper argument tokenization.

## Denial of Service (DoS) Protections

- **API Rate Limiting**: HTTP endpoints are rate-limited to 100 requests per minute per IP.
- **WebSocket Rate Limiting**:
  - Max 5 concurrent WebSocket connections are permitted per IP address.
  - Incoming WebSocket messages larger than 64KB are immediately rejected.
  - A persistent byte-rate limit (e.g., 10,000 bytes/sec) prevents resource exhaustion from flooded data streams.

## Audit Logging

- **Comprehensive Logging**: All connections, session spawns, and session terminations are logged with their corresponding IP addresses, timestamps, and session IDs.
- **Opaque Errors**: Clients receive sanitized generic error messages to prevent leakage of internal server paths or stack traces. Raw error details are captured securely in server-side logs.
