# Starlink in RESCOM

Open the dish icon beside **Search** to reach the Starlink screen. Both Admin Staff and Field Personnel can use it.

## Use Starlink for internet access

Connect your laptop or phone to an active Starlink kit through your device’s Wi-Fi settings. Open RESCOM normally. **RESCOM online** means the browser can reach the RESCOM backend. Saving a Terminal ID enables optional diagnostics through a relay. [Starlink installation guide](https://starlink.com/public-files/StarlinkInstallGuide_Rectangular_English.pdf)

During an outage, RESCOM saves changes on the prepared browser through the regular forms. When RESCOM is reachable, it syncs over Starlink, regular Wi-Fi, or mobile data. See [OFFLINE_SETUP.md](OFFLINE_SETUP.md).

## Deploy this update

1. Apply the source update to your RESCOM project and keep its existing environment files and hosting settings.
2. Apply any missing database migrations in the order listed in [OFFLINE_SETUP.md](OFFLINE_SETUP.md).
3. Deploy the backend on Render, then rebuild the frontend on Netlify with your existing `VITE_API_URL`.
4. Sign in and check the Starlink icon and **Enable offline access** by the connection badge. You can test the offline workflow using your existing internet connection.

## Optional dish diagnostics

1. In the Starlink app, open **Settings → Advanced → STARLINK** to find the **Terminal ID**. In RESCOM, open the dish icon, enter a dish name and Terminal ID, and select **Save dish**. [Starlink Terminal ID guide](https://starlink.com/support/article/2802431a-135f-0671-4c1b-4cedb65b291a)
2. On a laptop with Node.js 20.6 or later, join the Starlink network. In the `starlink-relay` folder, run:

   ```powershell
   npm ci
   npm run probe
   ```

   The probe uses the read-only Starlink Local Device API at `192.168.100.1:9200`. It prints the Terminal ID and tracked alerts when the dish responds. Check the firmware requirements in the Local Device API guide if the probe fails. [Starlink Local Device API](https://github.com/SpaceExplorationTechnologies/enterprise-api/blob/master/device-api/README.md)
3. Generate a private relay token locally. Keep the output private.

   ```powershell
   node -p "require('node:crypto').randomBytes(32).toString('hex')"
   ```

4. Set `STARLINK_RELAY_TOKEN` to that value in the Render backend environment and redeploy it. In `starlink-relay`, copy `.env.example` to `.env`, then set `RESCOM_API_URL` to your HTTPS backend origin and `STARLINK_RELAY_TOKEN` to the same token. Keep this RESCOM-generated token on the backend and the local relay.
5. Run `npm run report` once to check the connection to RESCOM. Run `npm start` to keep reporting every 30 seconds. Refresh the Starlink screen. **Dish responding** appears after a current matching report. Reports older than two minutes are marked stale.

Each account can save one Terminal ID. The report shows when the relay reached the dish and which tracked alerts were active. Use the connection badge or a sample registration to check whether RESCOM itself is reachable over the network.
