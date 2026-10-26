'use strict';

// ─── Selectors ───────────────────────────────────────────────────────────────
const SEL_TWEET      = '[data-testid="tweet"]';
const SEL_TWEET_TEXT = '[data-testid="tweetText"]';
const SEL_AUTHOR     = '[data-testid="User-Name"]';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  scrolling: false,
  reading: false,
  scrollSpeed: 3,
  scrollInterval: null,
  readIndex: 0,
};

// ─── Floating UI ─────────────────────────────────────────────────────────────

function createOverlay() {
  if (document.getElementById('twr-host')) return;

  const host = document.createElement('div');
  host.id = 'twr-host';
  Object.assign(host.style, {
    position: 'fixed', top: '80px', right: '16px',
    zIndex: '2147483647', fontFamily: 'sans-serif',
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }

      #panel {
        width: 260px;
        background: #0f1117;
        border: 1px solid #2f3336;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,.6);
        overflow: hidden;
        user-select: none;
      }

      #titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #16181c;
        cursor: grab;
        border-bottom: 1px solid #2f3336;
      }
      #titlebar:active { cursor: grabbing; }

      .logo { color: #1d9bf0; font-size: 15px; font-weight: 800; letter-spacing: -.5px; }
      .tb-btns { display: flex; gap: 6px; }
      .tb-btn {
        background: #2f3336; border: none; color: #e7e9ea;
        width: 22px; height: 22px; border-radius: 50%;
        font-size: 11px; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
      }
      .tb-btn:hover { background: #3a3f44; }
      #btn-close { background: #e0245e; color: #fff; }
      #btn-close:hover { background: #c0183e; }

      #body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
      #body.hidden { display: none; }

      .section-label {
        font-size: 10px; font-weight: 700; color: #71767b;
        text-transform: uppercase; letter-spacing: .06em;
        margin-bottom: 6px;
      }

      .row { display: flex; align-items: center; gap: 8px; }

      input[type=range] {
        flex: 1; accent-color: #1d9bf0; height: 3px; cursor: pointer;
      }
      .val { font-size: 11px; color: #e7e9ea; width: 28px; text-align: right; }

      .btn-row { display: flex; gap: 6px; margin-top: 6px; }
      button.action {
        flex: 1; padding: 7px 6px; border: none; border-radius: 20px;
        font-size: 12px; font-weight: 700; cursor: pointer;
        transition: opacity .15s;
      }
      button.action:active { opacity: .75; }
      button.primary { background: #1d9bf0; color: #fff; }
      button.primary.on { background: #e0245e; }
      button.secondary { background: #2f3336; color: #e7e9ea; }
      button.secondary:hover { background: #3a3f44; }

      #status {
        font-size: 11px; color: #71767b; text-align: center;
        padding: 4px 0 0;
      }
      #status span { color: #1d9bf0; font-weight: 700; }
    </style>

    <div id="panel">
      <div id="titlebar">
        <span class="logo">𝕏 Reader</span>
        <div class="tb-btns">
          <button class="tb-btn" id="btn-min" title="Minimise">─</button>
          <button class="tb-btn" id="btn-close" title="Close">✕</button>
        </div>
      </div>

      <div id="body">
        <div>
          <div class="section-label">Auto-Scroll</div>
          <div class="row">
            <span style="font-size:11px;color:#71767b;width:36px">Speed</span>
            <input type="range" id="speed" min="1" max="20" value="3" />
            <span class="val" id="speed-val">3</span>
          </div>
          <div class="btn-row">
            <button class="action secondary" id="btn-top">↑ Top</button>
            <button class="action primary" id="btn-scroll">▶ Scroll</button>
          </div>
        </div>

        <div>
          <div class="section-label">Read Aloud</div>
          <div class="row">
            <span style="font-size:11px;color:#71767b;width:36px">Rate</span>
            <input type="range" id="rate" min="5" max="20" value="11" />
            <span class="val" id="rate-val">1.1×</span>
          </div>
          <div class="btn-row">
            <button class="action primary" id="btn-read">🔊 Read</button>
          </div>
        </div>

        <div id="status">Idle · <span id="tweet-count">0</span> tweets visible</div>
      </div>
    </div>
  `;

  // ── Wire up controls ───────────────────────────────────────────────────────
  const $ = (id) => shadow.getElementById(id);

  // Minimise
  let minimised = false;
  $('btn-min').addEventListener('click', () => {
    minimised = !minimised;
    $('body').classList.toggle('hidden', minimised);
    $('btn-min').textContent = minimised ? '□' : '─';
  });

  // Close
  $('btn-close').addEventListener('click', () => host.remove());

  // Speed
  $('speed').addEventListener('input', () => {
    state.scrollSpeed = Number($('speed').value);
    $('speed-val').textContent = state.scrollSpeed;
    if (state.scrolling) { stopScroll(); startScroll(); }
  });

  // Rate (just reads current value when TTS starts)
  $('rate').addEventListener('input', () => {
    $('rate-val').textContent = (Number($('rate').value) / 10).toFixed(1) + '×';
  });

  // Scroll toggle
  $('btn-scroll').addEventListener('click', () => {
    if (state.scrolling) { stopScroll(); }
    else { startScroll(); }
    syncUI(shadow);
  });

  // Read toggle
  $('btn-read').addEventListener('click', () => {
    if (state.reading) { stopReading(); }
    else { startReading({ rate: Number($('rate').value) / 10 }); }
    syncUI(shadow);
  });

  // Top
  $('btn-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // ── Drag ──────────────────────────────────────────────────────────────────
  const titlebar = $('titlebar');
  let dragging = false, ox = 0, oy = 0;

  titlebar.addEventListener('mousedown', (e) => {
    dragging = true;
    const rect = host.getBoundingClientRect();
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    host.style.left  = (e.clientX - ox) + 'px';
    host.style.top   = (e.clientY - oy) + 'px';
    host.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  // ── Tweet count ticker ────────────────────────────────────────────────────
  setInterval(() => {
    const n = document.querySelectorAll(SEL_TWEET).length;
    const el = shadow.getElementById('tweet-count');
    if (el) el.textContent = n;
  }, 2000);

  syncUI(shadow);
}

function syncUI(shadow) {
  const $ = (id) => shadow.getElementById(id);
  if (!$('btn-scroll')) return;

  $('btn-scroll').textContent = state.scrolling ? '⏹ Stop'   : '▶ Scroll';
  $('btn-scroll').classList.toggle('on', state.scrolling);
  $('btn-read').textContent   = state.reading   ? '⏹ Stop'   : '🔊 Read';
  $('btn-read').classList.toggle('on', state.reading);

  const status = $('status');
  if (status) {
    const parts = [];
    if (state.scrolling) parts.push('Scrolling');
    if (state.reading)   parts.push('Reading');
    status.innerHTML = (parts.length ? `<span>${parts.join(' + ')}</span>` : 'Idle')
      + ` · <span id="tweet-count">${document.querySelectorAll(SEL_TWEET).length}</span> tweets visible`;
  }
}

function getShadow() {
  const host = document.getElementById('twr-host');
  return host ? host.shadowRoot : null;
}

// ─── Scroll ───────────────────────────────────────────────────────────────────
function startScroll() {
  if (state.scrollInterval) return;
  state.scrolling = true;
  state.scrollInterval = setInterval(() => {
    window.scrollBy({ top: state.scrollSpeed, behavior: 'auto' });
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 100;
    if (atBottom) stopScroll();
  }, 16);
}

function stopScroll() {
  clearInterval(state.scrollInterval);
  state.scrollInterval = null;
  state.scrolling = false;
  const s = getShadow(); if (s) syncUI(s);
}

// ─── TTS ──────────────────────────────────────────────────────────────────────
function extractTweets() {
  return [...document.querySelectorAll(SEL_TWEET)].map(node => ({
    el: node,
    text:   (node.querySelector(SEL_TWEET_TEXT)  || {}).innerText?.trim() || '',
    author: (node.querySelector(SEL_AUTHOR)       || {}).innerText?.split('\n')[0]?.trim() || 'Unknown',
  })).filter(t => t.text);
}

function startReading(options = {}) {
  if (!('speechSynthesis' in window)) return;
  state.reading = true;
  state.readIndex = 0;
  speakNext(options);
}

function speakNext(options = {}) {
  if (!state.reading) return;
  const tweets = extractTweets();
  if (state.readIndex >= tweets.length) {
    window.scrollBy({ top: 600, behavior: 'smooth' });
    setTimeout(() => speakNext(options), 2000);
    return;
  }
  const tweet = tweets[state.readIndex];
  tweet.el.style.outline = '3px solid #1d9bf0';
  tweet.el.style.borderRadius = '12px';
  tweet.el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const utter = new SpeechSynthesisUtterance(`Tweet by ${tweet.author}. ${tweet.text}`);
  utter.rate = options.rate || 1.1;
  utter.onend = utter.onerror = () => {
    tweet.el.style.outline = '';
    state.readIndex++;
    speakNext(options);
  };
  window.speechSynthesis.speak(utter);
  const s = getShadow(); if (s) syncUI(s);
}

function stopReading() {
  state.reading = false;
  window.speechSynthesis.cancel();
  document.querySelectorAll(SEL_TWEET).forEach(el => { el.style.outline = ''; });
  const s = getShadow(); if (s) syncUI(s);
}

// ─── Message bridge (popup fallback) ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  switch (msg.action) {
    case 'START_SCROLL':  state.scrollSpeed = msg.speed || state.scrollSpeed; startScroll(); break;
    case 'STOP_SCROLL':   stopScroll(); break;
    case 'START_READ':    startReading({ rate: msg.rate }); break;
    case 'STOP_READ':     stopReading(); break;
    case 'SCROLL_TO_TOP': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'TOGGLE_OVERLAY':
      const host = document.getElementById('twr-host');
      if (host) host.remove(); else createOverlay();
      break;
    case 'GET_STATUS':
      sendResponse({ scrolling: state.scrolling, reading: state.reading, scrollSpeed: state.scrollSpeed });
      break;
  }
  return true;
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
createOverlay();
