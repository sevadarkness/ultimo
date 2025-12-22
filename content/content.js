
(() => {
  'use strict';
  if (window.__WHL_SINGLE_TAB__) return;
  window.__WHL_SINGLE_TAB__ = true;

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
      delayMin: 5,
      delayMax: 10,
      continueOnError: true,
      imageData: null,
      retryMax: 2,
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
      #whlPanel .pill.sent{background:rgba(120,255,160,.10);border:1px solid rgba(120,255,160,.25)}
      #whlPanel .pill.failed{background:rgba(255,80,80,.10);border:1px solid rgba(255,80,80,.25)}
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
          <div class="muted">Modo <b>automático via URL</b>: configure e inicie a campanha. A extensão envia tudo sozinha!</div>
        </div>
        <button class="iconbtn" id="whlHide" title="Ocultar">—</button>
      </div>

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
                <input type="number" id="whlDelayMin" min="1" max="120" value="5" />
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-label">
                <div class="k">🕐 Delay máximo</div>
                <div class="d">Tempo máximo entre envios (seg)</div>
              </div>
              <div class="settings-control">
                <input type="number" id="whlDelayMax" min="1" max="120" value="10" />
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-label">
                <div class="k">🔄 Retry</div>
                <div class="d">Tentativas extras em falha</div>
              </div>
              <div class="settings-control">
                <input type="number" id="whlRetryMax" min="0" max="5" value="2" />
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

            <div class="settings-row toggle">
              <div class="settings-label">
                <div class="k">⌨️ Efeito digitação</div>
                <div class="d">Simula digitação humana (para legendas)</div>
              </div>
              <div class="settings-control">
                <input type="checkbox" id="whlTypingEffect" checked />
              </div>
            </div>
          </div>

          <div class="settings-footer tiny" id="whlSelectorHealth"></div>
        </div>
      </div>

      
<div class="card" id="whlExtractCard">
  <div class="title" style="font-size:13px">Extrair contatos</div>
  <div class="muted">Coleta números disponíveis no WhatsApp Web e lista aqui (1 por linha).</div>

  <div class="row" style="margin-top:10px">
    <button class="success" style="flex:1" id="whlExtractContacts">📥 Extrair contatos</button>
    <button style="width:150px" id="whlCopyExtracted">🔁 Copiar → Números</button>
  </div>

  <div id="whlExtractProgress" style="display:none;margin-top:10px">
    <div class="progress-bar">
      <div class="progress-fill" id="whlExtractProgressFill" style="width:0%"></div>
    </div>
    <div class="tiny" style="margin-top:6px;text-align:center" id="whlExtractProgressText">0%</div>
  </div>

  <textarea id="whlExtractedNumbers" placeholder="Clique em 'Extrair contatos'…" style="margin-top:10px;min-height:140px"></textarea>
  <div class="tiny" id="whlExtractStatus" style="margin-top:6px;opacity:.8"></div>
  
  <button class="primary" style="width:100%;margin-top:8px" id="whlExportExtractedCsv">📥 Extrair CSV</button>
</div>

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

        <div style="margin-top:10px">
          <div class="muted">📸 Selecionar imagem (será enviada automaticamente)</div>
          <input id="whlImage" type="file" accept="image/*" />
          <div class="tiny" id="whlImageHint"></div>
        </div>

        <div class="row" style="margin-top:10px">
          <button style="flex:1" id="whlSaveDraft">💾 Salvar</button>
          <button style="flex:1" id="whlLoadDraft">📂 Carregar</button>
        </div>

        <div class="card" style="margin-top:10px">
          <div class="title" style="font-size:13px">📱 Preview (WhatsApp)</div>
          <div class="muted">Como vai aparecer no WhatsApp:</div>
          <div class="wa-chat">
            <div class="wa-bubble">
              <img id="whlPreviewImg" alt="preview" style="display:none;width:100%;max-width:260px;border-radius:12px;margin-bottom:8px;border:1px solid rgba(255,255,255,.10)" />
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

      
        <div class="row" style="margin-top:10px">
          <button style="flex:1" id="whlExportReport">📈 Exportar relatório</button>
          <button style="flex:1" id="whlCopyFailed">📋 Copiar falhas</button>
        </div>
        <div class="tiny" id="whlReportHint" style="margin-top:6px"></div>

      <div class="card">
        <div class="title" style="font-size:13px">Tabela / Fila</div>
        <div class="muted" id="whlMeta">0 contato(s)</div>

        <table>
          <thead><tr><th>#</th><th>Número</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody id="whlTable"></tbody>
        </table>

        <div class="row" style="margin-top:8px">
          <button style="flex:1" id="whlSkip">Pular atual</button>
          <button class="danger" style="width:170px" id="whlWipe">Zerar fila</button>
        </div>

        <div class="tiny" id="whlStatus" style="margin-top:8px"></div>
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
  function getMessageInput() {
    return (
      document.querySelector('#main footer p._aupe.copyable-text') ||
      document.querySelector('footer._ak1i div.copyable-area p') ||
      document.querySelector('#main footer p._aupe')
    );
  }

  // Botão de enviar (SELETORES EXATOS)
  function getSendButton() {
    return (
      document.querySelector('footer._ak1i div._ak1r button') ||
      document.querySelector('footer._ak1i button[aria-label="Enviar"]') ||
      document.querySelector('[data-testid="send"]')
    );
  }

  // NOTA: getSearchResults removido - não é mais necessário para modo URL

  // ===== NEW URL-BASED FUNCTIONS (REPLACING DOM SEARCH) =====

  /**
   * Envia mensagem via URL (modo exclusivo)
   * Para texto: https://web.whatsapp.com/send?phone=NUM&text=MSG
   * Para imagem: https://web.whatsapp.com/send?phone=NUM
   */
  async function sendViaURL(numero, mensagem, hasImage = false) {
    const cleanNumber = String(numero).replace(/\D/g, '');
    
    if (!cleanNumber) {
      console.log('[WHL] ❌ Número inválido');
      return { success: false, error: 'Número inválido' };
    }
    
    // Construir URL
    let url = `https://web.whatsapp.com/send?phone=${cleanNumber}`;
    
    // Se for apenas texto (sem imagem), adicionar texto na URL
    if (mensagem && !hasImage) {
      url += `&text=${encodeURIComponent(mensagem)}`;
    }
    
    console.log('[WHL] 🔗 Navegando para:', url);
    
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
   */
  async function checkForErrorPopup() {
    // Aguardar um pouco para popup aparecer
    await new Promise(r => setTimeout(r, 1000));
    
    // Procurar por popup de erro
    const popup = document.querySelector('div[data-animate-modal-popup="true"]');
    const okButton = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim().toUpperCase() === 'OK');
    
    // Verificar se há mensagem de erro
    const errorMessages = [
      'número de telefone compartilhado por url é inválido',
      'phone number shared via url is invalid',
      'número inválido',
      'invalid phone number'
    ];
    
    const pageText = document.body.innerText.toLowerCase();
    for (const msg of errorMessages) {
      if (pageText.includes(msg.toLowerCase())) {
        return true;
      }
    }
    
    return okButton !== undefined && popup !== undefined;
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
   */
  async function waitForChatToOpen(timeout = 10000) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      // Verificar se o chat abriu (footer com campo de mensagem existe)
      const messageField = document.querySelector('#main footer p._aupe') ||
                           document.querySelector('footer._ak1i div.copyable-area');
      
      if (messageField) {
        return true;
      }
      
      // Verificar se há erro
      if (await checkForErrorPopup()) {
        return false;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    return false;
  }

  /**
   * Clica no botão enviar (para mensagens de texto via URL)
   */
  async function clickSendButton() {
    console.log('[WHL] 🔍 Procurando botão de enviar...');
    
    // Aguardar um pouco para garantir que o botão está renderizado
    await new Promise(r => setTimeout(r, 500));
    
    // Seletores em ordem de prioridade (baseados no que o usuário forneceu)
    const selectors = [
      '#main footer._ak1i div._ak1r button',
      'footer._ak1i div._ak1r button',
      'footer._ak1i button[aria-label="Enviar"]',
      'footer button[aria-label="Enviar"]',
      'button[data-testid="send"]',
      '[data-testid="send"]',
      'span[data-icon="send"]',
      // Seletor genérico para botão de enviar no footer
      '#main footer button:last-child',
      'footer._ak1i button'
    ];
    
    let sendButton = null;
    
    for (const selector of selectors) {
      sendButton = document.querySelector(selector);
      if (sendButton) {
        console.log('[WHL] ✅ Botão encontrado com seletor:', selector);
        break;
      }
    }
    
    // Se encontrou o span com ícone de send, pegar o button pai
    if (!sendButton) {
      const sendIcon = document.querySelector('span[data-icon="send"]');
      if (sendIcon) {
        sendButton = sendIcon.closest('button');
        if (sendButton) {
          console.log('[WHL] ✅ Botão encontrado via ícone send');
        }
      }
    }
    
    if (sendButton) {
      console.log('[WHL] 🖱️ Clicando no botão de enviar...');
      
      // Método 1: Click direto
      sendButton.click();
      
      // Aguardar um pouco
      await new Promise(r => setTimeout(r, 300));
      
      // Método 2: Se ainda não enviou, tentar via eventos
      const msgInput = document.querySelector('#main footer p._aupe') ||
                       document.querySelector('footer._ak1i div.copyable-area p');
      
      if (msgInput && msgInput.textContent.trim().length > 0) {
        console.log('[WHL] ⚠️ Mensagem ainda no campo, tentando eventos de mouse...');
        
        // Eventos de mouse completos
        sendButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        await new Promise(r => setTimeout(r, 50));
        sendButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        await new Promise(r => setTimeout(r, 50));
        sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        
        await new Promise(r => setTimeout(r, 300));
      }
      
      // Verificar se mensagem foi enviada
      const msgInputAfter = document.querySelector('#main footer p._aupe') ||
                            document.querySelector('footer._ak1i div.copyable-area p');
      
      if (!msgInputAfter || msgInputAfter.textContent.trim().length === 0) {
        console.log('[WHL] ✅ Mensagem enviada com sucesso!');
        return { success: true };
      }
      
      // Método 3: Tentar via ENTER como último recurso
      console.log('[WHL] ⚠️ Tentando via tecla ENTER...');
      if (msgInputAfter) {
        msgInputAfter.focus();
        msgInputAfter.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
        
        await new Promise(r => setTimeout(r, 500));
        
        // Verificar novamente
        const finalCheck = document.querySelector('#main footer p._aupe') ||
                          document.querySelector('footer._ak1i div.copyable-area p');
        
        if (!finalCheck || finalCheck.textContent.trim().length === 0) {
          console.log('[WHL] ✅ Mensagem enviada via ENTER!');
          return { success: true };
        }
      }
      
      console.log('[WHL] ⚠️ Não foi possível confirmar se a mensagem foi enviada');
      return { success: true }; // Assumir sucesso se o botão foi clicado
    }
    
    console.log('[WHL] ❌ Botão enviar não encontrado');
    console.log('[WHL] DEBUG: Elementos no footer:', document.querySelector('#main footer')?.innerHTML?.substring(0, 500));
    
    // Última tentativa: ENTER direto no campo de mensagem
    const msgInput = document.querySelector('#main footer p._aupe') ||
                     document.querySelector('footer._ak1i div.copyable-area p');
    
    if (msgInput) {
      console.log('[WHL] 🔄 Tentando enviar via ENTER no campo de mensagem...');
      msgInput.focus();
      msgInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
      
      await new Promise(r => setTimeout(r, 500));
      console.log('[WHL] ✅ ENTER enviado');
      return { success: true };
    }
    
    return { success: false, error: 'Botão enviar não encontrado e ENTER falhou' };
  }

  // DEPRECATED: sendTextMessage removido - agora usa clickSendButton() após navegação via URL

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
    
    // Se tem imagem, anexar e enviar
    if (st.imageData) {
      console.log('[WHL] 📸 Enviando imagem...');
      const imageResult = await sendImage(st.imageData, st.currentMessage, !!st.typingEffect);
      success = imageResult && imageResult.ok;
      
      if (success) {
        console.log('[WHL] ✅ Imagem enviada');
      } else {
        console.log('[WHL] ❌ Falha ao enviar imagem');
      }
    } else if (st.currentMessage) {
      // Se é apenas texto, clicar no botão enviar
      // (texto já foi inserido via URL parameter)
      console.log('[WHL] 📝 Enviando texto...');
      await new Promise(r => setTimeout(r, 1000));
      const sendResult = await clickSendButton();
      success = sendResult && sendResult.success;
      
      if (success) {
        console.log('[WHL] ✅ Texto enviado');
      } else {
        console.log('[WHL] ❌ Falha ao enviar texto');
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

  // DEPRECATED: Old processCampaignStep (uses page reload)
  async function processCampaignStep() {
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

  // DEPRECATED: Old processCampaignStep (uses page reload)
  async function processCampaignStep() {
    // This function is deprecated - use processCampaignStepViaDom instead
    console.log('[WHL] processCampaignStep is deprecated, this should not be called');
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
    const st = await getState();
    st.isPaused = !st.isPaused;
    await setState(st);
    await render();

    if (campaignInterval) {
      clearTimeout(campaignInterval);
      campaignInterval = null;
    }

    if (!st.isPaused && st.isRunning) {
      console.log('[WHL] Campaign resumed');
      scheduleCampaignStepViaDom();
    } else {
      console.log('[WHL] Campaign paused');
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
    const typingEl = document.getElementById('whlTypingEffect');
    if (retryEl) retryEl.value = state.retryMax ?? 2;
    if (schedEl && (schedEl.value||'') !== (state.scheduleAt||'')) schedEl.value = state.scheduleAt || '';
    if (typingEl) typingEl.checked = !!state.typingEffect;
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
    if (ih) ih.textContent = state.imageData ? '✅ Imagem selecionada' : '';
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

    const nums = (st.numbersText||'').split(/\r?\n/).map(n => whlSanitize(n)).filter(n => n.length >= 1);
    st.queue = nums.map(n => ({ phone: n, status: whlIsValidPhone(n) ? 'pending' : 'failed', valid: whlIsValidPhone(n), retries: 0 }));
    st.index = 0;
    
    // Reset stats
    st.stats = { sent: 0, failed: 0, pending: nums.length };
    
    await setState(st);
    await render();
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
      delayMin: 5,
      delayMax: 10,
      continueOnError: true,
      stats: { sent: 0, failed: 0, pending: 0 }
    });
    await render();
  }

  async function bindOnce() {
    ensurePanel();

    
// ===== WHL: Bind Extrator Isolado ao Painel =====
try {
  const btnExtract = document.getElementById('whlExtractContacts');
  const boxExtract = document.getElementById('whlExtractedNumbers');
  const boxNumbers = document.getElementById('whlNumbers');

  if (btnExtract && boxExtract) {
    btnExtract.addEventListener('click', () => {
      btnExtract.disabled = true;
      btnExtract.textContent = '⏳ Extraindo...';
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
      if (statusEl) statusEl.textContent = `Extraindo... ${progress}% - ${count} contatos`;
    }

    if (e.data.type === 'WHL_EXTRACT_RESULT') {
      const nums = e.data.numbers || [];
      if (boxExtract) boxExtract.value = nums.join('\n');
      
      const statusEl = document.getElementById('whlExtractStatus');
      if (statusEl) statusEl.textContent = `Finalizado ✅ Total: ${nums.length}`;
      
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
    }

    if (e.data.type === 'WHL_EXTRACT_ERROR') {
      console.error('[WHL] Erro no extrator:', e.data.error);
      alert('Erro ao extrair contatos');
      
      const progressBar = document.getElementById('whlExtractProgress');
      if (progressBar) progressBar.style.display = 'none';
      
      if (btnExtract) {
        btnExtract.disabled = false;
        btnExtract.textContent = '📥 Extrair contatos';
      }
    }
  });

  // Copiar → Números
  const btnCopyToNumbers = document.getElementById('whlCopyExtracted');
  if (btnCopyToNumbers && boxExtract && boxNumbers) {
    btnCopyToNumbers.addEventListener('click', () => {
      boxNumbers.value = boxExtract.value || '';
      boxNumbers.dispatchEvent(new Event('input', { bubbles: true }));
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
    // Typing
    document.getElementById('whlTypingEffect').addEventListener('change', async (e) => {
      const st = await getState();
      st.typingEffect = !!e.target.checked;
      await setState(st);
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
      if (!keys.length) return alert('Nenhum rascunho salvo.');
      const name = prompt('Digite o nome:\n'+keys.join('\n'), keys[0]) || '';
      if (!st.drafts?.[name]) return;
      const d = st.drafts[name];
      st.numbersText = d.numbersText||''; st.message=d.message||''; st.imageData=d.imageData||null;
      st.delayMin = d.delayMin ?? st.delayMin; st.delayMax = d.delayMax ?? st.delayMax;
      st.retryMax = d.retryMax ?? st.retryMax; st.scheduleAt = d.scheduleAt||'';
      st.typingEffect = d.typingEffect ?? st.typingEffect;
      await setState(st);
      await render();
    });
    // Report
    document.getElementById('whlExportReport').addEventListener('click', async ()=>{ await whlExportReportCSV(); const h=document.getElementById('whlReportHint'); if(h) h.textContent='✅ Exportado.'; });
    document.getElementById('whlCopyFailed').addEventListener('click', async ()=>{ const st=await getState(); const f=(st.queue||[]).filter(x=>x.status==='failed'||x.valid===false).map(x=>x.phone).join('\n'); await navigator.clipboard.writeText(f); const h=document.getElementById('whlReportHint'); if(h) h.textContent='✅ Falhas copiadas.'; });

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
})();


  // ===== IMAGE AUTO SEND (FROM ORIGINAL) =====
  function getAttachButton() {
      return (
        document.querySelector('[data-testid="clip"]') ||
        document.querySelector('span[data-icon="clip"]')?.closest('button') ||
        document.querySelector('[aria-label="Anexar"]')
      );
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
      const sendBtn = document.querySelector('[data-testid="send"]') ||
                      document.querySelector('span[data-icon="send"]')?.closest('button');

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

