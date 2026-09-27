# Security

- Never commit .env or credentials.
- Use HTTPS in production.
- Enforce authentication and household membership checks on every protected mutation.
- Validate all request bodies server-side with Zod.
- Store password hashes only; never plaintext passwords.
- Keep financial amounts in Decimal database fields.
- Restrict receipt/file uploads by type, size and storage policy.
- Add rate limiting at the deployment edge/API layer.
- Record sensitive mutations in AuditLog.
- Use least-privilege database credentials.