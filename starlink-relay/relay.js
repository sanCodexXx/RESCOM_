const http = require('node:http');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const definition = protoLoader.loadSync(path.join(__dirname, 'dish.proto'), { keepCase: true, defaults: true });
const { Device } = grpc.loadPackageDefinition(definition).SpaceX.API.Device;
const hostname = '127.0.0.1';
const port = 8765;
const appOrigin = 'https://rescom-san-nicolas-hub.gaoatgresan1.chatgpt.site';
const dishAddress = process.env.STARLINK_DISH_ADDRESS || '192.168.100.1:9200';

function readDish(client) {
  return new Promise((resolve, reject) => {
    client.handle({ get_diagnostics: {} }, { deadline: Date.now() + 4500 }, (error, response) => {
      const dish = response?.dish_get_diagnostics;
      if (error || !dish?.id) {
        reject(new Error('The dish did not respond. Check the Starlink network and terminal firmware.'));
        return;
      }
      const id = dish.id.trim().toLowerCase().replace(/^ut/, '');
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{8}){2}$/.test(id)) {
        reject(new Error('The terminal returned an unsupported ID.'));
        return;
      }
      resolve({
        terminalId: 'ut' + id,
        hardware: dish.hardware_version,
        firmware: dish.software_version,
        alerts: Object.entries(dish.alerts || {}).filter(([, active]) => active).map(([name]) => name),
        serviceCode: dish.disablement_code,
        stowed: dish.stowed,
        checkedAt: new Date().toISOString(),
      });
    });
  });
}

const client = new Device(dishAddress, grpc.credentials.createInsecure(), { 'grpc.enable_http_proxy': 0 });
if (process.argv.includes('--probe')) {
  readDish(client).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(() => client.close());
} else {
  const approved = process.env.RESCOM_APP_ORIGIN || appOrigin;
  let inFlight;
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.headers.host !== hostname + ':' + port || request.headers.origin !== approved) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', approved);
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    response.setHeader('Vary', 'Origin');
    if (request.url !== '/diagnostics' || !['OPTIONS', 'GET'].includes(request.method)) {
      response.writeHead(404).end();
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    try {
      inFlight ??= readDish(client).finally(() => { inFlight = undefined; });
      response.end(JSON.stringify(await inFlight));
    } catch (error) {
      response.writeHead(503).end(JSON.stringify({ error: error.message }));
    }
  });
  server.listen(port, hostname, () => console.log('RESCOM Starlink relay ready on http://' + hostname + ':' + port + '.'));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { client.close(); server.close(); });
  }
}
