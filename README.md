# RESCOM · San Nicolas MDRRMO

RESCOM manages disaster events, evacuation centers, households, individual evacuees, priority cases, personnel, and DROMIC-aligned reports. The hosted application retains its existing D1 database and site audience. Training records are illustrative and stay in the training workspace.

For Windows setup and publishing from VS Code, open [START-HERE.md](START-HERE.md).

## Staff access

The site owner opens the administrator workspace with their ChatGPT account. In the live workspace, create a personnel invitation with the staff member's ChatGPT email, role, and assigned center for field staff. A visitor must already have permission to open the site. When the invited visitor signs in with that email, RESCOM activates the invited profile. Field staff can update their assigned center, record households and priority needs, and log disaster events.

Email/password registration and password reset use Brevo. Set `BREVO_API_KEY` and `MAIL_FROM` as server secrets and redeploy. `MAIL_FROM` must be verified in Brevo. Self-registration requires email verification and administrator approval.

## Work offline

Open the relevant workspace online before going into the field. In Workspace settings, **Offline access on this device** shows when the cached workspace is ready. The browser can reopen it during a connection loss. Cached access follows the account's session window and is available on the same browser profile.

Household registrations, household updates, priority care updates, center updates, disaster events, and authorized DROMIC changes can be queued. The connection indicator shows pending changes. RESCOM checks the server automatically and submits the queue when connectivity returns. A change that needs review stays on the device and can be reopened through **Sync status**. Personnel management and deleting shared records require an active connection. Keep the workspace open or reopen it to sync.

## DROMIC reports

Each new report covers one disaster event. RESCOM assigns the next report number, stores a dated snapshot, and supports Draft, Issued, and Final status. Final reports are locked. Review the figures and use CSV export or **Print / PDF** to create a report copy.

The app derives inside-center figures from recorded households. Enter affected population and outside-center figures only with a verified source. For events that included transfers, the recorded per-center figures reflect the center stored on the household record. The summary is prepared for review before official submission.

## Connect a Starlink dish

Join Starlink Wi-Fi through the device's network settings. The **Starlink** icon beside search opens the dish profile and diagnostics. Download the relay on the computer connected to the Starlink network, extract it, run `npm ci` and `npm start`, then choose **Check dish** in RESCOM. See the [relay instructions](starlink-relay/README.md).

## Development

Install the existing dependencies, then run the Sites build. This builds the Vinext worker, prepares the offline app shell from the build's assets, and packages the Starlink relay. Apply pending D1 migrations before running a local preview. Use the Sites publishing workflow for hosted deployment.

```sh
node node_modules/typescript/bin/tsc --noEmit
python3 tests/integrity.py
node --experimental-strip-types tests/domain.mjs
```

The municipal seal comes from the supplied RESCOM source archive. The landing photo is [Karlo King, Unsplash](https://unsplash.com/photos/WRBEzYe6TIU), an illustrative Philippine community. DM Sans and Manrope are self-hosted under the SIL Open Font License.
