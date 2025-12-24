# Test Script - Validação de Seletores WhatsApp Web

Este documento contém scripts para testar os seletores atualizados no WhatsApp Web.

## Como Usar

1. Abra o WhatsApp Web (https://web.whatsapp.com)
2. Faça login e aguarde carregar completamente
3. Abra uma conversa qualquer
4. Abra o Console do navegador (F12 → Console)
5. Cole e execute os scripts abaixo

---

## Script 1: Validar Campo de Mensagem

```javascript
console.log('=== TESTE: Campo de Mensagem ===');

// Testar seletores do campo de mensagem
const msgSelectors = [
  'div[aria-label^="Digitar na conversa"][contenteditable="true"]',
  'div[data-tab="10"][contenteditable="true"]',
  'div[data-tab="10"]',
  '#main footer div[contenteditable="true"]',
  '#main footer p[contenteditable="true"]',
  'footer div[contenteditable="true"]',
  '#main footer p._aupe.copyable-text',
  'footer._ak1i div.copyable-area p',
  '#main footer p._aupe'
];

let msgField = null;
for (const selector of msgSelectors) {
  const el = document.querySelector(selector);
  if (el) {
    msgField = el;
    console.log('✅ Campo de mensagem encontrado com:', selector);
    break;
  }
}

if (!msgField) {
  console.log('❌ Campo de mensagem NÃO encontrado');
} else {
  console.log('Campo de mensagem:', msgField);
  console.log('Texto atual:', msgField.textContent);
}
```

---

## Script 2: Validar Botão de Enviar

```javascript
console.log('\n=== TESTE: Botão de Enviar ===');

function testFindSendButton() {
  // Verificar em dialog (para imagens/docs)
  const dialog = document.querySelector('[role="dialog"]');
  if (dialog) {
    console.log('📋 Dialog encontrado (preview de mídia)');
    
    const testIdBtn = dialog.querySelector('[data-testid="send"]');
    if (testIdBtn) {
      console.log('✅ Botão [data-testid="send"] encontrado no dialog');
      return testIdBtn;
    }
    
    const sendIcon = dialog.querySelector('span[data-icon="send"]');
    if (sendIcon) {
      const btn = sendIcon.closest('button');
      if (btn) {
        console.log('✅ Botão via span[data-icon="send"] encontrado no dialog');
        return btn;
      }
    }
  }
  
  // Verificar no footer (mensagens de texto)
  const footer = document.querySelector('footer');
  if (footer) {
    console.log('📋 Footer encontrado');
    
    const testIdBtn = footer.querySelector('[data-testid="send"]');
    if (testIdBtn) {
      console.log('✅ Botão [data-testid="send"] encontrado no footer');
      return testIdBtn;
    }
    
    const sendIcon = footer.querySelector('span[data-icon="send"]');
    if (sendIcon) {
      const btn = sendIcon.closest('button');
      if (btn) {
        console.log('✅ Botão via span[data-icon="send"] encontrado no footer');
        return btn;
      }
    }
  }
  
  // Verificar em #main
  const main = document.querySelector('#main');
  if (main) {
    const testIdBtn = main.querySelector('[data-testid="send"]');
    if (testIdBtn) {
      console.log('✅ Botão [data-testid="send"] encontrado no main');
      return testIdBtn;
    }
    
    const sendIcon = main.querySelector('span[data-icon="send"]');
    if (sendIcon) {
      const btn = sendIcon.closest('button');
      if (btn) {
        console.log('✅ Botão via span[data-icon="send"] encontrado no main');
        return btn;
      }
    }
  }
  
  console.log('❌ Botão de enviar NÃO encontrado');
  return null;
}

const sendBtn = testFindSendButton();
console.log('Botão de enviar:', sendBtn);
```

---

## Script 3: Validar Botão de Anexar

```javascript
console.log('\n=== TESTE: Botão de Anexar ===');

const attachSelectors = [
  '[data-testid="clip"]',
  'span[data-icon="clip"]',
  'button[aria-label*="Anexar"]',
  '[aria-label="Anexar"]',
  'span[data-icon="attach-menu-plus"]',
  'footer button[title*="Anexar"]'
];

let attachBtn = null;
for (const selector of attachSelectors) {
  let el = document.querySelector(selector);
  
  // Se for span, pegar o botão pai
  if (el && el.tagName === 'SPAN') {
    el = el.closest('button');
  }
  
  if (el) {
    attachBtn = el;
    console.log('✅ Botão de anexar encontrado com:', selector);
    break;
  }
}

if (!attachBtn) {
  console.log('❌ Botão de anexar NÃO encontrado');
} else {
  console.log('Botão de anexar:', attachBtn);
}
```

---

## Script 4: Validar Input de Imagem (após clicar em anexar)

**IMPORTANTE:** Execute este script DEPOIS de clicar no botão de anexar!

```javascript
console.log('\n=== TESTE: Input de Imagem ===');

// Aguardar um pouco para o menu aparecer
setTimeout(() => {
  const imageInput = document.querySelector('input[accept*="image"]') ||
                     document.querySelector('input[type="file"][accept*="image"]');
  
  if (imageInput) {
    console.log('✅ Input de imagem encontrado');
    console.log('Input:', imageInput);
    console.log('Accept:', imageInput.accept);
  } else {
    console.log('❌ Input de imagem NÃO encontrado');
    console.log('Nota: Certifique-se de clicar no botão de anexar primeiro!');
  }
}, 500);
```

---

## Script 5: Validar Campo de Legenda (após anexar imagem)

**IMPORTANTE:** Execute este script DEPOIS de anexar uma imagem!

```javascript
console.log('\n=== TESTE: Campo de Legenda ===');

const captionSelectors = [
  'div[aria-label*="legenda"][contenteditable="true"]',
  'div[aria-label*="Legenda"][contenteditable="true"]',
  'div[aria-label*="caption"][contenteditable="true"]',
  'div[aria-label*="Caption"][contenteditable="true"]',
  'div[aria-label*="Adicionar"][contenteditable="true"]',
  'div[contenteditable="true"][data-tab="10"]'
];

let captionBox = null;
for (const selector of captionSelectors) {
  const el = document.querySelector(selector);
  if (el && el.getAttribute('data-tab') !== '3') {
    captionBox = el;
    console.log('✅ Campo de legenda encontrado com:', selector);
    break;
  }
}

if (!captionBox) {
  console.log('❌ Campo de legenda NÃO encontrado');
  console.log('Nota: Certifique-se de ter anexado uma imagem primeiro!');
} else {
  console.log('Campo de legenda:', captionBox);
}
```

---

## Script Completo: Teste Automático

Execute este script para testar todos os seletores de uma vez:

```javascript
(async function testAllSelectors() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  TESTE AUTOMÁTICO DE SELETORES - WhatsApp Web      ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  const results = {
    messageField: false,
    sendButton: false,
    attachButton: false,
    imageInput: false,
    captionField: false
  };
  
  // 1. Campo de Mensagem
  console.log('1️⃣ Testando Campo de Mensagem...');
  const msgSelectors = [
    'div[aria-label^="Digitar na conversa"][contenteditable="true"]',
    'div[data-tab="10"][contenteditable="true"]',
    'div[data-tab="10"]',
    '#main footer div[contenteditable="true"]'
  ];
  
  for (const sel of msgSelectors) {
    if (document.querySelector(sel)) {
      console.log('   ✅ Encontrado:', sel);
      results.messageField = true;
      break;
    }
  }
  if (!results.messageField) console.log('   ❌ NÃO encontrado');
  
  // 2. Botão de Enviar
  console.log('\n2️⃣ Testando Botão de Enviar...');
  const sendTestId = document.querySelector('[data-testid="send"]');
  const sendIcon = document.querySelector('span[data-icon="send"]');
  
  if (sendTestId) {
    console.log('   ✅ Encontrado: [data-testid="send"]');
    results.sendButton = true;
  } else if (sendIcon && sendIcon.closest('button')) {
    console.log('   ✅ Encontrado: span[data-icon="send"]');
    results.sendButton = true;
  } else {
    console.log('   ❌ NÃO encontrado');
  }
  
  // 3. Botão de Anexar
  console.log('\n3️⃣ Testando Botão de Anexar...');
  const clipTestId = document.querySelector('[data-testid="clip"]');
  const clipIcon = document.querySelector('span[data-icon="clip"]');
  
  if (clipTestId) {
    console.log('   ✅ Encontrado: [data-testid="clip"]');
    results.attachButton = true;
  } else if (clipIcon && clipIcon.closest('button')) {
    console.log('   ✅ Encontrado: span[data-icon="clip"]');
    results.attachButton = true;
  } else {
    console.log('   ❌ NÃO encontrado');
  }
  
  // 4. Input de Imagem (pode não estar visível)
  console.log('\n4️⃣ Testando Input de Imagem...');
  const imageInput = document.querySelector('input[accept*="image"]');
  if (imageInput) {
    console.log('   ✅ Encontrado: input[accept*="image"]');
    results.imageInput = true;
  } else {
    console.log('   ⚠️ NÃO visível (normal se não clicou em anexar)');
  }
  
  // 5. Campo de Legenda (pode não estar visível)
  console.log('\n5️⃣ Testando Campo de Legenda...');
  const captionBox = document.querySelector('div[aria-label*="legenda"][contenteditable="true"]') ||
                     document.querySelector('div[aria-label*="Adicionar"][contenteditable="true"]');
  if (captionBox) {
    console.log('   ✅ Encontrado: campo de legenda');
    results.captionField = true;
  } else {
    console.log('   ⚠️ NÃO visível (normal se não anexou imagem)');
  }
  
  // Resumo
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  RESUMO DOS TESTES                                 ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`Campo de Mensagem:  ${results.messageField ? '✅ OK' : '❌ FALHOU'}`);
  console.log(`Botão de Enviar:    ${results.sendButton ? '✅ OK' : '❌ FALHOU'}`);
  console.log(`Botão de Anexar:    ${results.attachButton ? '✅ OK' : '❌ FALHOU'}`);
  console.log(`Input de Imagem:    ${results.imageInput ? '✅ OK' : '⚠️ NÃO VISÍVEL'}`);
  console.log(`Campo de Legenda:   ${results.captionField ? '✅ OK' : '⚠️ NÃO VISÍVEL'}`);
  
  const criticalTests = results.messageField && results.sendButton && results.attachButton;
  console.log(`\n🎯 Testes Críticos: ${criticalTests ? '✅ PASSOU' : '❌ FALHOU'}`);
  
  return results;
})();
```

---

## Notas Importantes

1. **Input de Imagem e Campo de Legenda** só ficam visíveis após interação do usuário
2. Execute os testes **dentro de uma conversa aberta** no WhatsApp Web
3. Se algum seletor falhar, verifique se você está usando a versão mais recente do WhatsApp Web
4. Os logs da extensão podem ser vistos com o prefixo `[WHL]` no console

---

## Troubleshooting

### Campo de Mensagem não encontrado
- Verifique se você está dentro de uma conversa
- Aguarde o WhatsApp Web carregar completamente
- Tente atualizar a página

### Botão de Enviar não encontrado
- Digite algum texto no campo de mensagem primeiro
- O botão só aparece quando há conteúdo para enviar

### Botão de Anexar não encontrado
- Verifique se está em uma conversa válida
- Alguns grupos podem ter anexos desabilitados

### Input/Legenda não encontrados
- Estes elementos só aparecem após interação
- Clique no botão de anexar e selecione uma imagem primeiro
