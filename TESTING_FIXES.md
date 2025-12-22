# Guia de Testes - Correções de Enter e Anexar Imagens

## Correções Implementadas

### 1. Envio via Tecla Enter
**Problema:** Envio de mensagens ao pressionar Enter não estava funcionando.

**Correções:**
- Melhorado `sendEnterKey()` com `shiftKey: false` explícito
- Timings ajustados para melhor sincronização
- Fallback confiável para botão de enviar
- Múltiplos seletores para campo de mensagem

### 2. Anexar Imagens
**Problema:** Envio de imagens anexadas não estava funcionando.

**Correções:**
- Melhorado `sendImageWithEnter()` com espera ativa
- Prioriza clicar no botão de enviar (mais confiável)
- Melhor busca de seletores para botão de anexar
- Fallback para Enter se botão falhar

## Como Testar

### Preparação
1. Abra o Chrome
2. Vá para `chrome://extensions/`
3. Ative "Modo do desenvolvedor"
4. Clique em "Atualizar" na extensão WhatsHybrid Lite
5. Abra https://web.whatsapp.com/
6. Faça login no WhatsApp Web
7. Abra o console do navegador (F12)

### Teste 1: Envio de Mensagem de Texto

#### Teste Manual (no painel da extensão):
1. Clique no ícone da extensão
2. Cole um número de teste: `5511999998888`
3. Digite uma mensagem de teste: `Testando Enter`
4. Clique em "Gerar tabela"
5. Clique em "Iniciar Campanha"
6. Observe os logs no console

**Resultado Esperado:**
- Console mostra: `[WHL] 📤 Enviando mensagem via tecla ENTER...`
- Console mostra: `[WHL] ✅ Campo de mensagem encontrado`
- Console mostra: `[WHL] ✅ Tecla ENTER enviada`
- Console mostra: `[WHL] 🔘 Clicando no botão de enviar (fallback confiável)`
- Mensagem é enviada com sucesso

#### Teste no WhatsApp Web (comportamento nativo):
1. Abra um chat qualquer no WhatsApp Web
2. Digite uma mensagem no campo
3. Pressione **Enter** → mensagem deve ser enviada
4. Digite outra mensagem
5. Pressione **Shift+Enter** → deve criar nova linha SEM enviar

**Resultado Esperado:**
- Enter envia a mensagem
- Shift+Enter cria nova linha

### Teste 2: Envio de Imagem SEM Legenda

1. No painel da extensão, clique em "📎 Anexar Imagem"
2. Selecione uma imagem do seu computador
3. Verifique que aparece: "✅ Imagem anexada e pronta para envio"
4. Cole um número de teste: `5511999998888`
5. **NÃO** digite mensagem (deixe em branco)
6. Clique em "Gerar tabela"
7. Clique em "Iniciar Campanha"
8. Observe os logs no console

**Resultado Esperado:**
- Console mostra: `[WHL] 📸 Modo IMAGEM detectado`
- Console mostra: `[WHL] 📸 Enviando imagem - iniciando processo`
- Console mostra: `[WHL] ✅ Botão de anexar encontrado`
- Console mostra: `[WHL] ✅ Input de imagem encontrado`
- Console mostra: `[WHL] ✅ Imagem anexada, aguardando preview...`
- Console mostra: `[WHL] ✅ Botão de enviar encontrado - clicando`
- Console mostra: `[WHL] ✅ Preview fechou - imagem enviada com sucesso!`
- Imagem é enviada sem legenda

### Teste 3: Envio de Imagem COM Legenda

1. No painel da extensão, clique em "📎 Anexar Imagem"
2. Selecione uma imagem do seu computador
3. Cole um número de teste: `5511999998888`
4. Digite uma mensagem: `Olá! Esta é uma imagem de teste.`
5. Clique em "Gerar tabela"
6. Clique em "Iniciar Campanha"
7. Observe os logs no console

**Resultado Esperado:**
- Console mostra: `[WHL] 📸 Modo IMAGEM detectado`
- Console mostra: `[WHL] ✏️ Digitando texto antes da imagem...`
- Console mostra: `[WHL] ✅ Texto digitado`
- Console mostra: `[WHL] 📸 Anexando imagem...`
- Console mostra: `[WHL] ✅ Botão de enviar encontrado - clicando`
- Console mostra: `[WHL] ✅ Imagem enviada`
- Imagem é enviada COM a legenda

### Teste 4: Remover Imagem

1. No painel da extensão, clique em "📎 Anexar Imagem"
2. Selecione uma imagem
3. Verifique que aparece: "✅ Imagem anexada e pronta para envio"
4. Clique em "🗑️ Remover"
5. Verifique que a mensagem desaparece
6. No preview, a imagem não deve mais aparecer

**Resultado Esperado:**
- Imagem é removida
- Preview não mostra mais a imagem
- Mensagem de status desaparece

### Teste 5: Campanha com Múltiplos Contatos

1. Cole vários números (um por linha):
```
5511999998888
5511988887777
5511977776666
```
2. Digite uma mensagem: `Mensagem de teste automática`
3. Opcionalmente, anexe uma imagem
4. Clique em "Gerar tabela"
5. Configure delays (mínimo 5s, máximo 10s)
6. Clique em "Iniciar Campanha"
7. Observe a barra de progresso e estatísticas

**Resultado Esperado:**
- Campanha inicia
- Para cada contato:
  - Chat é aberto via URL
  - Mensagem é enviada (com ou sem imagem)
  - Status atualiza: pending → opened → sent
- Barra de progresso atualiza em tempo real
- Estatísticas mostram: Enviados, Falhas, Pendentes
- Delay entre envios é respeitado

## Validação de Sucesso

### Mensagens de Texto
✅ Console mostra logs completos
✅ Mensagem aparece no chat do destinatário
✅ Status muda para "sent" (verde)
✅ Campo de mensagem fica vazio após envio

### Imagens
✅ Console mostra logs completos
✅ Imagem é anexada corretamente
✅ Preview de imagem é mostrado
✅ Botão de enviar é clicado
✅ Preview fecha após envio
✅ Imagem aparece no chat do destinatário
✅ Legenda (se houver) aparece corretamente

### Campanha Automática
✅ Múltiplos contatos são processados em sequência
✅ Delays entre envios são respeitados
✅ Barra de progresso atualiza
✅ Estatísticas são precisas
✅ Campanha pode ser pausada/retomada
✅ Campanha pode ser parada

## Troubleshooting

### Enter não envia
**Possível causa:** Campo de mensagem não encontrado
**Solução:** Verificar se está em um chat aberto no WhatsApp Web

### Imagem não anexa
**Possível causa:** Botão de anexar não encontrado
**Solução:** Verificar se está em um chat aberto no WhatsApp Web

### Preview não fecha
**Possível causa:** Botão de enviar não foi clicado
**Solução:** Código já tem fallback, verificar logs no console

### Campanha para no meio
**Possível causa:** Erro em um número específico
**Solução:** Ativar "Continuar em erros" nas configurações

## Logs Importantes

Procure por estes logs no console:

### Envio de Texto:
```
[WHL] 📤 Enviando mensagem via tecla ENTER...
[WHL] ✅ Campo de mensagem encontrado
[WHL] 🔘 Clicando no botão de enviar (fallback confiável)
[WHL] ✅ Mensagem enviada com sucesso!
```

### Envio de Imagem:
```
[WHL] 📸 Enviando imagem - iniciando processo
[WHL] ✅ Botão de anexar encontrado
[WHL] ✅ Input de imagem encontrado
[WHL] ✅ Imagem anexada, aguardando preview...
[WHL] ✅ Botão de enviar encontrado - clicando
[WHL] ✅ Preview fechou - imagem enviada com sucesso!
```

## Conclusão

Se todos os testes passarem:
- ✅ Funcionalidade de Enter está corrigida
- ✅ Funcionalidade de anexar imagens está corrigida
- ✅ Shift+Enter continua funcionando para nova linha (WhatsApp nativo)
- ✅ Compatibilidade com WhatsApp Web moderno garantida
