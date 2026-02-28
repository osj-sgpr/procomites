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
          '<p>Este site usa cookies essenciais para autenticação (Firebase) e para garantir o funcionamento correto do sistema. Ao continuar, você concorda com o uso de cookies.</p>' +
        '</div>' +
        '<button type="button" id="procomites-cookie-consent-btn">OK, entendi</button>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('procomites-cookie-consent-btn').addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, '1');
      var el = document.getElementById(overlayId);
      if (el) el.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showConsent);
  } else {
    showConsent();
  }
})();
