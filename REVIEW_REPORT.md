# RESCOM code and UI review

Review date: 31 October 2026. Scope: uploaded source and the functional objectives/scope in Chapter 1 of FINAL_PROJECT (1).pdf. Source inspection, automated tests and browser tests with fictional API responses are separate from deployment validation.

## Findings addressed

| Finding in supplied source | Change |
|---|---|
| Account routes referenced status and last_active_at, but schema and supplied migrations omitted them | Added migration 004_user_status.sql and updated the fresh-install schema |
| Missing-column error bypassed account status enforcement | Authentication now fails closed on database errors |
| REST authorization trusted the role inside an older JWT | Authenticated requests now use the current database role |
| Socket authentication accepted a valid JWT without checking the current account | Socket handshakes now require an active account and current role; role/status edits and account deletion disconnect that user's sockets; sockets close at token expiry |
| Dashboard loaded only at mount/manual refresh | Added subscriptions to relevant live events and reconnect, with short event coalescing |
| Registration always created a separate household through the UI | Added existing-household selection using the API's existing family_id support; no existing records are merged |
| Registration offered unavailable centers | Only open centers with remaining space are offered; backend capacity checks still apply |
| Lists rendered every record | Added reusable pagination with filter reset and page clamping |
| Success modal interrupted routine work | Converted the existing success helper to dismissible toasts |
| Dialogs lacked focus containment and Escape behavior | Replaced shared modal host with native dialog behavior |
| Double clicking save could issue overlapping requests | Shared async buttons lock until the promise completes |
| Fetch could wait indefinitely with unclear save outcome | Added a 45-second request timeout and specific connectivity messages; uncertain mutations are not automatically retried |
| Network failures resembled empty datasets in several lists | Added persistent retry panels and distinct empty/loading/error states |
| UI exposed buttons that the API restricted to administrators | Hid those controls for field personnel; server authorization remains authoritative |
| Accidental incident status changes were easy | Added a confirmation identifying the incident and next status |
| Small screens used the desktop evacuee table | Added compact mobile/tablet record cards and retained the larger table on wide screens |
| DROMIC barangay selector could widen a narrow screen | Constrained filter controls and allowed date fields to wrap |
| Inconsistent text sizing and competing interface emphasis | Shared rem sizing, restrained surfaces, focus styles, reduced-motion support, compact mobile statistics and collapsible weather details |

## Proposal alignment and remaining work

| Proposed requirement | What the source supports / what remains |
|---|---|
| Field and administrative roles | Both exist. User administration and destructive actions have server role checks. Current permissions still allow field personnel to generate reports; manual center editing/status remains admin-only. Confirm this policy with MDRRMO because the proposal assigns field personnel center-status updates and administrators report generation. |
| Household composition and individual registration | Schema has families and individual links. Existing-household selection now exposes that relationship in the UI. Previously duplicated household records require a separate, reviewed data cleanup; none was performed. |
| Priority cases | Categories and case workflows exist. Validate the office's actual categories and handling rules in UAT. |
| Occupancy and presence | Registration/check-out logic updates headcounts; registration locks the chosen center in a transaction. Real concurrency behavior needs a PostgreSQL integration test. |
| Real-time monitoring | Server emits events and the dashboard now subscribes to them. Browser tests simulate an event; actual multi-device Socket.IO transmission must be tested on the deployed environment. |
| DROMIC reports | Report generation code, snapshots and template assets exist. Office review is still needed before claiming official format/figure compliance. |
| Starlink communication layer | A hosted web app can be accessed through the authorized Starlink connection. No satellite API is needed for ordinary web access. This review did not operate Starlink equipment or prove transmission over it. |
| Online scope without offline entry | Preserved. Authentication/display preferences use browser storage; evacuation records are not stored in an offline queue. |
| UAT, reliability and performance evaluation | Requires actual MDRRMO respondents and documented results. Automated sample-data tests do not replace UAT. |

Other practical limits:

- Pagination is client-side. Large registries still need API pagination and server-side search to reduce transfer size over constrained connections.
- The supplied health route reports that the API process responds; it does not query the database. The new widget does not claim full system health.
- Weather data is a third-party forecast. Its badge now describes observations instead of claiming that no official warning exists. Consult official bulletins independently.
- API mutation timeouts can occur after a database commit. Check the records before retrying; durable request idempotency has not been added.
- Password-reset delivery was inspected as email-only, but no real email was sent and no Brevo/Render/Neon configuration was changed.
- No claim of commercial or disaster-operational readiness is made from these checks.

## Validation

The packaged VALIDATION_RESULTS.json records final check results. Automated API/authentication tests use mocks, and browser interaction/layout checks use fictional records and mocked API endpoints. PostgreSQL migrations and live hosting were not executed or modified. No real evacuee data was used.

The included Node test files cover authorization after demotion, inactive accounts, failure on missing schema, socket account checks, scoped socket disconnection, API HTTP status handling, network errors and uncertain-save behavior.

## Main files

- Database/authentication: backend/schema.sql, backend/migrations/004_user_status.sql, backend/middleware/auth.js, backend/middleware/socketAuth.js, backend/server.js, backend/routes/users.routes.js, backend/utils/notify.js.
- Shared UI: frontend/src/components/ui/{Button,Modal,Toasts,DataStates,ConnectionStatus,Field}.jsx; frontend/src/hooks/usePagination.js; frontend/src/context/UiContext.jsx.
- Navigation: frontend/src/components/layout/{Shell,Sidebar,Topbar}.jsx.
- Workflows: operational pages in frontend/src/pages, especially Dashboard.jsx and Evacuees.jsx.
- Network and loading: frontend/src/lib/api.js, frontend/src/context/AuthContext.jsx, frontend/src/App.jsx.
- Display consistency: frontend/src/index.css, shared components and rem text sizes across pages.

UPDATE_GUIDE.md contains setup and verification steps. Do not use the destructive fresh-install schema on an existing database.
