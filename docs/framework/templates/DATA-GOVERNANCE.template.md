# Data governance: <Domain>

## Inventory

| Dataset/field | Classification | Purpose/lawful basis | Source/owner | Location | Retention | Access | Export/delete |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

## Lifecycle

Collection/validation → processing → sharing/provider → backup → retention → deletion/anonymization.

## Controls

- minimization and purpose limitation;
- tenant/user authorization and support/admin access;
- encryption/key ownership; secret separation;
- audit events without sensitive payload;
- data residency/provider/subprocessor and transfer;
- backup restore plus delete propagation;
- incident/breach detection and notification owner;
- user access/export/correct/delete workflow when applicable.

## Test and evidence

Negative access, retention/deletion job, backup/restore, export integrity, log redaction and migration
reconciliation.

**Owner/approver/date/next review:**
