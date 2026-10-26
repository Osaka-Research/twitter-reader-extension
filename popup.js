document.getElementById('btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
    document.querySelector('p').textContent = 'Open Twitter/X first.';
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' });
  window.close();
});
