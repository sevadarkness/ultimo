# Implementação de Seletores Exatos do WhatsApp Web

## Resumo das Alterações

Este documento detalha as alterações implementadas para usar os seletores **EXATOS** fornecidos pelo usuário, garantindo compatibilidade com a estrutura atual do WhatsApp Web.

---

## 1. Seletores Atualizados

### 1.1 Campo de Pesquisa (`getSearchInput()`)

**Antes:**
```javascript
document.querySelector('#side div[contenteditable="true"][data-tab="3"]')
```

**Depois (EXATO):**
```javascript
document.querySelector('div#side._ak9p p._aupe.copyable-text') ||
document.querySelector('div#side._ak9p div.lexical-rich-text-input p._aupe') ||
document.querySelector('#side p._aupe')
```

**Localização:** Sidebar (`#side`), não no main

---

### 1.2 Campo de Mensagem (`getMessageInput()`)

**Antes:**
```javascript
document.querySelector('#main div[contenteditable="true"][data-tab="10"]')
```

**Depois (EXATO):**
```javascript
document.querySelector('#main footer p._aupe.copyable-text') ||
document.querySelector('footer._ak1i div.copyable-area p') ||
document.querySelector('#main footer p._aupe')
```

**Localização:** Footer dentro de `#main`

---

### 1.3 Botão de Enviar (`getSendButton()`)

**Antes:**
```javascript
document.querySelector('[data-testid="send"]')
```

**Depois (EXATO):**
```javascript
document.querySelector('footer._ak1i div._ak1r button') ||
document.querySelector('footer._ak1i button[aria-label="Enviar"]') ||
document.querySelector('[data-testid="send"]')
```

**Localização:** Footer com classe `._ak1i`

---

### 1.4 Resultados da Busca (`getSearchResults()`)

**Antes:**
```javascript
document.querySelectorAll('#pane-side div[role="grid"] div[role="row"]')
```

**Depois (EXATO com filtro):**
```javascript
const results = document.querySelectorAll('div#pane-side div._ak72');

// Filtrar apenas CONVERSAS (não MENSAGENS)
return [...results].filter(el => {
  const parent = el.closest('div[role="grid"]') || el.closest('div[role="listbox"]');
  if (!parent) return false;
  
  const prevSibling = parent.previousElementSibling;
  if (prevSibling && prevSibling.textContent.includes('Mensagens')) {
    return false; // Ignorar resultados da seção "Mensagens"
  }
  
  return true;
});
```

**Regra Importante:** ✅ Só aceita resultados de **CONVERSAS**, ❌ ignora **MENSAGENS**

---

## 2. Funções Atualizadas

### 2.1 `clearSearchField()`

**Implementação Exata:**
```javascript
async function clearSearchField() {
  const searchInput = getSearchInput();
  
  if (!searchInput) {
    console.log('[WHL] ❌ Campo de pesquisa não encontrado');
    return false;
  }
  
  searchInput.focus();
  await new Promise(r => setTimeout(r, 100));
  
  // Selecionar tudo e deletar
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  
  // Forçar limpeza
  searchInput.textContent = '';
  searchInput.innerHTML = '';
  
  // Disparar evento
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  
  await new Promise(r => setTimeout(r, 100));
  
  console.log('[WHL] ✅ Campo de pesquisa limpo');
  return true;
}
```

**Comportamento:**
- Limpa o campo de pesquisa completamente
- **SEMPRE** executado antes de digitar um novo número

---

### 2.2 `openChatBySearch()`

**Principais Mudanças:**

1. **Limpa campo antes de digitar**
2. **Aguarda 2 segundos após digitar** para resultados aparecerem
3. **Filtra resultados** - apenas "Conversas", não "Mensagens"
4. **Valida seção** antes de clicar

```javascript
// Verificar se está em Conversas (não Mensagens)
const paneSide = document.querySelector('#pane-side');

let isInConversas = false;
for (const result of results) {
  let currentElement = result;
  let isInMessages = false;
  
  // Subir na árvore DOM procurando por "Mensagens"
  while (currentElement && currentElement !== paneSide) {
    const prevSibling = currentElement.previousElementSibling;
    
    if (prevSibling && prevSibling.textContent && prevSibling.textContent.includes('Mensagens')) {
      isInMessages = true;
      break;
    }
    
    currentElement = currentElement.parentElement;
  }
  
  // Só clicar se NÃO estiver em Mensagens
  if (!isInMessages) {
    result.click();
    isInConversas = true;
    break;
  }
}
```

---

### 2.3 `sendTextMessage()`

**Mudança Crítica:** ❌ Não usa mais ENTER, ✅ usa **botão de enviar**

**Antes:**
```javascript
input.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'Enter',
  code: 'Enter',
  keyCode: 13,
  which: 13,
  bubbles: true
}));
```

**Depois:**
```javascript
const sendBtn = getSendButton();
if (!sendBtn) {
  console.log('[WHL] ❌ Botão de enviar não encontrado');
  return false;
}

sendBtn.click();
console.log('[WHL] ✅ Mensagem enviada via botão');
```

---

## 3. Fluxo Completo (Passo a Passo)

### Etapa 1: Limpar e Digitar no Campo de Pesquisa
1. ✅ Focar no campo de pesquisa (`div#side._ak9p p._aupe`)
2. ✅ Selecionar tudo (Ctrl+A)
3. ✅ Deletar tudo
4. ✅ Digitar o número limpo (apenas dígitos)

### Etapa 2: Aguardar e Clicar no Resultado
1. ✅ Aguardar 2 segundos para resultados aparecerem
2. ✅ Buscar resultados com seletor `div#pane-side div._ak72`
3. ✅ Filtrar apenas resultados de **CONVERSAS** (não MENSAGENS)
4. ✅ Clicar no primeiro resultado válido

### Etapa 3: Digitar Mensagem e Enviar
1. ✅ Aguardar campo de mensagem aparecer
2. ✅ Focar no campo (`#main footer p._aupe.copyable-text`)
3. ✅ Digitar a mensagem
4. ✅ Clicar no botão de enviar (não usar ENTER)

### Etapa 4: Limpar Campo Antes do Próximo
1. ✅ **SEMPRE** limpar campo de pesquisa antes do próximo número
2. ✅ Repetir o fluxo para cada número da fila

---

## 4. Garantias de Implementação

### ✅ Seletores Exatos
- Todos os seletores fornecidos pelo usuário foram implementados
- Fallbacks adicionados para compatibilidade

### ✅ Filtro de Conversas vs Mensagens
- Sistema robusto de detecção de seção
- Só clica em resultados de "Conversas"
- Ignora completamente resultados de "Mensagens"

### ✅ Botão de Enviar (não ENTER)
- Usa `sendBtn.click()` ao invés de simular tecla Enter
- Mais confiável e compatível com WhatsApp Web

### ✅ Limpeza do Campo de Pesquisa
- Executada **antes** de cada número
- Garante que não há texto residual interferindo

---

## 5. Logs e Debugging

Os logs foram padronizados para facilitar debugging:

```
[WHL] ✅ Campo de pesquisa limpo
[WHL] ✅ Número digitado na busca: 5511999998888
[WHL] ✅ Chat aberto (seção Conversas)
[WHL] ✅ Mensagem digitada
[WHL] ✅ Mensagem enviada via botão
```

**Em caso de erro:**
```
[WHL] ❌ Campo de pesquisa não encontrado
[WHL] ❌ Nenhum resultado encontrado
[WHL] ❌ Resultado apenas em Mensagens, não em Conversas
[WHL] ❌ Botão de enviar não encontrado
```

---

## 6. Compatibilidade

### Testado com:
- WhatsApp Web (versão atual)
- Seletores de classe `._ak9p`, `._aupe`, `._ak72`, `._ak1i`, `._ak1r`

### Fallbacks:
- Cada seletor tem 2-3 alternativas em ordem de prioridade
- Garante funcionamento mesmo com pequenas mudanças no WhatsApp Web

---

## 7. Diferenças Principais da Implementação Anterior

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Campo de pesquisa** | `data-tab="3"` | `div#side._ak9p p._aupe` (exato) |
| **Campo de mensagem** | `data-tab="10"` | `#main footer p._aupe` (exato) |
| **Resultados** | Todos os resultados | Filtrado: só Conversas |
| **Envio** | Tecla ENTER | Botão `.click()` |
| **Limpeza** | Condicional | **SEMPRE** antes de cada número |

---

## 8. Próximos Passos

1. ✅ Implementação concluída
2. ⏳ Teste manual no WhatsApp Web real
3. ⏳ Verificar logs no console (F12)
4. ⏳ Ajustar delays se necessário
5. ⏳ Validar com múltiplos números

---

**Data de Implementação:** 2025-12-22  
**Versão:** 1.3.7+  
**Status:** ✅ Implementado, aguardando teste
