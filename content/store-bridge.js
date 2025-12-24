/**
 * WhatsHybrid Lite - Store Bridge
 * 
 * Cria uma ponte segura para acessar o WhatsApp Store interno
 * sem violar CSP (Content Security Policy)
 * 
 * Este arquivo é injetado no contexto da página e expõe APIs do WhatsApp
 * de forma controlada através de window.WHL_Store
 */

(function() {
  'use strict';
  
  if (window.__WHL_STORE_BRIDGE_LOADED__) return;
  window.__WHL_STORE_BRIDGE_LOADED__ = true;

  console.log('[WHL Store Bridge] Inicializando...');

  // Helper para acessar módulos webpack do WhatsApp
  function safeRequire(name) {
    try {
      if (typeof require === 'function') {
        return require(name);
      }
    } catch (e) {
      console.warn('[WHL Store Bridge] Erro ao carregar módulo:', name, e.message);
    }
    return null;
  }

  // Inicializa o Store Bridge
  function initStoreBridge() {
    try {
      // Tentar carregar módulos principais do WhatsApp
      const ChatMod = safeRequire('WAWebChatCollection');
      const ContactMod = safeRequire('WAWebContactCollection');
      const MsgMod = safeRequire('WAWebSendMsgChatAction');
      const PresenceMod = safeRequire('WAWebPresenceUtils');
      
      // Criar objeto WHL_Store com APIs expostas
      window.WHL_Store = {
        Chat: null,
        Contact: null,
        Msg: null,
        Presence: null,
        
        // Collections
        ChatCollection: null,
        ContactCollection: null,
        
        // Status
        ready: false,
        
        // Métodos auxiliares
        getChat: function(id) {
          if (!this.ChatCollection) return null;
          return this.ChatCollection.get(id);
        },
        
        getContact: function(id) {
          if (!this.ContactCollection) return null;
          return this.ContactCollection.get(id);
        },
        
        getAllChats: function() {
          if (!this.ChatCollection) return [];
          return this.ChatCollection.getModelsArray?.() || [];
        },
        
        getAllContacts: function() {
          if (!this.ContactCollection) return [];
          return this.ContactCollection.getModelsArray?.() || [];
        }
      };

      // Preencher módulos se disponíveis
      if (ChatMod) {
        window.WHL_Store.Chat = ChatMod;
        window.WHL_Store.ChatCollection = ChatMod.ChatCollection || ChatMod.default?.ChatCollection;
      }
      
      if (ContactMod) {
        window.WHL_Store.Contact = ContactMod;
        window.WHL_Store.ContactCollection = ContactMod.ContactCollection || ContactMod.default?.ContactCollection;
      }
      
      if (MsgMod) {
        window.WHL_Store.Msg = MsgMod;
      }
      
      if (PresenceMod) {
        window.WHL_Store.Presence = PresenceMod;
      }

      // Marcar como pronto se conseguiu carregar pelo menos Chat ou Contact
      if (window.WHL_Store.ChatCollection || window.WHL_Store.ContactCollection) {
        window.WHL_Store.ready = true;
        console.log('[WHL Store Bridge] ✅ Store pronto');
        
        // Disparar evento de prontidão
        window.dispatchEvent(new CustomEvent('WHL_STORE_READY', {
          detail: { ready: true }
        }));
      } else {
        console.warn('[WHL Store Bridge] ⚠️ Nenhum módulo carregado, Store não disponível');
      }

    } catch (e) {
      console.error('[WHL Store Bridge] Erro ao inicializar:', e);
      
      // Criar objeto vazio para evitar erros
      window.WHL_Store = {
        ready: false,
        error: e.message
      };
    }
  }

  // Aguardar um pouco para garantir que webpack está pronto
  function waitAndInit(maxAttempts = 10, delay = 500) {
    let attempts = 0;
    
    const tryInit = () => {
      attempts++;
      
      // Verificar se require está disponível
      if (typeof require === 'function') {
        console.log('[WHL Store Bridge] Webpack detectado, inicializando...');
        initStoreBridge();
        return;
      }
      
      // Tentar novamente se não excedeu tentativas
      if (attempts < maxAttempts) {
        setTimeout(tryInit, delay);
      } else {
        console.warn('[WHL Store Bridge] ⚠️ Timeout ao aguardar webpack');
        // Criar store vazio
        window.WHL_Store = { ready: false, error: 'Webpack não disponível' };
      }
    };
    
    tryInit();
  }

  // Iniciar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitAndInit());
  } else {
    waitAndInit();
  }

})();
