const NetSniffer = {
  phones: new Set(),
  init() {
    chrome.webRequest.onBeforeRequest.addListener(
      det => this.req(det),
      {urls:["*://web.whatsapp.com/*","*://*.whatsapp.net/*"]},
      ["requestBody"]
    );
    chrome.webRequest.onCompleted.addListener(
      det => this.resp(det),
      {urls:["*://web.whatsapp.com/*","*://*.whatsapp.net/*"]}
    );
  },
  req(det) {
    try {
      if (det.requestBody) {
        if (det.requestBody.formData) Object.values(det.requestBody.formData).forEach(vals => vals.forEach(v => this.detect(v)));
        if (det.requestBody.raw) det.requestBody.raw.forEach(d=>{
          if(d.bytes){
            let t = new TextDecoder().decode(new Uint8Array(d.bytes));
            this.detect(t);
          }
        });
      }
      this.detect(det.url);
    }catch{}
  },
  resp(det) {
    if (this.phones.size) {
      chrome.tabs.query({active:true,currentWindow:true},tabs=>{
        if(tabs[0]){
          chrome.tabs.sendMessage(tabs[0].id,{type:'netPhones',phones:Array.from(this.phones)})
            .catch(err => {
              console.log('[NetSniffer] Não foi possível enviar phones para content script:', err.message);
            });
        }
      });
    }
  },
  detect(t) {
    if (!t) return;
    for (let m of t.matchAll(/(\d{10,15})@c\.us/g)) this.phones.add(m[1]);
    for (let m of t.matchAll(/\b\d{10,15}\b/g)) this.phones.add(m[0]);
  }
};
NetSniffer.init();

chrome.runtime.onMessage.addListener((msg,_,resp)=>{
  if(msg.action==='exportData'){
    chrome.tabs.query({active:true,currentWindow:true},async tabs=>{
      if(!tabs[0]){
        resp({success:false, error:'No active tab found'});
        return;
      }
      try{
        const res = await chrome.scripting.executeScript({
          target:{tabId:tabs[0].id},
          function:()=>({
            numbers: Array.from(window.HarvesterStore?._phones?.keys()||[]),
            valid: Array.from(window.HarvesterStore?._valid||[]),
            meta: window.HarvesterStore?._meta||{}
          })
        });
        resp({success:true, data: res[0].result});
      }catch(e){
        resp({success:false, error:e.message});
      }
    });
    return true;
  }
  if(msg.action==='clearData'){
    chrome.tabs.query({active:true,currentWindow:true},async tabs=>{
      if(!tabs[0]){
        resp({success:false, error:'No active tab found'});
        return;
      }
      try{
        await chrome.scripting.executeScript({
          target:{tabId:tabs[0].id},
          function:()=>{
            if(window.HarvesterStore){
              window.HarvesterStore._phones.clear();
              window.HarvesterStore._valid.clear();
              window.HarvesterStore._meta = {};
              localStorage.removeItem('wa_extracted_numbers');
            }
          }
        });
        resp({success:true});
      }catch(e){
        resp({success:false, error:e.message});
      }
    });
    return true;
  }
});

// ===== WORKER TAB MANAGEMENT =====

let workerTabId = null;
let campaignQueue = [];
let campaignState = {
  isRunning: false,
  isPaused: false,
  currentIndex: 0
};

// Initialize worker state on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['workerTabId', 'campaignQueue', 'campaignState'], (data) => {
    if (data.workerTabId) {
      // Check if the tab still exists
      chrome.tabs.get(data.workerTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          workerTabId = null;
          chrome.storage.local.remove('workerTabId');
        } else {
          workerTabId = data.workerTabId;
        }
      });
    }
    if (data.campaignQueue) campaignQueue = data.campaignQueue;
    if (data.campaignState) campaignState = data.campaignState;
  });
});

// Enhanced message listener for worker management
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Check if tab is worker
  if (message.action === 'CHECK_IF_WORKER') {
    sendResponse({ isWorker: sender.tab?.id === workerTabId });
    return true;
  }
  
  // Worker ready
  if (message.action === 'WORKER_READY') {
    console.log('[WHL Background] Worker tab ready');
    if (campaignState.isRunning && !campaignState.isPaused) {
      processNextInQueue();
    }
    return true;
  }
  
  // Worker status update
  if (message.action === 'WORKER_STATUS') {
    console.log('[WHL Background] Worker status:', message.status);
    notifyPopup({ action: 'WORKER_STATUS_UPDATE', status: message.status });
    return true;
  }
  
  // Worker error
  if (message.action === 'WORKER_ERROR') {
    console.error('[WHL Background] Worker error:', message.error);
    notifyPopup({ action: 'WORKER_ERROR', error: message.error });
    return true;
  }
  
  // Start campaign via worker
  if (message.action === 'START_CAMPAIGN_WORKER') {
    const { queue, config } = message;
    startCampaign(queue, config).then(sendResponse);
    return true;
  }
  
  // Pause campaign
  if (message.action === 'PAUSE_CAMPAIGN') {
    campaignState.isPaused = true;
    saveCampaignState();
    sendResponse({ success: true });
    return true;
  }
  
  // Resume campaign
  if (message.action === 'RESUME_CAMPAIGN') {
    campaignState.isPaused = false;
    saveCampaignState();
    processNextInQueue();
    sendResponse({ success: true });
    return true;
  }
  
  // Stop campaign
  if (message.action === 'STOP_CAMPAIGN') {
    campaignState.isRunning = false;
    campaignState.isPaused = false;
    saveCampaignState();
    sendResponse({ success: true });
    return true;
  }
  
  // Get campaign status
  if (message.action === 'GET_CAMPAIGN_STATUS') {
    sendResponse({
      ...campaignState,
      queue: campaignQueue,
      workerActive: workerTabId !== null
    });
    return true;
  }
});

async function startCampaign(queue, config) {
  console.log('[WHL Background] Starting campaign with', queue.length, 'contacts');
  
  campaignQueue = queue;
  campaignState = {
    isRunning: true,
    isPaused: false,
    currentIndex: 0,
    config: config
  };
  
  saveCampaignState();
  
  // Create or reuse worker tab
  await ensureWorkerTab();
  
  // Start processing
  processNextInQueue();
  
  return { success: true };
}

async function ensureWorkerTab() {
  // Check if worker tab exists and is valid
  if (workerTabId) {
    try {
      const tab = await chrome.tabs.get(workerTabId);
      if (tab && tab.url?.includes('web.whatsapp.com')) {
        console.log('[WHL Background] Reusing existing worker tab');
        return;
      }
    } catch (e) {
      workerTabId = null;
    }
  }
  
  // Create new worker tab (minimized/hidden)
  console.log('[WHL Background] Creating new worker tab...');
  
  const tab = await chrome.tabs.create({
    url: 'https://web.whatsapp.com/?whl_worker=true',
    active: false, // Don't focus on the tab
    pinned: true   // Pinned to avoid accidental closure
  });
  
  workerTabId = tab.id;
  chrome.storage.local.set({ workerTabId });
  
  // Wait for tab to load
  await new Promise((resolve) => {
    const listener = (tabId, changeInfo) => {
      if (tabId === workerTabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

async function processNextInQueue() {
  if (!campaignState.isRunning || campaignState.isPaused) {
    return;
  }
  
  if (campaignState.currentIndex >= campaignQueue.length) {
    console.log('[WHL Background] 🎉 Campaign completed!');
    campaignState.isRunning = false;
    saveCampaignState();
    notifyPopup({ action: 'CAMPAIGN_COMPLETED' });
    return;
  }
  
  const current = campaignQueue[campaignState.currentIndex];
  
  if (!current || current.status === 'sent') {
    campaignState.currentIndex++;
    saveCampaignState();
    processNextInQueue();
    return;
  }
  
  console.log(`[WHL Background] Processing ${current.phone} (${campaignState.currentIndex + 1}/${campaignQueue.length})`);
  
  // Update status to "sending"
  current.status = 'sending';
  saveCampaignState();
  notifyPopup({ action: 'CAMPAIGN_PROGRESS', current: campaignState.currentIndex, total: campaignQueue.length });
  
  try {
    // Send command to worker tab
    const result = await chrome.tabs.sendMessage(workerTabId, {
      action: 'SEND_MESSAGE_URL',
      phone: current.phone,
      text: campaignState.config?.message || '',
      imageData: campaignState.config?.imageData || null
    });
    
    if (result.success) {
      current.status = 'sent';
      console.log(`[WHL Background] ✅ Sent to ${current.phone}`);
    } else {
      current.status = 'failed';
      current.error = result.error;
      console.log(`[WHL Background] ❌ Failed to send to ${current.phone}: ${result.error}`);
    }
    
  } catch (error) {
    current.status = 'failed';
    current.error = error.message;
    console.error(`[WHL Background] ❌ Error sending to ${current.phone}:`, error);
  }
  
  // Move to next
  campaignState.currentIndex++;
  saveCampaignState();
  
  // Notify popup
  notifyPopup({ 
    action: 'SEND_RESULT', 
    phone: current.phone, 
    status: current.status,
    error: current.error 
  });
  
  // Humanized delay before next
  const minDelay = campaignState.config?.delayMin || 3000;
  const maxDelay = campaignState.config?.delayMax || 8000;
  const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
  
  console.log(`[WHL Background] Waiting ${delay}ms before next...`);
  
  setTimeout(() => {
    processNextInQueue();
  }, delay);
}

function saveCampaignState() {
  chrome.storage.local.set({
    campaignQueue,
    campaignState
  });
}

function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may be closed, ignore error
  });
}

// Cleanup when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === workerTabId) {
    console.log('[WHL Background] Worker tab was closed');
    workerTabId = null;
    chrome.storage.local.remove('workerTabId');
    
    // If campaign was running, pause it
    if (campaignState.isRunning) {
      campaignState.isPaused = true;
      saveCampaignState();
      notifyPopup({ action: 'WORKER_CLOSED' });
    }
  }
});
