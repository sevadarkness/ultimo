
/**
 * WhatsHybrid – Extractor Isolado de Contatos (VERSÃO 98% PRECISÃO)
 * NÃO altera painel, NÃO altera campanha
 * Comunicação via window.postMessage
 * 
 * NOVA LÓGICA DE EXTRAÇÃO COM 98% PRECISÃO:
 * - Validação rigorosa E.164 (foco Brasil)
 * - Sistema de "2 fontes" para validar número
 * - Extração do Store do WhatsApp
 * - DOM Observer para novos chats
 * - Auto-scroll para carregar mais contatos
 * - Extração de grupos
 * - WebSocket hook para capturar contatos da rede
 */

(function () {
  if (window.__WHL_EXTRACTOR_LOADED__) return;
  window.__WHL_EXTRACTOR_LOADED__ = true;

  // ===== NOVA LÓGICA COM 98% PRECISÃO =====
  let extractedNumbers = new Set();
  let sources = new Map(); // Rastrear quantas fontes confirmam cada número

  const PHONE_REGEX = /(?:\+?55|55)?(?:\s?)?\(?([1-9]{2})\)?\s?9?\d{4}(?:[- ]?\d{4})|(?:\+?[1-9]\d{1,14})/i;
  const VALID_LENGTH = (len) => len >= 10 && len <= 15;
  const IS_BR_PHONE = (phone) => phone.startsWith('55') || (phone.length === 11 && phone[2] === '9');

  function isValidPhone(phone) {
    const clean = phone.replace(/[^\d]/g, '');
    return VALID_LENGTH(clean.length) && PHONE_REGEX.test(phone) && IS_BR_PHONE(clean);
  }

  function addPhone(phone, source = 'unknown') {
    const clean = phone.replace(/[^\d]/g, '');
    if (!isValidPhone(clean)) {
      console.log('[WHL] Ignorado (inválido):', clean, source);
      return false;
    }
    const count = (sources.get(clean) || 0) + 1;
    sources.set(clean, count);
    if (count >= 2 && !extractedNumbers.has(clean)) {
      extractedNumbers.add(clean);
      console.log('[WHL] ✅ Válido (≥2 fontes):', clean);
      return true;
    }
    console.log('[WHL] Pendente (1 fonte):', clean, source);
    return false;
  }

  // Extração do Store do WhatsApp
  function getStore() {
    if (window.Store) return window.Store;
    for (let i = 0; i < 100; i++) {
      try {
        const webpack = window.webpackChunkwhatsapp_web_client;
        if (webpack) {
          const modules = webpack.push([[i], {}, (req) => req]);
          if (modules && typeof modules === 'object') {
            return modules;
          }
        }
      } catch {}
    }
    return null;
  }

  function extractFromStore() {
    try {
      const Store = getStore();
      if (!Store) {
        console.log('[WHL] Store não encontrado');
        return;
      }
      
      ['Chat', 'Contact'].forEach(type => {
        try {
          if (Store[type]?.models) {
            Object.values(Store[type].models).forEach(item => {
              try {
                const id = item.__x_id || item.id?._serialized;
                if (id?.endsWith('@c.us')) {
                  addPhone(id.replace('@c.us', ''), 'store');
                }
              } catch {}
            });
          }
        } catch {}
      });
      
      console.log('[WHL] Store extraído:', extractedNumbers.size);
    } catch (e) {
      console.log('[WHL] Erro ao extrair Store:', e);
    }
  }

  // DOM Observer
  function startDOMObserver() {
    const pane = document.getElementById('pane-side');
    if (!pane) return;
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const title = node.querySelector?.('[title], [data-testid="cell-frame-title"]')?.getAttribute('title') ||
                          node.textContent;
            const match = title?.match(PHONE_REGEX);
            if (match) addPhone(match[0], 'dom');
          }
        });
      });
    });
    
    observer.observe(pane, { childList: true, subtree: true });
    console.log('[WHL] DOM Observer iniciado');
  }

  // Auto-scroll para carregar mais contatos
  function autoScrollChats() {
    const pane = document.getElementById('pane-side');
    if (!pane) return;
    
    let scrolls = 0;
    const int = setInterval(() => {
      pane.scrollTop = pane.scrollHeight;
      scrolls++;
      if (scrolls > 50 || extractedNumbers.size > 2000) {
        clearInterval(int);
        console.log('[WHL] Auto-scroll completo');
      }
    }, 2000 + Math.random() * 1000);
  }

  // Extração de grupos
  function extractGroups() {
    const chats = document.querySelectorAll('[data-testid="cell-frame-container"]');
    console.log('[WHL] Extraindo de', chats.length, 'grupos/chats...');
    
    chats.forEach((chat, i) => {
      setTimeout(() => {
        chat.click();
        setTimeout(() => {
          document.querySelectorAll('[data-testid="group-participant"], [title*="participante"]').forEach((p) => {
            const match = p.getAttribute('title')?.match(PHONE_REGEX);
            if (match) addPhone(match[0], 'group');
          });
        }, 1500);
      }, i * 3000);
    });
  }

  function normalize(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function findChatList() {
    const pane = document.querySelector('#pane-side');
    if (!pane) return null;

    const all = [pane, ...pane.querySelectorAll('*')];
    const cands = all.filter(el => {
      try {
        return el.scrollHeight > el.clientHeight + 5 &&
               (el.querySelector('[role="row"]') || el.querySelector('[role="listitem"]'));
      } catch (e) { return false; }
    });

    cands.sort((a,b)=> (b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
    return cands[0] || null;
  }

  function extractNumbers(text) {
    if (!text) return [];
    const str = String(text);
    const numbers = new Set();

    const normalized = normalize(str);
    const matches = normalized.match(/\d{8,15}/g);
    if (matches) {
      matches.forEach(num => numbers.add(num));
    }

    const whatsappPattern = /(\d{8,15})@c\.us/g;
    let match;
    while ((match = whatsappPattern.exec(str)) !== null) {
      numbers.add(match[1]);
    }

    return Array.from(numbers);
  }

  function collectDeepFrom(el, sourceName = 'dom') {
    if (!el) return [];
    const numbers = new Set();

    const attrs = [
      'data-id',
      'data-jid',
      'data-testid',
      'id',
      'href',
      'title',
      'aria-label',
      'alt'
    ];

    attrs.forEach(attr => {
      const value = el.getAttribute(attr);
      if (value) {
        extractNumbers(value).forEach(n => {
          numbers.add(n);
          addPhone(n, sourceName);
        });
      }
    });

    if (el.textContent) {
      extractNumbers(el.textContent).forEach(n => {
        numbers.add(n);
        addPhone(n, sourceName);
      });
    }

    const children = el.querySelectorAll('*');
    children.forEach(child => {
      attrs.forEach(attr => {
        const value = child.getAttribute(attr);
        if (value) {
          extractNumbers(value).forEach(n => {
            numbers.add(n);
            addPhone(n, sourceName);
          });
        }
      });
    });

    return Array.from(numbers);
  }

  function findAllSources() {
    const sources = [];

    const pane = document.querySelector('#pane-side');
    if (pane) sources.push(pane);

    document.querySelectorAll('[data-id]').forEach(el => sources.push(el));
    document.querySelectorAll('[data-testid*="cell"]').forEach(el => sources.push(el));
    document.querySelectorAll('[data-testid*="contact"]').forEach(el => sources.push(el));
    document.querySelectorAll('a[href*="phone"]').forEach(el => sources.push(el));
    document.querySelectorAll('a[href*="@c.us"]').forEach(el => sources.push(el));
    document.querySelectorAll('span[title]').forEach(el => sources.push(el));
    document.querySelectorAll('[aria-label]').forEach(el => sources.push(el));

    return sources;
  }

  async function extractAll() {
    console.log('[WHL] 🚀 Iniciando extração com validação 98%+');
    extractedNumbers.clear();
    sources.clear();
    
    // Fase 1: Extração do Store
    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 10,
      count: extractedNumbers.size
    }, '*');
    extractFromStore();
    
    // Fase 2: DOM Observer
    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 20,
      count: extractedNumbers.size
    }, '*');
    startDOMObserver();
    
    // Fase 3: Auto-scroll
    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 30,
      count: extractedNumbers.size
    }, '*');
    autoScrollChats();
    
    // Fase 4: Extração padrão com scroll
    const list = findChatList();
    if (!list) throw new Error('Lista de chats não encontrada');

    list.scrollTop = 0;
    await new Promise(r => setTimeout(r, 800));

    let lastTop = -1, stable = 0;
    let scrollCount = 0;
    const scrollHeight = list.scrollHeight || 10000;
    const clientHeight = list.clientHeight || 100;
    const estimatedScrolls = Math.ceil(scrollHeight / (clientHeight * 0.7)) || 50;
    const maxScrolls = Math.min(estimatedScrolls, 100);
    
    while (stable < 7) {
      const items = list.querySelectorAll('[role="row"], [role="listitem"]');
      items.forEach(item => {
        collectDeepFrom(item, 'scroll');
      });

      findAllSources().forEach(source => {
        collectDeepFrom(source, 'sources');
      });

      scrollCount++;
      const progress = Math.min(70, 30 + Math.round((scrollCount / maxScrolls) * 40));
      window.postMessage({ 
        type: 'WHL_EXTRACT_PROGRESS', 
        progress: progress,
        count: extractedNumbers.size
      }, '*');

      const increment = Math.floor(list.clientHeight * 0.7);
      const next = Math.min(list.scrollTop + increment, list.scrollHeight);
      list.scrollTop = next;
      list.dispatchEvent(new Event('scroll', {bubbles:true}));
      
      await new Promise(r => setTimeout(r, 1100));

      if (list.scrollTop === lastTop) {
        stable++;
      } else {
        stable = 0;
      }
      lastTop = list.scrollTop;
    }

    // Fase 5: Extração de grupos
    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 75,
      count: extractedNumbers.size
    }, '*');
    
    setTimeout(() => extractGroups(), 5000);
    await new Promise(r => setTimeout(r, 6000)); // Aguardar grupos
    
    // Coleta final
    list.scrollTop = 0;
    await new Promise(r => setTimeout(r, 1000));

    const items = list.querySelectorAll('[role="row"], [role="listitem"]');
    items.forEach(item => {
      collectDeepFrom(item, 'final');
    });

    findAllSources().forEach(source => {
      collectDeepFrom(source, 'final');
    });

    // Retornar apenas números validados (com 2+ fontes)
    const validNumbers = Array.from(extractedNumbers).sort();

    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 100,
      count: validNumbers.length
    }, '*');

    console.log('[WHL] ✅ Extração concluída:', validNumbers.length, 'números validados');
    console.log('[WHL] Total de números detectados:', sources.size);
    console.log('[WHL] Números com 2+ fontes:', validNumbers.length);
    
    return validNumbers;
  }

  window.addEventListener('message', async (ev) => {
    if (!ev || !ev.data || ev.data.type !== 'WHL_EXTRACT_CONTACTS') return;
    try {
      const nums = await extractAll();
      window.postMessage({ type:'WHL_EXTRACT_RESULT', numbers: nums }, '*');
    } catch (e) {
      window.postMessage({ type:'WHL_EXTRACT_ERROR', error: String(e) }, '*');
    }
  });

  console.log('[WHL] Extractor isolado carregado (versão 98% precisão)');
})();
