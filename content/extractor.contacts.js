/**
 * WhatsHybrid – EXTRATOR TURBO v7 com FILTRO RIGOROSO + SUPORTE INTERNACIONAL
 * 
 * ESTRATÉGIA:
 * 1. Coleta APENAS de fontes confiáveis (@c.us, data-id, data-jid)
 * 2. Validação OBRIGATÓRIA para TODOS os números
 * 3. Sistema de pontuação com score mínimo
 * 4. Detecção de falsos positivos (datas, valores, códigos)
 * 5. SUPORTE INTERNACIONAL: Aceita números de qualquer país (10-15 dígitos)
 * 
 * VALIDAÇÕES:
 * - Tamanho: 10-15 dígitos (internacional)
 * - Números brasileiros recebem BÔNUS de pontuação (DDD, formato celular)
 * - Números internacionais são validados com score base
 * - Rejeita números repetitivos e sequências
 * 
 * SCORE MÍNIMO: 10 pontos (brasileiro) ou 5 pontos (internacional)
 */

(function () {
  if (window.__WHL_EXTRACTOR_TURBO_V7__) return;
  window.__WHL_EXTRACTOR_TURBO_V7__ = true;

  // ===== LOGGING =====
  const WHL_DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('whl_debug') === 'true';
  const whlLog = {
    debug: (...args) => { if (WHL_DEBUG) console.log('[WHL DEBUG]', ...args); },
    info: (...args) => { if (WHL_DEBUG) console.log('[WHL]', ...args); },
    warn: (...args) => console.warn('[WHL]', ...args),
    error: (...args) => console.error('[WHL]', ...args)
  };

  whlLog.info('🚀 EXTRATOR TURBO v7 - FILTRO ULTRA-RIGOROSO iniciando...');

  // ===== CONFIGURAÇÃO =====
  const CONFIG = {
    maxScrolls: 150,
    scrollDelay: 400,
    scrollIncrement: 0.85,
    stabilityCount: 10,
    maxExtractionTime: 120000,  // 2 minutos máximo (timeout absoluto)
    
    // FILTRO RIGOROSO
    minValidScore: 10,  // Score mínimo ALTO
    
    // Pontuação por fonte
    scores: {
      cus: 15,        // @c.us - máxima confiança
      gus: 15,        // @g.us - grupo
      dataid: 12,     // data-id
      datajid: 12,    // data-jid
      wame: 8,        // wa.me link
      phone: 6,       // phone= parameter
      
      // Bônus
      valid_ddd: 5,
      mobile_format: 4,
      occurrence: 2,
      
      // Penalidades
      negative_context: -10,
      repeated_digits: -15,
      sequence: -12,
      invalid_mobile: -20,
    },
    
    // Contextos que indicam falso positivo
    negativeContexts: [
      'data', 'hora', 'time', 'date', 'timestamp',
      'código', 'codigo', 'code', 'pin', 'otp',
      'valor', 'preço', 'preco', 'price', 'total',
      'r$', '$', '€', 'usd', 'brl', 'eur',
      'duração', 'duracao', 'duration', 'tempo',
      'minutos', 'segundos', 'minutes', 'seconds',
      'cep', 'cnpj', 'cpf', 'rg', 'id:',
      'pedido', 'order', 'protocolo', 'ticket',
      'versão', 'versao', 'version', 'v.',
      'ref:', 'nº', 'n°', '#', 'qty', 'quantidade'
    ],
    
    debug: true
  };

  // ===== DDDs BRASILEIROS VÁLIDOS (67 DDDs) =====
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

  // ===== HELPER FUNCTIONS FOR WHATSAPP STORE =====
  function waitForWA() {
    return new Promise(resolve => {
      // Aguardar WHL_Store do bridge (não window.Store diretamente devido ao CSP)
      if (window.WHL_Store) return resolve();
      
      // Escutar evento de bridge pronto
      const handleBridgeReady = () => {
        window.removeEventListener('WHL_STORE_READY', handleBridgeReady);
        resolve();
      };
      window.addEventListener('WHL_STORE_READY', handleBridgeReady);
      
      // Fallback timeout
      setTimeout(resolve, 10000);
    });
  }

  function initStore() {
    // Store is initialized by store-bridge.js
    // Just check if WHL_Store is available
    return !!window.WHL_Store;
  }

  // ===== VALIDAÇÃO COM SUPORTE INTERNACIONAL =====
  function validatePhone(num) {
    if (!num) return { valid: false, score: 0, reason: 'vazio' };
    
    let n = String(num).replace(/\D/g, '');
    
    // Tamanho mínimo: 10 dígitos (internacional pode ter até 15)
    if (n.length < 10 || n.length > 15) {
      return { valid: false, score: 0, reason: 'tamanho inválido: ' + n.length };
    }
    
    let score = 0;
    let isBrazilian = false;
    
    // Auto-adicionar código do Brasil se necessário (10-11 dígitos)
    if (n.length === 10 || n.length === 11) {
      n = '55' + n;
      isBrazilian = true;
    }
    
    // Verificar se é número brasileiro (começa com 55)
    if (n.startsWith('55') && (n.length === 12 || n.length === 13)) {
      isBrazilian = true;
    }
    
    // VALIDAÇÃO BRASILEIRA (bônus de pontos, não obrigatória)
    if (isBrazilian) {
      // Verificar DDD
      const ddd = parseInt(n.substring(2, 4), 10);
      if (VALID_DDDS.has(ddd)) {
        score += CONFIG.scores.valid_ddd;
        
        // Número local
        const localNumber = n.substring(4);
        
        // Celular (9 dígitos)
        if (localNumber.length === 9) {
          // DEVE começar com 9
          if (localNumber.startsWith('9')) {
            // Segundo dígito deve ser 6, 7, 8 ou 9
            const secondDigit = parseInt(localNumber[1], 10);
            if (secondDigit >= 6) {
              score += CONFIG.scores.mobile_format;
            }
          }
        }
        
        // Fixo (8 dígitos)
        if (localNumber.length === 8) {
          const firstDigit = parseInt(localNumber[0], 10);
          if (firstDigit >= 2 && firstDigit <= 5) {
            score += 3; // Bônus pequeno para fixo válido
          }
        }
      } else {
        // DDD inválido, mas ainda pode ser válido como internacional
        isBrazilian = false;
      }
    }
    
    // Validação internacional básica
    if (!isBrazilian) {
      // Número internacional válido - score base menor
      score += 5;
    }
    
    // Rejeitar números muito repetitivos
    const uniqueDigits = new Set(n.split(''));
    if (uniqueDigits.size <= 3) {
      return { valid: false, score: CONFIG.scores.repeated_digits, reason: 'número muito repetitivo' };
    }
    
    // Rejeitar sequências óbvias (apenas para os últimos 8 dígitos)
    const lastDigits = n.substring(Math.max(0, n.length - 8));
    const sequences = ['12345678', '87654321', '11111111', '22222222', '33333333', 
                       '44444444', '55555555', '66666666', '77777777', '88888888', 
                       '99999999', '00000000', '12341234', '56785678'];
    for (const seq of sequences) {
      if (lastDigits.includes(seq)) {
        return { valid: false, score: CONFIG.scores.sequence, reason: 'sequência óbvia: ' + seq };
      }
    }
    
    return { valid: true, score, normalized: n };
  }

  // ===== DETECTAR CONTEXTO NEGATIVO =====
  function hasNegativeContext(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    for (const neg of CONFIG.negativeContexts) {
      if (lower.includes(neg)) {
        return true;
      }
    }
    return false;
  }

  // ===== ARMAZENAMENTO =====
  const PhoneStore = {
    _phones: new Map(),
    _archived: new Set(),  // números arquivados
    _blocked: new Set(),   // números bloqueados
    
    add(num, sourceType, context = null, contactType = 'normal') {
      // Validar primeiro
      const validation = validatePhone(num);
      if (!validation.valid) {
        if (CONFIG.debug && validation.reason !== 'vazio') {
          // whlLog.debug('❌ Rejeitado:', num, '-', validation.reason);
        }
        return null;
      }
      
      const normalized = validation.normalized;
      
      // Verificar contexto negativo
      if (hasNegativeContext(context)) {
        if (CONFIG.debug) {
          whlLog.warn('⚠️ Contexto negativo:', normalized);
        }
        return null; // Rejeitar completamente se contexto negativo
      }
      
      // Marcar como arquivado ou bloqueado se aplicável
      if (contactType === 'archived') {
        this._archived.add(normalized);
      } else if (contactType === 'blocked') {
        this._blocked.add(normalized);
      }
      
      // Calcular score
      let sourceScore = CONFIG.scores[sourceType] || 0;
      
      // Criar ou atualizar
      if (!this._phones.has(normalized)) {
        this._phones.set(normalized, {
          sources: new Set(),
          score: validation.score,
          occurrences: 0,
          type: contactType
        });
      }
      
      const record = this._phones.get(normalized);
      
      // Adicionar score da fonte (só primeira vez por tipo)
      if (!record.sources.has(sourceType)) {
        record.score += sourceScore;
        record.sources.add(sourceType);
      }
      
      record.occurrences++;
      
      // Bônus por múltiplas ocorrências
      if (record.occurrences > 1) {
        record.score += CONFIG.scores.occurrence;
      }
      
      return normalized;
    },
    
    getFiltered() {
      const result = [];
      
      this._phones.forEach((record, num) => {
        if (record.score >= CONFIG.minValidScore && !this._archived.has(num) && !this._blocked.has(num)) {
          result.push(num);
        }
      });
      
      return [...new Set(result)].sort();
    },
    
    getArchived() {
      const result = [];
      this._archived.forEach(num => {
        const record = this._phones.get(num);
        if (record && record.score >= CONFIG.minValidScore) {
          result.push(num);
        }
      });
      return [...new Set(result)].sort();
    },
    
    getBlocked() {
      const result = [];
      this._blocked.forEach(num => {
        const record = this._phones.get(num);
        if (record && record.score >= CONFIG.minValidScore) {
          result.push(num);
        }
      });
      return [...new Set(result)].sort();
    },
    
    getAllByType() {
      return {
        normal: this.getFiltered(),
        archived: this.getArchived(),
        blocked: this.getBlocked()
      };
    },
    
    getAllWithDetails() {
      const result = [];
      this._phones.forEach((record, num) => {
        result.push({
          number: num,
          score: record.score,
          sources: Array.from(record.sources),
          occurrences: record.occurrences,
          valid: record.score >= CONFIG.minValidScore,
          type: this._archived.has(num) ? 'archived' : this._blocked.has(num) ? 'blocked' : 'normal'
        });
      });
      return result.sort((a, b) => b.score - a.score);
    },
    
    getStats() {
      let valid = 0, invalid = 0;
      this._phones.forEach((record) => {
        if (record.score >= CONFIG.minValidScore) valid++;
        else invalid++;
      });
      return {
        total: this._phones.size,
        valid,
        invalid,
        archived: this._archived.size,
        blocked: this._blocked.size,
        minScore: CONFIG.minValidScore
      };
    },
    
    clear() {
      this._phones.clear();
      this._archived.clear();
      this._blocked.clear();
    }
  };

  window.PhoneStore = PhoneStore;

  // ===== EXTRAÇÃO APENAS DE FONTES CONFIÁVEIS =====
  
  function extractFromText(text, sourceType) {
    if (!text || typeof text !== 'string') return 0;
    let count = 0;
    
    // APENAS padrões de alta confiança
    
    // @c.us (ID WhatsApp)
    const waIdRe = /(\d{10,15})@c\.us/g;
    let match;
    while ((match = waIdRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], 'cus', text)) count++;
    }
    
    // @g.us (grupos)
    const groupRe = /(\d{10,15})@g\.us/g;
    while ((match = groupRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], 'gus', text)) count++;
    }
    
    // wa.me links
    const waMeRe = /wa\.me\/(\d{10,15})/g;
    while ((match = waMeRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], 'wame', text)) count++;
    }
    
    // phone= parameter
    const phoneRe = /phone=(\d{10,15})/g;
    while ((match = phoneRe.exec(text)) !== null) {
      if (PhoneStore.add(match[1], 'phone', text)) count++;
    }
    
    // NÃO extrair números raw/formatados - muito falso positivo
    
    return count;
  }

  function extractFromElement(el) {
    if (!el) return 0;
    let count = 0;
    
    // APENAS data-id e data-jid com @c.us ou @g.us
    ['data-id', 'data-jid'].forEach(attr => {
      try {
        const val = el.getAttribute?.(attr);
        if (val && (val.includes('@c.us') || val.includes('@g.us'))) {
          const match = val.match(/(\d{10,15})@[cg]\.us/);
          if (match) {
            if (PhoneStore.add(match[1], attr === 'data-id' ? 'dataid' : 'datajid', val)) {
              count++;
            }
          }
        }
      } catch (e) {
        if (CONFIG.debug) whlLog.warn('Erro ao extrair atributo', attr, e.message);
      }
    });
    
    // href com wa.me
    try {
      const href = el.getAttribute?.('href');
      if (href && href.includes('wa.me')) {
        count += extractFromText(href, 'wame');
      }
    } catch (e) {
      if (CONFIG.debug) whlLog.warn('Erro ao extrair href wa.me:', e.message);
    }
    
    return count;
  }

  function extractFromDOM() {
    let count = 0;
    
    // APENAS elementos com data-id/@c.us
    document.querySelectorAll('[data-id*="@c.us"], [data-id*="@g.us"]').forEach(el => {
      count += extractFromElement(el);
    });
    
    // APENAS elementos com data-jid/@c.us
    document.querySelectorAll('[data-jid*="@c.us"], [data-jid*="@g.us"]').forEach(el => {
      count += extractFromElement(el);
    });
    
    // Links wa.me
    document.querySelectorAll('a[href*="wa.me"]').forEach(el => {
      count += extractFromElement(el);
    });
    
    return count;
  }
  
  // ===== EXTRAIR CONTATOS ARQUIVADOS =====
  function extractArchivedContacts() {
    let count = 0;
    
    try {
      // Método 1: Usar window.WHL_Store para pegar chats arquivados (via bridge)
      if (window.WHL_Store?.Chat?.models) {
        const chats = window.WHL_Store.Chat.models;
        chats.forEach(chat => {
          try {
            // Verificar se é arquivado
            const isArchived = chat.archived || chat.archiveAtMentionViewedInDrawer || 
                              chat.archive || chat.isArchive;
            
            if (isArchived && chat.id?._serialized) {
              const id = chat.id._serialized;
              if (id.endsWith('@c.us')) {
                const match = id.match(/(\d{10,15})@c\.us/);
                if (match) {
                  if (PhoneStore.add(match[1], 'cus', id, 'archived')) {
                    count++;
                  }
                }
              }
            }
          } catch (e) {
            // Ignorar erros individuais
          }
        });
      }
      
      // Método 2: Procurar pela seção de arquivados no DOM
      const archivedSection = document.querySelector('[data-testid="archived"]') ||
                              document.querySelector('[aria-label*="rquivad"]') ||
                              document.querySelector('[aria-label*="Archived"]');
      
      if (archivedSection) {
        whlLog.info('📁 Seção de arquivados encontrada');
        // Extrair números desta seção marcando como arquivados
        archivedSection.querySelectorAll('[data-id*="@c.us"]').forEach(el => {
          const dataId = el.getAttribute('data-id');
          if (dataId) {
            const match = dataId.match(/(\d{10,15})@c\.us/);
            if (match) {
              if (PhoneStore.add(match[1], 'dataid', dataId, 'archived')) {
                count++;
              }
            }
          }
        });
      }
      
      // Método 3: Procurar no localStorage por chaves relacionadas a "archived"
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('archived') || key.includes('archive'))) {
          const value = localStorage.getItem(key);
          if (value && value.includes('@c.us')) {
            // Trabalhar diretamente com a string para melhor performance
            const matches = value.matchAll(/(\d{10,15})@c\.us/g);
            for (const match of matches) {
              if (PhoneStore.add(match[1], 'cus', value, 'archived')) {
                count++;
              }
            }
          }
        }
      }
      
      whlLog.info(`📁 Contatos arquivados encontrados: ${count}`);
    } catch (e) {
      whlLog.error('Erro ao extrair arquivados:', e);
    }
    
    return count;
  }
  
  // ===== EXTRAIR CONTATOS BLOQUEADOS =====
  function extractBlockedContacts() {
    let count = 0;
    
    try {
      // Método 1: Usar window.WHL_Store.Blocklist (via bridge)
      if (window.WHL_Store?.Blocklist?.models) {
        const blocked = window.WHL_Store.Blocklist.models;
        blocked.forEach(contact => {
          try {
            const id = contact.id?._serialized || contact.id?.user;
            if (id) {
              const match = String(id).match(/(\d{10,15})/);
              if (match) {
                if (PhoneStore.add(match[1], 'cus', String(id), 'blocked')) {
                  count++;
                }
              }
            }
          } catch (e) {
            // Ignorar erros individuais
          }
        });
      }
      
      // Método 2: Procurar no localStorage por chaves relacionadas a "block"
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('block') || key.includes('Block'))) {
          const value = localStorage.getItem(key);
          if (value && value.includes('@c.us')) {
            // Trabalhar diretamente com a string para melhor performance
            const matches = value.matchAll(/(\d{10,15})@c\.us/g);
            for (const match of matches) {
              if (PhoneStore.add(match[1], 'cus', value, 'blocked')) {
                count++;
              }
            }
          }
        }
      }
      
      // Método 3: Procurar no sessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('block') || key.includes('Block'))) {
          const value = sessionStorage.getItem(key);
          if (value && value.includes('@c.us')) {
            // Trabalhar diretamente com a string para melhor performance
            const matches = value.matchAll(/(\d{10,15})@c\.us/g);
            for (const match of matches) {
              if (PhoneStore.add(match[1], 'cus', value, 'blocked')) {
                count++;
              }
            }
          }
        }
      }
      
      // Método 4: Procurar elementos de contatos bloqueados no DOM
      const blockedElements = document.querySelectorAll('[data-testid="blocked-contact"], [aria-label*="bloqueado"], [aria-label*="blocked"]');
      blockedElements.forEach(el => {
        const dataId = el.getAttribute('data-id');
        if (dataId) {
          const match = dataId.match(/(\d{10,15})@c\.us/);
          if (match) {
            if (PhoneStore.add(match[1], 'dataid', dataId, 'blocked')) {
              count++;
            }
          }
        }
      });
      
      whlLog.info(`🚫 Contatos bloqueados encontrados: ${count}`);
    } catch (e) {
      whlLog.error('Erro ao extrair bloqueados:', e);
    }
    
    return count;
  }

  function extractFromStorage() {
    let count = 0;
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        // APENAS valores com @c.us ou @g.us
        if (value && (value.includes('@c.us') || value.includes('@g.us'))) {
          count += extractFromText(value, 'cus');
        }
      }
    } catch (e) {
      if (CONFIG.debug) whlLog.warn('Erro ao extrair de localStorage:', e.message);
    }
    
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        if (value && (value.includes('@c.us') || value.includes('@g.us'))) {
          count += extractFromText(value, 'cus');
        }
      }
    } catch (e) {
      if (CONFIG.debug) whlLog.warn('Erro ao extrair de sessionStorage:', e.message);
    }
    
    return count;
  }

  async function extractFromIndexedDB() {
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
            if (storeName.includes('chat') || storeName.includes('contact')) {
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
                      count += extractFromText(str, 'cus');
                    }
                  });
                }
              } catch (e) {
                if (CONFIG.debug) whlLog.warn('Erro ao ler store IndexedDB:', storeName, e.message);
              }
            }
          }
          
          db.close();
        } catch (e) {
          if (CONFIG.debug) whlLog.warn('Erro ao abrir IndexedDB:', dbInfo.name, e.message);
        }
      }
    } catch (e) {
      if (CONFIG.debug) whlLog.warn('Erro ao listar databases IndexedDB:', e.message);
    }
    
    return count;
  }

  // ===== SCROLL =====
  // Flags de controle
  let extractionPaused = false;
  let extractionCancelled = false;
  
  async function turboScroll() {
    const pane = document.querySelector('#pane-side');
    if (!pane) return;
    
    whlLog.info('📜 Iniciando scroll...');
    
    // Resetar flags de controle
    extractionPaused = false;
    extractionCancelled = false;
    
    // Timeout absoluto para evitar loops infinitos
    const startTime = Date.now();
    const maxTime = CONFIG.maxExtractionTime;
    
    pane.scrollTop = 0;
    await new Promise(r => setTimeout(r, 500));
    
    let lastTop = -1;
    let stable = 0;
    let scrollCount = 0;
    
    while (stable < CONFIG.stabilityCount && scrollCount < CONFIG.maxScrolls) {
      // Verificar timeout absoluto
      if (Date.now() - startTime > maxTime) {
        whlLog.warn('⏱️ Timeout máximo de extração atingido (2 minutos)');
        break;
      }
      
      // Verificar se foi cancelado
      if (extractionCancelled) {
        whlLog.info('⛔ Extração cancelada pelo usuário');
        break;
      }
      
      // Verificar se foi pausado
      while (extractionPaused && !extractionCancelled) {
        await new Promise(r => setTimeout(r, 500));
      }
      
      // Se cancelou durante a pausa, sair
      if (extractionCancelled) {
        whlLog.info('⛔ Extração cancelada durante pausa');
        break;
      }
      
      extractFromDOM();
      
      const increment = Math.floor(pane.clientHeight * CONFIG.scrollIncrement);
      pane.scrollTop = Math.min(pane.scrollTop + increment, pane.scrollHeight);
      pane.dispatchEvent(new Event('scroll', { bubbles: true }));
      
      scrollCount++;
      
      const progress = Math.min(80, 10 + Math.round((scrollCount / CONFIG.maxScrolls) * 70));
      window.postMessage({
        type: 'WHL_EXTRACT_PROGRESS',
        progress,
        count: PhoneStore.getFiltered().length,
        paused: extractionPaused
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
        whlLog.info(`Scroll ${scrollCount}/${CONFIG.maxScrolls}, válidos: ${stats.valid}`);
      }
    }
    
    pane.scrollTop = 0;
    await new Promise(r => setTimeout(r, 500));
    extractFromDOM();
    
    if (extractionCancelled) {
      whlLog.info(`⛔ Extração cancelada: ${scrollCount} scrolls executados`);
    } else {
      whlLog.info(`✅ Scroll concluído: ${scrollCount} scrolls`);
    }
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
          extractFromText(text, 'cus');
        }
      } catch (e) {
        if (CONFIG.debug) whlLog.warn('Erro ao interceptar resposta fetch:', e.message);
      }
      return response;
    };
    
    // Usar Proxy ao invés de sobrescrever prototype
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(OriginalWebSocket, {
      construct(target, args) {
        const ws = new target(...args);
        ws.addEventListener('message', function(e) {
          try {
            if (e.data && typeof e.data === 'string') {
              if (e.data.includes('@c.us') || e.data.includes('@g.us')) {
                extractFromText(e.data, 'cus');
              }
            }
          } catch (err) {
            whlLog.warn('Erro ao processar mensagem WebSocket:', err.message);
          }
        });
        return ws;
      }
    });
    
    whlLog.info('🔌 Network hooks instalados');
  }

  // ===== FUNÇÃO PRINCIPAL =====
  async function extractAll() {
    whlLog.info('🚀🚀🚀 EXTRAÇÃO TURBO v7 - FILTRO ULTRA-RIGOROSO 🚀🚀🚀');
    whlLog.info('Score mínimo:', CONFIG.minValidScore);
    
    PhoneStore.clear();
    
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 5, count: 0 }, '*');
    
    // Inicializar Store antes de extrair
    await waitForWA();
    initStore();
    
    installNetworkHooks();
    
    // Fase 1: DOM
    whlLog.info('📱 Fase 1: DOM...');
    extractFromDOM();
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 10, count: PhoneStore.getFiltered().length }, '*');
    
    // Fase 2: Storage
    whlLog.info('💾 Fase 2: Storage...');
    extractFromStorage();
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 15, count: PhoneStore.getFiltered().length }, '*');
    
    // Fase 3: IndexedDB
    whlLog.info('🗄️ Fase 3: IndexedDB...');
    await extractFromIndexedDB();
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 18, count: PhoneStore.getFiltered().length }, '*');
    
    // Fase 3.5: Arquivados e Bloqueados
    whlLog.info('📁 Fase 3.5: Contatos arquivados e bloqueados...');
    extractArchivedContacts();
    extractBlockedContacts();
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 20, count: PhoneStore.getFiltered().length }, '*');
    
    // Fase 4: Scroll
    whlLog.info('📜 Fase 4: Scroll...');
    await turboScroll();
    
    // Fase 5: Final
    whlLog.info('🔍 Fase 5: Extração final...');
    extractFromDOM();
    extractFromStorage();
    extractArchivedContacts();
    extractBlockedContacts();
    
    await new Promise(r => setTimeout(r, 2000));
    extractFromDOM();
    
    window.postMessage({ type: 'WHL_EXTRACT_PROGRESS', progress: 100, count: PhoneStore.getFiltered().length }, '*');
    
    // Obter resultados por categoria
    const byType = PhoneStore.getAllByType();
    const stats = PhoneStore.getStats();
    
    whlLog.info('✅✅✅ EXTRAÇÃO v7 CONCLUÍDA ✅✅✅');
    whlLog.info('Estatísticas:', stats);
    whlLog.info('Números normais:', byType.normal.length);
    whlLog.info('Números arquivados:', byType.archived.length);
    whlLog.info('Números bloqueados:', byType.blocked.length);
    
    try {
      localStorage.setItem('whl_extracted_numbers', JSON.stringify(byType.normal));
      localStorage.setItem('whl_extracted_archived', JSON.stringify(byType.archived));
      localStorage.setItem('whl_extracted_blocked', JSON.stringify(byType.blocked));
    } catch (e) {
      whlLog.warn('Erro ao salvar números no localStorage:', e.message);
    }
    
    return byType;
  }

  // ===== LISTENER =====
  window.addEventListener('message', async (ev) => {
    if (!ev?.data?.type) return;
    
    if (ev.data.type === 'WHL_EXTRACT_CONTACTS') {
      try {
        const byType = await extractAll();
        // Enviar resultados categorizados
        window.postMessage({ 
          type: 'WHL_EXTRACT_RESULT', 
          normal: byType.normal,
          archived: byType.archived,
          blocked: byType.blocked,
          numbers: byType.normal  // backward compatibility
        }, '*');
      } catch (e) {
        whlLog.error('Erro:', e);
        window.postMessage({ type: 'WHL_EXTRACT_ERROR', error: String(e) }, '*');
      }
    }
    
    if (ev.data.type === 'WHL_PAUSE_EXTRACTION') {
      extractionPaused = true;
      whlLog.info('⏸️ Extração pausada');
      window.postMessage({ type: 'WHL_EXTRACTION_PAUSED' }, '*');
    }
    
    if (ev.data.type === 'WHL_RESUME_EXTRACTION') {
      extractionPaused = false;
      whlLog.info('▶️ Extração retomada');
      window.postMessage({ type: 'WHL_EXTRACTION_RESUMED' }, '*');
    }
    
    if (ev.data.type === 'WHL_CANCEL_EXTRACTION') {
      extractionCancelled = true;
      whlLog.info('⛔ Extração cancelada');
      const byType = PhoneStore.getAllByType();
      window.postMessage({ 
        type: 'WHL_EXTRACT_RESULT', 
        normal: byType.normal,
        archived: byType.archived,
        blocked: byType.blocked,
        numbers: byType.normal,  // backward compatibility
        cancelled: true
      }, '*');
    }
  });

  // ===== DEBUG =====
  window.__WHL_TURBO_V7__ = {
    extract: extractAll,
    store: PhoneStore,
    config: CONFIG,
    validate: validatePhone,
    getFiltered: () => PhoneStore.getFiltered(),
    getAll: () => PhoneStore.getAllWithDetails(),
    getStats: () => PhoneStore.getStats(),
    setMinScore: (s) => { CONFIG.minValidScore = s; whlLog.info('Score mínimo:', s); }
  };

  whlLog.info('✅ EXTRATOR TURBO v7 - FILTRO ULTRA-RIGOROSO carregado!');
  whlLog.info('📊 Debug: window.__WHL_TURBO_V7__.getStats()');
})();
