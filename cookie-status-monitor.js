(function () {
  'use strict';

  // Monitor contínuo do status de cookies
  var monitorInterval = null;
  var lastStatus = null;
  var statusElement = null;

  function createStatusIndicator() {
    if (document.getElementById('cookie-status-indicator')) return;

    var indicator = document.createElement('div');
    indicator.id = 'cookie-status-indicator';
    indicator.style.cssText = [
      'position: fixed',
      'top: 10px',
      'right: 10px',
      'background: rgba(0,0,0,0.8)',
      'color: white',
      'padding: 8px 12px',
      'border-radius: 20px',
      'font-size: 12px',
      'font-family: monospace',
      'z-index: 999999',
      'opacity: 0',
      'transition: opacity 0.3s',
      'pointer-events: none',
      'max-width: 200px',
      'text-align: center'
    ].join(';');

    document.body.appendChild(indicator);
    return indicator;
  }

  function updateStatusIndicator(status) {
    if (!statusElement) statusElement = createStatusIndicator();

    var text = '';
    var bgColor = 'rgba(0,0,0,0.8)';

    if (status.overall) {
      text = '🟢 COOKIES OK';
      bgColor = 'rgba(40,167,69,0.9)';
    } else {
      var problems = [];
      if (!status.basic) problems.push('BÁSICO');
      if (!status.thirdParty) problems.push('3ºPARTY');
      if (!status.firebase) problems.push('FIREBASE');
      if (!status.jsonp) problems.push('JSONP');
      
      text = '🔴 ' + problems.join(' ');
      bgColor = 'rgba(220,53,69,0.9)';
    }

    statusElement.textContent = text;
    statusElement.style.background = bgColor;
    statusElement.style.opacity = '1';

    // Esconde após 3 segundos
    clearTimeout(statusElement.hideTimeout);
    statusElement.hideTimeout = setTimeout(function () {
      if (statusElement) statusElement.style.opacity = '0';
    }, 3000);
  }

  function performQuickTest() {
    var results = {
      basic: false,
      thirdParty: false,
      firebase: false,
      jsonp: false,
      overall: false
    };

    // Teste rápido de cookie básico
    try {
      var testValue = 'quick_test_' + Date.now();
      document.cookie = testValue + '=1; SameSite=None; Secure';
      results.basic = document.cookie.indexOf(testValue + '=1') !== -1;
      document.cookie = testValue + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch (e) {
      results.basic = false;
    }

    // Teste rápido de Firebase
    results.firebase = !!(window.firebase && window.firebase.auth);

    // Teste rápido de JSONP (verifica se há falhas recentes)
    var recentFailures = parseInt(sessionStorage.getItem('jsonp-failures') || '0');
    results.jsonp = recentFailures < 2;

    // Assume terceiros se básicos funcionam e JSONP funciona
    results.thirdParty = results.basic && results.jsonp;

    results.overall = results.basic && results.thirdParty && results.firebase && results.jsonp;
    
    return results;
  }

  function startMonitoring() {
    if (monitorInterval) return;

    monitorInterval = setInterval(function () {
      var currentStatus = performQuickTest();
      
      // Só atualiza se o status mudou
      if (!lastStatus || 
          currentStatus.basic !== lastStatus.basic ||
          currentStatus.thirdParty !== lastStatus.thirdParty ||
          currentStatus.firebase !== lastStatus.firebase ||
          currentStatus.jsonp !== lastStatus.jsonp) {
        
        updateStatusIndicator(currentStatus);
        lastStatus = currentStatus;

        // Se detectou problema, mostra aviso mais detalhado
        if (!currentStatus.overall) {
          showDetailedWarning(currentStatus);
        }
      }
    }, 5000); // Verifica a cada 5 segundos
  }

  function showDetailedWarning(status) {
    // Evita spam de avisos
    if (sessionStorage.getItem('cookie-warning-shown')) return;
    sessionStorage.setItem('cookie-warning-shown', '1');

    var warning = document.createElement('div');
    warning.id = 'cookie-detailed-warning';
    warning.style.cssText = [
      'position: fixed',
      'top: 60px',
      'right: 10px',
      'background: #dc3545',
      'color: white',
      'padding: 12px 16px',
      'border-radius: 8px',
      'font-size: 13px',
      'font-family: system-ui, -apple-system, sans-serif',
      'z-index: 999998',
      'max-width: 300px',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
      'line-height: 1.4'
    ];

    var problems = [];
    if (!status.basic) problems.push('Cookies básicos bloqueados');
    if (!status.thirdParty) problems.push('Cookies de terceiros bloqueados');
    if (!status.firebase) problems.push('Firebase não funciona');
    if (!status.jsonp) problems.push('Chamadas API falhando');

    warning.innerHTML = '' +
      '<div style="font-weight: bold; margin-bottom: 8px;">⚠️ PROBLEMAS DETECTADOS</div>' +
      '<div style="font-size: 12px;">' + problems.join('<br>') + '</div>' +
      '<div style="margin-top: 8px; font-size: 11px; opacity: 0.9;">Clique no 🍪 para ajuda detalhada</div>' +
      '<button onclick="this.parentElement.remove()" style="margin-top: 8px; padding: 4px 8px; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer; font-size: 11px;">Fechar</button>';

    document.body.appendChild(warning);

    // Auto-remove após 10 segundos
    setTimeout(function () {
      var el = document.getElementById('cookie-detailed-warning');
      if (el) el.remove();
    }, 10000);
  }

  // Inicia monitoramento
  function init() {
    // Teste inicial
    var initialStatus = performQuickTest();
    updateStatusIndicator(initialStatus);
    lastStatus = initialStatus;

    // Inicia monitoramento contínuo
    setTimeout(startMonitoring, 2000);

    // Limpa sessionStorage ao recarregar
    window.addEventListener('beforeunload', function () {
      sessionStorage.removeItem('cookie-warning-shown');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
