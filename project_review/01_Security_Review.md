# Security Review

## Executive Summary
The security posture of the application is a decent starting point for an MVP, utilizing standard practices like JWT for authentication and bcrypt for password hashing. However, there are significant vulnerabilities related to race conditions in resource management and a lack of robust input validation (schema validation). Security controls rely heavily on manual checks in controllers, which is prone to human error.

## 1. Authentication & Authorization

### Strengths
- **JWT Implementation**: Uses standard JSON Web Tokens for stateless authentication.
- **Password Storage**: Uses `bcrypt` for hashing passwords, which is industry standard.
- **Ownership Checks**: Most actions (build, recruit, fleet move) explicitly call `validatePlanetOwnership` or similar checks ensuring users can only act on their own resources.

### Weaknesses & Risks
- **Hardcoded Secrets**: Reliance on `process.env.JWT_SECRET` without a clear secret management strategy (e.g., Vault or Docker secrets) in the provided context.
- **Token Expiry Strategy**: While expiry is set, there is no evident refresh token mechanism. This forces users to re-login frequently or encourages setting dangerously long expiration times.

## 2. Input Validation & Data Integrity

### Vulnerabilities
- **Manual Validation**: Input validation is manual (e.g., `if (!planetId || !count)`). This is brittle and easily bypassed if a field is missed.
    - **Recommendation**: Adopt a schema validation library like **Zod** or **Joi** to define strict shapes for all API inputs.
- **Complex JSON Handling**: Fleet movements and lane assignments involve complex nested JSON objects (`laneAssignments`). The parsing logic is custom and complex, increasing the attack surface for malformed payloads to crash the server or exploit logic errors.
- **JSON in Database**: extensive use of JSON strings (`unitsJson`, `laneAssignmentsJson`) in the database bypasses SQL type safety and integrity checks.

## 3. Concurrency & Race Conditions (CRITICAL)

### The "Double-Spend" Vulnerability
The current implementation pattern for resource spending is vulnerable to race conditions:
```typescript
// 1. Read Resources
if (planet.carbon < costCarbon) return error;

// ... other logic ...

// 2. Write (Spend) Resources
await prisma.planet.update({ ... data: { carbon: { decrement: costCarbon } } ... });
```
**Exploit**: A user can send multiple simultaneous requests (e.g., "Build Turret" and "Recruit Marine") that both pass the resource check (Step 1) before either decrements the balance (Step 2). This allows spending resources they don't have (going negative or effectively double-spending).

**Mitigation**:
- Use database-level constraints (CHECK constraints) to prevent negative values.
- Use transactions (`prisma.$transaction`) to lock the record or ensure atomicity of the Check-then-Update sequence.
- Optimistic concurrency control (version checks).

## 4. API Security

- **Rate Limiting**: No evidence of rate limiting (using `express-rate-limit` or Redis). API is vulnerable to brute-force attacks (login) and denial-of-service (spamming heavy calculation endpoints like `fleet` or `spawn`).
- **Error Leakage**: Some error handlers return `err.message` directly to the client. If an internal database syntax error or connection string leaks, it aids attackers.

## Recommendations

1.  **Implement Zod**: Replace manual `if` checks with Zod schemas for all request bodies.
2.  **Fix Race Conditions**: Wrap resource consistency checks in Prisma interactive transactions or assume the `decrement` will succeed and handle the specific "value out of range" error if the DB constraint fails (requires adding `CHECK (carbon >= 0)` to DB).
3.  **Rate Limiting**: Add global and route-specific rate limiting immediately.
4.  **Secret Management**: Ensure `.env` is not committed and secrets are injected securely in production.
