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

  function ckInsertHtml_(editor, html) {
    var raw = editor && editor.__raw ? editor.__raw : null;
    if (!raw) return;
    raw.model.change(function () {
      var viewFragment = raw.data.processor.toView(String(html || ""));
      var modelFragment = raw.data.toModel(viewFragment);
      raw.model.insertContent(modelFragment, raw.model.document.selection);
    });
  }

  function createCkEditorAdapter_(rawEditor) {
    return {
      setData: function (html) {
        rawEditor.setData(html || "<p>Digite a notícia...</p>");
      },
      getData: function () {
        return rawEditor.getData() || "";
      },
      insertHtml: function (html) {
        ckInsertHtml_(this, html);
      },
      focus: function () {
        rawEditor.editing.view.focus();
      },
      execCommand: function (name, options) {
        if (!rawEditor.commands.get(name)) return false;
        rawEditor.execute(name, options);
        rawEditor.editing.view.focus();
        return true;
      },
      setAlignment: function (alignment) {
        if (!rawEditor.commands.get("alignment")) return false;
        rawEditor.execute("alignment", { value: alignment });
        rawEditor.editing.view.focus();
        return true;
      },
      __raw: rawEditor
    };
  }

  function getApiBaseUrls() {
    var out = [];
    if (Array.isArray(window.APPS_SCRIPT_URLS)) {
      window.APPS_SCRIPT_URLS.forEach(function (u) {
        var s = String(u || "").trim();
        if (s && out.indexOf(s) < 0) out.push(s);
      });
    }
    var single = String(window.APPS_SCRIPT_URL || "").trim();
    if (single && out.indexOf(single) < 0) out.push(single);
    return out;
  }

  function callJsonp(base, payload, timeoutMs) {
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
      }, timeoutMs || 25000);

      var target = document.getElementsByTagName('head')[0] || document.documentElement;
      target.appendChild(script);
    });
  }

  async function api(payload) {
    var bases = getApiBaseUrls();
    if (!bases.length) return Promise.reject(new Error("APPS_SCRIPT_URL não configurada."));

    if (payload && payload.acao !== "login") {
      var sid = window.__SID__ || "";
      if (sid) payload.sid = sid;
    }

    var lastErr = null;
    for (var i = 0; i < bases.length; i++) {
      for (var attempt = 1; attempt <= 2; attempt++) {
        try {
          return await callJsonp(bases[i], payload || {}, 25000 + ((attempt - 1) * 6000));
        } catch (e) {
          lastErr = e;
          await new Promise(function (r) { setTimeout(r, 250 * attempt); });
        }
      }
    }

    var msg = (lastErr && lastErr.message) ? lastErr.message : "Falha ao chamar API.";
    throw new Error(msg + " Verifique rede e publicação do Apps Script.");
  }

  var COMITES = [
    "CBH Lago de Palmas",
    "CBH Rio Palma",
    "CBH Manoel Alves",
    "CBH Lontra e Corda",
    "CBH S. Teresa e S. Antônio",
    "CBH Coco e Caiapó",
    "CBH Formoso do Araguaia"
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

  function bindNewsToolbarCommands_(editor) {
    var buttons = document.querySelectorAll("[data-editor-target='news'][data-cmd]");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cmd = (btn.getAttribute("data-cmd") || "").trim();
        if (!cmd) return;
        if (!editor) return;
        editor.focus();
        if (cmd === "undo") return editor.execCommand("undo");
        if (cmd === "redo") return editor.execCommand("redo");
        if (cmd === "h2") return editor.execCommand("heading", { value: "heading2" });
        if (cmd === "h3") return editor.execCommand("heading", { value: "heading3" });
        if (cmd === "bold") return editor.execCommand("bold");
        if (cmd === "italic") return editor.execCommand("italic");
        if (cmd === "underline") return editor.execCommand("underline");
        if (cmd === "strike") return editor.execCommand("strikethrough");
        if (cmd === "bulletList") return editor.execCommand("bulletedList");
        if (cmd === "orderedList") return editor.execCommand("numberedList");
        if (cmd === "blockquote") return editor.execCommand("blockQuote");
        if (cmd === "horizontalRule") {
          if (!editor.execCommand("horizontalLine")) editor.insertHtml("<hr />");
          return;
        }
        if (cmd === "link") {
          var href = window.prompt("Informe a URL do link:", "https://");
          if (!href) return;
          if (!editor.execCommand("link", href)) return setNotice("err", "Comando de link indisponível no editor.");
          return;
        }
        if (cmd === "image") {
          var src = window.prompt("Informe a URL da imagem:", "https://");
          if (!src) return;
          editor.insertHtml("<p><img src='" + src + "' alt='Imagem' style='max-width:100%; border-radius:8px;' /></p>");
          return;
        }
        if (cmd === "table") {
          if (!editor.execCommand("insertTable", { rows: 3, columns: 3 })) {
            editor.insertHtml("<table border='1' style='width:100%; border-collapse:collapse;'><tr><th>Título 1</th><th>Título 2</th></tr><tr><td>Texto</td><td>Texto</td></tr></table>");
          }
        }
      });
    });
  }

  function ensureEditor() {
    return new Promise(function (resolve, reject) {
      if (state.editor) return resolve(state.editor);
      if (!window.Quill) {
        return reject(new Error("Editor rico indisponível no navegador. Verifique o arquivo local ./vendor/quill/quill.js."));
      }

      var quill = new window.Quill(qs("editorConteudo"), {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'script': 'sub'}, { 'script': 'super' }],
            [{ 'indent': '-1'}, { 'indent': '+1' }],
            [{ 'direction': 'rtl' }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'font': [] }],
            [{ 'align': [] }],
            ['link', 'image'],
            ['clean']
          ]
        }
      });

      state.editor = {
        setData: function (html) {
          quill.root.innerHTML = html || "<p>Digite a notícia...</p>";
        },
        getData: function () {
          return quill.root.innerHTML || "";
        },
        insertHtml: function (html) {
          var delta = quill.clipboard.convert(html);
          quill.updateContents(delta, 'silent');
        },
        focus: function () {
          quill.focus();
        },
        __raw: quill
      };

      bindNewsToolbarCommands_(state.editor);
      state.editor.setData("<p>Digite a notícia...</p>");
      resolve(state.editor);
    });
  }

  function applyParagraphStyle(mode) {
    var root = null;
    if (state.editor && state.editor.__raw && state.editor.__raw.ui && state.editor.__raw.ui.view && state.editor.__raw.ui.view.editable) {
      root = state.editor.__raw.ui.view.editable.element;
    }
    if (!root) return;
    root.classList.remove("is-spacing-normal", "is-spacing-comfortable");
    if (mode === "comfortable") root.classList.add("is-spacing-comfortable");
    else root.classList.add("is-spacing-normal");
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
        userLine.textContent = (user.displayName || "") + " • " + (user.email || "") + " • " + (state.session.perfil || "");
        window.__SID__ = loginResp.sid || "";
        try {
          if (window.__SID__) localStorage.setItem("procomites.sid", window.__SID__);
        } catch (e) {}

        if (state.session.perfil !== "Admin" && state.session.perfil !== "Presidente") {
          editorCard.classList.add("hidden");
          setNotice("err", "Somente Admin/Presidente podem editar notícias. Perfil atual: " + (state.session.perfil || "não informado") + ".");
          return;
        }

        fillComites();
        if (state.session.perfil === "Presidente") {
          qs("notComite").value = state.session.comite || "";
          qs("notComite").disabled = true;
        }

        editorCard.classList.remove("hidden");
        await ensureEditor();
        await loadNoticiaIfNeeded();
      } catch (e) {
        if (state.session && (state.session.perfil === "Admin" || state.session.perfil === "Presidente")) {
          editorCard.classList.remove("hidden");
        } else {
          editorCard.classList.add("hidden");
        }
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
      if (!state.editor || !state.editor.setAlignment("justify")) setNotice("err", "Comando de alinhamento indisponível no editor.");
    });
    qs("btnAlignLeft").addEventListener("click", function () {
      if (!state.editor || !state.editor.setAlignment("left")) setNotice("err", "Comando de alinhamento indisponível no editor.");
    });
    qs("btnAlignCenter").addEventListener("click", function () {
      if (!state.editor || !state.editor.setAlignment("center")) setNotice("err", "Comando de alinhamento indisponível no editor.");
    });
    qs("btnAlignRight").addEventListener("click", function () {
      if (!state.editor || !state.editor.setAlignment("right")) setNotice("err", "Comando de alinhamento indisponível no editor.");
    });
    qs("btnSpaceNormal").addEventListener("click", function () {
      applyParagraphStyle("normal");
    });
    qs("btnSpaceConfortavel").addEventListener("click", function () {
      applyParagraphStyle("comfortable");
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
