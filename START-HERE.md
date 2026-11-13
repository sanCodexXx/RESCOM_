# RESCOM in VS Code

This is the editable source for the San Nicolas MDRRMO app, based on the published RESCOM Site. The ZIP includes application code, images, the database schema and migrations, and the Starlink relay. Live records, credentials, and site access settings stay with their host.

## Open and run on Windows

1. Install [Node.js 24 LTS](https://nodejs.org/en/download/) if needed. Reopen VS Code after installation.
2. Right-click the ZIP, select **Extract All**, and open the extracted **RESCOM** folder through **File → Open Folder**. Open **Terminal → New Terminal**. The folder should contain `package.json`.
3. In the VS Code PowerShell terminal, run:

   ```powershell
   npm.cmd install -g pnpm@11.25.0
   pnpm.cmd install --frozen-lockfile
   pnpm.cmd db:local
   pnpm.cmd build
   pnpm.cmd start
   ```

4. Open [http://127.0.0.1:8787](http://127.0.0.1:8787). The local administrator preview opens with training records. Your local database is stored in `.wrangler/state` and is separate from the published Site.

After editing, stop the server with **Ctrl+C**, then run `pnpm.cmd build` and `pnpm.cmd start` again. The built preview includes the offline cache and Starlink download. For layout edits with hot reload, `pnpm.cmd dev` opens [http://127.0.0.1:5173](http://127.0.0.1:5173).

| To edit | Open |
| --- | --- |
| Workspace and menus | `app/Rescom.tsx` |
| Styles | `app/globals.css` |
| Forms and reports | `components/Editor.tsx`, `components/DromicSummary.tsx` |
| API and data rules | `app/api/[...path]/route.ts`, `db/schema.ts`, `drizzle/` |
| Starlink | `components/Starlink.tsx`, `starlink-relay/` |

## Publish on your existing RESCOM address

The current version is already published at [RESCOM San Nicolas MDRRMO](https://rescom-san-nicolas-hub.gaoatgresan1.chatgpt.site/).

To publish changes made in VS Code, send the changed source files or a ZIP of the updated source in the ChatGPT Work conversation for the existing Site. Ask Codex to apply the changes and publish to that Site. This uses the existing Site's URL, database, and access policy. The published database applies new migrations during the Sites publishing workflow.

## Publish on your own Cloudflare account

This path creates a separate Workers URL and D1 database. The standalone app uses its RESCOM email/password sign-in. Brevo enables self-registration and password reset. The administrator command below lets you sign in before configuring Brevo.

1. In the project terminal, sign in to Cloudflare and create a D1 database:

   ```powershell
   pnpm.cmd exec wrangler login --config wrangler.local.json
   pnpm.cmd exec wrangler d1 create rescom-san-nicolas --config wrangler.local.json
   Copy-Item wrangler.cloudflare.example.json wrangler.cloudflare.json
   ```

2. Open `wrangler.cloudflare.json`. In the `DB` entry, replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the UUID from Cloudflare. If you chose a different database name, update `database_name` too.
3. Apply the database migrations and create your first administrator. Replace `you@example.com` with your email address. Save the password printed by the command.

   ```powershell
   pnpm.cmd exec wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.json
   pnpm.cmd admin:create you@example.com --remote
   ```

4. Build and publish from the terminal. Wrangler prints your Workers URL.

   ```powershell
   pnpm.cmd build
   pnpm.cmd exec wrangler deploy --config wrangler.cloudflare.json
   ```

5. Open the deployed URL and choose **Sign in**. Use your administrator email and generated password. To enable verification emails and password reset, add `BREVO_API_KEY` and `MAIL_FROM` under **Workers & Pages → your Worker → Settings → Variables and Secrets**. `MAIL_FROM` must be a verified Brevo sender.

For a later update, apply any new migrations, run the build, and deploy again with the same Cloudflare configuration. When testing Starlink on your own URL, follow **Set up the local relay** in the app and use that URL's origin as `RESCOM_APP_ORIGIN`. Live diagnostics require a Starlink terminal on the relay computer's network.

For reference, see [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) and [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
