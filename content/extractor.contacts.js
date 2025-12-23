/**
 * WhatsHybrid – EXTRATOR TURBO v6 com SISTEMA DE PONTUAÇÃO
 * 
 * ESTRATÉGIA:
 * 1. Coleta AGRESSIVA (máximo de números possível)
 * 2. Sistema de PONTUAÇÃO por fonte e contexto
 * 3. Filtro RIGOROSO (validação brasileira + score mínimo)
 * 
 * SISTEMA DE PONTUAÇÃO:
 * - Fonte @c.us/@g.us: +10 pontos
 * - Fonte data-id/data-jid: +8 pontos
 * - Fonte wa.me: +6 pontos
 * - Fonte phone=: +5 pontos
 * - Fonte title/aria-label: +3 pontos
 * - DDD brasileiro válido: +4 pontos
 * - Formato celular correto (9xxxxx): +3 pontos
 * - Múltiplas ocorrências: +2 pontos por ocorrência extra
 * - Contexto negativo (data/hora/valor): -5 pontos
 * 
 * SCORE MÍNIMO: 8 pontos
 */

(function () {
  if (window.__WHL_EXTRACTOR_TURBO_V6__) return;
  window.__WHL_EXTRACTOR_TURBO_V6__ = true;

  console.log('[WHL] 🚀 EXTRATOR TURBO v6 com Sistema de Pontuação iniciando...');

  // ===== CONFIGURAÇÃO =====
  const CONFIG = {
    // Scroll
    maxScrolls: 150,
    scrollDelay: 400,
    scrollIncrement: 0.85,
    stabilityCount: 10,
    
    // Validação
    minNumberLength: 10,
    maxNumberLength: 15,
    
    // Score
    minValidScore: 8,
    
    // Pontuação por fonte
    scores: {
      source_cus: 10,      // @c.us (WhatsApp ID)
      source_gus: 10,      // @g.us (grupo)
      source_dataid: 8,    // data-id
      source_datajid: 8,   // data-jid
      source_wame: 6,      // wa.me link
      source_phone: 5,     // phone= parameter
      source_href: 4,      // href genérico
      source_title: 3,     // title attribute
      source_aria: 3,      // aria-label
      source_formatted: 2, // número formatado
      source_raw: 1,       // texto raw
      
      // Bônus de validação
      bonus_valid_ddd: 4,
      bonus_mobile_format: 3,
      bonus_occurrence: 2,  // por ocorrência extra
      
      // Penalidades
      penalty_context: -5,  // contexto suspeito
      penalty_repeated: -8, // número repetitivo
      penalty_sequence: -6, // sequência óbvia
    },
    
    // Contextos negativos (falsos positivos)
    negativeContexts: [
      'data', 'hora', 'time', 'date',
      'código', 'codigo', 'code',
      'valor', 'preço', 'preco', 'price',
      'r$', '$', '€', 'usd', 'brl',
      'duração', 'duracao', 'duration',
      'tempo', 'minutos', 'segundos',
      'cep', 'cnpj', 'cpf', 'rg',
      'pedido', 'order', 'protocolo',
      'versão', 'versao', 'version',
      'id:', 'ref:', 'nº', 'n°'
    ],
    
    // Seletores de contexto negativo
    negativeSelectors: [
      '.message-timestamp',
      '.status-code',
      '[data-testid*="time"]',
      '[data-testid*="date"]',
      '[data-testid*="status"]',
      '.price',
      '.value',
      '.code'
    ],
    
    debug: true
  };

  // ===== DDDs BRASILEIROS VÁLIDOS =====
  const VALID_DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46,
    47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99
  ]);

  // ===== NORMALIZAÇÃO =====
  function normalizeNumber(number) {
    if (!number) return null;
    
    // Remove caracteres não numéricos (exceto +)
    let normalized = String(number).replace(/[^\d+]/g, '');
    
    // Remove prefixos de discagem internacional duplicados
    if (normalized.includes('+')) {
      normalized = '+' + normalized.replace(/\+/g, '');
    }
    
    // Remove + e converte para apenas dígitos
    normalized = normalized.replace(/\+/g, '');
    
    // Remove zeros iniciais
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }
    
    // Adicionar 55 se for número brasileiro sem código
    if (normalized.length === 10 || normalized.length === 11) {
      normalized = '55' + normalized;
    }
    
    // Validar comprimento
    if (normalized.length < CONFIG.minNumberLength || normalized.length > CONFIG.maxNumberLength) {
      return null;
    }
    
    return normalized;
  }

  // ===== VALIDAÇÃO BRASILEIRA =====
  function validateBrazilianPhone(num) {
    if (!num) return { valid: false, score: 0 };
    
    let score = 0;
    const issues = [];
    
    // Deve ter 12 ou 13 dígitos
    if (num.length !== 12 && num.length !== 13) {
      return { valid: false, score: 0, issues: ['tamanho inválido'] };
    }
    
    // Deve começar com 55
    if (!num.startsWith('55')) {
      return { valid: false, score: 0, issues: ['não é brasileiro'] };
    }
    
    // Verificar DDD
    const ddd = parseInt(num.substring(2, 4), 10);
    if (VALID_DDDS.has(ddd)) {
      score += CONFIG.scores.bonus_valid_ddd;
    } else {
      return { valid: false, score: 0, issues: ['DDD inválido: ' + ddd] };
    }
    
    // Verificar número local
    const localNumber = num.substring(4);
    
    // Celular (9 dígitos)
    if (localNumber.length === 9) {
      if (localNumber.startsWith('9')) {
        const secondDigit = parseInt(localNumber[1], 10);
        if (secondDigit >= 6) {
          score += CONFIG.scores.bonus_mobile_format;
        } else {
          issues.push('2º dígito celular inválido');
          score -= 2;
        }
      } else {
        return { valid: false, score: 0, issues: ['celular deve começar com 9'] };
      }
    }
    
    // Fixo (8 dígitos)
    if (localNumber.length === 8) {
      const firstDigit = parseInt(localNumber[0], 10);
      if (firstDigit < 2 || firstDigit > 5) {
        return { valid: false, score: 0, issues: ['fixo inválido'] };
      }
    }
    
    // Verificar padrões inválidos
    const uniqueDigits = new Set(num.split(''));
    if (uniqueDigits.size <= 3) {
      score += CONFIG.scores.penalty_repeated;
      issues.push('número muito repetitivo');
    }
    
    // Sequências óbvias
    if (/12345678|87654321|11111111|22222222|33333333|44444444|55555555|66666666|77777777|88888888|99999999|00000000/.test(num)) {
      score += CONFIG.scores.penalty_sequence;
      issues.push('sequência óbvia');
    }
    
    return { 
      valid: score >= 0, 
      score, 
      issues: issues.length ? issues : null 
    };
  }

  // ===== DETECÇÃO DE CONTEXTO NEGATIVO =====
  function hasNegativeContext(element, text) {
    if (!element && !text) return false;
    
    // Verificar seletores negativos
    if (element) {
      for (const selector of CONFIG.negativeSelectors) {
        try {
          if (element.matches?.(selector) || element.closest?.(selector)) {
            return true;
          }
        } catch {}
      }
    }
    
    // Verificar contexto textual
    const contextText = (text || element?.textContent || '').toLowerCase();
    for (const neg of CONFIG.negativeContexts) {
      if (contextText.includes(neg)) {
        return true;
      }
    }
    
    return false;
  }

  // ===== ARMAZENAMENTO COM SCORE =====
  const PhoneStore = {
    _phones: new Map(), // número -> { sources: Set, score: number, occurrences: number, contexts: [] }
    
    add(num, sourceType, element = null, context = null) {
      // Normalizar
      const normalized = normalizeNumber(num);
      if (!normalized) return null;
      
      // Validar formato brasileiro
      const validation = validateBrazilianPhone(normalized);
      if (!validation.valid && validation.score < -5) {
        return null;
      }
      
      // Calcular score da fonte
      let sourceScore = CONFIG.scores['source_' + sourceType] || CONFIG.scores.source_raw;
      
      // Verificar contexto negativo
      if (hasNegativeContext(element, context)) {
        sourceScore += CONFIG.scores.penalty_context;
      }
      
      // Criar ou atualizar registro
      if (!this._phones.has(normalized)) {
        this._phones.set(normalized, {
          sources: new Set(),
          score: validation.score,
          occurrences: 0,
          firstSeen: Date.now()
        });
      }
      
      const record = this._phones.get(normalized);
      record.sources.add(sourceType);
      record.occurrences++;
      
      // Adicionar score da fonte (só na primeira vez por fonte)
      if (!record.sources.has(sourceType + '_counted')) {
        record.score += sourceScore;
        record.sources.add(sourceType + '_counted');
      }
      
      // Bônus por múltiplas ocorrências
      if (record.occurrences > 1) {
        record.score += CONFIG.scores.bonus_occurrence;
      }
      
      return normalized;
    },
    
    // Retorna números filtrados por score mínimo
    getFiltered() {
      const result = [];
      
      this._phones.forEach((record, num) => {
        if (record.score >= CONFIG.minValidScore) {
          result.push({
            number: num,
            score: record.score,
            sources: Array.from(record.sources).filter(s => !s.endsWith('_counted')),
            occurrences: record.occurrences
          });
        }
      });
      
      // Ordenar por score (maior primeiro)
      result.sort((a, b) => b.score - a.score);
      
      return result.map(r => r.number);
    },
    
    // Retorna todos com detalhes
    getAllWithDetails() {
      const result = [];
      
      this._phones.forEach((record, num) => {
        result.push({
          number: num,
          score: record.score,
          sources: Array.from(record.sources).filter(s => !s.endsWith('_counted')),
          occurrences: record.occurrences,
          valid: record.score >= CONFIG.minValidScore
        });
      });
      
      result.sort((a, b) => b.score - a.score);
      return result;
    },
    
    getStats() {
      let valid = 0, invalid = 0;
      let totalScore = 0;
      const sources = {};
      
      this._phones.forEach((record) => {
        if (record.score >= CONFIG.minValidScore) {
          valid++;
        } else {
          invalid++;
        }
        totalScore += record.score;
        
        record.sources.forEach(s => {
          if (!s.endsWith('_counted')) {
            sources[s] = (sources[s] || 0) + 1;
          }
        });
      });
      
      return {
        total: this._phones.size,
        valid,
        invalid,
        avgScore: this._phones.size ? (totalScore / this._phones.size).toFixed(1) : 0,
        sources,
        minScore: CONFIG.minValidScore
      };
    },
    
    clear() {
      this._phones.clear();
    }
  };

  window.PhoneStore = PhoneStore;

  // ===== FUNÇÕES DE EXTRAÇÃO =====
  
  function extractFromText(text, sourceType, element = null) {
    if (!text || typeof text !== 'string') return 0;
    let count = 0;
    
    // Padrão @c.us (ALTA CONFIANÇA)
    const waIdRe = /(\d{10,15})@c\.us/g;
    let match;
    while ((match = waIdRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], 'cus', element, text)) count++;
    }
    
    // Padrão @g.us (grupos)
    const groupRe = /(\d{10,15})@g\.us/g;
    while ((match = groupRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], 'gus', element, text)) count++;
    }
    
    // Links wa.me
    const waMeRe = /wa\.me\/(\d{10,15})/g;
    while ((match = waMeRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], 'wame', element, text)) count++;
    }
    
    // Links phone=
    const phoneRe = /phone=(\d{10,15})/g;
    while ((match = phoneRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], 'phone', element, text)) count++;
    }
    
    // Números formatados (com contexto)
    const formattedRe = /(?:\+?55)?[\s\-\.]?\(?(\d{2})\)?[\s\-\.]?(\d{4,5})[\s\-\.]?(\d{4})/g;
    while ((match = formattedRe.exec(text)) !== null) {
      const num = match[1] + match[2] + match[3];
      if (PhoneStore.add(num, sourceType || 'formatted', element, text)) count++;
    }
    
    return count;
  }

  function extractFromElement(el, baseSource) {
    if (!el) return 0;
    let count = 0;
    
    // data-id e data-jid (ALTA CONFIANÇA)
    ['data-id', 'data-jid'].forEach(attr => {
      try {
        const val = el.getAttribute?.(attr);
        if (val && (val.includes('@c.us') || val.includes('@g.us'))) {
          count += extractFromText(val, 'dataid', el);
        }
      } catch {}
    });
    
    // href (wa.me links)
    try {
      const href = el.getAttribute?.('href');
      if (href) {
        if (href.includes('wa.me')) {
          count += extractFromText(href, 'wame', el);
        } else if (href.includes('phone')) {
          count += extractFromText(href, 'phone', el);
        } else {
          count += extractFromText(href, 'href', el);
        }
      }
    } catch {}
    
    // title
    try {
      const title = el.getAttribute?.('title');
      if (title) {
        count += extractFromText(title, 'title', el);
      }
    } catch {}
    
    // aria-label
    try {
      const aria = el.getAttribute?.('aria-label');
      if (aria) {
        count += extractFromText(aria, 'aria', el);
      }
    } catch {}
    
    return count;
  }

  function extractFromDOM(source = 'dom') {
    let count = 0;
    
    // Elementos com data-id/@c.us (ALTA CONFIANÇA)
    document.querySelectorAll('[data-id*="@"]').forEach(el => {
      count += extractFromElement(el, 'dataid');
    });
    
    // Elementos com data-jid
    document.querySelectorAll('[data-jid*="@"]').forEach(el => {
      count += extractFromElement(el, 'datajid');
    });
    
    // Células de chat
    document.querySelectorAll('[data-testid*="cell"], [data-testid*="chat"], [data-testid*="contact"]').forEach(el => {
      count += extractFromElement(el, 'cell');
    });
    
    // Linhas
    document.querySelectorAll('[role="row"], [role="listitem"]').forEach(el => {
      count += extractFromElement(el, 'row');
    });
    
    // Links wa.me
    document.querySelectorAll('a[href*="wa.me"]').forEach(el => {
      count += extractFromElement(el, 'wame');
    });
    
    // Títulos
    document.querySelectorAll('span[title], div[title]').forEach(el => {
      count += extractFromElement(el, 'title');
    });
    
    // pane-side
    const pane = document.querySelector('#pane-side');
    if (pane) {
      pane.querySelectorAll('[data-id], [data-jid]').forEach(el => {
        count += extractFromElement(el, 'pane');
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
          count += extractFromText(value, 'cus', null);
        }
      }
    } catch {}
    
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        if (value && (value.includes('@c.us') || value.includes('@g.us'))) {
          count += extractFromText(value, 'cus', null);
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
                      count += extractFromText(str, 'cus', null);
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
        const stats = PhoneStore.getStats();
        console.log(`[WHL] Scroll ${scrollCount}/${CONFIG.maxScrolls}, válidos: ${stats.valid}/${stats.total}`);
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
          extractFromText(text, 'cus', null);
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
              extractFromText(e.data, 'cus', null);
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
    console.log('[WHL] 🚀🚀🚀 EXTRAÇÃO TURBO v6 (SISTEMA DE PONTUAÇÃO) INICIADA 🚀🚀🚀');
    console.log('[WHL] Score mínimo:', CONFIG.minValidScore);
    
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
    
    console.log('[WHL] ✅✅✅ EXTRAÇÃO TURBO v6 CONCLUÍDA ✅✅✅');
    console.log('[WHL] Estatísticas:', stats);
    console.log('[WHL] Números válidos (score >= ' + CONFIG.minValidScore + '):', filtered.length);
    
    // Top 10 por score
    const topNumbers = PhoneStore.getAllWithDetails().slice(0, 10);
    console.log('[WHL] Top 10 números por score:', topNumbers);
    
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
  window.__WHL_TURBO_V6__ = {
    extract: extractAllTurbo,
    store: PhoneStore,
    config: CONFIG,
    validate: validateBrazilianPhone,
    normalize: normalizeNumber,
    getFiltered: () => PhoneStore.getFiltered(),
    getAll: () => PhoneStore.getAllWithDetails(),
    getStats: () => PhoneStore.getStats(),
    setMinScore: (score) => { CONFIG.minValidScore = score; console.log('[WHL] Score mínimo alterado para:', score); }
  };

  console.log('[WHL] ✅ EXTRATOR TURBO v6 com Sistema de Pontuação carregado!');
  console.log('[WHL] Debug: window.__WHL_TURBO_V6__.getStats() para ver estatísticas');
})();
