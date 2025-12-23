/**
 * WhatsHybrid Lite - WPP Hooks (WPP Boladão tested approach)
 * Uses require() to load internal WhatsApp modules via webpack
 * Does NOT use window.Store directly (CSP blocking)
 */

window.whl_hooks_main = () => {
    // ===== Robust Webpack require bootstrap =====
    function getWpRequire() {
        if (window.webpackChunkwhatsapp_web_client) {
            return window.webpackChunkwhatsapp_web_client.push([
                ['__whl'], {}, (req) => req
            ]);
        }
        if (window.webpackJsonp) {
            let __req;
            window.webpackJsonp.push([['__whl'], { '__whl': (m, e, r) => { __req = r; } }, ['__whl']]);
            return __req;
        }
        return null;
    }

    function findModule(filterFn) {
        const wp = getWpRequire();
        if (!wp || !wp.c) return null;
        for (const id of Object.keys(wp.c)) {
            const m = wp.c[id]?.exports;
            if (!m) continue;
            if (filterFn(m)) return m;
            if (m.default && filterFn(m.default)) return m.default;
        }
        return null;
    }

    // ===== ACESSO AOS MÓDULOS VIA REQUIRE (LAZY LOADING) =====
    // Chamado DENTRO de cada função para garantir que módulos já existem
    function getModules() {
        try {
            const ChatCollection = require('WAWebChatCollection');
            const ContactCollection = require('WAWebContactCollection');
            const BlocklistCollection = require('WAWebBlocklistCollection');
            
            return {
                ChatCollection: ChatCollection?.ChatCollection || null,
                ContactCollection: ContactCollection?.ContactCollection || null,
                BlocklistCollection: BlocklistCollection?.BlocklistCollection || null
            };
        } catch (e) {
            console.warn('[WHL Hooks] Módulos não disponíveis ainda:', e.message);
            return null;
        }
    }

    // ===== EXTRAÇÃO DE CONTATOS =====
    function extrairContatos() {
        try {
            const modules = getModules();
            if (!modules || !modules.ChatCollection) {
                return { success: false, error: 'Módulos não disponíveis' };
            }
            
            const models = modules.ChatCollection.getModelsArray() || [];
            
            // Filtrar por server (não por _serialized que pode ter problemas)
            const contatos = models
                .filter(m => m.id.server === 'c.us')
                .map(m => {
                    if (m.id.user) return m.id.user;
                    const serialized = m.id._serialized || '';
                    return serialized.includes('@c.us') ? serialized.replace('@c.us', '') : serialized;
                })
                .filter(n => /^\d{8,15}$/.test(n));
            
            return { success: true, contacts: [...new Set(contatos)], count: contatos.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ===== EXTRAÇÃO DE GRUPOS =====
    function extrairGrupos() {
        const modules = getModules();
        if (!modules || !modules.ChatCollection) {
            console.warn('[WHL Hooks] ChatCollection não disponível');
            return { success: false, groups: [], error: 'Módulos não carregados' };
        }
        
        try {
            const models = modules.ChatCollection.getModelsArray() || [];
            const grupos = models
                .filter(m => m.id && m.id.server === 'g.us')
                .map(g => ({
                    id: g.id._serialized,
                    name: g.name || g.formattedTitle || 'Grupo sem nome',
                    participants: g.groupMetadata?.participants?.length || 0
                }));
            
            console.log('[WHL Hooks] Grupos extraídos:', grupos.length);
            return { success: true, groups: grupos, count: grupos.length };
        } catch (e) {
            console.error('[WHL Hooks] Erro ao extrair grupos:', e);
            return { success: false, groups: [], error: e.message };
        }
    }

    // ===== EXTRAÇÃO DE ARQUIVADOS =====
    function extrairArquivados() {
        const modules = getModules();
        if (!modules || !modules.ChatCollection) {
            return { success: false, archived: [], error: 'Módulos não carregados' };
        }
        
        try {
            const models = modules.ChatCollection.getModelsArray() || [];
            
            const arquivados = models
                .filter(m => m.archive === true && m.id && m.id.server === 'c.us')
                .map(m => m.id.user || (typeof m.id._serialized === 'string' ? m.id._serialized.replace('@c.us', '') : ''))
                .filter(n => /^\d{8,15}$/.test(n));
            
            console.log('[WHL Hooks] Arquivados extraídos:', arquivados.length);
            return { success: true, archived: [...new Set(arquivados)], count: arquivados.length };
        } catch (e) {
            console.error('[WHL Hooks] Erro ao extrair arquivados:', e);
            return { success: false, archived: [], error: e.message };
        }
    }

    // ===== EXTRAÇÃO DE BLOQUEADOS =====
    function extrairBloqueados() {
        const modules = getModules();
        if (!modules || !modules.BlocklistCollection) {
            return { success: false, blocked: [], error: 'BlocklistCollection não disponível' };
        }
        
        try {
            const blocklist = modules.BlocklistCollection.getModelsArray 
                ? modules.BlocklistCollection.getModelsArray() 
                : (modules.BlocklistCollection._models || []);
            
            const bloqueados = blocklist
                .map(b => {
                    if (!b || !b.id) return '';
                    return b.id.user || (typeof b.id._serialized === 'string' ? b.id._serialized.replace('@c.us', '') : '');
                })
                .filter(n => n && /^\d{8,15}$/.test(n));
            
            console.log('[WHL Hooks] Bloqueados extraídos:', bloqueados.length);
            return { success: true, blocked: [...new Set(bloqueados)], count: bloqueados.length };
        } catch (e) {
            console.error('[WHL Hooks] Erro ao extrair bloqueados:', e);
            return { success: false, blocked: [], error: e.message };
        }
    }

    // ===== EXTRAÇÃO COMPLETA =====
    function extrairTudo() {
        const contatos = extrairContatos();
        const grupos = extrairGrupos();
        const arquivados = extrairArquivados();
        const bloqueados = extrairBloqueados();
        
        return {
            success: true,
            contacts: contatos.contacts || [],
            groups: grupos.groups || [],
            archived: arquivados.archived || [],
            blocked: bloqueados.blocked || [],
            stats: {
                contacts: contatos.count || 0,
                groups: grupos.count || 0,
                archived: arquivados.count || 0,
                blocked: bloqueados.count || 0
            }
        };
    }

    // ============================================
    // FUNÇÕES DE ENVIO - TESTADAS E VALIDADAS
    // ============================================

    // Timeouts para envio de mensagens (em milissegundos)
    const TIMEOUTS = {
        IMAGE_PASTE_WAIT: 2500,    // Tempo para modal de imagem aparecer após paste
        CAPTION_INPUT_WAIT: 400,   // Tempo para campo de caption processar texto
        MESSAGE_SEND_DELAY: 1200   // Delay entre envio de texto e imagem
    };

    /**
     * Envia mensagem de TEXTO para qualquer número via API interna do WhatsApp
     * NÃO CAUSA RELOAD!
     */
    async function enviarMensagemAPI(phone, mensagem) {
        console.log('[WHL] 📨 Enviando TEXTO para', phone);
        
        try {
            var WF = require('WAWebWidFactory');
            var ChatModel = require('WAWebChatModel');
            var MsgModel = require('WAWebMsgModel');
            var MsgKey = require('WAWebMsgKey');
            var CC = require('WAWebChatCollection');
            var SMRA = require('WAWebSendMsgRecordAction');

            var wid = WF.createWid(phone + '@c.us');
            var chat = CC.ChatCollection.get(wid);
            if (!chat) { 
                chat = new ChatModel.Chat({ id: wid }); 
                CC.ChatCollection.add(chat); 
            }

            var msgId = await MsgKey.newId();
            var msg = new MsgModel.Msg({
                id: { fromMe: true, remote: wid, id: msgId, _serialized: 'true_' + wid._serialized + '_' + msgId },
                body: mensagem,
                type: 'chat',
                t: Math.floor(Date.now() / 1000),
                from: wid, to: wid, self: 'out', isNewMsg: true, local: true
            });

            var result = await SMRA.sendMsgRecord(msg);
            console.log('[WHL] ✅ TEXTO enviado:', result);
            return { success: true, result: result };
        } catch (error) {
            console.error('[WHL] ❌ Erro ao enviar TEXTO:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Encontra o campo de composição de mensagem
     */
    function acharCompose() {
        return document.querySelector('footer div[contenteditable="true"][role="textbox"]')
            || document.querySelector('[data-testid="conversation-compose-box-input"]')
            || document.querySelector('div[contenteditable="true"][role="textbox"]');
    }

    /**
     * Simula pressionar ENTER em um elemento
     */
    function pressEnter(el) {
        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }

    /**
     * Envia IMAGEM via DOM (paste + ENTER)
     * Funciona com legenda (caption)
     */
    async function enviarImagemDOM(base64Image, caption) {
        console.log('[WHL] 🖼️ Enviando IMAGEM...');
        
        try {
            var response = await fetch(base64Image);
            var blob = await response.blob();

            var input = acharCompose();
            if (!input) {
                console.error('[WHL] ❌ Campo de composição não encontrado');
                return { success: false, error: 'INPUT_NOT_FOUND' };
            }

            var dt = new DataTransfer();
            dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));

            input.focus();
            input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));

            await new Promise(r => setTimeout(r, TIMEOUTS.IMAGE_PASTE_WAIT));

            var captionInput =
                document.querySelector('[data-testid="media-caption-input-container"] [contenteditable="true"]') ||
                document.querySelector('[data-testid="media-caption-input"] [contenteditable="true"]') ||
                document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]');

            if (!captionInput) {
                // Only error if we actually need to add a caption
                if (caption) {
                    console.error('[WHL] ❌ Campo de caption não encontrado');
                    return { success: false, error: 'CAPTION_INPUT_NOT_FOUND' };
                }
                // No caption needed and no input found - try to send anyway
                console.warn('[WHL] ⚠️ Campo de caption não encontrado, mas sem caption para adicionar');
            } else {
                if (caption) {
                    captionInput.focus();
                    // Note: Using execCommand despite deprecation warning because it's the only method
                    // that reliably triggers WhatsApp Web's internal message handlers during testing
                    document.execCommand('insertText', false, caption);
                    console.log('[WHL] 📝 Caption adicionado:', caption);
                }

                await new Promise(r => setTimeout(r, TIMEOUTS.CAPTION_INPUT_WAIT));

                pressEnter(captionInput);
            }
            
            console.log('[WHL] ✅ IMAGEM enviada!');
            return { success: true };
        } catch (error) {
            console.error('[WHL] ❌ Erro ao enviar IMAGEM:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Envia TEXTO + IMAGEM combinados
     */
    async function enviarMensagemCompleta(phone, texto, base64Image, caption) {
        console.log('[WHL] 🚀 Enviando mensagem completa para', phone);
        
        var results = { texto: null, imagem: null };
        
        // Enviar texto se houver
        if (texto) {
            results.texto = await enviarMensagemAPI(phone, texto);
            await new Promise(r => setTimeout(r, TIMEOUTS.MESSAGE_SEND_DELAY));
        }
        
        // Enviar imagem se houver
        if (base64Image) {
            results.imagem = await enviarImagemDOM(base64Image, caption);
        }
        
        return results;
    }

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
        CHAT_COLLECTION: 'WAWebChatCollection',
        CONTACT_STORE: 'WAWebContactCollection',
        GROUP_METADATA: 'WAWebGroupMetadata',
        // Novos módulos para envio direto
        OPEN_CHAT: 'useWAWebSetModelValue',
        WID_FACTORY: 'WAWebWidFactory',
        // Módulos de mídia
        MEDIA_PREP: 'WAWebMediaPrep',
        MEDIA_UPLOAD: 'WAWebMediaUpload',
        MSG_MODELS: 'WAWebMsgModel',
    };

    let MODULES = {};

    // ===== RECOVER HISTORY TRACKING =====
    // Array para armazenar histórico de mensagens recuperadas
    const historicoRecover = [];
    
    /**
     * Função para salvar mensagem recuperada
     */
    function salvarMensagemRecuperada(msg) {
        const entrada = {
            id: msg.id?.id || Date.now().toString(),
            from: msg.from || msg.id?.remote || 'Desconhecido',
            body: msg.body || '[Mídia]',
            type: msg.type || 'chat',
            timestamp: Date.now(),
            originalTimestamp: msg.t ? msg.t * 1000 : Date.now()
        };
        
        historicoRecover.push(entrada);
        
        // Limitar a 100 mensagens
        if (historicoRecover.length > 100) {
            historicoRecover.shift();
        }
        
        // Salvar no localStorage
        try {
            localStorage.setItem('whl_recover_history', JSON.stringify(historicoRecover));
        } catch(e) {
            console.warn('[WHL] Erro ao salvar histórico no localStorage:', e);
        }
        
        // Notificar UI
        window.postMessage({
            type: 'WHL_RECOVER_NEW_MESSAGE',
            message: entrada,
            total: historicoRecover.length
        }, '*');
        
        console.log(`[WHL Recover] Mensagem recuperada de ${entrada.from}: ${entrada.body.substring(0, 50)}...`);
    }

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
            
            // Salvar mensagem recuperada ANTES de transformar
            salvarMensagemRecuperada(message);
            
            // Notificar via postMessage para UI
            try {
                window.postMessage({
                    type: 'WHL_RECOVERED_MESSAGE',
                    payload: {
                        chatId: message?.id?.remote || message?.from?._serialized || null,
                        from: message?.author?._serialized || message?.from?._serialized || null,
                        ts: Date.now(),
                        kind: 'revoked',
                        preview: message?.body || '🚫 Esta mensagem foi excluída!'
                    }
                }, '*');
            } catch (e) {
                console.warn('[WHL Hooks] recover postMessage failed', e);
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
            CHAT_COLLECTION: tryRequireModule(WA_MODULES.CHAT_COLLECTION),
            CONTACT_STORE: tryRequireModule(WA_MODULES.CONTACT_STORE),
            GROUP_METADATA: tryRequireModule(WA_MODULES.GROUP_METADATA),
            // Novos módulos
            WID_FACTORY: tryRequireModule(WA_MODULES.WID_FACTORY),
            MEDIA_PREP: tryRequireModule(WA_MODULES.MEDIA_PREP),
            MEDIA_UPLOAD: tryRequireModule(WA_MODULES.MEDIA_UPLOAD),
            MSG_MODELS: tryRequireModule(WA_MODULES.MSG_MODELS),
        };
        
        console.log('[WHL Hooks] Modules initialized:', {
            PROCESS_EDIT_MESSAGE: !!MODULES.PROCESS_EDIT_MESSAGE,
            PROCESS_RENDERABLE_MESSAGES: !!MODULES.PROCESS_RENDERABLE_MESSAGES,
            QUERY_GROUP: !!MODULES.QUERY_GROUP,
            CHAT_COLLECTION: !!MODULES.CHAT_COLLECTION,
            CONTACT_STORE: !!MODULES.CONTACT_STORE,
            GROUP_METADATA: !!MODULES.GROUP_METADATA,
            WID_FACTORY: !!MODULES.WID_FACTORY,
            MEDIA_PREP: !!MODULES.MEDIA_PREP,
            MEDIA_UPLOAD: !!MODULES.MEDIA_UPLOAD,
            MSG_MODELS: !!MODULES.MSG_MODELS
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
    
    /**
     * Carregar grupos via require() interno
     */
    function carregarGrupos() {
        try {
            // Usar require() diretamente aqui, não Store global
            const CC = require('WAWebChatCollection');
            const ChatCollection = CC?.ChatCollection;
            
            if (!ChatCollection || !ChatCollection.getModelsArray) {
                console.warn('[WHL] ChatCollection não disponível para grupos');
                return { success: false, groups: [] };
            }
            
            const models = ChatCollection.getModelsArray() || [];
            const grupos = models
                .filter(c => c.id && c.id.server === 'g.us')
                .map(g => ({
                    id: g.id._serialized,
                    name: g.name || g.formattedTitle || g.contact?.name || 'Grupo sem nome',
                    participants: g.groupMetadata?.participants?.length || 0
                }));
            
            console.log(`[WHL] ${grupos.length} grupos encontrados via require()`);
            return { success: true, groups: grupos };
        } catch (error) {
            console.error('[WHL] Erro ao carregar grupos:', error);
            return { success: false, error: error.message, groups: [] };
        }
    }

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
    
    // ===== FUNÇÕES DE ENVIO DIRETO (API) =====
    
    /**
     * Abre chat sem reload da página
     * @param {string} phoneNumber - Número no formato internacional (ex: 5511999998888)
     * @returns {Promise<boolean>} - true se chat foi aberto com sucesso
     */
    async function openChatDirect(phoneNumber) {
        try {
            if (!MODULES.WID_FACTORY || !MODULES.CHAT_COLLECTION) {
                console.warn('[WHL Hooks] Módulos necessários não disponíveis para openChatDirect');
                return false;
            }
            
            const wid = MODULES.WID_FACTORY.createWid(phoneNumber + '@c.us');
            const chat = await MODULES.CHAT_COLLECTION.find(wid);
            
            if (chat) {
                // Abrir chat usando API interna
                if (MODULES.CHAT_COLLECTION.setActive) {
                    await MODULES.CHAT_COLLECTION.setActive(chat);
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('[WHL Hooks] Erro ao abrir chat:', error);
            return false;
        }
    }
    
    /**
     * Envia mensagem de texto diretamente via API
     * @param {string} phoneNumber - Número no formato internacional
     * @param {string} text - Texto da mensagem
     * @returns {Promise<boolean>} - true se mensagem foi enviada
     */
    async function sendMessageDirect(phoneNumber, text) {
        try {
            if (!MODULES.WID_FACTORY || !MODULES.CHAT_COLLECTION) {
                console.warn('[WHL Hooks] Módulos necessários não disponíveis para sendMessageDirect');
                return false;
            }
            
            const wid = MODULES.WID_FACTORY.createWid(phoneNumber + '@c.us');
            let chat = await MODULES.CHAT_COLLECTION.find(wid);
            
            if (!chat) {
                // Criar novo chat se não existir
                console.log('[WHL Hooks] Chat não encontrado, criando novo...');
                chat = await MODULES.CHAT_COLLECTION.add(wid);
            }
            
            if (chat && chat.sendMessage) {
                await chat.sendMessage(text);
                console.log('[WHL Hooks] ✅ Mensagem enviada via API para', phoneNumber);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('[WHL Hooks] Erro ao enviar mensagem:', error);
            return false;
        }
    }
    
    /**
     * Envia imagem diretamente via API
     * @param {string} phoneNumber - Número no formato internacional
     * @param {string} imageDataUrl - Data URL da imagem (base64)
     * @param {string} caption - Legenda da imagem (opcional)
     * @returns {Promise<boolean>} - true se imagem foi enviada
     */
    async function sendImageDirect(phoneNumber, imageDataUrl, caption = '') {
        try {
            if (!MODULES.WID_FACTORY || !MODULES.CHAT_COLLECTION) {
                console.warn('[WHL Hooks] Módulos necessários não disponíveis para sendImageDirect');
                return false;
            }
            
            const wid = MODULES.WID_FACTORY.createWid(phoneNumber + '@c.us');
            let chat = await MODULES.CHAT_COLLECTION.find(wid);
            
            if (!chat) {
                console.log('[WHL Hooks] Chat não encontrado para envio de imagem');
                return false;
            }
            
            // Converter data URL para blob
            const response = await fetch(imageDataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
            
            // Preparar mídia usando API interna
            if (MODULES.MEDIA_PREP && typeof MODULES.MEDIA_PREP.prepareMedia === 'function') {
                const mediaData = await MODULES.MEDIA_PREP.prepareMedia(file);
                
                // Validar que sendMessage aceita mídia
                if (!chat.sendMessage || typeof chat.sendMessage !== 'function') {
                    console.warn('[WHL Hooks] chat.sendMessage não disponível');
                    return false;
                }
                
                // Enviar com caption
                try {
                    await chat.sendMessage(mediaData, { caption });
                    console.log('[WHL Hooks] ✅ Imagem enviada via API para', phoneNumber);
                    return true;
                } catch (sendError) {
                    console.error('[WHL Hooks] Erro ao chamar sendMessage com mídia:', sendError);
                    return false;
                }
            } else {
                // Fallback: tentar envio simples se MEDIA_PREP não disponível
                console.log('[WHL Hooks] MEDIA_PREP não disponível, usando fallback');
                return false;
            }
        } catch (error) {
            console.error('[WHL Hooks] Erro ao enviar imagem:', error);
            return false;
        }
    }
    
    /**
     * Envia mensagem com indicador de digitação
     * @param {string} phoneNumber - Número no formato internacional
     * @param {string} text - Texto da mensagem
     * @param {number} typingDuration - Duração do indicador em ms
     * @returns {Promise<boolean>} - true se mensagem foi enviada
     */
    async function sendWithTypingIndicator(phoneNumber, text, typingDuration = 2000) {
        try {
            if (!MODULES.WID_FACTORY || !MODULES.CHAT_COLLECTION) {
                console.warn('[WHL Hooks] Módulos necessários não disponíveis');
                return false;
            }
            
            const wid = MODULES.WID_FACTORY.createWid(phoneNumber + '@c.us');
            let chat = await MODULES.CHAT_COLLECTION.find(wid);
            
            if (!chat) {
                return false;
            }
            
            // Mostrar "digitando..." para o destinatário
            if (chat.presence) {
                await chat.presence.subscribe();
                await chat.presence.update('composing');
            }
            
            // Aguardar tempo simulado (baseado no tamanho da mensagem)
            const delay = Math.min(typingDuration, text.length * 50);
            await new Promise(r => setTimeout(r, delay));
            
            // Enviar mensagem
            if (chat.sendMessage) {
                await chat.sendMessage(text);
            }
            
            // Parar indicador
            if (chat.presence) {
                await chat.presence.update('available');
            }
            
            console.log('[WHL Hooks] ✅ Mensagem enviada com indicador de digitação');
            return true;
        } catch (error) {
            console.error('[WHL Hooks] Erro ao enviar com typing indicator:', error);
            return false;
        }
    }
    
    /**
     * Extrai todos os contatos diretamente via API
     * @returns {Object} - Objeto com arrays de contatos (normal, archived, blocked, groups)
     */
    function extractAllContactsDirect() {
        const result = {
            normal: [],
            archived: [],
            blocked: [],
            groups: []
        };
        
        try {
            const chats = MODULES.CHAT_COLLECTION?.models || 
                         MODULES.CHAT_COLLECTION?.getModelsArray?.() || 
                         [];
            
            chats.forEach(chat => {
                const id = chat.id?._serialized;
                if (!id) return;
                
                if (id.endsWith('@g.us')) {
                    // Grupo
                    result.groups.push({
                        id,
                        name: chat.formattedTitle || chat.name || 'Grupo sem nome',
                        participants: chat.groupMetadata?.participants?.length || 0
                    });
                } else if (id.endsWith('@c.us')) {
                    // Contato individual
                    const phone = id.replace('@c.us', '');
                    if (chat.archive) {
                        result.archived.push(phone);
                    } else {
                        result.normal.push(phone);
                    }
                }
            });
            
            // Bloqueados (se disponível)
            if (MODULES.CONTACT_STORE?.models) {
                MODULES.CONTACT_STORE.models.forEach(contact => {
                    if (contact.isBlocked) {
                        const id = contact.id?._serialized;
                        if (id?.endsWith('@c.us')) {
                            result.blocked.push(id.replace('@c.us', ''));
                        }
                    }
                });
            }
            
            console.log('[WHL Hooks] ✅ Extração direta concluída:', {
                normal: result.normal.length,
                archived: result.archived.length,
                blocked: result.blocked.length,
                groups: result.groups.length
            });
        } catch (error) {
            console.error('[WHL Hooks] Erro ao extrair contatos:', error);
        }
        
        return result;
    }
    
    /**
     * Extração instantânea via API interna (método alternativo)
     * Tenta múltiplos métodos para garantir compatibilidade
     */
    function extrairContatosInstantaneo() {
        try {
            // Método 1: via ContactCollection require
            try {
                const ContactC = require('WAWebContactCollection');
                const contacts = ContactC?.ContactCollection?.getModelsArray?.() || [];
                if (contacts.length > 0) {
                    const contatos = contacts.map(contact => contact.id.user || contact.id._serialized?.replace('@c.us', ''));
                    console.log('[WHL] ✅ Extração via WAWebContactCollection:', contatos.length);
                    return { success: true, contacts: contatos, method: 'WAWebContactCollection' };
                }
            } catch(e) {
                console.log('[WHL] Método ContactCollection falhou:', e.message);
            }
            
            // Método 2: via ChatCollection require
            try {
                const CC = require('WAWebChatCollection');
                const chats = CC?.ChatCollection?.getModelsArray?.() || MODULES.CHAT_COLLECTION?.models || [];
                if (chats.length > 0) {
                    const contatos = chats
                        .filter(c => !c.isGroup && (c.id._serialized?.endsWith('@c.us') || c.id?.user))
                        .map(c => c.id.user || c.id._serialized?.replace('@c.us', ''));
                    console.log('[WHL] ✅ Extração via WAWebChatCollection:', contatos.length);
                    return { success: true, contacts: contatos, method: 'WAWebChatCollection' };
                }
            } catch(e) {
                console.log('[WHL] Método ChatCollection falhou:', e.message);
            }
            
            return { success: false, error: 'Nenhum método disponível' };
        } catch (error) {
            console.error('[WHL] Erro na extração instantânea:', error);
            return { success: false, error: error.message };
        }
    }
    
    
    /**
     * Extração de bloqueados
     */
    function extrairBloqueados() {
        try {
            // Usar WAWebBlocklistCollection
            try {
                const BC = require('WAWebBlocklistCollection');
                const blocklist = BC?.BlocklistCollection?.getModelsArray?.() || [];
                if (blocklist.length > 0) {
                    const bloqueados = blocklist.map(c => c.id.user || c.id._serialized?.replace('@c.us', ''));
                    console.log('[WHL] ✅ Bloqueados via WAWebBlocklistCollection:', bloqueados.length);
                    return { success: true, blocked: bloqueados };
                }
            } catch(e) {
                console.log('[WHL] Método BlocklistCollection falhou:', e.message);
            }
            
            return { success: false, error: 'Blocklist não disponível' };
        } catch (error) {
            console.error('[WHL] Erro ao extrair bloqueados:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Extracts group contacts via DOM manipulation
     * More robust than API method - handles WhatsApp Web UI changes
     * Tested and validated - successfully extracted 3 members from a test group
     */
    async function extractGroupContacts() {
        console.log("[WHL] Script iniciado. Verificando ambiente...");

        // Função para esperar um elemento aparecer
        const waitForElement = (selector, timeout = 5000) => {
            return new Promise((resolve, reject) => {
                if (document.querySelector(selector)) {
                    return resolve(document.querySelector(selector));
                }

                const observer = new MutationObserver(() => {
                    if (document.querySelector(selector)) {
                        observer.disconnect();
                        resolve(document.querySelector(selector));
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Elemento ${selector} não encontrado após ${timeout}ms`));
                }, timeout);
            });
        };

        // Verificar se estamos em um chat de grupo
        console.log("[WHL] Procurando identificadores de grupo...");

        // Tentativa com múltiplos seletores possíveis para o botão de informações do grupo
        const possibleGroupSelectors = [
            '[data-testid="group-info-drawer-link"]',
            '[data-icon="info"]',
            'span[data-icon="default-group"]',
            '[title="Dados do grupo"]',
            '[aria-label="Dados do grupo"]',
            '.LwCwJ',
            'header [role="button"]'
        ];

        let groupInfoButton = null;

        for (const selector of possibleGroupSelectors) {
            console.log(`[WHL] Tentando seletor: ${selector}`);
            const elements = document.querySelectorAll(selector);

            if (elements.length > 0) {
                console.log(`[WHL] Encontrado(s) ${elements.length} elemento(s) com seletor ${selector}`);
                for (const el of elements) {
                    groupInfoButton = el;
                    break;
                }

                if (groupInfoButton) break;
            }
        }

        // Método alternativo: clicar no cabeçalho e depois no botão de informações
        if (!groupInfoButton) {
            console.log("[WHL] Tentando método alternativo: clicar no cabeçalho...");
            const header = document.querySelector('header');
            if (header) {
                header.click();
                console.log("[WHL] Cabeçalho clicado, aguardando menu...");

                await new Promise(resolve => setTimeout(resolve, 1000));

                const menuItems = document.querySelectorAll('[role="button"]');
                console.log(`[WHL] Encontrados ${menuItems.length} botões no menu`);

                for (const item of menuItems) {
                    const text = item.textContent.toLowerCase();
                    if (text.includes("info") || text.includes("dados") || text.includes("grupo")) {
                        console.log("[WHL] Possível botão de informações encontrado:", text);
                        groupInfoButton = item;
                        break;
                    }
                }
            }
        }

        if (!groupInfoButton) {
            console.error('[WHL] ERRO: Não foi possível encontrar o botão de informações do grupo.');
            return { success: false, error: 'GROUP_INFO_BUTTON_NOT_FOUND', contacts: [] };
        }

        console.log("[WHL] Botão de informações do grupo encontrado! Clicando...");
        groupInfoButton.click();

        console.log("[WHL] Aguardando painel de informações abrir...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Pegando o nome do grupo
        const groupNameElement = document.querySelector('[data-testid="group-info-header-title"]');
        const groupName = groupNameElement ? groupNameElement.textContent : 'Grupo do WhatsApp';
        console.log("[WHL] Nome do grupo:", groupName);

        // Encontrando todos os participantes
        console.log("[WHL] Procurando lista de participantes...");
        let participants = Array.from(document.querySelectorAll('[data-testid="cell-frame-container"]'));

        if (participants.length === 0) {
            console.log("[WHL] Método padrão falhou. Tentando seletores alternativos...");
            const alternativeSelectors = [
                'div[role="listitem"]',
                'div[tabindex="-1"]',
                'div[data-testid*="cell"]'
            ];

            for (const selector of alternativeSelectors) {
                const elements = document.querySelectorAll(selector);
                console.log(`[WHL] Seletor ${selector}: ${elements.length} elementos encontrados`);

                if (elements.length > 0) {
                    participants = Array.from(elements);
                    break;
                }
            }
        }

        if (participants.length === 0) {
            console.error("[WHL] ERRO: Não foi possível encontrar a lista de participantes.");
            return { success: false, error: 'PARTICIPANTS_NOT_FOUND', contacts: [] };
        }

        console.log(`[WHL] Encontrados ${participants.length} participantes.`);

        // Extraindo informações
        const contactList = participants.map(participant => {
            let nameElement = participant.querySelector('[data-testid="cell-frame-title"]');
            if (!nameElement) nameElement = participant.querySelector('span[title]');
            if (!nameElement) nameElement = participant.querySelector('span[dir="auto"]');

            const name = nameElement ? nameElement.textContent.trim() : 'Desconhecido';

            let phoneElement = participant.querySelector('[data-testid="cell-frame-secondary"]');
            if (!phoneElement) phoneElement = participant.querySelector('span[dir="auto"]:not(:first-child)');

            let phone = phoneElement ? phoneElement.textContent.trim() : '';

            if (!phone && nameElement && nameElement.getAttribute('title')) {
                phone = nameElement.getAttribute('title');
            }

            if (phone) {
                // Remove WhatsApp status text after ~ (e.g., "~Available", "~Online")
                phone = phone.replace(/~.*$/, '').trim();
                const cleanPhone = phone.replace(/[^\d+]/g, '');
                if (cleanPhone) phone = cleanPhone;
            }

            return { name, phone };
        });

        // Filtrando entradas vazias ou duplicadas
        const filteredContacts = contactList.filter(contact =>
            contact.name && contact.name !== 'Desconhecido' && contact.phone
        );

        console.log('[WHL] CONTATOS EXTRAÍDOS DO GRUPO: ' + groupName);
        console.table(filteredContacts.length > 0 ? filteredContacts : contactList);

        // Fechar o painel de informações do grupo
        const closeButtons = [
            document.querySelector('[data-testid="btn-closer-drawer"]'),
            document.querySelector('[data-icon="back"]'),
            document.querySelector('span[data-icon="back"]'),
            document.querySelector('[aria-label="Voltar"]'),
            document.querySelector('[aria-label="Fechar"]')
        ];

        for (const btn of closeButtons) {
            if (btn) {
                console.log("[WHL] Fechando painel de informações...");
                btn.click();
                break;
            }
        }

        return {
            success: true,
            groupName: groupName,
            contacts: filteredContacts.length > 0 ? filteredContacts : contactList,
            total: (filteredContacts.length > 0 ? filteredContacts : contactList).length
        };
    }
    
    /**
     * Extração completa (tudo de uma vez)
     */
    function extrairTudoInstantaneo() {
        const result = {
            contacts: [],
            archived: [],
            blocked: [],
            groups: []
        };
        
        try {
            const CC = require('WAWebChatCollection');
            const chats = CC?.ChatCollection?.getModelsArray?.() || MODULES.CHAT_COLLECTION?.models || [];
            
            if (chats.length > 0) {
                chats.forEach(chat => {
                    try {
                        const id = chat.id?._serialized || chat.id?.user;
                        const user = chat.id?.user || id?.replace('@c.us', '').replace('@g.us', '');
                        
                        if (!id) return;
                        
                        if (chat.isGroup || id.endsWith('@g.us')) {
                            result.groups.push({
                                id: id,
                                name: chat.name || chat.formattedTitle || 'Grupo',
                                participants: chat.groupMetadata?.participants?.length || 0
                            });
                        } else if (id.endsWith('@c.us')) {
                            if (chat.archive) {
                                result.archived.push(user);
                            } else {
                                result.contacts.push(user);
                            }
                        }
                    } catch(e) {
                        // Ignorar erros individuais
                    }
                });
            }
            
            // Bloqueados separado
            try {
                const BC = require('WAWebBlocklistCollection');
                const blocklist = BC?.BlocklistCollection?.getModelsArray?.() || [];
                result.blocked = blocklist.map(c => c.id?.user || c.id?._serialized?.replace('@c.us', ''));
            } catch(e) {
                console.log('[WHL] BlocklistCollection não disponível:', e.message);
            }
            
            console.log('[WHL] ✅ Extração completa instantânea:', {
                contacts: result.contacts.length,
                archived: result.archived.length,
                blocked: result.blocked.length,
                groups: result.groups.length
            });
            
            return { success: true, ...result };
        } catch (error) {
            console.error('[WHL] Erro na extração completa:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== LISTENERS PARA NOVAS EXTRAÇÕES =====
    window.addEventListener('message', (event) => {
        // Validate origin and source for security (prevent cross-frame attacks)
        if (event.origin !== window.location.origin || event.source !== window) return;
        if (!event.data || !event.data.type) return;
        
        const { type } = event.data;
        
        if (type === 'WHL_EXTRACT_CONTACTS') {
            const result = extrairContatos();
            window.postMessage({ type: 'WHL_EXTRACT_CONTACTS_RESULT', ...result }, '*');
        }
        
        if (type === 'WHL_LOAD_GROUPS') {
            const result = extrairGrupos();
            window.postMessage({ type: 'WHL_LOAD_GROUPS_RESULT', ...result }, '*');
        }
        
        if (type === 'WHL_LOAD_ARCHIVED_BLOCKED') {
            const arquivados = extrairArquivados();
            const bloqueados = extrairBloqueados();
            
            window.postMessage({ 
                type: 'WHL_ARCHIVED_BLOCKED_RESULT', 
                archived: arquivados.archived || [],
                blocked: bloqueados.blocked || [],
                stats: {
                    archived: arquivados.count || 0,
                    blocked: bloqueados.count || 0
                }
            }, '*');
        }
        
        // EXTRAIR MEMBROS DO GRUPO (API method - may return 0)
        if (type === 'WHL_EXTRACT_GROUP_MEMBERS') {
            const { groupId } = event.data;
            try {
                const CC = require('WAWebChatCollection');
                const chats = CC?.ChatCollection?.getModelsArray?.() || [];
                const chat = chats.find(c => c?.id?._serialized === groupId);
                const members = (chat?.groupMetadata?.participants || [])
                    .map(p => p?.id?._serialized)
                    .filter(Boolean)
                    .filter(id => id.endsWith('@c.us'))
                    .map(id => id.replace('@c.us', ''));
                
                window.postMessage({
                    type: 'WHL_GROUP_MEMBERS_RESULT',
                    groupId,
                    members: [...new Set(members)]
                }, '*');
            } catch (e) {
                window.postMessage({ type: 'WHL_GROUP_MEMBERS_ERROR', error: e.message }, '*');
            }
        }
        
        // EXTRAIR MEMBROS DO GRUPO VIA DOM (Tested and validated - more robust)
        if (type === 'WHL_EXTRACT_GROUP_CONTACTS_DOM') {
            const { requestId } = event.data;
            (async () => {
                try {
                    const result = await extractGroupContacts();
                    window.postMessage({ 
                        type: 'WHL_EXTRACT_GROUP_CONTACTS_DOM_RESULT', 
                        requestId, 
                        ...result 
                    }, '*');
                } catch (error) {
                    window.postMessage({ 
                        type: 'WHL_EXTRACT_GROUP_CONTACTS_DOM_ERROR', 
                        requestId, 
                        error: error.message 
                    }, '*');
                }
            })();
        }
        
        if (type === 'WHL_EXTRACT_ALL') {
            const result = extrairTudo();
            window.postMessage({ type: 'WHL_EXTRACT_ALL_RESULT', ...result }, '*');
        }
        
        // RECOVER MESSAGES - Since hooks are automatic, just acknowledge
        if (type === 'WHL_RECOVER_ENABLE') {
            console.log('[WHL Hooks] Recover is always enabled with hooks approach');
        }
        
        if (type === 'WHL_RECOVER_DISABLE') {
            console.log('[WHL Hooks] Note: Recover hooks cannot be disabled once loaded');
        }
        
        // GET RECOVER HISTORY
        if (type === 'WHL_GET_RECOVER_HISTORY') {
            // Carregar do localStorage se array vazio
            if (historicoRecover.length === 0) {
                try {
                    const saved = localStorage.getItem('whl_recover_history');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        historicoRecover.push(...parsed);
                    }
                } catch(e) {
                    console.warn('[WHL] Erro ao carregar histórico:', e);
                }
            }
            
            window.postMessage({
                type: 'WHL_RECOVER_HISTORY_RESULT',
                history: historicoRecover,
                total: historicoRecover.length
            }, '*');
        }
        
        // CLEAR RECOVER HISTORY
        if (type === 'WHL_CLEAR_RECOVER_HISTORY') {
            historicoRecover.length = 0;
            localStorage.removeItem('whl_recover_history');
            window.postMessage({ type: 'WHL_RECOVER_HISTORY_CLEARED' }, '*');
        }
    });
    
    // ===== LISTENERS FOR SEND FUNCTIONS =====
    window.addEventListener('message', async (event) => {
        // Validate origin and source for security (prevent cross-frame attacks)
        if (event.origin !== window.location.origin || event.source !== window) return;
        if (!event.data) return;
        
        // Enviar apenas TEXTO
        if (event.data.type === 'WHL_SEND_MESSAGE_API') {
            const { phone, message, requestId } = event.data;
            const result = await enviarMensagemAPI(phone, message);
            window.postMessage({ type: 'WHL_SEND_MESSAGE_API_RESULT', requestId, ...result }, '*');
        }
        
        // Enviar apenas IMAGEM
        if (event.data.type === 'WHL_SEND_IMAGE_DOM') {
            const { base64Image, caption, requestId } = event.data;
            const result = await enviarImagemDOM(base64Image, caption);
            window.postMessage({ type: 'WHL_SEND_IMAGE_DOM_RESULT', requestId, ...result }, '*');
        }
        
        // Enviar TEXTO + IMAGEM
        if (event.data.type === 'WHL_SEND_COMPLETE') {
            const { phone, texto, base64Image, caption, requestId } = event.data;
            const result = await enviarMensagemCompleta(phone, texto, base64Image, caption);
            window.postMessage({ type: 'WHL_SEND_COMPLETE_RESULT', requestId, ...result }, '*');
        }
    });
    
    // ===== MESSAGE LISTENERS PARA API DIRETA =====
    window.addEventListener('message', async (event) => {
        // Validate origin and source for security (prevent cross-frame attacks)
        if (event.origin !== window.location.origin || event.source !== window) return;
        if (!event.data || !event.data.type) return;
        
        const { type } = event.data;
        
        // ENVIAR MENSAGEM DE TEXTO DIRETAMENTE
        if (type === 'WHL_SEND_MESSAGE_DIRECT') {
            const { phone, message, useTyping } = event.data;
            try {
                let success;
                if (useTyping) {
                    success = await sendWithTypingIndicator(phone, message);
                } else {
                    success = await sendMessageDirect(phone, message);
                }
                
                window.postMessage({ 
                    type: 'WHL_SEND_MESSAGE_RESULT', 
                    success, 
                    phone 
                }, '*');
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_SEND_MESSAGE_RESULT', 
                    success: false, 
                    phone, 
                    error: error.message 
                }, '*');
            }
        }
        
        // ENVIAR IMAGEM DIRETAMENTE
        if (type === 'WHL_SEND_IMAGE_DIRECT') {
            const { phone, imageData, caption } = event.data;
            try {
                const success = await sendImageDirect(phone, imageData, caption);
                window.postMessage({ 
                    type: 'WHL_SEND_IMAGE_RESULT', 
                    success, 
                    phone 
                }, '*');
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_SEND_IMAGE_RESULT', 
                    success: false, 
                    phone, 
                    error: error.message 
                }, '*');
            }
        }
        
        // EXTRAIR TODOS OS CONTATOS DIRETAMENTE
        if (type === 'WHL_EXTRACT_ALL_DIRECT') {
            try {
                const result = extractAllContactsDirect();
                window.postMessage({ 
                    type: 'WHL_EXTRACT_ALL_RESULT', 
                    ...result 
                }, '*');
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_EXTRACT_ALL_ERROR', 
                    error: error.message 
                }, '*');
            }
        }
        
        // EXTRAÇÃO INSTANTÂNEA (novo método alternativo)
        if (type === 'WHL_EXTRACT_INSTANT') {
            try {
                const result = extrairContatosInstantaneo();
                window.postMessage({ 
                    type: 'WHL_EXTRACT_INSTANT_RESULT', 
                    ...result 
                }, '*');
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_EXTRACT_INSTANT_ERROR', 
                    error: error.message 
                }, '*');
            }
        }
        
        // EXTRAÇÃO COMPLETA INSTANTÂNEA (contatos, arquivados, bloqueados)
        if (type === 'WHL_EXTRACT_ALL_INSTANT') {
            try {
                const result = extrairTudoInstantaneo();
                window.postMessage({ 
                    type: 'WHL_EXTRACT_ALL_INSTANT_RESULT', 
                    ...result 
                }, '*');
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_EXTRACT_ALL_INSTANT_ERROR', 
                    error: error.message 
                }, '*');
            }
        }
    });

    // ===== EXTRAÇÃO INSTANTÂNEA =====
    window.addEventListener('message', (event) => {
        // Validate origin and source for security (prevent cross-frame attacks)
        if (event.origin !== window.location.origin || event.source !== window) return;
        if (event.data?.type !== 'WHL_EXTRACT_INSTANT') return;
        
        try {
            const CC = require('WAWebChatCollection');
            const ContactC = require('WAWebContactCollection');
            const chats = CC?.ChatCollection?.getModelsArray?.() || [];
            const contacts = ContactC?.ContactCollection?.getModelsArray?.() || [];

            const phoneFromId = (id) => (id?._serialized || '').replace('@c.us', '');
            const nums = new Set();

            chats.forEach(c => {
                const id = phoneFromId(c?.id);
                if (/^\d{8,15}$/.test(id)) nums.add(id);
            });
            
            contacts.forEach(ct => {
                const id = phoneFromId(ct?.id);
                if (/^\d{8,15}$/.test(id)) nums.add(id);
            });

            console.log(`[WHL Hooks] Extração instantânea: ${nums.size} números`);
            window.postMessage({ type: 'WHL_EXTRACT_INSTANT_RESULT', numbers: [...nums] }, '*');
        } catch (e) {
            console.error('[WHL Hooks] Erro na extração instantânea:', e);
            window.postMessage({ type: 'WHL_EXTRACT_INSTANT_ERROR', error: e.message }, '*');
        }
    });
};

// Executar apenas uma vez
if (!window.whl_hooks_loaded) {
    window.whl_hooks_loaded = true;
    console.log('[WHL Hooks] Initializing WPP Hooks...');
    window.whl_hooks_main();
}
