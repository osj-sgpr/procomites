(function () {
  function qs(id) { return document.getElementById(id); }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  function api(payload) {
    var base = window.APPS_SCRIPT_URL || "";
    if (!base) return Promise.reject(new Error("APPS_SCRIPT_URL não configurada."));

    return new Promise(function (resolve, reject) {
      var cb = "__cb_pub_" + Math.random().toString(36).slice(2);
      var timer = null;
      var script = null;

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
        reject(new Error("Falha ao chamar API pública."));
      };

      timer = setTimeout(function () {
        clean();
        reject(new Error("Timeout ao chamar API pública."));
      }, 20000);

      document.head.appendChild(script);
    });
  }

  function getComites() {
    return [
      "CBH Lago de Palmas",
      "CBH Rio Palma",
      "CBH Manoel Alves",
      "CBH Lontra e Corda",
      "CBH S. Teresa e S. Antônio",
      "CBH Coco e Caiapó",
    ];
  }

  function mergeConfig(cfg) {
    return {
      homeBannerTitulo: "Comitês de Bacias Hidrográficas do Estado do Tocantins",
      homeBannerSubtitulo: "Acompanhe reuniões, publicações e notícias oficiais dos comitês.",
      homeBannerImagemUrl: "",
      homeBannerBotaoTexto: "Saiba mais",
      homeBannerBotaoUrl: "#",
      faleConoscoTitulo: "Fale Conosco",
      faleConoscoTexto: "",
      faleConoscoEmail: "",
      faleConoscoTelefone: "",
      faleConoscoEndereco: "",
      ...(cfg || {}),
    };
  }

  function isInvalidActionError(err, actionName) {
    var msg = (err && err.message ? err.message : "").toLowerCase();
    var action = (actionName || "").toLowerCase();
    return msg.indexOf("ação inválida: " + action) >= 0 || msg.indexOf("acao invalida: " + action) >= 0;
  }

  async function loadPortalPublicoData() {
    try {
      var r = await api({ acao: "obterPortalPublico" });
      return {
        config: mergeConfig(r.config || {}),
        ultimasNoticias: r.ultimasNoticias || [],
      };
    } catch (e) {
      var msg = (e && e.message ? e.message : "").toLowerCase();
      if (msg.indexOf("ação inválida: obterportalpublico") === -1 && msg.indexOf("acao invalida: obterportalpublico") === -1) {
        throw e;
      }

      try {
        var noticiasResp = await api({ acao: "listarNoticiasPublicas", limit: 3 });
        return {
          config: mergeConfig({}),
          ultimasNoticias: noticiasResp.noticias || [],
        };
      } catch (e2) {
        if (isInvalidActionError(e2, "listarNoticiasPublicas")) {
          return {
            config: mergeConfig({}),
            ultimasNoticias: [],
          };
        }
        throw e2;
      }
    }
  }

  function renderHero(cfg) {
    var hero = qs("publicHero");
    var titulo = qs("heroTitulo");
    var sub = qs("heroSubtitulo");
    var botao = qs("heroBotao");
    if (titulo) titulo.textContent = cfg.homeBannerTitulo || "";
    if (sub) sub.textContent = cfg.homeBannerSubtitulo || "";
    if (botao) {
      botao.textContent = cfg.homeBannerBotaoTexto || "Saiba mais";
      botao.href = cfg.homeBannerBotaoUrl || "#";
    }
    if (hero) {
      if (cfg.homeBannerImagemUrl) {
        hero.style.backgroundImage = "linear-gradient(120deg, rgba(3,41,70,0.72), rgba(8,92,123,0.58)), url('" + cfg.homeBannerImagemUrl + "')";
      } else {
        hero.style.backgroundImage = "linear-gradient(120deg, #0a3f5d, #0f7f87)";
      }
    }
  }

  function renderLatest(list) {
    var box = qs("publicUltimasNoticias");
    if (!box) return;
    box.innerHTML = "";
    if (!list || !list.length) {
      var empty = document.createElement("div");
      empty.className = "notice";
      empty.textContent = "Nenhuma notícia publicada no momento.";
      box.appendChild(empty);
      return;
    }
    list.slice(0, 3).forEach(function (n) {
      var card = document.createElement("article");
      card.className = "news-mini-card";
      card.innerHTML =
        "<h3>" + (n.titulo || "(sem título)") + "</h3>" +
        "<div class='small'>" + fmtDate(n.dataPublicacao) + " • " + (n.comite || "-") + "</div>" +
        "<p>" + (n.resumo || "") + "</p>";
      box.appendChild(card);
    });
  }

  function renderContact(cfg) {
    var t = qs("publicContatoTitulo");
    var p = qs("publicContatoTexto");
    var e = qs("publicContatoEmail");
    var tel = qs("publicContatoTelefone");
    var end = qs("publicContatoEndereco");
    if (t) t.textContent = cfg.faleConoscoTitulo || "Fale Conosco";
    if (p) p.textContent = cfg.faleConoscoTexto || "";
    if (e) e.textContent = cfg.faleConoscoEmail || "-";
    if (tel) tel.textContent = cfg.faleConoscoTelefone || "-";
    if (end) end.textContent = cfg.faleConoscoEndereco || "-";
  }

  async function initHome() {
    var r = await loadPortalPublicoData();
    var cfg = mergeConfig(r.config || {});
    renderHero(cfg);
    renderLatest(r.ultimasNoticias || []);
    renderContact(cfg);
  }

  function renderNoticias(list) {
    var box = qs("noticiasLista");
    if (!box) return;
    box.innerHTML = "";
    if (!list || !list.length) {
      var empty = document.createElement("div");
      empty.className = "notice";
      empty.textContent = "Nenhuma notícia publicada para este filtro.";
      box.appendChild(empty);
      return;
    }

    list.forEach(function (n) {
      var item = document.createElement("article");
      item.className = "card noticia-item";
      var img = n.imagemUrl ? ("<img class='noticia-capa' src='" + n.imagemUrl + "' alt='Capa da notícia' />") : "";
      item.innerHTML =
        img +
        "<div class='small'>" + fmtDate(n.dataPublicacao) + " • " + (n.comite || "-") + "</div>" +
        "<h2 class='noticia-titulo'>" + (n.titulo || "(sem título)") + "</h2>" +
        "<p class='noticia-resumo'>" + (n.resumo || "") + "</p>" +
        "<div class='noticia-conteudo'>" + (n.conteudoHtml || "") + "</div>";
      box.appendChild(item);
    });
  }

  async function initNoticias() {
    var filter = qs("newsComiteFilter");
    if (filter) {
      var o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = "Todos os comitês";
      filter.appendChild(o0);
      getComites().forEach(function (c) {
        var o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        filter.appendChild(o);
      });
    }

    async function load() {
      var comite = (filter && filter.value ? filter.value : "").trim();
      try {
        var r = await api({ acao: "listarNoticiasPublicas", comite: comite });
        renderNoticias(r.noticias || []);
      } catch (e) {
        if (isInvalidActionError(e, "listarNoticiasPublicas")) {
          renderNoticias([]);
          var notice = qs("publicNotice");
          if (notice) {
            notice.classList.remove("hidden");
            notice.classList.add("err");
            notice.textContent = "Módulo de notícias indisponível no backend atual. Reimplante o Apps Script para habilitar.";
          }
          return;
        }
        throw e;
      }
    }

    filter && filter.addEventListener("change", function () {
      load().catch(function (e) {
        var box = qs("noticiasLista");
        if (box) box.innerHTML = "<div class='notice err'>" + e.message + "</div>";
      });
    });

    await load();
  }

  function renderComites(cards) {
    var box = qs("comitesGrid");
    if (!box) return;
    box.innerHTML = "";

    cards.forEach(function (x) {
      var card = document.createElement("article");
      card.className = "card comite-card";
      var inner = "<h3>" + x.comite + "</h3>";
      if (!x.reunioes.length) {
        inner += "<p class='small'>Sem reuniões públicas no momento.</p>";
      } else {
        inner += "<div class='list'>" + x.reunioes.map(function (r) {
          return "<div class='meeting-open-item'>" +
            "<h4>" + (r.titulo || "(sem título)") + "</h4>" +
            "<div class='meeting-open-meta'>" + fmtDate(r.data) + " • " + (r.tipo || "-") + "</div>" +
            "<p>" + (r.local || "Local não informado") + "</p>" +
            "</div>";
        }).join("") + "</div>";
      }
      card.innerHTML = inner;
      box.appendChild(card);
    });
  }

  async function initComites() {
    var comites = getComites();
    var reqs = comites.map(function (c) {
      return api({ acao: "listarReunioesPublicas", comite: c })
        .then(function (r) { return { comite: c, reunioes: r.reunioes || [] }; })
        .catch(function () { return { comite: c, reunioes: [] }; });
    });
    var cards = await Promise.all(reqs);
    renderComites(cards);
  }

  async function initFaleConosco() {
    var r = await loadPortalPublicoData();
    var cfg = mergeConfig(r.config || {});
    renderContact(cfg);
  }

  async function boot() {
    var page = (document.body.dataset.page || "").trim();
    try {
      if (page === "home") return await initHome();
      if (page === "noticias") return await initNoticias();
      if (page === "comites") return await initComites();
      if (page === "fale") return await initFaleConosco();
    } catch (e) {
      var notice = qs("publicNotice");
      if (notice) {
        notice.classList.remove("hidden");
        notice.classList.add("err");
        notice.textContent = e.message;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
