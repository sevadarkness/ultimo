/**
 * WhatsHybrid Lite - WPP Hooks (WPP Boladão tested approach)
 * Uses require() to load internal WhatsApp modules via webpack
 * Does NOT use window.Store directly (CSP blocking)
 */

window.whl_hooks_main = () => {
    class Hook {
        constructor() { 
            this.is_registered = false; 
        }
        register() { 
            this.is_registered = true; 
        }
        unregister() { 
            this.is_registered = false; 
        }
    }

    const WA_MODULES = {
        PROCESS_EDIT_MESSAGE: 'WAWebDBProcessEditProtocolMsgs',
        PROCESS_RENDERABLE_MESSAGES: 'WAWebMessageProcessRenderable',
        MESSAGES_RENDERER: 'WAWebMessageMeta.react',
        PROTOBUF_HOOK: ['decodeProtobuf', 'WAWebProtobufdecode', 'WAWebProtobufUtils'],
        SEND_MESSAGE: 'WAWebSendMsgRecordAction',
        QUERY_GROUP: 'WAWebGroupMsgSendUtils',
        CHAT_STORE: 'WAWebChatCollection',
        CONTACT_STORE: 'WAWebContactCollection',
        GROUP_METADATA: 'WAWebGroupMetadata',
    };

    let MODULES = {};

    function tryRequireModule(moduleNames) {
        if (Array.isArray(moduleNames)) {
            for (const moduleName of moduleNames) {
                try {
                    const module = require(moduleName);
                    if (module) return module;
                } catch (e) {
                    // Module not found, try next
                }
            }
            return null;
        } else {
            try {
                return require(moduleNames);
            } catch (e) {
                return null;
            }
        }
    }

    // ===== HOOK PARA MENSAGENS APAGADAS =====
    class RenderableMessageHook extends Hook {
        register() {
            if (this.is_registered) return;
            super.register();
            
            if (!MODULES.PROCESS_RENDERABLE_MESSAGES) {
                console.warn('[WHL Hooks] PROCESS_RENDERABLE_MESSAGES module not available');
                return;
            }
            
            this.original_function = MODULES.PROCESS_RENDERABLE_MESSAGES.processRenderableMessages;
            
            MODULES.PROCESS_RENDERABLE_MESSAGES.processRenderableMessages = function (...args) {
                args[0] = args[0].filter((message) => !RenderableMessageHook.handle_message(message));
                return RenderableMessageHook.originalProcess(...args);
            };
            
            RenderableMessageHook.originalProcess = this.original_function;
            console.log('[WHL Hooks] RenderableMessageHook registered');
        }
        
        static handle_message(message) {
            return RenderableMessageHook.revoke_handler(message);
        }
        
        static revoke_handler(message) {
            const REVOKE_SUBTYPES = ['sender_revoke', 'admin_revoke'];
            if (!REVOKE_SUBTYPES.includes(message?.subtype)) return false;
            
            // Check if protocolMessageKey exists before accessing
            if (!message.protocolMessageKey) {
                console.warn('[WHL Hooks] protocolMessageKey not found in revoked message');
                return false;
            }
            
            // Transformar mensagem apagada em mensagem visível
            message.type = 'chat';
            message.body = '🚫 Esta mensagem foi excluída!';
            message.quotedStanzaID = message.protocolMessageKey.id;
            message.quotedParticipant = message.protocolMessageKey?.participant || message.from;
            message.quotedMsg = { type: 'chat' };
            delete message.protocolMessageKey;
            delete message.subtype;
            
            return false; // Não filtrar, manter a mensagem
        }
    }

    // ===== HOOK PARA MENSAGENS EDITADAS =====
    class EditMessageHook extends Hook {
        register() {
            if (this.is_registered) return;
            super.register();
            
            if (!MODULES.PROCESS_EDIT_MESSAGE) {
                console.warn('[WHL Hooks] PROCESS_EDIT_MESSAGE module not available');
                return;
            }
            
            this.original_function = MODULES.PROCESS_EDIT_MESSAGE.processEditProtocolMsgs;
            
            MODULES.PROCESS_EDIT_MESSAGE.processEditProtocolMsgs = function (...args) {
                args[0] = args[0].filter((message) => {
                    return !EditMessageHook.handle_edited_message(message, ...args);
                });
                return EditMessageHook.originalEdit(...args);
            };
            
            MODULES.PROCESS_EDIT_MESSAGE.processEditProtocolMsg = MODULES.PROCESS_EDIT_MESSAGE.processEditProtocolMsgs;
            EditMessageHook.originalEdit = this.original_function;
            console.log('[WHL Hooks] EditMessageHook registered');
        }
        
        static handle_edited_message(message, arg1, arg2) {
            // Extract message content - body for text, caption for media
            const messageContent = message?.body || message?.caption || '[sem conteúdo]';
            message.type = 'chat';
            message.body = `✏️ Esta mensagem foi editada para: ${messageContent}`;
            
            if (!message.protocolMessageKey) return true;
            
            message.quotedStanzaID = message.protocolMessageKey.id;
            message.quotedParticipant = message.protocolMessageKey?.participant || message.from;
            message.quotedMsg = { type: 'chat' };
            delete message.latestEditMsgKey;
            delete message.protocolMessageKey;
            delete message.subtype;
            delete message.editMsgType;
            delete message.latestEditSenderTimestampMs;
            
            // Processar mensagem editada como nova mensagem
            if (MODULES.PROCESS_RENDERABLE_MESSAGES) {
                MODULES.PROCESS_RENDERABLE_MESSAGES.processRenderableMessages(
                    [message],
                    { 
                        author: message.from, 
                        type: 'chat', 
                        externalId: message.id.id, 
                        edit: -1, 
                        isHsm: false, 
                        chat: message.id.remote 
                    },
                    null,
                    { verifiedLevel: 'unknown' },
                    null,
                    0,
                    arg2 === undefined ? arg1 : arg2
                );
            }
            
            return true; // Filtrar a mensagem original de edição
        }
    }

    const hooks = {
        keep_revoked_messages: new RenderableMessageHook(),
        keep_edited_messages: new EditMessageHook(),
    };

    const initialize_modules = () => {
        MODULES = {
            PROCESS_EDIT_MESSAGE: tryRequireModule(WA_MODULES.PROCESS_EDIT_MESSAGE),
            PROCESS_RENDERABLE_MESSAGES: tryRequireModule(WA_MODULES.PROCESS_RENDERABLE_MESSAGES),
            QUERY_GROUP: tryRequireModule(WA_MODULES.QUERY_GROUP),
            CHAT_STORE: tryRequireModule(WA_MODULES.CHAT_STORE),
            CONTACT_STORE: tryRequireModule(WA_MODULES.CONTACT_STORE),
            GROUP_METADATA: tryRequireModule(WA_MODULES.GROUP_METADATA),
        };
        
        console.log('[WHL Hooks] Modules initialized:', {
            PROCESS_EDIT_MESSAGE: !!MODULES.PROCESS_EDIT_MESSAGE,
            PROCESS_RENDERABLE_MESSAGES: !!MODULES.PROCESS_RENDERABLE_MESSAGES,
            QUERY_GROUP: !!MODULES.QUERY_GROUP,
            CHAT_STORE: !!MODULES.CHAT_STORE,
            CONTACT_STORE: !!MODULES.CONTACT_STORE,
            GROUP_METADATA: !!MODULES.GROUP_METADATA
        });
    };

    const start = () => {
        initialize_modules();
        
        for (const [name, hook] of Object.entries(hooks)) {
            try {
                hook.register();
            } catch (e) {
                console.error(`[WHL Hooks] Error registering ${name}:`, e);
            }
        }
        
        console.log('[WHL Hooks] ✅ Hooks registrados com sucesso!');
    };

    // Aguardar módulos carregarem
    const load_and_start = async () => {
        let attempts = 0;
        const maxAttempts = 50;
        
        while (attempts < maxAttempts) {
            try {
                // Testar se módulos do WhatsApp estão disponíveis
                // Use constant for consistency
                if (require(WA_MODULES.PROCESS_RENDERABLE_MESSAGES)) {
                    console.log('[WHL Hooks] WhatsApp modules detected, starting...');
                    start();
                    return;
                }
            } catch (e) {
                // Módulo ainda não disponível
            }
            
            attempts++;
            await new Promise(r => setTimeout(r, 100));
        }
        
        console.warn('[WHL Hooks] ⚠️ Módulos não encontrados após', maxAttempts, 'tentativas, iniciando mesmo assim...');
        start();
    };

    // Iniciar após delay para garantir que WhatsApp Web carregou
    setTimeout(load_and_start, 1000);
    
    // ===== MESSAGE LISTENERS PARA GRUPOS =====
    window.addEventListener('message', async (event) => {
        if (!event.data || !event.data.type) return;
        
        const { type } = event.data;
        
        // Helper function to check if a chat is a group
        const isGroupChat = (chat) => {
            return chat.id?._serialized?.endsWith('@g.us') || chat.isGroup;
        };
        
        // CARREGAR GRUPOS
        if (type === 'WHL_LOAD_GROUPS') {
            const groups = [];
            
            try {
                // Tentar via CHAT_STORE
                if (MODULES.CHAT_STORE?.models || MODULES.CHAT_STORE?.getModelsArray) {
                    const chats = MODULES.CHAT_STORE.getModelsArray?.() || MODULES.CHAT_STORE.models || [];
                    
                    chats.forEach(chat => {
                        if (isGroupChat(chat)) {
                            groups.push({
                                id: chat.id._serialized,
                                name: chat.formattedTitle || chat.name || chat.contact?.name || 'Grupo sem nome',
                                participantsCount: chat.groupMetadata?.participants?.length || 0
                            });
                        }
                    });
                }
                
                console.log('[WHL Hooks] Groups loaded:', groups.length);
                window.postMessage({ type: 'WHL_GROUPS_RESULT', groups }, '*');
            } catch(e) {
                console.error('[WHL Hooks] Error loading groups:', e);
                window.postMessage({ type: 'WHL_GROUPS_ERROR', error: e.message }, '*');
            }
        }
        
        // EXTRAIR MEMBROS DO GRUPO
        if (type === 'WHL_EXTRACT_GROUP_MEMBERS') {
            const { groupId } = event.data;
            const members = [];
            
            try {
                if (MODULES.CHAT_STORE?.models || MODULES.CHAT_STORE?.getModelsArray) {
                    const chats = MODULES.CHAT_STORE.getModelsArray?.() || MODULES.CHAT_STORE.models || [];
                    const chat = chats.find(c => c.id?._serialized === groupId);
                    
                    if (chat?.groupMetadata?.participants) {
                        chat.groupMetadata.participants.forEach(p => {
                            if (p.id?._serialized?.endsWith('@c.us')) {
                                members.push(p.id._serialized.replace('@c.us', ''));
                            }
                        });
                    }
                }
                
                console.log('[WHL Hooks] Group members extracted:', members.length);
                window.postMessage({ type: 'WHL_GROUP_MEMBERS_RESULT', members: [...new Set(members)] }, '*');
            } catch(e) {
                console.error('[WHL Hooks] Error extracting group members:', e);
                window.postMessage({ type: 'WHL_GROUP_MEMBERS_ERROR', error: e.message }, '*');
            }
        }
        
        // RECOVER MESSAGES - Since hooks are automatic, just acknowledge
        if (type === 'WHL_RECOVER_ENABLE') {
            console.log('[WHL Hooks] Recover is always enabled with hooks approach');
        }
        
        if (type === 'WHL_RECOVER_DISABLE') {
            console.log('[WHL Hooks] Note: Recover hooks cannot be disabled once loaded');
        }
    });
};

// Executar apenas uma vez
if (!window.whl_hooks_loaded) {
    window.whl_hooks_loaded = true;
    console.log('[WHL Hooks] Initializing WPP Hooks...');
    window.whl_hooks_main();
}
