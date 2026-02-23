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
      var cb = "__cb_ata_" + Math.random().toString(36).slice(2);
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

  function ensureEditor() {
    return new Promise(function (resolve) {
      if (window.__ATA_EDITOR__) return resolve(window.__ATA_EDITOR__);
      window.__ATA_EDITOR__ = window.CKEDITOR.replace("editorAtaFull", {
        height: 560,
        extraPlugins: "justify,colorbutton,font,stylescombo",
        removeButtons: "Subscript,Superscript",
        contentsCss: ["./styles.css?v=20250223a"],
        toolbar: [
          { name: "clipboard", items: ["Undo", "Redo"] },
          { name: "styles", items: ["Styles", "Format", "Font", "FontSize"] },
          { name: "basicstyles", items: ["Bold", "Italic", "Underline", "Strike", "TextColor", "BGColor", "RemoveFormat"] },
          { name: "paragraph", items: ["NumberedList", "BulletedList", "Outdent", "Indent", "Blockquote", "JustifyLeft", "JustifyCenter", "JustifyRight", "JustifyBlock"] },
          { name: "links", items: ["Link", "Unlink"] },
          { name: "insert", items: ["Image", "Table", "HorizontalRule", "SpecialChar"] },
          { name: "document", items: ["Source", "Maximize"] }
        ]
      });
      window.__ATA_EDITOR__.on("instanceReady", function () { resolve(window.__ATA_EDITOR__); });
    });
  }

  function setUploadStatus(text) {
    var el = qs("ataUploadStatus");
    if (el) el.textContent = text || "";
  }

  function readFileAsBase64(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Falha ao ler o arquivo.")); };
      reader.onprogress = function (e) {
        if (onProgress && e.lengthComputable) onProgress(e.loaded, e.total);
      };
      reader.onload = function () {
        var res = String(reader.result || "");
        var idx = res.indexOf("base64,");
        resolve(idx >= 0 ? res.slice(idx + 7) : res);
      };
      reader.readAsDataURL(file);
    });
  }

  var state = {
    user: null,
    session: null,
    reunioes: [],
    reuniaoAtual: null,
    idToken: null
  };

  function findReuniaoById(idReuniao) {
    var id = String(idReuniao || "").trim();
    if (!id) return null;
    for (var i = 0; i < state.reunioes.length; i++) {
      if ((state.reunioes[i].idReuniao || "") === id) return state.reunioes[i];
    }
    return null;
  }

  function fillReunioesSelect() {
    var sel = qs("ataReuniao");
    if (!sel) return;
    sel.innerHTML = "";
    state.reunioes.forEach(function (r) {
      var o = document.createElement("option");
      o.value = r.idReuniao || "";
      o.textContent = (r.titulo || "(sem titulo)") + " - " + fmtDate(r.data) + " - " + (r.comite || "-");
      sel.appendChild(o);
    });

    var fromUrl = (getUrlParam("id") || "").trim();
    var target = fromUrl || (state.reunioes[0] && state.reunioes[0].idReuniao) || "";
    if (target) sel.value = target;
    if (target) state.reuniaoAtual = findReuniaoById(target);
  }

  function updateMeta() {
    var el = qs("ataMeta");
    if (!el) return;
    if (!state.reuniaoAtual) {
      el.textContent = "Selecione uma reuniao para editar.";
      return;
    }
    var r = state.reuniaoAtual;
    el.textContent = "Reuniao: " + (r.titulo || "-") + " | " + fmtDate(r.data) + " | " + (r.comite || "-") + " | Status: " + (r.status || "-");

    var link = qs("btnVoltarPainel");
    if (link) link.href = "./painel.html?openReuniao=" + encodeURIComponent(r.idReuniao || "");
  }

  async function carregarReunioes() {
    if (!state.session) return;
    var r = await api({ acao: "listarReunioes", idToken: state.idToken, idUsuario: state.session.idUsuario });
    state.reunioes = r.reunioes || [];
    fillReunioesSelect();
    updateMeta();
  }

  async function carregarAta() {
    if (!state.reuniaoAtual) {
      setNotice("err", "Selecione uma reuniao.");
      return;
    }
    var editor = await ensureEditor();
    var r = await api({ acao: "obterAtaRascunho", idToken: state.idToken, idReuniao: state.reuniaoAtual.idReuniao });
    editor.setData(r.html || "<p>Digite a ATA aqui...</p>");
    var status = (r.ataPdfAssinadaLink || "").toString().trim();
    setUploadStatus(status ? ("Publicado: " + status) : "");
    setNotice("ok", "ATA carregada.");
  }

  async function salvarAta() {
    if (!state.reuniaoAtual) return;
    var editor = await ensureEditor();
    var html = editor.getData();
    var r = await api({ acao: "salvarAtaRascunho", idToken: state.idToken, idReuniao: state.reuniaoAtual.idReuniao, html: html });
    if (!r.sucesso) throw new Error(r.mensagem || "Nao foi possivel salvar ATA.");
    setNotice("ok", "ATA salva com sucesso.");
  }

  async function inserirListaPresenca() {
    if (!state.reuniaoAtual) return;
    var editor = await ensureEditor();
    var r = await api({ acao: "gerarListaPresencaHtml", idToken: state.idToken, idReuniao: state.reuniaoAtual.idReuniao });
    var current = editor.getData() || "";
    editor.setData(current + "<hr/>" + (r.html || ""));
    setNotice("ok", "Lista de presenca inserida.");
  }

  async function gerarPdfAta() {
    if (!state.reuniaoAtual) return;
    var editor = await ensureEditor();
    var r = await api({ acao: "gerarPdfAta", idToken: state.idToken, idReuniao: state.reuniaoAtual.idReuniao, html: editor.getData() });
    if (r.sucesso && r.url) {
      window.open(r.url, "_blank", "noopener");
      setNotice("ok", "PDF gerado com sucesso.");
      return;
    }
    throw new Error(r.mensagem || "Nao foi possivel gerar PDF.");
  }

  async function uploadAtaAssinada() {
    if (!state.reuniaoAtual) return;
    if (!state.session || state.session.perfil !== "Presidente") {
      setNotice("err", "Somente o Presidente pode publicar a ATA.");
      return;
    }

    var file = qs("ataPdfAssinada") && qs("ataPdfAssinada").files ? qs("ataPdfAssinada").files[0] : null;
    if (!file) return setNotice("err", "Selecione o PDF assinado.");
    if (file.size > 10 * 1024 * 1024) return setNotice("err", "Arquivo muito grande. Limite: 10 MB.");
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name || "")) return setNotice("err", "Arquivo invalido. Envie um PDF.");

    setNotice(null, "");
    setUploadStatus("Lendo arquivo...");
    var btn = qs("btnUploadAta");
    if (btn) btn.disabled = true;
    try {
      var b64 = await readFileAsBase64(file, function (loaded, total) {
        var pct = total ? Math.round((loaded / total) * 100) : 0;
        setUploadStatus("Lendo arquivo... " + pct + "%");
      });

      var chunkSize = 8 * 1024;
      var totalChunks = Math.max(1, Math.ceil(b64.length / chunkSize));

      var init = await api({
        acao: "iniciarUploadAtaAssinada",
        idToken: state.idToken,
        idReuniao: state.reuniaoAtual.idReuniao,
        fileName: file.name || "ATA_ASSINADA.pdf",
        totalChunks: totalChunks
      });

      var uploadId = init.uploadId;
      if (!uploadId) throw new Error("Falha ao iniciar upload.");

      for (var i = 0; i < totalChunks; i++) {
        var start = i * chunkSize;
        var end = Math.min(b64.length, start + chunkSize);
        var part = b64.slice(start, end);
        await api({
          acao: "enviarChunkAtaAssinada",
          idToken: state.idToken,
          idReuniao: state.reuniaoAtual.idReuniao,
          uploadId: uploadId,
          chunkIndex: i,
          data: part
        });
        var pct2 = Math.round(((i + 1) / totalChunks) * 100);
        setUploadStatus("Enviando... " + pct2 + "%");
      }

      var fin = await api({
        acao: "finalizarUploadAtaAssinada",
        idToken: state.idToken,
        idReuniao: state.reuniaoAtual.idReuniao,
        uploadId: uploadId
      });

      if (fin.sucesso && fin.url) {
        setUploadStatus("Publicado: " + fin.url);
        setNotice("ok", "ATA assinada publicada com sucesso.");
      } else {
        throw new Error(fin.mensagem || "Nao foi possivel finalizar upload.");
      }
    } catch (e) {
      setNotice("err", e.message);
      setUploadStatus("Erro: " + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function initFirebase() {
    if (!window.firebaseConfig) throw new Error("firebaseConfig nao configurado.");
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
    return firebase.auth();
  }

  async function doLogin(user) {
    state.idToken = await user.getIdToken();
    var resp = await api({ acao: "login", idToken: state.idToken, email: user.email || "", uid: user.uid || "", nome: user.displayName || "" });
    if (!resp.autorizado) throw new Error(resp.mensagem || "Acesso nao autorizado.");

    state.session = {
      idUsuario: resp.idUsuario,
      perfil: resp.perfil,
      comite: resp.comite || ""
    };

    if (state.session.perfil !== "Admin" && state.session.perfil !== "Presidente" && state.session.perfil !== "Secretario") {
      throw new Error("Sem permissao para editar ATA.");
    }

    window.__SID__ = resp.sid || "";
    try {
      if (window.__SID__) localStorage.setItem("procomites.sid", window.__SID__);
    } catch (e) {}

    qs("userLine").textContent = (user.displayName || "") + " - " + (user.email || "") + " - " + (state.session.perfil || "");
    qs("editorCard").classList.remove("hidden");

    await ensureEditor();
    await carregarReunioes();
    if (state.reuniaoAtual) await carregarAta();
  }

  function bindActions(auth) {
    var provider = new firebase.auth.GoogleAuthProvider();
    qs("btnLogin").addEventListener("click", async function () {
      setNotice(null, "");
      await auth.signInWithPopup(provider);
    });

    qs("btnLogout").addEventListener("click", async function () {
      await auth.signOut();
    });

    qs("ataReuniao").addEventListener("change", function () {
      state.reuniaoAtual = findReuniaoById(qs("ataReuniao").value || "");
      updateMeta();
    });

    qs("btnCarregarAta").addEventListener("click", async function () {
      try {
        await carregarAta();
      } catch (e) {
        setNotice("err", e.message);
      }
    });

    qs("btnSalvarAta").addEventListener("click", async function () {
      try {
        await salvarAta();
      } catch (e) {
        setNotice("err", e.message);
      }
    });

    qs("btnInserirLista").addEventListener("click", async function () {
      try {
        await inserirListaPresenca();
      } catch (e) {
        setNotice("err", e.message);
      }
    });

    qs("btnGerarPdfAta").addEventListener("click", async function () {
      try {
        await gerarPdfAta();
      } catch (e) {
        setNotice("err", e.message);
      }
    });

    qs("btnUploadAta").addEventListener("click", uploadAtaAssinada);
  }

  async function boot() {
    var auth = initFirebase();
    bindActions(auth);

    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        qs("btnLogin").classList.remove("hidden");
        qs("btnLogout").classList.add("hidden");
        qs("editorCard").classList.add("hidden");
        qs("userLine").textContent = "Faca login para editar a ATA.";
        state.user = null;
        state.session = null;
        state.idToken = null;
        return;
      }

      qs("btnLogin").classList.add("hidden");
      qs("btnLogout").classList.remove("hidden");
      state.user = user;

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
