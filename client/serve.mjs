// Servidor estatico minimo (sin dependencias nuevas) para poder abrir
// e2e.html desde http://localhost en vez de file:// (los modulos ES no
// cargan bien desde file:// en la mayoria de los navegadores).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const PORT = Number(process.env.PORT ?? 5500);
const ROOT = new URL('.', import.meta.url).pathname;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  const path = req.url === '/' ? '/e2e.html' : req.url.split('?')[0];
  const filePath = join(ROOT, path);

  readFile(filePath)
    .then((body) => {
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      });
      res.end(body);
    })
    .catch(() => {
      res.writeHead(404);
      res.end('Not found');
    });
});

server.listen(PORT, () => {
  console.log(`Serving client/ at http://localhost:${PORT}/e2e.html`);
});
