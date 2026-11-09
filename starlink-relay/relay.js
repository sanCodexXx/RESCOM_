const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const definition = protoLoader.loadSync(path.join(__dirname, 'dish.proto'), { keepCase: true });
const { Device } = grpc.loadPackageDefinition(definition).SpaceX.API.Device;

function readDish(client) {
  return new Promise(resolve => {
    client.handle({ get_diagnostics: {} }, { deadline: Date.now() + 5000 }, (error, response) => {
      const dish = response?.dish_get_diagnostics;
      if (error || !dish) {
        console.error('Dish diagnostics did not respond. Check the Starlink network and dish firmware.');
        return resolve({ reachable: false, alerts: [] });
      }
      const alerts = Object.entries(dish.alerts || {}).filter(([, active]) => active).map(([name]) => name);
      const id = dish.id?.trim().toLowerCase().replace(/^ut/, '');
      const terminal_id = /^[a-f0-9]{8}(?:-[a-f0-9]{8}){2}$/.test(id || '') ? id : undefined;
      resolve({ reachable: true, alerts, terminal_id });
    });
  });
}

function reportConfig() {
  const token = process.env.STARLINK_RELAY_TOKEN;
  if (!/^[a-f0-9]{64}$/i.test(token || '')) throw new Error('Set STARLINK_RELAY_TOKEN to the 64-character hex token from RESCOM.');
  const apiUrl = process.env.RESCOM_API_URL;
  if (!apiUrl) throw new Error('Set RESCOM_API_URL to the RESCOM backend origin.');
  const url = new URL('/api/starlink/status', apiUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('Use an HTTPS backend origin. HTTP is available for localhost development.');
  }
  return { url, token };
}

async function sendStatus(config, status) {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(status),
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`RESCOM returned HTTP ${response.status}.`);
  console.log(`Report sent at ${new Date().toISOString()}.`);
}

async function run() {
  const probe = process.argv.includes('--probe');
  const once = probe || process.argv.includes('--once');
  const config = probe ? null : reportConfig();
  const address = process.env.STARLINK_DISH_ADDRESS || '192.168.100.1:9200';
  const client = new Device(address, grpc.credentials.createInsecure(), { 'grpc.enable_http_proxy': 0 });
  let lastTerminalId;
  try {
    do {
      const status = await readDish(client);
      if (status.reachable) lastTerminalId = status.terminal_id;
      else if (lastTerminalId) status.terminal_id = lastTerminalId;
      if (probe) {
        console.log(JSON.stringify(status, null, 2));
        if (!status.reachable) process.exitCode = 1;
      } else {
        try {
          await sendStatus(config, status);
        } catch (error) {
          console.error(`Could not report to RESCOM. ${error.message}`);
          if (once) process.exitCode = 1;
        }
      }
      if (!once) await delay(30000);
    } while (!once);
  } finally {
    client.close();
  }
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
