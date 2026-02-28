(function () {
  var CONSENT_KEY = 'procomites-cookie-consent';
  var overlayId = 'procomites-cookie-consent-overlay';

  // Detecta se está em mobile ou navegador restrito
  function isRestrictedContext() {
    var ua = navigator.userAgent || '';
    var isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    var isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    
    // Safari no iOS sempre bloqueia cookies de terceiros
    if (/iPhone|iPad|iPod/.test(ua) && isSafari) return true;
    
    // Teste direto de suporte a cookies
    try {
      document.cookie = 'testcookie=1; SameSite=None; Secure';
      var supported = document.cookie.indexOf('testcookie=') !== -1;
      document.cookie = 'testcookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      return !supported;
    } catch (e) {
      return true;
    }
  }

  function showConsent() {
    if (localStorage.getItem(CONSENT_KEY)) return;

    var overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'cookie-consent-overlay';
    
    // Mensagem reforçada para mobile
    var isRestricted = isRestrictedContext();
    var message = isRestricted 
      ? 'Este site usa cookies essenciais para autenticação. Seu navegador pode bloqueá-los. Para melhor funcionamento, use o Chrome ou permita cookies de terceiros nas configurações.'
      : 'Este site usa cookies essenciais para autenticação (Firebase) e para garantir o funcionamento correto do sistema. Ao continuar, você concorda com o uso de cookies.';

    overlay.innerHTML = '' +
      '<div class="cookie-consent-box">' +
        '<div>' +
          '<h2>Uso de Cookies</h2>' +
          '<p>' + message + '</p>' +
          (isRestricted ? '<p style="font-size: 12px; color: #dc3545; margin-top: 4px;"><strong>⚠️ Navegador restrito detectado</strong></p>' : '') +
        '</div>' +
        '<button type="button" id="procomites-cookie-consent-btn">OK, entendi</button>' +
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

    // Força visibilidade em mobile
    if (isRestricted) {
      setTimeout(function () {
        var el = document.getElementById(overlayId);
        if (el) {
          el.style.display = 'block';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
        }
      }, 100);
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
