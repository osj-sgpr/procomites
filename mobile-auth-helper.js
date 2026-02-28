(function () {
  'use strict';

  // Detecta se o navegador bloqueia cookies de terceiros
  function hasThirdPartyCookieSupport() {
    try {
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'about:blank';
      document.body.appendChild(iframe);
      var doc = iframe.contentWindow.document;
      doc.open();
      doc.write('<script>document.cookie="testcookie=1; SameSite=None; Secure";</script>');
      doc.close();
      var supported = !!doc.cookie;
      document.body.removeChild(iframe);
      return supported;
    } catch (e) {
      return false;
    }
  }

  // Verifica se está em contexto mobile ou navegador restrito
  function isRestrictedContext() {
    var ua = navigator.userAgent || '';
    var isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    var isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    var isChrome = /Chrome/.test(ua);
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    // Safari no iOS sempre bloqueia cookies de terceiros
    if (/iPhone|iPad|iPod/.test(ua) && isSafari) return true;
    
    // Chrome mobile pode bloquear dependendo da versão
    if (isMobile && isChrome) {
      var match = ua.match(/Chrome\/(\d+)/);
      if (match && parseInt(match[1]) >= 115) return true;
    }
    
    // PWA standalone mode
    if (isStandalone) return true;
    
    // Teste direto de suporte a cookies
    return !hasThirdPartyCookieSupport();
  }

  // Força uso de signInWithRedirect em contextos restritos
  function adaptFirebaseAuth() {
    if (!window.firebase || !window.firebase.auth) return;

    var originalSignInWithPopup = firebase.auth().signInWithPopup;
    var originalSignInWithRedirect = firebase.auth().signInWithRedirect;

    firebase.auth().signInWithPopup = function (provider) {
      if (isRestrictedContext()) {
        console.warn('Detectado navegador com bloqueio de cookies. Usando signInWithRedirect em vez de signInWithPopup.');
        return originalSignInWithRedirect.call(this, provider)
          .then(function () {
            // Aguardar redirecionamento
            return new Promise(function () {}); // Nunca resolve, pois redireciona
          })
          .catch(function (error) {
            console.error('Erro no signInWithRedirect:', error);
            throw error;
          });
      } else {
        return originalSignInWithPopup.call(this, provider);
      }
    };

    // Adicionar método para verificar contexto
    firebase.auth._isRestrictedContext = isRestrictedContext;
  }

  // Adiciona mensagem de compatibilidade para usuários mobile
  function showCompatibilityNotice() {
    if (!isRestrictedContext()) return;
    if (localStorage.getItem('procomites-mobile-notice-dismissed')) return;

    var notice = document.createElement('div');
    notice.id = 'procomites-mobile-notice';
    notice.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100%',
      'background: #fff3cd',
      'border-bottom: 1px solid #ffeaa7',
      'padding: 12px 16px',
      'z-index: 1000000',
      'font-family: system-ui, -apple-system, sans-serif',
      'font-size: 14px',
      'color: #856404',
      'text-align: center',
      'box-sizing: border-box'
    ].join(';');

    notice.innerHTML = '' +
      '<div style="max-width: 800px; margin: 0 auto; line-height: 1.4;">' +
        '<strong>Nota:</strong> Seu navegador pode bloquear cookies necessários. ' +
        'Se tiver problemas ao fazer login, <strong>use o navegador Chrome em modo normal</strong> (não anônimo) ou <strong>permita cookies de terceiros</strong> nas configurações.' +
        '<button id="procomites-mobile-notice-btn" style="margin-left: 12px; padding: 4px 12px; background: #856404; color: white; border: none; border-radius: 4px; cursor: pointer;">Entendido</button>' +
      '</div>';

    document.body.insertBefore(notice, document.body.firstChild);

    document.getElementById('procomites-mobile-notice-btn').addEventListener('click', function () {
      localStorage.setItem('procomites-mobile-notice-dismissed', '1');
      var el = document.getElementById('procomites-mobile-notice');
      if (el) el.remove();
    });
  }

  // Inicializa quando DOM estiver pronto
  function init() {
    adaptFirebaseAuth();
    setTimeout(showCompatibilityNotice, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
