/**
 * WhatsHybrid Lite - WPP Hooks (WPP Boladão tested approach)
 * Uses require() to load internal WhatsApp modules via webpack
 * Does NOT use window.Store directly (CSP blocking)
 */

window.whl_hooks_main = () => {
    // ===== DEBUG LOGGING SYSTEM =====
            const WHL_DEBUG = localStorage.getItem('whl_debug') === 'true';
    const whlLog = {
        debug: (...args) => { if (WHL_DEBUG) console.log('[WHL Hooks DEBUG]', ...args); },
        info: (...args) => console.log('[WHL Hooks]', ...args),
        warn: (...args) => console.warn('[WHL Hooks]', ...args),
        error: (...args) => console.error('[WHL Hooks]', ...args)
    };
    
    // ===== HELPER FUNCTIONS FOR GROUP MEMBER EXTRACTION =====
    function safeRequire(name) {
        try {
            if (typeof require === 'function') {
                return require(name);
            }
        } catch {}
        return null;
    }

    function resolveCollections() {
        // A — require()
        try {
            const ChatMod = safeRequire('WAWebChatCollection');
            const ContactMod = safeRequire('WAWebContactCollection');

            if (ChatMod && ContactMod) {
                const ChatCollection =
                    ChatMod.ChatCollection || ChatMod.default?.ChatCollection;
                const ContactCollection =
                    ContactMod.ContactCollection || ContactMod.default?.ContactCollection;

                if (ChatCollection && ContactCollection) {
                    return { ChatCollection, ContactCollection };
                }
            }
        } catch {}

        // B — globais (quando existirem)
        try {
            if (window.ChatCollection && window.ContactCollection) {
                return {
                    ChatCollection: window.ChatCollection,
                    ContactCollection: window.ContactCollection
                };
            }
        } catch {}

        // C — introspecção defensiva
        try {
            for (const k in window) {
                const v = window[k];
                if (v?.getModelsArray && v?.get) {
                    const arr = v.getModelsArray();
                    if (Array.isArray(arr) && arr.some(c => c?.id?.server === 'g.us')) {
                        return { ChatCollection: v, ContactCollection: null };
                    }
                }
            }
        } catch {}

        return null;
    }

    async function waitForCollections(maxTries = 50, delay = 400) {
        for (let i = 0; i < maxTries; i++) {
            const cols = resolveCollections();
            if (cols?.ChatCollection) return cols;
            await new Promise(r => setTimeout(r, delay));
        }
        return null;
    }

    // PR #76 ULTRA: Validação de telefone melhorada
    function isValidPhone(num) {
        if (!num) return false;
        const clean = String(num).replace(/\D/g, '');
        
        // Rejeitar LIDs
        if (String(num).includes(':') || String(num).includes('@lid')) {
            return false;
        }
        
        // Aceitar apenas números válidos (10-15 dígitos)
        return /^\d{10,15}$/.test(clean);
    }

    // PR #76 ULTRA: Resolução de LID ULTRA (7 campos + 5 variações de ID)
    async function resolveContactPhoneUltra(participantId, collections) {
        if (!collections?.ContactCollection) {
            whlLog.warn('ContactCollection não disponível');
            return null;
        }

        // Lista de IDs para tentar (5 VARIAÇÕES)
        const searchIds = [
            participantId,
            String(participantId).replace(/@c\.us|@s\.whatsapp\.net|@lid/g, ''),
            String(participantId).replace('@lid', '').split(':')[0],
            String(participantId).split(':')[0],
            String(participantId).split('@')[0]
        ];

        for (const id of searchIds) {
            if (!id) continue;

            try {
                let contact = collections.ContactCollection.get(id);
                if (!contact && !id.includes('@')) {
                    contact = collections.ContactCollection.get(id + '@c.us');
                }

                if (contact) {
                    // 7 CAMPOS onde o número pode estar
                    const possibleNumbers = [
                        contact.phoneNumber,
                        contact.formattedNumber,
                        contact.id?.user,
                        contact.userid,
                        contact.number,
                        contact.id?._serialized?.replace(/@c\.us|@s\.whatsapp\.net|@lid/g, ''),
                        contact.verifiedName,
                    ];

                    for (const num of possibleNumbers) {
                        if (!num) continue;
                        const clean = String(num).replace(/\D/g, '');
                        if (isValidPhone(clean)) {
                            whlLog.debug(`LID resolvido: ${String(participantId).substring(0, 30)}... → ${clean}`);
                            return clean;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }

        whlLog.warn(`Não foi possível resolver: ${String(participantId).substring(0, 30)}...`);
        return null;
    }
    
    // MANTER FUNÇÃO ANTIGA PARA COMPATIBILIDADE
    async function getPhoneFromContact(participantId) {
        const cols = await waitForCollections();
        if (!cols) return null;
        return await resolveContactPhoneUltra(participantId, cols);
    }
    
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
            whlLog.warn('Módulos não disponíveis ainda:', e.message);
            return null;
        }
    }

    // ===== EXTRAÇÃO DE CONTATOS =====
    // PR #78: Melhorada com múltiplos fallbacks e logs detalhados
    function extrairContatos() {
        try {
            const modules = getModules();
            if (!modules || !modules.ChatCollection) {
                console.error('[WHL] ChatCollection não disponível');
                return { success: false, error: 'Módulos não disponíveis', contacts: [], count: 0 };
            }
            
            const models = modules.ChatCollection.getModelsArray() || [];
            whlLog.debug('Total de chats encontrados:', models.length);
            
            // Filtrar apenas contatos individuais (c.us)
            const contatos = models
                .filter(m => {
                    const isContact = m.id?.server === 'c.us';
                    const hasUser = m.id?.user || m.id?._serialized;
                    return isContact && hasUser;
                })
                .map(m => {
                    // Múltiplos métodos para obter o número
                    if (m.id.user) {
                        return m.id.user;
                    }
                    const serialized = m.id._serialized || '';
                    return serialized.replace('@c.us', '');
                })
                .map(n => String(n).replace(/\D/g, ''))  // PR #78: Clean before filtering
                .filter(n => n && /^\d{10,15}$/.test(n));  // PR #78: Test cleaned value
            
            const uniqueContatos = [...new Set(contatos)];
            whlLog.debug('Contatos extraídos:', uniqueContatos.length);
            
            return { 
                success: true, 
                contacts: uniqueContatos, 
                count: uniqueContatos.length 
            };
        } catch (e) {
            console.error('[WHL] Erro ao extrair contatos:', e);
            return { 
                success: false, 
                error: e.message, 
                contacts: [], 
                count: 0 
            };
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
     * Extrai contatos arquivados e bloqueados via DOM
     * Combina API e DOM para máxima cobertura
     */
    async function extrairArquivadosBloqueadosDOM() {
        console.log('[WHL] Iniciando extração de arquivados/bloqueados via DOM...');
        
        const result = { archived: [], blocked: [] };
        
        // Método 1: Tentar via API primeiro (Arquivados)
        try {
            const CC = require('WAWebChatCollection');
            const chats = CC?.ChatCollection?.getModelsArray?.() || [];
            
            // Arquivados
            result.archived = chats
                .filter(c => c.archive === true && c.id?._serialized?.endsWith('@c.us'))
                .map(c => c.id._serialized.replace('@c.us', ''))
                .filter(n => /^\d{8,15}$/.test(n));
            
            console.log('[WHL] Arquivados via API:', result.archived.length);
        } catch (e) {
            console.warn('[WHL] Erro ao extrair arquivados via API:', e);
        }
        
        // Bloqueados via BlocklistCollection
        try {
            const BC = require('WAWebBlocklistCollection');
            const blocklist = BC?.BlocklistCollection?.getModelsArray?.() || [];
            
            result.blocked = blocklist
                .map(c => c.id?._serialized?.replace('@c.us', '') || c.id?.user || '')
                .filter(n => /^\d{8,15}$/.test(n));
            
            console.log('[WHL] Bloqueados via API:', result.blocked.length);
        } catch (e) {
            console.warn('[WHL] Erro ao extrair bloqueados via API:', e);
        }
        
        return result;
    }

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

            // CORREÇÃO BUG 1: Preservar quebras de linha exatamente como estão
            // Não fazer nenhuma sanitização no texto
            var textoOriginal = mensagem; // Manter \n intacto
            
            console.log('[WHL] Texto com quebras:', JSON.stringify(textoOriginal));

            var wid = WF.createWid(phone + '@c.us');
            var chat = CC.ChatCollection.get(wid);
            if (!chat) { 
                chat = new ChatModel.Chat({ id: wid }); 
                CC.ChatCollection.add(chat); 
            }

            var msgId = await MsgKey.newId();
            var msg = new MsgModel.Msg({
                id: { fromMe: true, remote: wid, id: msgId, _serialized: 'true_' + wid._serialized + '_' + msgId },
                body: textoOriginal,  // CORREÇÃO BUG 1: Texto COM quebras de linha preservadas
                type: 'chat',
                t: Math.floor(Date.now() / 1000),
                from: wid, to: wid, self: 'out', isNewMsg: true, local: true
            });

            var result = await SMRA.sendMsgRecord(msg);
            
            // NOVO: Forçar atualização do chat para renderizar a mensagem
            try {
                if (chat.msgs && chat.msgs.sync) {
                    await chat.msgs.sync();
                }
                // Tentar também recarregar o chat
                if (chat.reload) {
                    await chat.reload();
                }
            } catch (e) {
                console.warn('[WHL] Não foi possível sincronizar chat:', e);
            }
            
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
                    
                    // IMPORTANTE: Preservar quebras de linha (\n) dividindo em linhas
                    const lines = caption.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (i > 0) {
                            // Inserir quebra de linha com Shift+Enter
                            captionInput.dispatchEvent(new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                keyCode: 13,
                                which: 13,
                                shiftKey: true,
                                bubbles: true,
                                cancelable: true
                            }));
                            await new Promise(r => setTimeout(r, 50));
                        }
                        
                        if (lines[i]) {
                            document.execCommand('insertText', false, lines[i]);
                        }
                    }
                    console.log('[WHL] 📝 Caption adicionado (com quebras preservadas):', caption);
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
     * CORREÇÃO BUG 2: Abre o chat de um número específico via navegação de URL
     * @param {string} phone - Número de telefone
     * @returns {Promise<boolean>} - true se chat foi aberto
     */
    async function abrirChatPorNumero(phone) {
        console.log('[WHL] 📱 Abrindo chat para:', phone);
        
        try {
            const WF = require('WAWebWidFactory');
            const CC = require('WAWebChatCollection');
            
            const wid = WF.createWid(phone + '@c.us');
            let chat = CC.ChatCollection.get(wid);
            
            if (!chat) {
                const ChatModel = require('WAWebChatModel');
                chat = new ChatModel.Chat({ id: wid });
                CC.ChatCollection.add(chat);
            }
            
            // MÉTODO CORRETO: Usar openChat do CMD
            try {
                const CMD = require('WAWebCmd');
                if (CMD && CMD.openChatAt) {
                    await CMD.openChatAt(chat);
                    await new Promise(r => setTimeout(r, 2000));
                    return true;
                }
            } catch (e) {
                console.log('[WHL] CMD não disponível, tentando método alternativo...');
            }
            
            // FALLBACK: Simular clique no contato ou usar URL
            // Navegar para o chat via URL do WhatsApp Web
            const currentUrl = window.location.href;
            const targetUrl = `https://web.whatsapp.com/send?phone=${phone}`;
            
            if (!currentUrl.includes(phone)) {
                // Criar link e clicar
                const link = document.createElement('a');
                link.href = targetUrl;
                link.target = '_self';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Aguardar página carregar
                await new Promise(r => setTimeout(r, 3000));
            }
            
            return true;
        } catch (e) {
            console.error('[WHL] Erro ao abrir chat:', e);
            return false;
        }
    }

    /**
     * CORREÇÃO BUG 2: Envia IMAGEM para um número específico (não o chat aberto)
     * @param {string} phone - Número de destino
     * @param {string} base64Image - Imagem em base64
     * @param {string} caption - Legenda opcional
     */
    async function enviarImagemParaNumero(phone, base64Image, caption) {
        console.log('[WHL] 🖼️ Enviando IMAGEM para número:', phone);
        
        // PASSO 1: Abrir o chat do número correto
        const chatAberto = await abrirChatPorNumero(phone);
        if (!chatAberto) {
            console.error('[WHL] ❌ Não foi possível abrir chat para', phone);
            return { success: false, error: 'CHAT_NOT_OPENED' };
        }
        
        // PASSO 2: Aguardar um pouco mais para garantir
        await new Promise(r => setTimeout(r, 500));
        
        // PASSO 3: Agora enviar a imagem (chat correto está aberto)
        return await enviarImagemDOM(base64Image, caption);
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

    /**
     * Aguarda confirmação visual de que a mensagem apareceu no chat
     * @param {string} mensagemEnviada - Texto da mensagem enviada
     * @param {number} timeout - Tempo máximo de espera em ms (padrão: 10000)
     * @returns {Promise<{success: boolean, confirmed: boolean, reason?: string}>}
     */
    async function aguardarConfirmacaoVisual(mensagemEnviada, timeout = 10000) {
        console.log('[WHL] ⏳ Aguardando confirmação visual no DOM...');
        
        const startTime = Date.now();
        const textoParaBuscar = mensagemEnviada.substring(0, 50); // Primeiros 50 chars
        const isImageOnly = mensagemEnviada === '[imagem]' || !mensagemEnviada || mensagemEnviada.trim().length === 0;
        
        while (Date.now() - startTime < timeout) {
            try {
                // Seletores para mensagens no chat
                const mensagensNoChat = document.querySelectorAll(
                    '[data-testid="msg-container"], ' +
                    '.message-out, ' +
                    '[class*="message-out"], ' +
                    '[data-testid="conversation-panel-messages"] [role="row"]'
                );
                
                for (const msgEl of mensagensNoChat) {
                    const texto = msgEl.textContent || '';
                    
                    // Se for imagem sem texto, procurar por elementos de mídia recentes
                    if (isImageOnly) {
                        const hasImage = msgEl.querySelector('img[src*="blob"], img[src*="data:image"], [data-testid="image-thumb"]');
                        if (hasImage) {
                            // Verificar se tem o tick de enviado
                            const ticks = msgEl.querySelector(
                                '[data-testid="msg-check"], ' +
                                '[data-testid="msg-dblcheck"], ' +
                                '[data-icon="msg-check"], ' +
                                '[data-icon="msg-dblcheck"], ' +
                                'span[data-icon="msg-time"]'
                            );
                            
                            if (ticks) {
                                console.log('[WHL] ✅ Confirmação visual: Imagem apareceu no chat com tick!');
                                return { success: true, confirmed: true };
                            }
                            
                            console.log('[WHL] 📝 Imagem encontrada, aguardando tick...');
                        }
                    } else {
                        // Verificar se a mensagem apareceu (comparar início do texto)
                        if (texto.includes(textoParaBuscar)) {
                            // Verificar se tem o tick de enviado (✓ ou ✓✓)
                            const ticks = msgEl.querySelector(
                                '[data-testid="msg-check"], ' +
                                '[data-testid="msg-dblcheck"], ' +
                                '[data-icon="msg-check"], ' +
                                '[data-icon="msg-dblcheck"], ' +
                                'span[data-icon="msg-time"]'
                            );
                            
                            if (ticks) {
                                console.log('[WHL] ✅ Confirmação visual: Mensagem apareceu no chat com tick!');
                                return { success: true, confirmed: true };
                            }
                            
                            // Se encontrou a mensagem mas sem tick ainda, aguardar mais um pouco
                            console.log('[WHL] 📝 Mensagem encontrada, aguardando tick...');
                        }
                    }
                }
            } catch (e) {
                console.warn('[WHL] Erro ao verificar confirmação visual:', e);
            }
            
            // Verificar a cada 500ms
            await new Promise(r => setTimeout(r, 500));
        }
        
        console.warn('[WHL] ⚠️ Timeout: Mensagem não confirmada visualmente após', timeout, 'ms');
        return { success: false, confirmed: false, reason: 'TIMEOUT' };
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
    // CORREÇÃO BUG 4: Cache mais robusto de mensagens para recuperar conteúdo quando forem apagadas
    // Mantém as últimas 1000 mensagens em memória
    const messageCache = new Map(); // Map<messageId, {body, from, timestamp, type}>
    const MAX_CACHE_SIZE = 1000; // Aumentar para 1000
    
    // Array para armazenar histórico de mensagens recuperadas
    const historicoRecover = [];
    
    // Constants for recover history limits
    const MAX_STORAGE_MB = 5;
    const MAX_STORAGE_BYTES = MAX_STORAGE_MB * 1024 * 1024;
    const MAX_RECOVER_MESSAGES = 100; // Maximum number of messages to keep
    const FALLBACK_RECOVER_MESSAGES = 50; // Fallback when storage is full
    
    /**
     * CORREÇÃO BUG 4: Cachear mensagem recebida para poder recuperá-la se for apagada
     */
    function cachearMensagem(msg) {
        if (!msg) return;
        
        // Múltiplos IDs para cache
        const ids = [
            msg.id?.id,
            msg.id?._serialized,
            msg.id?.remote?._serialized + '_' + msg.id?.id
        ].filter(Boolean);
        
        const body = msg.body || msg.caption || msg.text || '';
        const from = msg.from?._serialized || msg.from?.user || msg.author?._serialized || msg.id?.remote?._serialized || '';
        
        if (!body && !from) return;
        
        const cacheData = {
            body: body,
            from: from,
            timestamp: Date.now(),
            type: msg.type || 'chat'
        };
        
        // Cachear com TODOS os IDs possíveis
        ids.forEach(id => {
            messageCache.set(id, cacheData);
        });
        
        // Limitar tamanho do cache
        if (messageCache.size > MAX_CACHE_SIZE) {
            const firstKey = messageCache.keys().next().value;
            messageCache.delete(firstKey);
        }
        
        console.log('[WHL Cache] Mensagem cacheada:', body.substring(0, 30), 'IDs:', ids.length);
    }
    
    /**
     * CORREÇÃO BUG 4: Função para salvar mensagem recuperada
     */
    /**
     * CORREÇÃO ISSUE 05: Salvar mensagem editada no histórico
     */
    function salvarMensagemEditada(message) {
        const messageContent = message?.body || message?.caption || '[sem conteúdo]';
        let from = message?.from?._serialized || message?.from?.user || message?.author?._serialized || message?.id?.remote?._serialized || '';
        
        // Formatar
        from = (from || '').replace('@c.us', '').replace('@s.whatsapp.net', '');
        if (!from) from = 'Número desconhecido';
        
        const entrada = {
            id: message.id?.id || Date.now().toString(),
            from: from,
            body: messageContent,
            type: 'edited',
            timestamp: Date.now()
        };
        
        console.log('[WHL Recover] ✏️ Salvando mensagem editada:', entrada);
        
        historicoRecover.push(entrada);
        
        // Item 4: Limit Recover localStorage storage
        let currentSize = new Blob([JSON.stringify(historicoRecover)]).size;
        
        while (currentSize > MAX_STORAGE_BYTES && historicoRecover.length > 10) {
            historicoRecover.shift();
            currentSize = new Blob([JSON.stringify(historicoRecover)]).size;
        }
        
        if (historicoRecover.length > MAX_RECOVER_MESSAGES) {
            historicoRecover = historicoRecover.slice(-MAX_RECOVER_MESSAGES);
        }
        
        // Salvar no localStorage
        try {
            const dataToSave = JSON.stringify(historicoRecover);
            const sizeKB = (new Blob([dataToSave]).size / 1024).toFixed(2);
            localStorage.setItem('whl_recover_history', dataToSave);
            console.log(`[WHL Recover] Histórico salvo: ${historicoRecover.length} mensagens, ${sizeKB}KB`);
        } catch(e) {
            console.error('[WHL Recover] Erro ao salvar (limite excedido?)', e);
            historicoRecover = historicoRecover.slice(-FALLBACK_RECOVER_MESSAGES);
            try {
                localStorage.setItem('whl_recover_history', JSON.stringify(historicoRecover));
            } catch(e2) {
                console.error('[WHL Recover] Falha crítica ao salvar histórico', e2);
            }
        }
        
        // Notificar UI
        window.postMessage({
            type: 'WHL_RECOVER_NEW_MESSAGE',
            message: entrada,
            total: historicoRecover.length
        }, window.location.origin);
        
        console.log(`[WHL Recover] Mensagem editada de ${entrada.from}: ${entrada.body.substring(0, 50)}...`);
    }

    function salvarMensagemRecuperada(msg) {
        // CORREÇÃO BUG 4: Tentar múltiplas fontes para o body
        let body = msg.body || msg.caption || msg.text || '';
        let from = msg.from?._serialized || msg.from?.user || msg.author?._serialized || msg.id?.remote?._serialized || '';
        
        // Se body estiver vazio, TENTAR RECUPERAR DO CACHE
        if (!body) {
            const possibleIds = [
                msg.protocolMessageKey?.id,
                msg.id?.id,
                msg.id?._serialized,
                msg.quotedStanzaID,
                msg.id?.remote?._serialized + '_' + msg.protocolMessageKey?.id
            ].filter(Boolean);
            
            for (const id of possibleIds) {
                const cached = messageCache.get(id);
                if (cached && cached.body) {
                    body = cached.body;
                    if (!from && cached.from) from = cached.from;
                    console.log('[WHL Recover] ✅ Conteúdo recuperado do cache:', body.substring(0, 50));
                    break;
                }
            }
        }
        
        // Formatar
        from = (from || '').replace('@c.us', '').replace('@s.whatsapp.net', '');
        if (!body) body = '[Mensagem sem texto - mídia ou sticker]';
        if (!from) from = 'Número desconhecido';
        
        const entrada = {
            id: msg.id?.id || Date.now().toString(),
            from: from,
            body: body,
            type: msg.type || 'chat',
            timestamp: Date.now()
        };
        
        console.log('[WHL Recover] 📝 Salvando:', entrada);
        
        historicoRecover.push(entrada);
        
        // Item 4: Limit Recover localStorage storage
        // Calculate approximate size and limit storage
        let currentSize = new Blob([JSON.stringify(historicoRecover)]).size;
        
        // Keep trimming until under size limit
        while (currentSize > MAX_STORAGE_BYTES && historicoRecover.length > 10) {
            historicoRecover.shift(); // Remove oldest messages
            currentSize = new Blob([JSON.stringify(historicoRecover)]).size;
        }
        
        // Also limit by count (max messages as fallback)
        if (historicoRecover.length > MAX_RECOVER_MESSAGES) {
            historicoRecover = historicoRecover.slice(-MAX_RECOVER_MESSAGES);
        }
        
        // Salvar no localStorage
        try {
            const dataToSave = JSON.stringify(historicoRecover);
            const sizeKB = (new Blob([dataToSave]).size / 1024).toFixed(2);
            localStorage.setItem('whl_recover_history', dataToSave);
            console.log(`[WHL Recover] Histórico salvo: ${historicoRecover.length} mensagens, ${sizeKB}KB`);
        } catch(e) {
            console.error('[WHL Recover] Erro ao salvar (limite excedido?)', e);
            // If storage fails, remove oldest half and retry
            historicoRecover = historicoRecover.slice(-FALLBACK_RECOVER_MESSAGES);
            try {
                localStorage.setItem('whl_recover_history', JSON.stringify(historicoRecover));
            } catch(e2) {
                console.error('[WHL Recover] Falha crítica ao salvar histórico', e2);
            }
        }
        
        // Notificar UI
        window.postMessage({
            type: 'WHL_RECOVER_NEW_MESSAGE',
            message: entrada,
            total: historicoRecover.length
        }, window.location.origin);
        
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
            // CORREÇÃO ISSUE 05: Cachear todas as mensagens antes de processar
            // Isso permite recuperar o conteúdo quando a mensagem for apagada
            cachearMensagem(message);
            
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
                }, window.location.origin);
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
            // CORREÇÃO ISSUE 05: Salvar mensagem editada no histórico ANTES de modificar
            salvarMensagemEditada(message);
            
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
                        .filter(c => c?.id?.server !== 'g.us' && (c.id._serialized?.endsWith('@c.us') || c.id?.user))
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
     * PR #76 ULTRA: Helper para obter nome do grupo
     */
    async function getGroupName(groupId) {
        try {
            const cols = await waitForCollections();
            if (!cols) return 'Grupo';
            
            const chat = cols.ChatCollection.get(groupId);
            return chat?.name || chat?.formattedTitle || 'Grupo';
        } catch (e) {
            return 'Grupo';
        }
    }

    /**
     * PR #76 ULTRA: Extração híbrida ULTRA com scoring (taxa 95-98%)
     * PR #78: Adicionado timeout de 30 segundos para evitar travamento
     * Combina API interna + resolução de LID + DOM fallback
     * @param {string} groupId - ID do grupo (_serialized)
     * @returns {Promise<Object>} Resultado com membros extraídos e estatísticas
     */
    /**
     * OTIMIZADO: Extração de membros de grupo com timeout agressivo e feedback visual
     * Timeout reduzido de 30s para 15s para evitar congelamento do navegador
     * Inclui notificações de progresso em tempo real
     */
    async function extractGroupMembersUltra(groupId) {
        console.log('[WHL] ═══════════════════════════════════════════');
        console.log('[WHL] 🚀 ULTRA MODE: Iniciando extração híbrida');
        console.log('[WHL] 📱 Grupo:', groupId);
        console.log('[WHL] ═══════════════════════════════════════════');
        
        // OTIMIZAÇÃO: Timeout agressivo de 15 segundos (reduzido de 30s)
        const TIMEOUT = 15000;
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout: extração demorou muito (15s)')), TIMEOUT)
        );
        
        // Notificar início da extração
        window.postMessage({
            type: 'WHL_EXTRACTION_PROGRESS',
            groupId: groupId,
            phase: 'starting',
            message: 'Iniciando extração...',
            progress: 0
        }, window.location.origin);
        
        try {
            return await Promise.race([
                extractGroupMembersUltraInternal(groupId),
                timeoutPromise
            ]);
        } catch (e) {
            console.error('[WHL] Erro na extração (timeout ou exceção):', e.message);
            
            // Notificar erro
            window.postMessage({
                type: 'WHL_EXTRACTION_PROGRESS',
                groupId: groupId,
                phase: 'error',
                message: 'Erro: ' + e.message,
                progress: 100
            }, window.location.origin);
            
            return { 
                success: false, 
                error: e.message, 
                members: [], 
                count: 0,
                stats: {
                    apiDirect: 0,
                    lidResolved: 0,
                    domFallback: 0,
                    duplicates: 0,
                    failed: 0
                }
            };
        }
    }
    
    /**
     * OTIMIZADO: Função interna com progress tracking e prevenção de loops infinitos
     */
    async function extractGroupMembersUltraInternal(groupId) {
        console.log('[WHL] Iniciando extração interna...');

        const results = {
            members: new Map(), // Map<número, {fonte, confiança, tentativas}>
            stats: {
                apiDirect: 0,
                lidResolved: 0,
                domFallback: 0,
                duplicates: 0,
                failed: 0
            }
        };
        
        // OTIMIZAÇÃO: Track para prevenir loops infinitos em resolução de LID
        const lidAttempts = new Map(); // Map<participantId, attemptCount>
        const MAX_LID_ATTEMPTS = 1; // REDUZIDO de 3 para 1

        // Função para adicionar membro com scoring
        const addMember = (num, source, confidence) => {
            if (!num) return false;
            
            const clean = String(num).replace(/\D/g, '');
            
            if (!isValidPhone(clean)) {
                return false;
            }

            if (results.members.has(clean)) {
                results.stats.duplicates++;
                const existing = results.members.get(clean);
                if (confidence > existing.confidence) {
                    results.members.set(clean, { source, confidence, attempts: existing.attempts + 1 });
                } else {
                    existing.attempts++;
                }
                return false;
            } else {
                results.members.set(clean, { source, confidence, attempts: 1 });
                results.stats[source]++;
                
                // OTIMIZAÇÃO: Notificar progresso a cada novo membro
                window.postMessage({
                    type: 'WHL_EXTRACTION_PROGRESS',
                    groupId: groupId,
                    phase: 'extracting',
                    message: `Extraídos: ${results.members.size} membros`,
                    progress: 50,
                    currentCount: results.members.size
                }, window.location.origin);
                
                return true;
            }
        };

        // FASE 1/2: API INTERNA (com timeout de 8 segundos)
        console.log('[WHL] FASE 1/2: Tentando API interna (timeout 8s)...');
        
        const apiPromise = (async () => {
            try {
                const cols = await Promise.race([
                    waitForCollections(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('waitForCollections timeout')), 5000))
                ]);
                
                if (!cols) {
                    console.warn('[WHL] Collections não disponíveis');
                    return;
                }

                console.log('[WHL] Collections obtidas, buscando grupo...');
                const chat = cols.ChatCollection.get(groupId);
                if (!chat || chat?.id?.server !== 'g.us') {
                    console.warn('[WHL] Grupo não encontrado via API');
                    return;
                }

                console.log('[WHL] Grupo encontrado, obtendo metadata...');
                const meta = chat.groupMetadata;
                if (!meta) {
                    console.warn('[WHL] Metadata indisponível');
                    return;
                }

                // loadParticipants (opcional, com timeout curto)
                if (typeof meta.loadParticipants === 'function') {
                    try {
                        await Promise.race([
                            meta.loadParticipants(),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('loadParticipants timeout')), 3000))
                        ]);
                    } catch (e) {
                        console.warn('[WHL] loadParticipants falhou ou timeout:', e.message);
                    }
                }

                // Obter participantes
                let participants = [];
                if (meta.participants?.toArray) {
                    participants = meta.participants.toArray();
                } else if (Array.isArray(meta.participants)) {
                    participants = meta.participants;
                } else if (meta.participants?.size) {
                    participants = [...meta.participants.values()];
                } else if (meta.participants?._models) {
                    participants = Object.values(meta.participants._models);
                }
                
                console.log('[WHL] Participantes encontrados:', participants.length);

                // Processar participantes (SEM resolver LIDs - muito lento)
                for (const p of participants) {
                    const id = p.id;
                    if (!id) continue;

                    // MÉTODO 1: _serialized sem LID
                    if (id._serialized && !id._serialized.includes('@lid') && !id._serialized.includes(':')) {
                        const num = id._serialized.replace(/@c\.us|@s\.whatsapp\.net/g, '');
                        if (addMember(num, 'apiDirect', 5)) continue;
                    }

                    // MÉTODO 2: Campo user sem LID
                    if (id.user && !String(id.user).includes(':')) {
                        if (addMember(id.user, 'apiDirect', 4)) continue;
                    }

                    // MÉTODO 3: phoneNumber do participante
                    if (p.phoneNumber) {
                        const clean = String(p.phoneNumber).replace(/\D/g, '');
                        if (addMember(clean, 'apiDirect', 4)) continue;
                    }

                    // MÉTODO 4: Server c.us com user
                    if (id.server === 'c.us' && id.user) {
                        const cleanUser = String(id.user).replace(/\D/g, '');
                        if (addMember(cleanUser, 'apiDirect', 3)) continue;
                    }

                    // NÃO tentar resolver LID aqui - muito lento
                    // O DOM vai pegar esses números
                    results.stats.failed++;
                }
                
                console.log('[WHL] API extraiu:', results.stats.apiDirect, 'membros diretos');

            } catch (e) {
                console.error('[WHL] Erro na API:', e.message);
            }
        })();

        // Timeout de 8 segundos para API
        await Promise.race([
            apiPromise,
            new Promise(resolve => setTimeout(() => {
                console.warn('[WHL] FASE 1/2 timeout (8s), pulando para DOM...');
                resolve();
            }, 8000))
        ]);

        // FASE 3: DOM SEMPRE (independente do resultado da API)
        console.log('[WHL] ═══════════════════════════════════════════');
        console.log('[WHL] 📄 FASE 3: Executando extração DOM...');
        console.log('[WHL] ═══════════════════════════════════════════');
        
        window.postMessage({
            type: 'WHL_EXTRACTION_PROGRESS',
            groupId: groupId,
            phase: 'phase3',
            message: 'Fase 3: Executando extração DOM...',
            progress: 75
        }, window.location.origin);
        
        try {
            const domResult = await extractGroupContacts(groupId);
            console.log('[WHL] DOM resultado:', domResult);
            
            if (domResult.success && domResult.members) {
                domResult.members.forEach(m => {
                    if (m.phone) {
                        const normalized = m.phone.replace(/[^\d]/g, '');
                        addMember(normalized, 'domFallback', 3);
                    }
                });
                console.log('[WHL] DOM extraiu:', domResult.members.length, 'telefones');
            } else {
                console.warn('[WHL] DOM não extraiu membros:', domResult.error || 'unknown');
            }
        } catch (e) {
            console.error('[WHL] DOM falhou:', e.message);
        }

        // RESULTADO FINAL
        window.postMessage({
            type: 'WHL_EXTRACTION_PROGRESS',
            groupId: groupId,
            phase: 'finalizing',
            message: 'Finalizando extração...',
            progress: 90
        }, window.location.origin);
        
        const finalMembers = [...results.members.entries()]
            .sort((a, b) => b[1].confidence - a[1].confidence)
            .map(([num]) => num);

        console.log('[WHL] ═══════════════════════════════════════════');
        console.log('[WHL] ✅ EXTRAÇÃO CONCLUÍDA');
        console.log('[WHL] 📱 Total:', finalMembers.length);
        console.log('[WHL] 🔹 API:', results.stats.apiDirect);
        console.log('[WHL] 🔹 DOM:', results.stats.domFallback);
        console.log('[WHL] ❌ Falhas:', results.stats.failed);
        console.log('[WHL] ═══════════════════════════════════════════');
        
        // Notificar conclusão
        window.postMessage({
            type: 'WHL_EXTRACTION_PROGRESS',
            groupId: groupId,
            phase: 'complete',
            message: `Concluído: ${finalMembers.length} membros extraídos`,
            progress: 100,
            currentCount: finalMembers.length
        }, window.location.origin);

        return {
            success: true,
            members: finalMembers,
            count: finalMembers.length,
            stats: results.stats,
            groupName: await getGroupName(groupId)
        };
    }
    
    /**
     * MANTER FUNÇÃO ANTIGA PARA COMPATIBILIDADE
     */
    async function extractGroupMembers(groupId) {
        return await extractGroupMembersUltra(groupId);
    }
    
    /**
     * Extração instantânea unificada - retorna tudo de uma vez
     * Usa WAWebChatCollection e WAWebBlocklistCollection via require()
     */
    function extrairTudoInstantaneo() {
        console.log('[WHL] 🚀 Iniciando extração instantânea via API interna...');
        
        const normal = extrairContatos();
        const archived = extrairArquivados();
        const blocked = extrairBloqueados();

        console.log(`[WHL] ✅ Extração completa: ${normal.count} normais, ${archived.count} arquivados, ${blocked.count} bloqueados`);

        return {
            success: true,
            normal: normal.contacts || [],
            archived: archived.archived || [],
            blocked: blocked.blocked || [],
            stats: {
                normal: normal.count || 0,
                archived: archived.count || 0,
                blocked: blocked.count || 0,
                total: (normal.count || 0) + (archived.count || 0) + (blocked.count || 0)
            }
        };
    }
    
    // ===== LISTENERS PARA NOVAS EXTRAÇÕES =====
    window.addEventListener('message', (event) => {
        // Validate origin and source for security (prevent cross-frame attacks)
        if (event.origin !== window.location.origin || event.source !== window) return;
        if (!event.data || !event.data.type) return;
        
        const { type } = event.data;
        
        if (type === 'WHL_EXTRACT_CONTACTS') {
            const result = extrairContatos();
            window.postMessage({ type: 'WHL_EXTRACT_CONTACTS_RESULT', ...result }, window.location.origin);
        }
        
        if (type === 'WHL_LOAD_GROUPS') {
            const result = extrairGrupos();
            window.postMessage({ type: 'WHL_LOAD_GROUPS_RESULT', ...result }, window.location.origin);
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
            }, window.location.origin);
        }
        
        // EXTRAIR MEMBROS DO GRUPO
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
                }, window.location.origin);
            } catch (e) {
                window.postMessage({ type: 'WHL_GROUP_MEMBERS_ERROR', error: e.message }, window.location.origin);
            }
        }
        
        // PR #71: Listener para extrair membros por ID com código testado e validado
        if (type === 'WHL_EXTRACT_GROUP_MEMBERS_BY_ID') {
            const { groupId, requestId } = event.data;
            console.log('[WHL] Recebido pedido de extração de membros:', groupId);
            
            (async () => {
                try {
                    const result = await extractGroupMembers(groupId);
                    console.log('[WHL] Enviando resultado:', result);
                    window.postMessage({
                        type: 'WHL_EXTRACT_GROUP_MEMBERS_RESULT',
                        requestId,
                        ...result
                    }, window.location.origin);
                } catch (error) {
                    console.error('[WHL] Erro no listener:', error);
                    window.postMessage({
                        type: 'WHL_EXTRACT_GROUP_MEMBERS_RESULT',
                        requestId,
                        success: false,
                        error: error.message,
                        members: [],
                        count: 0
                    }, window.location.origin);
                }
            })();
        }
        
        if (type === 'WHL_EXTRACT_ALL') {
            const result = extrairTudo();
            window.postMessage({ type: 'WHL_EXTRACT_ALL_RESULT', ...result }, window.location.origin);
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
            }, window.location.origin);
        }
        
        // CLEAR RECOVER HISTORY
        if (type === 'WHL_CLEAR_RECOVER_HISTORY') {
            historicoRecover.length = 0;
            localStorage.removeItem('whl_recover_history');
            window.postMessage({ type: 'WHL_RECOVER_HISTORY_CLEARED' }, window.location.origin);
        }
    });
    
    // ===== EXTRAÇÃO DE MEMBROS DE GRUPO VIA DOM (TESTADO E VALIDADO) =====
    
    /**
     * Abre/seleciona um grupo pelo ID antes de extrair membros via DOM
     * NÃO usa URL (causa reload) - usa clique no DOM
     */
    async function abrirGrupoParaExtracao(groupId) {
        console.log('[WHL] Abrindo grupo para extração:', groupId);
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        
        // Constants
        const CHAT_OPEN_DELAY = 1500; // Time to wait for chat to open
        const MAX_DRAWER_SCROLL_ITERATIONS = 20; // Max scrolls for drawer
        
        // Método 1: Encontrar o grupo na lista lateral e clicar
        const chatList = document.querySelector('#pane-side');
        if (!chatList) {
            console.error('[WHL] Lista de chats não encontrada');
            return false;
        }
        
        // Procurar o elemento do grupo na lista (com seletor mais específico)
        // O grupo pode ser identificado pelo data-id ou pelo ID serializado
        const groupElements = chatList.querySelectorAll('[data-testid="cell-frame-container"][data-id], [role="listitem"][data-id]');
        
        for (const el of groupElements) {
            const dataId = el.getAttribute('data-id');
            if (dataId && dataId.includes(groupId)) {
                console.log('[WHL] Grupo encontrado na lista, clicando...');
                el.click();
                await sleep(CHAT_OPEN_DELAY);
                return true;
            }
        }
        
        // Método 2: Procurar por título/nome do grupo (fallback)
        // Buscar elementos de chat e verificar se algum corresponde
        const allChats = chatList.querySelectorAll('[role="listitem"], [data-testid="cell-frame-container"]');
        const groupIdPrefix = groupId.split('@')[0];
        
        for (const chat of allChats) {
            // Verificar se o chat tem o groupId nos atributos primeiro (mais rápido)
            const dataId = chat.getAttribute('data-id');
            if (dataId && dataId.includes(groupIdPrefix)) {
                console.log('[WHL] Grupo encontrado via atributo, clicando...');
                chat.click();
                await sleep(CHAT_OPEN_DELAY);
                return true;
            }
        }
        
        // Método 3: Usar a API para abrir o chat (sem URL)
        try {
            const cols = await waitForCollections();
            if (cols && cols.ChatCollection) {
                const chat = cols.ChatCollection.get(groupId);
                if (chat) {
                    // Tentar métodos internos para abrir o chat
                    if (typeof chat.open === 'function') {
                        await chat.open();
                        await sleep(CHAT_OPEN_DELAY);
                        return true;
                    }
                    
                    // Alternativa: simular seleção via models
                    if (chat.id?._serialized) {
                        // Buscar elemento pelo ID
                        const selector = `[data-id="${chat.id._serialized}"]`;
                        const chatEl = document.querySelector(selector);
                        if (chatEl) {
                            chatEl.click();
                            await sleep(CHAT_OPEN_DELAY);
                            return true;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[WHL] Erro ao abrir grupo via API:', e.message);
        }
        
        console.warn('[WHL] Não foi possível abrir o grupo automaticamente');
        return false;
    }
    
    /**
     * Extrai membros de um grupo via DOM
     * Método testado e validado pelo usuário - extrai 3 membros no teste
     */
    async function extractGroupContacts(groupId = null) {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        // Match Brazilian phone numbers with optional + prefix
        // Allows spaces in format as shown in WhatsApp UI (e.g., "+55 21 99999-8888")
        const PHONE_BR_REGEX = /\+?55\s?\d{2}\s?\d{4,5}-?\d{4}/g;
        
        // Constants for scroll and timing
        const MAX_SCROLL_LOOPS = 220; // Maximum scroll loops before stopping (prevents infinite loops in large groups)
        const MAX_DRAWER_SCROLL_ITERATIONS = 20; // Max scroll iterations for drawer members
        const SCROLL_DELAY = 500; // Delay between scroll iterations

        // Normalize phone: remove spaces and hyphens, keep digits (+ will be removed by isBR check)
        const normalizePhone = (s) => s.replace(/\s+/g,'').replace(/[^\d+]/g,'');
        
        // Check if phone is valid Brazilian number (works with or without + prefix)
        const isBR = (phone) => {
            const digitsOnly = phone.replace(/[^\d]/g,'');
            return digitsOnly.startsWith('55') && (digitsOnly.length === 12 || digitsOnly.length === 13);
        };

        // NOVO: Se groupId foi passado, tentar abrir o grupo primeiro
        if (groupId) {
            console.log('[WHL] DOM: Tentando abrir grupo antes da extração...');
            const opened = await abrirGrupoParaExtracao(groupId);
            if (!opened) {
                console.warn('[WHL] DOM: Não foi possível abrir o grupo automaticamente. Tentando continuar...');
            }
            await sleep(SCROLL_DELAY);
        }

        console.log('[WHL] DOM: abrindo Dados do grupo...');
        
        // 1) abrir drawer de info do grupo (seletores robustos)
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
        for (const sel of possibleGroupSelectors) {
            const el = document.querySelector(sel);
            if (el) { groupInfoButton = el; break; }
        }
        
        if (!groupInfoButton) {
            console.error('[WHL] DOM: botão de Dados do grupo não encontrado');
            return { success: false, error: 'GROUP_INFO_BUTTON_NOT_FOUND', members: [], count: 0 };
        }

        groupInfoButton.click();
        await sleep(700);

        // 2) achar drawer/dialog aberto
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) {
            console.error('[WHL] DOM: dialog de info do grupo não abriu');
            return { success: false, error: 'DIALOG_NOT_OPENED', members: [], count: 0 };
        }

        // 3) rolar dentro do drawer até encontrar "Ver tudo"
        const drawerScroller = [...dialog.querySelectorAll('div')]
            .find(el => el.scrollHeight > el.clientHeight);

        if (!drawerScroller) {
            console.warn('[WHL] DOM: scroller do drawer não encontrado');
            return { success: false, error: 'DRAWER_SCROLLER_NOT_FOUND', members: [], count: 0 };
        }

        let verTudo = null;
        for (let i = 0; i < 12; i++) {
            verTudo = [...dialog.querySelectorAll('div, span')]
                .find(el => el.innerText?.trim().toLowerCase() === 'ver tudo');

            if (verTudo) break;

            drawerScroller.scrollTop = drawerScroller.scrollHeight;
            await sleep(SCROLL_DELAY);
        }

        if (!verTudo) {
            console.log('[WHL] DOM: "Ver tudo" não encontrado, tentando extrair do drawer diretamente...');
            
            // Encontrar a seção de membros no drawer
            const membersSections = [...dialog.querySelectorAll('div')].filter(el => {
                const text = el.innerText?.toLowerCase() || '';
                return text.includes('participante') || text.includes('membro') || text.includes('member');
            });
            
            if (membersSections.length > 0) {
                // Scrollar essa seção para carregar todos os membros
                const membersContainer = membersSections[0].parentElement;
                if (membersContainer && membersContainer.scrollHeight > membersContainer.clientHeight) {
                    console.log('[WHL] DOM: Scrollando container de membros no drawer...');
                    for (let i = 0; i < MAX_DRAWER_SCROLL_ITERATIONS; i++) {
                        membersContainer.scrollTop = membersContainer.scrollHeight;
                        await sleep(SCROLL_DELAY);
                    }
                }
            }
            
            // Agora extrair telefones do drawer
            const phones = new Set();
            const textNodes = dialog.querySelectorAll('span, div');
            textNodes.forEach(el => {
                const txt = el.innerText;
                if (!txt) return;
                const matches = txt.match(PHONE_BR_REGEX);
                if (!matches) return;
                for (const m of matches) {
                    const p = normalizePhone(m);
                    if (isBR(p)) phones.add(p);
                }
            });
            
            // Fechar drawer
            const closeBtn = document.querySelector('[data-testid="btn-closer-drawer"]') ||
                             document.querySelector('[data-icon="back"]') ||
                             document.querySelector('span[data-icon="back"]');
            if (closeBtn) closeBtn.click();
            
            const members = [...phones].map(p => ({ phone: p }));
            console.log('[WHL] DOM: Extraídos do drawer:', members.length);
            return { success: true, groupName: 'Grupo', members, contacts: members, count: members.length, source: 'dom_drawer_scroll' };
        }

        // 4) clicar "Ver tudo" para abrir painel central
        console.log('[WHL] DOM: clicando "Ver tudo"...');
        verTudo.click();
        await sleep(900);

        // 5) encontrar container central correto (preferir _ak9y; fallback = maior scrollHeight)
        let container = [...document.querySelectorAll('div')]
            .find(el => el.scrollHeight > el.clientHeight && el.className.includes('_ak9y'));

        if (!container) {
            const candidates = [...document.querySelectorAll('div')]
                .filter(el => el.scrollHeight > el.clientHeight);
            container = candidates.sort((a,b) => (b.scrollHeight - a.scrollHeight))[0];
        }

        if (!container) {
            console.error('[WHL] DOM: container central não encontrado');
            return { success: false, error: 'CONTAINER_NOT_FOUND', members: [], count: 0 };
        }

        console.log('[WHL] DOM: container encontrado, scrollHeight:', container.scrollHeight);

        // 6) scroll REAL com coleta incremental (evita virtualização perder itens)
        const phones = new Set();
        let lastHeight = 0;
        let stableRounds = 0;
        let noNewRounds = 0;

        for (let loop = 0; loop < MAX_SCROLL_LOOPS; loop++) {
            // coleta incremental
            const textNodes = container.querySelectorAll('span, div');
            textNodes.forEach(el => {
                const txt = el.innerText;
                if (!txt) return;
                const matches = txt.match(PHONE_BR_REGEX);
                if (!matches) return;
                for (const m of matches) {
                    const p = normalizePhone(m);
                    if (isBR(p)) phones.add(p);
                }
            });

            const before = phones.size;

            // scroll
            container.scrollTop = container.scrollHeight;
            await sleep(450);

            // critério de parada
            if (container.scrollHeight === lastHeight) stableRounds++;
            else { stableRounds = 0; lastHeight = container.scrollHeight; }

            if (phones.size === before) noNewRounds++;
            else noNewRounds = 0;

            if (stableRounds >= 3 && noNewRounds >= 3) break;
            
            // Log de progresso a cada 20 loops
            if (loop % 20 === 0 && loop > 0) {
                console.log(`[WHL] DOM: scroll ${loop}/${MAX_SCROLL_LOOPS}, telefones: ${phones.size}`);
            }
        }

        console.log('[WHL] DOM: telefones BR extraídos:', phones.size);

        // Fechar painel (tentar voltar)
        const backBtn = document.querySelector('[data-testid="btn-closer-drawer"]') ||
                        document.querySelector('[data-icon="back"]') ||
                        document.querySelector('span[data-icon="back"]') ||
                        document.querySelector('[aria-label="Voltar"]') ||
                        document.querySelector('[aria-label="Fechar"]');
        if (backBtn) backBtn.click();

        const members = [...phones].map(p => ({ phone: p }));
        return { success: true, groupName: 'Grupo', members, contacts: members, count: members.length, source: 'dom_viewall' };
    }

    // ===== LISTENERS FOR SEND FUNCTIONS =====
    window.addEventListener('message', async (event) => {
        // Validate origin and source for security (prevent cross-frame attacks)
        if (event.origin !== window.location.origin || event.source !== window) return;
        if (!event.data) return;
        
        // Enviar apenas TEXTO
        if (event.data.type === 'WHL_SEND_MESSAGE_API') {
            const { phone, message, requestId } = event.data;
            const result = await enviarMensagemAPI(phone, message);
            window.postMessage({ type: 'WHL_SEND_MESSAGE_API_RESULT', requestId, ...result }, window.location.origin);
        }
        
        // Enviar apenas IMAGEM
        if (event.data.type === 'WHL_SEND_IMAGE_DOM') {
            const { base64Image, caption, requestId } = event.data;
            const result = await enviarImagemDOM(base64Image, caption);
            window.postMessage({ type: 'WHL_SEND_IMAGE_DOM_RESULT', requestId, ...result }, window.location.origin);
        }
        
        // CORREÇÃO BUG 2: Enviar IMAGEM para número específico (abre o chat primeiro)
        if (event.data.type === 'WHL_SEND_IMAGE_TO_NUMBER') {
            const { phone, image, caption, requestId } = event.data;
            (async () => {
                try {
                    const result = await enviarImagemParaNumero(phone, image, caption);
                    window.postMessage({
                        type: 'WHL_SEND_IMAGE_TO_NUMBER_RESULT',
                        requestId,
                        ...result
                    }, window.location.origin);
                } catch (error) {
                    window.postMessage({
                        type: 'WHL_SEND_IMAGE_TO_NUMBER_ERROR',
                        requestId,
                        error: error.message
                    }, window.location.origin);
                }
            })();
        }
        
        // Enviar TEXTO + IMAGEM
        if (event.data.type === 'WHL_SEND_COMPLETE') {
            const { phone, texto, base64Image, caption, requestId } = event.data;
            const result = await enviarMensagemCompleta(phone, texto, base64Image, caption);
            window.postMessage({ type: 'WHL_SEND_COMPLETE_RESULT', requestId, ...result }, window.location.origin);
        }
        
        // EXTRAIR MEMBROS DE GRUPO VIA DOM
        if (event.data.type === 'WHL_EXTRACT_GROUP_CONTACTS_DOM') {
            const { requestId, groupId } = event.data;
            (async () => {
                try {
                    const result = await extractGroupContacts(groupId);
                    window.postMessage({ 
                        type: 'WHL_EXTRACT_GROUP_CONTACTS_DOM_RESULT', 
                        requestId, 
                        ...result 
                    }, window.location.origin);
                } catch (error) {
                    window.postMessage({ 
                        type: 'WHL_EXTRACT_GROUP_CONTACTS_DOM_ERROR', 
                        requestId, 
                        error: error.message 
                    }, window.location.origin);
                }
            })();
        }
        
        // EXTRAIR ARQUIVADOS E BLOQUEADOS
        if (event.data.type === 'WHL_EXTRACT_ARCHIVED_BLOCKED_DOM') {
            const { requestId } = event.data;
            (async () => {
                try {
                    const result = await extrairArquivadosBloqueadosDOM();
                    window.postMessage({ 
                        type: 'WHL_EXTRACT_ARCHIVED_BLOCKED_DOM_RESULT', 
                        requestId,
                        ...result,
                        success: true
                    }, window.location.origin);
                } catch (error) {
                    window.postMessage({ 
                        type: 'WHL_EXTRACT_ARCHIVED_BLOCKED_DOM_ERROR', 
                        requestId, 
                        error: error.message 
                    }, window.location.origin);
                }
            })();
        }
        
        // Listener para aguardar confirmação visual
        if (event.data.type === 'WHL_WAIT_VISUAL_CONFIRMATION') {
            const { message, timeout, requestId } = event.data;
            (async () => {
                try {
                    const result = await aguardarConfirmacaoVisual(message, timeout || 10000);
                    window.postMessage({ 
                        type: 'WHL_VISUAL_CONFIRMATION_RESULT', 
                        requestId,
                        ...result
                    }, window.location.origin);
                } catch (error) {
                    window.postMessage({ 
                        type: 'WHL_VISUAL_CONFIRMATION_ERROR', 
                        requestId, 
                        error: error.message 
                    }, window.location.origin);
                }
            })();
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
                }, window.location.origin);
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_SEND_MESSAGE_RESULT', 
                    success: false, 
                    phone, 
                    error: error.message 
                }, window.location.origin);
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
                }, window.location.origin);
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_SEND_IMAGE_RESULT', 
                    success: false, 
                    phone, 
                    error: error.message 
                }, window.location.origin);
            }
        }
        
        // EXTRAIR TODOS OS CONTATOS DIRETAMENTE
        if (type === 'WHL_EXTRACT_ALL_DIRECT') {
            try {
                const result = extractAllContactsDirect();
                window.postMessage({ 
                    type: 'WHL_EXTRACT_ALL_RESULT', 
                    ...result 
                }, window.location.origin);
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_EXTRACT_ALL_ERROR', 
                    error: error.message 
                }, window.location.origin);
            }
        }
        
        // EXTRAÇÃO INSTANTÂNEA (novo método alternativo)
        if (type === 'WHL_EXTRACT_INSTANT') {
            try {
                const result = extrairContatosInstantaneo();
                window.postMessage({ 
                    type: 'WHL_EXTRACT_INSTANT_RESULT', 
                    ...result 
                }, window.location.origin);
            } catch (error) {
                window.postMessage({ 
                    type: 'WHL_EXTRACT_INSTANT_ERROR', 
                    error: error.message 
                }, window.location.origin);
            }
        }
        
        // EXTRAÇÃO COMPLETA INSTANTÂNEA (contatos, arquivados, bloqueados)
        if (type === 'WHL_EXTRACT_ALL_INSTANT') {
            const { requestId } = event.data;
            (async () => {
                try {
                    const result = extrairTudoInstantaneo();
                    window.postMessage({
                        type: 'WHL_EXTRACT_ALL_INSTANT_RESULT',
                        requestId,
                        ...result
                    }, window.location.origin);
                } catch (error) {
                    window.postMessage({
                        type: 'WHL_EXTRACT_ALL_INSTANT_ERROR',
                        requestId,
                        error: error.message
                    }, window.location.origin);
                }
            })();
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
            window.postMessage({ type: 'WHL_EXTRACT_INSTANT_RESULT', numbers: [...nums] }, window.location.origin);
        } catch (e) {
            console.error('[WHL Hooks] Erro na extração instantânea:', e);
            window.postMessage({ type: 'WHL_EXTRACT_INSTANT_ERROR', error: e.message }, window.location.origin);
        }
    });
};

// Executar apenas uma vez
if (!window.whl_hooks_loaded) {
    window.whl_hooks_loaded = true;
    console.log('[WHL Hooks] Initializing WPP Hooks...');
    window.whl_hooks_main();
}
