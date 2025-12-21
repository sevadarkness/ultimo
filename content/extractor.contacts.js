
/**
 * WhatsHybrid – Extractor Isolado de Contatos
 * NÃO altera painel, NÃO altera campanha
 * Comunicação via window.postMessage
 */

(function () {
  if (window.__WHL_EXTRACTOR_LOADED__) return;
  window.__WHL_EXTRACTOR_LOADED__ = true;

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

  async function extractAll() {
    const out = new Set();
    const list = findChatList();
    if (!list) throw new Error('Lista de chats não encontrada');

    function collectFrom(el) {
      if (!el) return;
      const attrs = [
        el.getAttribute('data-id'),
        el.getAttribute('id'),
        el.getAttribute('data-testid'),
        el.textContent
      ];
      attrs.forEach(v => {
        if (!v) return;
        const m = v.replace(/\D/g,' ').split(/\s+/).filter(x => /^\d{10,15}$/.test(x));
        m.forEach(n => out.add(n));
      });
      const href = el.querySelector('a[href]')?.getAttribute('href');
      if (href) {
        const m = href.match(/(\d{10,15})/);
        if (m) out.add(m[1]);
      }
    }

    list.scrollTop = 0;
    await new Promise(r => setTimeout(r, 600));

    let lastTop = -1, stable = 0;
    while (stable < 4) {
      const items = list.querySelectorAll('[role="row"], [role="listitem"]');
      items.forEach(collectFrom);

      const next = Math.min(list.scrollTop + Math.floor(list.clientHeight * 0.85), list.scrollHeight);
      list.scrollTop = next;
      list.dispatchEvent(new Event('scroll', {bubbles:true}));
      await new Promise(r => setTimeout(r, 700));

      if (list.scrollTop === lastTop) stable++;
      else stable = 0;
      lastTop = list.scrollTop;
    }

    return Array.from(out);
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

  console.log('[WHL] Extractor isolado carregado');
})();
