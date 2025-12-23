/**
 * WhatsHybrid – EXTRATOR TURBO v4 com FILTRO INTELIGENTE
 * 
 * ESTRATÉGIA:
 * 1. Coleta AGRESSIVA (máximo de números possível)
 * 2. Filtro INTELIGENTE (só retorna números confiáveis)
 * 
 * NÍVEIS DE CONFIANÇA:
 * - ALTA (100%): @c.us, data-id, data-jid → SEMPRE inclui
 * - MÉDIA (80%): wa.me/, phone=, título → Inclui se DDD válido
 * - BAIXA (30%): Texto raw → Só inclui se aparecer 2+ vezes E DDD válido
 * 
 * Comunicação via window.postMessage
 */

(function () {
  if (window.__WHL_EXTRACTOR_TURBO_V4__) return;
  window.__WHL_EXTRACTOR_TURBO_V4__ = true;

  console.log('[WHL] 🚀 EXTRATOR TURBO v4 com Filtro Inteligente iniciando...');

  // ===== CONFIGURAÇÃO =====
  const CONFIG = {
    // Scroll
    maxScrolls: 150,
    scrollDelay: 400,
    scrollIncrement: 0.85,
    stabilityCount: 10,
    
    // Números
    minDigits: 10,  // Mínimo para telefone brasileiro (DDD + número)
    maxDigits: 15,  // Máximo (código país + DDD + número)
    
    // Filtro
    minOccurrencesForRaw: 2,  // Números raw precisam aparecer 2+ vezes
    
    debug: true
  };

  // ===== DDDs BRASILEIROS VÁLIDOS =====
  const VALID_DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
    21, 22, 24, 27, 28, // RJ/ES
    31, 32, 33, 34, 35, 37, 38, // MG
    41, 42, 43, 44, 45, 46, // PR
    47, 48, 49, // SC
    51, 53, 54, 55, // RS
    61, 62, 63, 64, 65, 66, 67, 68, 69, // DF/GO/TO/MT/MS/AC/RO
    71, 73, 74, 75, 77, 79, // BA/SE
    81, 82, 83, 84, 85, 86, 87, 88, 89, // PE/AL/PB/RN/CE/PI
    91, 92, 93, 94, 95, 96, 97, 98, 99  // PA/AM/RR/AP/MA
  ]);

  // ===== NÍVEIS DE CONFIANÇA =====
  const CONFIDENCE = {
    HIGH: 'high',     // @c.us, data-id, data-jid
    MEDIUM: 'medium', // wa.me, phone=, title
    LOW: 'low'        // raw text
  };

  // ===== ARMAZENAMENTO =====
  const PhoneStore = {
    _phones: new Map(), // número -> { sources: Set, confidence: string, occurrences: number }
    
    add(num, source, confidence = CONFIDENCE.LOW) {
      if (!num) return null;
      
      // Limpar e normalizar
      let n = String(num).replace(/\D/g, '');
      
      // Validar tamanho
      if (n.length < CONFIG.minDigits || n.length > CONFIG.maxDigits) {
        return null;
      }
      
      // Normalizar para formato brasileiro (adicionar 55 se necessário)
      if (n.length === 10 || n.length === 11) {
        n = '55' + n;
      }
      
      // Criar ou atualizar registro
      if (!this._phones.has(n)) {
        this._phones.set(n, {
          sources: new Set(),
          confidence: confidence,
          occurrences: 0
        });
      }
      
      const record = this._phones.get(n);
      record.sources.add(source);
      record.occurrences++;
      
      // Upgrade de confiança (HIGH > MEDIUM > LOW)
      if (confidence === CONFIDENCE.HIGH) {
        record.confidence = CONFIDENCE.HIGH;
      } else if (confidence === CONFIDENCE.MEDIUM && record.confidence === CONFIDENCE.LOW) {
        record.confidence = CONFIDENCE.MEDIUM;
      }
      
      return n;
    },
    
    // Verifica se tem DDD brasileiro válido
    hasValidDDD(num) {
      let n = num;
      if (n.startsWith('55') && n.length >= 12) {
        n = n.substring(2);
      }
      if (n.length >= 10) {
        const ddd = parseInt(n.substring(0, 2), 10);
        return VALID_DDDS.has(ddd);
      }
      return false;
    },
    
    // Retorna APENAS números filtrados (confiáveis)
    getFiltered() {
      const result = [];
      
      this._phones.forEach((record, num) => {
        let include = false;
        
        // ALTA confiança: SEMPRE inclui
        if (record.confidence === CONFIDENCE.HIGH) {
          include = true;
        }
        // MÉDIA confiança: inclui se DDD válido
        else if (record.confidence === CONFIDENCE.MEDIUM) {
          include = this.hasValidDDD(num);
        }
        // BAIXA confiança: inclui se DDD válido E apareceu 2+ vezes
        else if (record.confidence === CONFIDENCE.LOW) {
          include = this.hasValidDDD(num) && record.occurrences >= CONFIG.minOccurrencesForRaw;
        }
        
        if (include) {
          result.push(num);
        }
      });
      
      // Ordenar e remover duplicatas
      return [...new Set(result)].sort();
    },
    
    // Retorna TODOS os números (sem filtro)
    getAll() {
      return Array.from(this._phones.keys()).sort();
    },
    
    getStats() {
      let high = 0, medium = 0, low = 0, filtered = 0;
      const sources = {};
      
      this._phones.forEach((record, num) => {
        if (record.confidence === CONFIDENCE.HIGH) high++;
        else if (record.confidence === CONFIDENCE.MEDIUM) medium++;
        else low++;
        
        record.sources.forEach(s => {
          const key = s.split('_')[0];
          sources[key] = (sources[key] || 0) + 1;
        });
      });
      
      filtered = this.getFiltered().length;
      
      return {
        total: this._phones.size,
        filtered,
        high,
        medium,
        low,
        sources
      };
    },
    
    clear() {
      this._phones.clear();
    }
  };

  window.PhoneStore = PhoneStore;

  // ===== FUNÇÕES DE EXTRAÇÃO =====
  
  function extractFromText(text, source, defaultConfidence = CONFIDENCE.LOW) {
    if (!text || typeof text !== 'string') return 0;
    let count = 0;
    
    // Padrão @c.us (ALTA CONFIANÇA)
    const waIdRe = /(\d{10,15})@c\.us/g;
    let match;
    while ((match = waIdRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], source + '_cus', CONFIDENCE.HIGH)) count++;
    }
    
    // Padrão @g.us (grupos - ALTA CONFIANÇA)
    const groupRe = /(\d{10,15})@g\.us/g;
    while ((match = groupRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], source + '_gus', CONFIDENCE.HIGH)) count++;
    }
    
    // Links wa.me (MÉDIA CONFIANÇA)
    const waMeRe = /wa\.me\/(\d{10,15})/g;
    while ((match = waMeRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], source + '_wame', CONFIDENCE.MEDIUM)) count++;
    }
    
    // Links phone= (MÉDIA CONFIANÇA)
    const phoneRe = /phone=(\d{10,15})/g;
    while ((match = phoneRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], source + '_phone', CONFIDENCE.MEDIUM)) count++;
    }
    
    // Números raw - só se defaultConfidence não for LOW ou se parecer telefone formatado
    if (defaultConfidence !== CONFIDENCE.LOW) {
      const rawRe = /\b(\d{10,15})\b/g;
      while ((match = rawRe.exec(text)) !== null) {
        if (PhoneStore.add(match[1], source + '_raw', defaultConfidence)) count++;
      }
    } else {
      // Para LOW, só extrair se parecer telefone formatado
      const formattedRe = /(?:\+?55)?[\s\-\.]?\(?(\d{2})\)?[\s\-\.]?(\d{4,5})[\s\-\.]?(\d{4})/g;
      while ((match = formattedRe.exec(text)) !== null) {
        const num = match[1] + match[2] + match[3];
        if (PhoneStore.add(num, source + '_formatted', CONFIDENCE.LOW)) count++;
      }
    }
    
    return count;
  }

  function extractFromElement(el, source) {
    if (!el) return 0;
    let count = 0;
    
    // data-id e data-jid são ALTA CONFIANÇA
    ['data-id', 'data-jid'].forEach(attr => {
      try {
        const val = el.getAttribute?.(attr);
        if (val && (val.includes('@c.us') || val.includes('@g.us'))) {
          count += extractFromText(val, source + '_' + attr, CONFIDENCE.HIGH);
        }
      } catch {}
    });
    
    // href, title, aria-label são MÉDIA CONFIANÇA
    ['href', 'title', 'aria-label'].forEach(attr => {
      try {
        const val = el.getAttribute?.(attr);
        if (val) {
          count += extractFromText(val, source + '_' + attr, CONFIDENCE.MEDIUM);
        }
      } catch {}
    });
    
    // Outros atributos são BAIXA CONFIANÇA
    ['data-testid', 'data-link', 'data-phone'].forEach(attr => {
      try {
        const val = el.getAttribute?.(attr);
        if (val) {
          count += extractFromText(val, source + '_' + attr, CONFIDENCE.LOW);
        }
      } catch {}
    });
    
    return count;
  }

  function extractFromDOM(source = 'dom') {
    let count = 0;
    
    // Elementos com data-id (ALTA CONFIANÇA)
    document.querySelectorAll('[data-id*="@"]').forEach(el => {
      count += extractFromElement(el, source + '_dataid');
    });
    
    // Elementos com data-jid (ALTA CONFIANÇA)
    document.querySelectorAll('[data-jid*="@"]').forEach(el => {
      count += extractFromElement(el, source + '_datajid');
    });
    
    // Células de chat
    document.querySelectorAll('[data-testid*="cell"], [data-testid*="chat"], [data-testid*="contact"]').forEach(el => {
      count += extractFromElement(el, source + '_cell');
    });
    
    // Linhas e itens
    document.querySelectorAll('[role="row"], [role="listitem"], [role="gridcell"]').forEach(el => {
      count += extractFromElement(el, source + '_row');
    });
    
    // Links
    document.querySelectorAll('a[href*="wa.me"], a[href*="phone"]').forEach(el => {
      count += extractFromElement(el, source + '_link');
    });
    
    // Títulos
    document.querySelectorAll('span[title], div[title]').forEach(el => {
      count += extractFromElement(el, source + '_title');
    });
    
    // pane-side
    const pane = document.querySelector('#pane-side');
    if (pane) {
      pane.querySelectorAll('[data-id], [data-jid]').forEach(el => {
        count += extractFromElement(el, source + '_pane');
      });
    }
    
    return count;
  }

  function extractFromStorage(source = 'storage') {
    let count = 0;
    
    // localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        if (value) {
          // Priorizar chaves com @c.us
          if (value.includes('@c.us') || value.includes('@g.us')) {
            count += extractFromText(value, source + '_ls', CONFIDENCE.HIGH);
          } else if (key.includes('chat') || key.includes('contact')) {
            count += extractFromText(value, source + '_ls', CONFIDENCE.MEDIUM);
          }
        }
      }
    } catch (e) {}
    
    // sessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        if (value && (value.includes('@c.us') || value.includes('@g.us'))) {
          count += extractFromText(value, source + '_ss', CONFIDENCE.HIGH);
        }
      }
    } catch (e) {}
    
    return count;
  }

  async function extractFromIndexedDB(source = 'idb') {
    let count = 0;
    
    try {
      const databases = await indexedDB.databases?.() || [];
      
      for (const dbInfo of databases) {
        if (!dbInfo.name) continue;
        
        try {
          const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(dbInfo.name);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            setTimeout(() => reject(new Error('timeout')), 3000);
          });
          
          const storeNames = Array.from(db.objectStoreNames);
          
          for (const storeName of storeNames) {
            if (storeName.includes('chat') || storeName.includes('contact') || storeName.includes('message')) {
              try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                
                const allData = await new Promise((resolve, reject) => {
                  const req = store.getAll();
                  req.onsuccess = () => resolve(req.result);
                  req.onerror = () => reject(req.error);
                  setTimeout(() => reject(new Error('timeout')), 5000);
                });
                
                if (Array.isArray(allData)) {
                  allData.forEach(item => {
                    const str = JSON.stringify(item);
                    if (str.includes('@c.us') || str.includes('@g.us')) {
                      count += extractFromText(str, source + '_' + storeName, CONFIDENCE.HIGH);
                    }
                  });
                }
              } catch {}
            }
          }
          
          db.close();
        } catch {}
      }
    } catch (e) {}
    
    return count;
  }

  // ===== SCROLL TURBO =====
  async function turboScroll() {
    const pane = document.querySelector('#pane-side');
    if (!pane) return;
    
    console.log('[WHL] 📜 Iniciando TURBO scroll...');
    
    pane.scrollTop = 0;
    await new Promise(r => setTimeout(r, 500));
    
    let lastTop = -1;
    let stable = 0;
    let scrollCount = 0;
    
    while (stable < CONFIG.stabilityCount && scrollCount < CONFIG.maxScrolls) {
      // Extrair durante scroll
      extractFromDOM('scroll_' + scrollCount);
      
      // Scroll
      const increment = Math.floor(pane.clientHeight * CONFIG.scrollIncrement);
      pane.scrollTop = Math.min(pane.scrollTop + increment, pane.scrollHeight);
      pane.dispatchEvent(new Event('scroll', { bubbles: true }));
      
      scrollCount++;
      
      // Progresso
      const progress = Math.min(80, 10 + Math.round((scrollCount / CONFIG.maxScrolls) * 70));
      window.postMessage({
        type: 'WHL_EXTRACT_PROGRESS',
        progress,
        count: PhoneStore.getFiltered().length
      }, '*');
      
      await new Promise(r => setTimeout(r, CONFIG.scrollDelay));
      
      if (Math.abs(pane.scrollTop - lastTop) < 5) {
        stable++;
      } else {
        stable = 0;
      }
      lastTop = pane.scrollTop;
      
      if (scrollCount % 30 === 0) {
        console.log(`[WHL] Scroll ${scrollCount}/${CONFIG.maxScrolls}, filtrados: ${PhoneStore.getFiltered().length}`);
      }
    }
    
    pane.scrollTop = 0;
    await new Promise(r => setTimeout(r, 500));
    extractFromDOM('scroll_final');
    
    console.log(`[WHL] ✅ Scroll concluído: ${scrollCount} scrolls`);
  }

  // ===== HOOKS DE REDE =====
  function installNetworkHooks() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const clone = response.clone();
        const text = await clone.text().catch(() => '');
        if (text.includes('@c.us') || text.includes('@g.us')) {
          extractFromText(text, 'fetch', CONFIDENCE.HIGH);
        }
      } catch {}
      return response;
    };
    
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
      const ws = new OriginalWebSocket(...args);
      ws.addEventListener('message', function(e) {
        try {
          if (e.data && typeof e.data === 'string') {
            if (e.data.includes('@c.us') || e.data.includes('@g.us')) {
              extractFromText(e.data, 'ws', CONFIDENCE.HIGH);
            }
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
    console.log('[WHL] 🚀🚀🚀 EXTRAÇÃO TURBO v4 INICIADA 🚀🚀🚀');
    
    PhoneStore.clear();
    
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 5, count: 0 }, '*');
    
    installNetworkHooks();
    
    // Fase 1: DOM inicial
    console.log('[WHL] 📱 Fase 1: DOM inicial...');
    extractFromDOM('initial');
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 10, count: PhoneStore.getFiltered().length }, '*');
    
    // Fase 2: Storage
    console.log('[WHL] 💾 Fase 2: Storage...');
    extractFromStorage('storage');
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 15, count: PhoneStore.getFiltered().length }, '*');
    
    // Fase 3: IndexedDB
    console.log('[WHL] 🗄️ Fase 3: IndexedDB...');
    await extractFromIndexedDB('idb');
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 20, count: PhoneStore.getFiltered().length }, '*');
    
    // Fase 4: TURBO Scroll
    console.log('[WHL] 📜 Fase 4: TURBO Scroll...');
    await turboScroll();
    
    // Fase 5: Extração final
    console.log('[WHL] 🔍 Fase 5: Extração final...');
    extractFromDOM('final');
    extractFromStorage('final');
    
    // Aguardar rede
    await new Promise(r => setTimeout(r, 2000));
    extractFromDOM('post_network');
    
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 100, count: PhoneStore.getFiltered().length }, '*');
    
    // Resultados
    const filtered = PhoneStore.getFiltered();
    const stats = PhoneStore.getStats();
    
    console.log('[WHL] ✅✅✅ EXTRAÇÃO TURBO v4 CONCLUÍDA ✅✅✅');
    console.log('[WHL] Total coletados:', stats.total);
    console.log('[WHL] Após filtro:', filtered.length);
    console.log('[WHL] Stats:', stats);
    
    // Salvar
    try {
      localStorage.setItem('whl_extracted_numbers', JSON.stringify(filtered));
    } catch {}
    
    return filtered;
  }

  // ===== LISTENER =====
  window.addEventListener('message', async (ev) => {
    if (!ev?.data?.type) return;
    
    if (ev.data.type === 'WHL_EXTRACT_CONTACTS') {
      try {
        const numbers = await extractAllTurbo();
        window.postMessage({ type: 'WHL_EXTRACT_RESULT', numbers }, '*');
      } catch (e) {
        console.error('[WHL] Erro:', e);
        window.postMessage({ type: 'WHL_EXTRACT_ERROR', error: String(e) }, '*');
      }
    }
  });

  // ===== DEBUG =====
  window.__WHL_TURBO_V4__ = {
    extract: extractAllTurbo,
    store: PhoneStore,
    config: CONFIG,
    getFiltered: () => PhoneStore.getFiltered(),
    getAll: () => PhoneStore.getAll(),
    getStats: () => PhoneStore.getStats()
  };

  console.log('[WHL] ✅ EXTRATOR TURBO v4 com Filtro Inteligente carregado!');
})();
