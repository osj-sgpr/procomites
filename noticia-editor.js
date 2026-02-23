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

  function buildTiptapExtensions_() {
    var exts = window.tiptapExtensions || {};
    var list = [];

    function add(name, opts) {
      var Ctor = exts[name];
      if (!Ctor) return;
      list.push(new Ctor(opts || {}));
    }

    add("History");
    add("Doc");
    add("Text");
    add("Paragraph");
    add("Heading", { levels: [2, 3] });
    add("Bold");
    add("Italic");
    add("Underline");
    add("Strike");
    add("Blockquote");
    add("OrderedList");
    add("BulletList");
    add("ListItem");
    add("HorizontalRule");
    add("Link", { openOnClick: false });
    add("Image", { inline: false });
    add("Table", { resizable: true });
    add("TableHeader");
    add("TableCell");
    add("TableRow");
    add("TextAlign", { types: ["heading", "paragraph"] });

    return list;
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
        editor.focus();
        if (cmd === "undo") return editor.commands.undo();
        if (cmd === "redo") return editor.commands.redo();
        if (cmd === "h2") return editor.commands.heading({ level: 2 });
        if (cmd === "h3") return editor.commands.heading({ level: 3 });
        if (cmd === "bold") return editor.commands.bold();
        if (cmd === "italic") return editor.commands.italic();
        if (cmd === "underline") return editor.commands.underline();
        if (cmd === "strike") return editor.commands.strike();
        if (cmd === "bulletList") return editor.commands.bullet_list();
        if (cmd === "orderedList") return editor.commands.ordered_list();
        if (cmd === "blockquote") return editor.commands.blockquote();
        if (cmd === "horizontalRule") return editor.commands.horizontal_rule();
        if (cmd === "link") {
          var href = window.prompt("Informe a URL do link:", "https://");
          if (!href) return;
          return editor.commands.link({ href: href });
        }
        if (cmd === "image") {
          var src = window.prompt("Informe a URL da imagem:", "https://");
          if (!src) return;
          return editor.commands.image({ src: src });
        }
        if (cmd === "table") return editor.commands.create_table({ rowsCount: 3, colsCount: 3, withHeaderRow: true });
      });
    });
  }

  function createBasicEditorAdapter_(element, initialHtml) {
    if (!element) throw new Error("Elemento do editor não encontrado.");
    element.setAttribute("contenteditable", "true");
    element.classList.add("tiptap-prose");
    element.innerHTML = initialHtml || "<p>Digite a notícia...</p>";

    return {
      setData: function (html) {
        element.innerHTML = html || "<p>Digite a notícia...</p>";
      },
      getData: function () {
        return element.innerHTML || "";
      },
      insertHtml: function (html) {
        var extra = String(html || "");
        if (!extra) return;
        element.focus();
        try {
          document.execCommand("insertHTML", false, extra);
        } catch (e) {
          element.innerHTML += extra;
        }
      },
      focus: function () {
        element.focus();
      },
      __raw: null
    };
  }

  function ensureEditor() {
    return new Promise(function (resolve, reject) {
      if (state.editor) return resolve(state.editor);
      if (!window.tiptap || !window.tiptap.Editor || !window.tiptapExtensions) {
        state.editor = createBasicEditorAdapter_(qs("editorConteudo"), "<p>Digite a notícia...</p>");
        setNotice("ok", "Tiptap indisponível no navegador. Editor básico local ativado.");
        return resolve(state.editor);
      }

      var editor = new window.tiptap.Editor({
        element: qs("editorConteudo"),
        extensions: buildTiptapExtensions_(),
        content: "<p>Digite a notícia...</p>",
        editorProps: {
          attributes: {
            class: "tiptap-prose"
          }
        }
      });

      bindNewsToolbarCommands_(editor);
      state.editor = {
        setData: function (html) {
          editor.setContent(html || "<p>Digite a notícia...</p>");
        },
        getData: function () {
          return editor.getHTML();
        },
        insertHtml: function (html) {
          editor.commands.insertHTML(String(html || ""));
        },
        focus: function () {
          editor.focus();
        },
        __raw: editor
      };
      resolve(state.editor);
    });
  }

  function applyParagraphStyle(mode) {
    if (!state.editor || !state.editor.__raw || !state.editor.__raw.view || !state.editor.__raw.view.dom) return;
    var root = state.editor.__raw.view.dom;
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
      if (state.editor && state.editor.__raw) state.editor.__raw.commands.text_align({ alignment: "justify" });
    });
    qs("btnAlignLeft").addEventListener("click", function () {
      if (state.editor && state.editor.__raw) state.editor.__raw.commands.text_align({ alignment: "left" });
    });
    qs("btnAlignCenter").addEventListener("click", function () {
      if (state.editor && state.editor.__raw) state.editor.__raw.commands.text_align({ alignment: "center" });
    });
    qs("btnAlignRight").addEventListener("click", function () {
      if (state.editor && state.editor.__raw) state.editor.__raw.commands.text_align({ alignment: "right" });
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
