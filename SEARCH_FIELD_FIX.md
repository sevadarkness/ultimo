# Search Field Clearing Fix

## Problem
The search field was not being cleared correctly, causing text and numbers to accumulate:
- Text like "oi5521995800771" and "5521995800773oi5521995800771" were appearing
- The field was getting: `55219958007715521995800773oi5521995800771`

## Root Cause
The selector `div[contenteditable="true"][data-tab="3"]` was not scoped to the sidebar, potentially selecting the **message field** instead of the **search field**.

The "oi" text (which was a message) appearing in the search field confirmed that the selectors were confused.

## Solution

### DOM Structure Understanding
WhatsApp Web has two distinct sections:
- **Sidebar (`#side`)**: Contains the search field for finding contacts
- **Main (`#main`) or Footer**: Contains the message field for typing messages

### Changes Made

#### 1. Updated `getSearchInput()` Function
**Before:**
```javascript
function getSearchInput() {
  return (
    document.querySelector('div[contenteditable="true"][data-tab="3"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  );
}
```

**After:**
```javascript
function getSearchInput() {
  return (
    document.querySelector('#side div[contenteditable="true"][data-tab="3"]') ||
    document.querySelector('#side div[contenteditable="true"][role="textbox"]')
  );
}
```

✅ **Now scoped to `#side` (sidebar)**

#### 2. Updated `getMessageInput()` Function
**Before:**
```javascript
function getMessageInput() {
  return (
    document.querySelector('div.lexical-rich-text-input p._aupe') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  );
}
```

**After:**
```javascript
function getMessageInput() {
  return (
    document.querySelector('#main div[contenteditable="true"][data-tab="10"]') ||
    document.querySelector('footer div[contenteditable="true"]') ||
    document.querySelector('div.lexical-rich-text-input p._aupe')
  );
}
```

✅ **Now explicitly targets `#main` or `footer`**

#### 3. Updated `clearSearchField()` Function
- Now explicitly uses `#side div[contenteditable="true"][data-tab="3"]`
- Implements robust clearing:
  1. Focus + SelectAll + Delete
  2. Clear textContent and innerHTML
  3. Dispatch input event
  4. Verify if cleared
  5. If not cleared, fallback to Ctrl+A + Backspace simulation

#### 4. Updated `openChatBySearch()` Function
- Now explicitly uses `#side div[contenteditable="true"][data-tab="3"]`
- More robust clearing before typing the number
- Added delays to ensure DOM updates are processed

#### 5. Updated `clearSearchFieldNew()` Function
- Now explicitly uses `#side div[contenteditable="true"][data-tab="3"]`
- Consistent with other changes

## Key Rule

**NEVER confuse the two fields:**
- **Search field**: `#side div[contenteditable="true"][data-tab="3"]` (in sidebar)
- **Message field**: `#main div[contenteditable="true"]` or `footer div[contenteditable="true"]` (in main/footer)

## Testing

To verify the fix works:
1. Load the extension in WhatsApp Web
2. Start a campaign with multiple numbers
3. Watch the console logs for:
   - `[WHL] ✅ Campo de pesquisa limpo` (Search field cleared)
   - `[WHL] ✅ Número digitado na busca: [number]` (Number typed in search)
4. Verify that the search field is actually being cleared between contacts
5. Check that no text accumulation occurs

## Expected Behavior

After the fix:
- Search field should be completely empty before each new search
- Message field should remain separate and not interfere with search
- No text accumulation should occur
- Each contact search should start with a clean search field
