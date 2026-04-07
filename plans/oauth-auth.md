# OAuth 2.1 Authorization for HTTP Transport

## Summary

Implement MCP-spec-compliant OAuth 2.1 authorization for the HTTP transport so that organizations can restrict access to authenticated users from their identity provider (Google Workspace, Okta, Azure AD, Auth0, Keycloak, etc.).

## Motivation

The Cloud Run deployment currently uses `--allow-unauthenticated`, meaning anyone with the URL can call the service. Organizations deploying this tool need to control access, ideally through their existing SSO/IdP without manual API key distribution or per-user setup.

The MCP specification defines an OAuth 2.1 authorization framework for HTTP transport. Implementing it makes the server spec-compliant and compatible with any MCP client that supports the auth flow.

## Design

The PDF Analyzer HTTP server acts as an **OAuth 2.1 Resource Server**. It does not handle login flows; it validates tokens issued by an external Authorization Server.

### Configuration

Two environment variables enable auth (if neither is set, auth is disabled):

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTH_ISSUER` | Authorization server issuer URL | `https://accounts.google.com` |
| `AUTH_AUDIENCE` | Expected audience claim | `https://pdf-analyzer-xxx.run.app` |

### Request Flow

```
Client                        PDF Analyzer                   Authorization Server
  │                               │                               │
  ├── POST /analyze ─────────────►│                               │
  │                               │ (no token)                    │
  │◄── 401 + WWW-Authenticate ───┤                               │
  │    resource_metadata=...      │                               │
  │                               │                               │
  ├── GET /.well-known/           │                               │
  │    oauth-protected-resource ─►│                               │
  │◄── { authorization_servers }──┤                               │
  │                               │                               │
  ├── OAuth 2.1 flow ────────────────────────────────────────────►│
  │◄── access_token ──────────────────────────────────────────────┤
  │                               │                               │
  ├── POST /analyze               │                               │
  │   Authorization: Bearer xxx ─►│                               │
  │                               ├── validate JWT (JWKS) ───────►│
  │                               │◄── public keys ──────────────┤
  │◄── 200 JSON response ────────┤                               │
```

### Implementation Details

1. **Auth middleware** in `src/transports/http.ts`:
   - If `AUTH_ISSUER` and `AUTH_AUDIENCE` are not set, skip auth (current behavior)
   - If set, require `Authorization: Bearer <token>` on `/mcp` and `/analyze`
   - `/health` remains unauthenticated
   - Validate JWT signature against the issuer's JWKS endpoint (fetched and cached)
   - Validate `iss`, `aud`, and `exp` claims

2. **Protected Resource Metadata** endpoint:
   - Serve `/.well-known/oauth-protected-resource` with `authorization_servers` pointing to `AUTH_ISSUER`
   - Per MCP spec, this is how clients discover the auth server

3. **401 response format** (per MCP spec):
   ```
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer resource_metadata="https://service.run.app/.well-known/oauth-protected-resource"
   ```

4. **JWKS caching**: Fetch the issuer's `jwks_uri` from `/.well-known/openid-configuration`, cache the public keys with a TTL

### Dependencies

- `jose` (JWT verification, JWKS fetching). Lightweight, zero-dependency, widely used.

### Deployment Changes

- Add `AUTH_ISSUER` and `AUTH_AUDIENCE` to deploy scripts as optional env vars
- Remove `--allow-unauthenticated` from Cloud Run when auth is enabled
- Document the IdP setup for common providers (Google Workspace, Okta, Azure AD)

## GCP-Only Alternative

Organizations on GCP can also use **Cloud Run IAM** without any application code changes:

```bash
# Remove public access
gcloud run services remove-iam-policy-binding pdf-analyzer \
  --member="allUsers" --role="roles/run.invoker"

# Grant access to entire domain
gcloud run services add-iam-policy-binding pdf-analyzer \
  --member="domain:company.com" --role="roles/run.invoker"
```

This is simpler but GCP-specific. The OAuth approach works on any cloud.

## Verification

- [ ] Requests without a token return 401 with correct `WWW-Authenticate` header
- [ ] Requests with an invalid/expired token return 401
- [ ] Requests with a valid token from the configured issuer succeed
- [ ] Requests with a token from a different issuer are rejected
- [ ] `/.well-known/oauth-protected-resource` returns correct metadata
- [ ] `/health` works without auth
- [ ] Auth is fully disabled when env vars are not set (backward compatible)
- [ ] Works with Google, Okta, and Azure AD as identity providers

## Status

Proposed
