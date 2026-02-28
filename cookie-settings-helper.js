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
    var results = {
      basic: false,
      thirdParty: false,
      firebase: false,
      jsonp: false,
      overall: false
    };

    // Teste 1: Cookie básico
    try {
      document.cookie = 'test_basic=1; SameSite=None; Secure';
      results.basic = document.cookie.indexOf('test_basic=1') !== -1;
      document.cookie = 'test_basic=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch (e) {
      results.basic = false;
    }

    // Teste 2: Cookie de terceiros via iframe
    try {
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'about:blank';
      document.body.appendChild(iframe);
      
      var doc = iframe.contentWindow.document;
      doc.open();
      doc.write('<script>try { document.cookie="test_third=1; SameSite=None; Secure"; window.parent.cookieTestResult = true; } catch(e) { window.parent.cookieTestResult = false; }</script>');
      doc.close();
      
      // Espera um pouco e verifica
      setTimeout(function() {
        results.thirdParty = window.cookieTestResult === true;
        document.body.removeChild(iframe);
      }, 100);
    } catch (e) {
      results.thirdParty = false;
    }

    // Teste 3: Firebase Auth (se disponível)
    if (window.firebase && window.firebase.auth) {
      try {
        // Tenta acessar o estado de autenticação
        var auth = window.firebase.auth();
        results.firebase = !!auth;
      } catch (e) {
        results.firebase = false;
      }
    }

    // Teste 4: JSONP (tenta uma chamada de teste)
    try {
      var testUrl = window.APPS_SCRIPT_URL || 'https://httpbin.org/json';
      var testScript = document.createElement('script');
      testScript.src = testUrl + '?callback=cookieJsonpTest';
      testScript.onerror = function() {
        results.jsonp = false;
      };
      testScript.onload = function() {
        results.jsonp = window.cookieJsonpTest !== undefined;
        delete window.cookieJsonpTest;
      };
      
      window.cookieJsonpTest = function() {
        results.jsonp = true;
      };
      
      document.head.appendChild(testScript);
      setTimeout(function() {
        if (testScript.parentNode) testScript.parentNode.removeChild(testScript);
      }, 1000);
    } catch (e) {
      results.jsonp = false;
    }

    // Resultado geral
    results.overall = results.basic && results.thirdParty && results.firebase && results.jsonp;
    
    return results;
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
      
      // Constrói mensagem detalhada
      var message = '🔍 DIAGNÓSTICO COMPLETO DE COOKIES\n\n';
      message += '🍪 Cookies básicos: ' + (test.basic ? '✅ FUNCIONANDO' : '❌ BLOQUEADO') + '\n';
      message += '🌐 Cookies de terceiros: ' + (test.thirdParty ? '✅ FUNCIONANDO' : '❌ BLOQUEADO') + '\n';
      message += '🔥 Firebase Auth: ' + (test.firebase ? '✅ CARREGADO' : '❌ FALHANDO') + '\n';
      message += '📡 Chamadas JSONP: ' + (test.jsonp ? '✅ FUNCIONANDO' : '❌ FALHANDO') + '\n\n';
      
      // Análise detalhada
      var issues = [];
      if (!test.basic) issues.push('Cookies básicos estão bloqueados');
      if (!test.thirdParty) issues.push('Cookies de terceiros estão bloqueados');
      if (!test.firebase) issues.push('Firebase Auth não está funcionando');
      if (!test.jsonp) issues.push('Chamadas JSONP estão falhando');
      
      if (issues.length === 0) {
        message += '🎉 TODOS OS SISTEMAS ESTÃO OK!\n\n';
        message += 'Se ainda tiver problemas, pode ser outro motivo diferente de cookies.';
      } else {
        message += '⚠️ PROBLEMAS DETECTADOS:\n';
        issues.forEach(function(issue, i) {
          message += (i + 1) + '. ' + issue + '\n';
        });
        message += '\n';
        
        // Recomendações específicas
        if (!test.basic) {
          message += '💡 SOLUÇÃO:\n';
          message += 'Seu navegador está bloqueando TODOS os cookies.\n';
          message += 'Vá em configurações > privacidade > cookies e permita cookies.\n\n';
        } else if (!test.thirdParty) {
          message += '💡 SOLUÇÃO:\n';
          message += 'Seu navegador permite cookies básicos mas bloqueia terceiros.\n';
          message += 'Isso afeta Firebase e chamadas entre domínios.\n';
          message += 'Permita cookies de terceiros nas configurações.\n\n';
        } else if (!test.jsonp) {
          message += '💡 SOLUÇÃO:\n';
          message += 'JSONP está falhando (possivelmente bloqueado por CSP ou firewall).\n';
          message += 'Tente usar outro navegador ou desativar ad-blockers.\n\n';
        }
        
        message += 'Deseja abrir as configurações de cookies para corrigir?';
      }
      
      if (issues.length === 0) {
        alert(message);
      } else {
        if (confirm(message)) {
          openCookieSettings();
        }
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
