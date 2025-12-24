# Store Bridge Implementation - CSP Fix

## 🎯 Problema Resolvido

O WhatsApp Web bloqueia acesso direto ao `window.Store` via Content Security Policy (CSP). Isso impedia que as funcionalidades de **Extrator** (contatos arquivados/bloqueados), **Grupos** (carregar/extrair membros) e **Recover** (anti-revoke) funcionassem corretamente.

## ✅ Solução Implementada

### Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│ WhatsApp Web (Página)                                       │
│                                                              │
│  ┌──────────────────────┐                                   │
│  │  store-bridge.js     │ ◄─── Injetado via web_accessible │
│  │  (Page Context)      │                                   │
│  │                      │                                   │
│  │  - Acessa Store      │                                   │
│  │  - window.WHL_Store  │                                   │
│  └──────────────────────┘                                   │
│            │                                                 │
│            │ postMessage                                    │
│            ▼                                                 │
│  ┌──────────────────────┐                                   │
│  │  content.js          │ ◄─── Extension Context           │
│  │  extractor.js        │                                   │
│  │  recover-ultra.js    │                                   │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

### 1. **store-bridge.js** (NOVO)
- **Localização**: `content/store-bridge.js`
- **Contexto**: Roda no contexto da PÁGINA (não da extensão)
- **Função**: Acessa `window.Store` do WhatsApp e expõe como `window.WHL_Store`
- **Responsabilidades**:
  - Inicializar `window.WHL_Store` com módulos Chat, Contact, GroupMetadata, Blocklist, Msg
  - Ouvir comandos via `postMessage`: `WHL_LOAD_GROUPS`, `WHL_EXTRACT_GROUP_MEMBERS`
  - Enviar resultados de volta via `postMessage`: `WHL_GROUPS_RESULT`, `WHL_GROUP_MEMBERS_RESULT`
  - Setup anti-revoke (interceptar `Msg.prototype.revoke`)

### 2. **manifest.json**
```json
"web_accessible_resources": [
  {
    "resources": [
      "content/extractor.contacts.js",
      "content/recover-ultra.js",
      "content/store-bridge.js"  // ← NOVO
    ],
    "matches": ["https://web.whatsapp.com/*"]
  }
]
```

### 3. **content.js**
**Mudanças**:
- Injeta `store-bridge.js` no contexto da página ao inicializar
- Atualiza handlers da aba **Grupos**:
  - `btnLoadGroups`: Envia `postMessage({ type: 'WHL_LOAD_GROUPS' })`
  - `btnExtractGroupMembers`: Envia `postMessage({ type: 'WHL_EXTRACT_GROUP_MEMBERS', groupId })`
- Adiciona listeners para respostas do bridge:
  - `WHL_GROUPS_RESULT`: Popula lista de grupos
  - `WHL_GROUP_MEMBERS_RESULT`: Popula textarea com membros

### 4. **extractor.contacts.js**
**Mudanças**:
- `waitForWA()`: Espera por `window.WHL_Store` (não `window.Store`)
- `initStore()`: Verifica `window.WHL_Store` (bridge faz a inicialização)
- `extractArchivedContacts()`: Usa `window.WHL_Store.Chat.models`
- `extractBlockedContacts()`: Usa `window.WHL_Store.Blocklist.models`

### 5. **recover-ultra.js**
**Mudanças**:
- `waitForWA()`: Espera por `window.WHL_Store`
- `initStore()`: Verifica `window.WHL_Store`
- `hookStoreMsg()`: Hook em `window.WHL_Store.Msg.on('add')` para interceptar mensagens

## 🔄 Fluxo de Comunicação

### Grupos: Carregar Lista
```
1. Usuário clica "Carregar Grupos"
2. content.js → postMessage({ type: 'WHL_LOAD_GROUPS' })
3. store-bridge.js → Acessa WHL_Store.Chat.models
4. store-bridge.js → Filtra grupos (@g.us)
5. store-bridge.js → postMessage({ type: 'WHL_GROUPS_RESULT', groups })
6. content.js → Listener recebe e popula dropdown
```

### Grupos: Extrair Membros
```
1. Usuário seleciona grupo e clica "Extrair Membros"
2. content.js → postMessage({ type: 'WHL_EXTRACT_GROUP_MEMBERS', groupId })
3. store-bridge.js → Encontra chat com groupId
4. store-bridge.js → Acessa groupMetadata.participants
5. store-bridge.js → postMessage({ type: 'WHL_GROUP_MEMBERS_RESULT', members })
6. content.js → Listener recebe e popula textarea
```

### Extrator: Arquivados e Bloqueados
```
1. Usuário clica "Extrair Contatos"
2. extractor.contacts.js → Aguarda window.WHL_Store
3. extractor.contacts.js → extractArchivedContacts() usa WHL_Store.Chat
4. extractor.contacts.js → extractBlockedContacts() usa WHL_Store.Blocklist
5. extractor.contacts.js → postMessage({ type: 'WHL_EXTRACT_RESULT', normal, archived, blocked })
6. content.js → Listener recebe e popula textareas
```

### Recover: Anti-Revoke
```
1. store-bridge.js → setupAntiRevoke() intercepta Msg.prototype.revoke
2. Quando mensagem é revogada:
3. store-bridge.js → Captura dados antes de revogar
4. store-bridge.js → postMessage({ type: 'WHL_MSG_REVOKED', message })
5. recover-ultra.js → Listener salva mensagem em IndexedDB
6. recover-ultra.js → Observer DOM detecta mensagem revogada
7. recover-ultra.js → Restaura conteúdo salvo na interface
```

## 🧪 Testes Necessários

### 1. Verificar Bridge Injetado
- Abrir WhatsApp Web
- Console: verificar log `[WHL] Store bridge injetado`
- Console: verificar log `[WHL Store Bridge] Store carregado com sucesso`
- Console: `window.WHL_Store` deve estar definido

### 2. Testar Extrator
- Clicar em "Extrair Contatos"
- Verificar que:
  - ✅ Contatos normais são extraídos
  - ✅ Contatos **arquivados** são extraídos (seção amarela)
  - ✅ Contatos **bloqueados** são extraídos (seção vermelha)

### 3. Testar Grupos
- Aba "Grupos"
- Clicar "Carregar Grupos"
- Verificar que lista popula com grupos
- Selecionar um grupo
- Clicar "Extrair Membros"
- Verificar que membros são listados

### 4. Testar Recover
- Aba "Recover"
- Clicar "Ativar"
- Enviar mensagem de teste
- Apagar mensagem
- Verificar que mensagem é recuperada e exibida

## 📝 Arquivos Modificados

1. ✅ `manifest.json` - web_accessible_resources
2. ✅ `content/content.js` - Injeção e listeners
3. ✅ `content/store-bridge.js` - NOVO - Bridge para Store
4. ✅ `content/extractor.contacts.js` - Usa WHL_Store
5. ✅ `content/recover-ultra.js` - Usa WHL_Store

## 🚀 Resultado Esperado

1. **Extrator**: ✅ Contatos normais, arquivados e bloqueados extraídos corretamente
2. **Grupos**: ✅ Carregar lista de grupos e extrair membros funciona
3. **Recover**: ✅ Mensagens apagadas são capturadas e recuperadas

## 🔍 Debug

Se algo não funcionar:

```javascript
// No console do WhatsApp Web:

// 1. Verificar se bridge foi injetado
window.WHL_Store

// 2. Verificar módulos disponíveis
window.WHL_Store.Chat
window.WHL_Store.Contact
window.WHL_Store.Blocklist
window.WHL_Store.GroupMetadata
window.WHL_Store.Msg

// 3. Testar extração manual de grupos
window.postMessage({ type: 'WHL_LOAD_GROUPS' }, '*')

// 4. Verificar listener
window.addEventListener('message', e => console.log('Message:', e.data))
```
