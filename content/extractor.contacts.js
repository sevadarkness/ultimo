/**
 * WhatsHybrid – EXTRATOR HÍBRIDO (SAFE + ELITE) COM MELHORIAS
 * - Não cria UI / popup
 * - Mantém painel atual
 * - Integrado ao HarvesterStore (processPhone)
 * - Comunicação via window.postMessage
 *
 * MODOS:
 * - safe: determinístico (estilo isolado) + validações fortes
 * - hybrid: safe + elite score (default) - score mínimo 5
 * - aggressive: hybrid + varredura mais ampla + mais scroll + mais fontes
 *
 * MELHORIAS v2:
 * - Score mínimo aumentado para 5 (reduz falsos positivos)
 * - Validação de DDD brasileiro (bônus +3 para DDDs válidos)
 * - Normalização de números (5521... e 21... são tratados como o mesmo)
 * - Lista completa de DDDs brasileiros válidos
 *
 * CONFIG (opcional):
 * window.__WHL_ELITE_CONFIG__ = { mode:'hybrid'|'safe'|'aggressive', weights:{...}, audit:true }
 * localStorage 'whl_elite_config' = JSON string com o mesmo formato
 */

(function () {
  if (window.__WHL_EXTRACTOR_HYBRID_LOADED__) return;
  window.__WHL_EXTRACTOR_HYBRID_LOADED__ = true;

  // ===== DDDs BRASILEIROS VÁLIDOS =====
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
    // Pernambuco / Alagoas / Paraíba / Rio Grande do Norte
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    // Pará / Amazonas / Roraima / Amapá / Maranhão / Piauí / Ceará
    91, 92, 93, 94, 95, 96, 97, 98, 99
  ]);

  /**
   * Verifica se o número tem um DDD brasileiro válido
   * @param {string} num - Número a verificar
   * @returns {boolean} true se tiver DDD válido
   */
  function hasBrazilianDDD(num) {
    let n = num;
    // Remover código do país se presente
    if (n.startsWith('55') && n.length >= 12) {
      n = n.substring(2);
    }
    // Verificar DDD (primeiros 2 dígitos)
    if (n.length >= 10) {
      const ddd = parseInt(n.substring(0, 2), 10);
      return VALID_DDDS.has(ddd);
    }
    return false;
  }

  /**
   * Normaliza o número para formato padrão (com 55)
   * Isso evita duplicatas como 5521999999999 e 21999999999
   * @param {string} num - Número a normalizar
   * @returns {string} Número normalizado
   */
  function normalizePhone(num) {
    if (!num) return '';
    // Já tem código do país
    if (num.startsWith('55') && num.length >= 12) {
      return num;
    }
    // Número brasileiro sem código do país (10 ou 11 dígitos)
    if (num.length === 10 || num.length === 11) {
      return '55' + num;
    }
    // Outros formatos, retornar como está
    return num;
  }

  function getStore() {
    return window.HarvesterStore || null;
  }

  function loadCfg() {
    let cfg = {};
    try {
      const ls = localStorage.getItem('whl_elite_config');
      if (ls) cfg = JSON.parse(ls) || {};
    } catch {}
    try {
      if (window.__WHL_ELITE_CONFIG__ && typeof window.__WHL_ELITE_CONFIG__ === 'object') {
        cfg = { ...cfg, ...window.__WHL_ELITE_CONFIG__ };
      }
    } catch {}
    return cfg;
  }

  const DEFAULTS = {
    mode: 'hybrid', // safe | hybrid | aggressive
    audit: true,
    scrollDelay: 1000,
    scrollIncrement: 0.75,
    stabilityCount: 5,
    maxScrollsCap: 120,
    minScoreHybrid: 5, // MELHORIA: Score mínimo aumentado para 5
    // pesos ajustáveis
    weights: {
      // padrões fortes (WhatsApp)
      pattern_cus: 10,      // (\d+)@c.us
      pattern_wame: 8,      // wa.me/\d+
      pattern_send: 8,      // whatsapp://send?phone=
      pattern_chat: 6,      // chat/\d+
      pattern_contact: 6,   // contact/\d+

      // atributos fortes
      attr_data_id: 5,
      attr_data_jid: 5,
      attr_href: 4,
      attr_title: 3,
      attr_aria_label: 3,
      attr_data_testid: 2,

      // contexto
      term_contact: 2,
      term_telefone: 2,
      term_phone: 2,
      term_chat: 1,
      term_mensagem: 1,
      term_message: 1,

      // bônus de elemento
      bonus_parent_has_id_or_jid: 3,
      bonus_parent_testid_contact_or_chat: 2,
      bonus_element_contact_or_link: 3,

      // MELHORIA: Bônus por DDD brasileiro válido
      bonus_brazilian_ddd: 3,

      // comprimento
      len_11_plus: 2,
      len_10: 1
    }
  };

  const CONFIG = (() => {
    const cfg = loadCfg();
    const weights = { ...DEFAULTS.weights, ...(cfg.weights || {}) };
    const mode = (cfg.mode || DEFAULTS.mode || 'hybrid').toLowerCase();
    return {
      mode: (mode === 'safe' || mode === 'aggressive' || mode === 'hybrid') ? mode : 'hybrid',
      audit: cfg.audit !== undefined ? !!cfg.audit : DEFAULTS.audit,
      scrollDelay: typeof cfg.scrollDelay === 'number' ? cfg.scrollDelay : DEFAULTS.scrollDelay,
      scrollIncrement: typeof cfg.scrollIncrement === 'number' ? cfg.scrollIncrement : DEFAULTS.scrollIncrement,
      stabilityCount: typeof cfg.stabilityCount === 'number' ? cfg.stabilityCount : DEFAULTS.stabilityCount,
      maxScrollsCap: typeof cfg.maxScrollsCap === 'number' ? cfg.maxScrollsCap : DEFAULTS.maxScrollsCap,
      minScoreHybrid: typeof cfg.minScoreHybrid === 'number' ? cfg.minScoreHybrid : DEFAULTS.minScoreHybrid,
      weights
    };
  })();

  // Seletores (mantém compat com ambos)
  const SELECTORS = {
    chatList: '#pane-side, [data-testid="chat-list"]',
    chatItems: '[role="row"], [role="listitem"], [data-testid*="cell-chat"]',
    contactElements: '[data-testid*="contact"], [data-testid*="cell"]',
    phoneLinks: 'a[href*="@c.us"], a[href*="phone"], a[href*="wa.me"]'
  };

  // Atributos e padrões (base ELITE)
  const WHATSAPP_ATTRS = [
    { name: 'data-id', w: CONFIG.weights.attr_data_id },
    { name: 'data-jid', w: CONFIG.weights.attr_data_jid },
    { name: 'href', w: CONFIG.weights.attr_href },
    { name: 'title', w: CONFIG.weights.attr_title },
    { name: 'aria-label', w: CONFIG.weights.attr_aria_label },
    { name: 'data-testid', w: CONFIG.weights.attr_data_testid }
  ];

  const PATTERNS = [
    { key: 'pattern_cus', re: /(\d{8,15})@c\.us/g, w: CONFIG.weights.pattern_cus },
    { key: 'pattern_wame', re: /wa\.me\/(\d{8,15})/g, w: CONFIG.weights.pattern_wame },
    { key: 'pattern_send', re: /whatsapp:\/\/send\?phone=(\d{8,15})/g, w: CONFIG.weights.pattern_send },
    { key: 'pattern_chat', re: /chat\/(\d{8,15})/g, w: CONFIG.weights.pattern_chat },
    { key: 'pattern_contact', re: /contact\/(\d{8,15})/g, w: CONFIG.weights.pattern_contact }
  ];

  const TERMS = [
    { term: 'contact', w: CONFIG.weights.term_contact },
    { term: 'telefone', w: CONFIG.weights.term_telefone },
    { term: 'phone', w: CONFIG.weights.term_phone },
    { term: 'chat', w: CONFIG.weights.term_chat },
    { term: 'mensagem', w: CONFIG.weights.term_mensagem },
    { term: 'message', w: CONFIG.weights.term_message }
  ];

  // Estado interno
  let processed = new WeakSet();
  let scoreMap = new Map(); // num (normalizado) -> score
  let audit = {
    mode: CONFIG.mode,
    hits: {},
    top: []
  };

  function hit(k, inc = 1) {
    audit.hits[k] = (audit.hits[k] || 0) + inc;
  }

  function normalize(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function isLenOk(n) {
    return n.length >= 8 && n.length <= 15;
  }

  /**
   * SAFE GATE (determinístico):
   * - Só aceita números 8-15
   * - Só se vier de DOM/atributo/link/padrões WhatsApp
   * - Não inventa; só extrai do texto/atributo real
   */
  function safeExtractFromText(text) {
    if (!text) return [];
    const out = new Set();

    const str = String(text);
    const norm = normalize(str);
    const m1 = norm.match(/\d{8,15}/g);
    if (m1) m1.forEach(x => out.add(x));

    // patterns @c.us (forte)
    let mm;
    const reCus = /(\d{8,15})@c\.us/g;
    while ((mm = reCus.exec(str)) !== null) out.add(mm[1]);

    return Array.from(out).filter(isLenOk);
  }

  function findChatList() {
    const direct = document.querySelector(SELECTORS.chatList);
    if (direct) return direct;

    const candidates = Array.from(document.querySelectorAll('div')).filter(el => {
      try {
        return el.scrollHeight > el.clientHeight + 10 &&
               el.querySelector(SELECTORS.chatItems);
      } catch {
        return false;
      }
    });

    candidates.sort((a, b) =>
      b.querySelectorAll(SELECTORS.chatItems).length -
      a.querySelectorAll(SELECTORS.chatItems).length
    );

    return candidates[0] || null;
  }

  function calcEliteScore(num, context, el) {
    if (!isLenOk(num)) return 0;

    let s = 0;

    // comprimento
    if (num.length >= 11) s += CONFIG.weights.len_11_plus;
    else if (num.length >= 10) s += CONFIG.weights.len_10;

    // MELHORIA: Bônus por DDD brasileiro válido
    if (hasBrazilianDDD(num)) {
      s += CONFIG.weights.bonus_brazilian_ddd;
      hit('bonus_brazilian_ddd', 1);
    }

    // padrões fortes no contexto
    for (const p of PATTERNS) {
      const re = new RegExp(p.re.source, p.re.flags);
      let m;
      while ((m = re.exec(context)) !== null) {
        if (m[1] === num) {
          s += p.w;
          hit(p.key, 1);
          break;
        }
      }
    }

    // termos contextuais
    const ctxLow = context.toLowerCase();
    for (const t of TERMS) {
      if (ctxLow.includes(t.term)) {
        s += t.w;
        hit('term_' + t.term, 1);
      }
    }

    // bônus por parent
    if (el && el.parentElement) {
      const p = el.parentElement;
      if (p.hasAttribute('data-id') || p.hasAttribute('data-jid')) {
        s += CONFIG.weights.bonus_parent_has_id_or_jid;
        hit('bonus_parent_id_or_jid', 1);
      }
      const dt = p.getAttribute('data-testid') || '';
      if (dt.includes('contact') || dt.includes('chat')) {
        s += CONFIG.weights.bonus_parent_testid_contact_or_chat;
        hit('bonus_parent_testid', 1);
      }
    }

    // bônus por elemento relevante
    try {
      if (el && (el.matches(SELECTORS.contactElements) || el.matches(SELECTORS.phoneLinks))) {
        s += CONFIG.weights.bonus_element_contact_or_link;
        hit('bonus_element_contact_or_link', 1);
      }
    } catch {}

    return s;
  }

  function rememberScore(num, scoreAddOrSet, mode = 'max') {
    // MELHORIA: Normalizar número antes de armazenar
    const normalizedNum = normalizePhone(num);
    const prev = scoreMap.get(normalizedNum) || 0;
    const next = (mode === 'add') ? (prev + scoreAddOrSet) : Math.max(prev, scoreAddOrSet);
    scoreMap.set(normalizedNum, next);
    return next;
  }

  function pushToStore(num, origin, meta) {
    const store = getStore();
    if (!store) return;

    // MELHORIA: Normalizar número antes de enviar ao store
    const normalizedNum = normalizePhone(num);
    store.processPhone(normalizedNum, origin, meta || {});
  }

  function eliteScanTextAndStore(text, ctxEl, origin) {
    if (!text) return;

    const store = getStore();
    if (!store) return;

    const nums = safeExtractFromText(text);
    if (!nums.length) return;

    const context = ctxEl ? (ctxEl.outerHTML || ctxEl.textContent || text) : text;

    for (const num of nums) {
      const score = calcEliteScore(num, context, ctxEl);
      const normalizedNum = normalizePhone(num);

      // Gate por modo
      if (CONFIG.mode === 'safe') {
        rememberScore(num, score, 'max');
        pushToStore(num, store.ORIGINS ? store.ORIGINS.DOM : 'dom', { source: 'hybrid-safe', score: scoreMap.get(normalizedNum) || 0 });
        hit('safe_accept', 1);
        continue;
      }

      // HYBRID/AGGRESSIVE: exige score mínimo (MELHORIA: agora é 5)
      rememberScore(num, score, 'max');
      const finalScore = scoreMap.get(normalizedNum) || 0;

      if (finalScore >= CONFIG.minScoreHybrid) {
        pushToStore(num, store.ORIGINS ? store.ORIGINS.DOM : 'dom', { source: 'hybrid-elite', score: finalScore });
        hit('elite_accept', 1);
      } else {
        // Score baixo - ainda processa mas marca como fraco
        pushToStore(num, store.ORIGINS ? store.ORIGINS.DOM : 'dom', { source: 'hybrid-weak', score: finalScore });
        hit('elite_weak', 1);
      }
    }
  }

  function collectDeep(el) {
    if (!el || processed.has(el)) return;
    processed.add(el);

    // atributos relevantes
    for (const a of WHATSAPP_ATTRS) {
      const v = el.getAttribute && el.getAttribute(a.name);
      if (v) {
        hit('src_attr_' + a.name, 1);
        eliteScanTextAndStore(v, el, 'attr');
        const nums = safeExtractFromText(v);
        for (const num of nums) rememberScore(num, a.w, 'add');
      }
    }

    // texto
    if (el.textContent) {
      hit('src_text', 1);
      eliteScanTextAndStore(el.textContent, el, 'text');
    }

    // filhos diretos (performance)
    const kids = el.querySelectorAll ? el.querySelectorAll(':scope > *') : [];
    kids.forEach(collectDeep);
  }

  function findAllSources() {
    const sources = [];

    const pane = document.querySelector('#pane-side');
    if (pane) sources.push(pane);

    // fortes
    document.querySelectorAll('[data-id], [data-jid]').forEach(el => sources.push(el));
    document.querySelectorAll(SELECTORS.phoneLinks).forEach(el => sources.push(el));
    document.querySelectorAll(SELECTORS.contactElements).forEach(el => sources.push(el));

    // médios
    document.querySelectorAll('span[title], [aria-label]').forEach(el => {
      const t = (el.getAttribute('title') || el.getAttribute('aria-label') || '');
      if (/\d{8,15}|@c\.us|phone|contato|contact/i.test(t)) sources.push(el);
    });

    // agressivo: varre mais coisas
    if (CONFIG.mode === 'aggressive') {
      document.querySelectorAll('[role="row"], [role="listitem"]').forEach(el => sources.push(el));
      document.querySelectorAll('a[href], button, header').forEach(el => sources.push(el));
      hit('aggressive_sources', sources.length);
    }

    return sources;
  }

  function finalizeAuditAndEmit() {
    const store = getStore();
    if (!store) return;

    const arr = Array.from(scoreMap.entries())
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 30)
      .map(([num, score]) => ({ num, score, valid: store._valid ? store._valid.has(num) : false }));

    audit.top = arr;

    if (CONFIG.audit) {
      try {
        console.groupCollapsed(`[WHL][HYBRID] Auditoria (${CONFIG.mode})`);
        console.log('hits:', audit.hits);
        console.log('minScoreHybrid:', CONFIG.minScoreHybrid);
        console.table(audit.top);
        console.groupEnd();
      } catch {}
      window.postMessage({ type: 'WHL_HYBRID_AUDIT', audit }, '*');
    }
  }

  async function extractAllHybrid() {
    const store = getStore();
    if (!store) {
      console.error('[WHL] HarvesterStore não disponível!');
      throw new Error('HarvesterStore não disponível');
    }

    // reset interno
    processed = new WeakSet();
    scoreMap.clear();
    audit = { mode: CONFIG.mode, hits: {}, top: [] };

    console.log(`[WHL] 🚀 Iniciando extração HÍBRIDA (mode=${CONFIG.mode}, minScore=${CONFIG.minScoreHybrid})`);

    const list = findChatList();
    if (!list) throw new Error('Lista de chats não encontrada');

    list.scrollTop = 0;
    await new Promise(r => setTimeout(r, 800));

    let lastTop = -1;
    let stable = 0;
    let scrollCount = 0;

    const scrollHeight = list.scrollHeight || 10000;
    const clientHeight = list.clientHeight || 100;
    const est = Math.ceil(scrollHeight / (clientHeight * (CONFIG.scrollIncrement || 0.7))) || 50;

    let maxScrolls = Math.min(est, CONFIG.maxScrollsCap);
    if (CONFIG.mode === 'aggressive') maxScrolls = Math.min(Math.max(maxScrolls, 80), CONFIG.maxScrollsCap);

    const scanVisible = () => {
      const items = list.querySelectorAll(SELECTORS.chatItems);
      items.forEach(collectDeep);

      const sources = findAllSources();
      sources.forEach(collectDeep);
    };

    // primeira varredura
    scanVisible();

    while (stable < (CONFIG.mode === 'aggressive' ? (CONFIG.stabilityCount + 2) : CONFIG.stabilityCount) && scrollCount < maxScrolls) {
      const progress = Math.min(95, Math.round(((scrollCount + 1) / maxScrolls) * 90));

      window.postMessage({
        type: 'WHL_EXTRACT_PROGRESS',
        progress,
        count: store._valid ? store._valid.size : 0
      }, '*');

      const inc = Math.floor(clientHeight * (CONFIG.mode === 'aggressive' ? Math.min(0.85, CONFIG.scrollIncrement + 0.1) : CONFIG.scrollIncrement));
      list.scrollTop = Math.min(list.scrollTop + inc, list.scrollHeight);
      list.dispatchEvent(new Event('scroll', { bubbles: true }));

      await new Promise(r => setTimeout(r, CONFIG.mode === 'aggressive' ? Math.max(650, CONFIG.scrollDelay - 250) : CONFIG.scrollDelay));

      scanVisible();

      if (Math.abs(list.scrollTop - lastTop) < 10) stable++;
      else stable = 0;

      lastTop = list.scrollTop;
      scrollCount++;
    }

    // volta pro topo e varre uma última vez
    list.scrollTop = 0;
    await new Promise(r => setTimeout(r, 1000));
    scanVisible();

    // final progress
    window.postMessage({
      type: 'WHL_EXTRACT_PROGRESS',
      progress: 100,
      count: store._valid ? store._valid.size : 0
    }, '*');

    finalizeAuditAndEmit();

    // retorno é a lista validada do store
    const result = store._valid ? Array.from(store._valid).sort() : [];
    console.log(`[WHL] ✅ Extração concluída: ${result.length} números válidos`);
    return result;
  }

  // Listener padrão
  window.addEventListener('message', async (ev) => {
    if (!ev || !ev.data || ev.data.type !== 'WHL_EXTRACT_CONTACTS') return;
    try {
      const nums = await extractAllHybrid();
      window.postMessage({ type: 'WHL_EXTRACT_RESULT', numbers: nums }, '*');
    } catch (e) {
      console.error('[WHL] Erro na extração:', e);
      window.postMessage({ type: 'WHL_EXTRACT_ERROR', error: String(e) }, '*');
    }
  });

  // Expor debug opcional
  window.__WHL_HYBRID__ = {
    config: () => ({ ...CONFIG }),
    auditLast: () => audit,
    scoresTop: (n = 50) =>
      Array.from(scoreMap.entries())
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .slice(0, Math.max(1, n))
        .map(([num, score]) => ({ num, score }))
  };

  console.log(`[WHL] ✅ Extrator HÍBRIDO v2 carregado (mode=${CONFIG.mode}, minScore=${CONFIG.minScoreHybrid})`);
})();
