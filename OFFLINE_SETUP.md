# Work online and offline in RESCOM

Admin Staff and Field Personnel use the same dashboard and forms in both modes. Online saves go straight to the RESCOM database. During an outage, a prepared browser saves changes locally and marks them **Pending sync**. Once RESCOM is reachable again, the app submits pending changes and refreshes the open records. This works over your existing internet connection, including Starlink when available.

## Update the app

1. Apply the update in your RESCOM project and keep your existing environment files. The patch applies to the saved auth-layout update from before the Starlink screen.
2. In Neon or the database your RESCOM backend uses, run any missing migrations in order. Run `backend/migrations/006_offline_registrations.sql`, `backend/migrations/007_starlink_connections.sql`, then `backend/migrations/008_field_writes.sql`. If you already installed the Starlink update, run `008_field_writes.sql`. These add tables. Use `schema.sql` only for a fresh development database because it resets the tables.
3. Deploy the backend to Render first, then rebuild the Netlify frontend with the existing `VITE_API_URL`. Close earlier RESCOM tabs and reopen the updated app while connected.
4. To test locally, start your backend and set `VITE_API_URL` in `frontend/.env` to its origin. From `frontend`, run `npm ci`, `npm run build`, then `npm run preview -- --port 5173 --strictPort`. Open `http://localhost:5173` and allow this origin in the backend’s `CLIENT_ORIGIN`. Offline preparation uses the production build on HTTPS or localhost.

## Prepare a browser

1. Sign in while connected and select **Enable offline access** by the connection badge. Choose an offline passphrase with at least 16 characters. RESCOM saves the app and an encrypted copy of its field records in this browser.
2. If the browser was prepared using the earlier registration workspace, sign in with the same account, select **Unlock offline data** while connected, and enter the existing passphrase. RESCOM brings the previous drafts into the updated sync queue.
3. Use the regular RESCOM screens. If you reopen RESCOM while offline, select **Open RESCOM offline** on the sign-in screen and enter the offline passphrase. If you reopen it while online, use **Unlock offline data** in the connection bar to resume offline access.

A browser profile holds offline data for one RESCOM account. Use separate profiles for different staff. The account that saved the change must be signed in when it syncs. If the session expired, select **Sign in to sync** and use that account. Pending saves stay encrypted on this device until RESCOM confirms them. Clearing the site's browser data removes the local copy.

## Test an outage

1. Save a sample record online and check that it appears in the shared records.
2. Turn off the internet and add or edit a sample record in its usual screen. Look for **Pending sync**. Reload offline, unlock RESCOM, and check that the save is still there.
3. Restore the connection and leave RESCOM open and unlocked. Check that the pending count clears, the view refreshes, and each change appears once in the shared records. To check immediately, select **Check API connection** by the status badge.
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

Account creation, password recovery, user administration, deletions, official PDF downloads, and Starlink diagnostics require a connection. Other devices see the changes once the server accepts them. The pending count applies to this browser.
