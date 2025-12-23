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
            message.type = 'chat';
            message.body = `✏️ Esta mensagem foi editada para: ${message?.body || message?.caption}`;
            
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
        };
        
        console.log('[WHL Hooks] Modules initialized:', {
            PROCESS_EDIT_MESSAGE: !!MODULES.PROCESS_EDIT_MESSAGE,
            PROCESS_RENDERABLE_MESSAGES: !!MODULES.PROCESS_RENDERABLE_MESSAGES,
            QUERY_GROUP: !!MODULES.QUERY_GROUP
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
                if (require('WAWebMessageProcessRenderable')) {
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
};

// Executar apenas uma vez
if (!window.whl_hooks_loaded) {
    window.whl_hooks_loaded = true;
    console.log('[WHL Hooks] Initializing WPP Hooks...');
    window.whl_hooks_main();
}
