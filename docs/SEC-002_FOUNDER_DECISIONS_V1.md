# SEC-002 Founder Decisions — Version 1

Decision status: Founder-approved Version 1 authorization baseline

## Authorization policy

The currently locked `authorization-policy.v1` and `authorization-permissions.v1` role and permission model is ratified for Version 1. Future changes require a governed, versioned revision with regression evidence.

Currently supported Version 1 operations are authorized tenant-wide. Branch, team, and assignment-based authorization segmentation is not a Version 1 capability. Those constraints remain disabled and must not be inferred from client input, claims, or legacy records. Enabling them requires a future governed capability.

## Legacy ownership

Unresolved legacy resources are quarantined and denied by default. No migration, reassignment, ownership inference, or Storage movement is authorized without all of the following:

1. Controlled production inventory evidence.
2. Explicit founder approval for each affected resource class.
3. A reviewed rollback design.
4. Immutable command, audit, and completion receipts.
5. Post-operation validation.

The read-only inventory grants no adjudication or migration authority.

## Operational ownership

The following accountable assignments are mandatory before production closeout:

| Responsibility | Version 1 assignment |
| --- | --- |
| Files-worker principal owner | **Founder assignment required before production closeout.** |
| AI-worker principal owner | **Founder assignment required before production closeout.** |
| Scheduler principal owner | **Founder assignment required before production closeout.** |
| Legacy-inventory principal owner | **Founder assignment required before production closeout.** |
| Credential rotation owner | **Founder assignment required before production closeout.** |
| Emergency revocation owner | **Founder assignment required before production closeout.** |
| Security incident escalation owner | **Founder assignment required before production closeout.** |

No operator may hold or exercise authority merely because a placeholder remains unassigned.
