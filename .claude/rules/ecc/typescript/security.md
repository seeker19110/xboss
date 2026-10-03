---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
<!-- ECC vendor: https://github.com/affaan-m/ECC @ c70874f · rules/typescript/security.md · MIT · sinh bởi scripts/ecc-vendor.ts — KHÔNG sửa tay, xem .claude/ecc/manifest.json -->
# TypeScript/JavaScript Security

> This file extends [common/security.md](../common/security.md) with TypeScript/JavaScript specific content.

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.API_KEY

if (!apiKey) {
  throw new Error('API_KEY not configured')
}
```

## Agent Support

- Use **security-reviewer** skill for comprehensive security audits
