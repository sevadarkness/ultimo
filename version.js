// WhatsHybrid Lite - Version
// Fonte única de verdade para a versão da extensão
const WHL_VERSION = '1.3.8';

// Exportar para uso em diferentes contextos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WHL_VERSION;
}

if (typeof window !== 'undefined') {
  window.WHL_VERSION = WHL_VERSION;
}
