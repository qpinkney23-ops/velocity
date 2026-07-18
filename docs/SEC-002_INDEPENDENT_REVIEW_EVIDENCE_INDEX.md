# SEC-002 Independent Review Evidence Index

This index describes evidence readiness; it does not declare SEC-002 complete.

| Evidence | Location | Status |
| --- | --- | --- |
| Authorization architecture | `docs/SEC-002_AUTHORIZATION_DESIGN.md` | Repository verified |
| Locked permission and scope policy | `docs/SEC-002_AUTHORIZATION_OPERATIONS_POLICY.md` | Repository verified |
| Founder Version 1 decisions | `docs/SEC-002_FOUNDER_DECISIONS_V1.md` | Repository verified; operational owners awaiting founder assignment |
| Route/resource and historical closeout matrix | `docs/SEC-002_CLOSEOUT_AUDIT.md` plus current routes | Repository verified; production validation awaiting operator execution |
| Firestore and Storage enforcement | `firestore.rules`, `storage.rules`, rule regressions | Repository verified; deployed rule-version evidence awaiting operator execution |
| Admin SDK privilege-boundary audit | `docs/SEC-002_AUTHORIZATION_OPERATIONS_POLICY.md` | Repository verified |
| Deterministic authorization regressions | `npm.cmd run velocity:authorization:operations-closeout` | Repository verified |
| Worker and scheduler regressions | package scripts and regression sources | Repository verified |
| Service-principal operating procedure | `docs/SEC-002_PRODUCTION_CLOSEOUT_RUNBOOK.md` | Awaiting operator execution and founder assignment |
| Production service grants and validation receipts | External evidence reference to be supplied | Awaiting operator execution |
| Credential-rotation evidence | External evidence reference to be supplied | Awaiting operator execution |
| Read-only legacy inventory and disposition | External evidence reference to be supplied | Awaiting operator execution; migration not applicable unless separately approved |
| Deployed revocation and cross-tenant results | External evidence reference to be supplied | Awaiting operator execution |
| Known Version 1 limitation: branch/team/assignment segmentation | Founder decision record | Not applicable to Version 1 |
| Residual risks | Legacy quarantine, unassigned operational owners, absent deployed evidence, independent testing outstanding | Awaiting founder assignment and operator execution |
| Independent security review | External report reference to be supplied | Awaiting independent review |
| Penetration test, remediation, and retest | External report and closure references to be supplied | Awaiting independent review |

SEC-002 remains open until production evidence, independent review, penetration testing, remediation, and retesting satisfy the capability lock criteria.
