# WhatsHybrid Lite - Browser Extension

Uma extensão para navegador que automatiza o envio de mensagens no WhatsApp Web.

## ✨ Melhorias Recentes

### 📊 Barra de Progresso em Tempo Real
A barra de progresso agora reflete o progresso real das operações em tempo real:
- ✅ Atualização imediata após cada mensagem enviada
- ✅ Estatísticas precisas (Enviados, Falhas, Pendentes)
- ✅ Porcentagem de conclusão atualizada instantaneamente
- ✅ Feedback visual durante toda a execução da campanha

### 📱 Integridade dos Números de Telefone
Os números de telefone utilizados são sempre os números reais dos contatos:
- ✅ Números vêm da entrada do usuário (textarea ou CSV)
- ✅ Sanitização apenas remove caracteres não-numéricos (espaços, hífens)
- ✅ Nenhum número aleatório é gerado ou utilizado
- ✅ Validação garante formato correto (8-15 dígitos)

## 🚀 Funcionalidades

### Envio Automático de Mensagens
- Envio 100% automático via DOM manipulation
- Sem recarregamento de página
- Delays personalizáveis entre envios (min/max)
- Efeito de digitação para simular comportamento humano

### Gerenciamento de Campanhas
- Importação de números via textarea ou CSV
- Preview da mensagem no estilo WhatsApp
- Suporte a imagens (enviadas automaticamente)
- Controle de campanha: Iniciar, Pausar, Parar
- Sistema de retry automático em falhas
- Opção de continuar em erros

### Extração de Contatos
- Extração automática de números do WhatsApp Web
- Suporte a múltiplas fontes de dados
- Scroll automático para coletar todos os contatos
- Validação de números (8-15 dígitos)

### Estatísticas e Relatórios
- Contador de mensagens enviadas
- Contador de falhas
- Contador de pendentes
- Barra de progresso visual
- Exportação de relatórios em CSV
- Cópia rápida de números com falha

## 📋 Como Usar

1. **Instalação**
   - Clone o repositório
   - Abra Chrome e vá para `chrome://extensions/`
   - Ative "Modo do desenvolvedor"
   - Clique em "Carregar sem compactação"
   - Selecione a pasta do projeto

2. **Configuração**
   - Abra o WhatsApp Web
   - Clique no ícone da extensão
   - Configure os delays e opções
   - Cole os números de telefone (um por linha)
   - Digite sua mensagem
   - Opcionalmente, adicione uma imagem

3. **Execução**
   - Clique em "Gerar tabela" para criar a fila
   - Revise os números e a mensagem
   - Clique em "Iniciar Campanha"
   - Acompanhe o progresso em tempo real

## 🔧 Configurações

### Parâmetros de Automação
- **Delay mínimo**: Tempo mínimo entre envios (segundos)
- **Delay máximo**: Tempo máximo entre envios (segundos)
- **Retry**: Número de tentativas extras em caso de falha (0-5)
- **Agendamento**: Iniciar campanha em horário específico

### Opções Avançadas
- **Continuar em erros**: Não interromper campanha em falhas
- **Efeito digitação**: Simular digitação humana (recomendado)
- **Overlay busca**: Destacar campo de pesquisa durante operação
- **Fallback DOM→URL**: Tentar URL se DOM falhar

## 📊 Progresso e Estatísticas

A interface exibe em tempo real:
- **Enviados**: Quantidade de mensagens enviadas com sucesso
- **Falhas**: Quantidade de mensagens que falharam
- **Pendentes**: Quantidade de mensagens aguardando envio
- **Barra de Progresso**: Visualização gráfica do progresso (%)
- **Tabela de Fila**: Lista completa com status de cada contato

### Status dos Contatos
- 🔵 **pending**: Aguardando processamento
- 🟣 **opened**: Chat aberto, preparando envio
- 🟢 **sent**: Mensagem enviada com sucesso
- 🔴 **failed**: Falha no envio (após todas as tentativas)
- ⚠️ **invalid**: Número inválido (fora do formato)

## 🔒 Segurança e Integridade

### Números de Telefone
- **NUNCA** gera números aleatórios
- Utiliza SOMENTE os números fornecidos pelo usuário
- Sanitização remove apenas formatação (espaços, hífens, parênteses)
- Preserva completamente os dígitos originais

Exemplo de sanitização:
```
Entrada: +55 (11) 99999-8888
Saída: 5511999998888
```

### Validação
- Aceita números com 8 a 15 dígitos
- Formatos aceitos: internacional, nacional, local
- Números inválidos são marcados e podem ser revisados antes do envio

## 🐛 Troubleshooting

### A barra de progresso não atualiza
✅ **RESOLVIDO**: A barra agora atualiza em tempo real após cada operação.

### Os números não correspondem aos meus contatos
✅ **VERIFICADO**: Os números utilizados são exatamente os números inseridos (após sanitização). Nenhum número aleatório é gerado.

### Mensagens não estão sendo enviadas
- Verifique se está logado no WhatsApp Web
- Certifique-se de que os números são válidos
- Verifique as configurações de delay
- Veja os logs no console do navegador (F12)

### Campanha parou no meio
- Verifique a opção "Continuar em erros"
- Revise o número de retries
- Alguns números podem estar bloqueados ou inválidos

## 📝 Estrutura de Arquivos

```
ultimo/
├── manifest.json           # Configuração da extensão
├── content/
│   ├── content.js         # Script principal (DOM manipulation)
│   └── extractor.contacts.js  # Extrator de contatos
├── popup/
│   ├── popup.html         # Interface do popup
│   └── popup.js           # Lógica do popup
├── icons/                 # Ícones da extensão
├── VERIFICATION.md        # Checklist de verificação
└── README.md             # Este arquivo
```

## 🔍 Detalhes Técnicos

### Manipulação DOM
O sistema utiliza manipulação direta do DOM do WhatsApp Web para:
- Abrir chats sem recarregar a página
- Digitar mensagens com efeito de digitação
- Enviar mensagens e imagens
- Extrair contatos disponíveis

### Armazenamento
- Utiliza `chrome.storage.local` para persistência
- Estado da campanha é salvo continuamente
- Rascunhos podem ser salvos e carregados

### Comunicação
- Content script se comunica com popup via `chrome.runtime`
- Extrator usa `window.postMessage` para isolamento

## 📄 Licença

Este projeto é open source e está disponível sob a licença MIT.

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:
1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📞 Suporte

Para reportar bugs ou solicitar features, abra uma issue no GitHub.

---

**Nota**: Esta extensão é para uso educacional e de automação pessoal. Use com responsabilidade e respeite os termos de serviço do WhatsApp.
