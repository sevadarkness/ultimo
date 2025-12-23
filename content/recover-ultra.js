/**
 * WhatsHybrid Lite - RECOVER ULTRA++ (Anti-Revoke)
 * Recupera mensagens apagadas (texto, imagem, áudio, vídeo)
 */

(function() {
  'use strict';
  
  if (window.__WHL_RECOVER_ULTRA__) return;
  window.__WHL_RECOVER_ULTRA__ = true;

  console.log('[RECOVER ULTRA++] Inicializando...');

  // ===== CONFIGURAÇÃO =====
  const DB_NAME = 'wa_recover_ultra';
  const DB_VERSION = 2;
  const STORE_MSG = 'messages';
  const STORE_MEDIA = 'media';

  const REVOKE_TEXTS = [
    'mensagem foi apagada',
    'message was deleted',
    'revoked',
    'você apagou esta mensagem',
    'you deleted this message',
    'esta mensagem foi apagada',
    'this message was deleted'
  ];

  let recoverDB = null;
  let isEnabled = true;
  let messagesSaved = 0;
  let messagesRecovered = 0;
  let storeHooked = false;

  // ===== INDEXEDDB =====
  async function openRecoverDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        
        if (!db.objectStoreNames.contains(STORE_MSG)) {
          const msgStore = db.createObjectStore(STORE_MSG, { keyPath: 'id' });
          msgStore.createIndex('chatId', 'chatId', { unique: false });
          msgStore.createIndex('timestamp', 't', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        }
      };

      req.onsuccess = e => {
        recoverDB = e.target.result;
        console.log('[RECOVER ULTRA++] IndexedDB aberto');
        resolve(recoverDB);
      };
      
      req.onerror = () => {
        console.error('[RECOVER ULTRA++] Erro ao abrir IndexedDB:', req.error);
        reject(req.error);
      };
    });
  }

  function saveMessage(data) {
    if (!recoverDB || !isEnabled) return;
    try {
      const tx = recoverDB.transaction(STORE_MSG, 'readwrite');
      tx.objectStore(STORE_MSG).put(data);
      messagesSaved++;
      updateStats();
    } catch (e) {
      console.error('[RECOVER ULTRA++] Erro ao salvar mensagem:', e);
    }
  }

  function saveMedia(data) {
    if (!recoverDB || !isEnabled) return;
    try {
      const tx = recoverDB.transaction(STORE_MEDIA, 'readwrite');
      tx.objectStore(STORE_MEDIA).put(data);
    } catch (e) {
      console.error('[RECOVER ULTRA++] Erro ao salvar mídia:', e);
    }
  }

  async function getMessage(id) {
    return new Promise(resolve => {
      if (!recoverDB) return resolve(null);
      try {
        const tx = recoverDB.transaction(STORE_MSG, 'readonly');
        const req = tx.objectStore(STORE_MSG).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function getMedia(id) {
    return new Promise(resolve => {
      if (!recoverDB) return resolve(null);
      try {
        const tx = recoverDB.transaction(STORE_MEDIA, 'readonly');
        const req = tx.objectStore(STORE_MEDIA).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function getAllMessages() {
    return new Promise(resolve => {
      if (!recoverDB) return resolve([]);
      try {
        const tx = recoverDB.transaction(STORE_MSG, 'readonly');
        const req = tx.objectStore(STORE_MSG).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function clearAllData() {
    return new Promise(async resolve => {
      if (!recoverDB) return resolve();
      try {
        const tx = recoverDB.transaction([STORE_MSG, STORE_MEDIA], 'readwrite');
        tx.objectStore(STORE_MSG).clear();
        tx.objectStore(STORE_MEDIA).clear();
        tx.oncomplete = () => {
          messagesSaved = 0;
          messagesRecovered = 0;
          updateStats();
          resolve();
        };
      } catch (e) {
        console.error('[RECOVER ULTRA++] Erro ao limpar dados:', e);
        resolve();
      }
    });
  }

  // ===== WAIT FOR WHATSAPP TO LOAD =====
  function waitForWA() {
    return new Promise(resolve => {
      // Wait for WHL_Store from bridge (not window.Store directly due to CSP)
      if (window.WHL_Store) return resolve();
      
      // Listen for bridge ready event
      const handleBridgeReady = () => {
        window.removeEventListener('WHL_STORE_READY', handleBridgeReady);
        resolve();
      };
      window.addEventListener('WHL_STORE_READY', handleBridgeReady);
      
      // Fallback timeout
      setTimeout(resolve, 10000);
    });
  }

  // ===== INIT STORE =====
  function initStore() {
    // Store is initialized by store-bridge.js
    // Just check if WHL_Store is available
    return !!window.WHL_Store;
  }

  // ===== HOOK STORE.MSG =====
  function hookStoreMsg() {
    if (!window.WHL_Store?.Msg) return false;
    if (storeHooked) return true;

    try {
      window.WHL_Store.Msg.on('add', msg => {
        if (!isEnabled) return;
        
        try {
          const id = msg.id?._serialized || msg.id?.toString();
          const chatId = msg.chat?.id?._serialized || msg.chatId?._serialized;

          if (!id) return;

          // Save text message
          if (msg.body) {
            saveMessage({
              id: id,
              chatId: chatId,
              body: msg.body,
              fromMe: msg.id?.fromMe || false,
              t: msg.t || Date.now() / 1000,
              type: msg.type || 'chat',
              timestamp: new Date().toISOString()
            });
          }

          // Save media
          if (msg.mediaData?.mediaBlob) {
            saveMedia({
              id: id,
              chatId: chatId,
              blob: msg.mediaData.mediaBlob,
              mimetype: msg.mediaData.mimetype || 'application/octet-stream',
              filename: msg.mediaData.filename || 'media'
            });
          }
        } catch (e) {
          console.warn('[RECOVER ULTRA++] Erro ao processar mensagem:', e);
        }
      });

      storeHooked = true;
      console.log('[RECOVER ULTRA++] Store.Msg hooked!');
      return true;
    } catch (e) {
      console.error('[RECOVER ULTRA++] Erro ao fazer hook em Store.Msg:', e);
      return false;
    }
  }

  // ===== DETECT REVOKED MESSAGES =====
  function isRevoked(text = '') {
    const t = text.toLowerCase();
    return REVOKE_TEXTS.some(r => t.includes(r));
  }

  async function restoreMessage(node) {
    if (!isEnabled) return;
    
    try {
      const wrap = node.closest('[data-id]');
      if (!wrap) return;

      const id = wrap.getAttribute('data-id');
      if (!id || wrap.querySelector('[data-recovered]')) return;

      const msg = await getMessage(id);
      const media = await getMedia(id);

      if (!msg && !media) return;

      const box = document.createElement('div');
      box.dataset.recovered = '1';
      box.style.cssText = 'margin-top:6px;border-left:3px solid #ff0066;padding:8px;background:rgba(255,0,102,.08);border-radius:6px';

      const badge = document.createElement('div');
      badge.innerText = '🔄 MENSAGEM RECUPERADA';
      badge.style.cssText = 'font-size:10px;color:#ff0066;font-weight:bold;margin-bottom:4px';
      box.appendChild(badge);

      if (msg?.body) {
        const t = document.createElement('div');
        t.innerText = msg.body;
        t.style.cssText = 'font-style:italic;color:#333;padding:4px 0';
        box.appendChild(t);
      }

      if (media?.blob) {
        const url = URL.createObjectURL(media.blob);
        
        if (media.mimetype?.startsWith('image')) {
          const img = document.createElement('img');
          img.src = url;
          img.style.cssText = 'max-width:220px;border-radius:4px;margin-top:4px';
          box.appendChild(img);
        }
        
        if (media.mimetype?.startsWith('audio')) {
          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = url;
          audio.style.cssText = 'width:100%;margin-top:4px';
          box.appendChild(audio);
        }
        
        if (media.mimetype?.startsWith('video')) {
          const video = document.createElement('video');
          video.controls = true;
          video.src = url;
          video.style.cssText = 'max-width:220px;border-radius:4px;margin-top:4px';
          box.appendChild(video);
        }
      }

      wrap.appendChild(box);
      messagesRecovered++;
      updateStats();
      addToHistory(msg, media);
      
    } catch (e) {
      console.error('[RECOVER ULTRA++] Erro ao restaurar mensagem:', e);
    }
  }

  // ===== OBSERVER FOR REVOKED MESSAGES =====
  const recoverObserver = new MutationObserver(muts => {
    muts.forEach(m =>
      m.addedNodes.forEach(n => {
        if (n instanceof HTMLElement && isRevoked(n.innerText)) {
          restoreMessage(n);
        }
      })
    );
  });

  // ===== UPDATE STATS =====
  function updateStats() {
    const statusEl = document.getElementById('whlRecoverStatus');
    const countEl = document.getElementById('whlRecoverCount');
    const recoveredEl = document.getElementById('whlRecoveredCount');
    
    if (statusEl) statusEl.textContent = isEnabled ? '🟢 Ativo' : '🔴 Desativado';
    if (countEl) countEl.textContent = messagesSaved;
    if (recoveredEl) recoveredEl.textContent = messagesRecovered;
  }

  // ===== ADD TO HISTORY =====
  function addToHistory(msg, media) {
    const historyEl = document.getElementById('whlRecoverHistory');
    if (!historyEl) return;
    
    // Remove "nenhuma mensagem" message
    const emptyMsg = historyEl.querySelector('.muted');
    if (emptyMsg) emptyMsg.remove();
    
    const item = document.createElement('div');
    item.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.1);padding:8px 0;font-size:12px';
    
    const timestamp = new Date(msg?.timestamp || Date.now()).toLocaleString('pt-BR');
    const header = document.createElement('div');
    header.style.cssText = 'color:#ff0066;font-weight:bold;margin-bottom:4px';
    header.textContent = `🔄 ${timestamp}`;
    item.appendChild(header);
    
    if (msg?.body) {
      const body = document.createElement('div');
      body.style.cssText = 'color:#fff;opacity:0.9';
      body.textContent = msg.body.substring(0, 100) + (msg.body.length > 100 ? '...' : '');
      item.appendChild(body);
    }
    
    if (media?.mimetype) {
      const mediaType = document.createElement('div');
      mediaType.style.cssText = 'color:#888;font-size:11px;margin-top:4px';
      mediaType.textContent = `📎 ${media.mimetype.split('/')[0]}`;
      item.appendChild(mediaType);
    }
    
    historyEl.insertBefore(item, historyEl.firstChild);
    
    // Limitar histórico a 50 itens
    while (historyEl.children.length > 50) {
      historyEl.removeChild(historyEl.lastChild);
    }
  }

  // ===== EXPORT FUNCTIONS =====
  async function exportRecovered() {
    const messages = await getAllMessages();
    const data = {
      exported: new Date().toISOString(),
      total: messages.length,
      messages: messages
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recovered_messages_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== INIT =====
  async function init() {
    try {
      await openRecoverDB();
      
      // Wait for WhatsApp to load
      await waitForWA();
      
      // Try to init Store
      initStore();
      
      // Try to hook Store.Msg
      if (!hookStoreMsg()) {
        // Retry every second
        const hookInterval = setInterval(() => {
          if (hookStoreMsg()) {
            clearInterval(hookInterval);
          }
        }, 1000);
        
        // Stop trying after 30 seconds
        setTimeout(() => clearInterval(hookInterval), 30000);
      }
      
      // Start observer
      recoverObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      updateStats();
      
      console.log('[RECOVER ULTRA++] ✅ Pronto!');
      
    } catch (e) {
      console.error('[RECOVER ULTRA++] Erro na inicialização:', e);
    }
  }

  // ===== EVENT LISTENERS =====
  window.addEventListener('message', async (e) => {
    if (!e?.data?.type) return;
    
    if (e.data.type === 'WHL_RECOVER_ENABLE') {
      isEnabled = true;
      updateStats();
      console.log('[RECOVER ULTRA++] ✅ Ativado');
    }
    
    if (e.data.type === 'WHL_RECOVER_DISABLE') {
      isEnabled = false;
      updateStats();
      console.log('[RECOVER ULTRA++] ❌ Desativado');
    }
    
    if (e.data.type === 'WHL_RECOVER_EXPORT') {
      await exportRecovered();
    }
    
    if (e.data.type === 'WHL_RECOVER_CLEAR') {
      await clearAllData();
      const historyEl = document.getElementById('whlRecoverHistory');
      if (historyEl) {
        historyEl.innerHTML = '<div class="muted">Nenhuma mensagem recuperada ainda...</div>';
      }
      console.log('[RECOVER ULTRA++] 🗑️ Histórico limpo');
    }
  });

  // Start initialization
  init();

  // Expose API
  window.__WHL_RECOVER_API__ = {
    enable: () => { isEnabled = true; updateStats(); },
    disable: () => { isEnabled = false; updateStats(); },
    export: exportRecovered,
    clear: clearAllData,
    getStats: () => ({ saved: messagesSaved, recovered: messagesRecovered, enabled: isEnabled })
  };

})();
