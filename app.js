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

  function api(payload) {
    const base = window.APPS_SCRIPT_URL || (typeof APPS_SCRIPT_URL !== "undefined" ? APPS_SCRIPT_URL : "");
    if (!base) return Promise.reject(new Error("APPS_SCRIPT_URL não configurada."));

    if (payload && payload.acao !== "login") {
      const sid = window.__SID__;
      if (sid) {
        payload.sid = sid;
        if (payload.idToken) delete payload.idToken;
      }
    }

    return new Promise((resolve, reject) => {
      const cb = "__cb_" + Math.random().toString(36).slice(2);
      const timeoutMs = 25000;

      const clean = () => {
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
        if (timer) clearTimeout(timer);
      };

      window[cb] = (data) => {
        clean();
        if (data && data.erro) return reject(new Error(data.erro));
        resolve(data);
      };

      const u = new URL(base);
      u.searchParams.set("acao", payload.acao || "");
      u.searchParams.set("callback", cb);
      u.searchParams.set("payload", JSON.stringify(payload));
      u.searchParams.set("_ts", String(Date.now()));

      const script = document.createElement("script");
      script.src = u.toString();
      script.onerror = () => {
        clean();
        reject(new Error("Falha ao chamar API (JSONP)."));
      };

      const timer = setTimeout(() => {
        clean();
        reject(new Error("Timeout ao chamar API."));
      }, timeoutMs);

      document.head.appendChild(script);
    });
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
    let idReuniao = getUrlParam("id");
    const badge = qs("reuniaoBadge");
    if (badge) badge.textContent = "Reunião: " + (idReuniao || "-");

    const panelEscolha = qs("panelEscolha");
    const pubComite = qs("pubComite");
    const pubReuniao = qs("pubReuniao");

    const COMITES = [
      "CBH Lago de Palmas",
      "CBH Rio Palma",
      "CBH Manoel Alves",
      "CBH Lontra e Corda",
      "CBH S. Teresa e S. Antônio",
      "CBH Coco e Caiapó",
    ];

    function fillSelect(selectEl, items, placeholder) {
      if (!selectEl) return;
      selectEl.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = placeholder || "Selecione...";
      selectEl.appendChild(opt0);
      (items || []).forEach((x) => {
        const o = document.createElement("option");
        o.value = x.value;
        o.textContent = x.label;
        selectEl.appendChild(o);
      });
    }

    async function carregarReunioesPublicas() {
      const comite = (pubComite?.value || "").trim();
      if (!comite) {
        fillSelect(pubReuniao, [], "Selecione a reunião...");
        return;
      }
      const r = await api({ acao: "listarReunioesPublicas", comite });
      const items = (r.reunioes || []).map((x) => ({
        value: x.idReuniao,
        label: `${fmtDate(x.data)} - ${x.titulo || "(sem título)"}`,
      }));
      fillSelect(pubReuniao, items, items.length ? "Selecione a reunião..." : "Nenhuma reunião agendada");
    }

    if (!idReuniao) {
      if (panelEscolha) panelEscolha.classList.remove("hidden");
      fillSelect(pubComite, COMITES.map((c) => ({ value: c, label: c })), "Selecione o comitê...");
      await carregarReunioesPublicas();
      pubComite?.addEventListener("change", async () => {
        try {
          await carregarReunioesPublicas();
        } catch (e) {
          setNotice("err", e.message);
        }
      });
      pubReuniao?.addEventListener("change", () => {
        idReuniao = (pubReuniao?.value || "").trim();
        if (badge) badge.textContent = "Reunião: " + (idReuniao || "-");
      });
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

      if (!idReuniao) {
        setNotice("err", "Selecione o comitê e a reunião.");
        return;
      }

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
      const cidade = (qs("cidade")?.value || "").trim();
      const perfil = (qs("perfil")?.value || "Membro").trim();
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
          cidade,
          perfil,
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
    const panelCadastro = qs("panelCadastro");
    const cadComite = qs("cadComite");
    const cadTelefone = qs("cadTelefone");
    const cadOrgao = qs("cadOrgao");
    const btnSalvarCadastro = qs("btnSalvarCadastro");

    const panelAprovacoes = qs("panelAprovacoes");
    const aprovInfo = qs("aprovInfo");
    const btnCarregarPendentes = qs("btnCarregarPendentes");
    const listaPendentes = qs("listaPendentes");
    const btnReload = qs("btnReload");

    const btnToggleNova = qs("btnToggleNova");
    const formNova = qs("formNova");
    const btnCriarReuniao = qs("btnCriarReuniao");
    const nrComiteWrap = qs("nrComiteWrap");
    const nrComite = qs("nrComite");

    const listaReunioes = qs("listaReunioes");

    const panelReuniao = qs("panelReuniao");
    const linkPublico = qs("linkPublico");

    const btnCopiarLink = qs("btnCopiarLink");
    const reuniaoStatus = qs("reuniaoStatus");
    const btnAbrirReuniao = qs("btnAbrirReuniao");
    const btnFecharReuniao = qs("btnFecharReuniao");
    const btnPendentes = qs("btnPendentes");
    const btnConfirmar = qs("btnConfirmar");
    const panelValidarParticipacao = qs("panelValidarParticipacao");
    const btnRecarregarValidacao = qs("btnRecarregarValidacao");
    const listaValidacao = qs("listaValidacao");
    const btnRelatorio = qs("btnRelatorio");
    const btnAta = qs("btnAta");

    const tblConfirmadosBody = qs("tblConfirmados")?.querySelector("tbody");
    const tblPresentesBody = qs("tblPresentes")?.querySelector("tbody");

    const panelAta = qs("panelAta");
    const btnSalvarAta = qs("btnSalvarAta");
    const btnCancelarAta = qs("btnCancelarAta");
    const btnInserirLista = qs("btnInserirLista");
    const btnGerarPdfAta = qs("btnGerarPdfAta");
    const ataPdfAssinada = qs("ataPdfAssinada");
    const ataUploadStatus = qs("ataUploadStatus");
    const btnUploadAta = qs("btnUploadAta");

    let session = null; // { idUsuario, perfil, nome, comite, email }
    let reunioes = [];
    let reuniaoAtual = null;
    let editor = null;
    let idToken = null;

    const COMITES = [
      "CBH Lago de Palmas",
      "CBH Rio Palma",
      "CBH Manoel Alves",
      "CBH Lontra e Corda",
      "CBH S. Teresa e S. Antônio",
      "CBH Coco e Caiapó",
    ];

    function fillComites() {
      if (!cadComite) return;
      cadComite.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Selecione...";
      cadComite.appendChild(opt0);
      COMITES.forEach((c) => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        cadComite.appendChild(o);
      });
    }

    function fillComitesForNovaReuniao() {
      if (!nrComite) return;
      nrComite.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Selecione...";
      nrComite.appendChild(opt0);
      COMITES.forEach((c) => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        nrComite.appendChild(o);
      });
    }

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
      if (reuniaoStatus) reuniaoStatus.textContent = `Status: ${r.status || "-"}`;
      clearTables();
      panelAta.classList.add("hidden");
      panelValidarParticipacao?.classList.add("hidden");
      await atualizarListas();
    }

    async function abrirReuniao() {
      if (!reuniaoAtual) return;
      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente")) return setNotice("err", "Sem permissão.");
      btnAbrirReuniao.disabled = true;
      try {
        const r = await api({ acao: "abrirReuniao", idToken, idReuniao: reuniaoAtual.idReuniao });
        reuniaoAtual.status = r.status || "Aberta";
        if (reuniaoStatus) reuniaoStatus.textContent = `Status: ${reuniaoAtual.status}`;
        setNotice("ok", "Reunião aberta.");
        await carregarReunioes();
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnAbrirReuniao.disabled = false;
      }
    }

    async function fecharReuniao() {
      if (!reuniaoAtual) return;
      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente")) return setNotice("err", "Sem permissão.");
      btnFecharReuniao.disabled = true;
      try {
        const r = await api({ acao: "fecharReuniao", idToken, idReuniao: reuniaoAtual.idReuniao });
        reuniaoAtual.status = r.status || "Encerrada";
        if (reuniaoStatus) reuniaoStatus.textContent = `Status: ${reuniaoAtual.status}`;
        setNotice("ok", "Reunião fechada.");
        await carregarReunioes();
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnFecharReuniao.disabled = false;
      }
    }

    async function atualizarPendentes() {
      await atualizarListas();
      qs("tblConfirmados")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function confirmarParticipacao() {
      if (!reuniaoAtual) return;
      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente" && session.perfil !== "Secretario")) {
        setNotice("err", "Sem permissão.");
        return;
      }
      panelValidarParticipacao?.classList.remove("hidden");
      await carregarValidacoes();
      panelValidarParticipacao?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderValidacoes(items) {
      if (!listaValidacao) return;
      listaValidacao.innerHTML = "";
      if (!items.length) {
        const div = document.createElement("div");
        div.className = "notice";
        div.textContent = "Nenhum pré-confirmado pendente de validação.";
        listaValidacao.appendChild(div);
        return;
      }

      items.forEach((x) => {
        const item = document.createElement("div");
        item.className = "item";

        const left = document.createElement("div");
        const h = document.createElement("h3");
        h.textContent = x.nome || x.cpf || "-";
        const p = document.createElement("p");
        p.textContent = `${x.cpf || ""} • ${x.orgao || ""} • ${x.cidade || ""} • ${x.perfil || ""}`;
        left.appendChild(h);
        left.appendChild(p);

        const right = document.createElement("div");
        right.className = "row";
        const btn = document.createElement("button");
        btn.className = "primary";
        btn.textContent = "Validar";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await api({ acao: "validarParticipacao", idToken, idReuniao: reuniaoAtual.idReuniao, cpf: x.cpf });
            await carregarValidacoes();
          } catch (e) {
            setNotice("err", e.message);
          } finally {
            btn.disabled = false;
          }
        });
        right.appendChild(btn);

        item.appendChild(left);
        item.appendChild(right);
        listaValidacao.appendChild(item);
      });
    }

    async function carregarValidacoes() {
      if (!reuniaoAtual) return;
      if (!session) return;
      btnRecarregarValidacao && (btnRecarregarValidacao.disabled = true);
      try {
        const r = await api({ acao: "listarParaValidacao", idToken, idReuniao: reuniaoAtual.idReuniao });
        renderValidacoes(r.itens || []);
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnRecarregarValidacao && (btnRecarregarValidacao.disabled = false);
      }
    }

    async function doLogin(user) {
      setNotice(null, "");
      const email = user.email;
      const uid = user.uid;
      idToken = await user.getIdToken();

      const r = await api({ acao: "login", idToken, email, uid, nome: user.displayName || "" });
      if (!r.autorizado) {
        panelPresidente.classList.add("hidden");
        panelCadastro?.classList.add("hidden");
        panelAprovacoes?.classList.add("hidden");
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

      window.__SID__ = r.sid || null;

      userLine.textContent = `${session.nome || ""} • ${session.email || ""} • ${session.perfil || ""}`;

      panelAguardando.classList.add("hidden");

      // Primeiro acesso: se não tiver comitê, obriga cadastro complementar
      if (!session.comite) {
        fillComites();
        panelPresidente.classList.add("hidden");
        panelCadastro?.classList.remove("hidden");
        panelAprovacoes?.classList.add("hidden");
        setNotice("err", "Complete seu cadastro para solicitar aprovação.");
        return;
      }

      panelCadastro?.classList.add("hidden");
      panelPresidente.classList.remove("hidden");

      if (session.perfil === "Admin" || session.perfil === "Presidente") {
        btnToggleNova?.classList.remove("hidden");
      } else {
        btnToggleNova?.classList.add("hidden");
        formNova?.classList.add("hidden");
      }

      if (session.perfil === "Admin") {
        if (nrComiteWrap) nrComiteWrap.style.display = "";
        fillComitesForNovaReuniao();
      } else {
        if (nrComiteWrap) nrComiteWrap.style.display = "none";
      }

      await carregarReunioes();

      // Admin/Presidente pode aprovar pendentes
      if (session.perfil === "Admin" || session.perfil === "Presidente") {
        panelAprovacoes?.classList.remove("hidden");
        await carregarPendentes();
      } else {
        panelAprovacoes?.classList.add("hidden");
      }
    }

    async function salvarCadastro() {
      if (!session) return;
      setNotice(null, "");
      btnSalvarCadastro.disabled = true;
      try {
        const comite = (cadComite?.value || "").trim();
        const telefone = (cadTelefone?.value || "").trim();
        const orgao = (cadOrgao?.value || "").trim();

        const r = await api({
          acao: "completarCadastro",
          idToken,
          idUsuario: session.idUsuario,
          comite,
          telefone,
          orgao,
        });
        if (r.status === "ok") {
          panelCadastro?.classList.add("hidden");
          panelPresidente.classList.add("hidden");
          panelAprovacoes?.classList.add("hidden");
          panelAguardando.classList.remove("hidden");
          setNotice("err", "Cadastro enviado. Aguardando aprovação.");
        }
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnSalvarCadastro.disabled = false;
      }
    }

    function renderPendentes(items) {
      if (!listaPendentes) return;
      listaPendentes.innerHTML = "";
      if (!items.length) {
        const div = document.createElement("div");
        div.className = "notice";
        div.textContent = "Nenhum pendente.";
        listaPendentes.appendChild(div);
        return;
      }

      items.forEach((u) => {
        const item = document.createElement("div");
        item.className = "item";

        const left = document.createElement("div");
        const h = document.createElement("h3");
        h.textContent = u.nome || u.email;
        const p = document.createElement("p");
        p.textContent = `${u.email || ""} • ${u.comite || ""}`;
        left.appendChild(h);
        left.appendChild(p);

        const right = document.createElement("div");
        right.className = "row";

        const sel = document.createElement("select");
        ["Membro", "Secretario", "Presidente"].forEach((x) => {
          const o = document.createElement("option");
          o.value = x;
          o.textContent = x;
          sel.appendChild(o);
        });

        const btn = document.createElement("button");
        btn.className = "primary";
        btn.textContent = "Aprovar";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await api({ acao: "aprovarUsuario", idToken, idUsuario: u.idUsuario, novoPerfil: sel.value });
            await carregarPendentes();
          } catch (e) {
            setNotice("err", e.message);
          } finally {
            btn.disabled = false;
          }
        });

        right.appendChild(sel);
        right.appendChild(btn);

        item.appendChild(left);
        item.appendChild(right);
        listaPendentes.appendChild(item);
      });
    }

    async function carregarPendentes() {
      if (!session) return;
      try {
        const r = await api({ acao: "listarPendentes", idToken });
        if (aprovInfo) {
          if (r.perfilRequester === "Admin") aprovInfo.textContent = "Você vê pendentes de todos os comitês.";
          else aprovInfo.textContent = "Você vê pendentes do comitê: " + (r.comiteRequester || "-");
        }
        renderPendentes(r.pendentes || []);
      } catch (e) {
        setNotice("err", e.message);
      }
    }

    async function carregarReunioes() {
      if (!session) return;
      setNotice(null, "");
      const r = await api({ acao: "listarReunioes", idToken, idUsuario: session.idUsuario });
      reunioes = r.reunioes || [];
      renderReunioes();
    }

    async function criarReuniao() {
      setNotice(null, "");
      if (!session) return;

      if (session.perfil !== "Admin" && session.perfil !== "Presidente") {
        setNotice("err", "Sem permissão.");
        return;
      }

      const titulo = (qs("nrTitulo")?.value || "").trim();
      const data = (qs("nrData")?.value || "").trim();
      const tipo = (qs("nrTipo")?.value || "").trim();
      const local = (qs("nrLocal")?.value || "").trim();

      if (!titulo) return setNotice("err", "Informe o título.");
      if (!data) return setNotice("err", "Informe a data.");

      btnCriarReuniao.disabled = true;
      try {
        const comite = session.perfil === "Admin" ? (nrComite?.value || "").trim() : session.comite;
        const r = await api({ acao: "criarReuniao", idToken, titulo, data, tipo, local, comite, idPresidente: session.idUsuario });
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
        const r = await api({ acao: "gerarRelatorioDiarias", idToken, idReuniao: reuniaoAtual.idReuniao });
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

      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente" && session.perfil !== "Secretario")) {
        setNotice("err", "Sem permissão.");
        return;
      }

      panelAta.classList.remove("hidden");

      if (!editor) {
        editor = await ClassicEditor.create(qs("editorAta"), {
          toolbar: ["heading", "|", "bold", "italic", "link", "bulletedList", "numberedList", "|", "undo", "redo"],
        });
      }

      try {
        const r = await api({ acao: "obterAtaRascunho", idToken, idReuniao: reuniaoAtual.idReuniao });
        editor.setData(r.html || "<p>Digite a ata aqui...</p>");
        if (ataUploadStatus) {
          const link = (r.ataPdfAssinadaLink || "").toString().trim();
          ataUploadStatus.textContent = link ? ("Publicado: " + link) : "";
        }
      } catch (e) {
        editor.setData("<p>Digite a ata aqui...</p>");
      }
    }

    async function salvarAta() {
      if (!reuniaoAtual) return;
      if (!editor) return;

      btnSalvarAta.disabled = true;
      try {
        const html = editor.getData();
        const r = await api({ acao: "salvarAtaRascunho", idToken, idReuniao: reuniaoAtual.idReuniao, html });
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

    async function inserirListaPresenca() {
      if (!reuniaoAtual || !editor) return;
      btnInserirLista.disabled = true;
      try {
        const r = await api({ acao: "gerarListaPresencaHtml", idToken, idReuniao: reuniaoAtual.idReuniao });
        const current = editor.getData() || "";
        editor.setData(current + "<hr/>" + (r.html || ""));
        setNotice("ok", "Lista inserida na ATA.");
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnInserirLista.disabled = false;
      }
    }

    async function gerarPdfAta() {
      if (!reuniaoAtual || !editor) return;
      btnGerarPdfAta.disabled = true;
      try {
        const html = editor.getData();
        const r = await api({ acao: "gerarPdfAta", idToken, idReuniao: reuniaoAtual.idReuniao, html });
        if (r.sucesso && r.url) window.open(r.url, "_blank");
        else setNotice("err", r.mensagem || "Não foi possível gerar PDF.");
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnGerarPdfAta.disabled = false;
      }
    }

    function setUploadStatus(text) {
      if (!ataUploadStatus) return;
      ataUploadStatus.textContent = text || "";
    }

    function readFileAsBase64(file, onProgress) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        reader.onprogress = (e) => {
          if (onProgress && e.lengthComputable) onProgress(e.loaded, e.total);
        };
        reader.onload = () => {
          const res = String(reader.result || "");
          // data:application/pdf;base64,xxxx
          const idx = res.indexOf("base64,");
          resolve(idx >= 0 ? res.slice(idx + 7) : res);
        };
        reader.readAsDataURL(file);
      });
    }

    async function uploadAtaAssinada() {
      if (!reuniaoAtual) return;
      if (!session || session.perfil !== "Presidente") {
        setNotice("err", "Somente o Presidente pode publicar a ATA.");
        return;
      }
      const file = ataPdfAssinada?.files?.[0];
      if (!file) {
        setNotice("err", "Selecione o PDF assinado.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setNotice("err", "Arquivo muito grande. Limite: 10 MB.");
        return;
      }
      if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name || "")) {
        setNotice("err", "Arquivo inválido. Envie um PDF.");
        return;
      }

      btnUploadAta.disabled = true;
      setNotice(null, "");
      setUploadStatus("Lendo arquivo...");

      try {
        const b64 = await readFileAsBase64(file, (loaded, total) => {
          const pct = total ? Math.round((loaded / total) * 100) : 0;
          setUploadStatus("Lendo arquivo... " + pct + "%");
        });

        // chunking (JSONP tem limite de URL; manter pequeno para evitar 414/URI Too Long)
        const chunkSize = 8 * 1024; // 8k chars
        const totalChunks = Math.max(1, Math.ceil(b64.length / chunkSize));

        setUploadStatus("Iniciando upload...");
        const init = await api({
          acao: "iniciarUploadAtaAssinada",
          idToken,
          idReuniao: reuniaoAtual.idReuniao,
          fileName: file.name || "ATA_ASSINADA.pdf",
          totalChunks,
        });
        const uploadId = init.uploadId;
        if (!uploadId) throw new Error("Falha ao iniciar upload.");

        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(b64.length, start + chunkSize);
          const part = b64.slice(start, end);
          await api({
            acao: "enviarChunkAtaAssinada",
            idToken,
            idReuniao: reuniaoAtual.idReuniao,
            uploadId,
            chunkIndex: i,
            data: part,
          });
          const pct = Math.round(((i + 1) / totalChunks) * 100);
          setUploadStatus("Enviando... " + pct + "%");
        }

        setUploadStatus("Finalizando...");
        const fin = await api({
          acao: "finalizarUploadAtaAssinada",
          idToken,
          idReuniao: reuniaoAtual.idReuniao,
          uploadId,
        });

        if (fin.sucesso && fin.url) {
          setUploadStatus("Publicado: " + fin.url);
          setNotice("ok", "ATA assinada enviada e publicada. Link: " + fin.url);
          await carregarReunioes();
        } else {
          throw new Error(fin.mensagem || "Não foi possível finalizar upload.");
        }
      } catch (e) {
        setNotice("err", e.message);
        setUploadStatus("Erro: " + e.message);
      } finally {
        btnUploadAta.disabled = false;
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

    btnSalvarCadastro?.addEventListener("click", salvarCadastro);
    btnCarregarPendentes?.addEventListener("click", carregarPendentes);

    btnToggleNova?.addEventListener("click", () => formNova.classList.toggle("hidden"));
    btnCriarReuniao?.addEventListener("click", criarReuniao);

    btnCopiarLink?.addEventListener("click", async () => {
      const text = linkPublico?.textContent || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setNotice("ok", "Link copiado.");
    });

    btnRelatorio?.addEventListener("click", gerarRelatorio);
    btnAbrirReuniao?.addEventListener("click", abrirReuniao);
    btnFecharReuniao?.addEventListener("click", fecharReuniao);
    btnPendentes?.addEventListener("click", atualizarPendentes);
    btnConfirmar?.addEventListener("click", confirmarParticipacao);
    btnRecarregarValidacao?.addEventListener("click", carregarValidacoes);

    btnAta?.addEventListener("click", abrirAta);
    btnCancelarAta?.addEventListener("click", () => panelAta.classList.add("hidden"));
    btnSalvarAta?.addEventListener("click", salvarAta);
    btnInserirLista?.addEventListener("click", inserirListaPresenca);
    btnGerarPdfAta?.addEventListener("click", gerarPdfAta);
    btnUploadAta?.addEventListener("click", uploadAtaAssinada);

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setAuthUI(false);
        userLine.textContent = "-";
        panelAguardando.classList.add("hidden");
        panelPresidente.classList.add("hidden");
        panelCadastro?.classList.add("hidden");
        panelAprovacoes?.classList.add("hidden");
        panelReuniao.classList.add("hidden");
        reunioes = [];
        reuniaoAtual = null;
        session = null;
        idToken = null;
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
