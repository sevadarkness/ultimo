# Implementação do Modo URL Exclusivo

## Resumo das Mudanças

Esta implementação **remove completamente o modo DOM** (busca via campo de pesquisa + clique) e implementa **envio EXCLUSIVO via URL** para todos os números.

## Mudanças Principais

### 1. Funções Removidas (Modo DOM)

As seguintes funções foram removidas ou marcadas como deprecated:

- `openChatBySearch()` - Abria chat via busca DOM
- `getSearchInput()` - Obtinha campo de busca
- `getSearchResults()` - Obtinha resultados de busca
- `clearSearchField()` - Limpava campo de busca
- `sendTextMessage()` - Enviava texto via DOM
- `typeMessageViaDom()` - Digitava mensagem via DOM
- `openChatViaDom()` - Abria chat via DOM
- `waitForSearchResults()` - Aguardava resultados de busca
- `whlEnsureOverlay()`, `whlOverlayOn()`, `whlOverlayOff()` - Funções de overlay

### 2. Funções Adicionadas (Modo URL)

Novas funções implementadas para envio via URL:

- **`sendViaURL(numero, mensagem, hasImage)`** - Função principal que navega para URL do WhatsApp
- **`checkForErrorPopup()`** - Verifica se há popup de erro (número inválido)
- **`closeErrorPopup()`** - Fecha popup de erro
- **`waitForChatToOpen(timeout)`** - Aguarda chat abrir após navegação
- **`clickSendButton()`** - Clica no botão enviar (para textos via URL)
- **`sendMessageViaURL(phoneNumber, message)`** - Wrapper principal de envio
- **`checkAndResumeCampaignAfterURLNavigation()`** - Retoma campanha após reload

### 3. Mudanças na UI

Removido da interface:
- Toggle "🎭 Overlay busca"
- Toggle "🧠 Fallback DOM→URL"
- Event listeners relacionados

Atualizado:
- Descrição do painel: "Modo **automático via URL**"
- Descrição do manifest: "envio 100% automático de mensagens no WhatsApp Web (URL)"

### 4. Mudanças no Estado

Campos removidos:
- `overlayMode`
- `fallbackMode`

Campos adicionados:
- `urlNavigationInProgress` - Indica navegação URL em andamento
- `currentPhoneNumber` - Número atual sendo processado
- `currentMessage` - Mensagem atual sendo enviada

## Fluxo de Envio

### Para TEXTO (sem imagem):

```
1. Navegar para: https://web.whatsapp.com/send?phone=NUMERO&text=MENSAGEM
2. [RELOAD DA PÁGINA]
3. Aguardar página carregar (4 segundos)
4. Verificar se há popup de erro
   - SE SIM: Fechar popup, marcar como falha, próximo número
5. Aguardar chat abrir (até 10 segundos)
   - SE NÃO ABRIR: Marcar como falha, próximo número
6. Clicar no botão "Enviar"
7. Aguardar delay aleatório
8. Próximo número
```

### Para IMAGEM (com ou sem legenda):

```
1. Navegar para: https://web.whatsapp.com/send?phone=NUMERO
   (sem parâmetro text, pois será a legenda da imagem)
2. [RELOAD DA PÁGINA]
3. Aguardar página carregar (4 segundos)
4. Verificar se há popup de erro
   - SE SIM: Fechar popup, marcar como falha, próximo número
5. Aguardar chat abrir (até 10 segundos)
   - SE NÃO ABRIR: Marcar como falha, próximo número
6. Chamar sendImage() que:
   - Clica no botão anexar
   - Seleciona e anexa a imagem
   - Se houver legenda: digita no campo de legenda
   - Clica no botão enviar da preview
7. Aguardar delay aleatório
8. Próximo número
```

## Tratamento de Erros

### Números Inválidos

Quando um número não existe no WhatsApp:
1. WhatsApp mostra popup "número de telefone compartilhado por url é inválido"
2. `checkForErrorPopup()` detecta o popup
3. `closeErrorPopup()` fecha o popup
4. Número marcado como `failed` com `errorReason: 'Número não encontrado no WhatsApp'`
5. Campanha continua para próximo número (se `continueOnError` estiver ativo)

### Chat Não Abre

Se o chat não abrir após navegação:
1. `waitForChatToOpen()` tenta por 10 segundos
2. Se falhar, marca como `failed` com `errorReason: 'Chat não abriu'`
3. Campanha continua para próximo número

### Falha no Envio

Se o botão enviar não for encontrado ou falhar:
1. Marca como `failed` com `errorReason: 'Falha no envio'`
2. Campanha continua para próximo número

## Persistência de Estado

O estado é salvo antes da navegação URL para permitir retomada após reload:

```javascript
st.urlNavigationInProgress = true;  // Flag de navegação
st.currentPhoneNumber = cleanNumber; // Número atual
st.currentMessage = mensagem;       // Mensagem atual
await setState(st);
window.location.href = url;         // RELOAD
```

Após reload, `checkAndResumeCampaignAfterURLNavigation()` verifica a flag e retoma o envio.

## Compatibilidade

### Funcionalidades Mantidas

✅ Envio de imagens  
✅ Envio de texto + imagem (legenda)  
✅ Detecção de erro (número não encontrado)  
✅ Registro de erros e sucessos  
✅ Barra de progresso  
✅ Delay entre envios  
✅ Efeito de digitação (para legendas)  
✅ Retry em falhas  
✅ Continuar em erros  
✅ Extração de contatos  

### Funcionalidades Removidas

❌ Modo DOM (busca via campo de pesquisa)  
❌ Fallback DOM→URL  
❌ Overlay de busca  

## Vantagens do Modo URL

1. **Mais confiável** - Não depende de seletores DOM que podem mudar
2. **Mais simples** - Menos código e lógica complexa
3. **Oficial** - Usa API de URL oficial do WhatsApp Web
4. **Menos suscetível a mudanças** - URL é mais estável que DOM

## Desvantagens do Modo URL

1. **Reload de página** - Cada envio causa um reload (pode ser mais lento)
2. **Estado deve ser persistido** - Complexidade adicional no gerenciamento de estado
3. **Experiência do usuário** - Usuário vê a página recarregando entre envios

## Observações Técnicas

- A função `sendImage()` **não foi modificada** e continua funcionando perfeitamente com o modo URL
- O campo `getMessageInput()` **foi mantido** pois é usado para envio de imagens
- A função `closeInvalidNumberPopup()` **foi mantida** e é usada no tratamento de erros
- Delays e estatísticas funcionam da mesma forma
- Compatível com agendamento e outras features existentes

## Teste Manual

Para testar a implementação:

1. Abrir WhatsApp Web
2. Carregar a extensão
3. Adicionar 2-3 números (um válido, um inválido)
4. Adicionar mensagem
5. Configurar delay de 5-10 segundos
6. Iniciar campanha
7. Observar:
   - Navegação para URL
   - Reload da página
   - Envio automático
   - Tratamento de erros
   - Progressão automática

## Código de Exemplo

### Envio de Texto

```javascript
// URL construída:
https://web.whatsapp.com/send?phone=5511999998888&text=Ol%C3%A1%2C%20tudo%20bem%3F

// Após reload, chat abre com texto pré-preenchido
// clickSendButton() clica no botão enviar
```

### Envio de Imagem

```javascript
// URL construída:
https://web.whatsapp.com/send?phone=5511999998888

// Após reload, chat abre vazio
// sendImage() anexa a imagem e adiciona legenda
// sendImage() clica no botão enviar da preview
```

## Conclusão

A implementação remove completamente o modo DOM e usa EXCLUSIVAMENTE navegação via URL, conforme especificado nos requisitos. Todas as funcionalidades principais foram mantidas, e o tratamento de erros foi aprimorado.
