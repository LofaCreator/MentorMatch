/* MentorMatch SPA — vanilla JS */
'use strict';

const API = '/api';
const app = document.getElementById('app');
const topbar = document.getElementById('topbar');
const nav = document.getElementById('mainNav');
const footer = document.getElementById('footer');
const modalRoot = document.getElementById('modalRoot');
const toastRoot = document.getElementById('toastRoot');
let globeInstance = null; // активный экземпляр cobe, чтобы уничтожать при уходе

const state = { me: null, deck: [], deckIndex: 0, matches: [] };

/* ---------- tiny helpers ---------- */
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const roleLabel = (r) => (r === 'mentor' ? 'Ментор' : 'Студент');

/* цвет аватара из палитры бренда (стабильный по имени, белый текст читаем) */
const AV_PALETTE = ['#4B4453', '#6A4840', '#9E7970', '#7E6A92', '#838185'];
function avColor(u) {
  const key = String((u && u.name) || '') + String((u && u.id) || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length];
}
/* аватар: картинка если загружена, иначе цветной кружок с инициалами */
const avStyle = (u) => (u && u.avatar)
  ? `background-image:url('${u.avatar}');background-size:cover;background-position:center`
  : `background:${avColor(u)}`;
const avText = (u) => (u && u.avatar) ? '' : esc(initials(u.name));
/* галочка верификации (как в инстаграм) */
const vCheck = (u) => (u && u.verified)
  ? `<svg class="vcheck" viewBox="0 0 24 24" aria-label="Проверенный ментор"><path fill="currentColor" d="m12 1 2.4 1.8 3-.3 1 2.8 2.8 1-.3 3L23 12l-1.8 2.4.3 3-2.8 1-1 2.8-3-.3L12 23l-2.4-1.8-3 .3-1-2.8-2.8-1 .3-3L1 12l1.8-2.4-.3-3 2.8-1 1-2.8 3 .3z"/><path fill="#fff" d="m10.6 14.6-2.2-2.2-1.2 1.2 3.4 3.4 6-6-1.2-1.2z"/></svg>`
  : '';
const money = (n) => n ? new Intl.NumberFormat('ru-RU').format(n) + ' ₽/час' : 'Бесплатно';
const proBadge = (u) => (u && u.subscribed) ? '<span class="pro-badge">PRO</span>' : '';

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

function toast(msg) {
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  toastRoot.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ===================================================================
   BOOT
=================================================================== */
(async function boot() {
  try {
    const { user } = await api('/me');
    if (user) { state.me = user; await enterApp('home'); }
    else renderAuth();
  } catch (e) { renderAuth(); }
})();

async function enterApp(view) {
  destroyGlobe();
  topbar.classList.remove('hidden');
  footer.classList.remove('hidden');
  bindNav();
  await refreshMatches();
  go(view);
}

function bindNav() {
  nav.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.onclick = () => go(tab.dataset.view);
  });
  footer.querySelectorAll('[data-view]').forEach((a) => {
    a.onclick = () => go(a.dataset.view);
  });
}

function setActiveTab(view) {
  nav.querySelectorAll('.nav-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
}

function go(view) {
  setActiveTab(view);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'home') renderHome();
  else if (view === 'deck') renderDeck();
  else if (view === 'matches') renderMatches();
  else if (view === 'top') renderTop();
  else if (view === 'profile') renderProfile();
}

/* ===================================================================
   AUTH (landing + login/register)
=================================================================== */
function renderAuth(mode = 'register') {
  topbar.classList.add('hidden');
  footer.classList.add('hidden');
  app.innerHTML = '';
  const view = el(`
    <div class="view auth-layout">
      <section class="globe-panel">
        <div class="globe-brand">
          <span class="logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
          </span>
          <span class="wordmark"><span class="mentor">Mentor</span><span class="match">Match</span></span>
        </div>

        <div class="globe-stage"><canvas id="globe"></canvas></div>
        <div class="conn-overlay" aria-hidden="true">
          <svg class="conn-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M84,20 C66,34 70,58 56,76" />
            <circle class="conn-dot" r="1.3"><animateMotion dur="2.6s" repeatCount="indefinite" path="M84,20 C66,34 70,58 56,76"/></circle>
          </svg>
          <div class="conn-chip a"><span class="av" style="background:#9E7970">МВ</span><div>Мария<small>Ментор · Дизайн</small></div></div>
          <div class="conn-chip b"><span class="av" style="background:#4B4453">ПМ</span><div>Павел<small>Студент · IT</small></div></div>
        </div>

        <div class="globe-headline">
          <h2>Один свайп — и вы уже на связи</h2>
          <p>Студенты и выпускники со всего мира находят друг друга. Карьера и учёба — через живое общение, а не холодные письма.</p>
        </div>

        <div class="globe-stats stagger">
          <div class="s"><strong>1 200+</strong><span>в сообществе</span></div>
          <div class="s"><strong>48</strong><span>городов</span></div>
          <div class="s"><strong>3 мин</strong><span>до первого мэтча</span></div>
        </div>
      </section>

      <section class="auth-form-wrap">
        <div class="auth-inner">
          <div class="tab-switch">
            <button data-m="login">Вход</button>
            <button data-m="register">Регистрация</button>
          </div>
          <div id="authForm"></div>
        </div>
      </section>
    </div>`);
  app.appendChild(view);
  initGlobe();
  renderAuthCard(mode);
}

function renderAuthCard(mode) {
  document.querySelectorAll('.tab-switch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.m === mode);
    b.onclick = () => renderAuthCard(b.dataset.m);
  });
  document.getElementById('authForm').innerHTML = '';
  mode === 'login' ? loginForm() : registerForm();
}

/* ---------- 3D globe (cobe) — связи менторов и выпускников ---------- */
function destroyGlobe() {
  if (globeInstance) { try { globeInstance.destroy(); } catch (e) {} globeInstance = null; }
}

async function initGlobe() {
  const canvas = document.getElementById('globe');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { canvas.style.opacity = '1'; }
  try {
    const createGlobe = (await import('https://cdn.jsdelivr.net/npm/cobe@0.6.3/+esm')).default;
    let phi = 0, width = 0, pointer = null, rot = 0;
    const onResize = () => { width = canvas.offsetWidth; };
    window.addEventListener('resize', onResize); onResize();

    globeInstance = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2, height: width * 2,
      phi: 0, theta: 0.28,
      dark: 0, diffuse: 1.2,
      mapSamples: 17000, mapBrightness: 5.2,
      baseColor: [0.98, 0.96, 0.98],
      markerColor: [75 / 255, 68 / 255, 83 / 255],
      glowColor: [0.86, 0.80, 0.90],
      markers: [
        { location: [55.7558, 37.6173], size: 0.10 }, // Москва
        { location: [59.9343, 30.3351], size: 0.08 }, // Санкт-Петербург
        { location: [40.7128, -74.006], size: 0.07 }, // Нью-Йорк
        { location: [51.5074, -0.1278], size: 0.06 }, // Лондон
        { location: [52.52, 13.405], size: 0.05 },     // Берлин
        { location: [1.3521, 103.8198], size: 0.05 },  // Сингапур
        { location: [35.6762, 139.6503], size: 0.05 }, // Токио
        { location: [37.7749, -122.4194], size: 0.06 }, // Сан-Франциско
        { location: [43.2220, 76.8512], size: 0.05 },  // Алматы
        { location: [-23.5505, -46.6333], size: 0.05 }, // Сан-Паулу
      ],
      onRender: (st) => {
        if (pointer === null) phi += 0.004;
        st.phi = phi + rot;
        st.width = width * 2;
        st.height = width * 2;
      },
    });
    setTimeout(() => (canvas.style.opacity = '1'), 80);

    // перетаскивание глобуса мышью/пальцем
    const down = (x) => { pointer = x - rot * 200; canvas.style.cursor = 'grabbing'; };
    const move = (x) => { if (pointer !== null) rot = (x - pointer) / 200; };
    const up = () => { pointer = null; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerdown', (e) => down(e.clientX));
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointerout', up);
    canvas.addEventListener('pointermove', (e) => move(e.clientX));
    canvas.addEventListener('touchstart', (e) => down(e.touches[0].clientX), { passive: true });
    canvas.addEventListener('touchmove', (e) => move(e.touches[0].clientX), { passive: true });
    canvas.addEventListener('touchend', up);
  } catch (e) {
    // нет сети / WebGL — прячем canvas, панель остаётся красивой за счёт градиента
    canvas.style.display = 'none';
  }
}

function errBox(form, msg) {
  form.querySelectorAll('.form-error').forEach((e) => e.remove());
  form.prepend(el(`<div class="form-error" role="alert">${esc(msg)}</div>`));
}

function loginForm() {
  const f = document.getElementById('authForm');
  f.innerHTML = '';
  const form = el(`
    <form novalidate>
      <h1>С возвращением</h1>
      <p class="sub">Войди, чтобы продолжить искать мэтчи.</p>
      <div class="field"><label>Email <span class="req">*</span></label><input name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label>Пароль <span class="req">*</span></label><input name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary btn-block" type="submit">Войти</button>
      <p class="demo-hint">Демо-аккаунт: <code>anna@demo.io</code> · пароль <code>demo1234</code></p>
    </form>`);
  f.appendChild(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = 'Входим…';
    try {
      const fd = new FormData(form);
      state.me = await api('/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      await enterApp('deck');
    } catch (err) { errBox(form, err.message); btn.disabled = false; btn.textContent = 'Войти'; }
  };
}

function registerForm() {
  const f = document.getElementById('authForm');
  f.innerHTML = '';
  const form = el(`
    <form novalidate>
      <h1>Создай профиль</h1>
      <p class="sub">Пара минут — и можно свайпать.</p>
      <div class="role-pick">
        <label><input type="radio" name="role" value="student" checked><span class="rt">Я студент</span><span class="rd">ищу ментора</span></label>
        <label><input type="radio" name="role" value="mentor"><span class="rt">Я выпускник</span><span class="rd">готов менторить</span></label>
      </div>
      <div class="field"><label>Имя <span class="req">*</span></label><input name="name" required autocomplete="name"></div>
      <div class="grid-2">
        <div class="field"><label>Email <span class="req">*</span></label><input name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>Пароль <span class="req">*</span></label><input name="password" type="password" required autocomplete="new-password"><div class="help">мин. 6 символов</div></div>
      </div>
      <div class="field"><label>О себе одной строкой</label><input name="headline" placeholder="Напр.: Frontend-разработчик, ex-Яндекс"></div>
      <div class="grid-2">
        <div class="field"><label>Сфера</label><input name="field" placeholder="IT / Дизайн / Маркетинг"></div>
        <div class="field"><label>Универ / компания</label><input name="org" placeholder="МГУ или Сбер"></div>
      </div>
      <div class="field"><label>Навыки и темы</label><input name="skills" placeholder="React, Карьера, Собеседования"><div class="help">через запятую</div></div>
      <div class="field"><label>Цель</label><input name="goal" placeholder="Чего хочешь достичь / чем поможешь"></div>
      <div class="field"><label>О себе подробнее</label><textarea name="bio" placeholder="Пару предложений о твоём опыте и ожиданиях"></textarea></div>
      <button class="btn btn-primary btn-block" type="submit">Создать профиль</button>
    </form>`);
  f.appendChild(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = 'Создаём…';
    try {
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      state.me = await api('/register', { method: 'POST', body });
      await enterApp('deck');
    } catch (err) { errBox(form, err.message); btn.disabled = false; btn.textContent = 'Создать профиль'; }
  };
}

/* ===================================================================
   HOME (главный экран после входа)
=================================================================== */
function renderHome() {
  const first = state.me.name.split(' ')[0];
  const target = state.me.role === 'student' ? 'ментора' : 'талантливых студентов';
  const values = [
    ['Честный мэтчинг', 'Общение начинается только при взаимном интересе — никакого спама «в холодную».', 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z'],
    ['Опыт из первых рук', 'Менторы — практикующие выпускники, которые сами недавно проходили этот путь.', 'M12 2 2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5'],
    ['Быстрый старт', 'Профиль за пару минут, первый мэтч — за несколько свайпов.', 'M13 2 3 14h7l-1 8 10-12h-7z'],
    ['Карьера и учёба', 'Помощь с поступлением, пет-проектами, собеседованиями и переходом в профессию.', 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5'],
  ];
  const valueCards = values.map((v) => `
    <div class="value">
      <div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${v[2]}"/></svg></div>
      <h3>${esc(v[0])}</h3><p>${esc(v[1])}</p>
    </div>`).join('');

  const view = el(`
    <div class="view">
      <section class="home-hero">
        <span class="eyebrow"><span class="dot"></span> Привет, ${esc(first)}</span>
        <h1>Найди ${esc(target)} и расти быстрее</h1>
        <p class="lead">Листай анкеты как в Tinder, ставь «интересно» и получай мэтч при взаимной симпатии. Затем — живое общение в чате о карьере и учёбе.</p>
        <div class="cta-row">
          <button class="btn btn-white" data-go="deck">Начать поиск</button>
          <button class="btn btn-glass" data-scroll="guide">Как это работает</button>
        </div>
      </section>

      <div class="section-head" id="guide">
        <h2>Как работают карточки</h2>
        <p>Два простых жеста — и ты управляешь поиском.</p>
      </div>
      <div class="guide-grid">
        <div class="guide-card right">
          <div class="swipe-demo">
            <div class="mini">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
            </div>
            <span class="arrow">→</span>
          </div>
          <h3>Свайп вправо</h3>
          <p>Анкета понравилась — отправляешь «интересно». Если симпатия взаимна, будет мэтч.</p>
          <span class="verdict">Интересно</span>
        </div>
        <div class="guide-card left">
          <div class="swipe-demo">
            <span class="arrow">←</span>
            <div class="mini">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </div>
          </div>
          <h3>Свайп влево</h3>
          <p>Не подходит — пропускаешь и сразу видишь следующего человека.</p>
          <span class="verdict">Пропустить</span>
        </div>
      </div>

      <div class="section-head"><h2>Три шага до общения</h2></div>
      <div class="steps">
        <div class="step"><div class="n">1</div><h4>Заполни профиль</h4><p>Сфера, навыки, цель и пара слов о себе — так подбор точнее.</p></div>
        <div class="step"><div class="n">2</div><h4>Свайпай анкеты</h4><p>Мы показываем подходящих ${state.me.role === 'student' ? 'менторов' : 'студентов'} под твои цели.</p></div>
        <div class="step"><div class="n">3</div><h4>Получи мэтч и пиши</h4><p>Взаимная симпатия открывает чат — общайся и договаривайся.</p></div>
      </div>

      <div class="section-head"><h2>Почему MentorMatch</h2><p>Менторство, которое начинается с симпатии — как любимое приложение для знакомств, только про карьеру и учёбу.</p></div>
      <div class="value-grid">${valueCards}</div>

      <div class="section-head"><h2>Готов попробовать?</h2><p>Несколько свайпов — и ты на связи с нужным человеком.</p></div>
      <div style="text-align:center"><button class="btn btn-primary" data-go="deck">Перейти к поиску</button></div>
    </div>`);
  app.innerHTML = '';
  app.appendChild(view);
  view.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
  view.querySelectorAll('[data-scroll]').forEach((b) => (b.onclick = () => {
    document.getElementById(b.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

/* ===================================================================
   SWIPE DECK
=================================================================== */
let searchMode = 'cards';
const searchFilters = { tags: new Set(), q: '', sort: 'rating' };

async function renderDeck() {
  const opp = state.me.role === 'student' ? 'менторов' : 'студентов';
  const view = el(`
    <div class="view">
      <div class="deck-head">
        <h2>Поиск ${esc(opp)}</h2>
        <p>Свайпай карточки как в Tinder или ищи по тегам в списке.</p>
      </div>
      <div class="seg" role="tablist">
        <button data-mode="cards" role="tab">${iconCards()} Карточки</button>
        <button data-mode="list" role="tab">${iconList()} Список</button>
      </div>
      <div id="searchBody"></div>
    </div>`);
  app.innerHTML = '';
  app.appendChild(view);
  view.querySelectorAll('[data-mode]').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === searchMode);
    b.onclick = () => { if (searchMode !== b.dataset.mode) { searchMode = b.dataset.mode; renderDeck(); } };
  });
  if (searchMode === 'cards') renderCardMode();
  else renderListMode();
}

async function renderCardMode() {
  const body = document.getElementById('searchBody');
  body.innerHTML = '<div class="spinner" role="status"></div>';
  try { state.deck = await api('/deck'); state.deckIndex = 0; } catch (err) { toast(err.message); return; }
  body.innerHTML = '<div class="deck-wrap"><div class="deck" id="deck"></div><div class="deck-actions" id="deckActions"></div></div>';
  paintDeck();
}

/* ---------- режим «Список» с фильтром по тегам и поиском ---------- */
async function renderListMode() {
  const body = document.getElementById('searchBody');
  body.innerHTML = '<div class="spinner" role="status"></div>';
  try { state.candidates = await api('/candidates'); } catch (err) { toast(err.message); return; }

  body.innerHTML = `
    <div class="search-bar">
      <span class="sb-ico">${iconSearch()}</span>
      <input id="qInput" type="search" placeholder="Имя, навык или сфера…" autocomplete="off">
      <div class="suggest hidden" id="suggest"></div>
    </div>
    <div class="filter-row">
      <div class="chip-tags" id="chipTags"></div>
      <label class="sort-sel">Сортировка
        <select id="sortSel">
          <option value="rating">по рейтингу</option>
          <option value="experience">по опыту</option>
          <option value="price">по цене ↑</option>
          <option value="name">по имени</option>
        </select>
      </label>
    </div>
    <div class="result-list" id="resultList"></div>`;

  const qInput = body.querySelector('#qInput');
  const suggest = body.querySelector('#suggest');
  const sortSel = body.querySelector('#sortSel');
  sortSel.value = searchFilters.sort;

  const allTags = [...new Set(state.candidates.flatMap((p) => p.skills))].sort((a, b) => a.localeCompare(b, 'ru'));

  // живые подсказки (теги + люди) — стиль action-search-bar
  const renderSuggest = () => {
    const q = qInput.value.trim().toLowerCase();
    if (!q) { suggest.classList.add('hidden'); return; }
    const tagHits = allTags.filter((t) => t.toLowerCase().includes(q) && !searchFilters.tags.has(t)).slice(0, 5);
    const peopleHits = state.candidates.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4);
    if (!tagHits.length && !peopleHits.length) { suggest.classList.add('hidden'); return; }
    suggest.innerHTML =
      tagHits.map((t) => `<button class="sug" data-tag="${esc(t)}">${iconTagMini()}<span>${esc(t)}</span><small>тег</small></button>`).join('') +
      peopleHits.map((p) => `<button class="sug" data-id="${p.id}"><span class="sug-av" style="${avStyle(p)}">${avText(p)}</span><span>${esc(p.name)}</span><small>${roleLabel(p.role)}</small></button>`).join('');
    suggest.classList.remove('hidden');
    suggest.querySelectorAll('[data-tag]').forEach((b) => (b.onclick = () => { searchFilters.tags.add(b.dataset.tag); qInput.value = ''; suggest.classList.add('hidden'); paintFilters(); paintResults(); }));
    suggest.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openUserProfile(+b.dataset.id, 'deck')));
  };

  const paintFilters = () => {
    const chips = body.querySelector('#chipTags');
    const active = [...searchFilters.tags].map((t) => `<button class="fchip on" data-rm="${esc(t)}">${esc(t)} <span class="x">×</span></button>`).join('');
    const top = allTags.filter((t) => !searchFilters.tags.has(t)).slice(0, 8).map((t) => `<button class="fchip" data-add="${esc(t)}">${esc(t)}</button>`).join('');
    chips.innerHTML = active + top;
    chips.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { searchFilters.tags.add(b.dataset.add); paintFilters(); paintResults(); }));
    chips.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { searchFilters.tags.delete(b.dataset.rm); paintFilters(); paintResults(); }));
  };

  const paintResults = () => {
    const list = body.querySelector('#resultList');
    let items = state.candidates.slice();
    const q = qInput.value.trim().toLowerCase();
    if (searchFilters.tags.size) items = items.filter((p) => [...searchFilters.tags].every((t) => p.skills.includes(t)));
    if (q) items = items.filter((p) => (p.name + ' ' + p.field + ' ' + p.skills.join(' ')).toLowerCase().includes(q));
    const s = searchFilters.sort;
    items.sort((a, b) => {
      if (s === 'name') return a.name.localeCompare(b.name, 'ru');
      if (s === 'price') return (a.price || 0) - (b.price || 0);
      if (s === 'experience') return (b.experience || 0) - (a.experience || 0);
      return (b.rating || 0) - (a.rating || 0); // rating
    });
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><h3>Никого не нашлось</h3><p>Попробуй убрать часть фильтров или изменить запрос.</p></div>';
      return;
    }
    list.innerHTML = '';
    items.forEach((p) => list.appendChild(listRow(p)));
  };

  qInput.oninput = () => { renderSuggest(); paintResults(); };
  qInput.onblur = () => setTimeout(() => suggest.classList.add('hidden'), 150);
  sortSel.onchange = () => { searchFilters.sort = sortSel.value; paintResults(); };
  paintFilters();
  paintResults();
}

function listRow(p) {
  const tags = p.skills.slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const row = el(`
    <div class="lrow">
      <div class="lrow-av" style="${avStyle(p)}">${avText(p)}</div>
      <div class="lrow-main">
        <div class="lrow-name">${esc(p.name)} ${vCheck(p)} ${proBadge(p)}</div>
        ${p.headline ? `<div class="lrow-headline">${esc(p.headline)}</div>` : ''}
        <div class="lrow-meta">
          ${p.experience ? `<span>${p.experience} лет</span>` : ''}
          ${p.role === 'mentor' ? `<span>${esc(money(p.price))}</span>` : ''}
          ${p.rating ? `<span class="lrow-rate">★ ${p.rating}</span>` : ''}
        </div>
        <div class="tags">${tags}</div>
      </div>
      <div class="lrow-actions">
        <button class="btn btn-ghost btn-sm" data-act="profile">Профиль</button>
        <button class="btn btn-primary btn-sm" data-act="like">Интересно</button>
      </div>
    </div>`);
  row.querySelector('[data-act="profile"]').onclick = () => openUserProfile(p.id, 'deck');
  row.querySelector('[data-act="like"]').onclick = (e) => {
    sendSwipe(p, 'like');
    const b = e.currentTarget;
    b.textContent = 'Отправлено'; b.disabled = true;
  };
  return row;
}

function paintDeck() {
  const deck = document.getElementById('deck');
  const actions = document.getElementById('deckActions');
  deck.innerHTML = '';
  actions.innerHTML = '';

  const remaining = state.deck.slice(state.deckIndex);
  if (remaining.length === 0) {
    deck.innerHTML = `
      <div class="empty-state">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <h3>Профили закончились</h3>
        <p>Ты просмотрел всех на сегодня. Загляни в «Мэтчи» или зайди позже — появятся новые люди.</p>
      </div>`;
    return;
  }

  // рисуем максимум 3 карты в стопке (верхняя — последняя в DOM)
  const stack = remaining.slice(0, 3).reverse();
  stack.forEach((u, i) => {
    const depth = stack.length - 1 - i; // 0 = верхняя
    const cardEl = buildCard(u);
    cardEl.style.transform = `scale(${1 - depth * 0.04}) translateY(${depth * 12}px)`;
    cardEl.style.zIndex = String(10 - depth);
    if (depth === 0) enableDrag(cardEl, u);
    deck.appendChild(cardEl);
  });

  actions.appendChild(roundBtn('skip', 'Пропустить', () => triggerSwipe('skip')));
  actions.appendChild(roundBtn('info', 'Подробнее', () => openUserProfile(remaining[0].id, 'deck')));
  actions.appendChild(roundBtn('like', 'Интересно', () => triggerSwipe('like')));
}

function buildCard(u) {
  const grad = `linear-gradient(135deg, ${avColor(u)}, ${shade(avColor(u))})`;
  const tags = u.skills.slice(0, 6).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  return el(`
    <article class="card" data-id="${u.id}">
      <span class="stamp like">ИНТЕРЕСНО</span>
      <span class="stamp nope">ПРОПУСК</span>
      <div class="card-banner" style="background:${grad}">
        <span class="role-chip">${roleLabel(u.role)}</span>
        ${u.experience ? `<div class="exp-badge" title="${u.experience} лет опыта"><b>${u.experience}</b><small>лет</small></div>` : ''}
        <div class="card-avatar" style="${avStyle(u)}">${avText(u)}</div>
      </div>
      <div class="card-body">
        <h3>${esc(u.name)} ${vCheck(u)} ${proBadge(u)}</h3>
        ${u.headline ? `<div class="card-headline">${esc(u.headline)}</div>` : ''}
        <div class="card-meta">
          ${u.field ? `<span>${iconTag()} ${esc(u.field)}</span>` : ''}
          ${u.org ? `<span>${iconBag()} ${esc(u.org)}</span>` : ''}
          ${u.location ? `<span>${iconPin()} ${esc(u.location)}</span>` : ''}
          ${u.role === 'mentor' ? `<span class="price-chip">${iconCoin()} ${esc(money(u.price))}</span>` : ''}
        </div>
        ${u.bio ? `<p class="card-bio">${esc(u.bio)}</p>` : ''}
        ${u.goal ? `<div class="card-goal"><b>Цель:</b> ${esc(u.goal)}</div>` : ''}
        ${tags ? `<div class="tags">${tags}</div>` : ''}
      </div>
    </article>`);
}

function roundBtn(kind, label, onClick) {
  const icons = {
    skip: '<path d="M18 6 6 18M6 6l12 12"/>',
    like: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  };
  const b = el(`<button class="round-btn ${kind}" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" fill="${kind === 'like' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${icons[kind]}</svg></button>`);
  b.onclick = onClick;
  return b;
}

/* ---- drag / swipe gestures ---- */
function enableDrag(card, user) {
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
  const likeStamp = card.querySelector('.stamp.like');
  const nopeStamp = card.querySelector('.stamp.nope');

  const onDown = (e) => {
    if (e.target.closest('.card-body') && e.target.closest('.card-body').scrollHeight > e.target.closest('.card-body').clientHeight && e.type === 'touchstart') {
      // allow scrolling bio on touch
    }
    dragging = true;
    const p = point(e);
    startX = p.x; startY = p.y;
    card.style.transition = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const p = point(e);
    dx = p.x - startX; dy = p.y - startY;
    if (Math.abs(dx) > 6 && e.cancelable) e.preventDefault();
    const rot = dx / 18;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    likeStamp.style.opacity = dx > 0 ? Math.min(dx / 90, 1) : 0;
    nopeStamp.style.opacity = dx < 0 ? Math.min(-dx / 90, 1) : 0;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    card.style.transition = 'transform 0.3s var(--ease)';
    const threshold = 100;
    if (dx > threshold) flyOut(card, 'like');
    else if (dx < -threshold) flyOut(card, 'skip');
    else {
      card.style.transform = '';
      likeStamp.style.opacity = 0; nopeStamp.style.opacity = 0;
    }
  };
  card.addEventListener('mousedown', onDown);
  card.addEventListener('touchstart', onDown, { passive: true });
}

const point = (e) => (e.touches && e.touches[0]) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };

function triggerSwipe(direction) {
  const card = document.querySelector('#deck .card[style*="z-index: 10"]') || document.querySelector('#deck .card:last-child');
  if (card) flyOut(card, direction);
}

function flyOut(card, direction) {
  const user = state.deck[state.deckIndex];
  card.style.transition = 'transform 0.45s var(--ease), opacity 0.45s var(--ease)';
  const offX = direction === 'like' ? window.innerWidth : -window.innerWidth;
  card.style.transform = `translate(${offX}px, -60px) rotate(${direction === 'like' ? 22 : -22}deg)`;
  card.style.opacity = '0';
  sendSwipe(user, direction);
  setTimeout(() => { state.deckIndex += 1; paintDeck(); }, 280);
}

async function sendSwipe(user, direction) {
  try {
    const res = await api('/swipe', { method: 'POST', body: { target_id: user.id, direction } });
    if (res.match) { await refreshMatches(); showMatchModal(res.user); }
  } catch (err) { /* swipe всё равно засчитан локально */ }
}

/* ===================================================================
   MATCH MODAL & PROFILE MODAL
=================================================================== */
function showMatchModal(other) {
  const meGrad = avColor(state.me), otGrad = avColor(other);
  const m = el(`
    <div class="modal-scrim">
      <div class="match-modal" role="dialog" aria-modal="true" aria-label="Это мэтч">
        <h2>Это мэтч</h2>
        <p>Вы с ${esc(other.name.split(' ')[0])} понравились друг другу.</p>
        <div class="match-avatars">
          <div class="av" style="${avStyle(state.me)}">${avText(state.me)}</div>
          <span class="link" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg></span>
          <div class="av" style="${avStyle(other)}">${avText(other)}</div>
        </div>
        <div class="row">
          <button class="btn btn-ghost" data-act="later">Свайпать дальше</button>
          <button class="btn btn-primary" data-act="chat">Написать</button>
        </div>
      </div>
    </div>`);
  modalRoot.appendChild(m);
  const close = () => m.remove();
  m.querySelector('[data-act="later"]').onclick = close;
  m.querySelector('[data-act="chat"]').onclick = async () => {
    close();
    const match = state.matches.find((x) => x.user.id === other.id);
    if (match) { go('matches'); setTimeout(() => openChat(match), 50); }
  };
  m.onclick = (e) => { if (e.target === m) close(); };
  document.addEventListener('keydown', function esc2(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc2); } });
}

/* ===================================================================
   ПУБЛИЧНЫЙ ПРОФИЛЬ (инфа · портфолио · отзывы)
=================================================================== */
let returnView = 'deck';

const stars = (n) => {
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<svg class="star ${i <= Math.round(n) ? 'on' : ''}" viewBox="0 0 24 24"><path d="m12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.8 5.8 21l1.4-7L2 9.3l7-.8z"/></svg>`;
  return s;
};

function reviewCard(r) {
  return `
    <div class="rev-card">
      <div class="rev-stars">${stars(r.rating)}</div>
      <p>«${esc(r.body)}»</p>
      <div class="rev-author">
        <div class="av" style="${avStyle({ name: r.author_name, avatar: r.author_avatar })}">${avText({ name: r.author_name, avatar: r.author_avatar })}</div>
        <div><b>${esc(r.author_name)}</b><small>${roleLabel(r.author_role)}</small></div>
      </div>
    </div>`;
}

function reviewsBlock(reviews) {
  if (!reviews.length) return `<p class="muted-note">Пока нет отзывов. Будь первым!</p>`;
  // вертикальный marquee в стиле testimonials-columns (дублируем для бесшовности)
  const col = (items) => `<div class="tcol"><div class="tcol-track">${items.map(reviewCard).join('')}${items.map(reviewCard).join('')}</div></div>`;
  if (reviews.length <= 2) return `<div class="tcols static">${reviews.map(reviewCard).join('')}</div>`;
  const mid = Math.ceil(reviews.length / 2);
  return `<div class="tcols">${col(reviews.slice(0, mid))}${col(reviews.slice(mid))}</div>`;
}

async function openUserProfile(id, back) {
  returnView = back || 'deck';
  app.innerHTML = '<div class="spinner" role="status"></div>';
  let u;
  try { u = await api('/users/' + id); } catch (e) { toast(e.message); go(returnView); return; }

  const grad = `linear-gradient(135deg, ${avColor(u)}, ${shade(avColor(u))})`;
  const tags = u.skills.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const portfolio = u.portfolio.length
    ? u.portfolio.map((p) => `
        <div class="port-item">
          <div class="port-main"><b>${esc(p.title)}</b>${p.descr ? `<p>${esc(p.descr)}</p>` : ''}</div>
          ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener" class="port-link">${iconLink()}</a>` : ''}
        </div>`).join('')
    : `<p class="muted-note">Портфолио пока пустое.</p>`;

  const view = el(`
    <div class="view up-wrap">
      <button class="btn btn-ghost up-back">${iconBack()} Назад</button>
      <div class="up-card">
        <div class="up-head" style="background:${grad}">
          <div class="up-av" style="${avStyle(u)}">${avText(u)}</div>
        </div>
        <div class="up-body">
          <div class="up-name"><h2>${esc(u.name)} ${vCheck(u)}</h2><span class="role-chip" style="position:static;color:#fff;background:rgba(0,0,0,0.3)">${roleLabel(u.role)}</span></div>
          ${u.headline ? `<p class="up-headline">${esc(u.headline)}</p>` : ''}
          <div class="up-stats">
            ${u.experience ? `<div class="up-stat"><b>${u.experience}</b><span>лет опыта</span></div>` : ''}
            ${u.role === 'mentor' ? `<div class="up-stat"><b>${u.price ? new Intl.NumberFormat('ru-RU').format(u.price) + ' ₽' : 'Free'}</b><span>${u.price ? 'за час' : 'бесплатно'}</span></div>` : ''}
            <div class="up-stat"><b>${u.rating || '—'}</b><span>рейтинг</span></div>
            <div class="up-stat"><b>${u.reviews.length}</b><span>отзывов</span></div>
          </div>
          <div class="card-meta" style="margin:16px 0">
            ${u.field ? `<span>${iconTag()} ${esc(u.field)}</span>` : ''}
            ${u.org ? `<span>${iconBag()} ${esc(u.org)}</span>` : ''}
            ${u.location ? `<span>${iconPin()} ${esc(u.location)}</span>` : ''}
          </div>
          ${u.bio ? `<p class="up-bio">${esc(u.bio)}</p>` : ''}
          ${u.goal ? `<div class="card-goal"><b>Цель:</b> ${esc(u.goal)}</div>` : ''}
          ${tags ? `<div class="tags" style="margin-top:14px">${tags}</div>` : ''}

          <h3 class="up-section">Портфолио</h3>
          <div class="port-list">${portfolio}</div>

          <div class="up-section-row">
            <h3 class="up-section">Отзывы</h3>
            <button class="btn btn-ghost btn-sm" id="addReview">Оставить отзыв</button>
          </div>
          <div id="reviewsArea">${reviewsBlock(u.reviews)}</div>
        </div>
      </div>
    </div>`);
  app.innerHTML = '';
  app.appendChild(view);
  view.querySelector('.up-back').onclick = () => go(returnView);
  view.querySelector('#addReview').onclick = () => reviewForm(u);
}

function reviewForm(u) {
  if (u.id === state.me.id) { toast('Нельзя оставить отзыв самому себе'); return; }
  const m = el(`
    <div class="modal-scrim">
      <div class="match-modal" role="dialog" aria-modal="true" style="text-align:left">
        <h2 style="font-size:22px;color:var(--ink)">Отзыв о ${esc(u.name.split(' ')[0])}</h2>
        <div class="rate-pick" id="ratePick">${[1,2,3,4,5].map((i)=>`<button data-v="${i}" type="button"><svg class="star" viewBox="0 0 24 24"><path d="m12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.8 5.8 21l1.4-7L2 9.3l7-.8z"/></svg></button>`).join('')}</div>
        <div class="field"><textarea id="revBody" placeholder="Чем помог ментор? Как прошло общение?"></textarea></div>
        <div class="row"><button class="btn btn-ghost" data-close>Отмена</button><button class="btn btn-primary" id="revSend">Отправить</button></div>
      </div>
    </div>`);
  modalRoot.appendChild(m);
  let rating = 5;
  const paintStars = () => m.querySelectorAll('#ratePick button').forEach((b) => b.classList.toggle('on', +b.dataset.v <= rating));
  m.querySelectorAll('#ratePick button').forEach((b) => (b.onclick = () => { rating = +b.dataset.v; paintStars(); }));
  paintStars();
  const close = () => m.remove();
  m.querySelector('[data-close]').onclick = close;
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelector('#revSend').onclick = async () => {
    const body = m.querySelector('#revBody').value.trim();
    if (!body) { toast('Напиши пару слов'); return; }
    try {
      await api(`/users/${u.id}/reviews`, { method: 'POST', body: { rating, body } });
      close(); toast('Спасибо за отзыв!'); openUserProfile(u.id, returnView);
    } catch (e) { toast(e.message); }
  };
}

/* ===================================================================
   MATCHES + CHAT
=================================================================== */
async function refreshMatches() {
  try {
    state.matches = await api('/matches');
    const badge = document.getElementById('matchBadge');
    if (state.matches.length) { badge.textContent = state.matches.length; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  } catch (e) {}
}

async function renderMatches() {
  await refreshMatches();
  const view = el(`
    <div class="view">
      <div class="list-head"><h2>Твои мэтчи</h2><p>Здесь все, с кем у тебя взаимный интерес. Напиши первым!</p></div>
      <div id="matchList"></div>
    </div>`);
  app.innerHTML = '';
  app.appendChild(view);
  const list = view.querySelector('#matchList');

  if (!state.matches.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
        <h3>Пока нет мэтчей</h3>
        <p>Свайпай профили во вкладке «Поиск» — как только интерес окажется взаимным, человек появится здесь.</p>
        <button class="btn btn-primary" style="margin-top:18px" onclick="document.querySelector('[data-view=deck]').click()">Перейти к поиску</button>
      </div>`;
    return;
  }

  const grid = el('<div class="match-grid"></div>');
  state.matches.forEach((mt) => {
    const u = mt.user;
    const card = el(`
      <button class="match-card">
        <div class="av" style="${avStyle(u)}">${avText(u)}</div>
        <div class="info">
          <b>${esc(u.name)} ${vCheck(u)}</b>
          <div class="ml">${esc(mt.last_message || u.headline || roleLabel(u.role))}</div>
        </div>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>`);
    card.onclick = () => openChat(mt);
    grid.appendChild(card);
  });
  list.appendChild(grid);
}

async function openChat(mt) {
  const u = mt.user;
  const view = el(`
    <div class="view">
      <div class="chat">
        <div class="chat-head">
          <button class="back" aria-label="Назад">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button class="chat-peer" id="chatPeer" aria-label="Открыть профиль">
            <div class="av" style="${avStyle(u)}">${avText(u)}</div>
            <div><b>${esc(u.name)} ${vCheck(u)}</b><div style="font-size:13px;color:var(--gray)">${esc(u.headline || roleLabel(u.role))}</div></div>
          </button>
        </div>
        <div class="chat-log" id="chatLog"><div class="spinner"></div></div>
        <form class="chat-form" id="chatForm">
          <input name="body" placeholder="Напиши сообщение…" autocomplete="off" maxlength="1000" />
          <button class="btn btn-primary" type="submit" aria-label="Отправить">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>
          </button>
        </form>
      </div>
    </div>`);
  app.innerHTML = '';
  app.appendChild(view);
  view.querySelector('.back').onclick = () => renderMatches();
  view.querySelector('#chatPeer').onclick = () => openUserProfile(u.id, 'matches');

  const log = view.querySelector('#chatLog');
  const paint = (msgs) => {
    if (!msgs.length) { log.innerHTML = `<div class="chat-empty">Пока пусто. Напиши первым — поздоровайся с ${esc(u.name.split(' ')[0])}.</div>`; return; }
    log.innerHTML = '';
    msgs.forEach((msg) => {
      const mine = msg.sender_id === state.me.id;
      log.appendChild(el(`<div class="bubble ${mine ? 'me' : 'them'}">${esc(msg.body)}</div>`));
    });
    log.scrollTop = log.scrollHeight;
  };

  try { paint(await api('/messages/' + mt.match_id)); } catch (e) { log.innerHTML = ''; }

  view.querySelector('#chatForm').onsubmit = async (e) => {
    e.preventDefault();
    const input = e.target.body;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    log.querySelector('.chat-empty')?.remove();
    log.appendChild(el(`<div class="bubble me">${esc(text)}</div>`));
    log.scrollTop = log.scrollHeight;
    try { await api('/messages/' + mt.match_id, { method: 'POST', body: { body: text } }); }
    catch (err) { toast(err.message); }
  };
}

/* ===================================================================
   ТОП МЕНТОРОВ МЕСЯЦА
=================================================================== */
async function renderTop() {
  app.innerHTML = '<div class="spinner" role="status"></div>';
  let list;
  try { list = await api('/top'); } catch (e) { toast(e.message); return; }
  const medals = ['🥇', '🥈', '🥉'];
  const rows = list.map((u, i) => `
    <button class="top-row${i < 3 ? ' podium' : ''}" data-id="${u.id}">
      <div class="top-pos">${i < 3 ? `<span class="medal">${medals[i]}</span>` : (i + 1)}</div>
      <div class="lrow-av" style="${avStyle(u)}">${avText(u)}</div>
      <div class="lrow-main">
        <div class="lrow-name">${esc(u.name)} ${vCheck(u)} ${proBadge(u)}</div>
        <div class="lrow-meta">
          ${u.rating ? `<span class="lrow-rate">★ ${u.rating}</span>` : ''}
          <span>${u.reviews_count || 0} отзывов</span>
          ${u.completed_tasks ? `<span>${u.completed_tasks} заданий</span>` : ''}
          ${u.field ? `<span>${esc(u.field)}</span>` : ''}
        </div>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>`).join('');
  const view = el(`
    <div class="view">
      <div class="list-head" style="text-align:center">
        <h2>Топ менторов месяца</h2>
        <p>Рейтинг по отзывам, оценкам и выполненным заданиям. Обновляется каждый месяц.</p>
      </div>
      <div class="top-list">${rows || '<p class="muted-note" style="text-align:center">Пока пусто.</p>'}</div>
    </div>`);
  app.innerHTML = '';
  app.appendChild(view);
  view.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openUserProfile(+b.dataset.id, 'top')));
}

/* ===================================================================
   ПОДПИСКА PRO
=================================================================== */
function openSubscribe() {
  const on = state.me.subscribed;
  const m = el(`
    <div class="modal-scrim">
      <div class="match-modal sub-modal" role="dialog" aria-modal="true" style="text-align:left;max-width:420px">
        <div class="sub-head"><span class="pro-badge lg">PRO</span><h2 style="color:var(--ink);font-size:24px;margin-top:10px">${on ? 'PRO активен' : 'MentorMatch PRO'}</h2></div>
        <p style="color:var(--gray);margin:6px 0 18px">${on ? 'Спасибо, что поддерживаешь платформу! Все преимущества включены.' : 'Больше внимания к анкете и никаких лимитов.'}</p>
        <ul class="sub-perks">
          <li>${iconCheckSm()} Анкета продвигается выше в поиске</li>
          <li>${iconCheckSm()} Безлимитное портфолио (на бесплатном — до 3)</li>
          <li>${iconCheckSm()} Бейдж PRO рядом с именем</li>
          <li>${iconCheckSm()} Приоритет в подборках и топе</li>
        </ul>
        <div class="sub-price">${on ? '' : '<b>299 ₽</b> / месяц'}</div>
        <div class="row">
          <button class="btn btn-ghost" data-close>${on ? 'Закрыть' : 'Не сейчас'}</button>
          <button class="btn ${on ? 'btn-ghost' : 'btn-primary'}" id="subBtn">${on ? 'Отключить PRO' : 'Оформить PRO'}</button>
        </div>
      </div>
    </div>`);
  modalRoot.appendChild(m);
  const close = () => m.remove();
  m.querySelector('[data-close]').onclick = close;
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelector('#subBtn').onclick = async () => {
    try {
      state.me = await api('/subscribe', { method: 'POST', body: { on: !on } });
      close();
      toast(on ? 'PRO отключён' : 'PRO оформлен — анкета продвигается!');
      renderProfile();
    } catch (e) { toast(e.message); }
  };
}

function iconCheckSm() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'; }

/* ===================================================================
   PROFILE
=================================================================== */
async function renderProfile() {
  const u = state.me;
  let full = { portfolio: [], reviews: [], rating: 0 };
  app.innerHTML = '<div class="spinner" role="status"></div>';
  try { full = await api('/users/' + u.id); } catch (e) {}

  const isMentor = u.role === 'mentor';
  const portfolio = full.portfolio.map((p) => `
    <div class="port-item">
      <div class="port-main"><b>${esc(p.title)}</b>${p.descr ? `<p>${esc(p.descr)}</p>` : ''}</div>
      <button class="port-del" data-del="${p.id}" aria-label="Удалить">${iconTrash()}</button>
    </div>`).join('') || `<p class="muted-note">Пока пусто. Добавь первый проект ниже.</p>`;

  const view = el(`
    <div class="view">
      <div class="list-head"><h2>Мой профиль</h2><p>Так тебя видят другие. Держи актуальным — это влияет на мэтчи.</p></div>
      <div class="profile-card">
        <div class="profile-top">
          <div class="av-edit">
            <div class="av" style="${avStyle(u)}">${avText(u)}</div>
            <button class="av-upload" id="avBtn" aria-label="Загрузить аватар">${iconCamera()}</button>
            <input type="file" accept="image/*" id="avFile" hidden>
          </div>
          <div>
            <h2>${esc(u.name)} ${vCheck(u)}</h2>
            <span class="role-chip" style="position:static;background:var(--primary-soft);color:var(--primary)">${roleLabel(u.role)}</span>
            ${u.verified ? '' : isMentor ? '<span class="muted-note" style="margin-left:8px">не верифицирован</span>' : ''}
          </div>
        </div>
        <form id="profForm">
          <div class="field"><label>Имя</label><input name="name" value="${esc(u.name)}"></div>
          <div class="field"><label>О себе одной строкой</label><input name="headline" value="${esc(u.headline)}"></div>
          <div class="grid-2">
            <div class="field"><label>Сфера</label><input name="field" value="${esc(u.field)}"></div>
            <div class="field"><label>Универ / компания</label><input name="org" value="${esc(u.org)}"></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>Локация</label><input name="location" value="${esc(u.location)}"></div>
            <div class="field"><label>Навыки (через запятую)</label><input name="skills" value="${esc(u.skills.join(', '))}"></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>Опыт, лет</label><input name="experience" type="number" min="0" max="60" value="${u.experience || 0}"></div>
            ${isMentor ? `<div class="field"><label>Цена, ₽/час</label><input name="price" type="number" min="0" step="100" value="${u.price || 0}"><div class="help">0 — бесплатно</div></div>` : ''}
          </div>
          <div class="field"><label>Цель</label><input name="goal" value="${esc(u.goal)}"></div>
          <div class="field"><label>О себе</label><textarea name="bio">${esc(u.bio)}</textarea></div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button class="btn btn-primary" type="submit">Сохранить</button>
            <button class="btn btn-ghost" type="button" id="logoutBtn">Выйти</button>
          </div>
        </form>

        <h3 class="up-section">Портфолио</h3>
        <div class="port-list" id="portList">${portfolio}</div>
        <form id="portForm" class="port-form">
          <input name="title" placeholder="Название проекта" required>
          <input name="descr" placeholder="Кратко о проекте">
          <input name="link" placeholder="Ссылка (необязательно)">
          <button class="btn btn-ghost" type="submit">Добавить</button>
        </form>

        ${full.reviews.length ? `<h3 class="up-section">Отзывы о тебе · ${full.rating}★</h3><div id="myReviews">${reviewsBlock(full.reviews)}</div>` : ''}
      </div>
    </div>`);
  app.innerHTML = '';
  app.appendChild(view);

  // загрузка аватара
  const avFile = view.querySelector('#avFile');
  view.querySelector('#avBtn').onclick = () => avFile.click();
  avFile.onchange = () => {
    const f = avFile.files[0];
    if (!f) return;
    fileToAvatar(f, async (dataUrl) => {
      try {
        state.me = await api('/me', { method: 'PUT', body: { avatar: dataUrl } });
        toast('Аватар обновлён');
        renderProfile();
      } catch (e) { toast(e.message); }
    });
  };

  view.querySelector('#profForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Сохраняем…';
    try {
      const body = Object.fromEntries(new FormData(e.target).entries());
      state.me = await api('/me', { method: 'PUT', body });
      toast('Профиль обновлён');
      renderProfile();
    } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Сохранить'; }
  };

  // портфолио: добавить / удалить
  view.querySelector('#portForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try { await api('/portfolio', { method: 'POST', body }); renderProfile(); }
    catch (err) { toast(err.message); }
  };
  view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    try { await api('/portfolio/' + b.dataset.del, { method: 'DELETE' }); renderProfile(); }
    catch (err) { toast(err.message); }
  }));

  view.querySelector('#logoutBtn').onclick = async () => {
    await api('/logout', { method: 'POST' });
    state.me = null; state.matches = [];
    topbar.classList.add('hidden');
    footer.classList.add('hidden');
    renderAuth('login');
  };
}

/* уменьшаем изображение до 256px и отдаём data URL (JPEG) */
function fileToAvatar(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const S = 256, min = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, S, S);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function iconCamera() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'; }
function iconTrash() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'; }

/* ---------- inline SVG icons + color util ---------- */
function iconTag() { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>'; }
function iconBag() { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; }
function iconPin() { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'; }
function iconCoin() { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9h4.5a2 2 0 0 1 0 4H9m0 0h6M9 9v8"/></svg>'; }
function iconLink() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg>'; }
function iconBack() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'; }
function iconCards() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="16" rx="2"/><path d="M3 7v10"/><path d="M21 7v10"/></svg>'; }
function iconList() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>'; }
function iconSearch() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'; }
function iconTagMini() { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4.8A2 2 0 0 1 4.8 2.8H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1"/></svg>'; }

function shade(hex) {
  // затемняем цвет для градиента
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * 0.7); g = Math.round(g * 0.7); b = Math.round(b * 0.7);
  return `rgb(${r},${g},${b})`;
}
