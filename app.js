/* ================================================================
   LIVE SPORT TV — HLS.js direct, no Video.js dependency
   ================================================================ */
'use strict';

const BASE = 'http://yusftsoreforver.ddns.net';
const bein  = n    => `${BASE}/live/ar/qa/bein/bein_sport_${n}_hd/tracks-v1a1/mono.ts.m3u8`;
const kunit = name => `${BASE}/live/ku/ku/unit/${name}/index.m3u8`;

/* ---- CHANNELS -------------------------------------------------- */
const channels = [
  { id:1,  name:'BeIN SPORT 1',  emoji:'🏆', label:'BeIN Sport 1' },
  { id:2,  name:'BeIN SPORT 2',  emoji:'⚽', label:'BeIN Sport 2' },
  { id:3,  name:'BeIN SPORT 3',  emoji:'🎯', label:'BeIN Sport 3' },
  { id:4,  name:'BeIN SPORT 4',  emoji:'🏀', label:'BeIN Sport 4' },
  { id:5,  name:'BeIN SPORT 5',  emoji:'🎽', label:'BeIN Sport 5' },
  { id:6,  name:'BeIN SPORT 6',  emoji:'🏈', label:'BeIN Sport 6' },
  { id:7,  name:'BeIN SPORT 7',  emoji:'🥊', label:'BeIN Sport 7' },
  { id:8,  name:'BeIN SPORT 8',  emoji:'🎖️', label:'BeIN Sport 8' },
  { id:9,  name:'NRT SPORT',     emoji:'📡', label:'NRT Sport'    },
  { id:10, name:'LD SPORT',      emoji:'🌍', label:'LD Sport'     },
  { id:11, name:'AVA SPORT',     emoji:'🦅', label:'Ava Sport'    },
  { id:12, name:'NRT SPORT 2',   emoji:'📺', label:'NRT Sport 2'  },
  { id:13, name:'ASO SPORT',     emoji:'🏋️', label:'Aso Sport'    },
  { id:14, name:'FALCON EYE',    emoji:'👁️', label:'Falcon Eye'   },
  { id:15, name:'SOLO 1 HD',     emoji:'⭐', label:'Solo 1 HD'    },
];

const channelServers = {
  1:  [ bein(1), 'https://lbgo.bozztv.com/ssh101/ssh101/yusfdara137152/chunks.m3u8' ],
  2:  [ bein(2), 'https://lbgo.bozztv.com/ssh101/ssh101/yusfdara1371523/chunks.m3u8' ],
  3:  [ bein(3), 'https://lbgo.bozztv.com/ssh101/ssh101/yusfdara1371524/chunks.m3u8' ],
  4:  [ bein(4), 'https://lbgo.bozztv.com/ssh101/ssh101/avasport123/chunks.m3u8' ],
  5:  [ bein(5), 'https://lbgo.bozztv.com/ssh101/ssh101/alwan5websitealwanlive5/chunks.m3u8' ],
  6:  [ bein(6), 'https://lbgo.bozztv.com/ssh101/ssh101/alwan6websitealwanlive6/chunks.m3u8' ],
  7:  [ bein(7) ],
  8:  [ bein(8) ],
  9:  [ kunit('nrt_sport') ],
  10: [ bein(1) ],
  11: [ kunit('Ava_Sport') ],
  12: [ kunit('nrt_sport') ],
  13: [ kunit('aso_sport') ],
  14: [ kunit('falcone_1') ],
  15: [ `${BASE}/live/ar/xx/solo/solo_1_hd/tracks-v1a1/mono.ts.m3u8` ],
};

/* ---- STATE ----------------------------------------------------- */
let activeChannelId = 1;
let hlsInstance     = null;

/* ---- DOM ------------------------------------------------------- */
const $ = id => document.getElementById(id);
const videoEl       = $('mainPlayer');
const channelListEl = $('channelList');
const serverBtnsEl  = $('serverButtons');
const channelTitleEl= $('channelTitle');
const streamStatusEl= $('streamStatus');
const loadingEl     = $('playerLoading');
const loadingTxtEl  = $('loadingText');
const errorEl       = $('playerError');
const errorMsgEl    = $('errorMsg');
const searchEl      = $('searchInput');
const sidebarEl     = $('sidebar');
const toggleBtn     = $('sidebarToggle');

/* ---- UI HELPERS ----------------------------------------------- */
function showLoading(msg) {
  loadingTxtEl.textContent = msg || 'Connexion au flux…';
  loadingEl.style.display = 'flex';
  errorEl.style.display = 'none';
}
function hideLoading() {
  loadingEl.style.display = 'none';
}
function hideAllOverlays() {
  loadingEl.style.display = 'none';
  errorEl.style.display = 'none';
}
function showError(msg) {
  if (!videoEl.paused && videoEl.readyState >= 2) return;
  hideLoading();
  errorEl.style.display = 'flex';
  errorMsgEl.textContent = msg || 'Essayez un autre serveur';
  streamStatusEl.textContent = '⚠️ ERREUR';
}

// timeupdate se déclenche toutes les ~250ms pendant la lecture
// → garantit que les overlays disparaissent dès que la vidéo joue vraiment
videoEl.addEventListener('timeupdate', () => {
  if (!videoEl.paused && videoEl.readyState >= 2) {
    hideAllOverlays();
    streamStatusEl.textContent = '🔴 LIVE';
  }
});
videoEl.addEventListener('playing', () => {
  hideAllOverlays();
  streamStatusEl.textContent = '🔴 LIVE';
});
videoEl.addEventListener('waiting', () => {
  streamStatusEl.textContent = '🔄 Tampon…';
});

/* ---- HLS LOADER ----------------------------------------------- */
function destroyHls() {
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch(e) {}
    hlsInstance = null;
  }
}

function loadStream(rawUrl) {
  destroyHls();
  videoEl.removeAttribute('src');
  videoEl.load();

  if (!rawUrl) { showError('URL non configurée'); return; }

  const src = '/proxy?url=' + encodeURIComponent(rawUrl);
  console.log('[LOAD]', src.substring(0, 100));

  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      maxBufferLength: 30,
      manifestLoadingTimeOut: 15000,
      fragLoadingTimeOut: 20000,
    });
    hlsInstance = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      hideAllOverlays();
      streamStatusEl.textContent = '🔴 LIVE';
      videoEl.play().catch(() => {
        videoEl.muted = true;
        videoEl.play().catch(() => {});
      });
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      console.warn('[HLS ERROR]', data.type, data.details, data.fatal);
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        streamStatusEl.textContent = '🔄 Reconnexion…';
        setTimeout(() => {
          try { hls.startLoad(); } catch(e) {}
        }, 2500);
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        try { hls.recoverMediaError(); } catch(e) {
          showError('Erreur media — changez de serveur');
        }
      } else {
        showError('Flux indisponible — changez de serveur');
      }
    });

    hls.loadSource(src);
    hls.attachMedia(videoEl);

  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari — HLS natif
    videoEl.src = src;
    videoEl.addEventListener('loadedmetadata', () => {
      hideLoading();
      streamStatusEl.textContent = '🔴 LIVE';
      videoEl.play().catch(() => {});
    }, { once: true });
    videoEl.addEventListener('error', () => {
      showError('Erreur lecteur — changez de serveur');
    }, { once: true });
    videoEl.load();
  } else {
    showError('Navigateur non compatible HLS. Utilisez Chrome ou Firefox.');
  }
}

/* ---- CHECK STREAM --------------------------------------------- */
async function checkUrl(rawUrl) {
  try {
    const r = await fetch('/check?url=' + encodeURIComponent(rawUrl),
      { signal: AbortSignal.timeout(9000) });
    const j = await r.json();
    return j.ok;
  } catch { return false; }
}

/* ---- SERVER BUTTONS ------------------------------------------- */
function renderServers(channelId, activeIdx) {
  serverBtnsEl.innerHTML = '';
  const servers = channelServers[channelId] || [];
  servers.forEach((url, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'server-btn' + (i === activeIdx ? ' active' : '');
    btn.innerHTML = `<span class="srv-label">SERVEUR ${i + 1}</span><span class="srv-status checking" title="Vérification…">…</span>`;
    btn.addEventListener('click', () => openServer(channelId, i));
    serverBtnsEl.appendChild(btn);

    // Check async (ne bloque pas le chargement)
    checkUrl(url).then(ok => {
      const st = btn.querySelector('.srv-status');
      if (st) {
        st.textContent = ok ? '🟢' : '🔴';
        st.className = 'srv-status ' + (ok ? 'online' : 'offline');
        st.title = ok ? 'En ligne' : 'Hors ligne';
      }
    });
  });
}

function openServer(channelId, idx) {
  const url = (channelServers[channelId] || [])[idx];
  serverBtnsEl.querySelectorAll('.server-btn').forEach((b, i) =>
    b.classList.toggle('active', i === idx));
  showLoading('Connexion au serveur ' + (idx + 1) + '…');
  loadStream(url);
  try {
    const u = new URL(location.href);
    u.searchParams.set('channel', channelId);
    u.searchParams.set('server', idx + 1);
    history.replaceState({}, '', u.search ? '?' + u.searchParams : location.pathname);
  } catch {}
}

/* ---- CHANNELS LIST -------------------------------------------- */
function renderChannels(list) {
  channelListEl.innerHTML = '';
  if (!list.length) {
    channelListEl.innerHTML = '<p class="no-results">Aucun résultat</p>';
    return;
  }
  list.forEach(ch => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'channel-item' + (ch.id === activeChannelId ? ' active' : '');
    btn.dataset.id = ch.id;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', ch.id === activeChannelId);
    btn.innerHTML = `
      <span class="channel-num">${String(ch.id).padStart(2,'0')}</span>
      <div class="channel-info">
        <span class="channel-name">${ch.emoji} ${ch.name}</span>
        <span class="channel-sub">${ch.label} • LIVE</span>
      </div>
      <span class="channel-live-dot"></span>`;
    btn.addEventListener('click', () => openChannel(ch.id));
    channelListEl.appendChild(btn);
  });
}

function openChannel(id) {
  const ch = channels.find(c => c.id === id) || channels[0];
  activeChannelId = ch.id;
  channelTitleEl.textContent = `${ch.emoji} ${ch.name}`;
  streamStatusEl.textContent = '⏳ Chargement…';
  showLoading('Chargement de la chaîne…');
  renderChannels(channels);
  renderServers(ch.id, 0);
  openServer(ch.id, 0);
  if (window.innerWidth <= 768) {
    sidebarEl.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
  }
}

/* ---- SEARCH --------------------------------------------------- */
searchEl.addEventListener('input', () => {
  const q = searchEl.value.trim().toLowerCase();
  renderChannels(q ? channels.filter(c =>
    c.name.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
  ) : channels);
});

/* ---- MOBILE SIDEBAR ------------------------------------------- */
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);
toggleBtn.addEventListener('click', () => {
  sidebarEl.classList.toggle('open');
  overlay.classList.toggle('active');
});
overlay.addEventListener('click', () => {
  sidebarEl.classList.remove('open');
  overlay.classList.remove('active');
});

/* ---- INIT ----------------------------------------------------- */
(function init() {
  const p = new URLSearchParams(location.search);
  const chId  = Number(p.get('channel')) || 1;
  const srvIdx = Math.max(0, (Number(p.get('server')) || 1) - 1);
  const validId = channels.some(c => c.id === chId) ? chId : 1;
  activeChannelId = validId;

  const ch = channels.find(c => c.id === validId);
  channelTitleEl.textContent = `${ch.emoji} ${ch.name}`;

  renderChannels(channels);
  renderServers(validId, srvIdx);
  showLoading('Connexion au flux…');
  openServer(validId, srvIdx);
})();
