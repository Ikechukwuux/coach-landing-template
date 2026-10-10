const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const COACH_DIR = path.join(ROOT_DIR, 'coach-concept');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const LIVE_RELOAD_SCRIPT = `
<!-- Livereload script injected by dev server -->
<script>
(function() {
  const es = new EventSource('/__livereload');
  es.onmessage = function(e) {
    if (e.data === 'reload') {
      console.log('[live-reload] File change detected, reloading page...');
      location.reload();
    }
  };
  es.onerror = function() {
    // Retry connection after brief backoff
    setTimeout(function() {
      // EventSource reconnects automatically
    }, 1000);
  };
})();
</script>
`;

const sseClients = new Set();

function notifyClients() {
  for (const client of sseClients) {
    try {
      client.write('data: reload\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Watch directory for changes with debounce
let debounceTimer = null;
try {
  fs.watch(ROOT_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (filename.includes('.git') || filename.includes('server.js') || filename.includes('node_modules')) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[live-reload] File changed (${eventType}): ${filename}`);
      notifyClients();
    }, 100);
  });
} catch (err) {
  console.warn('[live-reload] Recursive watch failed, watching directories individually', err);
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // SSE livereload endpoint
  if (pathname === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Resolve file path
  let candidates = [];
  if (pathname === '/' || pathname === '/index.html') {
    candidates.push(path.join(COACH_DIR, 'index.html'));
    candidates.push(path.join(ROOT_DIR, 'index.html'));
  } else if (pathname === '/coach-concept' || pathname === '/coach-concept/') {
    candidates.push(path.join(COACH_DIR, 'index.html'));
  } else {
    // Normal file requests (e.g. /hero-portrait.jpg or /coach-concept/hero-portrait.jpg)
    const relPath = pathname.replace(/^\/+/, '');
    candidates.push(path.join(COACH_DIR, relPath));
    candidates.push(path.join(ROOT_DIR, relPath));
  }

  let filePath = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      filePath = candidate;
      break;
    }
  }

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404 Not Found: ${pathname}`);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  if (ext === '.html') {
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
        return;
      }
      let injected = html;
      if (injected.includes('</body>')) {
        injected = injected.replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`);
      } else {
        injected += LIVE_RELOAD_SCRIPT;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(injected);
    });
  } else {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Live preview URL: http://localhost:${PORT}/`);
});
