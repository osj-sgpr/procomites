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
    
    // Mensagem direta e clara sobre necessidade de cookies
    var isRestricted = isRestrictedContext();
    var message = isRestricted 
      ? '⚠️ ATENÇÃO: Seu navegador está bloqueando cookies essenciais. Este site NÃO FUNCIONARÁ corretamente sem cookies. Por favor, permita cookies nas configurações do navegador ou use o Chrome em modo normal.'
      : 'Este site requer cookies essenciais para funcionar. Ao clicar "OK", você autoriza o uso de cookies necessários para autenticação e operação do sistema.';

    overlay.innerHTML = '' +
      '<div class="cookie-consent-box">' +
        '<div>' +
          '<h2>🔒 AUTORIZAÇÃO DE COOKIES NECESSÁRIA</h2>' +
          '<p>' + message + '</p>' +
          (isRestricted ? '<p style="font-size: 12px; color: #dc3545; margin-top: 6px;"><strong>🚫 O SITE NÃO IRÁ FUNCIONAR SEM COOKIES</strong></p>' : '') +
        '</div>' +
        '<div>' +
          '<button type="button" id="procomites-cookie-consent-btn" style="background: #28a745; padding: 10px 20px; font-weight: bold;">AUTORIZAR COOKIES</button>' +
        '</div>' +
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
        
        // Se estava restrito, mostra instruções após consentimento
        if (isRestricted) {
          setTimeout(showInstructions, 500);
        }
      });
      btn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        localStorage.setItem(CONSENT_KEY, '1');
        var el = document.getElementById(overlayId);
        if (el) el.remove();
        
        // Se estava restrito, mostra instruções após consentimento
        if (isRestricted) {
          setTimeout(showInstructions, 500);
        }
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

  function showInstructions() {
    if (localStorage.getItem('procomites-instructions-shown')) return;

    var ua = navigator.userAgent || '';
    var isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    var isChrome = /Chrome/.test(ua);
    var isIOS = /iPhone|iPad|iPod/.test(ua);

    var instructions = '';
    if (isIOS && isSafari) {
      instructions = '' +
        '<div style="margin-top: 12px; font-size: 13px; text-align: left; background: #f8f9fa; padding: 12px; border-radius: 6px;">' +
          '<h4 style="margin: 0 0 8px 0; color: #dc3545;">📱 Safari iOS - CONFIGURAÇÃO OBRIGATÓRIA:</h4>' +
          '<ol style="margin: 0; padding-left: 20px; line-height: 1.6;">' +
          '<li>Abra <strong>Ajustes</strong></li>' +
          '<li>Vá para <strong>Safari</strong></li>' +
          '<li>Desative <strong>"Bloquear Cookies"</strong></li>' +
          '<li>Vá em <strong>Safari > Avançado</strong></li>' +
          '<li>Desative <strong>"Prevenção de Rastreamento Inteligente"</strong></li>' +
          '<li><strong>RECARREGUE ESTA PÁGINA</strong></li>' +
          '</ol>' +
          '<p style="margin: 8px 0 0 0; font-size: 12px; color: #6c757d;"><strong>OU</strong>: Use o app Google Chrome (mais fácil)</p>' +
        '</div>';
    } else if (isChrome) {
      instructions = '' +
        '<div style="margin-top: 12px; font-size: 13px; text-align: left; background: #f8f9fa; padding: 12px; border-radius: 6px;">' +
          '<h4 style="margin: 0 0 8px 0; color: #dc3545;">🌐 Chrome - CONFIGURAÇÃO OBRIGATÓRIA:</h4>' +
          '<ol style="margin: 0; padding-left: 20px; line-height: 1.6;">' +
          '<li>Toque em <strong>⋮</strong> (menu)</li>' +
          '<li>Vá para <strong>Configurações</strong></li>' +
          '<li>Toque em <strong>Configurações de site</strong></li>' +
          '<li>Toque em <strong>Cookies</strong></li>' +
          '<li>Selecione <strong>"Permitir todos os cookies"</strong></li>' +
          '<li><strong>RECARREGUE ESTA PÁGINA</strong></li>' +
          '</ol>' +
          '<p style="margin: 8px 0 0 0; font-size: 12px; color: #6c757d;">Se estiver em modo anônimo, saia do modo anônimo primeiro</p>' +
        '</div>';
    }

    if (!instructions) return;

    var instructionOverlay = document.createElement('div');
    instructionOverlay.id = 'procomites-instructions-overlay';
    instructionOverlay.className = 'cookie-consent-overlay';
    instructionOverlay.style.background = 'rgba(220, 53, 69, 0.95)';
    instructionOverlay.style.zIndex = '1000001';

    instructionOverlay.innerHTML = '' +
      '<div class="cookie-consent-box">' +
        '<div>' +
          '<h2 style="color: #dc3545;">🚫 CONFIGURE COOKIES AGORA</h2>' +
          '<p style="color: white;">Você autorizou cookies, mas seu navegador ainda está bloqueando. Siga as instruções abaixo:</p>' +
          instructions +
        '</div>' +
        '<div>' +
          '<button type="button" id="procomites-instructions-close" style="background: #dc3545; padding: 8px 16px;">Entendi, vou configurar</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(instructionOverlay);

    document.getElementById('procomites-instructions-close').addEventListener('click', function () {
      localStorage.setItem('procomites-instructions-shown', '1');
      var el = document.getElementById('procomites-instructions-overlay');
      if (el) el.remove();
    });
  }

  // Mostrar imediatamente se DOM já carregado, senão aguardar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showConsent);
  } else {
    // Timeout para garantir renderização em mobile
    setTimeout(showConsent, 100);
  }
})();
