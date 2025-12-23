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

  // NOVA FUNÇÃO: Buscar número real do contato pelo ID
  async function getPhoneFromContact(participantId) {
    try {
      const ContactMod = safeRequire('WAWebContactCollection');
      if (!ContactMod) return null;
      
      const ContactCollection = ContactMod.ContactCollection || ContactMod.default?.ContactCollection;
      if (!ContactCollection) return null;
      
      // Tentar buscar contato
      const contact = ContactCollection.get(participantId);
      if (contact) {
        // Verificar múltiplos campos onde o número pode estar
        const possibleNumbers = [
          contact.id?.user,
          contact.id?._serialized?.replace('@c.us', '').replace('@s.whatsapp.net', ''),
          contact.phoneNumber,
          contact.formattedNumber,
          contact.verifiedName,
          contact.pushname
        ];
        
        for (const num of possibleNumbers) {
          if (num && /^\d{10,15}$/.test(String(num).replace(/\D/g, ''))) {
            return String(num).replace(/\D/g, '');
          }
        }
      }
      
      return null;
    } catch (e) {
      return null;
    }
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

    console.log('[WHL] Total participantes encontrados:', participants.length);

    // CORREÇÃO CRÍTICA BUG 2: Extrair número de telefone CORRETAMENTE com 5 métodos
    const members = [];
    
    for (const p of participants) {
      const id = p.id;
      if (!id) continue;

      let numero = null;

      // MÉTODO 1: Se _serialized contém número válido
      if (id._serialized) {
        const serialized = id._serialized;
        const extracted = serialized.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '');
        if (/^\d{10,15}$/.test(extracted)) {
          numero = extracted;
        }
      }

      // MÉTODO 2: Se user é número válido
      if (!numero && id.user && /^\d{10,15}$/.test(String(id.user))) {
        numero = String(id.user);
      }

      // MÉTODO 3: Buscar no ContactCollection
      if (!numero) {
        const contactPhone = await getPhoneFromContact(id._serialized || id);
        if (contactPhone) {
          numero = contactPhone;
        }
      }

      // MÉTODO 4: Se server é c.us, o user deve ser o número
      if (!numero && id.server === 'c.us' && id.user) {
        const cleanUser = String(id.user).replace(/\D/g, '');
        if (/^\d{10,15}$/.test(cleanUser)) {
          numero = cleanUser;
        }
      }

      // MÉTODO 5: Para LID, tentar buscar número real via phoneNumber do participante
      if (!numero && p.phoneNumber) {
        const cleanPhone = String(p.phoneNumber).replace(/\D/g, '');
        if (/^\d{10,15}$/.test(cleanPhone)) {
          numero = cleanPhone;
        }
      }

      // Log para debug
      if (!numero) {
        console.log('[WHL] ⚠️ Não conseguiu extrair número para:', JSON.stringify(id));
      }

      if (numero) {
        members.push(numero);
      }
    }

    const uniqueMembers = [...new Set(members)];

    console.log('[WHL] Membros com telefone real:', uniqueMembers.length, 'de', participants.length);

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
