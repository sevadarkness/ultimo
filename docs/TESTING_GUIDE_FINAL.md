# 🧪 TESTING GUIDE - Contact Extractor & Image Sending

## ✅ Pre-Testing Validation Complete
- ✅ JavaScript syntax validated
- ✅ Code review completed (6 minor nitpicks addressed)
- ✅ Security scan passed (0 vulnerabilities)
- ✅ All 20 requirements implemented

---

## 📋 Manual Testing Checklist

### Setup
1. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `/home/runner/work/ultimo/ultimo` directory
2. Open WhatsApp Web (https://web.whatsapp.com)
3. Wait for WhatsApp to fully load

---

## 1️⃣ Contact Extractor Tests

### Test 1.1: No Automatic Scroll on Load ✅
**Steps:**
1. Reload WhatsApp Web page
2. Observe the chat list

**Expected Result:**
- ✅ Chat list stays at the top position
- ✅ No automatic scrolling occurs
- ✅ User can manually scroll if needed

**Status:** Should pass (line 89 removed)

---

### Test 1.2: Control Buttons Visibility
**Steps:**
1. Open extension panel (click extension icon)
2. Navigate to "Extrator" tab
3. Click "📥 Extrair contatos"
4. Observe the control buttons

**Expected Result:**
- ✅ "⏸️ Pausar" and "⛔ Cancelar" buttons appear
- ✅ Buttons are visible and clickable
- ✅ Pausar button has yellow/warning style
- ✅ Cancelar button has red/danger style

---

### Test 1.3: Pause/Resume Functionality
**Steps:**
1. Start extraction
2. Click "⏸️ Pausar" button
3. Wait 5 seconds
4. Button should change to "▶️ Continuar"
5. Click "▶️ Continuar"

**Expected Result:**
- ✅ Extraction pauses immediately
- ✅ Button text changes to "▶️ Continuar"
- ✅ Status message shows "Extração pausada..."
- ✅ Clicking Continuar resumes extraction
- ✅ Button text changes back to "⏸️ Pausar"

---

### Test 1.4: Cancel Functionality
**Steps:**
1. Start extraction
2. Let it run for a few seconds
3. Click "⛔ Cancelar" button

**Expected Result:**
- ✅ Extraction stops immediately
- ✅ Status shows "⛔ Extração cancelada"
- ✅ Numbers extracted so far are displayed
- ✅ All three sections show results

---

### Test 1.5: Three Section Display
**Steps:**
1. Complete full extraction
2. Observe the three sections in the UI

**Expected Result:**
- ✅ **📱 Contatos Normais** section exists
  - White background
  - Counter shows number count
  - Textarea contains numbers (one per line)
  
- ✅ **📁 Arquivados** section exists
  - Gray background (#f5f5f5)
  - Gray left border (4px solid #888)
  - Counter shows archived count
  - Textarea contains archived numbers
  
- ✅ **🚫 Bloqueados** section exists
  - Light red background (#ffe6e6)
  - Red left border (4px solid #d00)
  - Counter shows blocked count
  - Textarea contains blocked numbers

---

### Test 1.6: Copy Buttons
**Steps:**
1. After extraction, click "📋 Copiar Todos"
2. Paste in a text editor (Ctrl+V)
3. Click "📋 Copiar Normais"
4. Paste in a text editor
5. Click "📋 Copiar Arquivados"
6. Paste in a text editor
7. Click "📋 Copiar Bloqueados"
8. Paste in a text editor

**Expected Result for each:**
- ✅ Button text changes to "✅ Copiado!" for 2 seconds
- ✅ Button returns to original text after 2 seconds
- ✅ Correct numbers are copied to clipboard
- ✅ "Copiar Todos" copies all three categories combined
- ✅ Individual buttons copy only their category
- ✅ Numbers NOT automatically added to main tab

---

### Test 1.7: Archived Contacts Detection
**Steps:**
1. Archive a conversation in WhatsApp Web
2. Run extraction
3. Check "📁 Arquivados" section

**Expected Result:**
- ✅ Archived contact number appears in Arquivados section
- ✅ Counter increments
- ✅ Number does NOT appear in Normais section
- ✅ Gray background clearly distinguishes section

**Note:** If no archived contacts exist, verify count is 0 and placeholder text shows

---

### Test 1.8: Blocked Contacts Detection
**Steps:**
1. Block a contact in WhatsApp Web (if possible)
2. Run extraction
3. Check "🚫 Bloqueados" section

**Expected Result:**
- ✅ Blocked contact number appears in Bloqueados section
- ✅ Counter increments
- ✅ Number does NOT appear in Normais section
- ✅ Red background clearly distinguishes section

**Note:** If no blocked contacts exist, verify count is 0 and placeholder text shows

---

### Test 1.9: Export CSV
**Steps:**
1. After extraction, click "📥 Exportar CSV"
2. Check downloaded file

**Expected Result:**
- ✅ CSV file downloads successfully
- ✅ File named like `whl_extracted_contacts_[timestamp].csv`
- ✅ Contains phone column with all numbers
- ✅ Opens correctly in spreadsheet software

---

## 2️⃣ Image Sending Tests

### Test 2.1: WebP Conversion
**Steps:**
1. Create a test WebP image (or find one online)
2. Go to extension's main tab
3. Attach the WebP image
4. Add a test contact number
5. Send message with image

**Expected Result:**
- ✅ Image is converted from WebP to JPEG automatically
- ✅ Console shows "🔄 Convertendo WebP para JPEG..."
- ✅ Console shows "✅ WebP convertido para JPEG"
- ✅ Image sent as PHOTO (not sticker)
- ✅ Recipient receives a photo (not a sticker)

**Validation:**
- Check browser console for conversion logs
- Verify sent image in WhatsApp conversation
- Image should have expand icon (photos have this, stickers don't)

---

### Test 2.2: "Fotos e vídeos" Click
**Steps:**
1. Prepare PNG or JPEG image
2. Send with caption
3. Watch browser console

**Expected Result:**
- ✅ Console shows "🖼️ PASSO 3: Procurando 'Fotos e vídeos'..."
- ✅ Console shows "✅ Encontrou opção de mídia:" or "✅ Clicou em Fotos e vídeos"
- ✅ Image opens in preview dialog (not sticker interface)
- ✅ Caption field available in preview

---

### Test 2.3: Correct Input Selection
**Steps:**
1. Send any image
2. Check browser console for input detection logs

**Expected Result:**
- ✅ Console shows "📁 PASSO 4: Procurando input de fotos..."
- ✅ Console shows "✅ Input de fotos/vídeos encontrado:" with accept attribute
- ✅ Accept attribute is NOT just "image/webp"
- ✅ Accept attribute includes image/* or video/*
- ✅ If sticker input found, console shows "⚠️ Ignorando input de sticker"

---

### Test 2.4: Delays and Retries
**Steps:**
1. Send image with slow network
2. Watch console for retry messages

**Expected Result:**
- ✅ Console shows "✅ Imagem anexada, aguardando preview..."
- ✅ Waits at least 2000ms before checking preview
- ✅ If preview doesn't open immediately, shows retry messages:
  - "⏳ Aguardando preview... tentativa 1/5"
  - "⏳ Aguardando preview... tentativa 2/5"
  - etc. (up to 5 retries)
- ✅ Each retry waits 1 second between attempts
- ✅ Eventually shows "✅ Preview detectado" or continues anyway

---

### Test 2.5: Caption in Correct Field
**Steps:**
1. Send image with caption text: "Test Caption 123"
2. Watch console

**Expected Result:**
- ✅ Console shows "📝 Verificando campo de legenda no preview..."
- ✅ Console shows "✅ Campo de legenda encontrado:" with selector
- ✅ Console shows "⌨️ Digitando legenda no preview..."
- ✅ Console shows "✅ Legenda digitada no preview"
- ✅ Caption appears in image preview (not in main message field)
- ✅ Caption sent together with image
- ✅ Recipient sees caption under the image

---

### Test 2.6: Send Button Fallbacks
**Steps:**
1. Send image
2. Watch console for send button detection

**Expected Result:**
- ✅ Console shows "📤 PASSO 5: Enviando IMAGEM..."
- ✅ Console shows button detection method used:
  - "✅ IMAGEM enviada!" (successful send)
- ✅ If first method fails, tries multiple fallbacks:
  - data-testid="send"
  - aria-label="Enviar"
  - span[data-icon="send"] → button
  - Any enabled button in dialog
- ✅ Eventually sends successfully
- ✅ Image appears in chat

---

### Test 2.7: Complete Flow - Text + WebP Image
**Steps:**
1. Upload WebP image
2. Type message: "Testing WebP conversion with caption"
3. Add test contact number
4. Send

**Expected Result:**
- ✅ Message typed in field
- ✅ Image converted WebP → JPEG (console log)
- ✅ Attach menu opens
- ✅ "Fotos e vídeos" clicked (not sticker)
- ✅ Correct input selected (not webp-only)
- ✅ Image attached
- ✅ Preview opens (2000ms wait + retries if needed)
- ✅ Caption typed in preview field
- ✅ Send button clicked with fallbacks
- ✅ Image sent successfully as PHOTO
- ✅ Recipient sees photo with caption

---

## 3️⃣ Edge Cases & Error Handling

### Edge Case 3.1: No Contacts to Extract
**Steps:**
1. Use fresh WhatsApp account with no contacts
2. Run extraction

**Expected Result:**
- ✅ Extraction completes without errors
- ✅ All three sections show 0 count
- ✅ Placeholder text in all textareas
- ✅ Status shows "✅ Finalizado! Total: 0 números"

---

### Edge Case 3.2: Copy with No Numbers
**Steps:**
1. Before extraction, click copy buttons

**Expected Result:**
- ✅ Alert shows "Nenhum número para copiar"
- ✅ No crash or error
- ✅ UI remains functional

---

### Edge Case 3.3: Multiple Image Sends
**Steps:**
1. Send image to contact 1
2. Immediately send another image to contact 2
3. Send third image to contact 3

**Expected Result:**
- ✅ All three images send successfully
- ✅ No interference between sends
- ✅ Each uses correct preview and send button
- ✅ No images sent as stickers

---

### Edge Case 3.4: Extraction During Active Campaign
**Steps:**
1. Start a campaign sending messages
2. While campaign running, click "Extrair contatos"

**Expected Result:**
- ✅ Extraction runs without interfering with campaign
- ✅ Campaign continues normally
- ✅ Both functions work independently

---

## 4️⃣ Performance & Stability

### Performance 4.1: Large Contact List
**Test:** Extract from account with 200+ contacts

**Expected Result:**
- ✅ Completes without crashing
- ✅ Progress bar updates smoothly
- ✅ All categories populated correctly
- ✅ Memory usage remains reasonable

---

### Performance 4.2: Multiple Extractions
**Test:** Run extraction 3 times in a row

**Expected Result:**
- ✅ Each extraction completes successfully
- ✅ Results consistent across runs
- ✅ No memory leaks
- ✅ UI remains responsive

---

## 5️⃣ Browser Console Monitoring

### What to Look For:
- ✅ No JavaScript errors
- ✅ All expected log messages appear
- ✅ No undefined or null errors
- ✅ Network requests complete successfully

### Key Log Messages to Verify:

**Extractor:**
```
[WHL] 🚀🚀🚀 EXTRAÇÃO TURBO v7 - FILTRO ULTRA-RIGOROSO 🚀🚀🚀
[WHL] 📱 Fase 1: DOM...
[WHL] 💾 Fase 2: Storage...
[WHL] 🗄️ Fase 3: IndexedDB...
[WHL] 📁 Fase 3.5: Contatos arquivados e bloqueados...
[WHL] 📜 Fase 4: Scroll...
[WHL] 🔍 Fase 5: Extração final...
[WHL] ✅✅✅ EXTRAÇÃO v7 CONCLUÍDA ✅✅✅
```

**Image Sending:**
```
[WHL] 📸 Enviando FOTO (não sticker)...
[WHL] ⌨️ PASSO 1: Digitando texto primeiro...
[WHL] 📎 PASSO 2: Clicando no botão de anexar...
[WHL] 🖼️ PASSO 3: Procurando "Fotos e vídeos"...
[WHL] 📁 PASSO 4: Procurando input de fotos...
[WHL] 📎 Anexando imagem ao input...
[WHL] ✅ Preview detectado
[WHL] ⌨️ Digitando legenda no preview...
[WHL] 📤 PASSO 5: Enviando IMAGEM...
[WHL] ✅ IMAGEM enviada!
```

---

## 6️⃣ Regression Tests

Ensure existing functionality still works:

### Regression 6.1: Normal Message Sending
**Test:** Send text-only messages

**Expected Result:**
- ✅ Text messages send normally
- ✅ No interference from new features
- ✅ Campaign mode works as before

---

### Regression 6.2: CSV Import
**Test:** Import CSV file with phone numbers

**Expected Result:**
- ✅ CSV imports successfully
- ✅ Numbers populate in main tab
- ✅ Can send messages to imported numbers

---

### Regression 6.3: Settings Configuration
**Test:** Adjust delays, retries, schedule settings

**Expected Result:**
- ✅ All settings save correctly
- ✅ Settings apply to campaigns
- ✅ No issues with new features

---

## 📊 Test Results Summary

Fill this out after testing:

| Test Category | Tests Passed | Tests Failed | Notes |
|--------------|--------------|--------------|-------|
| Contact Extractor | __/9 | __/9 | |
| Image Sending | __/7 | __/7 | |
| Edge Cases | __/4 | __/4 | |
| Performance | __/2 | __/2 | |
| Regression | __/3 | __/3 | |
| **TOTAL** | **__/25** | **__/25** | |

---

## 🐛 Bug Report Template

If issues found:

```
**Issue:** [Short description]
**Severity:** [Critical/High/Medium/Low]
**Category:** [Extractor/Image Sending/UI/Performance]
**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happened]

**Console Errors:**
[Paste any errors]

**Screenshots:**
[If applicable]
```

---

## ✅ Sign-Off

**Tester Name:** _________________
**Date:** _________________
**Overall Status:** [ ] PASS [ ] FAIL [ ] PARTIAL

**Comments:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

## 🎯 Success Criteria

All features are considered successfully implemented if:
- ✅ 23/25 tests pass (92% pass rate)
- ✅ All critical features work
- ✅ No security vulnerabilities
- ✅ No JavaScript errors in console
- ✅ Performance is acceptable
- ✅ Existing features not broken

Current Implementation Status: **READY FOR TESTING** ✅
