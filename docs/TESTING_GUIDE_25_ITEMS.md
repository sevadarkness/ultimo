# 🧪 Testing Guide - 25 Improvements Implementation

## Quick Test Checklist

### ✅ UI/UX Tests

#### Item 1: Copy Buttons for Archived/Blocked
1. Go to Extrator tab
2. Extract contacts
3. Click "📋 Copiar Arquivados" button
4. **Expected**: Shows "✅ Copiado!" and copies to clipboard
5. Click "📋 Copiar Bloqueados" button
6. **Expected**: Shows "✅ Copiado!" and copies to clipboard

#### Item 2: Group Names with Tooltips
1. Go to Grupos tab
2. Click "🔄 Carregar Grupos"
3. Hover over groups with long names
4. **Expected**: Full name and ID shown in tooltip
5. **Expected**: Names truncated at 50 chars with "..."

#### Item 5: Close Panel with ESC
1. Open the panel
2. Press ESC key
3. **Expected**: Panel closes immediately

#### Item 11: Copy Group IDs
1. Go to Grupos tab
2. Load groups
3. Select a group
4. Click "🆔 Copiar ID"
5. **Expected**: Shows "✅ Copiado!" and copies group ID

#### Item 13: Auto-scroll to Current Row
1. Add 20+ numbers
2. Generate table
3. Start campaign
4. **Expected**: Table auto-scrolls to highlight current row
5. **Expected**: Current row centered in view

#### Item 22: Confirmation Before Clearing
1. Add numbers and message
2. Click "Limpar" button
3. **Expected**: Confirmation dialog appears
4. Cancel
5. **Expected**: Data preserved
6. Confirm
7. **Expected**: Fields cleared

#### Item 23: Persist Last Selected Group
1. Go to Grupos tab
2. Load groups
3. Select a group
4. Close and reopen panel
5. Load groups again
6. **Expected**: Previously selected group is still selected

---

### ✅ Validation Tests

#### Item 6: Image Validation
1. Try uploading a text file (.txt)
   - **Expected**: Error "Tipo de arquivo inválido"
2. Try uploading > 16MB image
   - **Expected**: Error "Imagem muito grande"
3. Try uploading > 4096px image
   - **Expected**: Error "Dimensões muito grandes"
4. Upload valid image
   - **Expected**: Shows "✅ nome - XKB - WxHpx"

#### Item 8: Display Invalid Numbers
1. Add numbers with duplicates:
   ```
   11999998888
   11999998888
   123
   11988887777
   ```
2. Click "Gerar tabela"
3. **Expected**: Shows:
   - "X números únicos"
   - "X duplicata(s) removida(s): ..."
   - "X número(s) inválido(s): 123"

#### Item 10: DelayMin vs DelayMax Validation
1. Go to Configurações tab
2. Set DelayMin = 10
3. Try setting DelayMax = 5
4. **Expected**: Alert "O delay máximo não pode ser menor que o mínimo"
5. **Expected**: DelayMax reset to 10
6. Set DelayMax = 20
7. Try setting DelayMin = 25
8. **Expected**: Alert "O delay mínimo não pode ser maior que o máximo"
9. **Expected**: DelayMin reset to 20

#### Item 15: Phone Number Validation (10 digits min)
1. Add number with 9 digits: "999998888"
2. Generate table
3. **Expected**: Marked as invalid
4. Add number with 10 digits: "1199998888"
5. **Expected**: Valid and accepted

#### Item 16: Duplicate Draft Confirmation
1. Create draft named "Test"
2. Try creating another draft named "Test"
3. **Expected**: Confirmation "Já existe um rascunho com o nome 'Test'. Deseja sobrescrevê-lo?"
4. Cancel
5. **Expected**: Draft not overwritten

---

### ✅ Data & Storage Tests

#### Item 3 & 21: Stats Persistence and Sync
1. Start a campaign and send some messages
2. Open popup
3. **Expected**: Stats match campaign stats
4. Close WhatsApp Web tab
5. Reopen WhatsApp Web
6. **Expected**: Stats persisted correctly

#### Item 4: Recover 5 MB Limit
1. Open browser DevTools Console
2. Trigger many deleted messages
3. Watch for: "[WHL Recover] Histórico salvo: X mensagens, YKB"
4. **Expected**: Size never exceeds ~5000KB
5. **Expected**: Old messages removed automatically

---

### ✅ Campaign Tests

#### Item 9: WhatsApp Disconnect Detector
1. Start a campaign
2. Disconnect from WhatsApp (close connection)
3. **Expected**: Within 5 seconds, alert "WhatsApp desconectado!"
4. **Expected**: Campaign automatically paused

#### Item 18: Estimated Time Display
1. Add 10 numbers
2. Set DelayMin=2, DelayMax=4
3. Generate table and start campaign
4. **Expected**: Shows "⏱️ Tempo estimado: X min"
5. **Expected**: Time updates as messages are sent

---

### ✅ Export Tests

#### Item 17: CSV Export Loading
1. Extract contacts
2. Click "📥 Exportar CSV"
3. **Expected**: Shows "⏳ Exportando..."
4. **Expected**: Changes to "✅ CSV exportado com sucesso! X números"

#### Item 19: Recover JSON Export Validation
1. With empty recover history, click "📥 Exportar JSON"
2. **Expected**: Alert "Nenhuma mensagem recuperada para exportar"
3. With messages, click export
4. **Expected**: Shows "✅ Histórico exportado... X mensagem(ns)"

---

### ✅ Visual/Display Tests

#### Item 12: Progress Bar Disappears
1. Extract contacts
2. Wait for 100% completion
3. **Expected**: After 2 seconds, progress bar disappears

#### Item 14 & 24: Image Preview Update
1. Select an image
2. **Expected**: Preview shows immediately
3. **Expected**: Shows "✅ filename - XKB - WxHpx"

---

### ✅ Encoding Tests

#### Item 7: CSV Encoding Detection
1. Create CSV with UTF-8 BOM
2. Import CSV
3. **Expected**: Numbers imported correctly
4. Check console for encoding warnings

---

### ✅ Developer Tests

#### Item 20: Controlled Logging
1. Open Console
2. **Expected**: Minimal logs in production
3. Run: `localStorage.setItem('whl_debug', 'true')`
4. Reload page
5. **Expected**: Debug logs visible
6. Run: `localStorage.removeItem('whl_debug')`
7. Reload
8. **Expected**: Debug logs hidden again

---

## 🎯 Critical Path Test

**Complete workflow test:**

1. ✅ Open panel (should work)
2. ✅ Press ESC (panel closes)
3. ✅ Reopen panel
4. ✅ Add image > 16MB (rejected)
5. ✅ Add valid image (preview shows with size)
6. ✅ Add numbers with duplicates (detected and shown)
7. ✅ Set DelayMin > DelayMax (prevented)
8. ✅ Generate table (shows invalid/duplicate feedback)
9. ✅ Start campaign (estimated time appears)
10. ✅ Auto-scroll to current row works
11. ✅ Disconnect WhatsApp (campaign pauses)
12. ✅ Reconnect and resume
13. ✅ Extract contacts (progress bar appears then disappears)
14. ✅ Copy archived/blocked contacts
15. ✅ Export CSV (loading feedback)
16. ✅ Try export Recover JSON empty (validation works)
17. ✅ Load groups (long names truncated)
18. ✅ Copy group ID
19. ✅ Last selected group persists
20. ✅ Try clear with data (confirmation required)
21. ✅ Try save duplicate draft (confirmation required)
22. ✅ Check popup stats (synced)

**If all pass: ✅ READY FOR PRODUCTION**

---

## 🐛 Known Non-Issues

### Item 25: Pause/Cancel in Extractions
- **Status**: Not implemented
- **Reason**: Extraction is instant (< 1s)
- **Impact**: None - feature not needed
- **Future**: Infrastructure ready if long extractions added

---

## 📝 Testing Notes

- All tests should be performed on WhatsApp Web
- Use Chrome/Edge for best results
- Clear cache if experiencing issues
- Check DevTools Console for errors
- Report any failures with:
  - Browser and version
  - Steps to reproduce
  - Expected vs actual behavior
  - Console errors (if any)

---

## ✅ Success Criteria

- [ ] All 24 applicable features working
- [ ] No console errors
- [ ] No regression in existing features
- [ ] Stats syncing correctly
- [ ] Validations preventing errors
- [ ] UX improvements visible
- [ ] Performance acceptable
- [ ] Data persistence working

**When all checked: APPROVE PR ✅**
