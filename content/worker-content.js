/**
 * WhatsHybrid Lite - Worker Content Script
 * 
 * This script runs ONLY in the hidden worker tab to handle message sending via URL navigation.
 * It does NOT show UI and is dedicated to message sending operations.
 */

(function() {
    'use strict';
    
    // ===== UTILITY FUNCTIONS =====
    
    // ===== ENVIO VIA INPUT (SEM RELOAD) =====
    async function sendMessageViaInput(text) {
        // Encontrar input de mensagem
        const input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                      document.querySelector('footer [contenteditable="true"]') ||
                      document.querySelector('[contenteditable="true"][data-tab="10"]');
        
        if (!input) {
            return { success: false, error: 'INPUT_NOT_FOUND' };
        }
        
        try {
            // Limpar e focar
            input.innerHTML = '';
            input.focus();
            
            // Inserir texto
            // Note: Using execCommand despite deprecation warning because it's the only method
            // that reliably triggers WhatsApp Web's internal message handlers during testing
            document.execCommand('insertText', false, text);
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
            
            // Aguardar um momento para o texto ser processado
            await new Promise(r => setTimeout(r, 300));
            
            // Simular Enter para enviar
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            });
            input.dispatchEvent(enterEvent);
            
            // Aguardar envio processar
            await new Promise(r => setTimeout(r, 1000));
            
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ===== ABRIR CHAT VIA URL =====
    async function openChatViaURL(phone) {
        console.warn('[WHL Worker] openChatViaURL: window.location.href navigation disabled - use API method instead');
        return { success: false, error: 'URL_NAVIGATION_DISABLED' };
    }

    // ===== HANDLER PRINCIPAL DE ENVIO =====
    async function handleSendMessage(phone, text, imageData = null) {
        console.log('[WHL Worker] Iniciando envio para:', phone);
        
        // Verificar se já está no chat correto
        const currentUrl = window.location.href;
        const isInCorrectChat = currentUrl.includes(phone) || 
                                document.querySelector(`[data-id="${phone}@c.us"]`);
        
        if (!isInCorrectChat) {
            // Abrir chat via URL
            console.log('[WHL Worker] Abrindo chat via URL...');
            const openResult = await openChatViaURL(phone);
            
            if (!openResult.success) {
                return openResult;
            }
        }
        
        // Tentar enviar via Input
        console.log('[WHL Worker] Enviando via Input + Enter...');
        const sendResult = await sendMessageViaInput(text);
        
        if (sendResult.success) {
            console.log('[WHL Worker] ✅ Mensagem enviada com sucesso!');
        } else {
            console.log('[WHL Worker] ❌ Falha no envio:', sendResult.error);
        }
        
        return sendResult;
    }
    
    // ===== UTILITY FUNCTIONS (LEGACY) =====
    
    // Clica em botão por texto
    function clickByText(needles) {
      const lc = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
      const match = el => needles.some(n => lc(el.textContent || '').includes(lc(n)));
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, span'));
      const hit = candidates.find(match);
      if (hit) { 
        hit.click(); 
        return true; 
      }
      return false;
    }

    // Resolver intersticiais (Usar aqui, Continuar, etc.)
    async function resolveInterstitialsCycle(maxMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        // "Usar aqui / Use here"
        if (clickByText(['usar aqui', 'use here', 'utilizar aqui'])) return true;

        // "Continuar / Continue to chat"
        if (clickByText(['continuar', 'continue', 'continuar para a conversa', 'continue to chat'])) return true;

        // "Manter mensagem / Keep"
        if (clickByText(['manter', 'keep'])) return true;

        // Banner de "abrindo em outra guia"
        const banner = document.body.innerText || '';
        if (/outra guia|outra aba|another tab|another window/i.test(banner)) {
          if (clickByText(['usar aqui', 'use here'])) return true;
        }

        await new Promise(r => setTimeout(r, 300));
      }
      return false;
    }
    
    // Check if this is the worker tab
    const urlParams = new URLSearchParams(window.location.search);
    const isWorkerTab = urlParams.has('whl_worker') || 
                        window.location.href.includes('whl_worker=true');
    
    if (!isWorkerTab) {
        // Check via storage if this tab is the worker
        chrome.runtime.sendMessage({ action: 'CHECK_IF_WORKER' }, (response) => {
            if (!response?.isWorker) return;
            initWorker();
        });
        return;
    }
    
    initWorker();
    
    function initWorker() {
        console.log('[WHL Worker] Initializing hidden worker tab...');
        
        // Set up interval to check for multi-device popup every 1 second
        const popupCheckInterval = setInterval(() => {
            handleMultiDevicePopup();
        }, 1000);
        
        // Wait for WhatsApp to load
        waitForWhatsAppReady().then(() => {
            console.log('[WHL Worker] WhatsApp ready, waiting for commands...');
            chrome.runtime.sendMessage({ action: 'WORKER_READY' });
        }).catch((error) => {
            console.error('[WHL Worker] Error waiting for WhatsApp:', error);
            chrome.runtime.sendMessage({ 
                action: 'WORKER_ERROR', 
                error: error.message 
            });
        });
        
        // Listener for commands from background
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'SEND_MESSAGE_URL') {
                handleSendMessage(message.phone, message.text, message.imageData)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true; // Async response
            }
            
            if (message.action === 'PING') {
                sendResponse({ pong: true, ready: isWhatsAppReady() });
                return true;
            }
            
            if (message.action === 'STOP_WORKER') {
                clearInterval(popupCheckInterval);
                sendResponse({ success: true });
                return true;
            }
        });
    }
    
    /**
     * Detect and handle multi-device popup "Use here"
     * WhatsApp shows this when detecting multiple tabs open
     */
    function handleMultiDevicePopup() {
        // Detect popup "WhatsApp is open in another window"
        const useHereButton = document.querySelector('[data-testid="popup-controls-ok"]') ||
            document.querySelector('[data-testid="btn-use-here"]') ||
            Array.from(document.querySelectorAll('div[role="button"]'))
                .find(btn => {
                    const text = btn.textContent || '';
                    return text.includes('Usar aqui') || 
                           text.includes('Use here') ||
                           text.includes('usar aqui') ||
                           text.includes('use here');
                });
        
        if (useHereButton) {
            console.log('[WHL Worker] Popup detectado, clicando em "Usar aqui"...');
            useHereButton.click();
            return true;
        }
        return false;
    }
    
    function waitForWhatsAppReady(maxWait = 30000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const check = () => {
                // Check and handle multi-device popup
                handleMultiDevicePopup();
                
                // Check if WhatsApp loaded
                const chatList = document.querySelector('[data-testid="chat-list"]') ||
                                 document.querySelector('#pane-side') ||
                                 document.querySelector('[data-testid="default-user"]');
                
                // Check for error popup or QR code
                const qrCode = document.querySelector('[data-testid="qrcode"]') ||
                              document.querySelector('canvas[aria-label]');
                
                if (qrCode) {
                    // QR Code visible - needs scanning
                    chrome.runtime.sendMessage({ 
                        action: 'WORKER_STATUS', 
                        status: 'QR_CODE_REQUIRED' 
                    });
                    // Continue waiting
                }
                
                if (chatList) {
                    resolve(true);
                    return;
                }
                
                if (Date.now() - startTime > maxWait) {
                    reject(new Error('Timeout waiting for WhatsApp'));
                    return;
                }
                
                setTimeout(check, 500);
            };
            
            check();
        });
    }
    
    function isWhatsAppReady() {
        return !!(document.querySelector('[data-testid="chat-list"]') ||
                  document.querySelector('#pane-side'));
    }
    
    async function waitForChatOpen(phone, timeout = 30000) {
        const start = Date.now();
        
        return new Promise((resolve) => {
            const tick = async () => {
                // Tenta resolver intersticiais primeiro
                await resolveInterstitialsCycle(1200);

                // Caixa de mensagem pronta?
                const input = document.querySelector('[data-testid="conversation-compose-box-input"]')
                    || document.querySelector('[contenteditable="true"][data-tab="10"]')
                    || document.querySelector('footer [contenteditable="true"]');
                
                if (input) {
                    return resolve({ success: true });
                }

                // QR visível?
                const qr = document.querySelector('[data-testid="qrcode"], canvas[aria-label]');
                if (qr) {
                    return resolve({ success: false, error: 'QR_CODE_REQUIRED' });
                }

                // Popup de número inválido
                const popupText = (document.querySelector('[data-testid="popup"]')?.textContent || '').toLowerCase();
                if (/(inválido|invalid|não existe|does not exist)/.test(popupText)) {
                    return resolve({ success: false, error: 'INVALID_NUMBER' });
                }

                // Timeout?
                if (Date.now() - start > timeout) {
                    return resolve({ success: false, error: 'OPEN_CHAT_TIMEOUT' });
                }

                setTimeout(tick, 350);
            };
            
            tick();
        });
    }
    
    async function attachImage(imageData) {
        try {
            // Find attach button
            const attachButton = document.querySelector('[data-testid="attach-menu"]') ||
                                document.querySelector('[data-testid="clip"]') ||
                                document.querySelector('[title="Anexar"]');
            
            if (!attachButton) {
                return { success: false, error: 'Attach button not found' };
            }
            
            attachButton.click();
            await new Promise(r => setTimeout(r, 300));
            
            // Find image input
            const imageInput = document.querySelector('input[accept*="image"]') ||
                              document.querySelector('input[type="file"]');
            
            if (!imageInput) {
                return { success: false, error: 'Image input not found' };
            }
            
            // Convert dataURL to File
            const response = await fetch(imageData);
            const blob = await response.blob();
            const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
            
            // Create DataTransfer to simulate file selection
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            imageInput.files = dataTransfer.files;
            
            // Trigger change event
            imageInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Wait for preview to appear
            await new Promise(r => setTimeout(r, 1500));
            
            return { success: true };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    function clickSendButton() {
        return new Promise((resolve) => {
            const maxAttempts = 20;
            let attempts = 0;
            
            const tryClick = () => {
                // Look for send button
                const sendButton = document.querySelector('[data-testid="send"]') ||
                                  document.querySelector('[aria-label="Enviar"]') ||
                                  document.querySelector('[aria-label="Send"]') ||
                                  document.querySelector('button[aria-label*="nviar"]') ||
                                  document.querySelector('span[data-icon="send"]')?.closest('button');
                
                if (sendButton) {
                    sendButton.click();
                    resolve({ success: true });
                    return;
                }
                
                attempts++;
                if (attempts >= maxAttempts) {
                    resolve({ success: false, error: 'Send button not found' });
                    return;
                }
                
                setTimeout(tryClick, 300);
            };
            
            tryClick();
        });
    }
    
    // Listener para mensagens do background (quando rodando na aba principal)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'SEND_MESSAGE_URL') {
            handleSendMessage(request.phone, request.text, request.imageData)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // Indica resposta assíncrona
        }
    });
    
})();
