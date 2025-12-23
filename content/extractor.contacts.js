/**
 * WhatsHybrid – EXTRATOR HÍBRIDO (SAFE + ELITE) COM MELHORIAS v2
 */

(function () {
  if (window.__WHL_EXTRACTOR_HYBRID_LOADED__) return;
  window.__WHL_EXTRACTOR_HYBRID_LOADED__ = true;

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
    91, 92, 93, 94, 95, 96, 97, 98, 99 // PA/AM/RR/AP/MA
  ]);

  function hasBrazilianDDD(num) {
    let n = num;
    if (n.startsWith('55') && n.length >= 12) n = n.substring(2);
    if (n.length >= 10) {
      const ddd = parseInt(n.substring(0, 2), 10);
      return VALID_DDDS.has(ddd);
    }
    return false;
  }

  function normalizePhone(num) {
    if (!num) return '';
    if (num.startsWith('55') && num.length >= 12) return num;
    if (num.length === 10 || num.length === 11) return '55' + num;
    return num;
  }

  // ===== USAR HARVESTER STORE COMPARTILHADO COM MELHORIAS =====
  let HarvesterStore = window.HarvesterStore;

  if (!HarvesterStore) {
    console.warn('[WHL] HarvesterStore ainda não disponível, criando local com melhorias v2...');
    
    // Criar HarvesterStore local como fallback com melhorias v2
    HarvesterStore = {
      _phones: new Map(),
      _valid: new Set(),
      _meta: {},
      PATTERNS: {
        BR_MOBILE: /\b(?:\+?55)?\s?\(?[1-9][0-9]\)?\s?9[0-9]{4}-?[0-9]{4}\b/g,
        BR_LAND: /\b(?:\+?55)?\s?\(?[1-9][0-9]\)?\s?[2-8][0-9]{3}-?[0-9]{4}\b/g,
        RAW: /\b\d{8,15}\b/g
      },
      ORIGINS: {
        DOM: 'dom',
        STORE: 'store',
        GROUP: 'group',
        WS: 'websocket',
        NET: 'network',
        LS: 'local_storage'
      },
      // Score mínimo aumentado para 5 (reduz falsos positivos)
      MIN_SCORE: 5,
      
      processPhone(num, origin, meta = {}) {
        if (!num) return null;
        let n = num.replace(/\D/g, '');
        if (n.length < 8 || n.length > 15) return null;
        
        // Normalização de números
        n = normalizePhone(n);
        
        // Validação de DDD brasileiro
        if (!hasBrazilianDDD(n)) {
          console.log('[WHL] Número rejeitado (DDD inválido):', n);
          return null;
        }
        
        if (!this._phones.has(n)) this._phones.set(n, {origens: new Set(), conf: 0, meta: {}});
        let item = this._phones.get(n);
        item.origens.add(origin);
        Object.assign(item.meta, meta);
        this._meta[n] = {...item.meta};
        item.conf = this.calcScore(item);
        
        // Adicionar aos válidos se atingir score mínimo
        if (item.conf >= this.MIN_SCORE) {
          this._valid.add(n);
        }
        return n;
      },
      
      // Sistema de score inteligente com pesos configuráveis
      calcScore(item) {
        let score = 1; // Score base
        
        // +2 pontos para cada origem adicional
        if (item.origens.size > 1) score += (item.origens.size - 1) * 2;
        
        // +3 pontos se veio do Store (fonte confiável)
        if (item.origens.has(this.ORIGINS.STORE)) score += 3;
        
        // +1 ponto se veio de grupo
        if (item.origens.has(this.ORIGINS.GROUP)) score += 1;
        
        // +2 pontos se tem nome
        if (item.meta?.nome) score += 2;
        
        // +1 ponto se é de grupo
        if (item.meta?.isGroup) score += 1;
        
        // +2 pontos se está ativo
        if (item.meta?.isActive) score += 2;
        
        return Math.min(score, 100);
      },
      
      stats() {
        const or = {};
        Object.values(this.ORIGINS).forEach(o => or[o] = 0);
        this._phones.forEach(item => { item.origens.forEach(o => or[o]++); });
        return or;
      },
      
      save() {
        try {
          // Usar localStorage ao invés de chrome.storage (não disponível em page scripts)
          localStorage.setItem('whl_contacts', JSON.stringify(Array.from(this._phones.keys())));
          localStorage.setItem('whl_valid', JSON.stringify(Array.from(this._valid)));
          localStorage.setItem('whl_meta', JSON.stringify(this._meta));
        } catch (e) {
          console.error('[WHL] Erro ao salvar:', e);
        }
      },
      
      clear() {
        this._phones.clear();
        this._valid.clear();
        this._meta = {};
        try {
          localStorage.removeItem('whl_contacts');
          localStorage.removeItem('whl_valid');
          localStorage.removeItem('whl_meta');
          localStorage.removeItem('wa_extracted_numbers');
        } catch (e) {
          console.error('[WHL] Erro ao limpar:', e);
        }
      }
    };
    
    // Expor para window
    window.HarvesterStore = HarvesterStore;
  }

  // ===== WA EXTRACTOR - Extração multi-fonte =====
  const WAExtractor = {
    async start() {
      console.log('[WHL] 🚀 Iniciando WAExtractor v2...');
      await this.waitLoad();
      this.observerChats();
      this.hookNetwork();
      this.localStorageExtract();
      this.autoScroll();
      
      // Salvar periodicamente
      setInterval(() => {
        try {
          HarvesterStore.save();
        } catch(e) {
          console.error('[WHL] Erro ao salvar periodicamente:', e);
        }
      }, 12000);
    },
    
    async waitLoad() {
      return new Promise(ok => {
        function loop() {
          if (document.querySelector('#pane-side') || window.Store) {
            ok();
          } else {
            setTimeout(loop, 600);
          }
        }
        loop();
      });
    },
    
    fromStore() {
      if (!window.Store) return;
      
      try {
        // Extrair chats
        let chats = window.Store.Chat?.models || [];
        chats.forEach(chat => {
          let id = chat.id._serialized || chat.id;
          if (typeof id === 'string') {
            if (id.endsWith('@c.us')) {
              let fone = id.replace('@c.us', '');
              HarvesterStore.processPhone(fone, HarvesterStore.ORIGINS.STORE, {
                nome: chat.name,
                isActive: true
              });
            }
            if (id.endsWith('@g.us')) {
              this.fromGroup(chat);
            }
          }
        });
        
        // Extrair contatos
        let contacts = window.Store.Contact?.models || [];
        contacts.forEach(c => {
          let id = c.id._serialized || c.id;
          if (typeof id === 'string' && id.endsWith('@c.us')) {
            HarvesterStore.processPhone(id.replace('@c.us',''), HarvesterStore.ORIGINS.STORE, {
              nome: c.name
            });
          }
        });
        
        console.log('[WHL] Store extraído com sucesso');
      } catch(e) {
        console.log('[WHL] Erro ao extrair do Store:', e);
      }
    },
    
    fromGroup(chat) {
      try {
        let members = chat.groupMetadata?.participants || [];
        members.forEach(m => {
          let id = m.id._serialized || m.id;
          if (typeof id === 'string' && id.endsWith('@c.us')) {
            HarvesterStore.processPhone(id.replace('@c.us',''), HarvesterStore.ORIGINS.GROUP, {
              isGroup: true
            });
          }
        });
      } catch(e) {
        console.log('[WHL] Erro ao extrair grupo:', e);
      }
    },
    
    observerChats() {
      let pane = document.querySelector('#pane-side');
      if (!pane) return;
      
      const obs = new MutationObserver(muts => {
        muts.forEach(m => m.addedNodes.forEach(n => {
          if (n.nodeType === 1) this.extractElement(n);
        }));
      });
      
      obs.observe(pane, {childList:true, subtree:true});
      this.extractElement(pane);
      console.log('[WHL] Observer de chats iniciado');
    },
    
    extractElement(el) {
      try {
        if (el.textContent) {
          this.findPhones(el.textContent, HarvesterStore.ORIGINS.DOM);
        }
        
        const spans = el.querySelectorAll?.('span,div');
        if (spans) {
          spans.forEach(e => this.findPhones(e.textContent, HarvesterStore.ORIGINS.DOM));
        }
      } catch(e) {}
    },
    
    findPhones(text, origin) {
      if (!text) return;
      
      // Aplicar todos os padrões
      let res = [...text.matchAll(HarvesterStore.PATTERNS.BR_MOBILE)]
        .concat([...text.matchAll(HarvesterStore.PATTERNS.BR_LAND)])
        .concat([...text.matchAll(HarvesterStore.PATTERNS.RAW)]);
      
      res.forEach(m => HarvesterStore.processPhone(m[0], origin));
    },
    
    hookNetwork() {
      // Hook fetch
      let f0 = window.fetch;
      window.fetch = async function(...a) {
        let r = await f0.apply(this, a);
        try {
          let data = await r.clone().text().catch(() => null);
          if (data) WAExtractor.findPhones(data, HarvesterStore.ORIGINS.NET);
        } catch(e) {}
        return r;
      };
      
      // Hook XMLHttpRequest
      let oOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(...a) {
        this._wa_url = a[1];
        return oOpen.apply(this, a);
      };
      
      let oSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function(...a) {
        this.addEventListener('load', function() {
          if (this._wa_url?.includes('whatsapp.com')) {
            WAExtractor.findPhones(this.responseText, HarvesterStore.ORIGINS.NET);
          }
        });
        return oSend.apply(this, a);
      };
      
      // Hook WebSocket
      let WSOld = window.WebSocket;
      window.WebSocket = function(...args) {
        let ws = new WSOld(...args);
        ws.addEventListener('message', e => {
          WAExtractor.findPhones(e.data, HarvesterStore.ORIGINS.WS);
        });
        return ws;
      };
      
      console.log('[WHL] Network hooks instalados');
    },
    
    localStorageExtract() {
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.includes('chat') || k.includes('contact') || k.includes('wa')) {
            let v = localStorage.getItem(k);
            if (v) this.findPhones(v, HarvesterStore.ORIGINS.LS);
          }
        });
        console.log('[WHL] localStorage extraído');
      } catch(e) {
        console.log('[WHL] Erro ao extrair localStorage:', e);
      }
    },
    
    async autoScroll() {
      let pane = document.querySelector('#pane-side');
      if (!pane) return;
      
      console.log('[WHL] Iniciando auto-scroll...');
      for (let i = 0; i < 25; i++) {
        pane.scrollTop = pane.scrollHeight;
        await new Promise(ok => setTimeout(ok, 600 + Math.random() * 600));
        this.extractElement(pane);
      }
      console.log('[WHL] Auto-scroll concluído');
    }
  };

  // ===== COMPATIBILIDADE COM SISTEMA ANTIGO =====
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
    const store = window.HarvesterStore || HarvesterStore;
    if (!store) return [];

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
          store.processPhone(n, sourceName);
        });
      }
    });

    if (el.textContent) {
      extractNumbers(el.textContent).forEach(n => {
        numbers.add(n);
        store.processPhone(n, sourceName);
      });
    }

    const children = el.querySelectorAll('*');
    children.forEach(child => {
      attrs.forEach(attr => {
        const value = child.getAttribute(attr);
        if (value) {
          extractNumbers(value).forEach(n => {
            numbers.add(n);
            store.processPhone(n, sourceName);
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
    console.log('[WHL] 🚀 Iniciando extração completa com sistema Harvester v2...');
    
    // Garantir que HarvesterStore está disponível
    const store = window.HarvesterStore || HarvesterStore;
    if (!store) {
      console.error('[WHL] HarvesterStore não disponível!');
      window.postMessage({ type:'WHL_EXTRACT_ERROR', error: 'HarvesterStore não disponível' }, '*');
      return [];
    }
    
    // Limpar store anterior
    store.clear();
    
    // Fase 1: Iniciar WAExtractor (Store, Observer, Network hooks, etc)
    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 10,
      count: store._valid.size
    }, '*');
    
    await WAExtractor.start();
    
    // Fase 2: Extração DOM tradicional com scroll
    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 30,
      count: store._valid.size
    }, '*');
    
    const list = findChatList();
    if (!list) {
      console.log('[WHL] ⚠️ Lista de chats não encontrada, usando apenas extração do Store');
    } else {
      list.scrollTop = 0;
      await new Promise(r => setTimeout(r, 800));

      let lastTop = -1, stable = 0;
      let scrollCount = 0;
      const scrollHeight = list.scrollHeight || 10000;
      const clientHeight = list.clientHeight || 100;
      const estimatedScrolls = Math.ceil(scrollHeight / (clientHeight * 0.7)) || 50;
      const maxScrolls = Math.min(estimatedScrolls, 100);
      
      while (stable < 7 && scrollCount < maxScrolls) {
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
          count: store._valid.size
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
    }

    // Fase 3: Aguardar hooks de rede coletarem mais dados
    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 80,
      count: store._valid.size
    }, '*');
    
    await new Promise(r => setTimeout(r, 3000));
    
    // Retornar apenas números validados (com score >= MIN_SCORE)
    const validNumbers = Array.from(store._valid).sort();

    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 100,
      count: validNumbers.length
    }, '*');

    // Estatísticas
    const stats = store.stats();
    console.log('[WHL] ✅ Extração concluída v2:', {
      total: store._phones.size,
      validos: validNumbers.length,
      stats: stats,
      minScore: store.MIN_SCORE
    });
    
    // Salvar
    store.save();
    
    return validNumbers;
  }

  // ===== LISTENER DE MENSAGENS =====
  window.addEventListener('message', async (ev) => {
    if (!ev || !ev.data || ev.data.type !== 'WHL_EXTRACT_CONTACTS') return;
    try {
      const nums = await extractAll();
      window.postMessage({ type:'WHL_EXTRACT_RESULT', numbers: nums }, '*');
    } catch (e) {
      console.log('[WHL] Erro na extração:', e);
      window.postMessage({ type:'WHL_EXTRACT_ERROR', error: String(e) }, '*');
    }
  });

  console.log('[WHL] 🚀 Extractor Híbrido v2 com DDD validation carregado');
})();
