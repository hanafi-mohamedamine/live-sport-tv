/**
 * LIVE SPORT TV — Advanced Proxy Server
 * - Spoofs Referer/Origin as alwanlive.stream
 * - Rewrites M3U8 playlists to proxy all segments
 * - Serves static files
 * - /check endpoint to test stream availability
 * - /playlist.m3u endpoint for IPTV apps
 */

const http  = require('http');
const https = require('https');
const os    = require('os');
const url   = require('url');
const path  = require('path');
const fs    = require('fs');

// Detect local IP automatically
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
const LOCAL_IP = getLocalIP();

const PORT   = process.env.PORT || 8787;
const STATIC = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts':   'video/mp2t',
  '.aac':  'audio/aac',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

// Spoof headers to look like a real browser visiting alwanlive.stream
function spoofHeaders(targetUrl) {
  let parsed;
  try { parsed = new URL(targetUrl); } catch(e) { parsed = { origin: 'https://alwanlive.stream' }; }

  return {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept':          '*/*',
    'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
    'Accept-Encoding': 'identity',
    'Origin':          'https://alwanlive.stream',
    'Referer':         'https://alwanlive.stream/',
    'Sec-Fetch-Dest':  'empty',
    'Sec-Fetch-Mode':  'cors',
    'Sec-Fetch-Site':  'cross-site',
    'Connection':      'keep-alive',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
  };
}

function resolveUrl(rel, base) {
  try { return new URL(rel, base).href; } catch(e) { return rel; }
}

function rewriteM3u8(body, baseUrl, proxyBase) {
  return body.split('\n').map(line => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = resolveUrl(uri, baseUrl);
        return `URI="${proxyBase}${encodeURIComponent(abs)}"`;
      });
    }
    const abs = resolveUrl(t, baseUrl);
    return proxyBase + encodeURIComponent(abs);
  }).join('\n');
}

function fetchUpstream(targetUrl, res, proxyBase, redirects) {
  if ((redirects || 0) > 6) {
    res.writeHead(502, { ...CORS, 'Content-Type': 'text/plain' });
    res.end('Too many redirects');
    return;
  }

  let parsed;
  try { parsed = new URL(targetUrl); }
  catch(e) {
    res.writeHead(400, { ...CORS, 'Content-Type': 'text/plain' });
    res.end('Invalid URL');
    return;
  }

  const transport = parsed.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method:   'GET',
    headers:  spoofHeaders(targetUrl),
    timeout:  18000,
  };

  const req = transport.request(options, proxyRes => {
    const status = proxyRes.statusCode;
    const loc    = proxyRes.headers['location'];

    // Follow redirects
    if ([301,302,303,307,308].includes(status) && loc) {
      proxyRes.resume();
      fetchUpstream(resolveUrl(loc, targetUrl), res, proxyBase, (redirects || 0) + 1);
      return;
    }

    const ctype  = (proxyRes.headers['content-type'] || '').toLowerCase();
    const isM3u8 = ctype.includes('mpegurl') || ctype.includes('x-mpegurl') ||
                   targetUrl.includes('.m3u8');
    const isTs   = ctype.includes('video/mp2t') || targetUrl.match(/\.ts(\?|$)/);

    const outHeaders = {
      ...CORS,
      'Content-Type':  isM3u8 ? 'application/vnd.apple.mpegurl' :
                       isTs   ? 'video/mp2t' : (ctype || 'application/octet-stream'),
      'Cache-Control': 'no-cache, no-store',
    };

    if (isM3u8) {
      let data = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', c => data += c);
      proxyRes.on('end', () => {
        const rewritten = rewriteM3u8(data, targetUrl, proxyBase);
        const buf = Buffer.from(rewritten, 'utf8');
        outHeaders['Content-Length'] = buf.length;
        res.writeHead(status < 400 ? status : 200, outHeaders);
        res.end(buf);
      });
    } else {
      res.writeHead(status, outHeaders);
      proxyRes.pipe(res, { end: true });
    }
  });

  req.on('timeout', () => {
    req.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { ...CORS, 'Content-Type': 'text/plain' });
      res.end('Upstream timeout');
    }
  });

  req.on('error', err => {
    if (!res.headersSent) {
      res.writeHead(502, { ...CORS, 'Content-Type': 'text/plain' });
      res.end('Proxy error: ' + err.message);
    }
  });

  req.end();
}

// Check if a stream URL is alive (HEAD request via proxy logic)
function checkStream(targetUrl, cb, redirects) {
  if ((redirects || 0) > 5) return cb(false, 'Too many redirects');

  // One-shot guard: ensure cb is called at most once
  let called = false;
  function done(ok, reason) {
    if (called) return;
    called = true;
    cb(ok, reason);
  }

  let parsed;
  try { parsed = new URL(targetUrl); } catch(e) { return done(false, 'Invalid URL'); }

  const transport = parsed.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method:   'GET',
    headers:  spoofHeaders(targetUrl),
    timeout:  8000,
  };

  const req = transport.request(options, proxyRes => {
    const status = proxyRes.statusCode;
    proxyRes.resume(); // drain
    if ([301,302,303,307,308].includes(status) && proxyRes.headers['location']) {
      const next = resolveUrl(proxyRes.headers['location'], targetUrl);
      checkStream(next, done, (redirects || 0) + 1);
      return;
    }
    done(status >= 200 && status < 400, `HTTP ${status}`);
  });
  req.on('timeout', () => { req.destroy(); done(false, 'timeout'); });
  req.on('error',   err => done(false, err.message));
  req.end();
}

function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// Main server
const server = http.createServer((req, res) => {
  const parsed   = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;

  // Detect host & protocol (works locally and in cloud behind reverse proxy)
  const host = req.headers['host'] || `${LOCAL_IP}:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // /playlist.m3u → M3U playlist for IPTV apps
  if (pathname === '/playlist.m3u') {
    const BASE = 'http://yusftsoreforver.ddns.net';
    const bein  = n    => `${BASE}/live/ar/qa/bein/bein_sport_${n}_hd/tracks-v1a1/mono.ts.m3u8`;
    const kunit = name => `${BASE}/live/ku/ku/unit/${name}/index.m3u8`;
    const solo  = `${BASE}/live/ar/xx/solo/solo_1_hd/tracks-v1a1/mono.ts.m3u8`;
    const proxy = u => `${protocol}://${host}/proxy?url=${encodeURIComponent(u)}`;

    const channels = [
      { id:1,  name:'BeIN SPORT 1', group:'BeIN Sport', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png', url: bein(1) },
      { id:2,  name:'BeIN SPORT 2', group:'BeIN Sport', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png', url: bein(2) },
      { id:3,  name:'BeIN SPORT 3', group:'BeIN Sport', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png', url: bein(3) },
      { id:4,  name:'BeIN SPORT 4', group:'BeIN Sport', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png', url: bein(4) },
      { id:5,  name:'BeIN SPORT 5', group:'BeIN Sport', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png', url: bein(5) },
      { id:6,  name:'BeIN SPORT 6', group:'BeIN Sport', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png', url: bein(6) },
      { id:7,  name:'BeIN SPORT 7', group:'BeIN Sport', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png', url: bein(7) },
      { id:8,  name:'BeIN SPORT 8', group:'BeIN Sport', logo:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png', url: bein(8) },
      { id:9,  name:'NRT SPORT',     group:'Autres',     logo:'', url: kunit('nrt_sport') },
      { id:10, name:'LD SPORT',      group:'Autres',     logo:'', url: bein(1) },
      { id:11, name:'AVA SPORT',     group:'Autres',     logo:'', url: kunit('Ava_Sport') },
      { id:12, name:'NRT SPORT 2',   group:'Autres',     logo:'', url: kunit('nrt_sport') },
      { id:13, name:'ASO SPORT',     group:'Autres',     logo:'', url: kunit('aso_sport') },
      { id:14, name:'FALCON EYE',    group:'Autres',     logo:'', url: kunit('falcone_1') },
      { id:15, name:'SOLO 1 HD',     group:'Autres',     logo:'', url: solo },
    ];

    let m3u = '#EXTM3U x-tvg-url=""\n';
    for (const ch of channels) {
      m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${ch.name}" tvg-logo="${ch.logo}" group-title="${ch.group}",${ch.name}\n`;
      m3u += proxy(ch.url) + '\n';
    }

    res.writeHead(200, {
      ...CORS,
      'Content-Type': 'application/x-mpegurl; charset=utf-8',
      'Content-Disposition': 'inline; filename="playlist.m3u"',
    });
    res.end(m3u);
    return;
  }

  // /proxy?url=...
  if (pathname === '/proxy') {
    const target = parsed.searchParams.get('url');
    if (!target) {
      res.writeHead(400, { ...CORS, 'Content-Type': 'text/plain' });
      res.end('Missing ?url=');
      return;
    }
    const proxyBase = `${protocol}://${host}/proxy?url=`;
    console.log(`[PROXY] ${target.substring(0, 90)}`);
    fetchUpstream(target, res, proxyBase);
    return;
  }

  // /check?url=... → returns JSON {ok, reason}
  if (pathname === '/check') {
    const target = parsed.searchParams.get('url');
    if (!target) {
      res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'missing url' }));
      return;
    }
    checkStream(target, (ok, reason) => {
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok, reason }));
    });
    return;
  }

  // Static files
  let filePath = path.join(STATIC, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(STATIC)) {
    res.writeHead(403); res.end(); return;
  }
  serveStatic(filePath, res);
});

server.listen(PORT, () => {
  console.log(`\n🚀 LIVE SPORT TV — Proxy Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📺  Site local :    http://localhost:${PORT}`);
  console.log(`📺  Site réseau :   http://${LOCAL_IP}:${PORT}`);
  console.log(`📋  Playlist M3U :  http://${LOCAL_IP}:${PORT}/playlist.m3u`);
  console.log(`🔄  Proxy :         http://${LOCAL_IP}:${PORT}/proxy?url=<url>`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📱 Dans votre app IPTV sur TV, entrez :`);
  console.log(`   URL M3U : http://${LOCAL_IP}:${PORT}/playlist.m3u\n`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} already in use`);
  else console.error('Server error:', err);
  process.exit(1);
});
