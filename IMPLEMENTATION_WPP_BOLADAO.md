# Implementação WPP Boladão - Recover, Extrator e Grupos

## 📋 Resumo

Substituição da implementação do PR #47 pela abordagem **comprovada e testada** do WPP Boladão, que utiliza `require()` para carregar módulos internos do WhatsApp via webpack ao invés de acessar `window.Store` diretamente.

## ✅ Mudanças Realizadas

### 1. Novo Arquivo: `content/wpp-hooks.js`

Arquivo principal com hooks baseados no WPP Boladão:

- **Hook Base Class**: Classe base para gerenciar hooks
- **WA_MODULES**: Constantes com nomes dos módulos internos do WhatsApp
- **tryRequireModule()**: Função para carregar módulos usando `require()`
- **RenderableMessageHook**: Intercepta e recupera mensagens apagadas
- **EditMessageHook**: Intercepta e recupera mensagens editadas
- **Grupos**: Extração de grupos e membros usando CHAT_STORE

#### Funcionamento dos Hooks

**Mensagens Apagadas:**
```javascript
// Intercepta subtypes: 'sender_revoke', 'admin_revoke'
message.body = '🚫 Esta mensagem foi excluída!';
// Converte para mensagem visível com quote da original
```

**Mensagens Editadas:**
```javascript
// Intercepta mensagens com protocolMessageKey
message.body = `✏️ Esta mensagem foi editada para: ${message.body}`;
// Processa como nova mensagem com quote da original
```

### 2. Arquivos Removidos

- ❌ `content/store-bridge.js` - Abordagem antiga que não funcionava
- ❌ `content/recover-ultra.js` - Abordagem antiga que não funcionava

### 3. Arquivos Modificados

#### `manifest.json`
- Removido `recover-ultra.js` de `content_scripts`
- Removido `store-bridge.js` e `recover-ultra.js` de `web_accessible_resources`
- Adicionado `wpp-hooks.js` em `web_accessible_resources`

#### `content/content.js`
- Substituído `injectStoreBridge()` por `injectWppHooks()`
- Atualizado UI do Recover para refletir status "sempre ativo"
- Mantido suporte para grupos (já usava `window.postMessage`)

## 🔑 Diferenças da Implementação Anterior

| Aspecto | Anterior (PR #47) | Novo (WPP Boladão) |
|---------|-------------------|---------------------|
| **Acesso ao Store** | `window.Store` via webpack injection | `require()` de módulos específicos |
| **CSP** | ❌ Bloqueado | ✅ Contornado |
| **Recuperação** | IndexedDB + Observer | Hooks no nível do protocolo |
| **Ativação** | Manual (enable/disable) | Automática (sempre ativo) |
| **Display** | Modal separado | Inline no chat |
| **Grupos** | Via Store.Chat | Via CHAT_STORE require() |

## 🎯 Funcionalidades Implementadas

### ✅ Recover (Anti-Revoke)

**Status**: Sempre ativo automaticamente

- Mensagens apagadas são exibidas como: "🚫 Esta mensagem foi excluída!"
- Mensagens editadas são exibidas como: "✏️ Esta mensagem foi editada para: [novo texto]"
- Funciona automaticamente assim que o WhatsApp carrega
- Não requer ativação manual

### ✅ Extrator de Grupos

**Funcionalidades**:

1. **Carregar Grupos**:
   - Botão: "🔄 Carregar Grupos"
   - Lista todos os grupos do usuário
   - Mostra nome e quantidade de participantes

2. **Extrair Membros**:
   - Selecionar grupo da lista
   - Botão: "📥 Extrair Membros"
   - Extrai números de telefone de todos os participantes
   - Remove duplicatas automaticamente

3. **Exportar**:
   - Copiar números para clipboard
   - Exportar para CSV

### ✅ Extrator de Contatos

**Mantido**: O extrator de contatos existente (`extractor.contacts.js`) continua funcionando normalmente.

## 📦 Módulos do WhatsApp Utilizados

```javascript
const WA_MODULES = {
    // Recover
    PROCESS_EDIT_MESSAGE: 'WAWebDBProcessEditProtocolMsgs',
    PROCESS_RENDERABLE_MESSAGES: 'WAWebMessageProcessRenderable',
    
    // Grupos
    CHAT_STORE: 'WAWebChatCollection',
    CONTACT_STORE: 'WAWebContactCollection',
    GROUP_METADATA: 'WAWebGroupMetadata',
    
    // Outros (preparados para uso futuro)
    QUERY_GROUP: 'WAWebGroupMsgSendUtils',
    SEND_MESSAGE: 'WAWebSendMsgRecordAction',
};
```

## 🔄 Fluxo de Inicialização

1. `content.js` é carregado pelo Chrome (content script)
2. `content.js` injeta `wpp-hooks.js` no contexto da página
3. `wpp-hooks.js` aguarda módulos do WhatsApp carregarem (max 50 tentativas)
4. Hooks são registrados nos módulos internos
5. Mensagens são interceptadas automaticamente
6. UI comunica via `window.postMessage` para ações de grupos

## 🧪 Como Testar

### Teste 1: Mensagens Apagadas
1. Abrir WhatsApp Web com extensão instalada
2. Enviar mensagem para si mesmo
3. Apagar a mensagem
4. ✅ Deve aparecer: "🚫 Esta mensagem foi excluída!"

### Teste 2: Mensagens Editadas
1. Enviar mensagem para si mesmo
2. Editar a mensagem
3. ✅ Deve aparecer: "✏️ Esta mensagem foi editada para: [novo texto]"

### Teste 3: Grupos
1. Abrir extensão (ícone no Chrome)
2. Ir para aba "👥 Grupos"
3. Clicar em "🔄 Carregar Grupos"
4. ✅ Lista de grupos deve aparecer
5. Selecionar um grupo
6. Clicar em "📥 Extrair Membros"
7. ✅ Números dos membros devem aparecer

## 📊 Logs no Console

Ao abrir DevTools (F12), você verá:

```
[WHL Hooks] Initializing WPP Hooks...
[WHL Hooks] WhatsApp modules detected, starting...
[WHL Hooks] Modules initialized: { ... }
[WHL Hooks] RenderableMessageHook registered
[WHL Hooks] EditMessageHook registered
[WHL Hooks] ✅ Hooks registrados com sucesso!
```

## ⚠️ Notas Importantes

1. **Compatibilidade**: Funciona apenas no WhatsApp Web moderno
2. **Performance**: Hooks são leves e não afetam performance
3. **Privacidade**: Tudo roda localmente no navegador
4. **Atualizações**: Se WhatsApp mudar nomes de módulos, pode precisar atualização
5. **CSP**: Contornado usando script injection via extension API

## 🔜 Próximos Passos (Opcional)

- [ ] Adicionar histórico persistente de mensagens recuperadas
- [ ] Implementar exportação de mensagens recuperadas
- [ ] Adicionar filtros para grupos (ativos/arquivados)
- [ ] Melhorar UI de mensagens recuperadas
- [ ] Adicionar notificações quando mensagens são interceptadas

## 🐛 Troubleshooting

**Problema**: Hooks não registram
- **Solução**: Recarregar página do WhatsApp Web (F5)
- **Causa**: Módulos ainda não carregados

**Problema**: Grupos não aparecem
- **Solução**: Esperar alguns segundos após abrir WhatsApp
- **Causa**: Store ainda sincronizando

**Problema**: Mensagens não são interceptadas
- **Solução**: Verificar console (F12) por erros
- **Causa**: Possível mudança nos módulos do WhatsApp

## 📚 Referências

- WPP Boladão: Código testado e funcionando usado como base
- WhatsApp Web: Reverse engineering dos módulos internos
- Manifest V3: Chrome Extension API

---

**Data de Implementação**: 2025-12-23
**Versão**: 1.0.0
**Status**: ✅ Funcional e Testado
