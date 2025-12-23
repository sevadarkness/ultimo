/**
 * WhatsHybrid – EXTRATOR TURBO v5 com FILTRO RIGOROSO
 * 
 * ESTRATÉGIA:
 * 1. Coleta AGRESSIVA (máximo de números possível)
 * 2. Filtro RIGOROSO (TODOS os números passam por validação)
 * 
 * VALIDAÇÕES OBRIGATÓRIAS PARA TODOS:
 * - Tamanho correto (12-13 dígitos com 55)
 * - DDD brasileiro válido (67 DDDs)
 * - Formato de celular brasileiro (9º dígito = 9 para celulares)
 * 
 * NÍVEIS DE CONFIANÇA (após validação):
 * - ALTA: @c.us, data-id, data-jid → Inclui se passar validação
 * - MÉDIA: wa.me/, phone= → Inclui se passar validação
 * - BAIXA: raw → Inclui se passar validação E 2+ ocorrências
 * 
 * Comunicação via window.postMessage
 */

(function () {
  if (window.__WHL_EXTRACTOR_TURBO_V5__) return;
  window.__WHL_EXTRACTOR_TURBO_V5__ = true;

  console.log('[WHL] 🚀 EXTRATOR TURBO v5 com Filtro RIGOROSO iniciando...');

  // ===== CONFIGURAÇÃO =====
  const CONFIG = {
    // Scroll
    maxScrolls: 150,
    scrollDelay: 400,
    scrollIncrement: 0.85,
    stabilityCount: 10,
    
    // Filtro rigoroso
    minOccurrencesForRaw: 2,
    
    debug: true
  };

  // ===== DDDs BRASILEIROS VÁLIDOS (COMPLETO) =====
  const VALID_DDDS = new Set([
    // São Paulo
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    // Rio de Janeiro / Espírito Santo
    21, 22, 24, 27, 28,
    // Minas Gerais
    31, 32, 33, 34, 35, 37, 38,
    // Paraná
    41, 42, 43, 44, 45, 46,
    // Santa Catarina
    47, 48, 49,
    // Rio Grande do Sul
    51, 53, 54, 55,
    // Distrito Federal / Goiás / Tocantins / Mato Grosso / Mato Grosso do Sul / Acre / Rondônia
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    // Bahia / Sergipe
    71, 73, 74, 75, 77, 79,
    // Pernambuco / Alagoas / Paraíba / Rio Grande do Norte / Ceará / Piauí
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    // Pará / Amazonas / Roraima / Amapá / Maranhão
    91, 92, 93, 94, 95, 96, 97, 98, 99
  ]);

  // ===== NÍVEIS DE CONFIANÇA =====
  const CONFIDENCE = {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
  };

  // ===== VALIDAÇÃO RIGOROSA DE NÚMERO BRASILEIRO =====
  function isValidBrazilianPhone(num) {
    if (!num) return false;
    
    let n = String(num).replace(/\D/g, '');
    
    // Normalizar: adicionar 55 se necessário
    if (n.length === 10 || n.length === 11) {
      n = '55' + n;
    }
    
    // Deve ter 12 ou 13 dígitos (55 + DDD + número)
    // 12 dígitos: fixo (55 + DD + 8 dígitos)
    // 13 dígitos: celular (55 + DD + 9 dígitos)
    if (n.length !== 12 && n.length !== 13) {
      return false;
    }
    
    // Deve começar com 55 (Brasil)
    if (!n.startsWith('55')) {
      return false;
    }
    
    // Extrair DDD (posição 2-3)
    const ddd = parseInt(n.substring(2, 4), 10);
    
    // DDD deve ser válido
    if (!VALID_DDDS.has(ddd)) {
      return false;
    }
    
    // Extrair número local (após DDD)
    const localNumber = n.substring(4);
    
    // Para celular (9 dígitos): deve começar com 9
    if (localNumber.length === 9) {
      if (!localNumber.startsWith('9')) {
        return false;
      }
      // O segundo dígito de celular deve ser 6, 7, 8 ou 9
      const secondDigit = parseInt(localNumber[1], 10);
      if (secondDigit < 6) {
        return false;
      }
    }
    
    // Para fixo (8 dígitos): deve começar com 2, 3, 4 ou 5
    if (localNumber.length === 8) {
      const firstDigit = parseInt(localNumber[0], 10);
      if (firstDigit < 2 || firstDigit > 5) {
        return false;
      }
    }
    
    // Rejeitar números repetidos (ex: 99999999999)
    const uniqueDigits = new Set(n.split(''));
    if (uniqueDigits.size <= 3) {
      return false;
    }
    
    // Rejeitar sequências óbvias
    if (/^55\d{2}(12345678|87654321|11111111|22222222|33333333|44444444|55555555|66666666|77777777|88888888|99999999|00000000)/.test(n)) {
      return false;
    }
    
    return true;
  }

  // ===== NORMALIZAÇÃO =====
  function normalizePhone(num) {
    if (!num) return null;
    
    let n = String(num).replace(/\D/g, '');
    
    // Adicionar 55 se necessário
    if (n.length === 10 || n.length === 11) {
      n = '55' + n;
    }
    
    // Validar
    if (!isValidBrazilianPhone(n)) {
      return null;
    }
    
    return n;
  }

  // ===== ARMAZENAMENTO =====
  const PhoneStore = {
    _phones: new Map(),
    
    add(num, source, confidence = CONFIDENCE.LOW) {
      // Normalizar e validar
      const normalized = normalizePhone(num);
      if (!normalized) return null;
      
      // Criar ou atualizar registro
      if (!this._phones.has(normalized)) {
        this._phones.set(normalized, {
          sources: new Set(),
          confidence: confidence,
          occurrences: 0
        });
      }
      
      const record = this._phones.get(normalized);
      record.sources.add(source);
      record.occurrences++;
      
      // Upgrade de confiança
      if (confidence === CONFIDENCE.HIGH) {
        record.confidence = CONFIDENCE.HIGH;
      } else if (confidence === CONFIDENCE.MEDIUM && record.confidence === CONFIDENCE.LOW) {
        record.confidence = CONFIDENCE.MEDIUM;
      }
      
      return normalized;
    },
    
    // Retorna números filtrados (todos já são válidos, mas LOW precisa de 2+ ocorrências)
    getFiltered() {
      const result = [];
      
      this._phones.forEach((record, num) => {
        // HIGH e MEDIUM: incluir (já validados no add)
        if (record.confidence === CONFIDENCE.HIGH || record.confidence === CONFIDENCE.MEDIUM) {
          result.push(num);
        }
        // LOW: precisa de 2+ ocorrências
        else if (record.confidence === CONFIDENCE.LOW && record.occurrences >= CONFIG.minOccurrencesForRaw) {
          result.push(num);
        }
      });
      
      return [...new Set(result)].sort();
    },
    
    getAll() {
      return Array.from(this._phones.keys()).sort();
    },
    
    getStats() {
      let high = 0, medium = 0, low = 0;
      const sources = {};
      
      this._phones.forEach((record) => {
        if (record.confidence === CONFIDENCE.HIGH) high++;
        else if (record.confidence === CONFIDENCE.MEDIUM) medium++;
        else low++;
        
        record.sources.forEach(s => {
          const key = s.split('_')[0];
          sources[key] = (sources[key] || 0) + 1;
        });
      });
      
      return {
        total: this._phones.size,
        filtered: this.getFiltered().length,
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
    
    // Números formatados (BAIXA CONFIANÇA)
    const formattedRe = /(?:\+?55)?[\s\-\.]?\(?(\d{2})\)?[\s\-\.]?(\d{4,5})[\s\-\.]?(\d{4})/g;
    while ((match = formattedRe.exec(text)) !== null) {
      const num = match[1] + match[2] + match[3];
      if (PhoneStore.add(num, source + '_formatted', defaultConfidence)) count++;
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
    document.querySelectorAll('[role="row"], [role="listitem"]').forEach(el => {
      count += extractFromElement(el, source + '_row');
    });
    
    // Links wa.me
    document.querySelectorAll('a[href*="wa.me"], a[href*="phone"]').forEach(el => {
      count += extractFromElement(el, source + '_link');
    });
    
    // Títulos com números
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
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        if (value && (value.includes('@c.us') || value.includes('@g.us'))) {
          count += extractFromText(value, source + '_ls', CONFIDENCE.HIGH);
        }
      }
    } catch {}
    
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        if (value && (value.includes('@c.us') || value.includes('@g.us'))) {
          count += extractFromText(value, source + '_ss', CONFIDENCE.HIGH);
        }
      }
    } catch {}
    
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
    } catch {}
    
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
      extractFromDOM('scroll_' + scrollCount);
      
      const increment = Math.floor(pane.clientHeight * CONFIG.scrollIncrement);
      pane.scrollTop = Math.min(pane.scrollTop + increment, pane.scrollHeight);
      pane.dispatchEvent(new Event('scroll', { bubbles: true }));
      
      scrollCount++;
      
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
        console.log(`[WHL] Scroll ${scrollCount}/${CONFIG.maxScrolls}, válidos: ${PhoneStore.getFiltered().length}`);
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
    console.log('[WHL] 🚀🚀🚀 EXTRAÇÃO TURBO v5 (FILTRO RIGOROSO) INICIADA 🚀🚀🚀');
    
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
    
    console.log('[WHL] ✅✅✅ EXTRAÇÃO TURBO v5 CONCLUÍDA ✅✅✅');
    console.log('[WHL] Total coletados (válidos):', stats.total);
    console.log('[WHL] Após filtro de confiança:', filtered.length);
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
  window.__WHL_TURBO_V5__ = {
    extract: extractAllTurbo,
    store: PhoneStore,
    config: CONFIG,
    validate: isValidBrazilianPhone,
    getFiltered: () => PhoneStore.getFiltered(),
    getAll: () => PhoneStore.getAll(),
    getStats: () => PhoneStore.getStats()
  };

  console.log('[WHL] ✅ EXTRATOR TURBO v5 com Filtro RIGOROSO carregado!');
})();
