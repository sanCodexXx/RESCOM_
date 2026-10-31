# RESCOM update guide

Reviewed source: the supplied rescom.zip. This update changes the local project only. No GitHub push, production database modification, or deployment was performed.

## Update your existing project

1. Back up your existing project and database.
2. Extract this ZIP to a separate folder. Read REVIEW_REPORT.md before copying changes.
3. Copy the updated source into your existing project. Keep your existing `.git`, `backend/.env`, `frontend/.env`, and hosting environment variables. The ZIP excludes credentials, Git history, node_modules and generated dist files.
4. Run the new additive migration against the database used by this backend. In SQL Shell, after connecting to the correct database:

   ```sql
   \i 'C:/path/to/rescom/backend/migrations/004_user_status.sql'
   ```

   Alternatively, open `backend/migrations/004_user_status.sql` in your database SQL editor and execute it. It adds the account status and activity columns without deleting records. Existing accounts default to Active only when the status column is newly added; existing statuses remain unchanged.

   **Do not run schema.sql on your existing Neon database: it starts with DROP TABLE statements.** For an empty development database only, the revised schema.sql includes these account columns. Earlier migrations 001–003 must already be applied to an existing database if their notification, image or report tables/columns are missing.

5. Open a terminal in `rescom/backend`:

   ```bash
   npm ci
   npm start
   ```

   Keep your existing database, JWT, CORS and Brevo email configuration. This update does not change your email-only password recovery implementation.

6. Open a second terminal in `rescom/frontend`:

   ```bash
   npm ci
   npm run dev
   ```

   Keep `VITE_API_URL` set to the backend origin, without `/api` at the end. For example, local development uses `http://localhost:5000` if backend PORT is 5000. Production uses your actual Render service origin. Netlify must rebuild when this value changes.

7. Run the included checks:

   ```bash
   # In backend
   node --test tests/auth.test.cjs
   # In frontend
   node --test tests/api.test.mjs
   npm run build
   ```

8. Sign in as an administrator and as field personnel. Test registration, linking another member to an existing household, check-out, incident status confirmation, reports and permissions using fictional data.
9. Review your changes in VS Code before committing. Deploy only after you have checked the migration and workflows against your own environment.

## Where the UI patterns appear

| Reference | Implementation |
|---|---|
| Toast notification | Shared dismissible success/error messages; routine success no longer blocks the page |
| Skeleton screen | Lists, dashboard panels and lazy-loaded routes |
| Pagination | Centers, evacuees, priority cases, incidents, DROMIC reports and users; 10/25/50 records per page |
| Slider control | Account Settings → Display preferences → Text size (100–125%) |
| Navbar | Active navigation state, mobile drawer, accessible labels and current section title |
| Radio buttons | Existing native selection controls retained; form labels and validation associations improved |
| Empty states | Helpful explanations and appropriate next actions; failed loads shown separately |
| Floating action button | Mobile Quick add → Register evacuee / Log incident |
| Modals/popups | Native dialog with focus containment, Escape, focus restoration and guarded async confirmation |
| Widgets | API connection status, operational counts, occupancy and optional weather details |

Pagination currently happens in the browser after the existing API fetch. It reduces rendered rows but does not yet reduce the full-record API download. See the review report for this limitation.

## Starlink demonstration checklist

- Obtain authorized access to an active Starlink connection and power at a designated pilot site.
- Use a field phone/laptop on that connection. Open the deployed RESCOM site.
- Use another authorized administrative session to observe submitted fictional records.
- Register a household member, check dashboard/occupancy updates, check out a person, update an incident and download a report.
- Briefly disconnect the field device and record the behavior. Reconnect, refresh the records and check whether a previously attempted save reached the server before trying again.
- Record the actual equipment, site, date, browser and observed results. A successful API indicator alone is not evidence that the device used Starlink.

The API widget measures an HTTP request round trip to `/api/health`. It does not measure Starlink bandwidth or satellite latency, identify the ISP, check PostgreSQL readiness, or guarantee disaster-time availability. RESCOM remains an online system: no offline record queue or automatic offline synchronization was added.
