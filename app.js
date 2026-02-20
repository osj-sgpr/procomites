(function () {
  function qs(id) { return document.getElementById(id); }

  function setNotice(kind, msg) {
    const el = qs("notice");
    if (!el) return;
    el.classList.remove("hidden", "ok", "err");
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.add(kind === "ok" ? "ok" : kind === "err" ? "err" : "");
  }

  async function api(payload) {
    if (!window.APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL não configurada em config.js");
    const res = await fetch(window.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Resposta inválida da API: " + text);
    }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  }

  function getUrlParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function normalizeCpf(v) {
    return (v || "").replace(/\D/g, "").slice(0, 11);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    return iso;
  }

  // -------------------- Página pública (validar-presenca.html) --------------------
  async function initPublic() {
    const idReuniao = getUrlParam("id");
    const badge = qs("reuniaoBadge");
    if (badge) badge.textContent = "Reunião: " + (idReuniao || "-");

    if (!idReuniao) {
      setNotice("err", "Link inválido: parâmetro 'id' ausente.");
      const btnValidar = qs("btnValidar");
      if (btnValidar) btnValidar.disabled = true;
      return;
    }

    const cpfEl = qs("cpf");
    const btnValidar = qs("btnValidar");
    const panelNovo = qs("panelNovo");
    const panelCodigo = qs("panelCodigo");
    const codigoEl = qs("codigo");

    function showCodigo(code) {
      if (panelCodigo) panelCodigo.classList.remove("hidden");
      if (codigoEl) codigoEl.textContent = code || "-";
    }

    async function validar() {
      setNotice(null, "");
      if (panelNovo) panelNovo.classList.add("hidden");
      if (panelCodigo) panelCodigo.classList.add("hidden");

      const cpf = normalizeCpf(cpfEl ? cpfEl.value : "");
      if (cpf.length !== 11) {
        setNotice("err", "CPF inválido.");
        return;
      }

      btnValidar.disabled = true;
      try {
        const r = await api({ acao: "validarPresenca", idReuniao, cpf });
        if (r.status === "ja_presente") {
          setNotice("ok", r.mensagem || "Presença já registrada.");
          showCodigo(r.codigo);
          return;
        }
        if (r.status === "ok") {
          setNotice("ok", r.mensagem || "Presença registrada.");
          showCodigo(r.codigo);
          return;
        }
        if (r.status === "novo") {
          setNotice(null, "");
          if (panelNovo) panelNovo.classList.remove("hidden");
          return;
        }
        setNotice("err", r.mensagem || "Não foi possível validar.");
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnValidar.disabled = false;
      }
    }

    async function salvarNovo() {
      setNotice(null, "");
      const cpf = normalizeCpf(cpfEl ? cpfEl.value : "");
      const nome = (qs("nome")?.value || "").trim();
      const email = (qs("email")?.value || "").trim();
      const telefone = (qs("telefone")?.value || "").trim();
      const orgao = (qs("orgao")?.value || "").trim();
      const precisaDiaria = (qs("precisaDiaria")?.value || "NÃO").trim();

      if (cpf.length !== 11) return setNotice("err", "CPF inválido.");
      if (!nome) return setNotice("err", "Informe o nome.");

      const btn = qs("btnSalvarNovo");
      btn.disabled = true;
      try {
        const r = await api({
          acao: "salvarNovoMembro",
          idReuniao,
          cpf,
          nome,
          email,
          telefone,
          orgao,
          precisaDiaria,
        });
        if (r.status === "ok") {
          setNotice("ok", "Presença registrada.");
          if (panelNovo) panelNovo.classList.add("hidden");
          showCodigo(r.codigo);
          return;
        }
        setNotice("err", r.mensagem || "Erro ao salvar.");
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btn.disabled = false;
      }
    }

    btnValidar?.addEventListener("click", validar);
    qs("btnSalvarNovo")?.addEventListener("click", salvarNovo);
  }

  // -------------------- Painel (index.html) --------------------
  async function initPanel() {
    if (!window.firebaseConfig) {
      setNotice("err", "firebase-config.js não configurado.");
      return;
    }

    firebase.initializeApp(window.firebaseConfig);
    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();

    const btnLogin = qs("btnLogin");
    const btnLogout = qs("btnLogout");
    const authBadge = qs("authBadge");
    const userLine = qs("userLine");

    const panelAguardando = qs("panelAguardando");
    const panelPresidente = qs("panelPresidente");
    const btnReload = qs("btnReload");

    const btnToggleNova = qs("btnToggleNova");
    const formNova = qs("formNova");
    const btnCriarReuniao = qs("btnCriarReuniao");

    const listaReunioes = qs("listaReunioes");

    const panelReuniao = qs("panelReuniao");
    const linkPublico = qs("linkPublico");

    const btnCopiarLink = qs("btnCopiarLink");
    const btnAtualizarListas = qs("btnAtualizarListas");
    const btnRelatorio = qs("btnRelatorio");
    const btnAta = qs("btnAta");

    const tblConfirmadosBody = qs("tblConfirmados")?.querySelector("tbody");
    const tblPresentesBody = qs("tblPresentes")?.querySelector("tbody");

    const panelAta = qs("panelAta");
    const btnSalvarAta = qs("btnSalvarAta");
    const btnCancelarAta = qs("btnCancelarAta");

    let session = null; // { idUsuario, perfil, nome, comite, email }
    let reunioes = [];
    let reuniaoAtual = null;
    let editor = null;

    function setAuthUI(logado) {
      if (logado) {
        btnLogin?.classList.add("hidden");
        btnLogout?.classList.remove("hidden");
        btnReload?.classList.remove("hidden");
        authBadge.textContent = "Logado";
      } else {
        btnLogin?.classList.remove("hidden");
        btnLogout?.classList.add("hidden");
        btnReload?.classList.add("hidden");
        authBadge.textContent = "Deslogado";
      }
    }

    function renderReunioes() {
      if (!listaReunioes) return;
      listaReunioes.innerHTML = "";

      if (!reunioes.length) {
        const div = document.createElement("div");
        div.className = "notice";
        div.textContent = "Nenhuma reunião cadastrada.";
        listaReunioes.appendChild(div);
        return;
      }

      reunioes
        .slice()
        .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
        .forEach((r) => {
          const item = document.createElement("div");
          item.className = "item";

          const left = document.createElement("div");
          const h = document.createElement("h3");
          h.textContent = r.titulo || "(sem título)";
          const p = document.createElement("p");
          p.textContent = `${fmtDate(r.data)} • ${r.tipo || ""} • ${r.local || ""}`;
          left.appendChild(h);
          left.appendChild(p);

          const right = document.createElement("div");
          right.className = "row";
          const btnOpen = document.createElement("button");
          btnOpen.textContent = "Abrir";
          btnOpen.addEventListener("click", () => selecionarReuniao(r));
          right.appendChild(btnOpen);

          item.appendChild(left);
          item.appendChild(right);
          listaReunioes.appendChild(item);
        });
    }

    function clearTables() {
      if (tblConfirmadosBody) tblConfirmadosBody.innerHTML = "";
      if (tblPresentesBody) tblPresentesBody.innerHTML = "";
    }

    function rowHtml(cells) {
      const tr = document.createElement("tr");
      cells.forEach((c) => {
        const td = document.createElement("td");
        td.textContent = c == null ? "" : String(c);
        tr.appendChild(td);
      });
      return tr;
    }

    async function atualizarListas() {
      if (!reuniaoAtual) return;
      clearTables();
      btnAtualizarListas.disabled = true;
      try {
        const [c, p] = await Promise.all([
          api({ acao: "listarConfirmacoes", idReuniao: reuniaoAtual.idReuniao }),
          api({ acao: "listarPresentes", idReuniao: reuniaoAtual.idReuniao }),
        ]);

        (c.confirmacoes || []).forEach((x) => {
          tblConfirmadosBody?.appendChild(rowHtml([x.nome, x.orgao, x.precisaDiaria]));
        });
        (p.presentes || []).forEach((x) => {
          tblPresentesBody?.appendChild(rowHtml([x.nome, x.cpf, x.codigoAutenticacao, x.dataHoraValidacao]));
        });
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnAtualizarListas.disabled = false;
      }
    }

    async function selecionarReuniao(r) {
      reuniaoAtual = r;
      qs("reuniaoSelecionada").textContent = `${r.titulo || ""} (${fmtDate(r.data)})`;
      panelReuniao.classList.remove("hidden");
      linkPublico.textContent = r.linkConfirmacao || "";
      clearTables();
      panelAta.classList.add("hidden");
      await atualizarListas();
    }

    async function doLogin(user) {
      setNotice(null, "");
      const email = user.email;
      const uid = user.uid;

      const r = await api({ acao: "login", email, uid, nome: user.displayName || "" });
      if (!r.autorizado) {
        panelPresidente.classList.add("hidden");
        panelAguardando.classList.remove("hidden");
        setNotice("err", r.mensagem || "Acesso não autorizado.");
        session = null;
        return;
      }

      session = {
        idUsuario: r.idUsuario,
        perfil: r.perfil,
        comite: r.comite,
        nome: r.nome,
        email,
      };

      userLine.textContent = `${session.nome || ""} • ${session.email || ""} • ${session.perfil || ""}`;

      panelAguardando.classList.add("hidden");
      panelPresidente.classList.remove("hidden");
      await carregarReunioes();
    }

    async function carregarReunioes() {
      if (!session) return;
      setNotice(null, "");
      const r = await api({ acao: "listarReunioes", idUsuario: session.idUsuario });
      reunioes = r.reunioes || [];
      renderReunioes();
    }

    async function criarReuniao() {
      setNotice(null, "");
      if (!session) return;

      const titulo = (qs("nrTitulo")?.value || "").trim();
      const data = (qs("nrData")?.value || "").trim();
      const tipo = (qs("nrTipo")?.value || "").trim();
      const local = (qs("nrLocal")?.value || "").trim();

      if (!titulo) return setNotice("err", "Informe o título.");
      if (!data) return setNotice("err", "Informe a data.");

      btnCriarReuniao.disabled = true;
      try {
        const r = await api({ acao: "criarReuniao", titulo, data, tipo, local, idPresidente: session.idUsuario });
        if (r.sucesso) {
          setNotice("ok", "Reunião criada.");
          formNova.classList.add("hidden");
          await carregarReunioes();
        } else {
          setNotice("err", r.mensagem || "Não foi possível criar.");
        }
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnCriarReuniao.disabled = false;
      }
    }

    async function gerarRelatorio() {
      if (!reuniaoAtual) return;
      btnRelatorio.disabled = true;
      try {
        const r = await api({ acao: "gerarRelatorioDiarias", idReuniao: reuniaoAtual.idReuniao });
        if (r.sucesso && r.url) window.open(r.url, "_blank");
        else setNotice("err", r.mensagem || "Não foi possível gerar.");
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnRelatorio.disabled = false;
      }
    }

    async function abrirAta() {
      if (!reuniaoAtual) return;
      panelAta.classList.remove("hidden");

      if (!editor) {
        editor = await ClassicEditor.create(qs("editorAta"), {
          toolbar: ["heading", "|", "bold", "italic", "link", "bulletedList", "numberedList", "|", "undo", "redo"],
        });
      }

      editor.setData("<p>Digite a ata aqui...</p>");
    }

    async function salvarAta() {
      if (!reuniaoAtual) return;
      if (!editor) return;

      btnSalvarAta.disabled = true;
      try {
        const html = editor.getData();
        const r = await api({ acao: "salvarAta", idReuniao: reuniaoAtual.idReuniao, html });
        if (r.sucesso) {
          setNotice("ok", "Ata salva.");
          panelAta.classList.add("hidden");
          await carregarReunioes();
          // Atualiza link no painel se necessário
          if (r.url) setNotice("ok", "Ata salva. Link: " + r.url);
        } else {
          setNotice("err", r.mensagem || "Não foi possível salvar.");
        }
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnSalvarAta.disabled = false;
      }
    }

    btnLogin?.addEventListener("click", async () => {
      setNotice(null, "");
      await auth.signInWithPopup(provider);
    });

    btnLogout?.addEventListener("click", async () => {
      await auth.signOut();
    });

    btnReload?.addEventListener("click", carregarReunioes);

    btnToggleNova?.addEventListener("click", () => formNova.classList.toggle("hidden"));
    btnCriarReuniao?.addEventListener("click", criarReuniao);

    btnCopiarLink?.addEventListener("click", async () => {
      const text = linkPublico?.textContent || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setNotice("ok", "Link copiado.");
    });

    btnAtualizarListas?.addEventListener("click", atualizarListas);
    btnRelatorio?.addEventListener("click", gerarRelatorio);

    btnAta?.addEventListener("click", abrirAta);
    btnCancelarAta?.addEventListener("click", () => panelAta.classList.add("hidden"));
    btnSalvarAta?.addEventListener("click", salvarAta);

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setAuthUI(false);
        userLine.textContent = "-";
        panelAguardando.classList.add("hidden");
        panelPresidente.classList.add("hidden");
        panelReuniao.classList.add("hidden");
        reunioes = [];
        reuniaoAtual = null;
        session = null;
        setNotice(null, "");
        return;
      }

      setAuthUI(true);
      userLine.textContent = `${user.displayName || ""} • ${user.email || ""}`;

      try {
        await doLogin(user);
      } catch (e) {
        setNotice("err", e.message);
      }
    });
  }

  // -------------------- Boot --------------------
  const isPublic = /validar-presenca\.html/i.test(window.location.pathname);
  if (isPublic) {
    initPublic();
  } else {
    initPanel();
  }
})();
