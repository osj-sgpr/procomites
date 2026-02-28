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

  function getApiBaseUrls() {
    const out = [];
    if (Array.isArray(window.APPS_SCRIPT_URLS)) {
      window.APPS_SCRIPT_URLS.forEach((u) => {
        const s = String(u || "").trim();
        if (s && out.indexOf(s) === -1) out.push(s);
      });
    }
    const single = window.APPS_SCRIPT_URL || (typeof APPS_SCRIPT_URL !== "undefined" ? APPS_SCRIPT_URL : "");
    if (single && out.indexOf(single) === -1) out.push(single);
    return out;
  }

  function callJsonp(base, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const cb = "__cb_" + Math.random().toString(36).slice(2);

      let script;
      let timer;
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

      script = document.createElement("script");
      script.src = u.toString();
      script.onerror = () => {
        clean();
        reject(new Error("Falha ao chamar API (JSONP)."));
      };

      timer = setTimeout(() => {
        clean();
        reject(new Error("Timeout ao chamar API."));
      }, timeoutMs || 25000);

      var target = document.getElementsByTagName('head')[0] || document.documentElement;
      target.appendChild(script);
    });
  }

  async function api(payload) {
    const bases = getApiBaseUrls();
    if (!bases.length) return Promise.reject(new Error("APPS_SCRIPT_URL não configurada."));

    // Usa fallback se disponível e houver falhas anteriores
    if (window.JsonpFallback && window.JsonpFallback.shouldUseFallback()) {
      console.warn('Usando fallback JSONP devido a falhas anteriores.');
      const bases = getApiBaseUrls();
      return window.JsonpFallback.fetchFallback(bases[0], payload);
    }

    if (payload && payload.acao !== "login") {
      const sid = window.__SID__;
      if (sid) payload.sid = sid;
    }

    let lastErr = null;
    for (let i = 0; i < bases.length; i++) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await callJsonp(bases[i], payload || {}, 25000 + ((attempt - 1) * 7000));
          // Reset falhas em sucesso
          if (window.JsonpFallback) window.JsonpFallback.resetFailures();
          return result;
        } catch (e) {
          lastErr = e;
          console.warn(`Tentativa ${attempt}/${3} falhou em ${bases[i]}:`, e.message);
          if (attempt < 3) await new Promise(res => setTimeout(res, 1000 * attempt));
        }
      }
    }
    // Se todas falharam, tentar fallback
    if (window.JsonpFallback) {
      console.warn('Todas as tentativas JSONP falharam, usando fallback.');
      try {
        const bases = getApiBaseUrls();
        return await window.JsonpFallback.fetchFallback(bases[0], payload);
      } catch (fallbackErr) {
        console.error('Fallback também falhou:', fallbackErr);
      }
    }
    throw lastErr || new Error("Falha ao chamar API.");
  }

  function getUrlParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function normalizeCpf(v) {
    return (v || "").replace(/\D/g, "").slice(0, 11);
  }

  function normalizePhone(v) {
    return (v || "").replace(/\D/g, "").slice(0, 15);
  }

  function formatCpf(v) {
    const d = normalizeCpf(v);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function formatPhone(v) {
    const d = normalizePhone(v).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  function isInvalidActionError(err, actionName) {
    const msg = (err && err.message ? err.message : "").toLowerCase();
    if (!actionName) return msg.indexOf("ação inválida") >= 0 || msg.indexOf("acao invalida") >= 0;
    const a = String(actionName).toLowerCase();
    return msg.indexOf("ação inválida: " + a) >= 0 || msg.indexOf("acao invalida: " + a) >= 0;
  }

  // -------------------- Página pública (validar-presenca.html) --------------------
  async function initPublic() {
    let idReuniao = (getUrlParam("id") || "").trim();
    let reuniaoSelecionadaPublica = null;
    const badge = qs("reuniaoBadge");
    const reuniaoMeta = qs("reuniaoMeta");
    const reuniaoLocalLink = qs("reuniaoLocalLink");
    const subTitle = qs("subTitle");
    if (badge) badge.textContent = "Reunião: " + (idReuniao || "-");

    const panelEscolha = qs("panelEscolha");
    const pubComite = qs("pubComite");
    const pubReuniao = qs("pubReuniao");
    const panelNovo = qs("panelNovo");
    const panelCodigo = qs("panelCodigo");
    const codigoEl = qs("codigo");
    const cpfEl = qs("cpf");
    const btnValidar = qs("btnValidar");

    const btnPublicTabConfirmar = qs("btnPublicTabConfirmar");
    const btnPublicTabDiaria = qs("btnPublicTabDiaria");
    const btnPublicTabAssinatura = qs("btnPublicTabAssinatura");
    const panelPublicConfirmar = qs("panelPublicConfirmar");
    const panelPublicDiaria = qs("panelPublicDiaria");
    const panelPublicAssinatura = qs("panelPublicAssinatura");

    const diariaComiteEl = qs("diariaComite");
    const diariaTipoParticipacaoEl = qs("diariaTipoParticipacao");
    const diariaReuniaoWrapEl = qs("diariaReuniaoWrap");
    const diariaReuniaoEl = qs("diariaReuniao");
    const diariaDescricaoSolicitacaoWrapEl = qs("diariaDescricaoSolicitacaoWrap");
    const diariaDescricaoSolicitacaoEl = qs("diariaDescricaoSolicitacao");
    const diariaCpfEl = qs("diariaCpf");
    const diariaNomeEl = qs("diariaNome");
    const diariaEmailEl = qs("diariaEmail");
    const diariaTelefoneEl = qs("diariaTelefone");
    const diariaAnexoEl = qs("diariaAnexo");
    const diariaAnexoStatusEl = qs("diariaAnexoStatus");
    const btnEnviarDiaria = qs("btnEnviarDiaria");

    const assinaturaIdConfirmacaoEl = qs("assinaturaIdConfirmacao");
    const assinaturaCodigoEl = qs("assinaturaCodigo");
    const btnValidarAssinatura = qs("btnValidarAssinatura");
    const assinaturaResultadoEl = qs("assinaturaResultado");
    const assinaturaResultadoTextoEl = qs("assinaturaResultadoTexto");

    const COMITES = [
      "CBH Lago de Palmas",
      "CBH Rio Palma",
      "CBH Manoel Alves",
      "CBH Lontra e Corda",
      "CBH S. Teresa e S. Antônio",
      "CBH Coco e Caiapó",
      "CBH Formoso do Araguaia",
    ];

    let reunioesAtuais = [];
    let reunioesDiariaAtuais = [];
    let publicTabAtual = "confirmar";

    function isHttpUrl(v) {
      try {
        const u = new URL(String(v || ""));
        return u.protocol === "http:" || u.protocol === "https:";
      } catch (e) {
        return false;
      }
    }

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

    function renderReuniaoHeader(reuniao) {
      reuniaoSelecionadaPublica = reuniao || null;
      if (!reuniao) {
        if (badge) badge.textContent = "Reunião: " + (idReuniao || "-");
        if (reuniaoMeta) reuniaoMeta.textContent = idReuniao ? "ID da reunião: " + idReuniao : "Selecione uma reunião para continuar.";
        if (reuniaoLocalLink) reuniaoLocalLink.classList.add("hidden");
        return;
      }

      if (badge) badge.textContent = "Reunião: " + (reuniao.titulo || reuniao.idReuniao || "-");

      const dataTxt = fmtDate(reuniao.data);
      const parts = [];
      if (reuniao.comite) parts.push(reuniao.comite);
      if (dataTxt) parts.push("Data: " + dataTxt);
      if (reuniao.tipo) parts.push("Modalidade: " + reuniao.tipo);
      if (reuniao.local && !isHttpUrl(reuniao.local)) parts.push("Local: " + reuniao.local);
      if (reuniaoMeta) reuniaoMeta.textContent = parts.join(" | ");

      if (subTitle && reuniao.comite) {
        subTitle.textContent = reuniao.comite;
      }

      if (reuniaoLocalLink) {
        if (reuniao.local && isHttpUrl(reuniao.local)) {
          reuniaoLocalLink.href = reuniao.local;
          reuniaoLocalLink.classList.remove("hidden");
        } else {
          reuniaoLocalLink.classList.add("hidden");
        }
      }
    }

    async function carregarReunioesPublicasPorComite(comite) {
      if (!comite) return [];
      const r = await api({ acao: "listarReunioesPublicas", comite });
      return r.reunioes || [];
    }

    function syncSelectedReuniao() {
      const selected = (pubReuniao?.value || "").trim();
      if (!selected && idReuniao && !reunioesAtuais.length) return idReuniao;
      if (selected) idReuniao = selected;
      const reuniao = reunioesAtuais.find((x) => (x.idReuniao || "").toString().trim() === idReuniao) || null;
      renderReuniaoHeader(reuniao);
      return idReuniao;
    }

    async function carregarReunioesPublicas() {
      const comite = (pubComite?.value || "").trim();
      if (!comite) {
        idReuniao = "";
        reunioesAtuais = [];
        fillSelect(pubReuniao, [], "Selecione a reunião...");
        renderReuniaoHeader(null);
        return;
      }
      reunioesAtuais = await carregarReunioesPublicasPorComite(comite);
      const items = reunioesAtuais.map((x) => ({
        value: x.idReuniao,
        label: `${fmtDate(x.data)} - ${x.titulo || "(sem título)"}`,
      }));
      fillSelect(pubReuniao, items, items.length ? "Selecione a reunião..." : "Nenhuma reunião agendada");
      idReuniao = "";
      renderReuniaoHeader(null);
      if (items.length === 1 && pubReuniao) {
        pubReuniao.value = items[0].value;
        syncSelectedReuniao();
      }
    }

    async function carregarDetalhePorId(id) {
      if (!id) {
        renderReuniaoHeader(null);
        return null;
      }
      for (let i = 0; i < COMITES.length; i++) {
        const comite = COMITES[i];
        try {
          const reunioes = await carregarReunioesPublicasPorComite(comite);
          const found = reunioes.find((x) => (x.idReuniao || "").toString().trim() === id);
          if (found) {
            renderReuniaoHeader(found);
            return found;
          }
        } catch (e) {
          // ignora erro por comitê e tenta os próximos
        }
      }
      renderReuniaoHeader(null);
      return null;
    }

    function setPublicTab(tab) {
      publicTabAtual = tab;
      if (btnPublicTabConfirmar) btnPublicTabConfirmar.classList.toggle("active", tab === "confirmar");
      if (btnPublicTabDiaria) btnPublicTabDiaria.classList.toggle("active", tab === "diaria");
      if (btnPublicTabAssinatura) btnPublicTabAssinatura.classList.toggle("active", tab === "assinatura");
      if (panelPublicConfirmar) panelPublicConfirmar.classList.toggle("hidden", tab !== "confirmar");
      if (panelPublicDiaria) panelPublicDiaria.classList.toggle("hidden", tab !== "diaria");
      if (panelPublicAssinatura) panelPublicAssinatura.classList.toggle("hidden", tab !== "assinatura");
    }

    function showCodigo(code) {
      if (panelCodigo) panelCodigo.classList.remove("hidden");
      if (codigoEl) codigoEl.textContent = code || "-";
    }

    function setAnexoStatus(msg) {
      if (!diariaAnexoStatusEl) return;
      diariaAnexoStatusEl.textContent = msg || "";
    }

    function updateDiariaUi() {
      const tipo = (diariaTipoParticipacaoEl?.value || "").trim();
      if (diariaReuniaoWrapEl) diariaReuniaoWrapEl.classList.toggle("hidden", tipo !== "reuniao");
      if (diariaReuniaoEl) diariaReuniaoEl.required = (tipo === "reuniao");
      if (diariaDescricaoSolicitacaoWrapEl) diariaDescricaoSolicitacaoWrapEl.classList.toggle("hidden", tipo !== "outro");
      if (diariaDescricaoSolicitacaoEl) {
        diariaDescricaoSolicitacaoEl.required = (tipo === "outro");
        if (tipo !== "outro") diariaDescricaoSolicitacaoEl.value = "";
      }
    }

    async function carregarReunioesDiaria() {
      const comite = (diariaComiteEl?.value || "").trim();
      if (!comite) {
        reunioesDiariaAtuais = [];
        fillSelect(diariaReuniaoEl, [], "Selecione a reunião...");
        return;
      }
      reunioesDiariaAtuais = await carregarReunioesPublicasPorComite(comite);
      const items = reunioesDiariaAtuais.map((x) => ({
        value: x.idReuniao,
        label: `${fmtDate(x.data)} - ${x.titulo || "(sem título)"}`,
      }));
      fillSelect(diariaReuniaoEl, items, items.length ? "Selecione a reunião..." : "Nenhuma reunião agendada");
    }

    function readFileAsBase64WithMime(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const raw = String(reader.result || "");
          const m = raw.match(/^data:([^;,]+);base64,(.*)$/);
          if (!m || !m[2]) return reject(new Error("Falha ao processar o anexo."));
          resolve({
            mimeType: (m[1] || file.type || "application/octet-stream").toString(),
            base64: String(m[2] || ""),
          });
        };
        reader.onerror = () => reject(new Error("Falha ao ler o anexo."));
        reader.readAsDataURL(file);
      });
    }

    async function uploadAnexoDiaria(file, comite, idReuniaoLocal) {
      if (!file) return { anexoUrl: "", anexoNome: "" };
      const filePayload = await readFileAsBase64WithMime(file);
      const base64 = (filePayload && filePayload.base64) || "";
      if (!base64) throw new Error("Arquivo de anexo inválido.");
      const chunkSize = 8 * 1024;
      const totalChunks = Math.ceil(base64.length / chunkSize);
      if (!totalChunks) throw new Error("Não foi possível processar o anexo.");
      setAnexoStatus("Enviando anexo (0%)...");

      const start = await api({
        acao: "iniciarUploadAnexoDiaria",
        comite,
        idReuniao: idReuniaoLocal,
        fileName: file.name || "anexo",
        mimeType: filePayload.mimeType,
        totalChunks,
      });
      if (!start || !start.sucesso || !start.uploadId) {
        throw new Error((start && start.mensagem) || "Falha ao iniciar upload do anexo.");
      }

      for (let i = 0; i < totalChunks; i++) {
        const part = base64.slice(i * chunkSize, (i + 1) * chunkSize);
        await api({
          acao: "enviarChunkAnexoDiaria",
          comite,
          idReuniao: idReuniaoLocal,
          uploadId: start.uploadId,
          chunkIndex: i,
          data: part,
        });
        const percent = Math.round(((i + 1) / totalChunks) * 100);
        setAnexoStatus(`Enviando anexo (${percent}%)...`);
      }

      const fin = await api({
        acao: "finalizarUploadAnexoDiaria",
        comite,
        idReuniao: idReuniaoLocal,
        uploadId: start.uploadId,
      });
      if (!fin || !fin.sucesso || !fin.url) {
        throw new Error((fin && fin.mensagem) || "Falha ao finalizar upload do anexo.");
      }
      setAnexoStatus("Anexo enviado.");
      return { anexoUrl: fin.url || "", anexoNome: fin.fileName || (file.name || "") };
    }

    function renderAssinaturaResultado(ok, msg, dados) {
      if (!assinaturaResultadoEl || !assinaturaResultadoTextoEl) return;
      assinaturaResultadoEl.classList.remove("hidden");
      const linhas = [];
      if (msg) linhas.push(msg);
      if (ok && dados) {
        if (dados.nome) linhas.push("Nome: " + dados.nome);
        if (dados.cpf) linhas.push("CPF: " + dados.cpf);
        if (dados.comite) linhas.push("Comitê: " + dados.comite);
        if (dados.reuniaoTitulo) linhas.push("Reunião: " + dados.reuniaoTitulo);
        if (dados.dataHoraValidacao) linhas.push("Data de validação: " + dados.dataHoraValidacao);
      }
      assinaturaResultadoTextoEl.textContent = linhas.join("\n");
    }

    async function validar() {
      setNotice(null, "");
      if (panelNovo) panelNovo.classList.add("hidden");
      if (panelCodigo) panelCodigo.classList.add("hidden");
      syncSelectedReuniao();

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
          setNotice("ok", r.mensagem || "Participação já validada.");
          if (r.codigo) showCodigo(r.codigo);
          return;
        }
        if (r.status === "ja_confirmado") {
          setNotice("ok", r.mensagem || "Participação já confirmada.");
          return;
        }
        if (r.status === "ok") {
          setNotice("ok", r.mensagem || "Participação confirmada.");
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
      syncSelectedReuniao();
      const cpf = normalizeCpf(cpfEl ? cpfEl.value : "");
      const nome = (qs("nome")?.value || "").trim();
      const email = (qs("email")?.value || "").trim();
      const telefone = (qs("telefone")?.value || "").trim();
      const orgao = (qs("orgao")?.value || "").trim();
      const cidade = (qs("cidade")?.value || "").trim();
      const perfil = (qs("perfil")?.value || "Membro").trim();

      if (!idReuniao) return setNotice("err", "Selecione a reunião.");
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
          telefone: normalizePhone(telefone),
          orgao,
          cidade,
          perfil,
          precisaDiaria: "NÃO",
        });
        if (r.status === "ja_presente") {
          setNotice("ok", r.mensagem || "Participação já validada.");
          if (panelNovo) panelNovo.classList.add("hidden");
          if (r.codigo) showCodigo(r.codigo);
          return;
        }
        if (r.status === "ja_confirmado") {
          setNotice("ok", r.mensagem || "Participação já confirmada.");
          if (panelNovo) panelNovo.classList.add("hidden");
          return;
        }
        if (r.status === "ok") {
          setNotice("ok", r.mensagem || "Participação confirmada.");
          if (panelNovo) panelNovo.classList.add("hidden");
          return;
        }
        setNotice("err", r.mensagem || "Erro ao salvar.");
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btn.disabled = false;
      }
    }

    async function salvarSolicitacaoDiaria() {
      setNotice(null, "");
      const comite = (diariaComiteEl?.value || "").trim();
      const tipoParticipacao = (diariaTipoParticipacaoEl?.value || "").trim();
      const idReuniaoDiaria = tipoParticipacao === "reuniao" ? (diariaReuniaoEl?.value || "").trim() : "";
      const cpf = normalizeCpf(diariaCpfEl?.value || "");
      const nome = (diariaNomeEl?.value || "").trim();
      const email = (diariaEmailEl?.value || "").trim();
      const telefone = normalizePhone(diariaTelefoneEl?.value || "");
      const orgao = (qs("diariaOrgao")?.value || "").trim();
      const cidade = (qs("diariaCidade")?.value || "").trim();
      const perfil = (qs("diariaPerfil")?.value || "Membro").trim();
      let descricaoSolicitacao = (diariaDescricaoSolicitacaoEl?.value || "").trim();
      const descricaoAcao = (qs("diariaDescricaoAcao")?.value || "").trim();
      const origem = (qs("diariaOrigem")?.value || "").trim();
      const destino = (qs("diariaDestino")?.value || "").trim();
      const itinerario = (qs("diariaItinerario")?.value || "").trim();
      const dataHoraSaida = (qs("diariaDataHoraSaida")?.value || "").trim();
      const dataHoraChegada = (qs("diariaDataHoraChegada")?.value || "").trim();
      const arquivo = diariaAnexoEl?.files && diariaAnexoEl.files.length ? diariaAnexoEl.files[0] : null;

      if (!comite) return setNotice("err", "Selecione o comitê para a solicitação de diária.");
      if (!tipoParticipacao) return setNotice("err", "Selecione o tipo da solicitação.");
      if (tipoParticipacao === "reuniao" && !idReuniaoDiaria) return setNotice("err", "Selecione a reunião ordinária.");
      if (cpf.length !== 11) return setNotice("err", "CPF inválido.");
      if (!nome) return setNotice("err", "Informe o nome completo.");
      if (!email) return setNotice("err", "Informe o e-mail.");
      if (!telefone) return setNotice("err", "Informe o telefone.");
      if (!orgao) return setNotice("err", "Informe o órgão.");
      if (!cidade) return setNotice("err", "Informe a cidade de residência.");
      if (!perfil) return setNotice("err", "Selecione o perfil.");
      if (tipoParticipacao === "outro" && !descricaoSolicitacao) return setNotice("err", "Detalhe o motivo da viagem para 'Outro motivo'.");
      if (!descricaoAcao) return setNotice("err", "Descreva a ação a ser realizada.");
      if (!origem || !destino) return setNotice("err", "Informe origem e destino.");
      if (!itinerario) return setNotice("err", "Informe o itinerário.");
      if (!dataHoraSaida || !dataHoraChegada) return setNotice("err", "Informe período de saída e chegada.");
      if (!arquivo) return setNotice("err", "Anexe o documento obrigatório (convite, card ou ofício).");

      if (!descricaoSolicitacao) {
        descricaoSolicitacao = tipoParticipacao === "reuniao"
          ? "Participação em reunião ordinária"
          : "Participação em evento";
      }

      btnEnviarDiaria.disabled = true;
      try {
        let anexoUrl = "";
        let anexoNome = "";
        const up = await uploadAnexoDiaria(arquivo, comite, idReuniaoDiaria);
        anexoUrl = up.anexoUrl || "";
        anexoNome = up.anexoNome || "";

        const r = await api({
          acao: "salvarSolicitacaoDiariaPublica",
          comite,
          tipoParticipacao,
          idReuniao: idReuniaoDiaria,
          cpf,
          nome,
          email,
          telefone,
          orgao,
          cidade,
          perfil,
          descricaoSolicitacao,
          descricaoAcao,
          origem,
          destino,
          itinerario,
          dataHoraSaida,
          dataHoraChegada,
          anexoUrl,
          anexoNome,
        });
        if (r.status === "ok") {
          setNotice("ok", r.mensagem || "Solicitação de diária enviada com sucesso.");
          if (diariaAnexoEl) diariaAnexoEl.value = "";
          return;
        }
        setNotice("err", r.mensagem || "Não foi possível enviar a solicitação de diária.");
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnEnviarDiaria.disabled = false;
      }
    }

    async function validarAssinatura() {
      setNotice(null, "");
      if (assinaturaResultadoEl) assinaturaResultadoEl.classList.add("hidden");
      const idConfirmacao = (assinaturaIdConfirmacaoEl?.value || "").trim();
      const codigo = (assinaturaCodigoEl?.value || "").trim();
      if (!idConfirmacao) return setNotice("err", "Informe o ID da confirmação.");
      if (!codigo) return setNotice("err", "Informe o código da assinatura.");

      btnValidarAssinatura.disabled = true;
      try {
        const r = await api({ acao: "validarAssinatura", idConfirmacao, codigo });
        if (r.status === "ok") {
          setNotice("ok", r.mensagem || "Assinatura válida.");
          renderAssinaturaResultado(true, r.mensagem || "Assinatura válida.", r.dados || null);
          return;
        }
        setNotice("err", r.mensagem || "Assinatura inválida.");
        renderAssinaturaResultado(false, r.mensagem || "Assinatura inválida.", null);
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnValidarAssinatura.disabled = false;
      }
    }

    if (cpfEl) {
      cpfEl.addEventListener("input", () => {
        cpfEl.value = formatCpf(cpfEl.value || "");
      });
    }
    if (diariaCpfEl) {
      diariaCpfEl.addEventListener("input", () => {
        diariaCpfEl.value = formatCpf(diariaCpfEl.value || "");
      });
    }

    const telEl = qs("telefone");
    if (telEl) {
      telEl.addEventListener("input", () => {
        telEl.value = formatPhone(telEl.value || "");
      });
    }
    if (diariaTelefoneEl) {
      diariaTelefoneEl.addEventListener("input", () => {
        diariaTelefoneEl.value = formatPhone(diariaTelefoneEl.value || "");
      });
    }

    fillSelect(pubComite, COMITES.map((c) => ({ value: c, label: c })), "Selecione o comitê...");
    fillSelect(diariaComiteEl, COMITES.map((c) => ({ value: c, label: c })), "Selecione o comitê...");

    if (!idReuniao) {
      if (panelEscolha) panelEscolha.classList.remove("hidden");
      await carregarReunioesPublicas();
    } else {
      if (panelEscolha) panelEscolha.classList.add("hidden");
      const detalhe = await carregarDetalhePorId(idReuniao);
      if (detalhe && detalhe.comite && diariaComiteEl) {
        diariaComiteEl.value = detalhe.comite;
        await carregarReunioesDiaria();
        if (diariaReuniaoEl) diariaReuniaoEl.value = idReuniao;
      }
    }

    pubComite?.addEventListener("change", async () => {
      try {
        if (panelNovo) panelNovo.classList.add("hidden");
        if (panelCodigo) panelCodigo.classList.add("hidden");
        await carregarReunioesPublicas();
      } catch (e) {
        setNotice("err", e.message);
      }
    });
    pubReuniao?.addEventListener("change", () => {
      syncSelectedReuniao();
    });

    diariaComiteEl?.addEventListener("change", async () => {
      try {
        await carregarReunioesDiaria();
      } catch (e) {
        setNotice("err", e.message);
      }
    });
    diariaTipoParticipacaoEl?.addEventListener("change", updateDiariaUi);

    btnPublicTabConfirmar?.addEventListener("click", () => setPublicTab("confirmar"));
    btnPublicTabDiaria?.addEventListener("click", () => setPublicTab("diaria"));
    btnPublicTabAssinatura?.addEventListener("click", () => setPublicTab("assinatura"));

    btnValidar?.addEventListener("click", validar);
    qs("btnSalvarNovo")?.addEventListener("click", salvarNovo);
    btnEnviarDiaria?.addEventListener("click", salvarSolicitacaoDiaria);
    btnValidarAssinatura?.addEventListener("click", validarAssinatura);

    setPublicTab(publicTabAtual);
    updateDiariaUi();
    setAnexoStatus("");
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
    const panelSolicitacoesDiarias = qs("panelSolicitacoesDiarias");
    const solicitacoesDiariasInfo = qs("solicitacoesDiariasInfo");
    const filtroSolicitacaoDiariaStatus = qs("filtroSolicitacaoDiariaStatus");
    const btnCarregarSolicitacoesDiarias = qs("btnCarregarSolicitacoesDiarias");
    const listaSolicitacoesDiarias = qs("listaSolicitacoesDiarias");
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
    const publicComiteTabs = qs("publicComiteTabs");
    const publicReunioesAbertas = qs("publicReunioesAbertas");
    const publicHero = qs("publicHero");
    const heroBadge = qs("heroBadge");
    const heroTitulo = qs("heroTitulo");
    const heroSubtitulo = qs("heroSubtitulo");
    const heroBotao = qs("heroBotao");
    const publicUltimasNoticias = qs("publicUltimasNoticias");
    const publicContatoTitulo = qs("publicContatoTitulo");
    const publicContatoTexto = qs("publicContatoTexto");
    const publicContatoEmail = qs("publicContatoEmail");
    const publicContatoTelefone = qs("publicContatoTelefone");
    const publicContatoEndereco = qs("publicContatoEndereco");

    const panelPortalGestao = qs("panelPortalGestao");
    const btnPortalTabConfig = qs("btnPortalTabConfig");
    const btnPortalTabNoticias = qs("btnPortalTabNoticias");
    const btnAbrirPortalConfigFull = qs("btnAbrirPortalConfigFull");
    const portalConfigTabContent = qs("portalConfigTabContent");
    const portalNoticiasTabContent = qs("portalNoticiasTabContent");
    const cfgBannerTitulo = qs("cfgBannerTitulo");
    const cfgBannerSubtitulo = qs("cfgBannerSubtitulo");
    const cfgBannerImagem = qs("cfgBannerImagem");
    const cfgBannerBotaoTexto = qs("cfgBannerBotaoTexto");
    const cfgBannerBotaoUrl = qs("cfgBannerBotaoUrl");
    const cfgBannerChapeu = qs("cfgBannerChapeu");
    const cfgBannerTituloSize = qs("cfgBannerTituloSize");
    const cfgBannerSubtituloSize = qs("cfgBannerSubtituloSize");
    const cfgBannerBotaoSize = qs("cfgBannerBotaoSize");
    const cfgContatoTitulo = qs("cfgContatoTitulo");
    const cfgContatoTexto = qs("cfgContatoTexto");
    const cfgContatoEmail = qs("cfgContatoEmail");
    const cfgContatoTelefone = qs("cfgContatoTelefone");
    const cfgContatoEndereco = qs("cfgContatoEndereco");
    const btnSalvarPortalConfig = qs("btnSalvarPortalConfig");

    const btnNovaNoticia = qs("btnNovaNoticia");
    const formNoticia = qs("formNoticia");
    const notTitulo = qs("notTitulo");
    const notComite = qs("notComite");
    const notResumo = qs("notResumo");
    const notImagem = qs("notImagem");
    const notData = qs("notData");
    const notStatus = qs("notStatus");
    const notDestaqueHome = qs("notDestaqueHome");
    const editorNoticiaEl = qs("editorNoticia");
    const btnSalvarNoticia = qs("btnSalvarNoticia");
    const btnCancelarNoticia = qs("btnCancelarNoticia");
    const listaNoticiasGestao = qs("listaNoticiasGestao");

    let session = null; // { idUsuario, perfil, nome, comite, email }
    let reunioes = [];
    let reuniaoAtual = null;
    let editor = null;
    let noticiaEditor = null;
    let noticiaAtualId = null;
    let portalConfigAtual = null;
    let idToken = null;
    const requestedPortalTab = (getUrlParam("portalTab") || "").toLowerCase();
    const requestedOpenReuniao = (getUrlParam("openReuniao") || "").trim();

    if (cadTelefone) {
      cadTelefone.addEventListener("input", () => {
        cadTelefone.value = formatPhone(cadTelefone.value || "");
      });
    }

    const COMITES = [
      "CBH Lago de Palmas",
      "CBH Rio Palma",
      "CBH Manoel Alves",
      "CBH Lontra e Corda",
      "CBH S. Teresa e S. Antônio",
      "CBH Coco e Caiapó",
      "CBH Formoso do Araguaia",
    ];
    let comitePublicoAtivo = COMITES[0] || "";

    function getPortalDefaults() {
      return {
        homeBannerTitulo: "Comitês de Bacias Hidrográficas do Estado do Tocantins",
        homeBannerSubtitulo: "Acompanhe reuniões, publicações e notícias oficiais dos comitês.",
        homeBannerImagemUrl: "",
        homeBannerBotaoTexto: "Saiba mais",
        homeBannerBotaoUrl: "#",
        homeBannerChapeu: "Portal Oficial",
        homeBannerTituloSizePx: "",
        homeBannerSubtituloSizePx: "",
        homeBannerBotaoSizePx: "",
        faleConoscoTitulo: "Fale Conosco",
        faleConoscoTexto: "Entre em contato com a coordenação dos comitês.",
        faleConoscoEmail: "",
        faleConoscoTelefone: "",
        faleConoscoEndereco: "",
      };
    }

    function asCssPx(value, min, max) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      const clamped = Math.min(max, Math.max(min, n));
      return clamped + "px";
    }

    function isLikelyDirectImageUrl(url) {
      const raw = (url || "").trim();
      if (!raw) return true;
      try {
        const u = new URL(raw);
        if (u.protocol !== "http:" && u.protocol !== "https:") return false;
        const full = raw.toLowerCase();
        const path = (u.pathname || "").toLowerCase();
        if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(full)) return true;
        if (u.hostname.includes("googleusercontent.com")) return true;
        if (u.hostname.includes("raw.githubusercontent.com")) return true;
        if (u.hostname.includes("imgur.com") && !path.startsWith("/a/")) return true;
        if (u.hostname.includes("canva.com")) return false;
        return false;
      } catch (e) {
        return false;
      }
    }

    function setPortalTab(tab) {
      const isConfig = tab === "config";
      const isNoticias = tab === "noticias";

      if (btnPortalTabConfig) btnPortalTabConfig.classList.toggle("active", isConfig);
      if (btnPortalTabNoticias) btnPortalTabNoticias.classList.toggle("active", isNoticias);

      if (portalConfigTabContent) portalConfigTabContent.classList.toggle("hidden", !isConfig);
      if (portalNoticiasTabContent) portalNoticiasTabContent.classList.toggle("hidden", !isNoticias);
    }

    function mergePortalConfig(cfg) {
      return { ...getPortalDefaults(), ...(cfg || {}) };
    }

    function renderUltimasNoticias(items) {
      if (!publicUltimasNoticias) return;
      publicUltimasNoticias.innerHTML = "";
      if (!items || !items.length) {
        const empty = document.createElement("div");
        empty.className = "notice";
        empty.textContent = "Nenhuma notícia publicada no momento.";
        publicUltimasNoticias.appendChild(empty);
        return;
      }
      items.slice(0, 3).forEach((n) => {
        const card = document.createElement("div");
        card.className = "news-mini-card";
        if (n.imagemUrl) {
          const thumbWrap = document.createElement("div");
          thumbWrap.className = "news-mini-thumb-wrap";
          const thumb = document.createElement("img");
          thumb.className = "news-mini-thumb";
          thumb.src = n.imagemUrl;
          thumb.alt = "Capa da notícia";
          thumbWrap.appendChild(thumb);
          card.appendChild(thumbWrap);
        }

        const content = document.createElement("div");
        content.className = "news-mini-content";

        const t = document.createElement("h3");
        t.textContent = n.titulo || "(sem título)";

        const meta = document.createElement("div");
        meta.className = "small";
        meta.textContent = `${fmtDate(n.dataPublicacao)} • ${n.comite || "-"}`;

        const r = document.createElement("p");
        r.textContent = n.resumo || "";

        content.appendChild(t);
        content.appendChild(meta);
        content.appendChild(r);
        card.appendChild(content);
        publicUltimasNoticias.appendChild(card);
      });
    }

    function renderPortalPublico(config, ultimasNoticias) {
      const cfg = mergePortalConfig(config);
      portalConfigAtual = cfg;

      if (heroTitulo) heroTitulo.textContent = cfg.homeBannerTitulo || "";
      if (heroSubtitulo) heroSubtitulo.textContent = cfg.homeBannerSubtitulo || "";
      if (heroBadge) heroBadge.textContent = cfg.homeBannerChapeu || "Portal Oficial";

      if (heroTitulo) heroTitulo.style.fontSize = asCssPx(cfg.homeBannerTituloSizePx, 20, 60);
      if (heroSubtitulo) heroSubtitulo.style.fontSize = asCssPx(cfg.homeBannerSubtituloSizePx, 14, 36);
      if (heroBotao) heroBotao.style.fontSize = asCssPx(cfg.homeBannerBotaoSizePx, 12, 26);

      if (heroBotao) {
        heroBotao.textContent = cfg.homeBannerBotaoTexto || "Saiba mais";
        heroBotao.href = cfg.homeBannerBotaoUrl || "#";
      }
      if (publicHero) {
        if (cfg.homeBannerImagemUrl) {
          publicHero.style.backgroundImage = `linear-gradient(120deg, rgba(3,41,70,0.72), rgba(8,92,123,0.58)), url('${cfg.homeBannerImagemUrl}')`;
        } else {
          publicHero.style.backgroundImage = "linear-gradient(120deg, #0a3f5d, #0f7f87)";
        }
      }

      if (publicContatoTitulo) publicContatoTitulo.textContent = cfg.faleConoscoTitulo || "Fale Conosco";
      if (publicContatoTexto) publicContatoTexto.textContent = cfg.faleConoscoTexto || "";
      if (publicContatoEmail) publicContatoEmail.textContent = cfg.faleConoscoEmail || "-";
      if (publicContatoTelefone) publicContatoTelefone.textContent = cfg.faleConoscoTelefone || "-";
      if (publicContatoEndereco) publicContatoEndereco.textContent = cfg.faleConoscoEndereco || "-";

      renderUltimasNoticias(ultimasNoticias || []);
    }

    function setPortalForm(config) {
      const cfg = mergePortalConfig(config);
      if (cfgBannerTitulo) cfgBannerTitulo.value = cfg.homeBannerTitulo || "";
      if (cfgBannerSubtitulo) cfgBannerSubtitulo.value = cfg.homeBannerSubtitulo || "";
      if (cfgBannerImagem) cfgBannerImagem.value = cfg.homeBannerImagemUrl || "";
      if (cfgBannerBotaoTexto) cfgBannerBotaoTexto.value = cfg.homeBannerBotaoTexto || "";
      if (cfgBannerBotaoUrl) cfgBannerBotaoUrl.value = cfg.homeBannerBotaoUrl || "";
      if (cfgBannerChapeu) cfgBannerChapeu.value = cfg.homeBannerChapeu || "";
      if (cfgBannerTituloSize) cfgBannerTituloSize.value = cfg.homeBannerTituloSizePx || "";
      if (cfgBannerSubtituloSize) cfgBannerSubtituloSize.value = cfg.homeBannerSubtituloSizePx || "";
      if (cfgBannerBotaoSize) cfgBannerBotaoSize.value = cfg.homeBannerBotaoSizePx || "";
      if (cfgContatoTitulo) cfgContatoTitulo.value = cfg.faleConoscoTitulo || "";
      if (cfgContatoTexto) cfgContatoTexto.value = cfg.faleConoscoTexto || "";
      if (cfgContatoEmail) cfgContatoEmail.value = cfg.faleConoscoEmail || "";
      if (cfgContatoTelefone) cfgContatoTelefone.value = cfg.faleConoscoTelefone || "";
      if (cfgContatoEndereco) cfgContatoEndereco.value = cfg.faleConoscoEndereco || "";
    }

    function collectPortalForm() {
      return {
        homeBannerTitulo: (cfgBannerTitulo?.value || "").trim(),
        homeBannerSubtitulo: (cfgBannerSubtitulo?.value || "").trim(),
        homeBannerImagemUrl: (cfgBannerImagem?.value || "").trim(),
        homeBannerBotaoTexto: (cfgBannerBotaoTexto?.value || "").trim(),
        homeBannerBotaoUrl: (cfgBannerBotaoUrl?.value || "").trim(),
        homeBannerChapeu: (cfgBannerChapeu?.value || "").trim(),
        homeBannerTituloSizePx: (cfgBannerTituloSize?.value || "").trim(),
        homeBannerSubtituloSizePx: (cfgBannerSubtituloSize?.value || "").trim(),
        homeBannerBotaoSizePx: (cfgBannerBotaoSize?.value || "").trim(),
        faleConoscoTitulo: (cfgContatoTitulo?.value || "").trim(),
        faleConoscoTexto: (cfgContatoTexto?.value || "").trim(),
        faleConoscoEmail: (cfgContatoEmail?.value || "").trim(),
        faleConoscoTelefone: (cfgContatoTelefone?.value || "").trim(),
        faleConoscoEndereco: (cfgContatoEndereco?.value || "").trim(),
      };
    }

    async function carregarPortalPublico() {
      try {
        const r = await api({ acao: "obterPortalPublico" });
        renderPortalPublico(r.config || {}, r.ultimasNoticias || []);
      } catch (e) {
        renderPortalPublico(getPortalDefaults(), []);
      }
    }

    function fillComitesNoticia() {
      if (!notComite) return;
      notComite.innerHTML = "";
      COMITES.forEach((c) => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        notComite.appendChild(o);
      });
    }

    function resetFormNoticia() {
      noticiaAtualId = null;
      if (notTitulo) notTitulo.value = "";
      if (notResumo) notResumo.value = "";
      if (notImagem) notImagem.value = "";
      if (notData) notData.value = new Date().toISOString().slice(0, 10);
      if (notStatus) notStatus.value = "Rascunho";
      if (notDestaqueHome) notDestaqueHome.value = "NÃO";
      if (session?.perfil === "Presidente" && notComite) notComite.value = session.comite || "";
      if (noticiaEditor) noticiaEditor.setData("<p>Digite a notícia...</p>");
    }

    async function garantirEditorNoticia() {
      if (noticiaEditor || !editorNoticiaEl) return;
      noticiaEditor = await ClassicEditor.create(editorNoticiaEl, {
        toolbar: [
          "heading", "|", "bold", "italic", "underline", "link", "|",
          "bulletedList", "numberedList", "insertTable", "blockQuote", "|",
          "undo", "redo"
        ],
        table: {
          contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"]
        }
      });
    }

    function renderNoticiasGestao(items) {
      if (!listaNoticiasGestao) return;
      listaNoticiasGestao.innerHTML = "";
      if (!items || !items.length) {
        const div = document.createElement("div");
        div.className = "notice";
        div.textContent = "Nenhuma notícia cadastrada.";
        listaNoticiasGestao.appendChild(div);
        return;
      }

      items.forEach((n) => {
        const item = document.createElement("div");
        item.className = "item";

        const left = document.createElement("div");
        const h = document.createElement("h3");
        h.textContent = n.titulo || "(sem título)";
        const p = document.createElement("p");
        p.textContent = `${fmtDate(n.dataPublicacao)} • ${n.comite || "-"} • ${n.status || "Rascunho"} • Home: ${n.destaqueHome || "NÃO"}`;
        left.appendChild(h);
        left.appendChild(p);

        const right = document.createElement("div");
        right.className = "row";

        const btnEditar = document.createElement("button");
        btnEditar.textContent = "Editar";
        btnEditar.addEventListener("click", () => {
          const id = encodeURIComponent((n.idNoticia || "").toString());
          window.location.href = "./noticia-editor.html?id=" + id;
        });

        const btnExcluir = document.createElement("button");
        btnExcluir.className = "danger";
        btnExcluir.textContent = "Excluir";
        btnExcluir.addEventListener("click", async () => {
          if (!confirm("Excluir esta notícia?")) return;
          btnExcluir.disabled = true;
          try {
            await api({ acao: "excluirNoticia", idToken, idNoticia: n.idNoticia });
            await carregarNoticiasGestao();
            await carregarPortalPublico();
          } catch (e) {
            setNotice("err", e.message);
          } finally {
            btnExcluir.disabled = false;
          }
        });

        right.appendChild(btnEditar);
        right.appendChild(btnExcluir);
        item.appendChild(left);
        item.appendChild(right);
        listaNoticiasGestao.appendChild(item);
      });
    }

    async function carregarNoticiasGestao() {
      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente")) return;
      try {
        const r = await api({ acao: "listarNoticiasGestao", idToken });
        renderNoticiasGestao(r.noticias || []);
      } catch (e) {
        if (isInvalidActionError(e, "listarNoticiasGestao")) {
          setNotice("err", "Módulo de notícias indisponível no backend atual. Reimplante o Web App do Apps Script para habilitar o cadastro.");
          renderNoticiasGestao([]);
          return;
        }
        setNotice("err", e.message);
      }
    }

    async function salvarConfigPortal() {
      if (!session || session.perfil !== "Admin") {
        setNotice("err", "Somente Administrador pode salvar Configurações do Portal.");
        return;
      }
      const cfg = collectPortalForm();
      if (!isLikelyDirectImageUrl(cfg.homeBannerImagemUrl || "")) {
        setNotice("err", "URL da imagem do banner precisa ser link direto da imagem (.png/.jpg/.webp). Links de página (ex.: Canva /design/.../view) não funcionam como background.");
        return;
      }
      btnSalvarPortalConfig.disabled = true;
      try {
        await api({ acao: "salvarPortalConfig", idToken, config: cfg });
        setNotice("ok", "Configurações do portal salvas.");
        await carregarPortalPublico();
      } catch (e) {
        if (isInvalidActionError(e, "salvarPortalConfig")) {
          setNotice("err", "Não foi possível salvar: ação salvarPortalConfig indisponível no backend atual. Reimplante o Web App do Apps Script.");
          return;
        }
        setNotice("err", e.message);
      } finally {
        btnSalvarPortalConfig.disabled = false;
      }
    }

    async function salvarNoticiaPortal() {
      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente")) {
        setNotice("err", "Sem permissão.");
        return;
      }
      await garantirEditorNoticia();
      btnSalvarNoticia.disabled = true;
      try {
        await api({
          acao: "salvarNoticia",
          idToken,
          idNoticia: noticiaAtualId || "",
          titulo: (notTitulo?.value || "").trim(),
          resumo: (notResumo?.value || "").trim(),
          conteudoHtml: noticiaEditor ? noticiaEditor.getData() : "",
          imagemUrl: (notImagem?.value || "").trim(),
          comite: (notComite?.value || "").trim(),
          dataPublicacao: (notData?.value || "").trim(),
          status: (notStatus?.value || "Rascunho").trim(),
          destaqueHome: (notDestaqueHome?.value || "NÃO").trim(),
        });
        setNotice("ok", "Notícia salva com sucesso.");
        formNoticia?.classList.add("hidden");
        resetFormNoticia();
        await carregarNoticiasGestao();
        await carregarPortalPublico();
      } catch (e) {
        if (isInvalidActionError(e, "salvarNoticia")) {
          setNotice("err", "Não foi possível salvar: ação salvarNoticia indisponível no backend atual. Reimplante o Web App do Apps Script.");
          return;
        }
        setNotice("err", e.message);
      } finally {
        btnSalvarNoticia.disabled = false;
      }
    }

    async function carregarPortalGestao() {
      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente")) {
        panelPortalGestao?.classList.add("hidden");
        return;
      }
      panelPortalGestao?.classList.remove("hidden");
      await garantirEditorNoticia();
      fillComitesNoticia();
      if (notComite) {
        if (session.perfil === "Presidente") {
          notComite.value = session.comite || "";
          notComite.disabled = true;
        } else {
          notComite.disabled = false;
        }
      }

      if (session.perfil === "Admin") {
        if (btnPortalTabConfig) btnPortalTabConfig.classList.remove("hidden");
        if (portalConfigTabContent) portalConfigTabContent.classList.remove("hidden");
        setPortalTab(requestedPortalTab === "noticias" ? "noticias" : "config");
        try {
          const r = await api({ acao: "obterPortalPublico" });
          setPortalForm(r.config || {});
        } catch (e) {
          setPortalForm(getPortalDefaults());
          if (!isInvalidActionError(e, "obterPortalPublico")) {
            setNotice("err", e.message);
          }
        }
      } else {
        if (btnPortalTabConfig) btnPortalTabConfig.classList.add("hidden");
        if (portalConfigTabContent) portalConfigTabContent.classList.add("hidden");
        setPortalTab("noticias");
      }

      await carregarNoticiasGestao();
    }

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

    function renderComiteTabs() {
      if (!publicComiteTabs) return;
      publicComiteTabs.innerHTML = "";
      COMITES.forEach((comite) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "committee-tab" + (comite === comitePublicoAtivo ? " active" : "");
        btn.textContent = comite;
        btn.addEventListener("click", async () => {
          if (comitePublicoAtivo === comite) return;
          comitePublicoAtivo = comite;
          renderComiteTabs();
          await carregarReunioesAbertasPublicas();
        });
        publicComiteTabs.appendChild(btn);
      });
    }

    function renderReunioesAbertasPublicas(items) {
      if (!publicReunioesAbertas) return;
      publicReunioesAbertas.innerHTML = "";

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "notice";
        empty.textContent = "Nenhuma reunião aberta ou agendada para este comitê.";
        publicReunioesAbertas.appendChild(empty);
        return;
      }

      items
        .slice()
        .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
        .forEach((r) => {
          const item = document.createElement("div");
          item.className = "meeting-open-item";

          const title = document.createElement("h3");
          title.textContent = r.titulo || "(sem título)";

          const meta = document.createElement("div");
          meta.className = "meeting-open-meta";
          meta.textContent = `${fmtDate(r.data)} • ${r.comite || "-"} • ${r.status || "-"}`;

          const tipo = (r.tipo || "Presencial").toString().trim();
          const localLabel = tipo.toLowerCase() === "online" ? "Link da reunião" : "Endereço da reunião";
          const location = document.createElement("p");
          location.textContent = `${tipo} • ${localLabel}: ${r.local || "não informado"}`;

          const actions = document.createElement("div");
          actions.className = "row";

          const btnValidar = document.createElement("button");
          btnValidar.className = "primary";
          btnValidar.textContent = "Confirmar participação";
          btnValidar.addEventListener("click", () => {
            window.location.href = `./validar-presenca.html?id=${encodeURIComponent(r.idReuniao || "")}`;
          });
          actions.appendChild(btnValidar);

          if (session) {
            const btnPainel = document.createElement("button");
            btnPainel.textContent = "Abrir reunião";
            btnPainel.addEventListener("click", () => {
              const url = `./ata-editor.html?id=${encodeURIComponent(r.idReuniao || "")}`;
              window.open(url, "_blank", "noopener");
            });
            actions.appendChild(btnPainel);
          }

          item.appendChild(title);
          item.appendChild(meta);
          item.appendChild(location);
          item.appendChild(actions);
          publicReunioesAbertas.appendChild(item);
        });
    }

    async function carregarReunioesAbertasPublicas() {
      if (!comitePublicoAtivo) return;
      try {
        const r = await api({ acao: "listarReunioesPublicas", comite: comitePublicoAtivo });
        renderReunioesAbertasPublicas(r.reunioes || []);
      } catch (e) {
        renderReunioesAbertasPublicas([]);
        setNotice("err", e.message);
      }
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
          p.textContent = `${fmtDate(r.data)} • ${r.tipo || ""} • ${r.local || ""} • ${r.comite || "-"}`;
          left.appendChild(h);
          left.appendChild(p);

          const right = document.createElement("div");
          right.className = "row";
          const btnOpen = document.createElement("button");
          btnOpen.className = "primary";
          btnOpen.textContent = "Gerenciar";
          btnOpen.addEventListener("click", async () => {
            await selecionarReuniao(r);
            panelReuniao?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          right.appendChild(btnOpen);

          const btnAtaDireto = document.createElement("button");
          btnAtaDireto.textContent = "Editor ATA";
          btnAtaDireto.addEventListener("click", () => {
            const url = `./ata-editor.html?id=${encodeURIComponent(r.idReuniao || "")}`;
            window.open(url, "_blank", "noopener");
          });
          right.appendChild(btnAtaDireto);

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
      }
    }

    function ativarAbaListas(aba) {
      if (aba === "confirmar") {
        btnPendentes?.classList.add("primary");
        btnConfirmar?.classList.remove("primary");
        panelValidarParticipacao?.classList.add("hidden");
      } else {
        btnConfirmar?.classList.add("primary");
        btnPendentes?.classList.remove("primary");
      }
    }

    async function selecionarReuniao(r) {
      reuniaoAtual = r;
      qs("reuniaoSelecionada").textContent = `${r.titulo || ""} • ${fmtDate(r.data)} • ${(r.comite || "-")} • ${(r.tipo || "-")} • ${(r.local || "-")}`;
      panelReuniao.classList.remove("hidden");
      linkPublico.textContent = r.linkConfirmacao || "";
      if (reuniaoStatus) reuniaoStatus.textContent = `Status: ${r.status || "-"}`;
      clearTables();
      ativarAbaListas("confirmar");
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
      ativarAbaListas("confirmar");
      await atualizarListas();
      panelValidarParticipacao?.classList.add("hidden");
      qs("tblConfirmados")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function confirmarParticipacao() {
      if (!reuniaoAtual) return;
      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente" && session.perfil !== "Secretario")) {
        setNotice("err", "Sem permissão.");
        return;
      }
      ativarAbaListas("validar");
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
            await api({
              acao: "validarParticipacao",
              idToken,
              idReuniao: reuniaoAtual.idReuniao,
              idConfirmacao: x.idConfirmacao,
              cpf: x.cpf,
            });
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
        panelSolicitacoesDiarias?.classList.add("hidden");
        panelPortalGestao?.classList.add("hidden");
        panelAguardando.classList.remove("hidden");
        setNotice("err", r.mensagem || "Acesso não autorizado.");
        session = null;
        try {
          localStorage.removeItem("procomites.sid");
          localStorage.removeItem("procomites.perfil");
        } catch (e) {}
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
      try {
        if (window.__SID__) localStorage.setItem("procomites.sid", window.__SID__);
        else localStorage.removeItem("procomites.sid");
        if (session?.perfil) localStorage.setItem("procomites.perfil", session.perfil);
        else localStorage.removeItem("procomites.perfil");
      } catch (e) {}

      userLine.textContent = `${session.nome || ""} • ${session.email || ""} • ${session.perfil || ""}`;

      panelAguardando.classList.add("hidden");

      // Primeiro acesso: se não tiver comitê, obriga cadastro complementar
      if (!session.comite) {
        fillComites();
        panelPresidente.classList.add("hidden");
        panelCadastro?.classList.remove("hidden");
        panelAprovacoes?.classList.add("hidden");
        panelSolicitacoesDiarias?.classList.add("hidden");
        panelPortalGestao?.classList.add("hidden");
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
      if (requestedOpenReuniao) {
        const alvo = (reunioes || []).find((x) => x.idReuniao === requestedOpenReuniao);
        if (alvo) await selecionarReuniao(alvo);
      }

      // Admin/Presidente pode aprovar pendentes
      if (session.perfil === "Admin" || session.perfil === "Presidente") {
        panelAprovacoes?.classList.remove("hidden");
        panelSolicitacoesDiarias?.classList.remove("hidden");
        await carregarPendentes();
        await carregarSolicitacoesDiarias();
        await carregarPortalGestao();
      } else {
        panelAprovacoes?.classList.add("hidden");
        panelSolicitacoesDiarias?.classList.add("hidden");
        panelPortalGestao?.classList.add("hidden");
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
          telefone: normalizePhone(telefone),
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

    function labelTipoParticipacaoDiaria(tipo) {
      const t = String(tipo || "").trim();
      if (t === "ReuniaoOrdinaria") return "Reunião ordinária";
      if (t === "Evento") return "Evento";
      if (t === "Outro") return "Outro motivo";
      return t || "-";
    }

    async function decidirSolicitacaoDiaria(item, decisao) {
      if (!item || !item.idSolicitacao) return;
      let justificativa = "";
      if (decisao === "negar") {
        const j = window.prompt("Informe a justificativa da negativa:", "");
        if (j == null) return;
        justificativa = String(j || "").trim();
        if (!justificativa) {
          setNotice("err", "A justificativa é obrigatória para negar a solicitação.");
          return;
        }
      }

      try {
        await api({
          acao: "decidirSolicitacaoDiaria",
          idToken,
          idSolicitacao: item.idSolicitacao,
          decisao,
          justificativa,
        });
        setNotice("ok", `Solicitação ${decisao === "aprovar" ? "aprovada" : "negada"} com sucesso.`);
        await carregarSolicitacoesDiarias();
      } catch (e) {
        setNotice("err", e.message);
      }
    }

    function renderSolicitacoesDiarias(items) {
      if (!listaSolicitacoesDiarias) return;
      listaSolicitacoesDiarias.innerHTML = "";
      if (!items || !items.length) {
        const div = document.createElement("div");
        div.className = "notice";
        div.textContent = "Nenhuma solicitação de diária encontrada.";
        listaSolicitacoesDiarias.appendChild(div);
        return;
      }

      items.forEach((x) => {
        const item = document.createElement("div");
        item.className = "item";

        const left = document.createElement("div");
        const h = document.createElement("h3");
        const nome = (x.nome || "-").toString();
        const cpf = (x.cpf || "").toString();
        h.textContent = cpf ? `${nome} • ${cpf}` : nome;

        const p1 = document.createElement("p");
        p1.textContent = `${x.comite || "-"} • ${labelTipoParticipacaoDiaria(x.tipoParticipacao)} • Status: ${x.status || "Solicitada"}`;

        const p2 = document.createElement("p");
        p2.textContent = `${x.origem || "-"} → ${x.destino || "-"} • Saída: ${fmtDate(x.dataHoraSaida)} • Retorno: ${fmtDate(x.dataHoraChegada)}`;

        const p3 = document.createElement("p");
        p3.textContent = `Ação: ${x.descricaoAcao || "-"}`;

        left.appendChild(h);
        left.appendChild(p1);
        left.appendChild(p2);
        left.appendChild(p3);

        if (x.justificativaDecisao) {
          const pJust = document.createElement("p");
          pJust.textContent = `Justificativa: ${x.justificativaDecisao}`;
          left.appendChild(pJust);
        }

        if (x.decididoPor || x.decididoEm) {
          const pDec = document.createElement("p");
          pDec.className = "small";
          pDec.textContent = `Decisão por ${x.decididoPor || "-"} (${x.decididoPerfil || "-"}) em ${fmtDate(x.decididoEm) || "-"}`;
          left.appendChild(pDec);
        }

        const right = document.createElement("div");
        right.className = "row";

        if (x.anexoUrl) {
          const link = document.createElement("a");
          link.href = x.anexoUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = x.anexoNome ? "Ver anexo" : "Abrir anexo";
          right.appendChild(link);
        }

        const status = (x.status || "Solicitada").toString().trim();
        if (status === "Solicitada") {
          const btnAprovar = document.createElement("button");
          btnAprovar.className = "primary";
          btnAprovar.textContent = "Aprovar";
          btnAprovar.addEventListener("click", async () => {
            btnAprovar.disabled = true;
            try {
              await decidirSolicitacaoDiaria(x, "aprovar");
            } finally {
              btnAprovar.disabled = false;
            }
          });

          const btnNegar = document.createElement("button");
          btnNegar.className = "danger";
          btnNegar.textContent = "Negar";
          btnNegar.addEventListener("click", async () => {
            btnNegar.disabled = true;
            try {
              await decidirSolicitacaoDiaria(x, "negar");
            } finally {
              btnNegar.disabled = false;
            }
          });

          right.appendChild(btnAprovar);
          right.appendChild(btnNegar);
        }

        item.appendChild(left);
        item.appendChild(right);
        listaSolicitacoesDiarias.appendChild(item);
      });
    }

    async function carregarSolicitacoesDiarias() {
      if (!session || (session.perfil !== "Admin" && session.perfil !== "Presidente")) return;
      try {
        const status = (filtroSolicitacaoDiariaStatus?.value || "").trim();
        const r = await api({ acao: "listarSolicitacoesDiariasGestao", idToken, status });
        if (solicitacoesDiariasInfo) {
          if (r.perfilRequester === "Admin") solicitacoesDiariasInfo.textContent = "Você vê solicitações de todos os comitês.";
          else solicitacoesDiariasInfo.textContent = "Você vê solicitações do comitê: " + (r.comiteRequester || "-");
        }
        renderSolicitacoesDiarias(r.itens || []);
      } catch (e) {
        setNotice("err", e.message);
      }
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
      await carregarReunioesAbertasPublicas();
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
        if (r.sucesso && r.url) {
          window.open(r.url, "_blank");
          if (typeof r.totalComDiaria === "number") {
            setNotice("ok", `Relatório gerado com ${r.totalComDiaria} participante(s) com diária.`);
          }
        }
        else setNotice("err", r.mensagem || "Não foi possível gerar.");
      } catch (e) {
        setNotice("err", e.message);
      } finally {
        btnRelatorio.disabled = false;
      }
    }

    function abrirAtaEmNovaAba() {
      const base = "./ata-editor.html";
      const url = reuniaoAtual ? `${base}?id=${encodeURIComponent(reuniaoAtual.idReuniao || "")}` : base;
      window.open(url, "_blank", "noopener");
    }

    async function abrirAta() {
      abrirAtaEmNovaAba();
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

    btnReload?.addEventListener("click", async () => {
      await carregarReunioes();
      if (session && (session.perfil === "Admin" || session.perfil === "Presidente")) {
        await carregarSolicitacoesDiarias();
      }
    });

    btnSalvarCadastro?.addEventListener("click", salvarCadastro);
    btnCarregarPendentes?.addEventListener("click", carregarPendentes);
    btnCarregarSolicitacoesDiarias?.addEventListener("click", carregarSolicitacoesDiarias);
    filtroSolicitacaoDiariaStatus?.addEventListener("change", carregarSolicitacoesDiarias);

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

    btnAta?.addEventListener("click", abrirAtaEmNovaAba);
    btnCancelarAta?.addEventListener("click", () => panelAta.classList.add("hidden"));
    btnSalvarAta?.addEventListener("click", salvarAta);
    btnInserirLista?.addEventListener("click", inserirListaPresenca);
    btnGerarPdfAta?.addEventListener("click", gerarPdfAta);
    btnUploadAta?.addEventListener("click", uploadAtaAssinada);
    btnSalvarPortalConfig?.addEventListener("click", salvarConfigPortal);
    btnPortalTabConfig?.addEventListener("click", () => setPortalTab("config"));
    btnPortalTabNoticias?.addEventListener("click", () => setPortalTab("noticias"));
    btnAbrirPortalConfigFull?.addEventListener("click", () => {
      window.open("./portal-config-editor.html", "_blank", "noopener");
    });
    btnNovaNoticia?.addEventListener("click", async () => {
      window.open("./noticia-editor.html", "_blank", "noopener");
    });
    btnSalvarNoticia?.addEventListener("click", salvarNoticiaPortal);
    btnCancelarNoticia?.addEventListener("click", () => {
      formNoticia?.classList.add("hidden");
      resetFormNoticia();
    });

    renderComiteTabs();
    carregarReunioesAbertasPublicas();
    carregarPortalPublico();

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setAuthUI(false);
        userLine.textContent = "-";
        panelAguardando.classList.add("hidden");
        panelPresidente.classList.add("hidden");
        panelCadastro?.classList.add("hidden");
        panelAprovacoes?.classList.add("hidden");
        panelPortalGestao?.classList.add("hidden");
        panelReuniao.classList.add("hidden");
        reunioes = [];
        reuniaoAtual = null;
        session = null;
        idToken = null;
        noticiaAtualId = null;
        try {
          localStorage.removeItem("procomites.sid");
          localStorage.removeItem("procomites.perfil");
        } catch (e) {}
        setNotice(null, "");
        carregarPortalPublico();
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
