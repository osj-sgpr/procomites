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

  function getUrlParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  function isInvalidActionError(err, actionName) {
    var msg = (err && err.message ? err.message : "").toLowerCase();
    var a = String(actionName || "").toLowerCase();
    return msg.indexOf("ação inválida: " + a) >= 0 || msg.indexOf("acao invalida: " + a) >= 0;
  }

  function api(payload) {
    var base = window.APPS_SCRIPT_URL || "";
    if (!base) return Promise.reject(new Error("APPS_SCRIPT_URL não configurada."));

    if (payload && payload.acao !== "login") {
      var sid = window.__SID__ || "";
      if (sid) payload.sid = sid;
    }

    return new Promise(function (resolve, reject) {
      var cb = "__cb_news_" + Math.random().toString(36).slice(2);
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
        reject(new Error("Falha ao chamar API."));
      };

      timer = setTimeout(function () {
        clean();
        reject(new Error("Timeout ao chamar API."));
      }, 25000);

      document.head.appendChild(script);
    });
  }

  var COMITES = [
    "CBH Lago de Palmas",
    "CBH Rio Palma",
    "CBH Manoel Alves",
    "CBH Lontra e Corda",
    "CBH S. Teresa e S. Antônio",
    "CBH Coco e Caiapó"
  ];

  var PRESET_IMAGES = [
    { label: "Paisagem", url: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=1200" },
    { label: "Reunião", url: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1200" },
    { label: "Gestão", url: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200" }
  ];

  var EMOJIS = ["✅", "📢", "💧", "📅", "🧭", "🤝", "🌿", "📍", "📝", "🎯"];

  var state = {
    idNoticia: (getUrlParam("id") || "").trim(),
    idToken: "",
    session: null,
    editor: null
  };

  function fillComites() {
    var sel = qs("notComite");
    if (!sel) return;
    sel.innerHTML = "";
    COMITES.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    });
  }

  function renderEmojiButtons() {
    var box = qs("emojiList");
    if (!box) return;
    box.innerHTML = "";
    EMOJIS.forEach(function (emo) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "emoji-btn";
      b.textContent = emo;
      b.addEventListener("click", function () {
        if (!state.editor) return;
        state.editor.insertHtml(emo + " ");
      });
      box.appendChild(b);
    });
  }

  function renderPresetImages() {
    var box = qs("presetImages");
    if (!box) return;
    box.innerHTML = "";
    PRESET_IMAGES.forEach(function (img) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "preset-image-btn";
      item.innerHTML = "<img src='" + img.url + "' alt='" + img.label + "' /><span>Inserir " + img.label + "</span>";
      item.addEventListener("click", function () {
        if (!state.editor) return;
        state.editor.insertHtml("<p><img src='" + img.url + "' alt='" + img.label + "' style='max-width:100%; border-radius:8px;' /></p>");
      });
      box.appendChild(item);
    });
  }

  function ensureEditor() {
    return new Promise(function (resolve) {
      if (state.editor) return resolve(state.editor);
      state.editor = CKEDITOR.replace("editorConteudo", {
        height: 520,
        extraPlugins: "justify,colorbutton,font,stylescombo",
        removeButtons: "Subscript,Superscript",
        contentsCss: ["./styles.css?v=20260222h"],
        toolbar: [
          { name: "clipboard", items: ["Undo", "Redo"] },
          { name: "styles", items: ["Styles", "Format", "Font", "FontSize"] },
          { name: "basicstyles", items: ["Bold", "Italic", "Underline", "Strike", "TextColor", "BGColor", "RemoveFormat"] },
          { name: "paragraph", items: ["NumberedList", "BulletedList", "Outdent", "Indent", "Blockquote", "JustifyLeft", "JustifyCenter", "JustifyRight", "JustifyBlock"] },
          { name: "links", items: ["Link", "Unlink"] },
          { name: "insert", items: ["Table", "HorizontalRule", "SpecialChar"] },
          { name: "document", items: ["Source"] }
        ]
      });
      state.editor.on("instanceReady", function () { resolve(state.editor); });
    });
  }

  function applyParagraphStyle(lineHeight, marginBottom) {
    if (!state.editor) return;
    state.editor.focus();
    var style = new CKEDITOR.style({
      element: "p",
      styles: {
        "line-height": String(lineHeight),
        "margin-bottom": marginBottom + "px"
      }
    });
    state.editor.applyStyle(style);
  }

  function setDefaultForm() {
    qs("notTitulo").value = "";
    qs("notResumo").value = "";
    qs("notImagem").value = "";
    qs("notData").value = new Date().toISOString().slice(0, 10);
    qs("notStatus").value = "Rascunho";
    qs("notDestaqueHome").value = "NÃO";
  }

  function fillForm(n) {
    qs("notTitulo").value = n.titulo || "";
    qs("notResumo").value = n.resumo || "";
    qs("notImagem").value = n.imagemUrl || "";
    qs("notData").value = (n.dataPublicacao || "").toString().slice(0, 10);
    qs("notStatus").value = n.status || "Rascunho";
    qs("notDestaqueHome").value = n.destaqueHome || "NÃO";
    qs("notComite").value = n.comite || COMITES[0];
    state.editor.setData(n.conteudoHtml || "<p>Digite a notícia...</p>");
  }

  async function loadNoticiaIfNeeded() {
    if (!state.idNoticia) {
      setDefaultForm();
      state.editor.setData("<p>Digite a notícia...</p>");
      return;
    }
    try {
      var r = await api({ acao: "listarNoticiasGestao", idToken: state.idToken });
      var list = r.noticias || [];
      var found = list.find(function (x) {
        return (x.idNoticia || "").toString().trim() === state.idNoticia;
      });
      if (!found) {
        setNotice("err", "Notícia não encontrada ou sem permissão para edição.");
        return;
      }
      fillForm(found);
      setNotice("ok", "Editando: " + (found.titulo || "(sem título)") + " • " + fmtDate(found.dataPublicacao));
    } catch (e) {
      if (isInvalidActionError(e, "listarNoticiasGestao")) {
        setNotice("err", "Módulo de notícias indisponível no backend atual. Reimplante o Web App do Apps Script.");
        return;
      }
      setNotice("err", e.message);
    }
  }

  async function saveNoticia() {
    setNotice(null, "");
    var btn = qs("btnSalvarNoticia");
    btn.disabled = true;
    try {
      await api({
        acao: "salvarNoticia",
        idToken: state.idToken,
        idNoticia: state.idNoticia || "",
        titulo: (qs("notTitulo").value || "").trim(),
        resumo: (qs("notResumo").value || "").trim(),
        conteudoHtml: state.editor ? state.editor.getData() : "",
        imagemUrl: (qs("notImagem").value || "").trim(),
        comite: (qs("notComite").value || "").trim(),
        dataPublicacao: (qs("notData").value || "").trim(),
        status: (qs("notStatus").value || "Rascunho").trim(),
        destaqueHome: (qs("notDestaqueHome").value || "NÃO").trim()
      });
      setNotice("ok", "Notícia salva com sucesso.");
      setTimeout(function () {
        window.location.href = "./painel.html";
      }, 900);
    } catch (e) {
      if (isInvalidActionError(e, "salvarNoticia")) {
        setNotice("err", "Não foi possível salvar: ação salvarNoticia indisponível no backend atual. Reimplante o Web App do Apps Script.");
        return;
      }
      setNotice("err", e.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function initAuth() {
    if (!window.firebaseConfig) {
      setNotice("err", "Configuração do Firebase ausente.");
      return;
    }

    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(window.firebaseConfig);
    }

    var auth = firebase.auth();
    var provider = new firebase.auth.GoogleAuthProvider();

    var btnLogin = qs("btnLogin");
    var btnLogout = qs("btnLogout");
    var userLine = qs("userLine");
    var editorCard = qs("editorCard");

    btnLogin.addEventListener("click", function () {
      auth.signInWithPopup(provider);
    });

    btnLogout.addEventListener("click", function () {
      auth.signOut();
    });

    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        editorCard.classList.add("hidden");
        btnLogin.classList.remove("hidden");
        btnLogout.classList.add("hidden");
        userLine.textContent = "Faça login para editar notícias.";
        try { localStorage.removeItem("procomites.sid"); } catch (e) {}
        setNotice(null, "");
        return;
      }

      btnLogin.classList.add("hidden");
      btnLogout.classList.remove("hidden");
      userLine.textContent = (user.displayName || "") + " • " + (user.email || "");

      try {
        state.idToken = await user.getIdToken();
        var loginResp = await api({
          acao: "login",
          idToken: state.idToken,
          email: user.email,
          uid: user.uid,
          nome: user.displayName || ""
        });

        if (!loginResp.autorizado) {
          editorCard.classList.add("hidden");
          setNotice("err", loginResp.mensagem || "Sem acesso ao editor de notícias.");
          return;
        }

        state.session = {
          perfil: loginResp.perfil,
          comite: loginResp.comite || ""
        };
        window.__SID__ = loginResp.sid || "";
        try {
          if (window.__SID__) localStorage.setItem("procomites.sid", window.__SID__);
        } catch (e) {}

        if (state.session.perfil !== "Admin" && state.session.perfil !== "Presidente") {
          editorCard.classList.add("hidden");
          setNotice("err", "Somente Admin/Presidente podem editar notícias.");
          return;
        }

        fillComites();
        if (state.session.perfil === "Presidente") {
          qs("notComite").value = state.session.comite || "";
          qs("notComite").disabled = true;
        }

        await ensureEditor();
        await loadNoticiaIfNeeded();
        editorCard.classList.remove("hidden");
      } catch (e) {
        editorCard.classList.add("hidden");
        if (isInvalidActionError(e, "login")) {
          setNotice("err", "Login indisponível no backend atual. Reimplante o Apps Script.");
          return;
        }
        setNotice("err", e.message);
      }
    });
  }

  function bindUiActions() {
    qs("btnSalvarNoticia").addEventListener("click", saveNoticia);

    qs("btnJustify").addEventListener("click", function () {
      if (state.editor) state.editor.execCommand("justifyblock");
    });
    qs("btnAlignLeft").addEventListener("click", function () {
      if (state.editor) state.editor.execCommand("justifyleft");
    });
    qs("btnAlignCenter").addEventListener("click", function () {
      if (state.editor) state.editor.execCommand("justifycenter");
    });
    qs("btnAlignRight").addEventListener("click", function () {
      if (state.editor) state.editor.execCommand("justifyright");
    });
    qs("btnSpaceNormal").addEventListener("click", function () {
      applyParagraphStyle(1.5, 10);
    });
    qs("btnSpaceConfortavel").addEventListener("click", function () {
      applyParagraphStyle(1.9, 18);
    });
  }

  function boot() {
    try {
      window.__SID__ = localStorage.getItem("procomites.sid") || "";
    } catch (e) {
      window.__SID__ = "";
    }
    renderEmojiButtons();
    renderPresetImages();
    bindUiActions();
    initAuth();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
