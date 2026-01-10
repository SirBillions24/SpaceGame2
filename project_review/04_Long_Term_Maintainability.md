# Long-Term Maintainability Review

## Executive Summary
The project codebase is clean, well-structured, and uses modern tooling (TypeScript, Prisma). However, the **complete absence of a standard testing framework** (Jest/Vitest) is a critical risk for long-term maintenance. Reliance on manual "verify scripts" will not scale as the complexity of the combat and mechanics grows.

## 1. Code Quality & Architecture

### Strengths
- **TypeScript**: The project is written in TypeScript, providing strong type safety and developer tooling.
- **Service Layer Pattern**: Logic is decently separated into `services/` (business logic) and `routes/` (controllers), which makes code navigable.
- **Centralized Configuration**: `mechanics.ts` is a great descriptive "singelton" for game constants, allowing designers to tweak balance without diving into deep logic.
- **Modern Stack**: Express 5 (beta/latest), Prisma ORM, and React are standard, well-supported technologies.

### Weaknesses & Risks
- **No Test Suite**: There are no unit tests (`*.test.ts`) utilizing a standard runner like Jest or Vitest.
    - **Risk**: Refactoring core systems (like `combatService.ts`) is "terrifying" because there's no automated regression suite to catch edge cases.
    - **Mitigation**: The existing `verifyEconomy.ts` script is a good start but should be converted to a proper test suite.
- **Loose Environment Config**: The app relies on `process.env` accessed directly (e.g., `process.env.JWT_SECRET`). If a variable is missing, the app might crash at runtime rather than failing fast at startup.

## 2. Developer Experience (DX)

- **Documentation**: `DEVELOPER_QUICKSTART.md` is excellent. It explains the "Why" (Lazy Eval) and "How" (3-Lane Combat) clearly.
- **Scripts**: `npm run dev` works out of the box.

## 3. Technical Debt

- **JSON Columns**: As noted in Scalability, storing `units` and `layouts` as JSON strings forfeits DB-level validation. If a bug writes "corrupted json" to that column, the `JSON.parse` will throw and crash the worker/request.
- **Hardcoded Logic**: Some logic (like "Desertion checks" or "Combat Triangle") is hardcoded in the service functions. Moving these to configurable "Strategy Pattern" classes or configuration files would allow for modding or easier updates.

## Recommendations

1.  **Install Vitest**: Immediately set up a testing framework. Convert `verifyRegression.ts` into a real test suite.
2.  **Environment Validation**: Use a library like `envalid` or `zod` to validate all required environment variables on server startup.
3.  **Strict JSON Types**: If JSON columns must stay, use Zod schemas to validate usage *before* stringifying to DB and *after* parsing from DB to ensuring runtime integrity.
