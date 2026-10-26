// Service worker — relay messages, no persistent state needed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Twitter Reader & Auto-Scroller installed.');
});
