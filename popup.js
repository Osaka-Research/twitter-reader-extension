'use strict';

// ─── Elements ────────────────────────────────────────────────────────────────
const dot        = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const tweetCount = document.getElementById('tweet-count');
const speedSlider= document.getElementById('speed-slider');
const speedVal   = document.getElementById('speed-val');
const rateSlider = document.getElementById('rate-slider');
const rateVal    = document.getElementById('rate-val');
const btnScroll  = document.getElementById('btn-scroll');
const btnRead    = document.getElementById('btn-read');
const btnTop     = document.getElementById('btn-scroll-top');
const btnRefresh = document.getElementById('btn-refresh');
const tweetList  = document.getElementById('tweet-list');
const noTweets   = document.getElementById('no-tweets');

let isScrolling = false;
let isReading   = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isTwitterTab(tab) {
  return tab && tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'));
}

async function sendToContent(action, extra = {}) {
  const tab = await getActiveTab();
  if (!isTwitterTab(tab)) {
    updateStatus('idle', 'Open Twitter/X first');
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, { action, ...extra });
  } catch {
    updateStatus('idle', 'Reload the Twitter/X tab');
    return null;
  }
}

function updateStatus(mode, text) {
  dot.className = `dot ${mode}`;
  statusText.textContent = text;
}

function syncUI() {
  if (isScrolling && isReading) {
    updateStatus('both', 'Scrolling + Reading');
  } else if (isScrolling) {
    updateStatus('scroll', 'Scrolling…');
  } else if (isReading) {
    updateStatus('reading', 'Reading aloud…');
  } else {
    updateStatus('idle', 'Idle');
  }

  btnScroll.textContent = isScrolling ? '⏹ Stop Scroll' : '▶ Start Scroll';
  btnScroll.classList.toggle('active', isScrolling);
  btnRead.textContent   = isReading   ? '⏹ Stop Reading' : '🔊 Start Reading';
  btnRead.classList.toggle('active', isReading);
}

// ─── Render tweet list ────────────────────────────────────────────────────────

function renderTweets(tweets) {
  tweetList.innerHTML = '';
  tweetCount.textContent = `${tweets.length} tweet${tweets.length !== 1 ? 's' : ''}`;

  if (!tweets.length) {
    noTweets.style.display = 'block';
    return;
  }
  noTweets.style.display = 'none';

  tweets.forEach(({ author, text }) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="tweet-author">@${author}</div>
      <div class="tweet-text">${escapeHtml(text)}</div>
    `;
    tweetList.appendChild(li);
  });
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function refreshTweets() {
  const res = await sendToContent('GET_TWEETS');
  if (res) renderTweets(res.tweets);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

speedSlider.addEventListener('input', () => {
  speedVal.textContent = speedSlider.value;
  sendToContent('SET_SPEED', { speed: Number(speedSlider.value) });
});

rateSlider.addEventListener('input', () => {
  rateVal.textContent = (rateSlider.value / 10).toFixed(1) + '×';
});

btnScroll.addEventListener('click', async () => {
  if (isScrolling) {
    await sendToContent('STOP_SCROLL');
    isScrolling = false;
  } else {
    await sendToContent('START_SCROLL', { speed: Number(speedSlider.value) });
    isScrolling = true;
  }
  syncUI();
});

btnRead.addEventListener('click', async () => {
  if (isReading) {
    await sendToContent('STOP_READ');
    isReading = false;
  } else {
    const rate = Number(rateSlider.value) / 10;
    await sendToContent('START_READ', { rate });
    isReading = true;
  }
  syncUI();
});

btnTop.addEventListener('click', () => sendToContent('SCROLL_TO_TOP'));

btnRefresh.addEventListener('click', refreshTweets);

// ─── Status messages from content script ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS') {
    isScrolling = msg.scrolling;
    isReading   = msg.reading;
    if (msg.scrollSpeed !== undefined) {
      speedSlider.value = msg.scrollSpeed;
      speedVal.textContent = msg.scrollSpeed;
    }
    syncUI();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  const tab = await getActiveTab();
  if (!isTwitterTab(tab)) {
    updateStatus('idle', 'Open Twitter/X first');
    noTweets.style.display = 'block';
    return;
  }

  const res = await sendToContent('GET_STATUS');
  if (res) {
    isScrolling = res.scrolling;
    isReading   = res.reading;
    speedSlider.value = res.scrollSpeed;
    speedVal.textContent = res.scrollSpeed;
    syncUI();
    renderTweets([]);
  }

  refreshTweets();
})();
