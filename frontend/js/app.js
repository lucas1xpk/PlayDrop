const API_BASE = "";
const dealsTrack = document.querySelector("#dealsTrack");
const dealTemplate = document.querySelector("#dealTemplate");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const searchGrid = document.querySelector("#searchGrid");
const searchStatus = document.querySelector("#searchStatus");
const soundToggle = document.querySelector("#soundToggle");

const detailsCache = new Map();

function usd(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function setLoading(container, text) {
  container.innerHTML = `<div class="loading-card">${text}</div>`;
}

function createOfferRow(offer) {
  const row = document.createElement("a");
  row.className = "offer-row";
  row.href = offer.redirect_url || "#";
  row.target = "_blank";
  row.rel = "noopener noreferrer";

  const firstLetter = (offer.store || "?").trim().charAt(0).toUpperCase();

  row.innerHTML = `
    <span class="store-mark">${firstLetter}</span>
    <span class="offer-copy">
      <b class="store-name">${offer.store || "Loja"}</b>
      <small class="activation">Ativação: ${offer.activation || "Não informado"}</small>
    </span>
    <span class="offer-price">${usd(offer.price_usd)}</span>
  `;

  return row;
}

function fillOffers(node, offers, game) {
  const list = node.querySelector(".offers-list");
  list.innerHTML = "";

  const safeOffers = Array.isArray(offers) && offers.length
    ? offers
    : [{
        store: game.store,
        activation: game.activation,
        price_usd: game.sale_price_usd,
        redirect_url: game.redirect_url,
      }];

  safeOffers
    .slice()
    .sort((a, b) => Number(a.price_usd || 0) - Number(b.price_usd || 0))
    .forEach((offer) => list.appendChild(createOfferRow(offer)));
}

function createCard(game) {
  const node = dealTemplate.content.firstElementChild.cloneNode(true);
  const cover = node.querySelector(".game-cover");

  cover.src = game.image;
  cover.alt = `Capa de ${game.title}`;
  cover.addEventListener("error", () => {
    cover.removeAttribute("src");
    cover.alt = "Imagem indisponível";
    cover.classList.add("image-error");
  });

  node.querySelector(".discount-badge").textContent = `-${game.discount}%`;
  node.querySelector(".game-title").textContent = game.title;
  node.querySelector(".old-price").textContent = usd(game.normal_price_usd);
  node.querySelector(".current-price").textContent = usd(game.sale_price_usd);
  node.querySelector(".activation-line b").textContent = game.activation;

  const cardBuyLink = node.querySelector(".card-buy-link");
  cardBuyLink.href = game.redirect_url;

  fillOffers(node, [], game);

  const loadDetails = async () => {
    if (node.dataset.loaded === "true") return;
    node.dataset.loaded = "true";

    const priceElement = node.querySelector(".historical-price");

    try {
      let details = detailsCache.get(game.id);

      if (!details) {
        const response = await fetch(`${API_BASE}/api/game/${encodeURIComponent(game.id)}`);
        if (!response.ok) throw new Error("Falha ao carregar histórico");
        details = await response.json();
        detailsCache.set(game.id, details);
      }

      priceElement.textContent = details.historical_low_usd > 0
        ? usd(details.historical_low_usd)
        : "SEM DADO";

      fillOffers(node, details.offers, game);
    } catch (error) {
      priceElement.textContent = "INDISPONÍVEL";
    }
  };

  node.addEventListener("mouseenter", loadDetails, { once: true });
  node.addEventListener("focusin", loadDetails, { once: true });
  node.addEventListener("touchstart", loadDetails, { once: true, passive: true });

  return node;
}

function renderGames(container, games) {
  container.innerHTML = "";

  if (!games.length) {
    container.innerHTML = '<div class="loading-card">NENHUM DROP ENCONTRADO</div>';
    return;
  }

  games.forEach((game, index) => {
    const card = createCard(game);
    card.style.animationDelay = `${Math.min(index * 35, 280)}ms`;
    container.appendChild(card);
  });
}

async function loadDeals() {
  setLoading(dealsTrack, "CARREGANDO DROPS...");

  try {
    const response = await fetch(`${API_BASE}/api/deals?limit=18`);
    if (!response.ok) throw new Error("API indisponível");
    const games = await response.json();
    renderGames(dealsTrack, games);
  } catch (error) {
    dealsTrack.innerHTML = '<div class="loading-card">ERRO AO CARREGAR. CONFIRA O BACKEND.</div>';
  }
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();

  if (query.length < 2) {
    searchStatus.textContent = "Digite pelo menos 2 caracteres.";
    return;
  }

  searchStatus.textContent = `Buscando “${query}”...`;
  setLoading(searchGrid, "PROCURANDO DROPS...");

  try {
    const response = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Falha na pesquisa");
    const games = await response.json();

    renderGames(searchGrid, games);
    searchStatus.textContent = games.length
      ? `${games.length} promoção(ões) encontrada(s).`
      : "Nenhuma promoção encontrada para esse jogo.";
  } catch (error) {
    searchGrid.innerHTML = "";
    searchStatus.textContent = "Não foi possível pesquisar agora.";
  }
});

dealsTrack.addEventListener("wheel", (event) => {
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    dealsTrack.scrollLeft += event.deltaY;
  }
}, { passive: false });

soundToggle.addEventListener("click", () => {
  const disabled = document.body.classList.toggle("fx-off");
  soundToggle.textContent = disabled ? "FX OFF" : "FX ON";
});

loadDeals();
