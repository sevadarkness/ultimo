# PR #58 - Testing Guide: Message Sending Without Reload

## 🎯 What Changed

This PR fixes the message sending mechanism to **avoid page reloads** by using WhatsApp's internal API through `wpp-hooks.js` instead of `window.location.href`.

### Before
```javascript
// ❌ OLD: Page reload (kills the script)
window.location.href = `https://web.whatsapp.com/send?phone=${phone}`;
```

### After
```javascript
// ✅ NEW: API-based (no reload)
content.js → postMessage → wpp-hooks.js → WhatsApp API → Input + Enter
```

## 🧪 How to Test

### Prerequisites
1. Load the extension in Chrome
2. Open WhatsApp Web: https://web.whatsapp.com
3. Make sure you're logged in
4. Open the browser console (F12)

### Test 1: Single Message Send
1. Open the extension panel
2. Add a single phone number (e.g., `5511999998888`)
3. Type a test message
4. Click "Gerar tabela"
5. Click "Iniciar Campanha"
6. **Expected**: 
   - ✅ Console logs: `[WHL] 📨 Enviando via API (sem reload) para: ...`
   - ✅ Console logs: `[WHL] ✅ Mensagem enviada!`
   - ✅ **No page reload occurs**
   - ✅ Chat opens and message is sent
   - ✅ Campaign continues to next contact automatically

### Test 2: Multiple Messages (Campaign)
1. Add multiple phone numbers (3-5 numbers):
   ```
   5511999998888
   5511988887777
   5511977776666
   ```
2. Type a message
3. Click "Gerar tabela"
4. Click "Iniciar Campanha"
5. **Expected**:
   - ✅ **Page never reloads** during the entire campaign
   - ✅ Each chat opens without reload
   - ✅ Messages are sent one by one
   - ✅ Campaign completes successfully
   - ✅ Console shows: `[WHL] 📨 Enviando para XXXX (sem reload)...`

### Test 3: Error Handling
1. Add an invalid phone number (e.g., `123`)
2. Add a valid phone number after it
3. Start campaign
4. **Expected**:
   - ✅ Invalid number fails gracefully
   - ✅ Campaign continues to valid numbers
   - ✅ No page reload occurs
   - ✅ Error is logged properly

### Test 4: Chat Already Open
1. Manually open a chat with a contact
2. Add the same contact's number to the campaign
3. Start campaign
4. **Expected**:
   - ✅ Message is sent without opening chat again
   - ✅ No reload occurs
   - ✅ Message appears in the already-open chat

## 🔍 What to Look For

### ✅ Success Indicators
- No page reload at any point during message sending
- Console logs show: `[WHL] 📨 Enviando via API (sem reload) para: ...`
- Console logs show: `[WHL] ✅ Mensagem enviada!`
- Messages appear in WhatsApp chats
- Campaign progresses through all contacts without interruption
- Status updates in the UI work correctly

### ❌ Failure Indicators
- Page reloads during sending
- Console errors like: `[WHL] ❌ Erro ao enviar: ...`
- Input not found errors
- Campaign gets stuck
- Messages don't appear in chats

## 🐛 Debugging

If something goes wrong, check the console for:

1. **Module Loading**:
   ```
   [WHL Hooks] Modules initialized: { ... }
   ```

2. **Message Flow**:
   ```
   [WHL] 📨 Enviando via API (sem reload) para: XXXX
   [WHL] Recebido pedido de envio: XXXX
   [WHL] Aguardando input...
   [WHL] ✅ Mensagem enviada!
   ```

3. **Errors**:
   ```
   [WHL] ❌ Erro ao enviar: <error message>
   [WHL] Input não encontrado após 10s
   [WHL] Módulos não disponíveis
   ```

## 📊 Expected Results

| Test Case | Before (with reload) | After (no reload) |
|-----------|---------------------|-------------------|
| Single message | Page reloads, script dies | ✅ No reload, works |
| Multiple messages | Reloads between each | ✅ No reload at all |
| Campaign speed | Slow (reload overhead) | ✅ Faster (no reload) |
| Context preservation | Lost on reload | ✅ Preserved |
| Error recovery | Difficult | ✅ Smooth |

## 🎉 Success Criteria

This PR is successful if:
- [x] Code changes are minimal and focused
- [x] No `window.location.href` used for message sending
- [x] Messages are sent via API + Input/Enter
- [x] No page reloads occur during campaign
- [x] All existing functionality still works
- [x] Error handling is robust
- [x] Console logs are informative
