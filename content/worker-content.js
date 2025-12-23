/**
 * WhatsHybrid Lite - Worker Content Script
 * 
 * This script runs ONLY in the hidden worker tab to handle message sending via URL navigation.
 * It does NOT show UI and is dedicated to message sending operations.
 */

(function() {
    'use strict';
    
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
    
    async function handleSendMessage(phone, text, imageData = null) {
        console.log(`[WHL Worker] Sending to ${phone}...`);
        
        try {
            // Check and handle multi-device popup before sending
            handleMultiDevicePopup();
            
            // Navigate to send URL
            const encodedText = encodeURIComponent(text);
            const sendUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodedText}`;
            
            // Navigate
            window.location.href = sendUrl;
            
            // Wait for chat to open
            const chatOpened = await waitForChatOpen(phone, 15000);
            
            if (!chatOpened.success) {
                return { success: false, error: chatOpened.error, phone };
            }
            
            // If there's an image, attach it
            if (imageData) {
                const imageAttached = await attachImage(imageData);
                if (!imageAttached.success) {
                    return { success: false, error: 'Failed to attach image', phone };
                }
            }
            
            // Click send button
            const sent = await clickSendButton();
            
            if (!sent.success) {
                return { success: false, error: sent.error, phone };
            }
            
            // Wait for send confirmation
            await new Promise(r => setTimeout(r, 1000));
            
            console.log(`[WHL Worker] ✅ Sent to ${phone}`);
            return { success: true, phone };
            
        } catch (error) {
            console.error(`[WHL Worker] ❌ Error sending to ${phone}:`, error);
            return { success: false, error: error.message, phone };
        }
    }
    
    function waitForChatOpen(phone, timeout = 15000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const check = () => {
                // Check if chat opened
                const messageInput = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                                    document.querySelector('[contenteditable="true"][data-tab="10"]') ||
                                    document.querySelector('footer [contenteditable="true"]');
                
                // Check for error popup "Invalid number"
                const errorPopup = document.querySelector('[data-testid="popup"]');
                const errorText = errorPopup?.textContent || '';
                
                if (errorText.includes('inválido') || 
                    errorText.includes('invalid') ||
                    errorText.includes('não existe') ||
                    errorText.includes('does not exist')) {
                    resolve({ success: false, error: 'Invalid number or no WhatsApp' });
                    return;
                }
                
                // Check if need to click "Continue to chat"
                const continueButton = Array.from(document.querySelectorAll('div[role="button"]'))
                    .find(btn => btn.textContent.includes('Continuar') || 
                                 btn.textContent.includes('Continue'));
                
                if (continueButton) {
                    continueButton.click();
                    setTimeout(check, 500);
                    return;
                }
                
                if (messageInput) {
                    resolve({ success: true });
                    return;
                }
                
                if (Date.now() - startTime > timeout) {
                    resolve({ success: false, error: 'Timeout waiting for chat to open' });
                    return;
                }
                
                setTimeout(check, 300);
            };
            
            check();
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
    
})();
