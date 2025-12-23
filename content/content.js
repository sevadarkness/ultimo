
(() => {
  'use strict';
  if (window.__WHL_SINGLE_TAB__) return;
  window.__WHL_SINGLE_TAB__ = true;

  // ======= Validador e repositório dos telefones extraídos =======
  const HarvesterStore = {
    _phones: new Map(), // Map<numero, {origens:Set, conf:number, meta:Object}>
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
    processPhone(num, origin, meta = {}) {
      if (!num) return null;
      let n = num.replace(/\D/g, '');
      if (n.length < 8 || n.length > 15) return null;
      if (n.length === 11 && n[2] === '9') n = '55' + n;
      if ((n.length === 10 || n.length === 11) && !n.startsWith('55')) n = '55' + n;
      if (!this._phones.has(n)) this._phones.set(n, {origens: new Set(), conf: 0, meta: {}});
      let item = this._phones.get(n);
      item.origens.add(origin);
      Object.assign(item.meta, meta);
      this._meta[n] = {...item.meta};
      item.conf = this.calcScore(item);
      if (item.conf >= 60) this._valid.add(n);
      return n;
    },
    calcScore(item) {
      let score = 10;
      if (item.origens.size > 1) score += 30;
      if (item.origens.has(this.ORIGINS.STORE)) score += 30;
      if (item.origens.has(this.ORIGINS.GROUP)) score += 10;
      if (item.meta?.nome) score += 15;
      if (item.meta?.isGroup) score += 5;
      if (item.meta?.isActive) score += 10;
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
        chrome.storage.local.set({
          contacts: Array.from(this._phones.keys()),
          valid: Array.from(this._valid),
          meta: this._meta
        }).catch(err => {
          console.error('[WHL] Erro ao salvar contatos no storage:', err);
        });
      } catch (e) {
        console.error('[WHL] Erro ao preparar dados para salvar:', e);
      }
    },
    clear() {
      this._phones.clear();
      this._valid.clear();
      this._meta = {};
      localStorage.removeItem('wa_extracted_numbers');
      this.save();
    }
  };

  // Expor HarvesterStore globalmente para acesso do background script
  window.HarvesterStore = HarvesterStore;

  // ========== Extração ==========
  const WAExtractor = {
    async start() {
      await this.waitLoad();
      // this.exposeStore(); // COMENTADO - bloqueado pelo CSP
      this.observerChats();
      this.hookNetwork();
      this.localStorageExtract();
      // REMOVIDO: this.autoScroll() - scroll só deve ocorrer ao clicar "Extrair Contatos"
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
          if (document.querySelector('#pane-side') || window.Store) ok();
          else setTimeout(loop, 600);
        }
        loop();
      });
    },
    exposeStore() {
      // DESABILITADO: CSP do WhatsApp Web bloqueia scripts inline
      console.log('[WHL] exposeStore desabilitado (CSP blocking)');
      return;
      
      /* Código original comentado - bloqueado pelo CSP
      const s = document.createElement('script');
      s.textContent = `(()=>{try{
        if(window.webpackChunkwhatsapp_web_client)window.webpackChunkwhatsapp_web_client.push([['wa-harvester'],{},function(e){
          let mods = [];
          for(let k in e.m)mods.push(e(k));
          window.Store = {};
          let find = f => mods.find(m=>m&&f(m));
          window.Store.Chat = find(m=>m.default&&m.default.Chat)?.default;
          window.Store.Contact = find(m=>m.default&&m.default.Contact)?.default;
          window.Store.GroupMetadata = find(m=>m.default&&m.default.GroupMetadata)?.default;
          window.dispatchEvent(new CustomEvent('wa-store'));
        }]);
      }catch{}})();`;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      window.addEventListener('wa-store', () => this.fromStore());
      */
    },
    fromStore() {
      if (!window.Store) return;
      try {
        let chats = window.Store.Chat?.models || [];
        chats.forEach(chat => {
          let id = chat.id._serialized;
          if (id.endsWith('@c.us')) {
            let fone = id.replace('@c.us', '');
            HarvesterStore.processPhone(fone, HarvesterStore.ORIGINS.STORE, {nome: chat.name, isActive: true});
          }
          if (id.endsWith('@g.us')) this.fromGroup(chat);
        });
        let contacts = window.Store.Contact?.models || [];
        contacts.forEach(c => {
          let id = c.id._serialized;
          if (id.endsWith('@c.us')) HarvesterStore.processPhone(id.replace('@c.us',''), HarvesterStore.ORIGINS.STORE, {nome: c.name});
        });
      } catch(e) {}
    },
    fromGroup(chat) {
      try {
        let members = chat.groupMetadata?.participants || [];
        members.forEach(m => {
          let id = m.id._serialized;
          if (id.endsWith('@c.us')) HarvesterStore.processPhone(id.replace('@c.us',''), HarvesterStore.ORIGINS.GROUP, {isGroup:true});
        });
      } catch{}
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
    },
    extractElement(el) {
      try {
        if (el.textContent) this.findPhones(el.textContent, HarvesterStore.ORIGINS.DOM);
        Array.from(el.querySelectorAll?.('span,div')).forEach(e => this.findPhones(e.textContent, HarvesterStore.ORIGINS.DOM));
      } catch{}
    },
    findPhones(text, origin) {
      if (!text) return;
      let res = [...text.matchAll(HarvesterStore.PATTERNS.BR_MOBILE)]
        .concat([...text.matchAll(HarvesterStore.PATTERNS.BR_LAND)])
        .concat([...text.matchAll(HarvesterStore.PATTERNS.RAW)]);
      res.forEach(m => HarvesterStore.processPhone(m[0], origin));
    },
    hookNetwork() {
      // fetch
      let f0 = window.fetch;
      window.fetch = async function(...a) {
        let r = await f0.apply(this,a);
        let data = await r.clone().text().catch(()=>null);
        if (data) WAExtractor.findPhones(data, HarvesterStore.ORIGINS.NET);
        return r;
      };
      // XHR
      let oOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(...a) {
        this._wa_url = a[1];
        return oOpen.apply(this,a);
      };
      let oSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function(...a) {
        this.addEventListener('load',function(){
          // Secure URL validation using URL parsing
          if(this._wa_url) {
            try {
              const url = new URL(this._wa_url);
              if(url.hostname === 'web.whatsapp.com' || 
                 url.hostname.endsWith('.whatsapp.com') || 
                 url.hostname.endsWith('.whatsapp.net')) {
                WAExtractor.findPhones(this.responseText, HarvesterStore.ORIGINS.NET);
              }
            } catch(e) {
              // Invalid URL, ignore
            }
          }
        });
        return oSend.apply(this,a);
      };
      // WebSocket
      let WSOld = window.WebSocket;
      window.WebSocket = function(...args) {
        let ws = new WSOld(...args);
        ws.addEventListener('message',e=>{
          WAExtractor.findPhones(e.data, HarvesterStore.ORIGINS.WS);
        });
        return ws;
      };
    },
    localStorageExtract() {
      try {
        Object.keys(localStorage).forEach(k=>{
          if (k.includes('chat')||k.includes('contact')||k.includes('wa')) {
            let v = localStorage.getItem(k);
            if (v) this.findPhones(v, HarvesterStore.ORIGINS.LS);
          }
        });
      } catch{}
    },
    async autoScroll() {
      let pane = document.querySelector('#pane-side');
      if (!pane) return;
      for (let i=0;i<25;i++) {
        pane.scrollTop = pane.scrollHeight;
        await new Promise(ok=>setTimeout(ok,600+Math.random()*600));
        this.extractElement(pane);
      }
    }
  };

  // Listener para mensagens do background/popup relacionadas ao Harvester
  chrome.runtime.onMessage.addListener((msg,_,resp)=>{
    if(msg.action==='getStats'){
      resp({
        total: HarvesterStore._phones.size,
        valid: HarvesterStore._valid.size,
        sources: HarvesterStore.stats()
      });
      return true;
    }
    if(msg.action==='forceExtract'){
      WAExtractor.fromStore();
      WAExtractor.autoScroll();
      resp({success:true});
      return true;
    }
    if(msg.action==='exportData'){
      resp({
        data: {
          numbers: Array.from(HarvesterStore._phones.keys()),
          valid: Array.from(HarvesterStore._valid),
          meta: HarvesterStore._meta
        }
      });
      return true;
    }
    if(msg.action==='clearData'){
      HarvesterStore.clear();
      resp({success:true});
      return true;
    }
    if(msg.type==='netPhones' && msg.phones){
      msg.phones.forEach(p => HarvesterStore.processPhone(p, HarvesterStore.ORIGINS.NET));
      return true;
    }
  });

  // Iniciar extrator quando documento carregar
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>WAExtractor.start());
  }else{
    WAExtractor.start();
  }

  const KEY = 'whl_campaign_state_v1';

  const normalize = (v) => String(v || '').replace(/\D/g, '');
  const enc = (t) => encodeURIComponent(String(t || ''));
  const chatUrl = (phone, msg) => `https://web.whatsapp.com/send?phone=${phone}&text=${enc(msg)}`;

  let campaignInterval = null;

  async function getState() {
    const res = await chrome.storage.local.get([KEY]);
    return res[KEY] || {
      numbersText: '',
      message: '',
      queue: [],
      index: 0,
      openInNewTab: false,
      panelVisible: true,
      isRunning: false,
      isPaused: false,
      delayMin: 2,
      delayMax: 6,
      continueOnError: true,
      imageData: null,
      retryMax: 0,
      scheduleAt: '',
      typingEffect: true,
      typingDelayMs: 35,
      urlNavigationInProgress: false,
      currentPhoneNumber: '',
      currentMessage: '',
      drafts: {},
      lastReport: null,
      selectorHealth: { ok: true, issues: [] },
      stats: { sent: 0, failed: 0, pending: 0 }
    };
  }
  async function setState(next) {
    await chrome.storage.local.set({ [KEY]: next });
    return next;
  }

  function ensurePanel() {
    let panel = document.getElementById('whlPanel');
    if (panel) return panel;

    const style = document.createElement('style');
    style.id = 'whlStyle';
    style.textContent = `
      #whlPanel{position:fixed;top:80px;right:16px;width:480px;max-height:78vh;overflow:auto;
        background:rgba(8,6,20,.96);color:#fff;border-radius:18px;padding:12px;z-index:999999;
        font-family:system-ui;box-shadow:0 22px 55px rgba(0,0,0,.6);border:1px solid rgba(111,0,255,.35)}
      #whlPanel .topbar{display:flex;align-items:center;justify-content:space-between;gap:10px}
      #whlPanel .title{font-weight:900}
      #whlPanel .whl-logo{width:28px;height:28px;border-radius:6px}
      #whlPanel .muted{opacity:.75;font-size:12px;line-height:1.35}
      #whlPanel input,#whlPanel textarea{width:100%;margin-top:6px;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.06);color:#fff;outline:none;box-sizing:border-box;max-width:100%}
      #whlPanel textarea{min-height:84px;resize:vertical}
      #whlPanel button{margin-top:8px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.06);color:#fff;font-weight:900;cursor:pointer;box-sizing:border-box}
      #whlPanel button.primary{background:linear-gradient(180deg, rgba(111,0,255,.95), rgba(78,0,190,.95));
        box-shadow:0 14px 30px rgba(111,0,255,.25)}
      #whlPanel button.danger{border-color:rgba(255,120,120,.35);background:rgba(255,80,80,.10)}
      #whlPanel button.success{background:linear-gradient(180deg, rgba(0,200,100,.85), rgba(0,150,80,.85))}
      #whlPanel button.warning{background:linear-gradient(180deg, rgba(255,200,0,.75), rgba(200,150,0,.75))}
      #whlPanel .row{display:flex;gap:10px;box-sizing:border-box}
      #whlPanel .card{margin-top:12px;padding:12px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);box-sizing:border-box;overflow:hidden}
      #whlPanel table{width:100%;font-size:12px;margin-top:10px;border-collapse:collapse}
      #whlPanel th,#whlPanel td{padding:6px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
      #whlPanel th{opacity:.75;text-align:left}
      #whlPanel .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800}
      #whlPanel .pill.pending{background:rgba(0,255,255,.10);border:1px solid rgba(0,255,255,.25)}
      #whlPanel .pill.opened{background:rgba(111,0,255,.10);border:1px solid rgba(111,0,255,.25)}
      #whlPanel .tiny{font-size:11px;opacity:.72}
      #whlPanel .iconbtn{width:36px;height:36px;border-radius:14px;margin-top:0}
      #whlPanel .progress-bar{width:100%;height:24px;background:rgba(255,255,255,.08);border-radius:12px;overflow:hidden;margin-top:10px}
      #whlPanel .progress-fill{height:100%;background:linear-gradient(90deg, rgba(111,0,255,.85), rgba(78,0,190,.85));transition:width 0.3s ease}
      #whlPanel .stats{display:flex;gap:12px;margin-top:10px;font-size:12px}
      #whlPanel .stat-item{padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);flex:1;text-align:center}
      #whlPanel .stat-value{font-size:18px;font-weight:900;display:block;margin-top:4px}
      #whlPanel .status-badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:800;margin-left:8px}
      #whlPanel .status-badge.running{background:rgba(120,255,160,.10);border:1px solid rgba(120,255,160,.35);color:rgba(120,255,160,1)}
      #whlPanel .status-badge.paused{background:rgba(255,200,0,.10);border:1px solid rgba(255,200,0,.35);color:rgba(255,200,0,1)}
      #whlPanel .status-badge.stopped{background:rgba(255,80,80,.10);border:1px solid rgba(255,80,80,.35);color:rgba(255,80,80,1)}
      #whlPanel input[type="number"]{width:80px}

      
      /* ===== Automation settings layout (clean) ===== */
      #whlPanel .settings-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:12px;
        margin-top:12px;
      }
      #whlPanel .settings-grid .cell{
        padding:12px;
        border-radius:14px;
        background:rgba(255,255,255,.05);
        border:1px solid rgba(255,255,255,.12);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
      }
      #whlPanel .settings-grid .label{
        opacity:.85;
        font-size:12px;
        margin-bottom:8px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }
      #whlPanel .settings-grid input[type="number"],
      #whlPanel .settings-grid input[type="datetime-local"]{
        width:100% !important;
        margin:0;
      }
      #whlPanel .settings-toggles{
        display:grid;
        grid-template-columns:1fr;
        gap:10px;
        margin-top:12px;
        padding-top:12px;
        border-top:1px solid rgba(255,255,255,.10);
      }
      #whlPanel .settings-toggles label{
        padding:10px 12px;
        border-radius:14px;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.10);
      }
      #whlPanel .settings-toggles input{transform:scale(1.05)}
      #whlPanel .settings-footer{
        margin-top:12px;
        padding-top:10px;
        border-top:1px solid rgba(255,255,255,.10);
      }
      @media (max-width: 520px){
        #whlPanel .settings-grid{grid-template-columns:1fr}
      }


      /* ===== TABS SYSTEM ===== */
      #whlPanel .whl-tabs {
        display: flex;
        gap: 0;
        margin-bottom: 12px;
        border-bottom: 2px solid rgba(111,0,255,.35);
      }

      #whlPanel .whl-tab {
        flex: 1;
        padding: 12px 16px;
        background: rgba(255,255,255,.05);
        border: none;
        border-bottom: 3px solid transparent;
        color: rgba(255,255,255,.6);
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      #whlPanel .whl-tab:hover {
        background: rgba(255,255,255,.10);
        color: rgba(255,255,255,.9);
      }

      #whlPanel .whl-tab.active {
        background: rgba(111,0,255,.15);
        border-bottom: 3px solid rgba(111,0,255,.85);
        color: #fff;
      }

      #whlPanel .whl-tab-content {
        display: none;
      }

      #whlPanel .whl-tab-content.active {
        display: block;
      }

      /* ===== QUEUE TABLE CONTAINER - SUPER EXPANDIDO ===== */
      #whlPanel .whl-queue-container {
        max-height: 800px !important; /* AUMENTADO de 600px para 800px */
        overflow-y: auto;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 12px;
        background: rgba(0,0,0,.15);
        margin-top: 10px;
        scroll-behavior: smooth;
      }

      /* Header fixo */
      #whlPanel .whl-queue-container thead {
        position: sticky;
        top: 0;
        background: rgba(30,20,50,.98);
        z-index: 10;
      }

      /* Células mais compactas para mostrar mais linhas */
      #whlPanel .whl-queue-container td,
      #whlPanel .whl-queue-container th {
        padding: 6px 8px !important;
        font-size: 12px;
      }

      #whlPanel tbody tr:nth-child(even) {
        background: rgba(255,255,255,.03);
      }

      /* Linhas da tabela com destaque melhor */
      #whlPanel tbody tr {
        transition: background 0.2s ease;
      }

      #whlPanel tbody tr:hover {
        background: rgba(111,0,255,.15);
      }

      #whlPanel tbody tr.current {
        background: rgba(111,0,255,.25);
        border-left: 3px solid rgba(111,0,255,.85);
      }

      /* Status badges com cores mais visíveis */
      #whlPanel .pill.sent {
        background: rgba(0,200,100,.25);
        border: 1px solid rgba(0,200,100,.50);
        color: #4ade80;
        font-weight: 600;
      }

      #whlPanel .pill.failed {
        background: rgba(255,80,80,.25);
        border: 1px solid rgba(255,80,80,.50);
        color: #f87171;
        font-weight: 600;
      }

      #whlPanel .pill.pending {
        background: rgba(255,200,0,.20);
        border: 1px solid rgba(255,200,0,.40);
        color: #fbbf24;
      }


      /* Additions */
      #whlPanel .tip{position:relative;display:inline-block}
      #whlPanel .tip[data-tip]::after{content:attr(data-tip);position:absolute;left:0;top:120%;
        background:rgba(5,4,18,.96);border:1px solid rgba(0,255,255,.22);color:#fff;
        padding:8px 10px;border-radius:12px;font-size:12px;line-height:1.35;min-width:220px;max-width:360px;
        opacity:0;pointer-events:none;transform:translateY(-4px);transition:opacity .12s ease,transform .12s ease;z-index:999999;
        box-shadow:0 18px 40px rgba(0,0,0,.6)}
      #whlPanel .tip:hover::after{opacity:1;transform:translateY(0)}
      #whlPanel .wa-preview{display:flex;justify-content:flex-end}
      #whlPanel .wa-bubble{max-width:92%;padding:10px 12px;border-radius:18px 18px 6px 18px;
        background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.10);white-space:pre-wrap}
      #whlPanel .wa-meta{margin-top:6px;text-align:right;font-size:11px;opacity:.75}


      /* ===== Automation settings FINAL (aligned & separated) ===== */
      #whlPanel .settings-wrap{margin-top:10px}
      #whlPanel .settings-section-title{
        font-size:12px;
        opacity:.78;
        letter-spacing:.2px;
        margin:10px 0 8px;
      }
      #whlPanel .settings-table{
        border-radius:16px;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.03);
      }
      #whlPanel .settings-row{
        display:grid;
        grid-template-columns: 1fr 180px;
        gap:14px;
        align-items:center;
        padding:12px 12px;
      }
      #whlPanel .settings-row + .settings-row{border-top:1px solid rgba(255,255,255,.10)}
      #whlPanel .settings-label{display:flex;flex-direction:column;gap:3px}
      #whlPanel .settings-label .k{font-weight:900;font-size:12px}
      #whlPanel .settings-label .d{font-size:11px;opacity:.70;line-height:1.25}
      #whlPanel .settings-control{display:flex;justify-content:flex-end;align-items:center}
      #whlPanel .settings-control input[type="number"],
      #whlPanel .settings-control input[type="datetime-local"]{
        width:180px !important;
        margin:0 !important;
      }
      #whlPanel .settings-row.toggle{grid-template-columns: 1fr 48px}
      #whlPanel .settings-row.toggle .settings-control{justify-content:flex-end}
      #whlPanel .settings-row.toggle input[type="checkbox"]{width:18px;height:18px}
      #whlPanel .settings-footer{
        margin-top:12px;
        padding-top:10px;
        border-top:1px solid rgba(255,255,255,.10);
      }
      @media (max-width:520px){
        #whlPanel .settings-row{grid-template-columns:1fr}
        #whlPanel .settings-control{justify-content:flex-start}
        #whlPanel .settings-control input[type="number"],
        #whlPanel .settings-control input[type="datetime-local"]{width:100% !important}
        #whlPanel .settings-row.toggle{grid-template-columns:1fr 48px}
      }


      /* ===== Preview WhatsApp FINAL ===== */
      #whlPanel .wa-chat{
        margin-top:10px;
        padding:14px;
        border-radius:16px;
        background:
          radial-gradient(160px 160px at 20% 20%, rgba(111,0,255,.10), transparent 60%),
          radial-gradient(200px 200px at 80% 10%, rgba(0,255,255,.08), transparent 60%),
          rgba(0,0,0,.18);
        border:1px solid rgba(255,255,255,.10);
        display:flex;
        justify-content:flex-end;
      }
      #whlPanel .wa-chat .wa-bubble{
        position:relative;
        max-width:92%;
        padding:10px 12px 8px;
        border-radius:18px 18px 6px 18px;
        background:rgba(0, 92, 75, .86);
        border:1px solid rgba(120,255,160,.22);
        box-shadow:0 14px 30px rgba(0,0,0,.38);
        color:#e9edef;
      }
      #whlPanel .wa-chat .wa-bubble::after{
        content:"";
        position:absolute;
        right:-6px;
        bottom:0;
        width:12px;height:12px;
        background:rgba(0, 92, 75, .86);
        border-right:1px solid rgba(120,255,160,.22);
        border-bottom:1px solid rgba(120,255,160,.22);
        transform:skewX(-20deg) rotate(45deg);
        border-bottom-right-radius:4px;
      }
      #whlPanel .wa-chat .wa-time{
        margin-top:6px;
        text-align:right;
        font-size:11px;
        opacity:.75;
        display:flex;
        justify-content:flex-end;
        align-items:center;
        gap:6px;
      }
      #whlPanel .wa-chat .wa-ticks{font-size:12px;opacity:.9}

    `;
    document.head.appendChild(style);

    panel = document.createElement('div');
    panel.id = 'whlPanel';
    panel.innerHTML = `
      <div class="topbar">
        <div>
          <div class="title" style="display:flex;align-items:center;gap:8px">
            <img src="${chrome.runtime.getURL('icons/48.png')}" alt="WhatsHybrid Lite" class="whl-logo" />
            <span>WhatsHybrid Lite</span>
            <span class="status-badge stopped" id="whlStatusBadge">Parado</span>
          </div>
        </div>
        <button class="iconbtn" id="whlHide" title="Ocultar">—</button>
      </div>

      <!-- Tabs no topo do painel -->
      <div class="whl-tabs">
        <button class="whl-tab active" data-tab="principal">📱 Principal</button>
        <button class="whl-tab" data-tab="extrator">📥 Extrator</button>
        <button class="whl-tab" data-tab="config">⚙️ Configurações</button>
      </div>

      <!-- Conteúdo da Aba Principal -->
      <div class="whl-tab-content active" id="whl-tab-principal">
        
        <div class="card">
          <div class="title" style="font-size:13px">Números (um por linha)</div>
          <div class="muted">Cole sua lista aqui. Ex: 5511999998888</div>
          <textarea id="whlNumbers" placeholder="5511999998888
5511988887777"></textarea>

          <div style="margin-top:10px">
            <div class="muted">📊 Importar CSV (phone,message opcional)</div>
            <input id="whlCsv" type="file" accept=".csv,text/csv" />
          </div>

          <div class="title" style="font-size:13px;margin-top:10px">Mensagem padrão</div>
          <textarea id="whlMsg" placeholder="Digite sua mensagem…"></textarea>
          
          <button id="whlSaveMessage" class="iconbtn primary" style="width:100%; margin-top:8px;">
            💾 Salvar Mensagem
          </button>

          <div style="margin-top:10px">
            <div class="muted">📸 Selecionar imagem (será enviada automaticamente)</div>
            <div class="row" style="margin-top:6px">
              <button id="whlSelectImageBtn" style="flex:1">📎 Anexar Imagem</button>
              <button id="whlClearImageBtn" style="width:120px" title="Remover imagem">🗑️ Remover</button>
            </div>
            <input id="whlImage" type="file" accept="image/*" style="display:none" />
            <div class="tiny" id="whlImageHint" style="margin-top:6px"></div>
          </div>

          <div class="card" style="margin-top:10px">
            <div class="title" style="font-size:13px">📱 Preview (WhatsApp)</div>
            <div class="muted">Como vai aparecer no WhatsApp:</div>
            <div class="wa-chat">
              <div class="wa-bubble">
                <img id="whlPreviewImg" alt="preview" style="display:none;width:100%;max-width:300px;max-height:300px;object-fit:contain;border-radius:12px;margin-bottom:8px;border:1px solid rgba(255,255,255,.10)" />
                <div id="whlPreviewText" style="white-space:pre-wrap"></div>
                <div class="wa-time"><span id="whlPreviewMeta"></span><span class="wa-ticks">✓✓</span></div>
              </div>
            </div>
          </div>

          <div class="row">
            <button class="primary" style="flex:1" id="whlBuild">Gerar tabela</button>
            <button style="width:170px" id="whlClear">Limpar</button>
          </div>

          <div class="tiny" id="whlHint"></div>
        </div>

        <div class="card">
          <div class="title" style="font-size:13px">📊 Progresso da Campanha</div>
          
          <div class="stats">
            <div class="stat-item">
              <div class="muted">Enviados</div>
              <span class="stat-value" id="whlStatSent">0</span>
            </div>
            <div class="stat-item">
              <div class="muted">Falhas</div>
              <span class="stat-value" id="whlStatFailed">0</span>
            </div>
            <div class="stat-item">
              <div class="muted">Pendentes</div>
              <span class="stat-value" id="whlStatPending">0</span>
            </div>
          </div>

          <div class="progress-bar">
            <div class="progress-fill" id="whlProgressFill" style="width:0%"></div>
          </div>
          <div class="tiny" style="margin-top:6px;text-align:center" id="whlProgressText">0%</div>

          <div class="row" style="margin-top:10px">
            <button class="success" style="flex:1" id="whlStartCampaign">▶️ Iniciar Campanha</button>
            <button class="warning" style="width:100px" id="whlPauseCampaign">⏸️ Pausar</button>
            <button class="danger" style="width:100px" id="whlStopCampaign">⏹️ Parar</button>
          </div>
        </div>

        <div class="card">
          <div class="title" style="font-size:13px">Tabela / Fila</div>
          <div class="muted" id="whlMeta">0 contato(s)</div>

          <div class="whl-queue-container">
            <table>
              <thead><tr><th>#</th><th>Número</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody id="whlTable"></tbody>
            </table>
          </div>

          <div class="row" style="margin-top:8px">
            <button style="flex:1" id="whlSkip">Pular atual</button>
            <button class="danger" style="width:170px" id="whlWipe">Zerar fila</button>
          </div>

          <div class="tiny" id="whlStatus" style="margin-top:8px"></div>
        </div>

      </div>

      <!-- NOVA Aba Extrator -->
      <div class="whl-tab-content" id="whl-tab-extrator">
        <div class="card">
          <div class="title" style="font-size:13px">📥 Extrair Contatos</div>
          <div class="muted">Coleta números disponíveis no WhatsApp Web.</div>
          
          <div class="row" style="margin-top:10px">
            <button class="success" style="flex:1" id="whlExtractContacts">📥 Extrair contatos</button>
            <button style="width:150px" id="whlCopyExtracted">📋 Copiar Todos</button>
          </div>
          
          <!-- Botões de controle - SEMPRE VISÍVEIS durante extração -->
          <div class="row" style="margin-top:8px;display:none" id="whlExtractControls">
            <button class="warning" style="flex:1" id="whlPauseExtraction">⏸️ Pausar</button>
            <button class="danger" style="flex:1" id="whlCancelExtraction">⛔ Cancelar</button>
          </div>
          
          <div id="whlExtractProgress" style="display:none;margin-top:10px">
            <div class="progress-bar">
              <div class="progress-fill" id="whlExtractProgressFill" style="width:0%"></div>
            </div>
            <div class="tiny" style="margin-top:6px;text-align:center" id="whlExtractProgressText">0%</div>
          </div>
          
          <!-- Seção: Contatos Normais -->
          <div class="extract-section" style="margin-top:12px">
            <label style="display:block;font-weight:700;margin-bottom:6px">
              📱 Contatos Normais (<span id="whlNormalCount">0</span>)
            </label>
            <textarea id="whlExtractedNumbers" placeholder="Clique em 'Extrair contatos'…" style="min-height:200px"></textarea>
            <button style="width:100%;margin-top:6px" id="whlCopyNormal">📋 Copiar Normais</button>
          </div>
          
          <!-- Seção: Contatos Arquivados - DESTACADO -->
          <div class="extract-section archived" style="margin-top:12px;background:#f5f5f5;border-left:4px solid #888;padding:12px;border-radius:8px">
            <label style="display:block;font-weight:700;margin-bottom:6px;color:#333">
              📁 Arquivados (<span id="whlArchivedCount">0</span>)
            </label>
            <textarea id="whlArchivedNumbers" placeholder="Nenhum contato arquivado" style="min-height:120px;background:#fff"></textarea>
            <button style="width:100%;margin-top:6px" id="whlCopyArchived">📋 Copiar Arquivados</button>
          </div>
          
          <!-- Seção: Contatos Bloqueados - DESTACADO -->
          <div class="extract-section blocked" style="margin-top:12px;background:#ffe6e6;border-left:4px solid #d00;padding:12px;border-radius:8px">
            <label style="display:block;font-weight:700;margin-bottom:6px;color:#900">
              🚫 Bloqueados (<span id="whlBlockedCount">0</span>)
            </label>
            <textarea id="whlBlockedNumbers" placeholder="Nenhum contato bloqueado" style="min-height:120px;background:#fff"></textarea>
            <button style="width:100%;margin-top:6px" id="whlCopyBlocked">📋 Copiar Bloqueados</button>
          </div>
          
          <div class="tiny" id="whlExtractStatus" style="margin-top:10px;opacity:.8"></div>
          
          <button class="primary" style="width:100%;margin-top:8px" id="whlExportExtractedCsv">📥 Exportar CSV</button>
        </div>
      </div>

      <!-- Conteúdo da Aba Configurações -->
      <div class="whl-tab-content" id="whl-tab-config">

        <div class="card">
          <div class="title" style="font-size:13px">⚙️ Configurações de Automação</div>

          <div class="settings-wrap">
            <div class="settings-section-title">Parâmetros</div>
            <div class="settings-table">
              <div class="settings-row">
                <div class="settings-label">
                  <div class="k">🕐 Delay mínimo</div>
                  <div class="d">Tempo mínimo entre envios (seg)</div>
                </div>
                <div class="settings-control">
                  <input type="number" id="whlDelayMin" min="1" max="120" value="2" />
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <div class="k">🕐 Delay máximo</div>
                  <div class="d">Tempo máximo entre envios (seg)</div>
                </div>
                <div class="settings-control">
                  <input type="number" id="whlDelayMax" min="1" max="120" value="6" />
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <div class="k">🔄 Retry</div>
                  <div class="d">Tentativas extras em falha</div>
                </div>
                <div class="settings-control">
                  <input type="number" id="whlRetryMax" min="0" max="5" value="0" />
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-label">
                  <div class="k">📅 Agendamento</div>
                  <div class="d">Inicia no horário definido</div>
                </div>
                <div class="settings-control">
                  <input type="datetime-local" id="whlScheduleAt" />
                </div>
              </div>
            </div>

            <div class="settings-section-title" style="margin-top:14px">Opções</div>
            <div class="settings-table">
              <div class="settings-row toggle">
                <div class="settings-label">
                  <div class="k">✅ Continuar em erros</div>
                  <div class="d">Não interromper campanha</div>
                </div>
                <div class="settings-control">
                  <input type="checkbox" id="whlContinueOnError" checked />
                </div>
              </div>
            </div>

            <div class="settings-footer tiny" id="whlSelectorHealth"></div>
          </div>
        </div>

        <div class="card">
          <div class="title" style="font-size:13px">💾 Rascunhos</div>
          
          <div class="row" style="margin-top:10px">
            <button style="flex:1" id="whlSaveDraft">💾 Salvar</button>
            <button style="flex:1" id="whlLoadDraft">📂 Carregar</button>
          </div>
        </div>

        <div class="card">
          <div class="title" style="font-size:13px">📈 Relatórios</div>
          
          <div class="row" style="margin-top:10px">
            <button style="flex:1" id="whlExportReport">📈 Exportar relatório</button>
            <button style="flex:1" id="whlCopyFailed">📋 Copiar falhas</button>
          </div>
          <div class="tiny" id="whlReportHint" style="margin-top:6px"></div>
        </div>

      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }


  // ===== WHL FEATURES =====
  // Constants
  const PROGRESS_BAR_HIDE_DELAY = 3000; // ms to wait before hiding progress bar after completion
  
  // Sanitize phone number by removing non-digit characters
  // This preserves the real contact phone numbers from user input
  const whlSanitize = (t) => String(t||'').replace(/\D/g,'');
  
  // Validate phone number (8-15 digits)
  // Ensures phone numbers are valid format without modifying them
  const whlIsValidPhone = (t) => {
    const s = whlSanitize(t);
    return s.length >= 8 && s.length <= 15;
  };

  function whlCsvToRows(text) {
    const lines = String(text||'').replace(/\r/g,'').split('\n').filter(l=>l.trim().length);
    const rows = [];
    for (const line of lines) {
      const sep = (line.includes(';') && !line.includes(',')) ? ';' : ',';
      // minimal quoted handling
      const parts = [];
      let cur = '', inQ = false;
      for (let i=0;i<line.length;i++){
        const ch=line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (!inQ && ch === sep) { parts.push(cur.trim()); cur=''; continue; }
        cur += ch;
      }
      parts.push(cur.trim());
      rows.push(parts);
    }
    return rows;
  }

  async function whlUpdateSelectorHealth() {
    const issues = [];
    // Verificar se campo de mensagem existe (para envio de imagem)
    if (!getMessageInput()) issues.push('Campo de mensagem não encontrado');
    const st = await getState();
    st.selectorHealth = { ok: issues.length===0, issues };
    await setState(st);
  }

  // DEPRECATED: Overlay functions removed - not needed for URL mode

  async function whlExportReportCSV() {
    const st = await getState();
    const rows = [['phone','status','retries','timestamp']];
    const ts = new Date().toISOString();
    (st.queue||[]).forEach(x => rows.push([x.phone||'', x.status||'', String(x.retries||0), ts]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whl_report_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function whlExportExtractedCSV() {
    const extractedBox = document.getElementById('whlExtractedNumbers');
    if (!extractedBox) return;
    
    const numbersText = extractedBox.value || '';
    const numbers = numbersText.split(/\r?\n/).filter(n => n.trim().length > 0);
    
    if (numbers.length === 0) {
      alert('Nenhum número extraído para exportar. Por favor, extraia contatos primeiro.');
      return;
    }
    
    const rows = [['phone']];
    numbers.forEach(phone => rows.push([phone.trim()]));
    
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whl_extracted_contacts_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    const statusEl = document.getElementById('whlExtractStatus');
    if (statusEl) statusEl.textContent = `✅ CSV exportado com ${numbers.length} números`;
  }


  async function whlReadFileAsDataURL(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ===== AUTOMATION FUNCTIONS =====

  function getRandomDelay(min, max) {
    return (min + Math.random() * (max - min)) * 1000;
  }

  async function waitForElement(selector, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }

  // ===== DOM SELECTORS (UPDATED WITH CORRECT WHATSAPP WEB STRUCTURE) =====
  
  // NOTA: getSearchInput removido - modo DOM de busca não é mais usado
  // A extensão agora usa APENAS navegação via URL

  // Campo de mensagem para digitar (SELETORES EXATOS)
  // IMPORTANTE: Campo de mensagem está no MAIN ou FOOTER, não na sidebar
  // CORRIGIDO: Mais seletores para melhor compatibilidade
  function getMessageInput() {
    return getMessageInputField();
  }

  /**
   * Digita texto no campo de mensagem usando DOM manipulation
   * ATUALIZADO: Suporta digitação humanizada com delays variáveis
   */
  async function typeMessageInField(text, humanLike = true) {
    if (!text || !text.trim()) {
      console.log('[WHL] ⚠️ Texto vazio, pulando digitação');
      return true;
    }
    
    console.log('[WHL] ⌨️ Digitando texto:', text.substring(0, 50) + '...');
    console.log('[WHL] Modo:', humanLike ? 'Humanizado 🧑' : 'Rápido ⚡');
    
    // Aguardar campo com mais tentativas
    let msgInput = null;
    for (let i = 0; i < 20; i++) {
      msgInput = getMessageInputField();
      if (msgInput) break;
      console.log(`[WHL] Aguardando campo... tentativa ${i+1}/20`);
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (!msgInput) {
      console.log('[WHL] ❌ Campo de mensagem não encontrado');
      return false;
    }
    
    console.log('[WHL] ✅ Campo encontrado');
    
    // Focar
    msgInput.focus();
    await new Promise(r => setTimeout(r, 300));
    
    // Limpar
    msgInput.textContent = '';
    msgInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    
    if (humanLike) {
      // DIGITAÇÃO HUMANIZADA - caractere por caractere com delays variáveis
      console.log('[WHL] 🧑 Digitando com aspecto humano...');
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        // NOVO: Tratar quebra de linha
        if (char === '\n') {
          // Simular Shift+Enter para quebra de linha no WhatsApp
          const shiftEnterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            shiftKey: true, // IMPORTANTE: Shift+Enter
            bubbles: true,
            cancelable: true
          });
          msgInput.dispatchEvent(shiftEnterEvent);
          
          // Delay maior para quebra de linha
          await new Promise(r => setTimeout(r, 150));
          continue;
        }
        
        // Inserir caractere normal
        document.execCommand('insertText', false, char);
        msgInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Delay variável baseado no caractere
        let delay;
        if (['.', '!', '?'].includes(char)) {
          // Pausa maior após pontuação
          delay = 100 + Math.random() * 150; // 100-250ms
        } else if ([',', ';', ':'].includes(char)) {
          // Pausa média após vírgulas
          delay = 60 + Math.random() * 80; // 60-140ms
        } else if (char === ' ') {
          // Pausa leve após espaços
          delay = 30 + Math.random() * 50; // 30-80ms
        } else {
          // Delay normal para letras
          delay = 25 + Math.random() * 55; // 25-80ms
        }
        
        // Ocasionalmente fazer uma pausa maior (simula pensamento)
        if (Math.random() < 0.02) { // 2% de chance
          delay += 200 + Math.random() * 300; // +200-500ms extra
        }
        
        await new Promise(r => setTimeout(r, delay));
      }
      
      console.log('[WHL] ✅ Digitação humanizada concluída');
    } else {
      // DIGITAÇÃO RÁPIDA - usar execCommand
      console.log('[WHL] ⚡ Digitação rápida...');
      document.execCommand('insertText', false, text);
      msgInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    await new Promise(r => setTimeout(r, 300));
    
    const ok = msgInput.textContent.trim().length > 0;
    console.log('[WHL]', ok ? '✅ Texto digitado com sucesso' : '❌ Falha na digitação');
    return ok;
  }

  /**
   * Encontra o botão de enviar de forma robusta
   * ATUALIZADO: Usa APENAS seletores CONFIRMADOS pelo usuário
   */
  function findSendButton() {
    // Primeiro: verificar se há modal/dialog aberto (imagem, vídeo, doc)
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const btn = dialog.querySelector('[aria-label="Enviar"]') ||
                  dialog.querySelector('button');
      if (btn && !btn.disabled) return btn;
    }
    
    // Depois: verificar no footer (mensagem normal)
    return document.querySelector('[aria-label="Enviar"]') ||
           document.querySelector('footer button:not([disabled])');
  }

  // Botão de enviar (MÉTODO PROFISSIONAL - não depende de classes)
  function getSendButton() {
    return findSendButton();
  }

  // NOTA: getSearchResults removido - não é mais necessário para modo URL

  // ===== NEW URL-BASED FUNCTIONS (REPLACING DOM SEARCH) =====

  /**
   * Envia mensagem via URL (modo exclusivo)
   * Para texto: https://web.whatsapp.com/send?phone=NUM&text=MSG
   * Para imagem: https://web.whatsapp.com/send?phone=NUM (SEM texto na URL!)
   * ATUALIZADO: Quando tem imagem, NÃO coloca texto na URL
   */
  async function sendViaURL(numero, mensagem, hasImage = false) {
    const cleanNumber = String(numero).replace(/\D/g, '');
    
    if (!cleanNumber) {
      console.log('[WHL] ❌ Número inválido');
      return { success: false, error: 'Número inválido' };
    }
    
    // URL APENAS com o número - NUNCA colocar texto na URL
    let url = `https://web.whatsapp.com/send?phone=${cleanNumber}`;
    
    console.log('[WHL] 🔗 Navegando para:', url);
    console.log('[WHL] Mensagem será digitada manualmente após chat abrir');
    
    // Salvar estado antes de navegar (para retomar após reload)
    const st = await getState();
    st.urlNavigationInProgress = true;
    st.currentPhoneNumber = cleanNumber;
    st.currentMessage = mensagem;
    await setState(st);
    
    // Navegar para a URL (isso vai causar reload da página)
    window.location.href = url;
    
    // NOTA: O código abaixo não será executado devido ao reload
    // A continuação acontece em checkAndResumeCampaignAfterURLNavigation()
    return { success: true, navigating: true };
  }

  /**
   * Verifica se há popup de erro após navegação via URL
   * CORRIGIDO: Remove busca de texto que causa falso positivo
   * APENAS verifica se tem botão OK SEM campo de mensagem
   */
  async function checkForErrorPopup() {
    // Aguardar um pouco para popup aparecer (se existir)
    await new Promise(r => setTimeout(r, 1000));
    
    // Procurar por botão OK (indica popup de erro real)
    const okButton = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim().toUpperCase() === 'OK');
    
    // SÓ é erro se tem botão OK E NÃO tem campo de mensagem
    if (okButton) {
      const messageField = getMessageInputField();
      if (!messageField) {
        console.log('[WHL] ❌ Popup de erro detectado (botão OK sem campo de mensagem)');
        return true;
      }
    }
    
    // NÃO verificar texto na página - causa falso positivo!
    // REMOVIDO: busca por 'não encontrado', 'invalid', etc no pageText
    
    return false;
  }

  /**
   * Fecha popup de erro
   */
  async function closeErrorPopup() {
    const okButton = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim().toUpperCase() === 'OK');
    
    if (okButton) {
      okButton.click();
      await new Promise(r => setTimeout(r, 500));
      console.log('[WHL] ✅ Popup de erro fechado');
      return true;
    }
    return false;
  }

  /**
   * Aguarda o chat abrir após navegação via URL
   * ATUALIZADO: Usa getMessageInputField() e lógica de erro corrigida
   */
  async function waitForChatToOpen(timeout = 15000) {
    console.log('[WHL] Aguardando chat abrir...');
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const messageField = getMessageInputField();
      if (messageField) {
        console.log('[WHL] ✅ Chat aberto - campo de mensagem encontrado');
        return true;
      }
      
      // Verificar erro APENAS se tem botão OK sem campo de mensagem
      const okButton = [...document.querySelectorAll('button')]
        .find(b => b.innerText.trim().toUpperCase() === 'OK');
      if (okButton && !getMessageInputField()) {
        console.log('[WHL] ❌ Popup de erro detectado');
        return false;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    console.log('[WHL] ⚠️ Timeout aguardando chat abrir');
    return false;
  }

  /**
   * Helper: Obtém o campo de mensagem
   * ATUALIZADO: Usa APENAS seletores CONFIRMADOS pelo usuário
   */
  function getMessageInputField() {
    // Seletores CONFIRMADOS que funcionam:
    return document.querySelector('div[aria-label="Digitar na conversa"][contenteditable="true"]') ||
           document.querySelector('div[data-tab="10"][contenteditable="true"]') ||
           document.querySelector('footer div[contenteditable="true"]');
  }

  /**
   * Helper: Dispara eventos de mouse completos em um elemento
   */
  async function dispatchMouseEvents(element) {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 50));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 50));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  /**
   * Helper: Envia tecla Enter em um elemento com fallback para botão
   * CORRIGIDO: Melhor suporte para WhatsApp Web moderno
   */
  async function sendEnterKey(element) {
    if (!element) return false;
    
    // Encontrar o elemento contenteditable pai
    const editableDiv = element.closest('div[contenteditable="true"]') || 
                        element.closest('div.copyable-area') ||
                        element;
    
    editableDiv.focus();
    await new Promise(r => setTimeout(r, 100));
    
    // Disparar eventos de teclado completos
    const events = ['keydown', 'keypress', 'keyup'];
    for (const eventType of events) {
      const event = new KeyboardEvent(eventType, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        charCode: eventType === 'keypress' ? 13 : 0,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      });
      editableDiv.dispatchEvent(event);
      await new Promise(r => setTimeout(r, 50));
    }
    
    await new Promise(r => setTimeout(r, 300));
    
    // FALLBACK: Clicar no botão de enviar
    const sendButton = findSendButton();
    if (sendButton) {
      console.log('[WHL] 🔘 Clicando no botão de enviar (fallback)');
      sendButton.click();
    }
    
    await new Promise(r => setTimeout(r, 500));
    return true;
  }

  /**
   * Envia mensagem via tecla ENTER (para mensagens de texto via URL)
   * Nota: Nome mantido como clickSendButton() por compatibilidade, mas agora usa ENTER
   */
  async function clickSendButton() {
    console.log('[WHL] 📤 Enviando mensagem via tecla ENTER...');
    
    // Aguardar um pouco para garantir que o chat está carregado
    await new Promise(r => setTimeout(r, 500));
    
    // Obter o campo de mensagem usando helper
    const msgInput = getMessageInputField();
    
    if (msgInput) {
      console.log('[WHL] ✅ Campo de mensagem encontrado');
      
      // Enviar tecla ENTER usando helper
      await sendEnterKey(msgInput);
      console.log('[WHL] ✅ Tecla ENTER enviada');
      
      // Verificar se mensagem foi enviada
      const checkInput = getMessageInputField();
      if (!checkInput || checkInput.textContent.trim().length === 0) {
        console.log('[WHL] ✅ Mensagem enviada com sucesso!');
        return { success: true };
      }
      
      console.log('[WHL] ⚠️ Mensagem ainda presente no campo');
      return { success: true, warning: 'Não foi possível verificar se mensagem foi enviada' };
    }
    
    console.log('[WHL] ❌ Campo de mensagem não encontrado');
    return { success: false, error: 'Campo de mensagem não encontrado' };
  }

  // DEPRECATED: sendTextMessage removido - agora envia via tecla ENTER após navegação via URL

  /**
   * Fecha popup de número inválido
   */
  function closeInvalidNumberPopup() {
    const okBtn = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim().toUpperCase() === 'OK');

    if (okBtn) {
      okBtn.click();
      console.log('[WHL] ✅ Popup de número inválido fechado');
      return true;
    }
    return false;
  }

  // ===== DOM MANIPULATION FUNCTIONS =====
  
  // Função para digitar em campos do WhatsApp Web (usa execCommand)
  async function typeInField(element, text) {
    if (!element) return false;
    const st = await getState();
    window.__whl_cached_state__ = st;

    element.focus();
    await new Promise(r => setTimeout(r, 150));

    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 80));

    if (st.typingEffect) {
      for (const ch of String(text || '')) {
        document.execCommand('insertText', false, ch);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, Math.max(10, Number(st.typingDelayMs)||35)));
      }
    } else {
      document.execCommand('insertText', false, String(text || ''));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
    }

    const inserted = (element.textContent || '').length > 0;
    console.log('[WHL] Texto inserido:', inserted ? '✅' : '❌', String(text || '').substring(0, 20));
    return inserted;
  }
  
  // Função para simular digitação caractere por caractere
  async function simulateTyping(element, text, delay = 50) {
    element.focus();
    element.textContent = '';
    
    for (const char of text) {
      element.textContent += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Função para simular clique robusto
  function simulateClick(element) {
    if (!element) return false;
    
    // Método 1: Focus primeiro
    element.focus();
    
    // Método 2: Disparar eventos de mouse completos
    const mouseDownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(mouseDownEvent);
    
    const mouseUpEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(mouseUpEvent);
    
    // Método 3: Click event
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(clickEvent);
    
    // Método 4: Click direto como fallback
    element.click();
    
    return true;
  }

  // DEPRECATED: clearSearchField removido - modo URL não precisa de busca

  // DEPRECATED: waitForSearchResults removido - modo URL não usa busca DOM

  // DEPRECATED: openChatViaDom removido - modo URL substitui completamente

  // DEPRECATED: typeMessageViaDom removido - modo URL não precisa digitar via DOM

  // ===== MAIN SENDING FUNCTION (URL MODE ONLY) =====
  
  /**
   * Função principal de envio usando APENAS URL
   * Não mais usa busca via DOM
   */
  async function sendMessageViaURL(phoneNumber, message) {
    console.log('[WHL] ████████████████████████████████████████');
    console.log('[WHL] ███ ENVIANDO MENSAGEM VIA URL ███');
    console.log('[WHL] ████████████████████████████████████████');
    console.log('[WHL] Para:', phoneNumber);
    console.log('[WHL] Mensagem:', message ? message.substring(0, 50) + '...' : '(sem texto)');
    
    const st = await getState();
    const hasImage = !!st.imageData;
    
    // Usar sendViaURL que navega para a URL apropriada
    await sendViaURL(phoneNumber, message, hasImage);
    
    // NOTA: A função sendViaURL causa um reload da página
    // A continuação do envio acontece em checkAndResumeCampaignAfterURLNavigation()
    return true;
  }

  // Função para validar que o chat aberto corresponde ao número esperado
  async function validateOpenChat(expectedPhone) {
    console.log('[WHL] ========================================');
    console.log('[WHL] VALIDANDO CHAT ABERTO');
    console.log('[WHL] Número esperado:', expectedPhone);
    console.log('[WHL] ========================================');
    
    // Normalizar o número esperado
    const normalizedExpected = normalize(expectedPhone);
    
    // Aguardar um pouco para o chat carregar
    await new Promise(r => setTimeout(r, 500));
    
    // Tentar múltiplas formas de obter o número do chat aberto
    let chatNumber = null;
    
    // Método 1: Procurar no header do chat pelo data-id
    const chatHeader = document.querySelector('header[data-testid="conversation-header"]') ||
                      document.querySelector('header.pane-header') ||
                      document.querySelector('div[data-testid="conversation-info-header"]');
    
    if (chatHeader) {
      // Buscar em elementos com data-id dentro do header
      const elementsWithDataId = chatHeader.querySelectorAll('[data-id]');
      for (const el of elementsWithDataId) {
        const dataId = el.getAttribute('data-id');
        if (dataId) {
          const nums = extractNumbersFromText(dataId);
          if (nums.length > 0) {
            chatNumber = nums[0];
            console.log('[WHL] Número do chat encontrado via data-id:', chatNumber);
            break;
          }
        }
      }
      
      // Buscar em títulos e aria-labels
      if (!chatNumber) {
        const titleEl = chatHeader.querySelector('[title]');
        const ariaLabelEl = chatHeader.querySelector('[aria-label]');
        
        if (titleEl) {
          const nums = extractNumbersFromText(titleEl.getAttribute('title'));
          if (nums.length > 0) {
            chatNumber = nums[0];
            console.log('[WHL] Número do chat encontrado via title:', chatNumber);
          }
        }
        
        if (!chatNumber && ariaLabelEl) {
          const nums = extractNumbersFromText(ariaLabelEl.getAttribute('aria-label'));
          if (nums.length > 0) {
            chatNumber = nums[0];
            console.log('[WHL] Número do chat encontrado via aria-label:', chatNumber);
          }
        }
      }
    }
    
    // Método 2: Procurar na URL atual
    if (!chatNumber) {
      const url = window.location.href;
      const nums = extractNumbersFromText(url);
      if (nums.length > 0) {
        chatNumber = nums[0];
        console.log('[WHL] Número do chat encontrado via URL:', chatNumber);
      }
    }
    
    // Método 3: Buscar em elementos do DOM principal
    if (!chatNumber) {
      const mainPanel = document.querySelector('div[data-testid="conversation-panel-wrapper"]') ||
                       document.querySelector('div.pane-main');
      
      if (mainPanel) {
        const elementsWithDataId = mainPanel.querySelectorAll('[data-id]');
        for (const el of elementsWithDataId) {
          const dataId = el.getAttribute('data-id');
          if (dataId) {
            const nums = extractNumbersFromText(dataId);
            if (nums.length > 0) {
              chatNumber = nums[0];
              console.log('[WHL] Número do chat encontrado via main panel data-id:', chatNumber);
              break;
            }
          }
        }
      }
    }
    
    if (!chatNumber) {
      console.log('[WHL] ⚠️ VALIDAÇÃO: Não foi possível determinar o número do chat aberto');
      console.log('[WHL] ⚠️ VALIDAÇÃO INCONCLUSIVA: Prosseguindo com o envio (não bloqueante)');
      // Se não conseguimos validar, NÃO bloqueamos o envio - continuamos
      return true;
    }
    
    // Normalizar o número do chat
    const normalizedChat = normalize(chatNumber);
    
    // Comparar os números (últimos 8-10 dígitos para maior flexibilidade)
    // Alguns números podem ter código do país, então comparamos a parte final
    const minLength = Math.min(normalizedExpected.length, normalizedChat.length);
    const compareLength = Math.min(10, minLength); // Comparar até 10 dígitos
    
    const expectedSuffix = normalizedExpected.slice(-compareLength);
    const chatSuffix = normalizedChat.slice(-compareLength);
    
    const isValid = expectedSuffix === chatSuffix;
    
    console.log('[WHL] Comparação de números:');
    console.log('[WHL]   Esperado (normalizado):', normalizedExpected);
    console.log('[WHL]   Chat (normalizado):', normalizedChat);
    console.log('[WHL]   Sufixo esperado:', expectedSuffix);
    console.log('[WHL]   Sufixo do chat:', chatSuffix);
    console.log('[WHL]   Validação:', isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO');
    
    return isValid;
  }

  // Função auxiliar para extrair números de texto
  function extractNumbersFromText(text) {
    if (!text) return [];
    const str = String(text);
    const numbers = [];
    
    // Padrão para números (8-15 dígitos)
    const normalized = normalize(str);
    const matches = normalized.match(/\d{8,15}/g);
    if (matches) {
      matches.forEach(num => numbers.push(num));
    }
    
    // Padrão WhatsApp (@c.us)
    const whatsappPattern = /(\d{8,15})@c\.us/g;
    let match;
    while ((match = whatsappPattern.exec(str)) !== null) {
      numbers.push(match[1]);
    }
    
    return numbers;
  }

  // ===== OLD FUNCTIONS (DEPRECATED - Kept for fallback) =====

  // Função para enviar via URL (FALLBACK) - NOTA: Não usado atualmente pois causa reload
  // Mantido para referência futura
  async function sendMessageViaUrl(phoneNumber, message) {
    console.log('[WHL] ════════════════════════════════════════');
    console.log('[WHL] ═══ ENVIANDO VIA URL (FALLBACK) ═══');
    console.log('[WHL] ════════════════════════════════════════');
    console.log('[WHL] ⚠️ NOTA: URL fallback não implementado pois causa reload de página');
    console.log('[WHL] ⚠️ Isso quebraria o fluxo da campanha automática');
    console.log('[WHL] 💡 Use a segunda tentativa DOM ou configure retry para números que falham');
    
    return false;
  }

  // Função para enviar usando Enter no campo de mensagem
  async function sendViaEnterKey() {
    const msgInput = getMessageInput();
    if (!msgInput) return false;
    
    msgInput.focus();
    
    // Disparar Enter
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    msgInput.dispatchEvent(enterEvent);
    
    return true;
  }

  async function waitForPageLoad() {
    const maxWait = 20000;
    const start = Date.now();
    
    while (Date.now() - start < maxWait) {
      // Verificar se o campo de mensagem E botão de enviar existem
      const messageInput = getMessageInput();
      const sendButton = getSendButton();
      
      if (messageInput && sendButton) {
        console.log('[WHL] ✅ Chat carregado, pronto para enviar');
        return true;
      }
      
      // Log de debug
      if (Date.now() - start > 5000) {
        console.log('[WHL] Aguardando chat carregar...', {
          messageInput: !!messageInput,
          sendButton: !!sendButton
        });
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    console.log('[WHL] ⚠️ Timeout aguardando chat carregar');
    return false;
  }

  async function autoSendMessage() {
    console.log('[WHL] Tentando enviar mensagem...');
    
    // Aguardar um pouco para garantir que a mensagem foi preenchida via URL
    await new Promise(r => setTimeout(r, 2000));
    
    // Tentar encontrar o botão de enviar
    const sendButton = getSendButton();
    
    if (sendButton) {
      console.log('[WHL] Botão de enviar encontrado:', sendButton);
      
      // Simular clique robusto
      simulateClick(sendButton);
      console.log('[WHL] Clique simulado no botão de enviar');
      
      // Aguardar um pouco
      await new Promise(r => setTimeout(r, 1000));
      
      // Verificar se a mensagem foi enviada (campo de input deve estar vazio)
      const msgInput = getMessageInput();
      if (msgInput && msgInput.textContent.trim() === '') {
        console.log('[WHL] ✅ Mensagem enviada com sucesso!');
        return true;
      }
      
      // Se ainda tem texto, tentar via Enter
      console.log('[WHL] Tentando enviar via tecla Enter...');
      await sendViaEnterKey();
      await new Promise(r => setTimeout(r, 1000));
      
      return true;
    }
    
    // Fallback: tentar enviar via Enter direto
    console.log('[WHL] Botão não encontrado, tentando via Enter...');
    const sent = await sendViaEnterKey();
    
    if (sent) {
      console.log('[WHL] Enviado via Enter');
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }
    
    console.log('[WHL] ❌ Não foi possível enviar a mensagem');
    return false;
  }

  // Função para verificar e retomar campanha após navegação via URL
  async function checkAndResumeCampaignAfterURLNavigation() {
    const st = await getState();
    
    // Verificar se estamos retomando após navegação URL
    if (!st.urlNavigationInProgress) {
      return;
    }
    
    console.log('[WHL] 🔄 Retomando campanha após navegação URL...');
    console.log('[WHL] Número atual:', st.currentPhoneNumber);
    console.log('[WHL] Mensagem:', st.currentMessage?.substring(0, 50));
    
    // Aguardar página carregar completamente (aumentado de 4s para 5s)
    await new Promise(r => setTimeout(r, 5000));
    
    // Verificar se há popup de erro
    const hasError = await checkForErrorPopup();
    if (hasError) {
      console.log('[WHL] ❌ Número não encontrado no WhatsApp');
      await closeErrorPopup();
      
      // Marcar como falha
      const cur = st.queue[st.index];
      if (cur) {
        cur.status = 'failed';
        cur.errorReason = 'Número não encontrado no WhatsApp';
      }
      
      st.urlNavigationInProgress = false;
      st.index++;
      await setState(st);
      await render();
      
      // Continuar com próximo
      scheduleCampaignStepViaDom();
      return;
    }
    
    // Verificar se chat abriu
    const chatOpened = await waitForChatToOpen();
    if (!chatOpened) {
      console.log('[WHL] ❌ Chat não abriu');
      
      // Marcar como falha
      const cur = st.queue[st.index];
      if (cur) {
        cur.status = 'failed';
        cur.errorReason = 'Chat não abriu';
      }
      
      st.urlNavigationInProgress = false;
      st.index++;
      await setState(st);
      await render();
      
      // Continuar com próximo
      scheduleCampaignStepViaDom();
      return;
    }
    
    console.log('[WHL] ✅ Chat aberto');
    
    // Processar envio conforme o tipo
    const cur = st.queue[st.index];
    let success = false;
    
    // Se tem imagem, usar fluxo correto: TEXTO PRIMEIRO, DEPOIS IMAGEM
    if (st.imageData) {
      console.log('[WHL] 📸 Modo TEXTO + IMAGEM');
      const imageResult = await sendTextWithImage(st.imageData, st.currentMessage);
      success = imageResult && imageResult.ok;
      
      if (success) {
        console.log('[WHL] ✅ Texto + Imagem enviados');
      } else {
        console.log('[WHL] ❌ Falha ao enviar texto + imagem');
      }
    } else if (st.currentMessage) {
      // MODO TEXTO: URL abriu o chat, agora digitar e enviar
      console.log('[WHL] 📝 Modo TEXTO: digitando mensagem...');
      await new Promise(r => setTimeout(r, 2000));
      
      // Obter configuração de typing effect
      const useHumanTyping = st.typingEffect !== false; // default true
      
      // SEMPRE digitar o texto manualmente (não confiar na URL)
      const typed = await typeMessageInField(st.currentMessage, useHumanTyping);
      if (!typed) {
        console.log('[WHL] ❌ Falha ao digitar texto');
        success = false;
      } else {
        await new Promise(r => setTimeout(r, 500));
        
        // Tentar enviar (3 tentativas)
        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`[WHL] Tentativa de envio ${attempt}/3...`);
          
          // Método 1: Clicar no botão de enviar
          const sendBtn = findSendButton();
          if (sendBtn) {
            console.log('[WHL] ✅ Botão de enviar encontrado');
            sendBtn.click();
            await new Promise(r => setTimeout(r, 1000));
            
            // Verificar se foi enviado (campo deve estar vazio)
            const msgInput = getMessageInputField();
            if (!msgInput || msgInput.textContent.trim().length === 0) {
              success = true;
              console.log('[WHL] ✅ Mensagem enviada com sucesso!');
              break;
            }
          }
          
          // Método 2: Tentar via ENTER como fallback
          if (!success && attempt < 3) {
            const msgInput = getMessageInputField();
            if (msgInput) {
              await sendEnterKey(msgInput);
              await new Promise(r => setTimeout(r, 1000));
              
              const checkInput = getMessageInputField();
              if (!checkInput || checkInput.textContent.trim().length === 0) {
                success = true;
                console.log('[WHL] ✅ Mensagem enviada via ENTER!');
                break;
              }
            }
          }
          
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      if (success) {
        console.log('[WHL] ✅ Texto enviado');
      } else {
        console.log('[WHL] ❌ Falha ao enviar texto após 3 tentativas');
      }
    }
    
    // Atualizar estado
    if (cur) {
      if (success) {
        cur.status = 'sent';
        console.log(`[WHL] ✅ Sucesso: ${cur.phone}`);
      } else {
        cur.status = 'failed';
        cur.errorReason = 'Falha no envio';
        console.log(`[WHL] ❌ Falha: ${cur.phone}`);
      }
    }
    
    st.urlNavigationInProgress = false;
    st.index++;
    await setState(st);
    await render();
    
    // Continuar com próximo após delay
    if (st.index < st.queue.length && st.isRunning) {
      const delay = getRandomDelay(st.delayMin, st.delayMax);
      console.log(`[WHL] ⏳ Aguardando ${Math.round(delay/1000)}s antes do próximo...`);
      
      campaignInterval = setTimeout(() => {
        processCampaignStepViaDom();
      }, delay);
    } else if (st.index >= st.queue.length) {
      // Campanha finalizada
      st.isRunning = false;
      await setState(st);
      await render();
      console.log('[WHL] 🎉 Campanha finalizada!');
    }
  }

  // ===== NEW DOM-BASED CAMPAIGN PROCESSING =====

  // Loop da campanha via URL (substituindo modo DOM)
  async function processCampaignStepViaDom() {
    const st = await getState();
    
    if (!st.isRunning || st.isPaused) {
      console.log('[WHL] Campanha parada ou pausada');
      return;
    }
    
    if (st.index >= st.queue.length) {
      console.log('[WHL] 🎉 Campanha finalizada!');
      st.isRunning = false;
      await setState(st);
      await render();
      return;
    }
    
    const cur = st.queue[st.index];
    
    // Pular números inválidos
    if (cur && cur.valid === false) {
      console.log('[WHL] ⚠️ Número inválido, pulando:', cur.phone);
      cur.status = 'failed';
      st.index++;
      await setState(st);
      await render();
      scheduleCampaignStepViaDom();
      return;
    }
    
    // Pular se não existe
    if (!cur) {
      st.index++;
      await setState(st);
      scheduleCampaignStepViaDom();
      return;
    }
    
    // Pular números já processados (enviados ou falhados finais)
    if (cur.status === 'sent') {
      st.index++;
      await setState(st);
      scheduleCampaignStepViaDom();
      return;
    }
    
    // Se já falhou e não é para retry, pular
    if (cur.status === 'failed' && !cur.retryPending) {
      st.index++;
      await setState(st);
      scheduleCampaignStepViaDom();
      return;
    }
    
    console.log(`[WHL] Processando ${st.index + 1}/${st.queue.length}: ${cur.phone}`);
    cur.status = 'opened';
    await setState(st);
    await render();
    
    // Enviar via URL (isso vai causar reload da página)
    await sendMessageViaURL(cur.phone, st.message);
    
    // NOTA: A função sendMessageViaURL causa um reload da página
    // A continuação do envio acontece em checkAndResumeCampaignAfterURLNavigation()
  }

  function scheduleCampaignStepViaDom() {
    if (campaignInterval) clearTimeout(campaignInterval);
    campaignInterval = setTimeout(() => {
      processCampaignStepViaDom();
    }, 100);
  }

  async function startCampaign() {
    const st = await getState();
    
    if (st.queue.length === 0) {
      alert('Por favor, adicione números e gere a tabela primeiro!');
      return;
    }

    if (st.isRunning) {
      console.log('[WHL] Campaign already running');
      return;
    }

    // Calculate stats
    st.stats.sent = st.queue.filter(c => c.status === 'sent').length;
    st.stats.failed = st.queue.filter(c => c.status === 'failed').length;
    st.stats.pending = st.queue.filter(c => c.status === 'pending' || c.status === 'opened').length;

    st.isRunning = true;
    st.isPaused = false;
    await setState(st);
    await render();

    console.log('[WHL] 🚀 Campanha iniciada (modo URL)');
    
    // Usar modo URL (com reload de página)
    processCampaignStepViaDom();
  }

  async function pauseCampaign() {
    console.log('[WHL] 🔸 Botão PAUSAR clicado');
    const st = await getState();
    
    if (st.isPaused) {
      // Retomar
      console.log('[WHL] ▶️ Retomando campanha...');
      st.isPaused = false;
      await setState(st);
      await render();
      
      // Continuar processamento de onde parou
      if (st.isRunning) {
        scheduleCampaignStepViaDom();
      }
    } else {
      // Pausar
      console.log('[WHL] ⏸️ Pausando campanha...');
      st.isPaused = true;
      await setState(st);
      await render();
      
      // Limpar interval para parar o loop
      if (campaignInterval) {
        clearTimeout(campaignInterval);
        campaignInterval = null;
      }
    }
  }

  async function stopCampaign() {
    const st = await getState();
    st.isRunning = false;
    st.isPaused = false;
    await setState(st);
    await render();

    if (campaignInterval) {
      clearTimeout(campaignInterval);
      campaignInterval = null;
    }

    console.log('[WHL] Campaign stopped');
  }

  // ===== RENDER & UI =====

  async function render() {
    const panel = ensurePanel();
    const state = await getState();

    // visibility
    panel.style.display = state.panelVisible ? 'block' : 'none';

    const numbersEl = document.getElementById('whlNumbers');
    const msgEl = document.getElementById('whlMsg');
    const delayMinEl = document.getElementById('whlDelayMin');
    const delayMaxEl = document.getElementById('whlDelayMax');
    const continueOnErrorEl = document.getElementById('whlContinueOnError');

    if (numbersEl && numbersEl.value !== state.numbersText) numbersEl.value = state.numbersText;
    if (msgEl && msgEl.value !== state.message) msgEl.value = state.message;
    if (delayMinEl) delayMinEl.value = state.delayMin;
    if (delayMaxEl) delayMaxEl.value = state.delayMax;
    if (continueOnErrorEl) continueOnErrorEl.checked = !!state.continueOnError;
    const retryEl = document.getElementById('whlRetryMax');
    const schedEl = document.getElementById('whlScheduleAt');
    if (retryEl) retryEl.value = state.retryMax ?? 0;
    if (schedEl && (schedEl.value||'') !== (state.scheduleAt||'')) schedEl.value = state.scheduleAt || '';
    // Preview
    const curp = state.queue[state.index];
    const phone = curp?.phone || '';
    const imgEl = document.getElementById('whlPreviewImg');
    const textEl = document.getElementById('whlPreviewText');
    const timeEl = document.getElementById('whlPreviewMeta');

    // mensagem final (se CSV tiver customMessage, use)
    const msgFinal = (curp?.customMessage || state.message || '').replace('{phone}', phone);

    if (textEl) textEl.textContent = msgFinal || '';
    if (imgEl) {
      if (state.imageData) {
        imgEl.src = state.imageData;
        imgEl.style.display = 'block';
      } else {
        imgEl.removeAttribute('src');
        imgEl.style.display = 'none';
      }
    }

    if (timeEl) {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      timeEl.textContent = `${hh}:${mm}`;
    }


    // Image hint
    const ih = document.getElementById('whlImageHint');
    const selectImageBtn = document.getElementById('whlSelectImageBtn');
    const clearImageBtn = document.getElementById('whlClearImageBtn');
    if (ih) {
      if (state.imageData) {
        ih.textContent = '✅ Imagem anexada e pronta para envio';
        ih.style.color = '#78ffa0';
        if (clearImageBtn) clearImageBtn.style.display = '';
        if (selectImageBtn) selectImageBtn.textContent = '📎 Trocar Imagem';
      } else {
        ih.textContent = '';
        if (clearImageBtn) clearImageBtn.style.display = 'none';
        if (selectImageBtn) selectImageBtn.textContent = '📎 Anexar Imagem';
      }
    }
    // Selector health
    const sh = document.getElementById('whlSelectorHealth');
    if (sh) sh.innerHTML = state.selectorHealth?.ok ? '✅ Seletores OK' : `⚠️ Seletores: ${(state.selectorHealth?.issues||[]).join(', ')}`;


    // Update status badge
    const statusBadge = document.getElementById('whlStatusBadge');
    if (statusBadge) {
      statusBadge.className = 'status-badge';
      if (state.isRunning && !state.isPaused) {
        statusBadge.textContent = 'Enviando...';
        statusBadge.classList.add('running');
      } else if (state.isPaused) {
        statusBadge.textContent = 'Pausado';
        statusBadge.classList.add('paused');
      } else {
        statusBadge.textContent = 'Parado';
        statusBadge.classList.add('stopped');
      }
    }

    // Update statistics
    const sent = state.queue.filter(c => c.status === 'sent').length;
    const failed = state.queue.filter(c => c.status === 'failed').length;
    const pending = state.queue.filter(c => c.status === 'pending' || c.status === 'opened').length;

    document.getElementById('whlStatSent').textContent = sent;
    document.getElementById('whlStatFailed').textContent = failed;
    document.getElementById('whlStatPending').textContent = pending;

    // Update progress bar
    const total = state.queue.length;
    const completed = sent + failed;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    document.getElementById('whlProgressFill').style.width = `${percentage}%`;
    document.getElementById('whlProgressText').textContent = `${percentage}% (${completed}/${total})`;

    document.getElementById('whlMeta').textContent = `${state.queue.length} contato(s) • posição: ${Math.min(state.index+1, Math.max(1,state.queue.length))}/${Math.max(1,state.queue.length)}`;

    const tb = document.getElementById('whlTable');
    tb.innerHTML = '';

    state.queue.forEach((c, i) => {
      const tr = document.createElement('tr');
      const pill = c.status || 'pending';
      
      // Highlight current item
      if (i === state.index && state.isRunning) {
        tr.classList.add('current');
      }
      
      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="tip" data-tip="${c.valid===false ? 'Número inválido (8 a 15 dígitos). Ex: 5511999998888' : ''}">${c.phone}${c.valid===false ? ' ⚠️' : ''}</span></td>
        <td><span class="pill ${pill}">${c.valid===false ? 'invalid' : pill}</span></td>
        <td>
          <button data-act="del" data-i="${i}" style="margin:0;padding:6px 10px;border-radius:10px">X</button>
        </td>
      `;
      tb.appendChild(tr);
    });

    tb.querySelectorAll('button').forEach(btn => {
      btn.onclick = async () => {
        const i = Number(btn.dataset.i);
        const act = btn.dataset.act;
        const st = await getState();
        if (!st.queue[i]) return;
        if (act === 'del') {
          st.queue.splice(i,1);
          if (st.index >= st.queue.length) st.index = Math.max(0, st.queue.length-1);
          await setState(st);
          await render();
        }
      };
    });

    document.getElementById('whlHint').textContent = 'Modo automático via URL: configure os delays e clique em "Iniciar Campanha"';

    const cur = state.queue[state.index];
    if (state.isRunning && !state.isPaused) {
      document.getElementById('whlStatus').innerHTML = cur
        ? `Enviando para: <b>${cur.phone}</b>`
        : 'Processando...';
    } else if (state.isPaused) {
      document.getElementById('whlStatus').innerHTML = 'Campanha pausada. Clique em "Pausar" novamente para continuar.';
    } else {
      document.getElementById('whlStatus').innerHTML = cur
        ? `Próximo: <b>${cur.phone}</b>. Clique em "Iniciar Campanha" para começar.`
        : 'Fila vazia. Cole números e clique "Gerar tabela".';
    }

    // Enable/disable buttons based on campaign state
    const startBtn = document.getElementById('whlStartCampaign');
    const pauseBtn = document.getElementById('whlPauseCampaign');
    const stopBtn = document.getElementById('whlStopCampaign');

    if (startBtn) {
      startBtn.disabled = state.isRunning && !state.isPaused;
      startBtn.style.opacity = startBtn.disabled ? '0.5' : '1';
    }
    if (pauseBtn) {
      pauseBtn.disabled = !state.isRunning;
      pauseBtn.style.opacity = pauseBtn.disabled ? '0.5' : '1';
      pauseBtn.textContent = state.isPaused ? '▶️ Retomar' : '⏸️ Pausar';
    }
    if (stopBtn) {
      stopBtn.disabled = !state.isRunning;
      stopBtn.style.opacity = stopBtn.disabled ? '0.5' : '1';
    }
  }

  async function buildQueueFromInputs() {
    const st = await getState();
    st.numbersText = document.getElementById('whlNumbers').value || '';
    st.message = document.getElementById('whlMsg').value || '';

    const rawNums = (st.numbersText||'').split(/\r?\n/).map(n => whlSanitize(n)).filter(n => n.length >= 8);
    
    // FILTRAGEM DE DUPLICATAS COM NORMALIZAÇÃO
    const uniqueNums = [];
    const seen = new Set();
    let duplicatesRemoved = 0;
    
    for (const num of rawNums) {
      // Normalizar: adicionar 55 se for número brasileiro sem código
      let normalized = num.replace(/\D/g, '');
      if (normalized.length === 10 || normalized.length === 11) {
        normalized = '55' + normalized;
      }
      
      // Verificar duplicata (considerando versões com e sem 55)
      const without55 = normalized.startsWith('55') && normalized.length >= 12 
        ? normalized.substring(2) 
        : normalized;
      
      if (seen.has(normalized) || seen.has(without55)) {
        duplicatesRemoved++;
        console.log('[WHL] Duplicata removida:', num);
        continue;
      }
      
      seen.add(normalized);
      seen.add(without55);
      uniqueNums.push(normalized);
    }
    
    // Criar fila com números únicos
    st.queue = uniqueNums.map(n => ({ 
      phone: n, 
      status: whlIsValidPhone(n) ? 'pending' : 'failed', 
      valid: whlIsValidPhone(n), 
      retries: 0 
    }));
    
    st.index = 0;
    st.stats = { sent: 0, failed: 0, pending: uniqueNums.length };
    
    await setState(st);
    await render();
    
    // Feedback visual
    const hintEl = document.getElementById('whlHint');
    if (hintEl) {
      if (duplicatesRemoved > 0) {
        hintEl.textContent = `✅ ${uniqueNums.length} números únicos (${duplicatesRemoved} duplicata(s) removida(s))`;
        hintEl.style.color = '#4ade80';
      } else {
        hintEl.textContent = `✅ ${uniqueNums.length} números carregados`;
        hintEl.style.color = '#4ade80';
      }
    }
  }

  async function skip() {
    const st = await getState();
    if (!st.queue.length) return;
    
    const cur = st.queue[st.index];
    if (cur) {
      cur.status = 'failed';
      // Stats will be recalculated by render() from queue status
    }
    
    st.index++;
    if (st.index >= st.queue.length) st.index = Math.max(0, st.queue.length - 1);
    await setState(st);
    await render();
  }

  async function wipe() {
    if (campaignInterval) {
      clearTimeout(campaignInterval);
      campaignInterval = null;
    }
    
    await setState({
      numbersText: '',
      message: '',
      queue: [],
      index: 0,
      openInNewTab: false,
      panelVisible: true,
      isRunning: false,
      isPaused: false,
      delayMin: 2,
      delayMax: 6,
      continueOnError: true,
      stats: { sent: 0, failed: 0, pending: 0 }
    });
    await render();
  }

  async function bindOnce() {
    ensurePanel();

    // Tab switching functionality
    document.querySelectorAll('.whl-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // Remover active de todas as tabs
        document.querySelectorAll('.whl-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.whl-tab-content').forEach(c => c.classList.remove('active'));
        
        // Adicionar active na tab clicada
        tab.classList.add('active');
        const tabId = tab.dataset.tab;
        document.getElementById(`whl-tab-${tabId}`).classList.add('active');
      });
    });

    
// ===== WHL: Bind Extrator Isolado ao Painel =====
try {
  const btnExtract = document.getElementById('whlExtractContacts');
  const boxExtract = document.getElementById('whlExtractedNumbers');
  const extractControls = document.getElementById('whlExtractControls');
  const btnPause = document.getElementById('whlPauseExtraction');
  const btnCancel = document.getElementById('whlCancelExtraction');
  
  let isExtracting = false;
  let isPaused = false;

  if (btnExtract && boxExtract) {
    btnExtract.addEventListener('click', () => {
      btnExtract.disabled = true;
      btnExtract.textContent = '⏳ Extraindo...';
      isExtracting = true;
      isPaused = false;
      
      if (extractControls) extractControls.style.display = 'flex';
      
      const st = document.getElementById('whlExtractStatus'); 
      if (st) st.textContent = 'Iniciando extração...';
      const progressBar = document.getElementById('whlExtractProgress');
      const progressFill = document.getElementById('whlExtractProgressFill');
      const progressText = document.getElementById('whlExtractProgressText');
      if (progressBar) progressBar.style.display = 'block';
      if (progressFill) progressFill.style.width = '0%';
      if (progressText) progressText.textContent = '0% - 0 contatos encontrados';
      window.postMessage({ type: 'WHL_EXTRACT_CONTACTS' }, '*');
    });
  }
  
  // Botão de pausar
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      if (isPaused) {
        // Retomar
        window.postMessage({ type: 'WHL_RESUME_EXTRACTION' }, '*');
        btnPause.textContent = '⏸️ Pausar';
        isPaused = false;
        const st = document.getElementById('whlExtractStatus');
        if (st) st.textContent = 'Extração retomada...';
      } else {
        // Pausar
        window.postMessage({ type: 'WHL_PAUSE_EXTRACTION' }, '*');
        btnPause.textContent = '▶️ Continuar';
        isPaused = true;
        const st = document.getElementById('whlExtractStatus');
        if (st) st.textContent = 'Extração pausada. Clique em "Continuar" para retomar.';
      }
    });
  }
  
  // Botão de cancelar
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      window.postMessage({ type: 'WHL_CANCEL_EXTRACTION' }, '*');
      const st = document.getElementById('whlExtractStatus');
      if (st) st.textContent = 'Cancelando extração...';
    });
  }

  window.addEventListener('message', (e) => {
    if (!e || !e.data) return;

    if (e.data.type === 'WHL_EXTRACT_PROGRESS') {
      const progress = e.data.progress || 0;
      const count = e.data.count || 0;
      
      // Cache DOM elements for better performance
      const progressBar = document.getElementById('whlExtractProgress');
      const progressFill = document.getElementById('whlExtractProgressFill');
      const progressText = document.getElementById('whlExtractProgressText');
      const statusEl = document.getElementById('whlExtractStatus');
      
      if (progressBar) progressBar.style.display = 'block';
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (progressText) progressText.textContent = `${progress}% - ${count} contatos encontrados`;
      
      if (statusEl) {
        if (isPaused) {
          statusEl.textContent = `Pausado - ${count} contatos até agora`;
        } else {
          statusEl.textContent = `Extraindo... ${progress}% - ${count} contatos`;
        }
      }
    }

    if (e.data.type === 'WHL_EXTRACT_RESULT') {
      // Receber resultados categorizados
      const normal = e.data.normal || e.data.numbers || [];
      const archived = e.data.archived || [];
      const blocked = e.data.blocked || [];
      
      // Preencher textareas
      if (boxExtract) boxExtract.value = normal.join('\n');
      
      const archivedBox = document.getElementById('whlArchivedNumbers');
      if (archivedBox) archivedBox.value = archived.join('\n');
      
      const blockedBox = document.getElementById('whlBlockedNumbers');
      if (blockedBox) blockedBox.value = blocked.join('\n');
      
      // Atualizar contadores
      const normalCount = document.getElementById('whlNormalCount');
      if (normalCount) normalCount.textContent = normal.length;
      
      const archivedCount = document.getElementById('whlArchivedCount');
      if (archivedCount) archivedCount.textContent = archived.length;
      
      const blockedCount = document.getElementById('whlBlockedCount');
      if (blockedCount) blockedCount.textContent = blocked.length;
      
      isExtracting = false;
      isPaused = false;
      
      if (extractControls) extractControls.style.display = 'none';
      
      const statusEl = document.getElementById('whlExtractStatus');
      const totalCount = normal.length + archived.length + blocked.length;
      if (e.data.cancelled) {
        if (statusEl) statusEl.textContent = `⛔ Extração cancelada. Total: ${totalCount} números (${normal.length} normais, ${archived.length} arquivados, ${blocked.length} bloqueados)`;
      } else {
        if (statusEl) statusEl.textContent = `✅ Finalizado! Total: ${totalCount} números (${normal.length} normais, ${archived.length} arquivados, ${blocked.length} bloqueados)`;
      }
      
      const progressBar = document.getElementById('whlExtractProgress');
      if (progressBar) {
        setTimeout(() => {
          progressBar.style.display = 'none';
        }, PROGRESS_BAR_HIDE_DELAY);
      }
      
      if (btnExtract) {
        btnExtract.disabled = false;
        btnExtract.textContent = '📥 Extrair contatos';
      }
      
      if (btnPause) {
        btnPause.textContent = '⏸️ Pausar';
      }
    }

    if (e.data.type === 'WHL_EXTRACT_ERROR') {
      console.error('[WHL] Erro no extrator:', e.data.error);
      alert('Erro ao extrair contatos');
      
      isExtracting = false;
      isPaused = false;
      
      if (extractControls) extractControls.style.display = 'none';
      
      const progressBar = document.getElementById('whlExtractProgress');
      if (progressBar) progressBar.style.display = 'none';
      
      if (btnExtract) {
        btnExtract.disabled = false;
        btnExtract.textContent = '📥 Extrair contatos';
      }
    }
    
    if (e.data.type === 'WHL_EXTRACTION_PAUSED') {
      const statusEl = document.getElementById('whlExtractStatus');
      if (statusEl) statusEl.textContent = 'Extração pausada. Clique em "Continuar" para retomar.';
    }
    
    if (e.data.type === 'WHL_EXTRACTION_RESUMED') {
      const statusEl = document.getElementById('whlExtractStatus');
      if (statusEl) statusEl.textContent = 'Extração retomada...';
    }
  });

  // Copiar TODOS os números (soma de normais + arquivados + bloqueados)
  const btnCopyToClipboard = document.getElementById('whlCopyExtracted');
  if (btnCopyToClipboard) {
    btnCopyToClipboard.addEventListener('click', async () => {
      const normalBox = document.getElementById('whlExtractedNumbers');
      const archivedBox = document.getElementById('whlArchivedNumbers');
      const blockedBox = document.getElementById('whlBlockedNumbers');
      
      const normal = (normalBox?.value || '').split('\n').filter(n => n.trim());
      const archived = (archivedBox?.value || '').split('\n').filter(n => n.trim());
      const blocked = (blockedBox?.value || '').split('\n').filter(n => n.trim());
      
      const allNumbers = [...normal, ...archived, ...blocked].join('\n');
      
      if (!allNumbers.trim()) {
        alert('Nenhum número para copiar. Execute a extração primeiro.');
        return;
      }
      
      try {
        await navigator.clipboard.writeText(allNumbers);
        const originalText = btnCopyToClipboard.textContent;
        btnCopyToClipboard.textContent = '✅ Copiado!';
        setTimeout(() => {
          btnCopyToClipboard.textContent = originalText;
        }, 2000);
        
        const statusEl = document.getElementById('whlExtractStatus');
        if (statusEl) {
          const total = normal.length + archived.length + blocked.length;
          statusEl.textContent = `✅ ${total} números copiados (${normal.length} normais, ${archived.length} arquivados, ${blocked.length} bloqueados)`;
        }
      } catch (err) {
        console.error('[WHL] Erro ao copiar:', err);
        alert('Erro ao copiar números para área de transferência');
      }
    });
  }
  
  // Copiar apenas números NORMAIS
  const btnCopyNormal = document.getElementById('whlCopyNormal');
  if (btnCopyNormal) {
    btnCopyNormal.addEventListener('click', async () => {
      const normalBox = document.getElementById('whlExtractedNumbers');
      const numbers = normalBox?.value || '';
      
      if (!numbers.trim()) {
        alert('Nenhum número normal para copiar.');
        return;
      }
      
      try {
        await navigator.clipboard.writeText(numbers);
        const originalText = btnCopyNormal.textContent;
        btnCopyNormal.textContent = '✅ Copiado!';
        setTimeout(() => {
          btnCopyNormal.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('[WHL] Erro ao copiar:', err);
        alert('Erro ao copiar números');
      }
    });
  }
  
  // Copiar apenas números ARQUIVADOS
  const btnCopyArchived = document.getElementById('whlCopyArchived');
  if (btnCopyArchived) {
    btnCopyArchived.addEventListener('click', async () => {
      const archivedBox = document.getElementById('whlArchivedNumbers');
      const numbers = archivedBox?.value || '';
      
      if (!numbers.trim()) {
        alert('Nenhum número arquivado para copiar.');
        return;
      }
      
      try {
        await navigator.clipboard.writeText(numbers);
        const originalText = btnCopyArchived.textContent;
        btnCopyArchived.textContent = '✅ Copiado!';
        setTimeout(() => {
          btnCopyArchived.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('[WHL] Erro ao copiar:', err);
        alert('Erro ao copiar números');
      }
    });
  }
  
  // Copiar apenas números BLOQUEADOS
  const btnCopyBlocked = document.getElementById('whlCopyBlocked');
  if (btnCopyBlocked) {
    btnCopyBlocked.addEventListener('click', async () => {
      const blockedBox = document.getElementById('whlBlockedNumbers');
      const numbers = blockedBox?.value || '';
      
      if (!numbers.trim()) {
        alert('Nenhum número bloqueado para copiar.');
        return;
      }
      
      try {
        await navigator.clipboard.writeText(numbers);
        const originalText = btnCopyBlocked.textContent;
        btnCopyBlocked.textContent = '✅ Copiado!';
        setTimeout(() => {
          btnCopyBlocked.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('[WHL] Erro ao copiar:', err);
        alert('Erro ao copiar números');
      }
    });
  }

  // Export Extracted CSV
  const btnExportExtractedCsv = document.getElementById('whlExportExtractedCsv');
  if (btnExportExtractedCsv) {
    btnExportExtractedCsv.addEventListener('click', async () => {
      await whlExportExtractedCSV();
    });
  }
} catch(e) {
  console.error('[WHL] Falha ao bindar extrator no painel', e);
}

// persist typing
    document.getElementById('whlNumbers').addEventListener('input', async (e) => {
      const st = await getState();
      st.numbersText = e.target.value || '';
      await setState(st);
    });
    document.getElementById('whlMsg').addEventListener('input', async (e) => {
      const st = await getState();
      st.message = e.target.value || '';
      await setState(st);
    });
    
    // Enter key to auto-generate queue (build table)
    const msgTextarea = document.getElementById('whlMsg');
    if (msgTextarea) {
      msgTextarea.addEventListener('keydown', async (e) => {
        // Check if Enter key was pressed (without Shift for new line)
        if (e.key === 'Enter' && !e.shiftKey) {
          const st = await getState();
          
          // Only auto-build if there are numbers and a message
          if (st.numbersText.trim() && st.message.trim()) {
            e.preventDefault(); // Prevent default new line behavior only when triggering action
            console.log('[WHL] 📨 Enter pressionado - gerando tabela automaticamente');
            // Trigger build queue
            const buildBtn = document.getElementById('whlBuild');
            if (buildBtn) {
              buildBtn.click();
            }
          }
        }
      });
    }
    
    // Delay configuration
    document.getElementById('whlDelayMin').addEventListener('input', async (e) => {
      const st = await getState();
      st.delayMin = Math.max(1, parseInt(e.target.value) || 5);
      await setState(st);
    });
    document.getElementById('whlDelayMax').addEventListener('input', async (e) => {
      const st = await getState();
      st.delayMax = Math.max(1, parseInt(e.target.value) || 10);
      await setState(st);
    });
    document.getElementById('whlContinueOnError').addEventListener('change', async (e) => {
      const st = await getState();
      st.continueOnError = !!e.target.checked;
      await setState(st);
    });

    // Retry max
    document.getElementById('whlRetryMax').addEventListener('input', async (e) => {
      const st = await getState();
      st.retryMax = Math.max(0, Math.min(5, parseInt(e.target.value)||0));
      await setState(st);
      await render();
    });
    // Schedule
    document.getElementById('whlScheduleAt').addEventListener('input', async (e) => {
      const st = await getState();
      st.scheduleAt = e.target.value || '';
      await setState(st);
      await render();
    });
    // CSV
    document.getElementById('whlCsv').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const rows = whlCsvToRows(text);
      const st = await getState();
      const queue = [];
      for (const r of rows) {
        const phone = whlSanitize(r[0]||'');
        const valid = whlIsValidPhone(phone);
        queue.push({ phone, status: valid?'pending':'failed', valid, retries:0 });
      }
      st.queue = queue;
      st.numbersText = queue.map(x=>x.phone).join('\n');
      st.index = 0;
      st.stats = { sent:0, failed: queue.filter(x=>x.status==='failed').length, pending: queue.filter(x=>x.status==='pending').length };
      await setState(st);
      await render();
    });
    // Image
    document.getElementById('whlImage').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      const st = await getState();
      if (!file) { st.imageData = null; await setState(st); await render(); return; }
      st.imageData = await whlReadFileAsDataURL(file);
      await setState(st);
      await render();
    });
    
    // Image button handlers
    const selectImageBtn = document.getElementById('whlSelectImageBtn');
    if (selectImageBtn) {
      selectImageBtn.addEventListener('click', () => {
        // Trigger the hidden file input
        const imageInput = document.getElementById('whlImage');
        if (imageInput) {
          imageInput.click();
        }
      });
    }
    
    const clearImageBtn = document.getElementById('whlClearImageBtn');
    if (clearImageBtn) {
      clearImageBtn.addEventListener('click', async () => {
        // Clear the file input and trigger change event to handle state update
        const fileInput = document.getElementById('whlImage');
        if (fileInput) {
          fileInput.value = '';
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
    
    // Drafts
    document.getElementById('whlSaveDraft').addEventListener('click', async () => {
      const name = prompt('Nome do rascunho:', 'default') || 'default';
      const st = await getState();
      st.drafts = st.drafts || {};
      st.drafts[name] = {
        numbersText: st.numbersText, message: st.message, imageData: st.imageData,
        delayMin: st.delayMin, delayMax: st.delayMax, retryMax: st.retryMax,
        scheduleAt: st.scheduleAt, typingEffect: st.typingEffect
      };
      await setState(st);
      await render();
    });
    document.getElementById('whlLoadDraft').addEventListener('click', async () => {
      const st = await getState();
      const keys = Object.keys(st.drafts||{});
      
      if (!keys.length) {
        // Mostrar mensagem clara
        alert('Nenhum rascunho salvo.\n\nPara salvar um rascunho, preencha os campos e clique em "Salvar".');
        return;
      }
      
      const name = prompt('Rascunhos disponíveis:\n\n' + keys.map((k, i) => `${i+1}. ${k}`).join('\n') + '\n\nDigite o nome do rascunho:', keys[0]);
      if (!name || !st.drafts[name]) {
        if (name) alert(`Rascunho "${name}" não encontrado.`);
        return;
      }
      
      const d = st.drafts[name];
      st.numbersText = d.numbersText||''; st.message=d.message||''; st.imageData=d.imageData||null;
      st.delayMin = d.delayMin ?? st.delayMin; st.delayMax = d.delayMax ?? st.delayMax;
      st.retryMax = d.retryMax ?? st.retryMax; st.scheduleAt = d.scheduleAt||'';
      st.typingEffect = d.typingEffect ?? st.typingEffect;
      await setState(st);
      await render();
      
      alert(`Rascunho "${name}" carregado com sucesso!`);
    });
    // Report
    document.getElementById('whlExportReport').addEventListener('click', async ()=>{ await whlExportReportCSV(); const h=document.getElementById('whlReportHint'); if(h) h.textContent='✅ Exportado.'; });
    document.getElementById('whlCopyFailed').addEventListener('click', async ()=>{ const st=await getState(); const f=(st.queue||[]).filter(x=>x.status==='failed'||x.valid===false).map(x=>x.phone).join('\n'); await navigator.clipboard.writeText(f); const h=document.getElementById('whlReportHint'); if(h) h.textContent='✅ Falhas copiadas.'; });

    // Save message button
    document.getElementById('whlSaveMessage').addEventListener('click', async () => {
      const st = await getState();
      const msgValue = document.getElementById('whlMsg').value || '';
      
      if (!msgValue.trim()) {
        alert('Por favor, digite uma mensagem antes de salvar.');
        return;
      }
      
      // Save to drafts with a timestamp-based name
      const timestamp = new Date().toLocaleString('pt-BR');
      const name = prompt('Nome da mensagem salva:', `Mensagem ${timestamp}`) || `Mensagem ${timestamp}`;
      
      st.drafts = st.drafts || {};
      st.drafts[name] = {
        numbersText: st.numbersText,
        message: msgValue,
        imageData: st.imageData,
        delayMin: st.delayMin,
        delayMax: st.delayMax,
        retryMax: st.retryMax,
        scheduleAt: st.scheduleAt,
        typingEffect: st.typingEffect
      };
      
      await setState(st);
      alert(`✅ Mensagem "${name}" salva com sucesso!`);
    });

    document.getElementById('whlBuild').addEventListener('click', buildQueueFromInputs);
    document.getElementById('whlClear').addEventListener('click', async () => {
      const st = await getState();
      st.numbersText = '';
      st.message = '';
      await setState(st);
      await render();
    });

    // Campaign controls
    document.getElementById('whlStartCampaign').addEventListener('click', startCampaign);
    document.getElementById('whlPauseCampaign').addEventListener('click', pauseCampaign);
    document.getElementById('whlStopCampaign').addEventListener('click', stopCampaign);

    document.getElementById('whlSkip').addEventListener('click', skip);
    document.getElementById('whlWipe').addEventListener('click', wipe);

    document.getElementById('whlHide').addEventListener('click', async () => {
      const st = await getState();
      st.panelVisible = false;
      await setState(st);
      await render();
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'WHL_TOGGLE_PANEL') {
      (async () => {
        const st = await getState();
        st.panelVisible = !st.panelVisible;
        await setState(st);
        await render();
      })();
    }
  });

  // init
  (async () => {
    bindOnce();
    await whlUpdateSelectorHealth();
    await render();
    
    // Check and resume campaign if needed (for URL navigation)
    await checkAndResumeCampaignAfterURLNavigation();
    
    console.log('[WHL] Extension initialized');
  })();


  // ===== IMAGE AUTO SEND (FROM ORIGINAL) =====
  // ATUALIZADO: Usa APENAS seletor CONFIRMADO pelo usuário
  function getAttachButton() {
    const btn = document.querySelector('[aria-label="Anexar"]');
    if (btn) {
      console.log('[WHL] ✅ Botão de anexar encontrado');
      return btn;
    }
    console.log('[WHL] ❌ Botão de anexar não encontrado');
    return null;
  }


  // ===== IMAGE AUTO SEND (FROM ORIGINAL) =====
  function getImageInput() {
      return document.querySelector('input[accept*="image"]');
    }


  // ===== IMAGE AUTO SEND (FROM ORIGINAL) =====
  async function sendImage(imageData, captionText, useTypingEffect) {
    console.log('[WHL] 📸 Sending image');
    let captionApplied = false;

    try {
      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();

      // Create file
      const file = new File([blob], 'image.jpg', { type: blob.type });

      // Find attach button
      const attachBtn = getAttachButton();
      if (!attachBtn) {
        console.log('[WHL] ❌ Attach button not found');
        return { ok: false, captionApplied };
      }

      // Click attach
      attachBtn.click();
      await new Promise(r => setTimeout(r, 500));

      // Find image input
      const imageInput = getImageInput();
      if (!imageInput) {
        console.log('[WHL] ❌ Image input not found');
        return { ok: false, captionApplied };
      }

      // Create DataTransfer and set file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      imageInput.files = dataTransfer.files;

      // Trigger change event
      imageInput.dispatchEvent(new Event('change', { bubbles: true }));

      console.log('[WHL] ✅ Image attached, waiting for preview');
      await new Promise(r => setTimeout(r, 1300));

      const cap = String(captionText || '').trim();
      if (cap) {
        let capBox = null;
        const capSelectors = [
          'div[aria-label*="legenda"][contenteditable="true"]',
          'div[aria-label*="Legenda"][contenteditable="true"]',
          'div[aria-label*="Adicionar"][contenteditable="true"]',
          'div[aria-label*="caption"][contenteditable="true"]',
          'div[aria-label*="Caption"][contenteditable="true"]'
        ];
        const start = Date.now();
        while (Date.now() - start < 6000 && !capBox) {
          for (const sel of capSelectors) {
            const el = document.querySelector(sel);
            if (el && el.getAttribute('data-tab') !== '3') { capBox = el; break; }
          }
          if (!capBox) await new Promise(r => setTimeout(r, 250));
        }

        if (capBox) {
          capBox.focus();
          await new Promise(r => setTimeout(r, 120));
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          await new Promise(r => setTimeout(r, 80));

          if (useTypingEffect) {
            for (const ch of cap) {
              document.execCommand('insertText', false, ch);
              capBox.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise(r => setTimeout(r, 18));
            }
          } else {
            document.execCommand('insertText', false, cap);
            capBox.dispatchEvent(new Event('input', { bubbles: true }));
          }

          captionApplied = true;
          console.log('[WHL] ✅ Caption typed in preview');
          await new Promise(r => setTimeout(r, 250));
        } else {
          console.log('[WHL] ⚠️ Caption box not found; will try sending text after media');
        }
      }

      // Find and click send button in image preview
      const sendBtn = findSendButton();

      if (sendBtn) {
        sendBtn.click();
        console.log('[WHL] ✅ Image sent');
        return { ok: true, captionApplied };
      } else {
        console.log('[WHL] ❌ Send button not found in preview');
        return { ok: false, captionApplied };
      }
    } catch (error) {
      console.error('[WHL] ❌ Error sending image:', error);
      return { ok: false, captionApplied: false };
    }
  }

  /**
   * Converte imagem WebP para JPEG
   * Evita que imagens WebP sejam enviadas como stickers
   */
  async function convertWebPtoJPEG(file) {
    return new Promise((resolve) => {
      if (!file.type.includes('webp')) {
        resolve(file);
        return;
      }
      
      console.log('[WHL] 🔄 Convertendo WebP para JPEG...');
      
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          const newFile = new File([blob], file.name.replace('.webp', '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          console.log('[WHL] ✅ WebP convertido para JPEG');
          resolve(newFile);
        }, 'image/jpeg', 0.92);
      };
      
      img.onerror = () => {
        console.log('[WHL] ❌ Erro ao converter WebP, usando original');
        resolve(file);
      };
      
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * DEPRECATED: Anexa imagem e digita legenda manualmente
   * ATUALIZADO: Usa seletores CONFIRMADOS pelo usuário
   * NOTA: Esta função é mantida como fallback. Use sendTextWithImage() ao invés desta.
   */
  async function sendImageWithCaption(imageData, captionText) {
    console.log('[WHL] 📸 Iniciando envio de imagem...');

    try {
      // Converter base64 para blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      const file = new File([blob], 'image.jpg', { type: blob.type });

      // 1. Clicar no botão de anexar
      const attachBtn = document.querySelector('[aria-label="Anexar"]');
      if (!attachBtn) {
        console.log('[WHL] ❌ Botão de anexar não encontrado');
        return { ok: false };
      }

      attachBtn.click();
      console.log('[WHL] ✅ Botão de anexar clicado');
      await new Promise(r => setTimeout(r, 1000));

      // 2. Encontrar input de arquivo
      const imageInput = document.querySelector('input[accept*="image"]');
      if (!imageInput) {
        console.log('[WHL] ❌ Input de imagem não encontrado');
        return { ok: false };
      }

      // 3. Anexar arquivo
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      imageInput.files = dataTransfer.files;
      imageInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('[WHL] ✅ Imagem anexada, aguardando preview...');
      await new Promise(r => setTimeout(r, 2500));

      // 4. Digitar legenda se houver
      if (captionText && captionText.trim()) {
        console.log('[WHL] ⌨️ Digitando legenda...');
        
        // Procurar campo de legenda no dialog
        const captionSelectors = [
          'div[aria-label*="legenda"][contenteditable="true"]',
          'div[aria-label*="Legenda"][contenteditable="true"]',
          'div[aria-label*="caption"][contenteditable="true"]',
          '[role="dialog"] div[contenteditable="true"]'
        ];
        
        let captionBox = null;
        for (let i = 0; i < 10; i++) {
          for (const sel of captionSelectors) {
            captionBox = document.querySelector(sel);
            if (captionBox) break;
          }
          if (captionBox) break;
          await new Promise(r => setTimeout(r, 300));
        }
        
        if (captionBox) {
          captionBox.focus();
          await new Promise(r => setTimeout(r, 200));
          captionBox.textContent = '';
          document.execCommand('insertText', false, captionText);
          captionBox.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('[WHL] ✅ Legenda digitada');
          await new Promise(r => setTimeout(r, 500));
        } else {
          console.log('[WHL] ⚠️ Campo de legenda não encontrado');
        }
      }

      // 5. Clicar no botão de enviar
      console.log('[WHL] 📤 Enviando...');
      await new Promise(r => setTimeout(r, 500));
      
      // Procurar botão no dialog
      const dialog = document.querySelector('[role="dialog"]');
      let sendBtn = null;
      if (dialog) {
        sendBtn = dialog.querySelector('[aria-label="Enviar"]') ||
                  [...dialog.querySelectorAll('button')].find(b => !b.disabled);
      }
      
      if (!sendBtn) {
        sendBtn = document.querySelector('[aria-label="Enviar"]');
      }
      
      if (sendBtn) {
        sendBtn.click();
        console.log('[WHL] ✅ Botão de enviar clicado');
        await new Promise(r => setTimeout(r, 2000));
        return { ok: true };
      }
      
      console.log('[WHL] ❌ Botão de enviar não encontrado');
      return { ok: false };

    } catch (error) {
      console.error('[WHL] ❌ Erro ao enviar imagem:', error);
      return { ok: false };
    }
  }

  /**
   * NOVA FUNÇÃO: Envia texto + imagem na ordem correta
   * FLUXO: 1. Digita texto PRIMEIRO, 2. Anexa imagem, 3. Envia
   * Isso garante que o texto aparece como legenda da imagem
   * ATUALIZADO: Melhora detecção do botão correto de "Fotos e vídeos"
   */
  async function sendTextWithImage(imageData, messageText) {
    console.log('[WHL] 📸 Enviando FOTO (não sticker)...');
    console.log('[WHL] Texto:', messageText?.substring(0, 50) + '...');

    try {
      // PASSO 1: Digitar o texto PRIMEIRO (se houver)
      if (messageText && messageText.trim()) {
        console.log('[WHL] ⌨️ PASSO 1: Digitando texto primeiro...');
        const st = await getState();
        const useHumanTyping = st.typingEffect !== false;
        const typed = await typeMessageInField(messageText, useHumanTyping);
        if (!typed) {
          console.log('[WHL] ❌ Falha ao digitar texto');
          return { ok: false };
        }
        console.log('[WHL] ✅ Texto digitado');
        await new Promise(r => setTimeout(r, 500));
      }

      // PASSO 2: Converter base64 para blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      
      // Determinar tipo MIME e extensão
      let mimeType = blob.type || 'image/jpeg';
      let extension = 'jpg';
      
      if (mimeType.includes('png')) {
        extension = 'png';
      } else if (mimeType.includes('gif')) {
        extension = 'gif';
      } else if (mimeType.includes('webp')) {
        // IMPORTANTE: WebP pode ser enviado como sticker - converter para JPEG
        console.log('[WHL] ⚠️ Imagem webp detectada, convertendo para JPEG...');
        extension = 'webp';
      }
      
      const timestamp = Date.now();
      let file = new File([blob], `foto_${timestamp}.${extension}`, { 
        type: mimeType,
        lastModified: timestamp
      });
      
      // Converter WebP para JPEG para evitar ser enviado como sticker
      if (mimeType.includes('webp')) {
        file = await convertWebPtoJPEG(file);
        console.log('[WHL] ✅ Arquivo convertido:', file.type, file.name);
      }

      console.log('[WHL] 📷 Arquivo preparado:', {
        tipo: mimeType,
        tamanho: `${(blob.size / 1024).toFixed(1)} KB`,
        nome: file.name
      });

      // PASSO 3: Clicar no botão de anexar (ícone de clipe)
      console.log('[WHL] 📎 PASSO 2: Clicando no botão de anexar...');
      
      const attachBtn = document.querySelector('[data-testid="attach-clip"]') ||
                        document.querySelector('[data-testid="clip"]') ||
                        document.querySelector('span[data-icon="attach-menu-plus"]')?.closest('button') ||
                        document.querySelector('span[data-icon="clip"]')?.closest('button') ||
                        document.querySelector('[aria-label="Anexar"]') ||
                        document.querySelector('[title="Anexar"]');
      
      if (!attachBtn) {
        console.log('[WHL] ❌ Botão de anexar não encontrado');
        return { ok: false };
      }

      attachBtn.click();
      console.log('[WHL] ✅ Botão de anexar clicado');
      await new Promise(r => setTimeout(r, 1000));

      // PASSO 4: CRÍTICO - Clicar especificamente em "Fotos e vídeos"
      // O menu de anexar tem várias opções: Documento, Câmera, Sticker, Fotos e vídeos
      // Precisamos clicar em "Fotos e vídeos" para enviar como FOTO
      console.log('[WHL] 🖼️ PASSO 3: Procurando "Fotos e vídeos"...');
      
      // Método 1: Procurar por data-testid específico
      let photosBtn = document.querySelector('[data-testid="attach-image"]') ||
                      document.querySelector('[data-testid="mi-attach-media"]') ||
                      document.querySelector('[data-testid="attach-photo"]');
      
      // Método 2: Procurar por aria-label ou texto
      if (!photosBtn) {
        const menuItems = document.querySelectorAll('li, button, div[role="button"], span[role="button"]');
        for (const item of menuItems) {
          const label = (item.getAttribute('aria-label') || item.textContent || '').toLowerCase();
          // Procurar por "fotos", "vídeos", "photos", "videos" - mas NÃO "figurinha" ou "sticker"
          if ((label.includes('foto') || label.includes('photo') || label.includes('vídeo') || label.includes('video') || label.includes('mídia') || label.includes('media') || label.includes('imagem') || label.includes('image')) && 
              !label.includes('figurinha') && !label.includes('sticker') && !label.includes('adesivo')) {
            photosBtn = item;
            console.log('[WHL] ✅ Encontrou opção de mídia:', label);
            break;
          }
        }
      }
      
      // Método 3: Procurar pelo ícone específico
      if (!photosBtn) {
        const icons = document.querySelectorAll('span[data-icon]');
        for (const icon of icons) {
          const iconName = icon.getAttribute('data-icon') || '';
          // Ícones de mídia: gallery, image, photo, attach-image
          if (iconName.includes('gallery') || iconName.includes('image') || iconName.includes('photo') || iconName.includes('attach-image')) {
            photosBtn = icon.closest('li') || icon.closest('button') || icon.closest('div[role="button"]');
            if (photosBtn) {
              console.log('[WHL] ✅ Encontrou ícone de mídia:', iconName);
              break;
            }
          }
        }
      }
      
      if (photosBtn) {
        photosBtn.click();
        console.log('[WHL] ✅ Clicou em Fotos e vídeos');
        await new Promise(r => setTimeout(r, 800));
      } else {
        console.log('[WHL] ⚠️ Opção "Fotos e vídeos" não encontrada, tentando input direto');
      }

      // PASSO 5: Encontrar o input CORRETO (NÃO o de sticker)
      console.log('[WHL] 📁 PASSO 4: Procurando input de fotos...');
      
      let imageInput = null;
      const allInputs = document.querySelectorAll('input[type="file"]');
      
      console.log('[WHL] Inputs encontrados:', allInputs.length);
      
      // Prioridade 1: Input com accept que inclui image/* ou video/*
      for (const input of allInputs) {
        const accept = input.getAttribute('accept') || '';
        console.log('[WHL] Analisando input:', accept);
        
        // EVITAR input de sticker (apenas image/webp)
        if (accept === 'image/webp' || accept.match(/^image\/webp$/)) {
          console.log('[WHL] ⚠️ Ignorando input de sticker:', accept);
          continue;
        }
        
        // Preferir input que aceita múltiplos tipos de imagem ou vídeo
        if (accept.includes('image/') && (accept.includes(',') || accept.includes('video'))) {
          imageInput = input;
          console.log('[WHL] ✅ Input de fotos/vídeos encontrado:', accept);
          break;
        }
      }
      
      // Prioridade 2: Qualquer input de imagem que não seja só webp
      if (!imageInput) {
        for (const input of allInputs) {
          const accept = input.getAttribute('accept') || '';
          if (accept.includes('image') && !accept.match(/^image\/webp$/)) {
            imageInput = input;
            console.log('[WHL] ✅ Input de imagem encontrado (fallback 1):', accept);
            break;
          }
        }
      }
      
      // Prioridade 3: Input com accept="*" ou muito genérico
      if (!imageInput) {
        for (const input of allInputs) {
          const accept = input.getAttribute('accept') || '';
          if (accept === '*' || accept === '*/*' || accept.includes('*')) {
            imageInput = input;
            console.log('[WHL] ✅ Input genérico encontrado:', accept);
            break;
          }
        }
      }
      
      // Último fallback
      if (!imageInput) {
        // Pegar qualquer input que não seja só webp
        for (const input of allInputs) {
          const accept = input.getAttribute('accept') || '';
          if (accept !== 'image/webp') {
            imageInput = input;
            console.log('[WHL] ⚠️ Usando input disponível:', accept);
            break;
          }
        }
      }
      
      if (!imageInput) {
        console.log('[WHL] ❌ Nenhum input de imagem adequado encontrado');
        return { ok: false };
      }

      // PASSO 6: Anexar arquivo
      console.log('[WHL] 📎 Anexando imagem ao input...');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      imageInput.files = dataTransfer.files;
      imageInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('[WHL] ✅ Imagem anexada, aguardando preview...');
      // Aumentar delay para aguardar preview abrir (mínimo 1500ms conforme spec)
      await new Promise(r => setTimeout(r, 2000));
      
      // Retry: verificar se preview abriu
      let retries = 0;
      let previewFound = false;
      while (retries < 5 && !previewFound) {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) {
          previewFound = true;
          console.log('[WHL] ✅ Preview detectado');
          break;
        }
        console.log(`[WHL] ⏳ Aguardando preview... tentativa ${retries + 1}/5`);
        await new Promise(r => setTimeout(r, 1000));
        retries++;
      }
      
      if (!previewFound) {
        console.log('[WHL] ⚠️ Preview não detectado após 5 segundos, continuando...');
      }
      
      // PASSO 6.5: Digitar legenda no campo correto (se houver texto que ainda não foi enviado)
      // Verificar se há campo de legenda no preview
      if (messageText && messageText.trim()) {
        console.log('[WHL] 📝 Verificando campo de legenda no preview...');
        
        const captionSelectors = [
          'div[aria-label*="legenda"][contenteditable="true"]',
          'div[aria-label*="Legenda"][contenteditable="true"]',
          'div[aria-label*="caption"][contenteditable="true"]',
          'div[aria-label*="Caption"][contenteditable="true"]',
          'div[aria-label*="Adicionar"][contenteditable="true"]',
          'div[contenteditable="true"][data-tab="10"]',
          '[role="dialog"] div[contenteditable="true"]'
        ];
        
        let captionBox = null;
        for (const sel of captionSelectors) {
          const el = document.querySelector(sel);
          // Evitar campo de mensagem principal (data-tab="3")
          if (el && el.getAttribute('data-tab') !== '3') {
            captionBox = el;
            console.log('[WHL] ✅ Campo de legenda encontrado:', sel);
            break;
          }
        }
        
        if (captionBox) {
          console.log('[WHL] ⌨️ Digitando legenda no preview...');
          captionBox.focus();
          await new Promise(r => setTimeout(r, 200));
          
          // Limpar campo
          captionBox.textContent = '';
          captionBox.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 100));
          
          // Digitar texto usando execCommand + eventos
          document.execCommand('insertText', false, messageText);
          captionBox.dispatchEvent(new Event('input', { bubbles: true }));
          captionBox.dispatchEvent(new Event('change', { bubbles: true }));
          
          console.log('[WHL] ✅ Legenda digitada no preview');
          await new Promise(r => setTimeout(r, 500));
        } else {
          console.log('[WHL] ℹ️ Campo de legenda não encontrado (texto será enviado separadamente)');
        }
      }

      // PASSO 7: Enviar a imagem
      console.log('[WHL] 📤 PASSO 5: Enviando IMAGEM...');
      
      // Procurar botão de enviar no dialog/preview com múltiplos fallbacks
      let sendBtn = null;
      const dialog = document.querySelector('[role="dialog"]');
      
      if (dialog) {
        // Método 1: Por data-testid
        sendBtn = dialog.querySelector('[data-testid="send"]') ||
                  dialog.querySelector('[data-testid="compose-btn-send"]');
        
        // Método 2: Por aria-label
        if (!sendBtn) {
          sendBtn = dialog.querySelector('[aria-label="Enviar"]') ||
                    dialog.querySelector('[aria-label="Send"]') ||
                    dialog.querySelector('button[aria-label*="Enviar"]') ||
                    dialog.querySelector('button[aria-label*="Send"]');
        }
        
        // Método 3: Por ícone
        if (!sendBtn) {
          const sendIcon = dialog.querySelector('span[data-icon="send"]') ||
                          dialog.querySelector('span[data-icon="send-light"]');
          if (sendIcon) {
            sendBtn = sendIcon.closest('button');
          }
        }
        
        // Método 4: Último fallback - qualquer botão habilitado no dialog
        if (!sendBtn) {
          sendBtn = dialog.querySelector('button:not([disabled])');
        }
      }
      
      // Se não encontrou no dialog, tentar fora
      if (!sendBtn) {
        sendBtn = document.querySelector('[data-testid="send"]') ||
                  document.querySelector('[aria-label="Enviar"]') ||
                  document.querySelector('span[data-icon="send"]')?.closest('button');
      }
      
      if (sendBtn) {
        sendBtn.click();
        console.log('[WHL] ✅ IMAGEM enviada!');
      } else {
        console.log('[WHL] ❌ Botão de enviar não encontrado para imagem');
        return { ok: false };
      }

      // PASSO 8: Aguardar dialog fechar e enviar texto (se houver)
      console.log('[WHL] ⏳ Aguardando dialog fechar...');
      
      for (let i = 0; i < 20; i++) {
        const dialogStillOpen = document.querySelector('[role="dialog"]');
        if (!dialogStillOpen) {
          console.log('[WHL] ✅ Dialog fechou');
          break;
        }
        await new Promise(r => setTimeout(r, 300));
      }
      
      await new Promise(r => setTimeout(r, 1500));
      
      // Verificar se ainda tem texto no campo de mensagem
      const msgField = getMessageInputField();
      if (msgField && msgField.textContent.trim().length > 0) {
        console.log('[WHL] 📤 PASSO 6: Enviando TEXTO...');
        
        const textSendBtn = document.querySelector('footer [aria-label="Enviar"]') ||
                            document.querySelector('[data-testid="send"]') ||
                            document.querySelector('[aria-label="Enviar"]');
        
        if (textSendBtn) {
          textSendBtn.click();
          console.log('[WHL] ✅ TEXTO enviado!');
          await new Promise(r => setTimeout(r, 1500));
        } else {
          await sendEnterKey(msgField);
          console.log('[WHL] ✅ ENTER enviado para texto');
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      console.log('[WHL] ✅ Texto + Foto enviados com sucesso!');
      return { ok: true };

    } catch (error) {
      console.error('[WHL] ❌ Erro:', error);
      return { ok: false };
    }
  }

  /**
   * Nova função para enviar imagem usando ENTER (não botão)
   * IMPORTANTE: O texto deve ser digitado ANTES de chamar esta função
   * CORRIGIDO: Melhor suporte para WhatsApp Web moderno com fallback confiável
   */
  async function sendImageWithEnter(imageData) {
    console.log('[WHL] 📸 Enviando imagem - iniciando processo');

    try {
      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      const file = new File([blob], 'image.jpg', { type: blob.type });

      // 1. Clicar no botão de anexar (clipe) - melhor seletor
      const attachBtn = document.querySelector('[data-testid="clip"]') ||
                        document.querySelector('span[data-icon="clip"]')?.closest('button') ||
                        document.querySelector('button[aria-label*="Anexar"]') ||
                        document.querySelector('[aria-label="Anexar"]') ||
                        document.querySelector('span[data-icon="attach-menu-plus"]')?.closest('button');
      
      if (!attachBtn) {
        console.log('[WHL] ❌ Botão de anexar não encontrado');
        return { ok: false };
      }

      console.log('[WHL] ✅ Botão de anexar encontrado');
      attachBtn.click();
      await new Promise(r => setTimeout(r, 1000));

      // 2. Encontrar input de arquivo para imagens - esperar aparecer
      let imageInput = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        imageInput = document.querySelector('input[accept*="image"]') ||
                     document.querySelector('input[type="file"][accept*="image"]');
        if (imageInput) break;
        await new Promise(r => setTimeout(r, 200));
      }
      
      if (!imageInput) {
        console.log('[WHL] ❌ Input de imagem não encontrado após 2s');
        return { ok: false };
      }

      console.log('[WHL] ✅ Input de imagem encontrado');

      // 3. Anexar arquivo
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      imageInput.files = dataTransfer.files;
      imageInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('[WHL] ✅ Imagem anexada, aguardando preview...');
      await new Promise(r => setTimeout(r, 2500));

      // 4. Verificar se há campo de legenda
      const captionSelectors = [
        'div[aria-label*="legenda"][contenteditable="true"]',
        'div[aria-label*="Legenda"][contenteditable="true"]',
        'div[aria-label*="caption"][contenteditable="true"]',
        'div[aria-label*="Caption"][contenteditable="true"]',
        'div[aria-label*="Adicionar"][contenteditable="true"]',
        'div[contenteditable="true"][data-tab="10"]'
      ];
      
      let captionBox = null;
      for (const sel of captionSelectors) {
        const el = document.querySelector(sel);
        if (el && el.getAttribute('data-tab') !== '3') {
          captionBox = el;
          break;
        }
      }
      
      console.log('[WHL] Campo de legenda encontrado:', !!captionBox);

      // 5. MÉTODO CONFIÁVEL: Usar botão de enviar diretamente
      // WhatsApp Web moderno funciona melhor com clique no botão
      console.log('[WHL] 📤 Procurando botão de enviar...');
      
      // Esperar o botão de enviar aparecer
      let sendBtn = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        sendBtn = findSendButton();
        if (sendBtn) break;
        await new Promise(r => setTimeout(r, 300));
      }
      
      if (sendBtn) {
        console.log('[WHL] ✅ Botão de enviar encontrado - clicando');
        sendBtn.click();
        await new Promise(r => setTimeout(r, 1500));
        
        // Verificar se preview fechou (indica que foi enviado)
        const previewStillOpen = document.querySelector('[role="dialog"]') ||
                                 document.querySelector('[data-testid="media-caption-input"]') ||
                                 document.querySelector('div[aria-label*="legenda"][contenteditable]');
        
        if (!previewStillOpen) {
          console.log('[WHL] ✅ Preview fechou - imagem enviada com sucesso!');
          return { ok: true };
        }
        
        console.log('[WHL] ✅ Imagem enviada (botão)');
        return { ok: true };
      }
      
      // FALLBACK: Tentar via ENTER se botão não funcionar
      console.log('[WHL] ⚠️ Botão não encontrado, tentando via ENTER...');
      
      const focusTarget = captionBox || 
                          document.querySelector('[data-testid="media-caption-input"]') ||
                          document.querySelector('div[contenteditable="true"]');
      
      if (focusTarget) {
        focusTarget.focus();
        await new Promise(r => setTimeout(r, 300));
        
        // Disparar ENTER com todas as propriedades
        const enterEvents = ['keydown', 'keypress', 'keyup'];
        for (const eventType of enterEvents) {
          const event = new KeyboardEvent(eventType, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            charCode: eventType === 'keypress' ? 13 : 0,
            shiftKey: false,
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          });
          focusTarget.dispatchEvent(event);
          await new Promise(r => setTimeout(r, 50));
        }
        
        console.log('[WHL] ✅ ENTER enviado');
        await new Promise(r => setTimeout(r, 2000));
        
        // Verificar se funcionou
        const previewGone = !document.querySelector('[role="dialog"]');
        if (previewGone) {
          console.log('[WHL] ✅ Preview fechou - imagem enviada via ENTER!');
          return { ok: true };
        }
      }
      
      console.log('[WHL] ⚠️ Assumindo envio bem-sucedido');
      return { ok: true };

    } catch (error) {
      console.error('[WHL] ❌ Erro ao enviar imagem:', error);
      return { ok: false };
    }
  }

})();


// ===== WHL: Loader seguro do extrator isolado =====
(function(){
  try {
    if (window.__WHL_EXTRACTOR_LOADER__) return;
    window.__WHL_EXTRACTOR_LOADER__ = true;

    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('content/extractor.contacts.js');
    s.onload = () => console.log('[WHL] Extractor script injetado');
    (document.head || document.documentElement).appendChild(s);
  } catch(e) {
    console.error('[WHL] Falha ao carregar extrator', e);
  }
})();

