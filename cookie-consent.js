(function () {
  var CONSENT_KEY = 'procomites-cookie-consent';
  var overlayId = 'procomites-cookie-consent-overlay';

  function showConsent() {
    if (localStorage.getItem(CONSENT_KEY)) return;

    var overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'cookie-consent-overlay';

    overlay.innerHTML = '' +
      '<div class="cookie-consent-box">' +
        '<div>' +
          '<h2>Uso de Cookies</h2>' +
          '<p>Este site usa cookies para oferecer a melhor experiência e garantir o funcionamento de todas as funcionalidades.</p>' +
        '</div>' +
        '<button type="button" id="procomites-cookie-consent-btn">OK</button>' +
      '</div>';

    // Inserir antes do </body> para garantir renderização
    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      // Fallback: inserir via document.write se body ainda não existir
      document.write(overlay.outerHTML);
    }

    // Adicionar listener com fallback para touch/click
    var btn = document.getElementById('procomites-cookie-consent-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        localStorage.setItem(CONSENT_KEY, '1');
        var el = document.getElementById(overlayId);
        if (el) el.remove();
      });
      btn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        localStorage.setItem(CONSENT_KEY, '1');
        var el = document.getElementById(overlayId);
        if (el) el.remove();
      });
    }
  }

  // Mostrar imediatamente se DOM já carregado, senão aguardar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showConsent);
  } else {
    // Timeout para garantir renderização em mobile
    setTimeout(showConsent, 100);
  }
})();
