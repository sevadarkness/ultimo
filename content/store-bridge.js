// store-bridge.js - Roda no contexto da página (não da extensão)
// Este script tem acesso ao window.Store do WhatsApp Web
(function() {
  'use strict';
  
  console.log('[WHL Store Bridge] Inicializando...');
  
  // Aguardar WhatsApp carregar
  function waitForStore(callback, maxAttempts = 100) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      
      // Tentar encontrar o Store via webpack
      if (window.webpackChunkwhatsapp_web_client) {
        try {
          window.webpackChunkwhatsapp_web_client.push([
            ['whl-store-bridge'],
            {},
            function(e) {
              const modules = [];
              for (let key in e.m) {
                try {
                  modules.push(e(key));
                } catch(err) {}
              }
              
              window.WHL_Store = {};
              
              // Encontrar módulos necessários
              const findModule = (filter) => modules.find(m => m && filter(m));
              
              window.WHL_Store.Chat = findModule(m => m.default?.Chat)?.default?.Chat ||
                                      findModule(m => m.ChatCollection)?.ChatCollection;
              
              window.WHL_Store.Contact = findModule(m => m.default?.Contact)?.default?.Contact ||
                                         findModule(m => m.ContactCollection)?.ContactCollection;
              
              window.WHL_Store.GroupMetadata = findModule(m => m.default?.GroupMetadata)?.default?.GroupMetadata;
              
              window.WHL_Store.Blocklist = findModule(m => m.default?.Blocklist)?.default?.Blocklist ||
                                           findModule(m => m.BlocklistCollection)?.BlocklistCollection;
              
              window.WHL_Store.Msg = findModule(m => m.default?.Msg)?.default?.Msg ||
                                    findModule(m => m.MsgCollection)?.MsgCollection;
              
              // Sinalizar que Store está pronto
              window.dispatchEvent(new CustomEvent('WHL_STORE_READY', { 
                detail: { 
                  hasChat: !!window.WHL_Store.Chat,
                  hasContact: !!window.WHL_Store.Contact,
                  hasBlocklist: !!window.WHL_Store.Blocklist,
                  hasGroupMetadata: !!window.WHL_Store.GroupMetadata,
                  hasMsg: !!window.WHL_Store.Msg
                }
              }));
            }
          ]);
          
          clearInterval(interval);
          if (callback) callback(true);
        } catch(e) {
          console.error('[WHL Store Bridge] Erro:', e);
        }
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('[WHL Store Bridge] Store não encontrado após', maxAttempts, 'tentativas');
        if (callback) callback(false);
      }
    }, 500);
  }
  
  // Listener para comandos da extensão
  window.addEventListener('message', async (event) => {
    if (!event.data || !event.data.type) return;
    
    const { type } = event.data;
    
    // EXTRAIR CONTATOS
    if (type === 'WHL_EXTRACT_CONTACTS') {
      const result = { normal: [], archived: [], blocked: [] };
      
      try {
        // Contatos normais via Store
        if (window.WHL_Store?.Chat?.models) {
          window.WHL_Store.Chat.models.forEach(chat => {
            if (chat.id?._serialized?.endsWith('@c.us')) {
              const phone = chat.id._serialized.replace('@c.us', '');
              if (chat.archive) {
                result.archived.push(phone);
              } else {
                result.normal.push(phone);
              }
            }
          });
        }
        
        // Bloqueados via Store
        if (window.WHL_Store?.Blocklist?.models) {
          window.WHL_Store.Blocklist.models.forEach(blocked => {
            if (blocked.id?._serialized?.endsWith('@c.us')) {
              result.blocked.push(blocked.id._serialized.replace('@c.us', ''));
            }
          });
        }
        
        // Fallback DOM se Store vazio
        if (result.normal.length === 0) {
          const chatElements = document.querySelectorAll('[data-id]');
          chatElements.forEach(el => {
            const dataId = el.getAttribute('data-id');
            if (dataId && dataId.includes('@c.us')) {
              const phone = dataId.split('@')[0].replace(/\D/g, '');
              if (phone.length >= 8) {
                result.normal.push(phone);
              }
            }
          });
        }
        
        window.postMessage({ 
          type: 'WHL_EXTRACT_RESULT', 
          normal: [...new Set(result.normal)],
          archived: [...new Set(result.archived)],
          blocked: [...new Set(result.blocked)]
        }, '*');
        
      } catch(e) {
        window.postMessage({ type: 'WHL_EXTRACT_ERROR', error: e.message }, '*');
      }
    }
    
    // CARREGAR GRUPOS
    if (type === 'WHL_LOAD_GROUPS') {
      const groups = [];
      
      try {
        if (window.WHL_Store?.Chat?.models) {
          window.WHL_Store.Chat.models.forEach(chat => {
            if (chat.id?._serialized?.endsWith('@g.us') || chat.isGroup) {
              groups.push({
                id: chat.id._serialized,
                name: chat.formattedTitle || chat.name || chat.contact?.name || 'Grupo sem nome',
                participantsCount: chat.groupMetadata?.participants?.length || 0
              });
            }
          });
        }
        
        window.postMessage({ type: 'WHL_GROUPS_RESULT', groups }, '*');
      } catch(e) {
        window.postMessage({ type: 'WHL_GROUPS_ERROR', error: e.message }, '*');
      }
    }
    
    // EXTRAIR MEMBROS DO GRUPO
    if (type === 'WHL_EXTRACT_GROUP_MEMBERS') {
      const { groupId } = event.data;
      const members = [];
      
      try {
        if (window.WHL_Store?.Chat?.models) {
          const chat = window.WHL_Store.Chat.models.find(c => c.id?._serialized === groupId);
          if (chat?.groupMetadata?.participants) {
            chat.groupMetadata.participants.forEach(p => {
              if (p.id?._serialized?.endsWith('@c.us')) {
                members.push(p.id._serialized.replace('@c.us', ''));
              }
            });
          }
        }
        
        window.postMessage({ type: 'WHL_GROUP_MEMBERS_RESULT', members: [...new Set(members)] }, '*');
      } catch(e) {
        window.postMessage({ type: 'WHL_GROUP_MEMBERS_ERROR', error: e.message }, '*');
      }
    }
  });
  
  // ANTI-REVOKE (Recover)
  function setupAntiRevoke() {
    if (!window.WHL_Store?.Msg) return;
    
    // Interceptar mensagens revogadas
    const originalRevoke = window.WHL_Store.Msg.prototype?.revoke;
    if (originalRevoke) {
      window.WHL_Store.Msg.prototype.revoke = function(...args) {
        // Salvar mensagem antes de revogar
        const msgData = {
          id: this.id?._serialized,
          body: this.body,
          from: this.from?._serialized,
          timestamp: this.t,
          type: this.type,
          revokedAt: Date.now()
        };
        
        window.postMessage({ type: 'WHL_MSG_REVOKED', message: msgData }, '*');
        
        // Chamar função original
        return originalRevoke.apply(this, args);
      };
    }
  }
  
  // Inicializar
  waitForStore((success) => {
    if (success) {
      console.log('[WHL Store Bridge] Store carregado com sucesso');
      setupAntiRevoke();
    }
  });
  
})();
