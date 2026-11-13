# RESCOM Starlink relay

1. Install Node.js 22 or later on a computer connected to the Starlink network.
2. Extract the ZIP, open a terminal in that folder, and run `npm ci`. Installation needs internet access.
3. Run `npm start` and leave the terminal open. Run `npm run probe` if you want to verify the dish from the terminal.
4. On that computer, open RESCOM in Chrome or Edge, select the Starlink icon beside search, and choose **Check dish**. Allow browser access to the local network if prompted. Use **Use this Terminal ID** to copy the ID to the form, then save the dish profile.

The relay listens on the computer's loopback interface and allows the published RESCOM origin. It reads the official Starlink Local Device API at `192.168.100.1:9200`. The read does not require a Starlink cloud API key. See the [Local Device API](https://github.com/SpaceExplorationTechnologies/enterprise-api/tree/master/device-api) for firmware requirements.

The check verifies whether the terminal responded, then displays its hardware, firmware, service code, and tracked alerts. A responding terminal and reachability of the RESCOM server are independent readings. Join Starlink Wi-Fi through your computer or phone's network settings to use Starlink for internet access.

For a localhost preview or a different deployed address, set `RESCOM_APP_ORIGIN` to the exact browser origin before starting the relay. In Windows PowerShell, for the default preview address:

```powershell
$env:RESCOM_APP_ORIGIN = "http://127.0.0.1:8787"
npm.cmd start
```

For a published copy, use its HTTPS origin without a trailing slash. `STARLINK_DISH_ADDRESS` defaults to the Starlink LAN address above.
