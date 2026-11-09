# Current update: Starlink and offline saves

See [OFFLINE_SETUP.md](OFFLINE_SETUP.md) for the database migrations, browser setup, and outage test. See [STARLINK_SETUP.md](STARLINK_SETUP.md) for the optional dish setup.

The patch updates the saved auth-layout version. If your local copy already has the previous Starlink update, merge the latest ZIP source into that copy and remove the retired `frontend/src/pages/OfflineRegistration.jsx` file. Keep your project’s environment settings.

---

## Earlier update: simpler role views and centered feedback

This ZIP includes the PDF-only reporting change and the latest UI cleanup. Use this version instead of the earlier ZIP.

1. Stop any running local development terminals.
2. Extract the ZIP to a separate folder.
3. Copy the contents of the extracted `rescom` folder into your original project folder. Merge folders and replace matching files. Do not delete the original project folder first. Your `.env`, `.git`, and node_modules are not in this ZIP and should stay in your project.
4. In `frontend`, run `npm run build`.
5. Check `git status --short`, then commit and push after reviewing the files. The live website does not change until the frontend/backend deploy the updated code.

No new database migration or dependency install is required for this follow-up. Do not run schema.sql on your existing database.

Latest UI behavior:

- Save/edit/delete feedback uses a centered, large, nearly square popup. Success messages close after 3.5 seconds or OK; errors remain until dismissed. Escape also dismisses feedback.
- An error popup stays above an open form; dismissing it returns to the form with the entered data intact.
- Form title and footer buttons remain visible while the body scrolls.
- Field Personnel have a focused home screen, two essential evacuee metrics, and no administrator center-edit entry in either cards or center details. Center editing remains Admin-only on the server.
- Admin charts and report analytics are collapsed by default. Full report metadata and administrative status actions are inside View report.
- DROMIC reports use compact mobile cards. PDF is available to both roles; Excel reporting stays removed.
- Single-page lists no longer show unnecessary page arrows. Connection text is simplified to Connected/Offline.

You may delete the unused legacy `frontend/src/lib/dromicExcel.js` and `backend/templates/Blank-DROMIC-Template.xlsx` if they remain after merging an older folder. They are not included or referenced by this version.

The feedback and UI were checked using sample data. Production hosting was not modified.

---

## PDF-only update after the MDRRMO interview

Excel and CSV report exports have been removed. Both Admin and Field Personnel use PDF reports.

For this follow-up, replace these four files in your current project:

- `frontend/src/pages/DromicReports.jsx`
- `backend/routes/dromic.routes.js`
- `backend/routes/analytics.routes.js`
- `backend/utils/dromicPdf.js`

Also copy `backend/tests/pdf-only.test.cjs` if you want the new export regression tests.

Delete these unused legacy files if they remain in your folder:

- `frontend/src/lib/dromicExcel.js`
- `backend/templates/Blank-DROMIC-Template.xlsx`

No database update or dependency installation is needed for this PDF-only follow-up. Keep your existing `.env` files. Run `npm run build` in frontend, then review, commit and push the new changes to update the hosted application. Source files in this ZIP have not been pushed or deployed for you.

Incident PDF downloads, the automatic download after creating a report, summary downloads and period reports now all use PDF. Unrelated account-list CSV export is unchanged.

---

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
