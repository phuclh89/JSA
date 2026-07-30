# Deployment and operations

CI validates source only and never migrates a database. Database promotion is a separate controlled operation using environment-injected secrets. Production infrastructure is not yet defined.

At runtime, provide every applicable variable listed in `.env.example`. The API fails fast for missing Oracle credentials, invalid pool settings, incomplete LDAP/session settings, unencrypted production LDAP, insecure production session cookies, or development auth in production. Termination signals trigger Nest shutdown hooks and close the pool. Expose `/api/v1/health/live` for liveness and `/api/v1/health/ready` for readiness; readiness returns 503 when Oracle is down.

Do not log or bake secrets into images. Use the platform secret store when one is selected. The current Windows development environment uses Thick mode and must initialize Instant Client before pool creation. Thin versus Thick production mode remains open. Production migration credentials should be separated from runtime credentials and database deployment remains a controlled step.

If startup logs `oracle_pool_opened` followed by `EADDRINUSE`, Oracle is connected and another process already owns the configured API port. Keep the existing healthy instance, stop that exact process before restarting, or configure a different `PORT`; do not troubleshoot Oracle credentials for this condition. Startup logs preserve the original safe error message and provide a code-specific diagnostic hint.

The Phase 0A database is Oracle 23.0.0.0.0 with schema `JSA_APP`; this is a development verification target only. Runtime and migration accounts should be separated before production.

Migration 008 enforces the confirmed one-to-one Hazard/Control invariant. Before creating its active-Control unique index, it fails closed if any Hazard already has more than one active Control; deployment owners must resolve such legacy data through an approved business-data remediation before retrying. The application enforces the corresponding minimum of exactly one Control during save and submission. The rollback removes only the unique index and does not delete or rewrite JSA data.

Migration 009 enforces matching Initial and Residual Severity. It fails closed when existing Hazard rows contain only one Severity or contain different Severity values; approved remediation is required before retrying. The rollback removes only `CHK_JSA_HAZ_RES_SEV_MATCH` and does not rewrite risk history.

Migration 010 requires exactly one active English language record with code `EN`. It fails closed for missing/ambiguous English configuration, existing non-English source versions, or Published versions with no language. New JSA creation then resolves English server-side and does not accept Language or Job Type from the client. Its rollback is intentionally blocked after unclassified JSA Versions exist until an approved remediation restores Job Type values.

## Phase 1 site and security bootstrap

Migration 002 creates schema objects only. It intentionally does not invent final site IDs, numeric ranges, or enterprise identities. Before the first operational login, an authorized deployment owner must provide:

- `BOOTSTRAP_SITE_CODE`, `BOOTSTRAP_SITE_NAME`, and `BOOTSTRAP_SITE_TIMEZONE`;
- approved non-overlapping `BOOTSTRAP_SEQUENCE_RANGE_START` and `BOOTSTRAP_SEQUENCE_RANGE_END`;
- stable `BOOTSTRAP_ADMIN_IDENTITY_KEY`, username, display name, and optional email.

Run `pnpm db:bootstrap:phase1` once against the confirmed local schema. The command refuses an existing site, invalid/undersized/overlapping ranges, missing values, and non-decimal `NUMBER(19)` values. It configures the allowlisted Phase 1 sequences and creates only the confirmed `SYSTEM_HEALTH_VIEW` and `SYSTEM_ADMIN` permissions, administrator role/mapping, and site scope. No password is stored.

Capture the returned site ID as a decimal string, set it as `LOCAL_SITE_ID`, and restart. Startup then validates every Phase 1 sequence against the local active range and rejects overlaps or out-of-range next values. Do not set `LOCAL_SITE_ID` before governed range configuration exists. Never run bootstrap with placeholder values in production.

Development uses `X-Dev-User` only when `AUTH_MODE=development`; the value must map to an active `SYS_USER`. Production requires `AUTH_MODE=ldap`, TLS-protected browser/API traffic, LDAPS or StartTLS to Active Directory, and secure session cookies. The browser never persists directory credentials or the signed session value.

## Enterprise identity-provider configuration

Production authentication uses the enterprise Active Directory through LDAP. JSAMS accepts the username/password over HTTPS and immediately discards it after LDAP validation. With the confirmed `DIRECT_BIND` strategy, the API binds using the approved user identity candidates and performs an exact canonical-user search through the authenticated connection. Optional `SERVICE_SEARCH` uses a least-privileged bind account to discover the user DN before validating the submitted password with a user bind. Successful LDAP authentication without a matching active `SYS_USER` fails closed.

The repository supports these identity-provider variables:

- `AUTH_MODE=ldap`;
- `LDAP_AUTH_STRATEGY=DIRECT_BIND|SERVICE_SEARCH`;
- `LDAP_HOST` and `LDAP_PORT`;
- optional `LDAP_BIND_DN` and secret `LDAP_BIND_PASSWORD`, required only by `SERVICE_SEARCH` and directory-dependent administrative scripts;
- `LDAP_SEARCH_BASE`;
- `LDAP_USERNAME_ATTRIBUTE`, `LDAP_IDENTITY_ATTRIBUTE`, `LDAP_DISPLAY_NAME_ATTRIBUTE`, and `LDAP_EMAIL_ATTRIBUTE`;
- `LDAP_UPN_SUFFIX` and `LDAP_NETBIOS_DOMAIN` for Direct Bind candidates;
- `LDAP_TLS_MODE=LDAPS|STARTTLS|NONE`, where `NONE` is rejected in production;
- `LDAP_TLS_LEGACY_COMPATIBILITY`, an explicitly insecure development/UAT-only escape hatch for legacy Domain Controller certificates; production rejects `true`;
- LDAP connect/operation timeouts;
- optional `LDAP_ALLOW_USERNAME_FALLBACK` for controlled migration of existing user mappings;
- random `AUTH_SESSION_SECRET` of at least 32 characters;
- session TTL, cookie name, and `AUTH_SESSION_COOKIE_SECURE=true` in production; and
- `VITE_AUTH_MODE=ldap`.

The confirmed runtime setting is `DIRECT_BIND`: the API tries the submitted value, normalized account name, configured UPN, and configured NetBIOS form, then performs an exact user search through the authenticated connection. `SERVICE_SEARCH` is optional and uses a least-privileged directory reader before binding as the discovered user. Store any bind password and `AUTH_SESSION_SECRET` in the approved deployment secret mechanism. Do not commit them or include them in diagnostic output. Rotate a bind password immediately if it has been disclosed.

The verified internal development endpoint currently accepts Direct Bind on plain LDAP port 389. This is suitable only for the current internal development/UAT environment: application login must still be protected by HTTPS, and production environment validation rejects `LDAP_TLS_MODE=NONE`. Production requires an AD endpoint with LDAPS or StartTLS and a currently trusted certificate/signature chain.

The default stable application mapping is `ad-object-guid:<canonical objectGUID>` in `SYS_USER.ENTERPRISE_IDENTITY_KEY`. Existing username-keyed users may temporarily use `LDAP_ALLOW_USERNAME_FALLBACK=true`; resolve and update their stable mapping before turning fallback off. Conflicting identity/username matches fail closed.

The session is an API-signed, time-limited JWT carried only in an `HttpOnly`, `SameSite=Strict` cookie. Logout clears the cookie, but distributed immediate revocation is not implemented; deactivating `SYS_USER` still blocks subsequent API requests because authorization context is reloaded on every request.

### Approved LDAP administrator seed

After migration 007 and its sequence bootstrap, set `SEED_LDAP_ADMIN_USERNAME` (default `phuclh`) and run `pnpm db:seed:ldap-admin`. The idempotent script resolves exactly one LDAP identity and its `objectGUID`, requires the existing active `SYSTEM_ADMIN` Role, uses `LOCAL_SITE_ID` or the only active Site, creates or aligns the active `SYS_USER`, adds the active Role assignment and Site `VIEW/ACT` scope, and records immutable access-administration audit events. It does not create a Site, Role, Permission, directory account, or password record. A repeat run must return `SKIPPED`.

Before production access is enabled:

1. Confirm the browser-to-API connection uses HTTPS and Active Directory uses LDAPS or StartTLS.
2. Confirm the configured LDAP strategy with a real non-privileged test account: for `DIRECT_BIND`, verify the approved submitted/account/UPN/NetBIOS candidates and the post-bind exact canonical-user search; for `SERVICE_SEARCH`, additionally verify the least-privileged service-account bind, exact user search, and discovered-user bind.
3. Confirm `objectGUID`, canonical username, display name, and email mappings.
4. Confirm a matching active `SYS_USER`.
5. Confirm effective roles, permissions, and explicit overrides.
6. Confirm Site/Rig/Department data scope.
7. Confirm workflow-role assignments and current-assignee resolution.
8. Confirm `/api/v1/auth/me` returns only the expected non-sensitive session context.
9. Confirm credentials, bind passwords, session tokens, and connection strings are absent from logs and browser storage.
10. Apply login rate limiting at the trusted reverse proxy and verify Active Directory lockout policy behavior.

Phase 4.5 User Access Administration manages only JSAMS application users and authorization. It must not be deployed or described as an Active Directory administration or password-reset system.

## Phase 2 sequence bootstrap and business configuration

Migration 004 creates Phase 2 schema objects only and never seeds production master data or Risk Matrices. After the Phase 1 bootstrap has established an approved Site and non-overlapping range, set `LOCAL_SITE_ID` and `PHASE2_BOOTSTRAP_ACTOR`, then run `pnpm db:bootstrap:phase2`. The command verifies the local Site/range and configures only the 15 allowlisted Phase 2 sequences. It refuses missing or ambiguous active ranges and does not create catalogues, Matrix definitions, versions, cells, or Rig assignments.

An authorized business/configuration owner must subsequently supply the real catalogue values and each Rig's approved 3×3 or 5×5 Matrix through the administration API/UI. Validate every Matrix Version before assignment. Do not promote test fixture codes or inferred formulas as production configuration. Effective-dated assignment changes require a reason and the administrator must have action scope for the target Rig.

For the confirmed PV Drilling legacy 5x5 configuration, set the target overrides only when the defaults are not appropriate, then run:

```powershell
$env:RISK_MATRIX_SEED_ACTOR='<approved actor>'
$env:RISK_MATRIX_SEED_CODE='<existing 5x5 matrix code>'
$env:RISK_MATRIX_SEED_VERSION='<new immutable version code>'
$env:RISK_MATRIX_SEED_RIG_ID='<target rig id>'
corepack pnpm db:seed:legacy-risk-matrix
corepack pnpm db:verify:legacy-risk-matrix
```

The seed uses Oracle sequences, inserts a complete new Matrix Version, effective-ends the prior Rig assignment, and commits the new assignment atomically. Never reuse a version code to alter an assigned configuration.

## Phase 3 sequence, permission, and numbering configuration

After migration 005 and an approved Phase 1 Site/range exist, set `LOCAL_SITE_ID` and `PHASE3_BOOTSTRAP_ACTOR`, then run `pnpm db:bootstrap:phase3`. It configures only the 14 Phase 3 sequences and inserts no JSA, permission, numbering, or reference data. It fails closed for a missing/ambiguous range or partial prior configuration.

Before enabling JSA routes, approve and create four permission codes and map them through `JSA_PERMISSION_VIEW`, `JSA_PERMISSION_CREATE`, `JSA_PERMISSION_EDIT`, and `JSA_PERMISSION_CANCEL`. Set all four or none; `SYSTEM_ADMIN` is not a substitute. `JSA_NUMBER_TEMPLATE` (must contain `{sequence}`; `{siteId}` is optional) and `JSA_NUMBER_UNIQUENESS_SCOPE` (`GLOBAL` or `SITE`) now govern only the Temporary number used before publication. Migration 011 and the publication transaction govern the Official `<Rig name>-<Department code>-NNNN` number; it has no environment-configurable format.

## Attachment Library storage and synchronization

Set `ATTACHMENT_STORAGE_ROOT` to the site's real local directory or mapped-drive root and `ATTACHMENT_MAX_FILE_SIZE_BYTES=52428800`. The API service identity requires create/read/write access beneath that root. Do not place credentials in the path or commit machine-specific absolute paths.

After migration 012, configure the three new site-owned sequences:

```powershell
$env:ATTACHMENT_BOOTSTRAP_ACTOR='<deployment actor>'
corepack pnpm db:bootstrap:attachments
```

Provision the approved third-party synchronization product separately. It must synchronize the complete relative tree below `ATTACHMENT_STORAGE_ROOT` between participating sites without rewriting names or content. GoldenGate is configured for Oracle attachment metadata only; it does not transport binaries or mapped-drive configuration.

Before enabling upload in an environment:

1. Verify the API identity can atomically create, read, rename, and delete a temporary test file beneath the configured root.
2. Verify the third-party product preserves the relative key and SHA-256 content across sites.
3. Verify GoldenGate preserves attachment primary/foreign keys and excludes sequence state.
4. Test the case where metadata arrives before the binary and ensure operations raise an incident rather than substitute a newer version.
5. Configure independent monitoring, backup, retention, malware scanning, and recovery for the filesystem and synchronization product.

## Phase 4 workflow configuration

Configure all seven mappings together: `JSA_PERMISSION_SUBMIT`, `JSA_PERMISSION_APPROVE`, `JSA_PERMISSION_RETURN`, `JSA_PERMISSION_REJECT`, `JSA_PERMISSION_COMMENT`, `JSA_PERMISSION_WORKFLOW_VIEW`, and `JSA_PERMISSION_WORKFLOW_ADMIN`. Partial mapping is rejected and production requires the complete set.

After migration 006, run `db:bootstrap:phase4` with approved `LOCAL_SITE_ID` and `PHASE4_BOOTSTRAP_ACTOR`. Then govern permission grants, definitions, steps, bindings, and workflow-role assignments. Migration/bootstrap intentionally seed none of those business values.

Every effective step must resolve exactly one active user with independent approve permission and ACT scope. Ambiguous bindings, zero/multiple assignees, partial permissions, and unapproved production conditions stop processing. The optional Rig Manager condition remains open.

For development/UAT only, `pnpm db:seed:uat-full-approval` creates the missing `DEV_*` workflow permissions, grants every active permission to the active `SYSTEM_ADMIN` Role, creates the active site-wide `UAT_FULL_APPROVAL` definition/binding, and assigns the configured `SEED_UAT_APPROVER_USERNAME` to Department Head, STC, OIM, and Rig Manager at Site scope. Rig Manager uses `TEST_FLAG=TRUE` so the full path can be exercised; this is not a confirmed production condition. The script is transactional, audited, idempotent, and refuses `NODE_ENV=production`. Run `pnpm db:verify:uat-full-approval` to verify one binding, four steps, four effective workflow-role assignments, and complete active-permission grants. Restart the API after changing workflow permission environment mappings.

`SYS_NOTIFICATION_OUTBOX` is delivery intent only; no Phase 4 email worker exists. Development rollback drops Phase 4 triggers/procedure, tables, Site sequence-range rows, and sequences, then restores Phase 3 status constraints.

## Phase 4.5 access administration deployment

After migration 007, set `LOCAL_SITE_ID` and `PHASE45_BOOTSTRAP_ACTOR`, then run `pnpm db:bootstrap:phase45`. The bootstrap configures only `SEQ_SYS_ACCESS_ADMIN_AUDIT` inside the existing approved Site range. It never creates a user, enterprise identity, Role, Permission, assignment, scope, workflow definition/binding, or approver.

All access-administration APIs require effective `SYSTEM_ADMIN` and governed ACT scope for managed Site/Rig/Department context. `SYSTEM_ADMIN` remains independent from JSA approval Permission, workflow Role, current assignee, document state, and owner-site rules. Before production access UAT, use the Approver Resolution and Approval UAT Readiness screens against approved real identities/configuration. Do not interpret isolated fixtures, outbox persistence, or a successful admin login as authenticated multi-account approval readiness.
