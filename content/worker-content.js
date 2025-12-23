/**
 * WhatsHybrid Lite - Worker Content Script (Hybrid Architecture)
 * 
 * CORE HEADLESS - grupos + contatos (c.us + lid)
 * This provides the __WA_WORKER_CORE__ API for correct group member extraction
 * Also handles worker tab functionality for message sending
 */

(() => {
  'use strict';

  if (window.__WA_WORKER_CORE_LOADED__) return;
  window.__WA_WORKER_CORE_LOADED__ = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function safeRequire(name) {
    try {
      if (typeof require === 'function') {
        return require(name);
      }
    } catch {}
    return null;
  }

  function resolveChatCollection() {
    try {
      const ChatMod = safeRequire('WAWebChatCollection');
      if (!ChatMod) return null;
      return ChatMod.ChatCollection || ChatMod.default?.ChatCollection || null;
    } catch {
      return null;
    }
  }

  async function waitForChatCollection() {
    for (let i = 0; i < 40; i++) {
      const CC = resolveChatCollection();
      if (CC) return CC;
      await sleep(300);
    }
    return null;
  }

  // LISTAR GRUPOS
  async function getGroups() {
    const ChatCollection = await waitForChatCollection();
    if (!ChatCollection) {
      throw new Error('ChatCollection indisponível');
    }

    const chats = ChatCollection.getModelsArray();

    return chats
      .filter(c => c?.isGroup)
      .map(c => ({
        id: c.id?._serialized,
        name: c.name || c.formattedTitle || 'Grupo sem nome',
        members:
          c.groupMetadata?.participants?.size ||
          c.groupMetadata?.participants?.length ||
          0
      }));
  }

  // EXTRAIR CONTATOS DE UM GRUPO - CORREÇÃO DO BUG 3
  async function extractContacts(groupId) {
    const ChatCollection = await waitForChatCollection();
    if (!ChatCollection) {
      return { success: false, error: 'ChatCollection indisponível', members: [], count: 0 };
    }

    const chat = ChatCollection.get(groupId);
    if (!chat || !chat.isGroup) {
      return { success: false, error: 'Grupo inválido ou não encontrado', members: [], count: 0 };
    }

    const meta = chat.groupMetadata;
    if (!meta) {
      return { success: false, error: 'Metadata indisponível', members: [], count: 0 };
    }

    // IMPORTANTE: Carregar participantes
    if (typeof meta.loadParticipants === 'function') {
      await meta.loadParticipants();
    }

    // Obter participantes em múltiplos formatos
    let participants = [];
    if (meta.participants?.toArray) {
      participants = meta.participants.toArray();
    } else if (Array.isArray(meta.participants)) {
      participants = meta.participants;
    } else if (meta.participants?.size) {
      participants = [...meta.participants.values()];
    }

    // CORREÇÃO CRÍTICA: Extrair número de telefone CORRETAMENTE
    const members = participants.map(p => {
      const id = p.id;
      if (!id) return null;

      // MÉTODO 1: Usar _serialized e extrair número
      if (id._serialized) {
        const serialized = id._serialized;
        // Formato: "5511999998888@c.us" ou "5511999998888@s.whatsapp.net"
        const numero = serialized.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '');
        if (/^\d{10,15}$/.test(numero)) {
          return numero;
        }
      }

      // MÉTODO 2: Usar user diretamente se for número válido
      if (id.user && /^\d{10,15}$/.test(id.user)) {
        return id.user;
      }

      // MÉTODO 3: Para servidores c.us e lid
      if ((id.server === 'c.us' || id.server === 'lid') && id.user) {
        const numero = String(id.user);
        if (/^\d{10,15}$/.test(numero)) {
          return numero;
        }
      }

      return null;
    }).filter(Boolean);

    const uniqueMembers = [...new Set(members)];

    console.log('[WHL Worker] Membros extraídos:', uniqueMembers.length, 'de', participants.length);

    return {
      success: true,
      members: uniqueMembers,
      count: uniqueMembers.length,
      groupName: chat.name || chat.formattedTitle || 'Grupo'
    };
  }

  // EXPORTAR GLOBALMENTE
  window.__WA_WORKER_CORE__ = {
    getGroups,
    extractContacts
  };

  console.log('[WHL Worker] Core inicializado com sucesso!');

  // ===== WORKER TAB FUNCTIONALITY (Legacy) =====
  
  // Check if this is the worker tab
  const urlParams = new URLSearchParams(window.location.search);
  const isWorkerTab = urlParams.has('whl_worker') || 
                      window.location.href.includes('whl_worker=true');
  
  if (!isWorkerTab) {
      // Check via storage if this tab is the worker
      chrome.runtime.sendMessage({ action: 'CHECK_IF_WORKER' }, (response) => {
          if (!response?.isWorker) return;
          // If this is worker, continue with initialization (handled below)
      });
  }

})();
