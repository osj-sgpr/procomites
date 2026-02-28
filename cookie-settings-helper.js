(function () {
  'use strict';

  // Helper para redirecionar para configurações de cookies
  function openCookieSettings() {
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/.test(ua);
    var isAndroid = /Android/.test(ua);
    var isChrome = /Chrome/.test(ua) && !/Edge/.test(ua);
    var isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);

    if (isIOS && isSafari) {
      // Safari iOS - não é possível abrir diretamente as configurações
      alert('Para permitir cookies no Safari iOS:\n\n1. Vá em Ajustes > Safari\n2. Desative "Bloquear Cookies"\n3. Vá em Ajustes > Safari > Avançado\n4. Desative "Prevenção de Rastreamento Inteligente"\n5. Recarregue esta página\n\nOu use o app Google Chrome.');
      return;
    }

    if (isAndroid && isChrome) {
      // Tentar abrir configurações do Chrome Android
      window.location.href = 'chrome://settings/content/cookies';
      setTimeout(function () {
        alert('Se a página não abrir:\n\n1. Toque em ⋮ > Configurações\n2. Vá em "Configurações de site"\n3. Toque em "Cookies"\n4. Permita cookies de terceiros\n5. Recarregue esta página');
      }, 1000);
      return;
    }

    if (isChrome && !isAndroid) {
      // Chrome desktop
      window.open('chrome://settings/content/cookies', '_blank');
      return;
    }

    // Fallback genérico
    alert('Para permitir cookies:\n\n1. Abra as configurações do seu navegador\n2. Procure por "Cookies" ou "Privacidade"\n3. Permita cookies de terceiros\n4. Saia do modo anônimo/privado\n5. Recarregue esta página\n\nRecomendamos usar o Chrome em modo normal.');
  }

  // Tenta detectar se cookies estão realmente bloqueados
  function testCookieSupport() {
    try {
      // Teste de cookie básico
      document.cookie = 'test=1; SameSite=None; Secure';
      var basicSupported = document.cookie.indexOf('test=1') !== -1;
      
      // Limpa
      document.cookie = 'test=; expires=Thu, 01 Jan 1970 00:00:00 GMT';

      // Teste de cookie de terceiros via iframe
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'about:blank';
      document.body.appendChild(iframe);
      
      var thirdPartySupported = false;
      try {
        var doc = iframe.contentWindow.document;
        doc.open();
        doc.write('<script>document.cookie="third=1; SameSite=None; Secure";</script>');
        doc.close();
        thirdPartySupported = !!doc.cookie;
      } catch (e) {
        thirdPartySupported = false;
      }
      
      document.body.removeChild(iframe);

      return {
        basic: basicSupported,
        thirdParty: thirdPartySupported,
        overall: basicSupported && thirdPartySupported
      };
    } catch (e) {
      return { basic: false, thirdParty: false, overall: false };
    }
  }

  // Adiciona botão flutuante de ajuda
  function addFloatingHelpButton() {
    if (document.getElementById('cookie-help-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'cookie-help-btn';
    btn.innerHTML = '🍪';
    btn.title = 'Ajuda com Cookies';
    btn.style.cssText = [
      'position: fixed',
      'bottom: 80px',
      'right: 20px',
      'width: 50px',
      'height: 50px',
      'border-radius: 50%',
      'background: #007bff',
      'color: white',
      'border: none',
      'font-size: 20px',
      'cursor: pointer',
      'z-index: 999998',
      'box-shadow: 0 2px 8px rgba(0,0,0,0.3)',
      'transition: transform 0.2s'
    ].join(';');

    btn.addEventListener('mouseenter', function () {
      this.style.transform = 'scale(1.1)';
    });

    btn.addEventListener('mouseleave', function () {
      this.style.transform = 'scale(1)';
    });

    btn.addEventListener('click', function () {
      var test = testCookieSupport();
      var message = 'Teste de Cookies:\n\n';
      message += 'Cookies básicos: ' + (test.basic ? '✅ OK' : '❌ Bloqueado') + '\n';
      message += 'Cookies de terceiros: ' + (test.thirdParty ? '✅ OK' : '❌ Bloqueado') + '\n\n';
      
      if (!test.overall) {
        message += 'Seu navegador está bloqueando cookies necessários.\n\n';
        message += 'Deseja abrir as configurações de cookies?';
        if (confirm(message)) {
          openCookieSettings();
        }
      } else {
        message += 'Cookies estão funcionando!\n\n';
        message += 'Se ainda tiver problemas, recarregue a página.';
        alert(message);
      }
    });

    document.body.appendChild(btn);
  }

  // Inicializa
  function init() {
    // Adiciona botão de ajuda após 2 segundos
    setTimeout(addFloatingHelpButton, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exporta funções para uso global
  window.CookieHelper = {
    testSupport: testCookieSupport,
    openSettings: openCookieSettings,
    addHelpButton: addFloatingHelpButton
  };

})();
