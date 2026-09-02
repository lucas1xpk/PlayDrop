const state = {
  games: [],
  catalogAll: [],
  featured: [],
  bestsellers: [],
  start: 0,
  count: 48,
  wishlist: new Map(),
  history: new Map(),
  priceHistory: {},
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

function slugify(value) {
  return String(value || 'jogo').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function gameKey(game) {
  return String(game.id || slugify(game.title));
}

function detailUrl(game) {
  return `/jogo/${slugify(game.title)}?q=${encodeURIComponent(game.title || '')}`;
}

function imageFor(game) {
  if (game.image) return game.image;
  if (game.appid) return `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
  return '/assets/game-placeholder.svg';
}

function storeCode(name) {
  const value = String(name || 'Loja').toLowerCase();
  if (value.includes('steam')) return ['steam', 'S'];
  if (value.includes('nuuvem')) return ['nuuvem', 'N'];
  if (value.includes('green')) return ['gmg', 'G'];
  if (value.includes('fanatical')) return ['fanatical', 'F'];
  if (value.includes('gog')) return ['gog', 'G'];
  if (value.includes('epic')) return ['epic', 'E'];
  return ['store', String(name || 'L').charAt(0).toUpperCase()];
}

function storeBadge(name, compact = false) {
  const [type, letter] = storeCode(name);
  return `<span class="store-logo ${type} ${compact ? 'compact' : ''}" aria-hidden="true">${safe(letter)}</span>`;
}

function sortedOffers(game) {
  return (game.offers || [])
    .filter((offer) => Number.isFinite(Number(offer.price)) && offer.url)
    .sort((a, b) => Number(a.price) - Number(b.price));
}

function persistLocal() {
  localStorage.setItem('playdropWishlist', JSON.stringify([...state.wishlist.values()]));
  localStorage.setItem('playdropHistory', JSON.stringify([...state.history.values()].slice(-30)));
  localStorage.setItem('playdropPriceHistory', JSON.stringify(state.priceHistory));
}

function loadLocal() {
  try {
    for (const game of JSON.parse(localStorage.getItem('playdropWishlist') || '[]')) {
      state.wishlist.set(gameKey(game), game);
    }
    for (const game of JSON.parse(localStorage.getItem('playdropHistory') || '[]')) {
      state.history.set(gameKey(game), game);
    }
    state.priceHistory = JSON.parse(localStorage.getItem('playdropPriceHistory') || '{}') || {};
  } catch {
    localStorage.removeItem('playdropWishlist');
    localStorage.removeItem('playdropHistory');
    localStorage.removeItem('playdropPriceHistory');
    state.priceHistory = {};
  }
  updateWishlistBadges();
}

function recordPrices(games) {
  const now = new Date();
  const bucket = now.toISOString().slice(0, 13);
  let changed = false;
  for (const game of games) {
    const price = Number(game.price);
    if (!Number.isFinite(price)) continue;
    const id = gameKey(game);
    const entries = Array.isArray(state.priceHistory[id]) ? state.priceHistory[id] : [];
    if (entries.at(-1)?.bucket === bucket && entries.at(-1)?.price === price) continue;
    entries.push({ bucket, date: now.toISOString(), price });
    state.priceHistory[id] = entries.slice(-30);
    changed = true;
  }
  if (changed) persistLocal();
}

function localLow(game) {
  const providerLow = Number(game.historical_low);
  const entries = state.priceHistory[gameKey(game)] || [];
  const values = entries.map((entry) => Number(entry.price)).filter(Number.isFinite);
  if (Number.isFinite(providerLow) && providerLow > 0) values.push(providerLow);
  return values.length ? Math.min(...values) : null;
}

function priceInsight(game) {
  const price = Number(game.price);
  const low = localLow(game);
  if (!Number.isFinite(low)) return { type: 'tracking', label: 'PREÇO EM ACOMPANHAMENTO', low: null };
  if (price <= low * 1.001) return { type: 'new-low', label: 'NOVO MENOR PREÇO', low };
  if (price <= low * 1.10) return { type: 'near-low', label: 'PERTO DO MENOR PREÇO', low };
  return { type: 'tracked', label: 'PREÇO ACOMPANHADO', low };
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function updateWishlistBadges() {
  $$('#wishlistBadge').forEach((badge) => { badge.textContent = state.wishlist.size; });
  const count = $('#wishlistCount');
  if (count) count.textContent = `${state.wishlist.size} ${state.wishlist.size === 1 ? 'JOGO' : 'JOGOS'}`;
}

function offerRows(game, limit = 3) {
  return sortedOffers(game).slice(0, limit).map((offer, index) => `
    <div class="offer-row ${index === 0 ? 'winner' : ''}">
      <span>${storeBadge(offer.shop, true)}<b>${safe(offer.shop || 'Loja')}</b></span>
      <strong>${formatMoney(offer.price)}</strong>
      <small>${safe(offer.activation || 'Loja')}</small>
      ${index === 0 ? '<i>MELHOR</i>' : ''}
    </div>
  `).join('');
}

function card(game, options = {}) {
  const { featured = false } = options;
  const id = gameKey(game);
  const active = state.wishlist.has(id);
  const discount = Math.max(0, Number(game.discount || 0));
  const price = Number(game.price || 0);
  const regular = Number(game.regular || price);
  const offers = sortedOffers(game);
  const bestOffer = offers[0] || game;
  const insight = priceInsight(game);
  const url = detailUrl(game);

  return `
    <article class="game-card ${featured ? 'featured-card' : ''}" data-id="${safe(id)}">
      <div class="game-cover">
        <a href="${safe(url)}" aria-label="Comparar preços de ${safe(game.title)}"><img loading="lazy" decoding="async" src="${safe(imageFor(game))}" alt="${safe(game.title)}"></a>
        ${discount > 0 ? `<span class="discount">-${Math.round(discount)}%</span>` : ''}
        ${offers.length > 1 ? `<span class="offer-count">${offers.length} LOJAS</span>` : ''}
        <button class="heart ${active ? 'active' : ''}" type="button" aria-label="${active ? 'Remover da lista de desejos' : 'Adicionar à lista de desejos'}">${active ? '♥' : '♡'}</button>
      </div>
      <div class="card-body">
        <a class="card-title" href="${safe(url)}" title="${safe(game.title)}">${safe(game.title)}</a>
        <div class="best-label">MELHOR PREÇO</div>
        <div class="price-row"><strong>${formatMoney(price)}</strong>${regular > price ? `<del>${formatMoney(regular)}</del>` : ''}</div>
        <div class="card-meta"><span>${storeBadge(bestOffer.shop, true)}${safe(bestOffer.shop || 'Loja')}</span><span>${safe(bestOffer.activation || 'Loja')}</span></div>
        <a class="compare-link" href="${safe(url)}">COMPARAR ${offers.length || 1} ${offers.length === 1 ? 'OFERTA' : 'OFERTAS'} <span>→</span></a>
      </div>
      <div class="card-overlay">
        <div class="price-status ${insight.type}">${safe(insight.label)}</div>
        <div class="overlay-low"><span>MENOR REGISTRADO</span><strong>${insight.low ? formatMoney(insight.low) : 'COLETANDO DADOS'}</strong></div>
        <div class="overlay-offers">${offerRows(game)}</div>
        <a class="offer-link" href="${safe(bestOffer.url || '#')}" target="_blank" rel="noopener noreferrer">IR PARA A MELHOR OFERTA</a>
      </div>
    </article>
  `;
}

function bestsellerCard(game, index) {
  const offer = sortedOffers(game)[0] || game;
  return `
    <article class="rank-card" data-id="${safe(gameKey(game))}">
      <span class="rank-number">${String(index + 1).padStart(2, '0')}</span>
      <a class="rank-cover" href="${safe(detailUrl(game))}"><img loading="lazy" src="${safe(imageFor(game))}" alt="${safe(game.title)}"></a>
      <div class="rank-info"><a href="${safe(detailUrl(game))}">${safe(game.title)}</a><span>${storeBadge(offer.shop, true)} ${safe(offer.shop || 'Loja')}</span><strong>${formatMoney(game.price)}</strong></div>
    </article>
  `;
}

function loadingCards(element, amount, type = 'card') {
  if (!element) return;
  element.innerHTML = Array.from({ length: amount }, () => `<div class="skeleton ${type}"></div>`).join('');
}

function emptyState(title, detail = '') {
  return `<div class="empty"><span>!</span><div><strong>${safe(title)}</strong>${detail ? `<p>${safe(detail)}</p>` : ''}</div></div>`;
}

function allKnownGames() {
  return [...state.games, ...state.catalogAll, ...state.featured, ...state.bestsellers, ...state.wishlist.values(), ...state.history.values()];
}

function findGame(id) {
  return allKnownGames().find((game) => gameKey(game) === String(id));
}

function toggleWishlist(game) {
  const id = gameKey(game);
  if (state.wishlist.has(id)) {
    state.wishlist.delete(id);
    showToast('Removido da lista de desejos');
  } else {
    state.wishlist.set(id, game);
    showToast('Adicionado à lista de desejos');
  }
  persistLocal();
  updateWishlistBadges();
  renderFeatured();
  applyFilters();
  renderShelves();
  if (page === 'detail') renderDetail(game);
}

function addHistory(game) {
  const id = gameKey(game);
  state.history.delete(id);
  state.history.set(id, game);
  recordPrices([game]);
  persistLocal();
  renderShelves();
}

function bindCards(scope = document) {
  if (!scope) return;
  scope.querySelectorAll('.game-card, .rank-card').forEach((element) => {
    const game = findGame(element.dataset.id);
    if (!game) return;
    element.querySelectorAll('img').forEach((image) => image.addEventListener('error', () => { image.src = '/assets/game-placeholder.svg'; }, { once: true }));
    element.querySelector('.heart')?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); toggleWishlist(game); });
    element.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => addHistory(game)));
    if (window.matchMedia('(hover: none)').matches) {
      element.addEventListener('click', (event) => {
        if (event.target.closest('a, button, input, select, label')) return;
        element.classList.toggle('touch-open');
      });
    }
  });
}

function uniqueGames(games) {
  const seen = new Set();
  return games.filter((game) => {
    const key = gameKey(game);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderBestsellers() {
  const carousel = $('#bestsellerCarousel');
  if (!carousel) return;
  carousel.innerHTML = state.bestsellers.length
    ? state.bestsellers.map(bestsellerCard).join('')
    : emptyState('RANKING SENDO ATUALIZADO', 'Tente novamente em instantes.');
  bindCards(carousel);
}

function renderFeatured() {
  const carousel = $('#featuredCarousel');
  if (!carousel) return;
  const items = uniqueGames([...state.featured, ...state.games]).filter((game) => Number(game.discount || 0) > 0).slice(0, 14);
  carousel.innerHTML = items.length ? items.map((game) => card(game, { featured: true })).join('') : emptyState('OFERTAS SENDO ATUALIZADAS', 'Tente novamente em instantes.');
  bindCards(carousel);
}

function populateFilters() {
  const storeSelect = $('#storeFilter');
  const activationSelect = $('#activationFilter');
  if (!storeSelect || !activationSelect) return;
  const currentStore = storeSelect.value;
  const currentActivation = activationSelect.value;
  const stores = new Set();
  const activations = new Set();
  state.catalogAll.forEach((game) => sortedOffers(game).forEach((offer) => {
    if (offer.shop) stores.add(offer.shop);
    if (offer.activation) activations.add(offer.activation);
  }));
  storeSelect.innerHTML = '<option value="all">TODAS AS LOJAS</option>' + [...stores].sort().map((value) => `<option value="${safe(value)}">${safe(value.toUpperCase())}</option>`).join('');
  activationSelect.innerHTML = '<option value="all">TODAS</option>' + [...activations].sort().map((value) => `<option value="${safe(value)}">${safe(value.toUpperCase())}</option>`).join('');
  if ([...stores].includes(currentStore)) storeSelect.value = currentStore;
  if ([...activations].includes(currentActivation)) activationSelect.value = currentActivation;
}

function applyFilters() {
  const grid = $('#gamesGrid');
  if (!grid) return;
  let items = [...state.games];
  const minDiscount = Number($('#discountFilter')?.value || 0);
  const store = $('#storeFilter')?.value || 'all';
  const activation = $('#activationFilter')?.value || 'all';
  const minPrice = Number($('#minPrice')?.value || 0);
  const maxPriceValue = $('#maxPrice')?.value;
  const maxPrice = maxPriceValue ? Number(maxPriceValue) : Infinity;

  items = items.filter((game) => {
    const offers = sortedOffers(game);
    return Number(game.discount || 0) >= minDiscount
      && Number(game.price) >= minPrice && Number(game.price) <= maxPrice
      && (store === 'all' || offers.some((offer) => offer.shop === store))
      && (activation === 'all' || offers.some((offer) => offer.activation === activation));
  });

  const sort = $('#sortSelect')?.value || 'relevance';
  if (sort === 'discount') items.sort((a, b) => Number(b.discount || 0) - Number(a.discount || 0));
  if (sort === 'price') items.sort((a, b) => Number(a.price ?? Infinity) - Number(b.price ?? Infinity));
  if (sort === 'popularity') items.sort((a, b) => Number(a.popularity_rank || 9999) - Number(b.popularity_rank || 9999));

  const count = $('#catalogCount');
  if (count) count.textContent = `${items.length} ${items.length === 1 ? 'JOGO ENCONTRADO' : 'JOGOS ENCONTRADOS'}`;
  grid.innerHTML = items.length ? items.map((game) => card(game)).join('') : emptyState('NENHUMA OFERTA ENCONTRADA', 'Altere os filtros ou faça outra busca.');
  bindCards(grid);
}

function renderShelves() {
  const wishlistGrid = $('#wishlistGrid');
  const historyGrid = $('#historyGrid');
  updateWishlistBadges();
  if (wishlistGrid) {
    const wishlist = [...state.wishlist.values()];
    wishlistGrid.innerHTML = wishlist.length ? wishlist.map((game) => card(game)).join('') : emptyState('SUA LISTA ESTÁ VAZIA', 'Use o coração para acompanhar seus jogos favoritos.');
    bindCards(wishlistGrid);
  }
  if (historyGrid) {
    const history = [...state.history.values()].reverse();
    historyGrid.innerHTML = history.length ? history.map((game) => card(game)).join('') : emptyState('NENHUM PREÇO ACOMPANHADO', 'Os jogos que você comparar aparecerão aqui.');
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
  loadingCards($('#bestsellerCarousel'), 5, 'rank');
  loadingCards($('#featuredCarousel'), 5, 'card');
  const [bestsellers, featured, deals] = await Promise.all([
    jsonFetch('/api/bestsellers').catch(() => ({ games: [] })),
    jsonFetch('/api/featured').catch(() => ({ games: [] })),
    jsonFetch('/api/deals?start=0&count=40').catch(() => ({ games: [] })),
  ]);
  state.bestsellers = bestsellers.games || [];
  state.featured = featured.games || [];
  state.games = deals.games || [];
  recordPrices([...state.bestsellers, ...state.featured, ...state.games]);
  renderBestsellers();
  renderFeatured();
}

async function loadCatalog() {
  loadingCards($('#gamesGrid'), 18, 'card');
  try {
    const deals = await jsonFetch(`/api/deals?start=0&count=${state.count}`);
    state.games = deals.games || [];
    state.catalogAll = [...state.games];
    recordPrices(state.games);
    populateFilters();
    applyFilters();
  } catch {
    $('#gamesGrid').innerHTML = emptyState('CATÁLOGO INDISPONÍVEL AGORA', 'Tente novamente em instantes.');
    if ($('#catalogCount')) $('#catalogCount').textContent = 'ATUALIZAÇÃO PENDENTE';
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
    const ids = new Set(state.catalogAll.map(gameKey));
    const newGames = (payload.games || []).filter((game) => !ids.has(gameKey(game)));
    state.catalogAll.push(...newGames);
    state.games = [...state.catalogAll];
    recordPrices(newGames);
    populateFilters();
    applyFilters();
    if (!newGames.length) showToast('Você chegou ao fim das ofertas');
  } catch {
    state.start = Math.max(0, state.start - state.count);
    showToast('Não foi possível carregar mais ofertas');
  } finally {
    button.disabled = false;
    button.innerHTML = oldText;
  }
}

async function searchCatalog(term) {
  const grid = $('#gamesGrid');
  state.catalogSearching = true;
  $('#loadMore')?.classList.add('hidden');
  loadingCards(grid, 12, 'card');
  $('#catalogHeading').textContent = 'RESULTADOS DA BUSCA';
  $('#catalogSubtitle').textContent = `Comparação de preços para “${term}”`;
  try {
    const payload = await jsonFetch(`/api/search?q=${encodeURIComponent(term)}`);
    state.games = payload.games || [];
    recordPrices(state.games);
    populateFilters();
    applyFilters();
  } catch {
    grid.innerHTML = emptyState('BUSCA INDISPONÍVEL', 'Não foi possível atualizar os resultados agora.');
  }
}

function clearCatalogSearch() {
  state.catalogSearching = false;
  state.games = [...state.catalogAll];
  $('#catalogSearchInput').value = '';
  $('#catalogHeading').textContent = 'TODOS OS JOGOS';
  $('#catalogSubtitle').textContent = 'Ofertas atualizadas e organizadas por relevância';
  $('#loadMore')?.classList.remove('hidden');
  populateFilters();
  applyFilters();
}

function resetFilters() {
  ['storeFilter', 'activationFilter'].forEach((id) => { if ($(`#${id}`)) $(`#${id}`).value = 'all'; });
  if ($('#discountFilter')) $('#discountFilter').value = '0';
  if ($('#minPrice')) $('#minPrice').value = '';
  if ($('#maxPrice')) $('#maxPrice').value = '';
  if ($('#sortSelect')) $('#sortSelect').value = 'relevance';
  applyFilters();
}

function setupCarousels() {
  $$('.game-carousel, .rank-carousel').forEach((slider) => {
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;
    slider.addEventListener('pointerdown', (event) => {
      if (event.target.closest('a, button')) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragging = true; moved = false; startX = event.clientX; startScroll = slider.scrollLeft;
      slider.classList.add('dragging');
      slider.setPointerCapture?.(event.pointerId);
    });
    slider.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const distance = event.clientX - startX;
      if (Math.abs(distance) > 5) moved = true;
      slider.scrollLeft = startScroll - distance;
    });
    const stop = () => { dragging = false; slider.classList.remove('dragging'); };
    slider.addEventListener('pointerup', stop);
    slider.addEventListener('pointercancel', stop);
    slider.addEventListener('lostpointercapture', stop);
    slider.addEventListener('click', (event) => { if (moved) { event.preventDefault(); event.stopPropagation(); } }, true);
    slider.addEventListener('wheel', (event) => {
      const delta = event.deltaY || event.deltaX;
      const atStart = slider.scrollLeft <= 0;
      const atEnd = Math.ceil(slider.scrollLeft + slider.clientWidth) >= slider.scrollWidth;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
      event.preventDefault();
      slider.scrollLeft += delta;
    }, { passive: false });
  });
  $$('.carousel-arrow').forEach((button) => button.addEventListener('click', () => {
    const slider = document.getElementById(button.dataset.target);
    slider?.scrollBy({ left: Number(button.dataset.dir || 1) * Math.min(slider.clientWidth * 0.85, 1100), behavior: 'smooth' });
  }));
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

function historyTimeline(game) {
  const entries = state.priceHistory[gameKey(game)] || [];
  if (!entries.length) return '<div class="timeline-empty">O acompanhamento começou agora. Volte depois para comparar as mudanças.</div>';
  const max = Math.max(...entries.map((entry) => Number(entry.price)), 1);
  return `<div class="price-timeline">${entries.slice(-8).map((entry) => {
    const date = new Date(entry.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const height = Math.max(18, Math.round((Number(entry.price) / max) * 100));
    return `<div><span style="height:${height}%" title="${safe(date)} — ${formatMoney(entry.price)}"></span><small>${safe(date)}</small><b>${formatMoney(entry.price)}</b></div>`;
  }).join('')}</div>`;
}

function renderDetail(game) {
  const content = $('#detailContent');
  if (!content) return;
  const offers = sortedOffers(game);
  const best = offers[0] || game;
  const insight = priceInsight(game);
  const id = gameKey(game);
  const active = state.wishlist.has(id);
  document.title = `${game.title} — PlayDrop`;
  content.innerHTML = `
    <article class="detail-hero">
      <div class="detail-cover"><img src="${safe(imageFor(game))}" alt="${safe(game.title)}"><span class="detail-discount">-${Math.round(Number(game.discount || 0))}%</span></div>
      <div class="detail-summary">
        <span class="eyebrow purple">COMPARADOR DE PREÇOS</span>
        <h1>${safe(game.title)}</h1>
        <div class="detail-status price-status ${insight.type}">${safe(insight.label)}</div>
        <div class="detail-price"><span>MELHOR PREÇO AGORA</span><strong>${formatMoney(game.price)}</strong>${Number(game.regular) > Number(game.price) ? `<del>${formatMoney(game.regular)}</del>` : ''}</div>
        <div class="detail-facts"><div><span>LOJA</span><strong>${storeBadge(best.shop, true)} ${safe(best.shop || 'Loja')}</strong></div><div><span>ATIVAÇÃO</span><strong>${safe(best.activation || 'Loja')}</strong></div><div><span>MENOR REGISTRADO</span><strong>${insight.low ? formatMoney(insight.low) : 'COLETANDO'}</strong></div></div>
        <div class="detail-actions"><a class="primary-button green" href="${safe(best.url || '#')}" target="_blank" rel="noopener noreferrer">IR PARA A MELHOR OFERTA →</a><button id="detailWishlist" class="wishlist-button ${active ? 'active' : ''}" type="button">${active ? '♥ REMOVER DOS DESEJOS' : '♡ ADICIONAR AOS DESEJOS'}</button></div>
      </div>
    </article>
    <section class="comparison-section">
      <div class="detail-section-title"><div><span class="eyebrow yellow">${offers.length} ${offers.length === 1 ? 'LOJA ENCONTRADA' : 'LOJAS ENCONTRADAS'}</span><h2>COMPARE AS OFERTAS</h2></div><span>O menor preço aparece primeiro</span></div>
      <div class="comparison-table" role="table">
        <div class="comparison-head" role="row"><span>LOJA</span><span>ATIVAÇÃO</span><span>PREÇO ORIGINAL</span><span>DESCONTO</span><span>PREÇO</span><span></span></div>
        ${offers.map((offer, index) => `<div class="comparison-row ${index === 0 ? 'best' : ''}" role="row"><span class="shop-cell">${storeBadge(offer.shop)}<b>${safe(offer.shop || 'Loja')}</b>${index === 0 ? '<i>🏆 MELHOR PREÇO</i>' : ''}</span><span>${safe(offer.activation || 'Loja')}</span><span><del>${Number(offer.regular) > Number(offer.price) ? formatMoney(offer.regular) : '—'}</del></span><span>${Number(offer.discount || 0) ? `-${Math.round(Number(offer.discount))}%` : '—'}</span><strong>${formatMoney(offer.price)}</strong><a href="${safe(offer.url)}" target="_blank" rel="noopener noreferrer">VER OFERTA →</a></div>`).join('')}
      </div>
    </section>
    <section class="tracking-section"><div class="detail-section-title"><div><span class="eyebrow purple">REGISTRO DESTE DISPOSITIVO</span><h2>HISTÓRICO DE PREÇOS</h2></div><span>Até 30 atualizações recentes</span></div>${historyTimeline(game)}</section>
  `;
  content.querySelector('.detail-cover img')?.addEventListener('error', (event) => { event.currentTarget.src = '/assets/game-placeholder.svg'; }, { once: true });
  $('#detailWishlist')?.addEventListener('click', () => toggleWishlist(game));
  content.querySelectorAll('a[target="_blank"]').forEach((link) => link.addEventListener('click', () => addHistory(game)));
}

async function loadDetail() {
  const term = new URLSearchParams(location.search).get('q') || '';
  const cachedGame = allKnownGames().find((game) => game.title === term);
  if (cachedGame) renderDetail(cachedGame);
  try {
    const payload = await jsonFetch(`/api/game?q=${encodeURIComponent(term)}`);
    const game = payload.game;
    state.games = [game];
    recordPrices([game]);
    addHistory(game);
    renderDetail(game);
  } catch {
    $('#detailContent').innerHTML = emptyState('JOGO NÃO ENCONTRADO', 'Volte ao catálogo e escolha outra oferta.');
  }
}

loadLocal();
renderShelves();

if (page === 'home') {
  setupCarousels();
  loadHome();
  openHashShelf();
  window.addEventListener('hashchange', openHashShelf);
  $('#wishlistButton')?.addEventListener('click', () => showShelf('#desejos'));
  $('a[href="/#desejos"]')?.addEventListener('click', (event) => { event.preventDefault(); history.replaceState(null, '', '/#desejos'); showShelf('#desejos'); });
  $('a[href="/#historico"]')?.addEventListener('click', (event) => { event.preventDefault(); history.replaceState(null, '', '/#historico'); showShelf('#historico'); });
  $('#clearHistory')?.addEventListener('click', () => { state.history.clear(); persistLocal(); renderShelves(); showToast('Histórico limpo'); });
}

if (page === 'catalog') {
  loadCatalog();
  ['discountFilter', 'storeFilter', 'activationFilter', 'sortSelect'].forEach((id) => $(`#${id}`)?.addEventListener('change', applyFilters));
  $('#applyPrice')?.addEventListener('click', applyFilters);
  $('#resetFilters')?.addEventListener('click', resetFilters);
  $('#loadMore')?.addEventListener('click', loadMore);
  $('#catalogSearchForm')?.addEventListener('submit', (event) => { event.preventDefault(); const term = $('#catalogSearchInput')?.value.trim() || ''; if (term.length >= 2) searchCatalog(term); });
  $('#clearCatalogSearch')?.addEventListener('click', clearCatalogSearch);
}

if (page === 'detail') loadDetail();
