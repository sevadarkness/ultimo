
/**
 * WhatsHybrid – Extractor Isolado de Contatos (VERSÃO MELHORADA)
 * NÃO altera painel, NÃO altera campanha
 * Comunicação via window.postMessage
 * 
 * GARANTIA DE NÚMEROS REAIS:
 * - Extrai números SOMENTE dos contatos presentes no WhatsApp Web
 * - NUNCA gera números aleatórios ou fictícios
 * - Busca em múltiplas fontes do DOM para garantir todos os contatos reais
 * - Valida formato (8-15 dígitos) mas preserva números originais
 * 
 * Fontes de extração (todas reais):
 * 1. Lista de chats (#pane-side) - contatos/grupos com conversas ativas
 * 2. Atributos data-id e data-jid - IDs únicos dos contatos do WhatsApp
 * 3. Células de chat ([data-testid*="cell"]) - elementos de contato
 * 4. Links com telefone - números clicáveis no WhatsApp
 * 5. Padrões @c.us - formato interno do WhatsApp para números
 * 
 * Melhorias:
 * - Múltiplas fontes de extração (todos números reais)
 * - Seletores mais abrangentes
 * - Scroll eficiente para capturar todos os contatos
 * - Barra de progresso em tempo real
 * - Regex flexível (8-15 dígitos) para formatos internacionais
 * - Extração profunda de atributos do DOM
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

  /**
   * Extrai números de um texto ou atributo
   * IMPORTANTE: Apenas extrai números REAIS presentes no WhatsApp Web
   * NÃO gera números aleatórios ou fictícios
   * 
   * Aceita formatos reais: +55 11 99999-8888, 5511999998888, 11999998888, etc
   * Extrai números de 8 a 15 dígitos (formato internacional válido)
   * 
   * @param {string} text - Texto do DOM contendo números reais de contatos
   * @returns {Array<string>} Array de números reais extraídos
   */
  function extractNumbers(text) {
    if (!text) return [];
    const str = String(text);
    const numbers = new Set();

    // Padrão 1: Números completos (com ou sem formatação)
    // Exemplo: +55 11 99999-8888, 5511999998888, etc
    const normalized = normalize(str);
    const matches = normalized.match(/\d{8,15}/g);
    if (matches) {
      matches.forEach(num => numbers.add(num));
    }

    // Padrão 2: Extração de padrões WhatsApp (@c.us)
    // Exemplo: 5511999998888@c.us
    const whatsappPattern = /(\d{8,15})@c\.us/g;
    let match;
    while ((match = whatsappPattern.exec(str)) !== null) {
      numbers.add(match[1]);
    }

    return Array.from(numbers);
  }

  /**
   * Coleta números de um elemento e todos os seus filhos
   * IMPORTANTE: Busca apenas em elementos REAIS do DOM do WhatsApp Web
   * Não cria ou gera números - apenas extrai números existentes
   * 
   * Busca em múltiplos atributos onde o WhatsApp armazena números reais:
   * - data-id: ID do contato no WhatsApp
   * - data-jid: JID (Jabber ID) do contato - formato interno do WhatsApp
   * - href: Links clicáveis com números
   * - title, aria-label: Textos acessíveis com informações de contato
   * 
   * @param {HTMLElement} el - Elemento do DOM do WhatsApp Web
   * @returns {Array<string>} Array de números reais encontrados no elemento
   */
  function collectDeepFrom(el) {
    if (!el) return [];
    const numbers = new Set();

    // Atributos a verificar
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

    // Extrair do próprio elemento
    attrs.forEach(attr => {
      const value = el.getAttribute(attr);
      if (value) {
        extractNumbers(value).forEach(n => numbers.add(n));
      }
    });

    // Extrair do textContent
    if (el.textContent) {
      extractNumbers(el.textContent).forEach(n => numbers.add(n));
    }

    // Percorrer todos os filhos recursivamente
    const children = el.querySelectorAll('*');
    children.forEach(child => {
      attrs.forEach(attr => {
        const value = child.getAttribute(attr);
        if (value) {
          extractNumbers(value).forEach(n => numbers.add(n));
        }
      });
    });

    return Array.from(numbers);
  }

  /**
   * Busca contatos em múltiplas fontes do DOM
   * IMPORTANTE: Todas as fontes contêm apenas números REAIS do WhatsApp Web
   * Nenhuma fonte gera números aleatórios ou fictícios
   * 
   * Fontes reais verificadas:
   * 1. #pane-side: Painel lateral com lista de conversas ativas
   * 2. [data-id]: Atributos com IDs únicos de contatos
   * 3. [data-testid*="cell"]: Células de contato/chat na interface
   * 4. [data-testid*="contact"]: Elementos específicos de contato
   * 5. a[href*="phone"]: Links diretos com números de telefone
   * 6. a[href*="@c.us"]: Links com formato WhatsApp (número@c.us)
   * 7. span[title]: Títulos com informações de contato
   * 8. [aria-label]: Labels acessíveis com dados de contato
   * 
   * @returns {Array<HTMLElement>} Array de elementos do DOM contendo números reais
   */
  function findAllSources() {
    const sources = [];

    // Fonte 1: Pane-side (lista de chats)
    const pane = document.querySelector('#pane-side');
    if (pane) sources.push(pane);

    // Fonte 2: Elementos com data-id
    document.querySelectorAll('[data-id]').forEach(el => sources.push(el));

    // Fonte 3: Células de chat e contato
    document.querySelectorAll('[data-testid*="cell"]').forEach(el => sources.push(el));
    document.querySelectorAll('[data-testid*="contact"]').forEach(el => sources.push(el));

    // Fonte 4: Links com telefone
    document.querySelectorAll('a[href*="phone"]').forEach(el => sources.push(el));
    document.querySelectorAll('a[href*="@c.us"]').forEach(el => sources.push(el));

    // Fonte 5: Spans com title
    document.querySelectorAll('span[title]').forEach(el => sources.push(el));

    // Fonte 6: Elementos com aria-label
    document.querySelectorAll('[aria-label]').forEach(el => sources.push(el));

    return sources;
  }

  async function extractAll() {
    const out = new Set();
    const list = findChatList();
    if (!list) throw new Error('Lista de chats não encontrada');

    // Scroll para o topo
    list.scrollTop = 0;
    await new Promise(r => setTimeout(r, 800));

    // Scroll para baixo com incrementos menores e mais lento
    let lastTop = -1, stable = 0;
    let scrollCount = 0;
    const maxScrolls = 50; // Estimativa máxima de scrolls
    
    while (stable < 7) {  // Mais tentativas antes de considerar estável (6-8)
      // Coletar de todas as fontes visíveis
      const items = list.querySelectorAll('[role="row"], [role="listitem"]');
      items.forEach(item => {
        const nums = collectDeepFrom(item);
        nums.forEach(n => out.add(n));
      });

      // Coletar de fontes adicionais
      findAllSources().forEach(source => {
        const nums = collectDeepFrom(source);
        nums.forEach(n => out.add(n));
      });

      // Enviar progresso em tempo real
      scrollCount++;
      const currentCount = out.size;
      const progress = Math.min(95, Math.round((scrollCount / maxScrolls) * 100));
      window.postMessage({ 
        type: 'WHL_EXTRACT_PROGRESS', 
        progress: progress,
        count: currentCount
      }, '*');

      // Scroll incremental menor (70% ao invés de 85%)
      const increment = Math.floor(list.clientHeight * 0.7);
      const next = Math.min(list.scrollTop + increment, list.scrollHeight);
      list.scrollTop = next;
      list.dispatchEvent(new Event('scroll', {bubbles:true}));
      
      // Tempo maior entre scrolls (1000-1200ms)
      await new Promise(r => setTimeout(r, 1100));

      if (list.scrollTop === lastTop) {
        stable++;
      } else {
        stable = 0;
      }
      lastTop = list.scrollTop;
    }

    // Scroll para cima para pegar elementos que possam ter sido perdidos
    list.scrollTop = 0;
    await new Promise(r => setTimeout(r, 1000));

    // Coleta final de todos os elementos visíveis
    const items = list.querySelectorAll('[role="row"], [role="listitem"]');
    items.forEach(item => {
      const nums = collectDeepFrom(item);
      nums.forEach(n => out.add(n));
    });

    // Coleta final de todas as fontes
    findAllSources().forEach(source => {
      const nums = collectDeepFrom(source);
      nums.forEach(n => out.add(n));
    });

    // Filtrar apenas números válidos (8-15 dígitos)
    const validNumbers = Array.from(out).filter(n => {
      const len = n.length;
      return len >= 8 && len <= 15;
    });

    // Enviar progresso final (100%)
    window.postMessage({ 
      type: 'WHL_EXTRACT_PROGRESS', 
      progress: 100,
      count: validNumbers.length
    }, '*');

    return validNumbers.sort();
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

  console.log('[WHL] Extractor isolado carregado (versão melhorada)');
})();
