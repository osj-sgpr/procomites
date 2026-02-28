(function () {
  'use strict';

  // Fallback para chamadas JSONP em navegadores que bloqueiam cookies
  function createJsonpFallback() {
    // Cache global para evitar múltiplas tentativas
    var fallbackCache = {};
    var isUsingFallback = false;

    // Detecta se JSONP está falhando (baseado em erros recentes)
    function shouldUseFallback() {
      var recentFailures = parseInt(sessionStorage.getItem('jsonp-failures') || '0');
      return recentFailures >= 2 || isUsingFallback;
    }

    // Incrementa contador de falhas
    function incrementFailures() {
      var current = parseInt(sessionStorage.getItem('jsonp-failures') || '0');
      sessionStorage.setItem('jsonp-failures', String(current + 1));
      if (current >= 1) isUsingFallback = true;
    }

    // Reseta contador em sucesso
    function resetFailures() {
      sessionStorage.removeItem('jsonp-failures');
      isUsingFallback = false;
    }

    // Fallback usando fetch com CORS (se backend suportar)
    function fetchFallback(url, payload) {
      return new Promise(function (resolve, reject) {
        // Tentar usar fetch se a URL for HTTPS e suportar CORS
        if (url.startsWith('https://') && !url.includes('script.google.com')) {
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
          })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
          })
          .then(resolve)
          .catch(function () {
            // Se fetch falhar, tentar via iframe
            iframeFallback(url, payload, resolve, reject);
          });
        } else {
          // Fallback via iframe para Apps Script
          iframeFallback(url, payload, resolve, reject);
        }
      });
    }

    // Fallback usando iframe oculto (funciona com Apps Script)
    function iframeFallback(url, payload, resolve, reject) {
      var iframeId = 'jsonp-fallback-' + Date.now();
      var iframe = document.createElement('iframe');
      iframe.id = iframeId;
      iframe.style.display = 'none';
      iframe.name = iframeId;

      // Formulário para POST via iframe
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      form.target = iframeId;

      // Adicionar campos do payload
      Object.keys(payload).forEach(function (key) {
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = typeof payload[key] === 'object' ? JSON.stringify(payload[key]) : payload[key];
        form.appendChild(input);
      });

      // Timeout para o fallback
      var timeout = setTimeout(function () {
        cleanup();
        reject(new Error('Timeout no fallback JSONP.'));
      }, 30000);

      function cleanup() {
        clearTimeout(timeout);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (form.parentNode) form.parentNode.removeChild(form);
      }

      // Listener para resposta (se o backend suportar)
      window.addEventListener('message', function handler(event) {
        if (event.source !== iframe.contentWindow) return;
        cleanup();
        window.removeEventListener('message', handler);
        try {
          var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          resolve(data);
        } catch (e) {
          reject(new Error('Resposta inválida do fallback.'));
        }
      });

      // Inserir e enviar
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
    }

    // Wrapper para chamadas API com fallback automático
    function apiWithFallback(originalApiFunction) {
      return function (payload) {
        if (shouldUseFallback()) {
          console.warn('Usando fallback JSONP devido a falhas anteriores.');
          var bases = window.getApiBaseUrls ? window.getApiBaseUrls() : [window.APPS_SCRIPT_URL];
          return fetchFallback(bases[0], payload);
        } else {
          return originalApiFunction(payload)
            .then(function (result) {
              resetFailures();
              return result;
            })
            .catch(function (error) {
              incrementFailures();
              console.warn('JSONP falhou, tentando fallback:', error.message);
              var bases = window.getApiBaseUrls ? window.getApiBaseUrls() : [window.APPS_SCRIPT_URL];
              return fetchFallback(bases[0], payload);
            });
        }
      };
    }

    return {
      apiWithFallback: apiWithFallback,
      shouldUseFallback: shouldUseFallback,
      resetFailures: resetFailures
    };
  }

  // Inicializa o fallback globalmente
  window.JsonpFallback = createJsonpFallback();

})();
