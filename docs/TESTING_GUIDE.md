# Guia de Teste - Seletores Exatos do WhatsApp Web

## ⚠️ IMPORTANTE: Como Testar

Este guia descreve como testar as alterações implementadas para garantir que os seletores exatos estão funcionando corretamente.

---

## Pré-requisitos

1. ✅ WhatsApp Web aberto e logado
2. ✅ Extensão carregada no Chrome
3. ✅ Console do navegador aberto (F12)

---

## Teste 1: Verificar Seletores no Console

Abra o console do navegador (F12) e execute os seguintes comandos:

### 1.1 Campo de Pesquisa
```javascript
// Seletor principal (exato)
document.querySelector('div#side._ak9p p._aupe.copyable-text')

// Deve retornar: <p class="_aupe copyable-text">...</p>
```

**Esperado:** Elemento encontrado (não null)

### 1.2 Campo de Mensagem
```javascript
// Seletor principal (exato) - abra um chat primeiro!
document.querySelector('#main footer p._aupe.copyable-text')

// Deve retornar: <p class="_aupe copyable-text">...</p>
```

**Esperado:** Elemento encontrado quando um chat está aberto

### 1.3 Botão de Enviar
```javascript
// Seletor principal (exato) - abra um chat primeiro!
document.querySelector('footer._ak1i div._ak1r button')

// Deve retornar: <button>...</button>
```

**Esperado:** Botão encontrado quando um chat está aberto

### 1.4 Resultados da Busca
```javascript
// Digite algo no campo de pesquisa primeiro!
document.querySelectorAll('div#pane-side div._ak72')

// Deve retornar: NodeList com os resultados
```

**Esperado:** Lista de elementos quando há resultados de busca

---

## Teste 2: Testar Fluxo Completo (Manual)

### 2.1 Preparação
1. Abra WhatsApp Web
2. Carregue a extensão
3. Clique no ícone da extensão para abrir o painel
4. Configure:
   - Delay mínimo: 3 segundos
   - Delay máximo: 5 segundos
   - ✅ Continuar em erros: ATIVADO
   - ✅ Efeito digitação: ATIVADO

### 2.2 Adicionar Números de Teste

Cole 2-3 números de teste no campo "Números (um por linha)":
```
5511999998888
5511988887777
5521999998888
```

**⚠️ Use números reais e válidos que existam no seu WhatsApp!**

### 2.3 Digitar Mensagem
```
Olá! Esta é uma mensagem de teste da extensão WhatsHybrid Lite.
```

### 2.4 Gerar Tabela
1. Clique em "Gerar tabela"
2. Verifique que os números aparecem na tabela com status "pending"

### 2.5 Iniciar Campanha
1. Clique em "▶️ Iniciar Campanha"
2. Observe o console (F12) para logs detalhados

---

## Teste 3: Verificar Logs no Console

Durante a execução, você deve ver logs similares a estes:

### ✅ Sucesso Esperado
```
[WHL] ✅ Campo de pesquisa limpo
[WHL] ✅ Número digitado na busca: 5511999998888
[WHL] ✅ Chat aberto (seção Conversas)
[WHL] ✅ Mensagem digitada
[WHL] ✅ Mensagem enviada via botão
```

### ❌ Possíveis Erros
```
[WHL] ❌ Campo de pesquisa não encontrado
  → Verificar se o WhatsApp Web carregou completamente

[WHL] ❌ Nenhum resultado encontrado
  → Número pode não estar nos seus contatos
  → Verificar se o número é válido

[WHL] ❌ Resultado apenas em Mensagens, não em Conversas
  → Número aparece apenas em histórico de mensagens
  → Sistema está funcionando corretamente (ignorando como esperado)

[WHL] ❌ Botão de enviar não encontrado
  → Chat pode não ter carregado completamente
  → Aguardar alguns segundos e tentar novamente
```

---

## Teste 4: Verificar Filtro de Conversas vs Mensagens

### 4.1 Testar com Número em "Conversas"
1. Digite um número que está em suas conversas ativas
2. Observe: deve clicar no resultado e abrir o chat
3. Log esperado: `✅ Chat aberto (seção Conversas)`

### 4.2 Testar com Número APENAS em "Mensagens"
1. Digite um número que aparece apenas no histórico de mensagens
2. Observe: NÃO deve clicar no resultado
3. Log esperado: `❌ Resultado apenas em Mensagens, não em Conversas`

---

## Teste 5: Verificar Limpeza do Campo de Pesquisa

### 5.1 Observação Visual
1. Durante a campanha, observe o campo de pesquisa na sidebar
2. Antes de cada novo número, o campo deve ser limpo
3. Não deve haver texto residual do número anterior

### 5.2 Verificação no Console
```
[WHL] ✅ Campo de pesquisa limpo
[WHL] ✅ Número digitado na busca: 5511999998888
[WHL] ✅ Campo de pesquisa limpo
[WHL] ✅ Número digitado na busca: 5511988887777
```

**Esperado:** Log de limpeza antes de cada número

---

## Teste 6: Verificar Envio via Botão (não ENTER)

### 6.1 Observação no Console
Procure por este log:
```
[WHL] ✅ Mensagem enviada via botão
```

**❌ NÃO deve aparecer:** `Mensagem enviada via ENTER`

### 6.2 Verificação Visual
1. Observe o chat aberto
2. A mensagem deve aparecer enviada (com ✓✓)
3. Campo de mensagem deve ficar vazio após envio

---

## Teste 7: Teste de Estresse (Múltiplos Números)

### 7.1 Preparação
1. Adicione 5-10 números de teste
2. Configure delay entre 5-10 segundos
3. ✅ Ative "Continuar em erros"

### 7.2 Execução
1. Inicie a campanha
2. Observe o progresso na interface:
   - Barra de progresso deve atualizar após cada envio
   - Contador "Enviados" deve incrementar
   - Contador "Falhas" deve registrar erros
   - Contador "Pendentes" deve decrementar

### 7.3 Estatísticas Esperadas
```
Enviados: X  (números processados com sucesso)
Falhas: Y    (números inválidos ou erro de envio)
Pendentes: Z (números aguardando processamento)
```

---

## Teste 8: Teste de Seletores Alternativos (Fallback)

### 8.1 Simular Falha do Seletor Principal

No console, execute:
```javascript
// Ocultar o elemento com seletor principal
const el = document.querySelector('div#side._ak9p p._aupe.copyable-text');
if (el) el.style.display = 'none';
```

### 8.2 Verificar Fallback
1. Tente iniciar a campanha
2. O sistema deve usar o seletor alternativo:
   - `div#side._ak9p div.lexical-rich-text-input p._aupe`
   - ou `#side p._aupe`

---

## Checklist de Verificação Final

### ✅ Seletores
- [ ] Campo de pesquisa encontrado
- [ ] Campo de mensagem encontrado
- [ ] Botão de enviar encontrado
- [ ] Resultados de busca encontrados

### ✅ Funcionalidades
- [ ] Limpeza do campo antes de cada número
- [ ] Filtragem de Conversas vs Mensagens
- [ ] Envio via botão (não ENTER)
- [ ] Aguarda resultados antes de clicar

### ✅ Logs
- [ ] Logs aparecem no console
- [ ] Mensagens de sucesso claras (✅)
- [ ] Mensagens de erro claras (❌)
- [ ] Informações de debug detalhadas

### ✅ Interface
- [ ] Barra de progresso atualiza
- [ ] Contadores funcionam corretamente
- [ ] Status dos contatos muda (pending → opened → sent/failed)
- [ ] Botões habilitam/desabilitam corretamente

---

## Problemas Conhecidos e Soluções

### Problema 1: "Campo de pesquisa não encontrado"
**Causa:** WhatsApp Web ainda carregando  
**Solução:** Aguardar página carregar completamente antes de iniciar

### Problema 2: "Nenhum resultado encontrado"
**Causa:** Número não está nos contatos ou é inválido  
**Solução:** Verificar formato do número (8-15 dígitos)

### Problema 3: "Resultado apenas em Mensagens"
**Causa:** Número aparece só no histórico, não em conversas ativas  
**Solução:** Normal - sistema deve ignorar e continuar

### Problema 4: Mensagem não envia
**Causa:** Botão de enviar não encontrado  
**Solução:** 
1. Verificar se chat abriu corretamente
2. Aumentar delay entre etapas
3. Verificar logs de erro no console

---

## Contato para Reportar Problemas

Se encontrar problemas durante os testes:

1. **Capture:**
   - Screenshot da interface
   - Logs do console (F12 → Console)
   - Passos para reproduzir o problema

2. **Inclua:**
   - Versão do WhatsApp Web
   - Versão do Chrome
   - Sistema operacional

3. **Reporte:**
   - Abra uma issue no GitHub
   - Ou adicione comentário no PR

---

**Data:** 2025-12-22  
**Versão Testada:** 1.3.7+  
**Status:** ⏳ Aguardando testes
