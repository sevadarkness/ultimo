/**
 * WhatsHybrid – EXTRATOR TURBO v3
 * MODO AGRESSIVO - Extração MÁXIMA de contatos
 * 
 * Mudanças do TURBO:
 * - SEM validação de DDD (aceita qualquer número 8-15 dígitos)
 * - SEM score mínimo (coleta TODOS os números encontrados)
 * - MAIS scroll (100+ iterações)
 * - MAIS fontes (IndexedDB, sessionStorage, todos localStorage, DOM completo)
 * - Retorna TODOS os números (usuário filtra depois se quiser)
 * 
 * Comunicação via window.postMessage
 */

(function () {
  if (window.__WHL_EXTRACTOR_TURBO_LOADED__) return;
  window.__WHL_EXTRACTOR_TURBO_LOADED__ = true;

  console.log('[WHL] 🚀 EXTRATOR TURBO v3 iniciando...');

  // ===== CONFIGURAÇÃO TURBO =====
  const TURBO_CONFIG = {
    // Scroll agressivo
    maxScrolls: 150,           // Antes era 25, agora 150
    scrollDelay: 400,          // Mais rápido (antes 1100ms)
    scrollIncrement: 0.85,     // Scroll maior por vez
    stabilityCount: 10,        // Mais tentativas antes de parar
    
    // Extração agressiva
    minDigits: 8,              // Mínimo de dígitos
    maxDigits: 15,             // Máximo de dígitos
    
    // Debug
    debug: true
  };

  // ===== ARMAZENAMENTO SIMPLES =====
  const PhoneStore = {
    _all: new Set(),      // TODOS os números encontrados
    _sources: new Map(),  // número -> Set de fontes
    
    add(num, source = 'unknown') {
      if (!num) return null;
      
      // Limpar número (só dígitos)
      let n = String(num).replace(/\D/g, '');
      
      // Validar tamanho básico
      if (n.length < TURBO_CONFIG.minDigits || n.length > TURBO_CONFIG.maxDigits) {
        return null;
      }
      
      // Adicionar aos encontrados
      this._all.add(n);
      
      // Registrar fonte
      if (!this._sources.has(n)) {
        this._sources.set(n, new Set());
      }
      this._sources.get(n).add(source);
      
      return n;
    },
    
    getAll() {
      return Array.from(this._all).sort();
    },
    
    getStats() {
      const sources = {};
      this._sources.forEach((srcs, num) => {
        srcs.forEach(s => {
          sources[s] = (sources[s] || 0) + 1;
        });
      });
      return { total: this._all.size, sources };
    },
    
    clear() {
      this._all.clear();
      this._sources.clear();
    }
  };

  // Expor para debug
  window.PhoneStore = PhoneStore;

  // ===== PADRÕES DE EXTRAÇÃO =====
  const PATTERNS = {
    // Padrão WhatsApp (mais confiável)
    WHATSAPP_ID: /(\d{8,15})@[cgs]\.us/g,
    
    // Números brasileiros formatados
    BR_FORMATTED: /(?:\+?55)?[\s\-\.]?\(?(\d{2})\)?[\s\-\.]?(\d{4,5})[\s\-\.]?(\d{4})/g,
    
    // Números genéricos (8-15 dígitos)
    RAW_NUMBERS: /\b(\d{8,15})\b/g,
    
    // Links WhatsApp
    WA_LINKS: /wa\.me\/(\d{8,15})/g,
    SEND_LINKS: /phone=(\d{8,15})/g
  };

  // ===== FUNÇÕES DE EXTRAÇÃO =====
  
  function extractFromText(text, source) {
    if (!text || typeof text !== 'string') return 0;
    let count = 0;
    
    // Padrão WhatsApp ID (PRIORIDADE MÁXIMA)
    let match;
    const waIdRe = new RegExp(PATTERNS.WHATSAPP_ID.source, 'g');
    while ((match = waIdRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], source + '_waid')) count++;
    }
    
    // Links wa.me
    const waMeRe = new RegExp(PATTERNS.WA_LINKS.source, 'g');
    while ((match = waMeRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], source + '_wame')) count++;
    }
    
    // Links phone=
    const phoneRe = new RegExp(PATTERNS.SEND_LINKS.source, 'g');
    while ((match = phoneRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], source + '_phone')) count++;
    }
    
    // Números raw (genéricos)
    const rawRe = new RegExp(PATTERNS.RAW_NUMBERS.source, 'g');
    while ((match = rawRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], source + '_raw')) count++;
    }
    
    return count;
  }

  function extractFromElement(el, source) {
    if (!el) return 0;
    let count = 0;
    
    // Atributos importantes
    const attrs = [
      'data-id', 'data-jid', 'data-testid',
      'href', 'title', 'aria-label',
      'data-link', 'data-phone', 'data-contact',
      'id', 'name', 'value', 'placeholder'
    ];
    
    attrs.forEach(attr => {
      try {
        const val = el.getAttribute?.(attr);
        if (val) count += extractFromText(val, source + '_attr_' + attr);
      } catch {}
    });
    
    // Texto do elemento
    try {
      if (el.textContent) {
        count += extractFromText(el.textContent, source + '_text');
      }
    } catch {}
    
    // Valor (para inputs)
    try {
      if (el.value) {
        count += extractFromText(el.value, source + '_value');
      }
    } catch {}
    
    return count;
  }

  function extractFromDOM(source = 'dom') {
    let count = 0;
    
    // 1. Elementos com data-id (FONTE PRINCIPAL)
    document.querySelectorAll('[data-id]').forEach(el => {
      count += extractFromElement(el, source + '_dataid');
    });
    
    // 2. Elementos com data-jid
    document.querySelectorAll('[data-jid]').forEach(el => {
      count += extractFromElement(el, source + '_datajid');
    });
    
    // 3. Células de chat
    document.querySelectorAll('[data-testid*="cell"], [data-testid*="chat"], [data-testid*="contact"]').forEach(el => {
      count += extractFromElement(el, source + '_cell');
    });
    
    // 4. Linhas e itens de lista
    document.querySelectorAll('[role="row"], [role="listitem"], [role="gridcell"]').forEach(el => {
      count += extractFromElement(el, source + '_row');
    });
    
    // 5. Links
    document.querySelectorAll('a[href]').forEach(el => {
      count += extractFromElement(el, source + '_link');
    });
    
    // 6. Spans com título
    document.querySelectorAll('span[title], div[title]').forEach(el => {
      count += extractFromElement(el, source + '_title');
    });
    
    // 7. Elementos com aria-label
    document.querySelectorAll('[aria-label]').forEach(el => {
      count += extractFromElement(el, source + '_aria');
    });
    
    // 8. TURBO: Varrer TODOS os elementos do pane-side
    const pane = document.querySelector('#pane-side');
    if (pane) {
      pane.querySelectorAll('*').forEach(el => {
        count += extractFromElement(el, source + '_pane');
      });
    }
    
    // 9. TURBO: Varrer body inteiro (agressivo)
    document.querySelectorAll('div, span, p, a, button, input, textarea').forEach(el => {
      count += extractFromElement(el, source + '_body');
    });
    
    return count;
  }

  function extractFromStorage(source = 'storage') {
    let count = 0;
    
    // localStorage - TUDO
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        if (value) {
          count += extractFromText(key, source + '_ls_key');
          count += extractFromText(value, source + '_ls_val');
        }
      }
      console.log('[WHL] localStorage extraído:', count);
    } catch (e) {
      console.log('[WHL] Erro localStorage:', e);
    }
    
    // sessionStorage - TUDO
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        if (value) {
          count += extractFromText(key, source + '_ss_key');
          count += extractFromText(value, source + '_ss_val');
        }
      }
      console.log('[WHL] sessionStorage extraído');
    } catch (e) {}
    
    return count;
  }

  async function extractFromIndexedDB(source = 'idb') {
    let count = 0;
    
    try {
      const databases = await indexedDB.databases?.() || [];
      
      for (const dbInfo of databases) {
        try {
          const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(dbInfo.name);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          
          const storeNames = Array.from(db.objectStoreNames);
          
          for (const storeName of storeNames) {
            try {
              const tx = db.transaction(storeName, 'readonly');
              const store = tx.objectStore(storeName);
              
              const allData = await new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
              });
              
              if (Array.isArray(allData)) {
                allData.forEach(item => {
                  const str = JSON.stringify(item);
                  count += extractFromText(str, source + '_' + storeName);
                });
              }
            } catch {}
          }
          
          db.close();
        } catch {}
      }
      
      console.log('[WHL] IndexedDB extraído:', count);
    } catch (e) {
      console.log('[WHL] Erro IndexedDB:', e);
    }
    
    return count;
  }

  // ===== SCROLL TURBO =====
  
  async function turboScroll() {
    const pane = document.querySelector('#pane-side');
    if (!pane) {
      console.log('[WHL] ⚠️ #pane-side não encontrado');
      return;
    }
    
    console.log('[WHL] 📜 Iniciando TURBO scroll...');
    
    // Ir para o topo
    pane.scrollTop = 0;
    await new Promise(r => setTimeout(r, 500));
    
    let lastTop = -1;
    let stable = 0;
    let scrollCount = 0;
    
    while (stable < TURBO_CONFIG.stabilityCount && scrollCount < TURBO_CONFIG.maxScrolls) {
      // Extrair durante scroll
      extractFromDOM('scroll_' + scrollCount);
      
      // Scroll
      const increment = Math.floor(pane.clientHeight * TURBO_CONFIG.scrollIncrement);
      pane.scrollTop = Math.min(pane.scrollTop + increment, pane.scrollHeight);
      pane.dispatchEvent(new Event('scroll', { bubbles: true }));
      
      scrollCount++;
      
      // Progresso
      const progress = Math.min(80, 10 + Math.round((scrollCount / TURBO_CONFIG.maxScrolls) * 70));
      window.postMessage({
        type: 'WHL_EXTRACT_PROGRESS',
        progress,
        count: PhoneStore._all.size
      }, '*');
      
      await new Promise(r => setTimeout(r, TURBO_CONFIG.scrollDelay));
      
      // Verificar estabilidade
      if (Math.abs(pane.scrollTop - lastTop) < 5) {
        stable++;
      } else {
        stable = 0;
      }
      lastTop = pane.scrollTop;
      
      if (scrollCount % 20 === 0) {
        console.log(`[WHL] Scroll ${scrollCount}/${TURBO_CONFIG.maxScrolls}, encontrados: ${PhoneStore._all.size}`);
      }
    }
    
    // Voltar ao topo
    pane.scrollTop = 0;
    await new Promise(r => setTimeout(r, 500));
    
    // Extração final
    extractFromDOM('scroll_final');
    
    console.log(`[WHL] ✅ TURBO scroll concluído: ${scrollCount} scrolls, ${PhoneStore._all.size} números`);
  }

  // ===== HOOKS DE REDE =====
  
  function installNetworkHooks() {
    // Hook fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const clone = response.clone();
        const text = await clone.text().catch(() => '');
        extractFromText(text, 'fetch');
      } catch {}
      return response;
    };
    
    // Hook XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(...args) {
      this._url = args[1];
      return originalOpen.apply(this, args);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('load', function() {
        try {
          if (this.responseText) {
            extractFromText(this.responseText, 'xhr');
          }
        } catch {}
      });
      return originalSend.apply(this, args);
    };
    
    // Hook WebSocket
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
      const ws = new OriginalWebSocket(...args);
      ws.addEventListener('message', function(e) {
        try {
          if (e.data && typeof e.data === 'string') {
            extractFromText(e.data, 'ws');
          }
        } catch {}
      });
      return ws;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    
    console.log('[WHL] 🔌 Network hooks instalados');
  }

  // ===== FUNÇÃO PRINCIPAL =====
  
  async function extractAllTurbo() {
    console.log('[WHL] 🚀🚀🚀 EXTRAÇÃO TURBO INICIADA 🚀🚀🚀');
    
    // Limpar
    PhoneStore.clear();
    
    window.postMessage({
      type: 'WHL_EXTRACT_PROGRESS',
      progress: 5,
      count: 0
    }, '*');
    
    // Instalar hooks de rede
    installNetworkHooks();
    
    // Fase 1: DOM inicial
    console.log('[WHL] 📱 Fase 1: Extração DOM inicial...');
    extractFromDOM('initial');
    
    window.postMessage({
      type: 'WHL_EXTRACT_PROGRESS',
      progress: 10,
      count: PhoneStore._all.size
    }, '*');
    
    // Fase 2: Storage
    console.log('[WHL] 💾 Fase 2: Extração de Storage...');
    extractFromStorage('storage');
    
    // Fase 3: IndexedDB
    console.log('[WHL] 🗄️ Fase 3: Extração IndexedDB...');
    await extractFromIndexedDB('idb');
    
    window.postMessage({
      type: 'WHL_EXTRACT_PROGRESS',
      progress: 15,
      count: PhoneStore._all.size
    }, '*');
    
    // Fase 4: TURBO Scroll
    console.log('[WHL] 📜 Fase 4: TURBO Scroll...');
    await turboScroll();
    
    // Fase 5: Extração final
    console.log('[WHL] 🔍 Fase 5: Extração final...');
    extractFromDOM('final');
    extractFromStorage('final_storage');
    
    // Aguardar hooks de rede
    console.log('[WHL] ⏳ Aguardando dados de rede...');
    await new Promise(r => setTimeout(r, 3000));
    
    // Extração pós-rede
    extractFromDOM('post_network');
    
    window.postMessage({
      type: 'WHL_EXTRACT_PROGRESS',
      progress: 100,
      count: PhoneStore._all.size
    }, '*');
    
    // Resultados
    const numbers = PhoneStore.getAll();
    const stats = PhoneStore.getStats();
    
    console.log('[WHL] ✅✅✅ EXTRAÇÃO TURBO CONCLUÍDA ✅✅✅');
    console.log('[WHL] Total de números:', numbers.length);
    console.log('[WHL] Estatísticas:', stats);
    
    // Salvar no localStorage
    try {
      localStorage.setItem('whl_turbo_numbers', JSON.stringify(numbers));
      localStorage.setItem('whl_turbo_stats', JSON.stringify(stats));
    } catch {}
    
    return numbers;
  }

  // ===== LISTENER DE MENSAGENS =====
  
  window.addEventListener('message', async (ev) => {
    if (!ev?.data?.type) return;
    
    if (ev.data.type === 'WHL_EXTRACT_CONTACTS') {
      try {
        const numbers = await extractAllTurbo();
        window.postMessage({ 
          type: 'WHL_EXTRACT_RESULT', 
          numbers: numbers 
        }, '*');
      } catch (e) {
        console.error('[WHL] Erro na extração TURBO:', e);
        window.postMessage({ 
          type: 'WHL_EXTRACT_ERROR', 
          error: String(e) 
        }, '*');
      }
    }
  });

  // ===== EXPOR PARA DEBUG =====
  window.__WHL_TURBO__ = {
    extract: extractAllTurbo,
    store: PhoneStore,
    config: TURBO_CONFIG,
    extractDOM: extractFromDOM,
    extractStorage: extractFromStorage,
    extractIDB: extractFromIndexedDB
  };

  console.log('[WHL] ✅ EXTRATOR TURBO v3 carregado!');
  console.log('[WHL] Config:', TURBO_CONFIG);
  console.log('[WHL] Debug: window.__WHL_TURBO__');
})();
