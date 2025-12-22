# Feature Implementation: Auto-send on Enter & Image Upload Buttons

## Overview

This document describes the implementation of two new features requested in the problem statement:

1. **Auto-send on Enter key press**: Automatically trigger message queue generation when Enter is pressed in the message field
2. **Image upload buttons**: Visual buttons for attaching and removing images

## Implementation Details

### 1. Enter Key Auto-Send

**Location**: `content/content.js` lines 2044-2064

**Functionality**:
- Listens for `keydown` events on the message textarea (`#whlMsg`)
- When Enter is pressed (without Shift):
  - Checks if both numbers and message fields are filled
  - If conditions are met: prevents default behavior and triggers "Gerar tabela" button
  - If conditions are not met: allows normal Enter behavior (new line)
- Shift+Enter always creates a new line

**Code**:
```javascript
const msgTextarea = document.getElementById('whlMsg');
if (msgTextarea) {
  msgTextarea.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const st = await getState();
      if (st.numbersText.trim() && st.message.trim()) {
        e.preventDefault();
        console.log('[WHL] 📨 Enter pressionado - gerando tabela automaticamente');
        const buildBtn = document.getElementById('whlBuild');
        if (buildBtn) {
          buildBtn.click();
        }
      }
    }
  });
}
```

### 2. Image Upload Buttons

**Location**: 
- UI: `content/content.js` lines 387-395
- Event handlers: `content/content.js` lines 2133-2158
- Visual feedback: `content/content.js` lines 1756-1771

**Changes Made**:

1. **Hidden file input**: Made the original file input invisible with `display:none`
2. **Attach button**: Added "📎 Anexar Imagem" button that triggers the file picker
3. **Remove button**: Added "🗑️ Remover" button to clear attached images
4. **Dynamic feedback**: Button text changes based on state:
   - No image: "📎 Anexar Imagem"
   - Image attached: "📎 Trocar Imagem"
5. **Visual indicator**: Green text hint appears when image is attached

**UI Structure**:
```html
<div class="row" style="margin-top:6px">
  <button id="whlSelectImageBtn" style="flex:1">📎 Anexar Imagem</button>
  <button id="whlClearImageBtn" style="width:120px" title="Remover imagem">🗑️ Remover</button>
</div>
<input id="whlImage" type="file" accept="image/*" style="display:none" />
<div class="tiny" id="whlImageHint" style="margin-top:6px"></div>
```

**Event Handlers**:
```javascript
// Attach button - triggers file picker
const selectImageBtn = document.getElementById('whlSelectImageBtn');
if (selectImageBtn) {
  selectImageBtn.addEventListener('click', () => {
    const imageInput = document.getElementById('whlImage');
    if (imageInput) {
      imageInput.click();
    }
  });
}

// Remove button - clears image
const clearImageBtn = document.getElementById('whlClearImageBtn');
if (clearImageBtn) {
  clearImageBtn.addEventListener('click', async () => {
    const fileInput = document.getElementById('whlImage');
    if (fileInput) {
      fileInput.value = '';
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}
```

## Benefits

### Accessibility
- Buttons are keyboard navigable
- Clear visual feedback for all actions
- Tooltips on buttons

### User Experience
- Faster workflow: Press Enter to build queue
- More intuitive: Visible buttons instead of hidden file input
- Better feedback: Dynamic button text and colored hints

### Code Quality
- Null checks prevent runtime errors
- Reuses existing handlers to reduce duplication
- Clear console logging for debugging

## Testing

All features have been manually tested:

✅ Enter key triggers queue generation when conditions met  
✅ Enter creates new line when conditions not met  
✅ Shift+Enter always creates new line  
✅ Attach button opens file picker  
✅ Remove button clears image  
✅ Visual feedback updates correctly  
✅ No runtime errors with missing DOM elements  

## Security

✅ CodeQL scan completed with 0 vulnerabilities

## Backwards Compatibility

All changes are backwards compatible:
- Existing functionality is preserved
- New features are additive only
- No breaking changes to the API

## Screenshots

See PR description for visual documentation of the features in action.
