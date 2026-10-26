// Twitter Reader & Auto-Scroller — content script

const STATE_KEY = 'twitterReaderState';

let state = {
  scrolling: false,
  reading: false,
  scrollSpeed: 3,       // px per tick
  scrollInterval: null,
  speechQueue: [],
  currentUtterance: null,
  observedTweets: new Set(),
  readIndex: 0,
  allTweets: [],
};

// ─── Selectors (stable data-testid attrs Twitter uses) ─────────────────────
const SEL_TWEET      = '[data-testid="tweet"]';
const SEL_TWEET_TEXT = '[data-testid="tweetText"]';
const SEL_AUTHOR     = '[data-testid="User-Name"]';

// ─── Scroll ─────────────────────────────────────────────────────────────────

function startScroll(speed) {
  if (state.scrollInterval) return;
  state.scrolling = true;
  state.scrollSpeed = speed || state.scrollSpeed;
  state.scrollInterval = setInterval(() => {
    window.scrollBy({ top: state.scrollSpeed, behavior: 'auto' });

    // Auto-stop at bottom
    const nearBottom =
      window.innerHeight + window.scrollY >= document.body.scrollHeight - 100;
    if (nearBottom) stopScroll();
  }, 16); // ~60 fps
}

function stopScroll() {
  clearInterval(state.scrollInterval);
  state.scrollInterval = null;
  state.scrolling = false;
  broadcastStatus();
}

function setScrollSpeed(speed) {
  state.scrollSpeed = Math.max(1, Math.min(20, Number(speed)));
  if (state.scrolling) {
    stopScroll();
    startScroll(state.scrollSpeed);
  }
}

// ─── Tweet extraction ───────────────────────────────────────────────────────

function extractTweets() {
  const nodes = document.querySelectorAll(SEL_TWEET);
  const results = [];
  nodes.forEach((node) => {
    const textEl  = node.querySelector(SEL_TWEET_TEXT);
    const authEl  = node.querySelector(SEL_AUTHOR);
    const text    = textEl ? textEl.innerText.trim() : '';
    const author  = authEl ? authEl.innerText.split('\n')[0].trim() : 'Unknown';
    if (text) results.push({ author, text, el: node });
  });
  return results;
}

// ─── Text-to-speech ─────────────────────────────────────────────────────────

function startReading(options = {}) {
  if (!('speechSynthesis' in window)) {
    notify('Text-to-speech not supported in this browser.');
    return;
  }
  state.reading = true;
  state.readIndex = 0;
  speakNext(options);
}

function speakNext(options = {}) {
  if (!state.reading) return;

  const tweets = extractTweets();
  if (state.readIndex >= tweets.length) {
    // Scroll more and wait for new tweets
    window.scrollBy({ top: 600, behavior: 'smooth' });
    setTimeout(() => speakNext(options), 2000);
    return;
  }

  const tweet = tweets[state.readIndex];
  highlightTweet(tweet.el);
  scrollTweetIntoView(tweet.el);

  const msg = `Tweet by ${tweet.author}. ${tweet.text}`;
  const utter = new SpeechSynthesisUtterance(msg);
  utter.rate  = options.rate  || 1.1;
  utter.pitch = options.pitch || 1;
  utter.lang  = options.lang  || 'en-US';

  utter.onend = () => {
    unhighlightTweet(tweet.el);
    state.readIndex++;
    speakNext(options);
  };
  utter.onerror = () => {
    state.readIndex++;
    speakNext(options);
  };

  state.currentUtterance = utter;
  window.speechSynthesis.speak(utter);
  broadcastStatus();
}

function stopReading() {
  state.reading = false;
  window.speechSynthesis.cancel();
  state.currentUtterance = null;
  document.querySelectorAll('.twr-highlight').forEach(unhighlightTweet);
  broadcastStatus();
}

// ─── Highlight ──────────────────────────────────────────────────────────────

function highlightTweet(el) {
  if (!el) return;
  el.classList.add('twr-highlight');
}

function unhighlightTweet(el) {
  if (!el) return;
  el.classList.remove('twr-highlight');
}

function scrollTweetIntoView(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── Notification overlay ───────────────────────────────────────────────────

function notify(msg) {
  let box = document.getElementById('twr-notify');
  if (!box) {
    box = document.createElement('div');
    box.id = 'twr-notify';
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.style.opacity = '1';
  clearTimeout(box._timeout);
  box._timeout = setTimeout(() => { box.style.opacity = '0'; }, 3000);
}

// ─── Status broadcast to popup ──────────────────────────────────────────────

function broadcastStatus() {
  chrome.runtime.sendMessage({
    type: 'STATUS',
    scrolling: state.scrolling,
    reading: state.reading,
    scrollSpeed: state.scrollSpeed,
  }).catch(() => {});
}

// ─── Message listener (from popup) ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'START_SCROLL':
      startScroll(msg.speed);
      sendResponse({ ok: true });
      break;
    case 'STOP_SCROLL':
      stopScroll();
      sendResponse({ ok: true });
      break;
    case 'SET_SPEED':
      setScrollSpeed(msg.speed);
      sendResponse({ ok: true });
      break;
    case 'START_READ':
      startReading({ rate: msg.rate, lang: msg.lang });
      sendResponse({ ok: true });
      break;
    case 'STOP_READ':
      stopReading();
      sendResponse({ ok: true });
      break;
    case 'GET_STATUS':
      sendResponse({
        scrolling: state.scrolling,
        reading: state.reading,
        scrollSpeed: state.scrollSpeed,
        tweetCount: extractTweets().length,
      });
      break;
    case 'GET_TWEETS':
      sendResponse({
        tweets: extractTweets().map(t => ({ author: t.author, text: t.text })),
      });
      break;
    case 'SCROLL_TO_TOP':
      window.scrollTo({ top: 0, behavior: 'smooth' });
      sendResponse({ ok: true });
      break;
  }
  return true; // keep channel open for async
});
