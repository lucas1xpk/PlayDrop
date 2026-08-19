const state = {
  games: [],
  catalogAll: [],
  featured: [],
  start: 0,
  count: 64,
  wishlist: new Map(),
  history: new Map(),
  catalogSearching: false,
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const page = document.body.dataset.page || 'home';

function safe(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number === 0) return 'GRÁTIS';
  return money.format(number);
}

function imageFor(game) {
  if (game.image) return game.image;
  if (game.appid) return `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
  return '/assets/game-placeholder.svg';
}

function persistLocal() {
  localStorage.setItem('playdropWishlist', JSON.stringify([...state.wishlist.values()]));
  localStorage.setItem('playdropHistory', JSON.stringify([...state.history.values()].slice(-30)));
}

function loadLocal() {
  try {
    for (const game of JSON.parse(localStorage.getItem('playdropWishlist') || '[]')) {
      state.wishlist.set(String(game.id), game);
    }
    for (const game of JSON.parse(localStorage.getItem('playdropHistory') || '[]')) {
      state.history.set(String(game.id), game);
    }
  } catch {
    localStorage.removeItem('playdropWishlist');
    localStorage.removeItem('playdropHistory');
  }
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function offerRows(game) {
  const offers = (game.offers || [])
    .filter((offer) => Number.isFinite(Number(offer.price)))
    .slice(0, 4);

  return offers.map((offer) => `
    <div class="offer-row">
      <span>${safe(offer.shop || 'Loja')}</span>
      <strong>${formatMoney(offer.price)}</strong>
      <small>Ativação: ${safe(offer.activation || 'Loja')}</small>
    </div>
  `).join('');
}

function card(game, options = {}) {
  const { featured = false, rank = null } = options;
  const id = String(game.id);
  const active = state.wishlist.has(id);
  const discount = Math.max(0, Number(game.discount || 0));
  const price = Number(game.price || 0);
  const regular = Number(game.regular || price);
  const historical = Number(game.historical_low);
  const hasHistorical = Number.isFinite(historical) && historical > 0;
  const bestOffer = (game.offers || []).find((offer) => Number.isFinite(Number(offer.price))) || {};
  const bestUrl = bestOffer.url || game.url || '#';
  const activation = game.activation || bestOffer.activation || 'Loja';
  const shop = game.shop || bestOffer.shop || 'Loja';

  return `
    <article class="game-card ${featured ? 'featured-card' : ''}" data-id="${safe(id)}">
      <div class="game-cover">
        <img loading="lazy" decoding="async" src="${safe(imageFor(game))}" alt="${safe(game.title)}">
        ${rank ? `<span class="rank-badge">${rank}</span>` : ''}
        <span class="discount">-${Math.round(discount)}%</span>
        <button class="heart ${active ? 'active' : ''}" type="button" aria-label="${active ? 'Remover da lista de desejos' : 'Adicionar à lista de desejos'}">${active ? '♥' : '♡'}</button>
      </div>

      <div class="card-body">
        <h3 title="${safe(game.title)}">${safe(game.title)}</h3>
        <div class="price-row">
          <strong>${formatMoney(price)}</strong>
          ${regular > price ? `<del>${formatMoney(regular)}</del>` : ''}
        </div>
        <div class="card-store">
          <span class="store-name"><i class="store-dot" aria-hidden="true"></i>${safe(shop)}</span>
          <span class="activation">Ativação: ${safe(activation)}</span>
        </div>
      </div>

      <div class="card-overlay">
        <div class="overlay-title">MENOR PREÇO HISTÓRICO</div>
        ${hasHistorical
          ? `<div class="history-value">${formatMoney(historical)}</div>`
          : `<div class="history-value muted">INDISPONÍVEL</div>`}
        ${offerRows(game)}
        <a class="offer-link" href="${safe(bestUrl)}" target="_blank" rel="noopener noreferrer">VER OFERTA</a>
      </div>
    </article>
  `;
}

function loadingCards(element, amount, featured = false) {
  if (!element) return;
  element.innerHTML = Array.from(
    { length: amount },
    () => `<div class="skeleton ${featured ? 'featured-card' : ''}"></div>`
  ).join('');
}

function emptyState(title, detail = '') {
  return `<div class="empty"><div><strong>${safe(title)}</strong>${detail ? `<span>${safe(detail)}</span>` : ''}</div></div>`;
}

function allKnownGames() {
  return [
    ...state.games,
    ...state.catalogAll,
    ...state.featured,
    ...state.wishlist.values(),
    ...state.history.values(),
  ];
}

function findGame(id) {
  return allKnownGames().find((game) => String(game.id) === String(id));
}

function bindCards(scope = document) {
  if (!scope) return;

  scope.querySelectorAll('.game-card').forEach((element) => {
    const id = element.dataset.id;
    const game = findGame(id);
    if (!game) return;

    const image = element.querySelector('.game-cover img');
    image?.addEventListener('error', () => {
      image.src = '/assets/game-placeholder.svg';
    }, { once: true });

    element.querySelector('.heart')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (state.wishlist.has(id)) {
        state.wishlist.delete(id);
        showToast('Removido da lista de desejos');
      } else {
        state.wishlist.set(id, game);
        showToast('Adicionado à lista de desejos');
      }

      persistLocal();
      renderFeatured();
      applyFilters();
      renderShelves();
    });

    element.querySelector('.offer-link')?.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });

    element.querySelector('.offer-link')?.addEventListener('click', (event) => {
      event.stopPropagation();
      state.history.delete(id);
      state.history.set(id, game);
      persistLocal();
      renderShelves();
    });

    if (window.matchMedia('(hover: none)').matches) {
      element.addEventListener('click', (event) => {
        if (event.target.closest('a, button, input, select, label')) return;
        scope.querySelectorAll('.game-card.touch-open').forEach((cardElement) => {
          if (cardElement !== element) cardElement.classList.remove('touch-open');
        });
        element.classList.toggle('touch-open');
      });
    }
  });
}

function normalizeFeatured() {
  const items = [];
  const seen = new Set();

  for (const game of [...state.featured, ...state.games]) {
    const id = String(game.id);
    if (seen.has(id) || Number(game.discount || 0) <= 0) continue;
    seen.add(id);
    items.push(game);
    if (items.length >= 12) break;
  }

  return items;
}

function renderFeatured() {
  const carousel = $('#featuredCarousel');
  if (!carousel) return;

  const items = normalizeFeatured();
  carousel.innerHTML = items.length
    ? items.map((game, index) => card(game, { featured: true, rank: index + 1 })).join('')
    : emptyState('OFERTAS SENDO ATUALIZADAS', 'Tente novamente em instantes.');
  bindCards(carousel);
}

function applyFilters() {
  const grid = $('#gamesGrid');
  if (!grid) return;

  let items = [...state.games];
  const filter = $('#discountFilter');
  const sortSelect = $('#sortSelect');
  const minDiscount = Number(filter?.value || 0);

  items = items.filter((game) => Number(game.discount || 0) >= minDiscount);

  const sort = sortSelect?.value || 'relevance';
  if (sort === 'discount') items.sort((a, b) => Number(b.discount || 0) - Number(a.discount || 0));
  if (sort === 'price') items.sort((a, b) => Number(a.price || Infinity) - Number(b.price || Infinity));

  grid.innerHTML = items.length
    ? items.map((game) => card(game)).join('')
    : emptyState('NENHUMA OFERTA ENCONTRADA', 'Tente outro filtro.');
  bindCards(grid);
}

function renderShelves() {
  const wishlistGrid = $('#wishlistGrid');
  const historyGrid = $('#historyGrid');
  if (!wishlistGrid && !historyGrid) return;

  const wishlist = [...state.wishlist.values()];
  const history = [...state.history.values()].reverse();

  if (wishlistGrid) {
    wishlistGrid.innerHTML = wishlist.length
      ? wishlist.map((game) => card(game)).join('')
      : emptyState('SUA LISTA ESTÁ VAZIA', 'Use o coração dos cards para salvar jogos.');
    bindCards(wishlistGrid);
  }

  if (historyGrid) {
    historyGrid.innerHTML = history.length
      ? history.map((game) => card(game)).join('')
      : emptyState('SEU HISTÓRICO ESTÁ VAZIO', 'As ofertas abertas por você aparecem aqui.');
    bindCards(historyGrid);
  }
}

async function jsonFetch(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Falha ao atualizar');
  return payload;
}

async function loadHome() {
  loadingCards($('#featuredCarousel'), 5, true);

  const featuredPromise = jsonFetch('/api/featured').catch(() => ({ games: [] }));
  const dealsPromise = jsonFetch('/api/deals?start=0&count=40').catch(() => ({ games: [] }));

  const [featured, deals] = await Promise.all([featuredPromise, dealsPromise]);
  state.games = (deals.games || []).filter((game) => Number(game.discount || 0) > 0);
  state.featured = (featured.games || []).filter((game) => Number(game.discount || 0) > 0);
  renderFeatured();
}

async function loadCatalog() {
  const grid = $('#gamesGrid');
  loadingCards(grid, 24);

  try {
    const deals = await jsonFetch(`/api/deals?start=0&count=${state.count}`);
    const games = (deals.games || []).filter((game) => Number(game.discount || 0) > 0);
    state.games = games;
    state.catalogAll = [...games];
    applyFilters();
  } catch {
    if (grid) grid.innerHTML = emptyState('CATÁLOGO INDISPONÍVEL AGORA', 'Tente novamente em instantes.');
  }
}

async function loadMore() {
  const button = $('#loadMore');
  if (!button || state.catalogSearching) return;

  const oldText = button.innerHTML;
  button.disabled = true;
  button.textContent = 'CARREGANDO...';
  state.start += state.count;

  try {
    const payload = await jsonFetch(`/api/deals?start=${state.start}&count=${state.count}`);
    const ids = new Set(state.catalogAll.map((game) => String(game.id)));
    const newGames = (payload.games || []).filter(
      (game) => Number(game.discount || 0) > 0 && !ids.has(String(game.id))
    );

    state.catalogAll.push(...newGames);
    state.games = [...state.catalogAll];
    applyFilters();

    if (!newGames.length) showToast('Você chegou ao fim das ofertas disponíveis');
  } catch {
    state.start = Math.max(0, state.start - state.count);
    showToast('Não foi possível carregar mais ofertas');
  } finally {
    button.disabled = false;
    button.innerHTML = oldText;
  }
}

async function searchHome(term) {
  const section = $('#searchResultsSection');
  const grid = $('#searchResults');
  if (!section || !grid) return;

  section.classList.remove('hidden');
  loadingCards(grid, 12);
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const payload = await jsonFetch(`/api/search?q=${encodeURIComponent(term)}`);
    const games = (payload.games || []).filter((game) => Number(game.discount || 0) > 0);

    grid.innerHTML = games.length
      ? games.map((game) => card(game)).join('')
      : emptyState('SEM PROMOÇÃO ATIVA', 'Não encontramos uma oferta ativa para essa busca agora.');

    for (const game of games) {
      if (!state.games.some((item) => String(item.id) === String(game.id))) state.games.push(game);
    }
    bindCards(grid);
  } catch {
    grid.innerHTML = emptyState('BUSCA INDISPONÍVEL', 'Não foi possível atualizar os resultados agora.');
  }
}

async function searchCatalog(term) {
  const grid = $('#gamesGrid');
  if (!grid) return;

  state.catalogSearching = true;
  const loadMoreButton = $('#loadMore');
  if (loadMoreButton) loadMoreButton.classList.add('hidden');
  loadingCards(grid, 16);

  const heading = $('#catalogHeading');
  const subtitle = $('#catalogSubtitle');
  if (heading) heading.textContent = 'RESULTADOS DA BUSCA';
  if (subtitle) subtitle.textContent = `Promoções encontradas para “${term}”`;

  try {
    const payload = await jsonFetch(`/api/search?q=${encodeURIComponent(term)}`);
    state.games = (payload.games || []).filter((game) => Number(game.discount || 0) > 0);
    applyFilters();
  } catch {
    grid.innerHTML = emptyState('BUSCA INDISPONÍVEL', 'Não foi possível atualizar os resultados agora.');
  }
}

function clearCatalogSearch() {
  state.catalogSearching = false;
  state.games = [...state.catalogAll];
  const input = $('#catalogSearchInput');
  const heading = $('#catalogHeading');
  const subtitle = $('#catalogSubtitle');
  const loadMoreButton = $('#loadMore');

  if (input) input.value = '';
  if (heading) heading.textContent = 'TODOS OS JOGOS';
  if (subtitle) subtitle.textContent = 'Todas as promoções em tempo real';
  if (loadMoreButton) loadMoreButton.classList.remove('hidden');
  applyFilters();
}

function setupCarousel() {
  const slider = $('#featuredCarousel');
  if (!slider) return;

  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let moved = false;

  slider.addEventListener('pointerdown', (event) => {
    if (event.target.closest('a, button, input, select, label')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    dragging = true;
    moved = false;
    startX = event.clientX;
    startScroll = slider.scrollLeft;
    slider.classList.add('dragging');
    slider.setPointerCapture?.(event.pointerId);
  });

  slider.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) > 5) moved = true;
    slider.scrollLeft = startScroll - distance;
  });

  const stop = () => {
    dragging = false;
    slider.classList.remove('dragging');
  };

  slider.addEventListener('pointerup', stop);
  slider.addEventListener('pointercancel', stop);
  slider.addEventListener('lostpointercapture', stop);

  slider.addEventListener('click', (event) => {
    if (moved && !event.target.closest('a, button')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  slider.addEventListener('wheel', (event) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    slider.scrollLeft += event.deltaY || event.deltaX;
  }, { passive: false });

  $$('.carousel-arrow').forEach((button) => {
    button.addEventListener('click', () => {
      const direction = Number(button.dataset.dir || 1);
      slider.scrollBy({
        left: direction * Math.min(slider.clientWidth * 0.94, 1320),
        behavior: 'smooth'
      });
    });
  });
}

function showShelf(id) {
  const section = $(id);
  if (!section) return;
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openHashShelf() {
  if (location.hash === '#desejos') showShelf('#desejos');
  if (location.hash === '#historico') showShelf('#historico');
}

loadLocal();
renderShelves();

if (page === 'home') {
  loadHome();
  setupCarousel();
  openHashShelf();

  $('#searchForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const term = $('#searchInput')?.value.trim() || '';
    if (term.length >= 2) searchHome(term);
  });

  $('#closeSearch')?.addEventListener('click', () => {
    $('#searchResultsSection')?.classList.add('hidden');
  });

  $('#wishlistButton')?.addEventListener('click', () => showShelf('#desejos'));

  document.querySelector('a[href="/#desejos"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    history.replaceState(null, '', '/#desejos');
    showShelf('#desejos');
  });

  document.querySelector('a[href="/#historico"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    history.replaceState(null, '', '/#historico');
    showShelf('#historico');
  });
}

if (page === 'catalog') {
  loadCatalog();

  $('#discountFilter')?.addEventListener('change', applyFilters);
  $('#sortSelect')?.addEventListener('change', applyFilters);
  $('#loadMore')?.addEventListener('click', loadMore);

  $('#catalogSearchForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const term = $('#catalogSearchInput')?.value.trim() || '';
    if (term.length >= 2) searchCatalog(term);
  });

  $('#clearCatalogSearch')?.addEventListener('click', clearCatalogSearch);
}
