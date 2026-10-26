// Prints what a page opened with ?remotelog posts (src/load/remotelog.js): node tools/phonelog.mjs [port=5200] [file]
// Mount it at /__log beside the game, e.g. `tailscale serve --bg --https=8443 --set-path /__log http://127.0.0.1:5200`.
// Every line also goes to `file` (default phonelog.txt in the working directory).
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
const [port = 5200, file = 'phonelog.txt'] = process.argv.slice(2);
createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.writeHead(204, { 'access-control-allow-origin': '*' }).end();
    try {
      const { ua, entries } = JSON.parse(body);
      const who = /iPhone|iPad|Android/.exec(ua)?.[0] || 'browser';
      const stamp = new Date().toISOString().slice(11, 19);
      for (const e of entries) {
        const line = `${stamp} ${who} ${String(e.t).padStart(7)} ${e.kind.padEnd(10)} ${e.msg}`;
        console.log(line);
        appendFileSync(file, line + '\n');
      }
    } catch { /* not ours */ }
  });
}).listen(+port, '127.0.0.1', () => console.log(`phonelog on 127.0.0.1:${port}`));
