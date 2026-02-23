(function () {
  function qs(id) { return document.getElementById(id); }

  function setNotice(kind, msg) {
    var el = qs("notice");
    if (!el) return;
    el.classList.remove("hidden", "ok", "err");
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    if (kind === "ok") el.classList.add("ok");
    if (kind === "err") el.classList.add("err");
  }

  function isInvalidActionError(err, actionName) {
    var msg = (err && err.message ? err.message : "").toLowerCase();
    var a = String(actionName || "").toLowerCase();
    return msg.indexOf("acao invalida: " + a) >= 0 || msg.indexOf("acao inv") >= 0;
  }

  function api(payload) {
    var base = window.APPS_SCRIPT_URL || "";
    if (!base) return Promise.reject(new Error("APPS_SCRIPT_URL nao configurada."));

    if (payload && payload.acao !== "login") {
      var sid = window.__SID__ || "";
      if (sid) payload.sid = sid;
    }

    return new Promise(function (resolve, reject) {
      var cb = "__cb_cfg_" + Math.random().toString(36).slice(2);
      var script = null;
      var timer = null;

      function clean() {
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
        if (timer) clearTimeout(timer);
      }

      window[cb] = function (data) {
        clean();
        if (data && data.erro) return reject(new Error(data.erro));
        resolve(data || {});
      };

      var u = new URL(base);
      u.searchParams.set("acao", payload.acao || "");
      u.searchParams.set("callback", cb);
      u.searchParams.set("payload", JSON.stringify(payload || {}));
      u.searchParams.set("_ts", String(Date.now()));

      script = document.createElement("script");
      script.src = u.toString();
      script.onerror = function () {
        clean();
        reject(new Error("Falha de rede ao acessar Apps Script."));
      };

      timer = setTimeout(function () {
        clean();
        reject(new Error("Timeout ao acessar Apps Script."));
      }, 30000);

      document.head.appendChild(script);
    });
  }

  function getDefaults() {
    return {
      homeBannerTitulo: "Comites de Bacias Hidrograficas do Estado do Tocantins",
      homeBannerSubtitulo: "Acompanhe reunioes, publicacoes e noticias oficiais dos comites.",
      homeBannerImagemUrl: "",
      homeBannerBotaoTexto: "Saiba mais",
      homeBannerBotaoUrl: "#",
      homeBannerChapeu: "Portal Oficial",
      homeBannerTituloSizePx: "",
      homeBannerSubtituloSizePx: "",
      homeBannerBotaoSizePx: "",
      faleConoscoTitulo: "Fale Conosco",
      faleConoscoTexto: "Entre em contato com a coordenacao dos comites.",
      faleConoscoEmail: "",
      faleConoscoTelefone: "",
      faleConoscoEndereco: "",
    };
  }

  function mergeConfig(cfg) {
    var d = getDefaults();
    var inCfg = cfg || {};
    Object.keys(d).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(inCfg, k)) d[k] = inCfg[k];
    });
    return d;
  }

  function setForm(cfg) {
    var c = mergeConfig(cfg);
    qs("cfgBannerTitulo").value = c.homeBannerTitulo || "";
    qs("cfgBannerSubtitulo").value = c.homeBannerSubtitulo || "";
    qs("cfgBannerImagem").value = c.homeBannerImagemUrl || "";
    qs("cfgBannerBotaoTexto").value = c.homeBannerBotaoTexto || "";
    qs("cfgBannerBotaoUrl").value = c.homeBannerBotaoUrl || "";
    qs("cfgBannerChapeu").value = c.homeBannerChapeu || "";
    qs("cfgBannerTituloSize").value = c.homeBannerTituloSizePx || "";
    qs("cfgBannerSubtituloSize").value = c.homeBannerSubtituloSizePx || "";
    qs("cfgBannerBotaoSize").value = c.homeBannerBotaoSizePx || "";
    qs("cfgContatoTitulo").value = c.faleConoscoTitulo || "";
    qs("cfgContatoTexto").value = c.faleConoscoTexto || "";
    qs("cfgContatoEmail").value = c.faleConoscoEmail || "";
    qs("cfgContatoTelefone").value = c.faleConoscoTelefone || "";
    qs("cfgContatoEndereco").value = c.faleConoscoEndereco || "";
  }

  function getFormConfig() {
    return {
      homeBannerTitulo: (qs("cfgBannerTitulo").value || "").trim(),
      homeBannerSubtitulo: (qs("cfgBannerSubtitulo").value || "").trim(),
      homeBannerImagemUrl: (qs("cfgBannerImagem").value || "").trim(),
      homeBannerBotaoTexto: (qs("cfgBannerBotaoTexto").value || "").trim(),
      homeBannerBotaoUrl: (qs("cfgBannerBotaoUrl").value || "").trim(),
      homeBannerChapeu: (qs("cfgBannerChapeu").value || "").trim(),
      homeBannerTituloSizePx: (qs("cfgBannerTituloSize").value || "").trim(),
      homeBannerSubtituloSizePx: (qs("cfgBannerSubtituloSize").value || "").trim(),
      homeBannerBotaoSizePx: (qs("cfgBannerBotaoSize").value || "").trim(),
      faleConoscoTitulo: (qs("cfgContatoTitulo").value || "").trim(),
      faleConoscoTexto: (qs("cfgContatoTexto").value || "").trim(),
      faleConoscoEmail: (qs("cfgContatoEmail").value || "").trim(),
      faleConoscoTelefone: (qs("cfgContatoTelefone").value || "").trim(),
      faleConoscoEndereco: (qs("cfgContatoEndereco").value || "").trim(),
    };
  }

  function initFirebase() {
    if (!window.firebaseConfig) throw new Error("firebaseConfig nao configurado.");
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
    return firebase.auth();
  }

  var state = { idToken: null, session: null };

  async function loadConfig() {
    var r = await api({ acao: "obterPortalPublico" });
    setForm(r.config || {});
  }

  async function saveConfig() {
    if (!state.session) return;
    var btn = qs("btnSalvarPortalConfig");
    btn.disabled = true;
    try {
      var payload = {
        acao: "salvarPortalPublico",
        idToken: state.idToken,
        config: getFormConfig()
      };
      var r = await api(payload);
      if (r.status === "ok") setNotice("ok", "Configuracoes salvas com sucesso.");
      else setNotice("err", r.mensagem || "Nao foi possivel salvar.");
    } catch (e) {
      setNotice("err", e.message);
    } finally {
      btn.disabled = false;
    }
  }

  function bind(auth) {
    var provider = new firebase.auth.GoogleAuthProvider();

    qs("btnLogin").addEventListener("click", async function () {
      setNotice(null, "");
      await auth.signInWithPopup(provider);
    });

    qs("btnLogout").addEventListener("click", async function () {
      await auth.signOut();
    });

    qs("btnSalvarPortalConfig").addEventListener("click", saveConfig);
  }

  async function doLogin(user) {
    state.idToken = await user.getIdToken();
    var r = await api({ acao: "login", idToken: state.idToken, email: user.email || "", uid: user.uid || "", nome: user.displayName || "" });

    if (!r.autorizado) throw new Error(r.mensagem || "Acesso nao autorizado.");

    state.session = { perfil: r.perfil || "" };
    if (state.session.perfil !== "Admin") {
      throw new Error("Somente Admin pode editar configuracoes do portal.");
    }

    window.__SID__ = r.sid || "";
    try {
      if (window.__SID__) localStorage.setItem("procomites.sid", window.__SID__);
    } catch (e) {}

    qs("userLine").textContent = (user.displayName || "") + " - " + (user.email || "") + " - " + (state.session.perfil || "");
    qs("editorCard").classList.remove("hidden");
    await loadConfig();
  }

  async function boot() {
    var auth = initFirebase();
    bind(auth);

    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        state.idToken = null;
        state.session = null;
        qs("btnLogin").classList.remove("hidden");
        qs("btnLogout").classList.add("hidden");
        qs("editorCard").classList.add("hidden");
        qs("userLine").textContent = "Faca login para editar as configuracoes.";
        return;
      }

      qs("btnLogin").classList.add("hidden");
      qs("btnLogout").classList.remove("hidden");
      try {
        await doLogin(user);
      } catch (e) {
        qs("editorCard").classList.add("hidden");
        if (isInvalidActionError(e, "login")) {
          setNotice("err", "Login indisponivel no backend atual. Reimplante o Apps Script.");
          return;
        }
        setNotice("err", e.message);
      }
    });
  }

  boot();
})();
