# Work online and offline in RESCOM

Admin Staff and Field Personnel use the same dashboard and forms in both modes. Online saves are confirmed by the RESCOM database. If the connection drops or the server stops responding, supported changes are saved in the signed-in browser and marked **Pending sync**. Once RESCOM is reachable again, the app submits pending changes and refreshes the open records. This works over your existing internet connection, including Starlink when available.

## Update the app

1. Extract the update into the RESCOM project folder that contains `frontend` and `backend`. Keep the existing environment files.
2. In Neon SQL Editor, apply `backend/migrations/009_dromic_report_deletion.sql` before deploying. If the database is missing migrations 006–008, apply those first in order.
3. Deploy the backend on Render, then rebuild the frontend on Netlify with the existing `VITE_API_URL`.
4. To test locally, start your backend and set `VITE_API_URL` in `frontend/.env` to its origin. From `frontend`, run `npm ci`, `npm run build`, then `npm run preview -- --port 5173 --strictPort`. Open `http://localhost:5173` and allow this origin in the backend’s `CLIENT_ORIGIN`. Offline preparation uses the production build on HTTPS or localhost.

## Use the same screens online and offline

Sign in once while connected and keep RESCOM open while the browser caches the app and field records. Preparation runs automatically. During a connection drop, keep using the regular forms. The same signed-in browser can reopen the cached workspace after a reload.

If this browser has saves protected by a previous offline passphrase, **Recover previous saves** appears in Account Settings after sign-in. The old passphrase is only needed to transfer those saves.

Offline access is for one RESCOM account in each browser profile. The browser keeps the key with its saved data so the workspace can reopen during an outage. Sign out to close access on that profile. Pending changes stay on the device until RESCOM confirms them. If your server session expires, select **Sign in to sync** when the connection returns.

## Test an outage

1. Save a sample record online and check that it appears in the shared records.
2. Turn off the internet and add or edit a sample record in its usual screen. Look for **Pending sync**. Reload in the same signed-in browser and check that the save is still there.
3. Restore the connection and leave RESCOM open. Check that the pending count clears, the view refreshes, and each change appears once in the shared records.
4. If RESCOM reports that a save needs review, open the review list by the connection badge. The app keeps the failed save on the device and continues syncing other changes. Resolve the cause, such as a closed evacuation center, then retry the save.

## Available during an outage

| Screen | Offline actions |
| --- | --- |
| Dashboard | View the saved field summary and local pending changes |
| Evacuees | Register evacuees, edit details, and check out evacuees |
| Evacuation Centers | View saved centers. Admin Staff can add and edit them |
| Disaster Incidents | Log incidents and update their status |
| Priority Cases | Record priority categories and update case status |
| DROMIC Reports | Queue requests for per-incident reports and permitted status updates. The server generates the numbered report and its figures during sync |

Account creation, password recovery, user administration, deletions, official PDF downloads, and Starlink diagnostics require a connection. Admin Staff can delete non-final DROMIC reports. Deleted numbers stay reserved for the incident. Other devices see the changes once the server accepts them. The pending count applies to this browser.
