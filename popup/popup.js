
document.getElementById('toggle').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://web.whatsapp.com/')) {
    // open WA web if not active
    await chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { type: 'WHL_TOGGLE_PANEL' }).catch(()=>{});
};
