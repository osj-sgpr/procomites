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
      homeBannerChapeu: "Portal Oficial",
      homeBannerTituloSizePx: "",
      homeBannerSubtituloSizePx: "",
      homeBannerBotaoSizePx: "",
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

  function asCssPx(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "";
    var clamped = Math.min(max, Math.max(min, n));
    return clamped + "px";
  }

  function getNewsId(n) {
    if (!n || typeof n !== "object") return "";
    return String(n.idNoticia || n.id || n.noticiaId || "").trim();
  }

  function parseSelectedNoticiaFromLocation() {
    var params = new URLSearchParams(window.location.search || "");
    var byQuery = (params.get("noticia") || "").trim();
    if (byQuery) return byQuery;

    var hash = String(window.location.hash || "").trim();
    var m = hash.match(/^#\/?noticia\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function buildNoticiaUrl(n) {
    var id = getNewsId(n);
    if (!id) return "./noticias.html";
    return "./noticias.html#/noticia/" + encodeURIComponent(id);
  }

  function buildNoticiaAbsoluteUrl(n) {
    return new URL(buildNoticiaUrl(n), window.location.href).toString();
  }

  function buildNoticiaShareUrl(n) {
    return buildNoticiaAbsoluteUrl(n);
  }

  function formatShortLinkDisplay(url) {
    var s = String(url || "").trim();
    if (!s) return "";
    return s.replace(/^https?:\/\//i, "");
  }

  function stripHtml(html) {
    if (!html) return "";
    var div = document.createElement("div");
    div.innerHTML = String(html);
    return (div.textContent || div.innerText || "").trim();
  }

  function resumoCompartilhavel(n) {
    var src = (n && (n.resumo || stripHtml(n.conteudoHtml) || "")) || "";
    var txt = String(src).replace(/\s+/g, " ").trim();
    return txt.length > 220 ? txt.slice(0, 217) + "..." : txt;
  }

  function buildShareText(n) {
    var parts = [];
    if (n && n.titulo) parts.push(n.titulo);
    var resumo = resumoCompartilhavel(n);
    if (resumo) parts.push(resumo);
    return parts.join("\n\n");
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

  function initAdminEditShortcut() {
    var btn = qs("heroEditBtn");
    if (!btn) return;
    var perfil = "";
    try {
      perfil = localStorage.getItem("procomites.perfil") || "";
    } catch (e) {}
    if (perfil !== "Admin") return;
    btn.classList.remove("hidden");
    btn.addEventListener("click", function () {
      window.location.href = "./painel.html?portalTab=config";
    });
  }

  function renderHero(cfg) {
    var hero = qs("publicHero");
    var badge = qs("heroBadge");
    var titulo = qs("heroTitulo");
    var sub = qs("heroSubtitulo");
    var botao = qs("heroBotao");
    if (badge) badge.textContent = cfg.homeBannerChapeu || "Portal Oficial";
    if (titulo) titulo.textContent = cfg.homeBannerTitulo || "";
    if (sub) sub.textContent = cfg.homeBannerSubtitulo || "";
    if (titulo) titulo.style.fontSize = asCssPx(cfg.homeBannerTituloSizePx, 20, 60);
    if (sub) sub.style.fontSize = asCssPx(cfg.homeBannerSubtituloSizePx, 14, 36);
    if (botao) {
      botao.style.fontSize = asCssPx(cfg.homeBannerBotaoSizePx, 12, 26);
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
      card.className = "news-mini-card is-clickable";
      var targetUrl = buildNoticiaUrl(n);
      var thumb = n.imagemUrl
        ? ("<div class='news-mini-thumb-wrap'><img class='news-mini-thumb' src='" + n.imagemUrl + "' alt='Capa da notícia' /></div>")
        : "";
      card.innerHTML =
        thumb +
        "<div class='news-mini-content'>" +
          "<h3>" + (n.titulo || "(sem título)") + "</h3>" +
          "<div class='small'>" + fmtDate(n.dataPublicacao) + " • " + (n.comite || "-") + "</div>" +
          "<p>" + (n.resumo || "") + "</p>" +
          "<a class='news-mini-link' href='" + targetUrl + "'>Ler notícia</a>" +
        "</div>";
      card.addEventListener("click", function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest("a")) return;
        window.location.href = targetUrl;
      });
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
    initAdminEditShortcut();
    renderLatest(r.ultimasNoticias || []);
    renderContact(cfg);
  }

  function renderNoticias(list, selectedId) {
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

    var normalizedSelectedId = String(selectedId || "").trim();
    var ordered = (list || []).slice();
    if (normalizedSelectedId) {
      ordered.sort(function (a, b) {
        var aSel = getNewsId(a) === normalizedSelectedId ? 1 : 0;
        var bSel = getNewsId(b) === normalizedSelectedId ? 1 : 0;
        return bSel - aSel;
      });
    }

    ordered.forEach(function (n) {
      var item = document.createElement("article");
      item.className = "card noticia-item";
      var noticiaId = getNewsId(n);
      var noticiaUrl = buildNoticiaUrl(n);
      var noticiaShareUrl = buildNoticiaShareUrl(n);
      if (noticiaId) item.id = "noticia-" + noticiaId;
      if (normalizedSelectedId && noticiaId === normalizedSelectedId) {
        item.classList.add("is-selected");
      }
      var img = n.imagemUrl
        ? ("<div class='noticia-capa-wrap'><img class='noticia-capa' src='" + n.imagemUrl + "' alt='Capa da notícia' /></div>")
        : "";
      var shareText = buildShareText(n);
      var encodedShare = encodeURIComponent(shareText + "\n\n" + noticiaShareUrl);
      var shortLinkText = formatShortLinkDisplay(noticiaShareUrl);
      item.innerHTML =
        img +
        "<div class='small'>" + fmtDate(n.dataPublicacao) + " • " + (n.comite || "-") + "</div>" +
        "<div class='noticia-title-row'>" +
          "<h2 class='noticia-titulo'>" + (n.titulo || "(sem título)") + "</h2>" +
          "<button type='button' class='share-btn share-btn-inline js-copy-short-link'>Copiar link curto</button>" +
        "</div>" +
        "<a class='noticia-short-link' href='" + noticiaShareUrl + "' target='_blank' rel='noopener' title='" + shortLinkText + "'>" + shortLinkText + "</a>" +
        "<p class='noticia-resumo'>" + (n.resumo || "") + "</p>" +
        "<div class='noticia-actions'>" +
          "<button type='button' class='share-btn js-share-native'>Compartilhar</button>" +
          "<a class='share-btn' target='_blank' rel='noopener' href='https://wa.me/?text=" + encodedShare + "'>WhatsApp</a>" +
          "<button type='button' class='share-btn js-share-copy'>Copiar link</button>" +
        "</div>" +
        "<div class='noticia-conteudo'>" + (n.conteudoHtml || "") + "</div>";

      var btnNative = item.querySelector(".js-share-native");
      btnNative && btnNative.addEventListener("click", function () {
        if (navigator.share) {
          navigator.share({ title: n.titulo || "Notícia", text: resumoCompartilhavel(n), url: noticiaShareUrl }).catch(function () {});
          return;
        }
        window.open("https://wa.me/?text=" + encodedShare, "_blank", "noopener");
      });

      var btnCopy = item.querySelector(".js-share-copy");
      btnCopy && btnCopy.addEventListener("click", function () {
        navigator.clipboard.writeText(noticiaShareUrl).then(function () {
          var old = btnCopy.textContent;
          btnCopy.textContent = "Link copiado";
          setTimeout(function () {
            btnCopy.textContent = old;
          }, 1600);
        }).catch(function () {
          window.prompt("Copie o link da notícia:", noticiaShareUrl);
        });
      });

      var btnCopyShort = item.querySelector(".js-copy-short-link");
      btnCopyShort && btnCopyShort.addEventListener("click", function () {
        navigator.clipboard.writeText(noticiaShareUrl).then(function () {
          var old = btnCopyShort.textContent;
          btnCopyShort.textContent = "Link copiado";
          setTimeout(function () {
            btnCopyShort.textContent = old;
          }, 1600);
        }).catch(function () {
          window.prompt("Copie o link da notícia:", noticiaShareUrl);
        });
      });

      box.appendChild(item);
    });

    if (normalizedSelectedId) {
      var target = document.getElementById("noticia-" + normalizedSelectedId);
      if (target) {
        setTimeout(function () {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
    }
  }

  async function initNoticias() {
    var filter = qs("newsComiteFilter");
    var selectedNoticia = parseSelectedNoticiaFromLocation();
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
        renderNoticias(r.noticias || [], selectedNoticia);
      } catch (e) {
        if (isInvalidActionError(e, "listarNoticiasPublicas")) {
          renderNoticias([], selectedNoticia);
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
