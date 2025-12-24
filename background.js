// ===== STRICT MODE AND ERROR HANDLING =====
'use strict';

// ===== SISTEMA DE LOG =====
const WHL_DEBUG = false; // Background não tem acesso a localStorage
const whlLog = {
  debug: (...args) => { if (WHL_DEBUG) console.log('[WHL DEBUG]', ...args); },
  info: (...args) => { if (WHL_DEBUG) console.log('[WHL]', ...args); },
  warn: (...args) => console.warn('[WHL]', ...args),
  error: (...args) => console.error('[WHL]', ...args)
};

// Verify Chrome APIs are available
if (typeof chrome === 'undefined' || !chrome.runtime) {
    whlLog.error('[WHL Background] Chrome APIs not available');
}

// Global error handler
self.addEventListener('error', (event) => {
    whlLog.error('[WHL Background] Global error:', event.error);
});

// Unhandled promise rejection handler
self.addEventListener('unhandledrejection', (event) => {
    whlLog.error('[WHL Background] Unhandled promise rejection:', event.reason);
});

// ===== CONFIGURATION CONSTANTS =====
const SEND_MESSAGE_TIMEOUT_MS = 45000; // 45 seconds timeout for message sending

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
  
  // Start processing directly
  processNextInQueue();
  
  return { success: true };
}

// ===== ENVIO SIMPLIFICADO =====
// Usar a aba principal do WhatsApp Web ao invés de worker incógnito

async function sendMessageToWhatsApp(phone, text, imageData = null) {
    // Encontrar aba do WhatsApp Web
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    
    if (tabs.length === 0) {
        return { success: false, error: 'WhatsApp Web não está aberto' };
    }
    
    const whatsappTab = tabs[0];
    
    try {
        // Enviar mensagem para o content script
        const result = await chrome.tabs.sendMessage(whatsappTab.id, {
            action: 'SEND_MESSAGE_URL',
            phone: phone,
            text: text,
            imageData: imageData
        });
        
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Helper: timeout para evitar travas
function withTimeout(promise, ms = 45000) {
  let t;
  const timeout = new Promise((_, rej) => 
    t = setTimeout(() => rej(new Error('TIMEOUT')), ms)
  );
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

async function processNextInQueue() {
  if (!campaignState.isRunning || campaignState.isPaused) {
    return;
  }
  
  if (campaignState.currentIndex >= campaignQueue.length) {
    console.log('[WHL Background] 🎉 Campanha finalizada!');
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
  
  console.log(`[WHL Background] Processando ${current.phone} (${campaignState.currentIndex + 1}/${campaignQueue.length})`);
  
  // Update status to "sending"
  current.status = 'sending';
  saveCampaignState();
  notifyPopup({ action: 'CAMPAIGN_PROGRESS', current: campaignState.currentIndex, total: campaignQueue.length });

  let result;
  try {
    // Timeout de 45 segundos
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), SEND_MESSAGE_TIMEOUT_MS)
    );
    
    const sendPromise = sendMessageToWhatsApp(
      current.phone, 
      campaignState.config?.message || '',
      campaignState.config?.imageData || null
    );
    
    result = await Promise.race([sendPromise, timeoutPromise]);
  } catch (err) {
    result = { success: false, error: err.message };
  }
  
  // Atualizar status SEMPRE
  if (result && result.success) {
    current.status = 'sent';
    console.log(`[WHL Background] ✅ Enviado para ${current.phone}`);
  } else {
    current.status = 'failed';
    current.error = result?.error || 'Unknown error';
    console.log(`[WHL Background] ❌ Falha: ${current.phone} - ${current.error}`);
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
  
  // Delay humanizado
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
