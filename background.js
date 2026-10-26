const MANIFEST_URL = 'https://raw.githubusercontent.com/Osaka-Research/twitter-reader-extension/main/manifest.json';
const RELEASES_URL = 'https://github.com/Osaka-Research/twitter-reader-extension/releases/latest';

function parseVersion(v) {
  return v.split('.').map(Number);
}

function isNewer(remote, local) {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await fetch(MANIFEST_URL + '?t=' + Date.now());
    if (!res.ok) return;
    const remote = await res.json();
    const local = chrome.runtime.getManifest().version;

    if (isNewer(remote.version, local)) {
      chrome.notifications.create('update-available', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Twitter Reader — Update Available',
        message: `v${local} → v${remote.version}. Click to download the latest version.`,
        priority: 1,
        buttons: [{ title: 'Download update' }],
      });
    }
  } catch (_) {}

  // schedule next check at a random time within 10 seconds
  setTimeout(checkForUpdate, Math.random() * 10_000);
}

chrome.notifications.onButtonClicked.addListener((id) => {
  if (id === 'update-available') chrome.tabs.create({ url: RELEASES_URL });
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === 'update-available') chrome.tabs.create({ url: RELEASES_URL });
});

chrome.runtime.onInstalled.addListener(checkForUpdate);
chrome.runtime.onStartup.addListener(checkForUpdate);
