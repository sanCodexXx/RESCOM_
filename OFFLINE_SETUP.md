# Work online and offline in RESCOM

Admin Staff and Field Personnel use the same dashboard and forms in both modes. Online saves go straight to the RESCOM database. During an outage, a prepared browser saves changes locally and marks them **Pending sync**. Once RESCOM is reachable again, the app submits pending changes and refreshes the open records. This works over your existing internet connection, including Starlink when available.

## Update the app

1. Extract the one-button update into the RESCOM project folder that contains `frontend` and `backend`. Review the changes and rebuild the frontend on Netlify.
2. Use the database migrations from the existing Starlink/offline update. For an installation missing them, apply `backend/migrations/006_offline_registrations.sql`, `007_starlink_connections.sql`, and `008_field_writes.sql` in order. `schema.sql` resets the tables and is for a fresh development database.
3. Keep the existing `VITE_API_URL` for the Netlify build. Reopen the updated app while connected so the browser can download the new offline files.
4. To test locally, start your backend and set `VITE_API_URL` in `frontend/.env` to its origin. From `frontend`, run `npm ci`, `npm run build`, then `npm run preview -- --port 5173 --strictPort`. Open `http://localhost:5173` and allow this origin in the backend’s `CLIENT_ORIGIN`. Offline preparation uses the production build on HTTPS or localhost.

## Prepare a browser

1. Sign in while connected and click **Enable offline access** beside the connection badge. Keep RESCOM open until it says the browser is ready.
2. Use the regular RESCOM screens. If the connection drops, RESCOM saves supported changes on this device. If you reload during the outage, the prepared browser can reopen the saved workspace using its current RESCOM sign-in.
3. On a browser prepared with the older passphrase setup, sign in while connected and select **Upgrade offline access**. Enter the previous passphrase once to carry over the encrypted saves. After the transfer, this browser uses the one-button setup.

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

Account creation, password recovery, user administration, deletions, official PDF downloads, and Starlink diagnostics require a connection. Other devices see the changes once the server accepts them. The pending count applies to this browser.
