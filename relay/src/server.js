import { createServer } from 'node:http';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { fetchText } from './fetch-text.js';

const config = readConfig(process.env);
const handle = createApp({ config, fetchText });
const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(`unhandled: ${error.message}`);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});
handle.keepWarm();
server.listen(config.port, () => {
  console.log(`msg-relay listening on :${config.port}, origins: ${config.allowedOrigins.join(', ') || '(none)'}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
