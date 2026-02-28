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
      'box-sizing: border-box',
      'line-height: 1.4'
    ].join(';');

    var ua = navigator.userAgent || '';
    var isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    var isChrome = /Chrome/.test(ua);
    var isIOS = /iPhone|iPad|iPod/.test(ua);

    var instructions = '';
    if (isIOS && isSafari) {
      instructions = '' +
        '<div style="margin-top: 8px; font-size: 12px; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto;">' +
          '<strong>Para permitir cookies no Safari iOS:</strong><br>' +
          '1. Vá em <strong>Ajustes > Safari</strong><br>' +
          '2. Desative <strong>Bloquear Cookies</strong> ou escolha <strong>"De sites visitados"</strong><br>' +
          '3. Vá em <strong>Ajustes > Safari > Avançado</strong><br>' +
          '4. Desative <strong>Prevenção de Rastreamento Inteligente</strong><br>' +
          '5. Recarregue esta página<br>' +
          '<em>Ou use o app Google Chrome para melhor compatibilidade.</em>' +
        '</div>';
    } else if (isChrome) {
      instructions = '' +
        '<div style="margin-top: 8px; font-size: 12px; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto;">' +
          '<strong>Para permitir cookies no Chrome:</strong><br>' +
          '1. Toque em <strong>⋮</strong> (menu) > <strong>Configurações</strong><br>' +
          '2. Vá em <strong>Configurações de site</strong><br>' +
          '3. Toque em <strong>Cookies</strong><br>' +
          '4. Permita cookies de <strong>"sites de terceiros"</strong><br>' +
          '5. Recarregue esta página<br>' +
          '<em>Se estiver em modo anônimo, saia do modo anônimo.</em>' +
        '</div>';
    } else {
      instructions = '' +
        '<div style="margin-top: 8px; font-size: 12px; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto;">' +
          '<strong>Para permitir cookies:</strong><br>' +
          '1. Abra as configurações do navegador<br>' +
          '2. Procure por "Cookies" ou "Privacidade"<br>' +
          '3. Permita cookies de terceiros<br>' +
          '4. Saia do modo anônimo/privado<br>' +
          '5. Recarregue esta página<br>' +
          '<em>Recomendamos usar o Chrome em modo normal.</em>' +
        '</div>';
    }

    notice.innerHTML = '' +
      '<div style="max-width: 800px; margin: 0 auto;">' +
        '<strong>⚠️ Navegador com restrição detectado</strong><br>' +
        '<span style="font-size: 13px;">Seu navegador está bloqueando cookies necessários para o login e funcionamento do site.</span>' +
        instructions +
        '<div style="margin-top: 12px;">' +
          '<button id="procomites-mobile-notice-btn" style="margin-right: 8px; padding: 6px 16px; background: #856404; color: white; border: none; border-radius: 4px; cursor: pointer;">Entendido</button>' +
          '<button id="procomites-mobile-notice-reload" style="padding: 6px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Recarregar</button>' +
        '</div>' +
      '</div>';

    document.body.insertBefore(notice, document.body.firstChild);

    document.getElementById('procomites-mobile-notice-btn').addEventListener('click', function () {
      localStorage.setItem('procomites-mobile-notice-dismissed', '1');
      var el = document.getElementById('procomites-mobile-notice');
      if (el) el.remove();
    });

    document.getElementById('procomites-mobile-notice-reload').addEventListener('click', function () {
      localStorage.removeItem('procomites-mobile-notice-dismissed');
      window.location.reload();
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
