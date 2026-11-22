/**
 * Cloudflare Pages Function — catch-all handler
 * Handles: /proxy?url=  /playlist.m3u  /check?url=
 * 100% Cloudflare — gratuit pour toujours, pas besoin de Railway
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

const SPOOF = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://alwanlive.stream/',
  'Origin': 'https://alwanlive.stream/',
  'Cache-Control': 'no-cache',
};

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

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const host = url.host;
  const protocol = url.protocol;
  const proxyBase = `${protocol}//${host}/proxy?url=`;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // ─── /playlist.m3u ───────────────────────────────────────────
  if (pathname === '/playlist.m3u') {
    const BASE = 'http://dashcloudflare.ddns.net';
    const bein  = n    => `${BASE}/live/ar/qa/bein/bein_sport_${n}_hd/tracks-v1a1/mono.ts.m3u8`;
    const kunit = name => `${BASE}/live/ku/ku/unit/${name}/tracks-v1a1/mono.ts.m3u8`;
    const solo  = `${BASE}/live/ar/xx/solo/solo_1_hd/tracks-v1a1/mono.ts.m3u8`;
    const BEIN_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/BeIN_Sports_logo.svg/200px-BeIN_Sports_logo.svg.png';

    const ALWAN_LOGO = 'https://alwanlive.stream/favicon.ico';
    const AVA_LOGO   = 'https://mixmedia.tv/wp-content/uploads/2023/12/ava-sport.png';
    const NRT_LOGO   = 'https://mixmedia.tv/wp-content/uploads/2022/08/nrt-sport.png';
    const ASO_LOGO   = 'https://mixmedia.tv/wp-content/uploads/2024/05/ASO-Sport.png';

    const channels = [
      // ── BeIN Sport ──────────────────────────────────────────────
      { id:1,  name:'BeIN SPORT 1', group:'BeIN Sport', logo: BEIN_LOGO, url: bein(1) },
      { id:2,  name:'BeIN SPORT 2', group:'BeIN Sport', logo: BEIN_LOGO, url: bein(2) },
      { id:3,  name:'BeIN SPORT 3', group:'BeIN Sport', logo: BEIN_LOGO, url: bein(3) },
      { id:4,  name:'BeIN SPORT 4', group:'BeIN Sport', logo: BEIN_LOGO, url: bein(4) },
      { id:5,  name:'BeIN SPORT 5', group:'BeIN Sport', logo: BEIN_LOGO, url: bein(5) },
      { id:6,  name:'BeIN SPORT 6', group:'BeIN Sport', logo: BEIN_LOGO, url: bein(6) },
      { id:7,  name:'BeIN SPORT 7', group:'BeIN Sport', logo: BEIN_LOGO, url: bein(7) },
      { id:8,  name:'BeIN SPORT 8', group:'BeIN Sport', logo: BEIN_LOGO, url: bein(8) },
      // ── Alwan Sport (logo vert) ──────────────────────────────────
      { id:21, name:'ALWAN SPORT 1', group:'Alwan Sport', logo: ALWAN_LOGO, url: 'http://d12xh5ppj9sxwj.cloudfront.net/alwan_sport1fhd/tracks-v1a1/mono.json?token=5409e599ead8f8dc30584921f2cbda9c', direct: true },
      { id:22, name:'ALWAN SPORT 2', group:'Alwan Sport', logo: ALWAN_LOGO, url: 'http://d12xh5ppj9sxwj.cloudfront.net/alwan_sport2fhd/tracks-v1a1/mono.json?token=5409e599ead8f8dc30584921f2cbda9c', direct: true },
      { id:23, name:'ALWAN SPORT 3', group:'Alwan Sport', logo: ALWAN_LOGO, url: 'https://lbgo.bozztv.com/ssh101/ssh101/yusfdara1371524/chunks.m3u8' },
      { id:24, name:'ALWAN SPORT 4', group:'Alwan Sport', logo: ALWAN_LOGO, url: 'https://lbgo.bozztv.com/ssh101/ssh101/alwan5websitealwanlive5/chunks.m3u8' },
      { id:25, name:'ALWAN SPORT 5', group:'Alwan Sport', logo: ALWAN_LOGO, url: 'https://lbgo.bozztv.com/ssh101/ssh101/alwan5websitealwanlive2/chunks.m3u8' },
      { id:26, name:'ALWAN SPORT 6', group:'Alwan Sport', logo: ALWAN_LOGO, url: 'https://lbgo.bozztv.com/ssh101/ssh101/alwan6websitealwanlive6/chunks.m3u8' },
      { id:27, name:'ALWAN SPORT 7', group:'Alwan Sport', logo: ALWAN_LOGO, url: 'https://lbgo.bozztv.com/ssh101/live/biner-zaxo/playlist.m3u8' },
      // ── Kurdistan ─────────────────────────────────────────────────
      { id:9,  name:'NRT SPORT',    group:'Kurdistan', logo: NRT_LOGO, url: kunit('nrt_sport') },
      { id:11, name:'AVA SPORT',    group:'Kurdistan', logo: AVA_LOGO, url: 'https://183.giatvcdn.com/giatv/giatv-yusfstoreavasport/yusfstoreavasport/chunks.m3u8' },
      { id:12, name:'NRT SPORT 2',  group:'Kurdistan', logo: NRT_LOGO, url: kunit('nrt_sport') },
      { id:13, name:'ASO SPORT',    group:'Kurdistan', logo: ASO_LOGO, url: kunit('aso_sport') },
      { id:14, name:'FALCON EYE',   group:'Kurdistan', logo: '',       url: kunit('falcone_1') },
      { id:15, name:'SOLO 1 HD',    group:'Kurdistan', logo: '',       url: solo },
    ];

    let m3u = '#EXTM3U x-tvg-url=""\n';
    for (const ch of channels) {
      m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${ch.name}" tvg-logo="${ch.logo}" group-title="${ch.group}",${ch.name}\n`;
      // direct:true = pas de proxy (CDN restreint les proxies)
      const streamUrl = ch.direct ? ch.url : `${proxyBase}${encodeURIComponent(ch.url)}`;
      m3u += `${streamUrl}\n`;
    }

    return new Response(m3u, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/x-mpegurl; charset=utf-8',
        'Content-Disposition': 'inline; filename="playlist.m3u"',
      },
    });
  }

  // ─── /proxy?url= ─────────────────────────────────────────────
  if (pathname === '/proxy') {
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response('Missing ?url=', { status: 400, headers: CORS });
    }

    let upstream;
    try {
      upstream = await fetch(target, { headers: SPOOF, redirect: 'follow' });
    } catch(e) {
      return new Response('Upstream error: ' + e.message, { status: 502, headers: CORS });
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    const isM3u8 = contentType.includes('mpegurl') || target.includes('.m3u8');

    if (isM3u8) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, target, proxyBase);
      return new Response(rewritten, {
        status: upstream.status,
        headers: {
          ...CORS,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store',
        },
      });
    }

    // Segments .ts, audio, etc. — on pipe directement
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS,
        'Content-Type': contentType || 'application/octet-stream',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  }

  // ─── /check?url= ─────────────────────────────────────────────
  if (pathname === '/check') {
    const target = url.searchParams.get('url');
    if (!target) {
      return Response.json({ ok: false, reason: 'Missing ?url=' }, { headers: CORS });
    }
    try {
      const r = await fetch(target, { headers: SPOOF, method: 'HEAD', redirect: 'follow' });
      const ok = r.status < 400;
      return Response.json({ ok, reason: ok ? 'OK' : `HTTP ${r.status}` }, { headers: CORS });
    } catch(e) {
      return Response.json({ ok: false, reason: e.message }, { headers: CORS });
    }
  }

  // Laisser Pages servir les fichiers statiques (index.html, app.js, style.css)
  return context.next();
}
