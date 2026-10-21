import { api, auth } from './api.js';
import { fmtDateLong, fmtWeekday } from './format.js';
import { icon, logo } from './icons.js';
import { alertToast, errorHtml, loadingHtml, toast } from './ui.js';
import * as login from './pages/login.js';
import * as dashboard from './pages/dashboard.js';
import * as alertas from './pages/alerts.js';
import * as relatorios from './pages/reports.js';
import * as dispositivo from './pages/device.js';
import * as configuracoes from './pages/settings.js';

const PAGES = {
  dashboard: { module: dashboard, label: 'Dashboard', short: 'Início', icon: 'home', live: true, alwaysRefresh: true },
  alertas: { module: alertas, label: 'Alertas', short: 'Alertas', icon: 'bell', live: true },
  relatorios: { module: relatorios, label: 'Relatórios', short: 'Relatórios', icon: 'chart' },
  dispositivo: { module: dispositivo, label: 'Meu dispositivo', short: 'Aparelho', icon: 'gauge' },
  configuracoes: { module: configuracoes, label: 'Configurações', short: 'Ajustes', icon: 'sliders' },
};

const POLL_MS = 15_000;
const root = document.getElementById('app');

const state = {
  me: null,          // { user, settings, demoMode }
  latestAlertId: null,
  shell: null,
  renderId: 0,
  pollTimer: null,
};

const currentPage = () => {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  return PAGES[id] ? id : 'dashboard';
};

// ===== Estrutura (menu lateral no computador, barra inferior no celular) =====
function buildShell() {
  const navLinks = (short) =>
    Object.entries(PAGES)
      .map(([id, p]) => `<a href="#/${id}" data-page="${id}">${icon(p.icon)}<span>${short ? p.short : p.label}</span>${id === 'alertas' ? '<span class="badge" data-badge hidden></span>' : ''}</a>`)
      .join('');

  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <a class="brand" href="#/dashboard">${logo()}<div><div class="brand-name">Got<b>Alert</b></div><span class="brand-tag">Monitoramento inteligente</span></div></a>
        <nav class="nav" aria-label="Menu principal">${navLinks(false)}</nav>
        <div class="sidebar-foot">
          <p>Água é vida.<br>Vamos cuidar!</p>
          <button class="logout" data-logout>${icon('logout')} Sair</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="topbar-title"><h1 data-title></h1><p data-subtitle></p></div>
          <div class="topbar-date">${icon('calendar')}<div><strong data-date></strong><span data-time></span></div></div>
          <a class="bell" href="#/alertas" aria-label="Alertas">${icon('bell')}<span class="badge" data-badge hidden></span></a>
          <a class="avatar" href="#/configuracoes" data-avatar aria-label="Minha conta"></a>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>
    <nav class="tabbar" aria-label="Menu">${navLinks(true)}</nav>`;

  root.querySelector('[data-logout]').addEventListener('click', logout);
  state.shell = {
    content: root.querySelector('#content'),
    title: root.querySelector('[data-title]'),
    subtitle: root.querySelector('[data-subtitle]'),
  };
  updateClock();
  updateUserChip();
}

function updateClock() {
  if (!state.shell) return;
  const now = Date.now();
  root.querySelector('[data-date]').textContent = fmtDateLong(now);
  root.querySelector('[data-time]').textContent = `${fmtWeekday(now)} · ${new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function updateUserChip() {
  const name = state.me?.user.name ?? '';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  const avatar = root.querySelector('[data-avatar]');
  if (avatar) avatar.textContent = initials || '?';
}

function setBadge(count) {
  for (const b of root.querySelectorAll('[data-badge]')) {
    b.textContent = count > 9 ? '9+' : String(count);
    b.hidden = !count;
  }
}

// ===== Navegação =====
async function render({ silent = false } = {}) {
  if (!auth.token) return showLogin();

  if (!state.me) {
    root.innerHTML = loadingHtml;
    try {
      state.me = await api.get('/me');
    } catch (err) {
      if (!auth.token) return showLogin();
      root.innerHTML = errorHtml(err.message);
      return;
    }
  }
  if (!state.shell) buildShell();

  const id = currentPage();
  const page = PAGES[id];
  for (const a of root.querySelectorAll('[data-page]')) a.classList.toggle('active', a.dataset.page === id);
  const head = page.module.header?.(state.me) ?? {};
  state.shell.title.textContent = head.title ?? page.label;
  state.shell.subtitle.textContent = head.subtitle ?? '';
  document.title = `${page.label} · GotAlert`;

  const renderId = ++state.renderId;
  const container = document.createElement('div');
  container.style.display = 'contents';
  if (!silent) {
    state.shell.content.innerHTML = loadingHtml;
    window.scrollTo(0, 0);
  }

  try {
    await page.module.render(container, ctx);
    if (renderId !== state.renderId) return; // o usuário já foi para outra tela
    state.shell.content.replaceChildren(container);
  } catch (err) {
    if (renderId !== state.renderId || !auth.token) return;
    if (!silent) state.shell.content.innerHTML = errorHtml(err.message);
  }
}

const ctx = {
  get me() {
    return state.me;
  },
  setMe(me) {
    state.me = { ...state.me, ...me };
    updateUserChip();
  },
  refresh: () => render({ silent: true }),
  checkAlerts: () => poll(),
  notificationsAvailable: () => 'Notification' in window,
};

function showLogin() {
  state.me = null;
  state.shell = null;
  state.latestAlertId = null;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
  document.title = 'Entrar · GotAlert';
  login.render(root, {
    onLogin: (token) => {
      auth.set(token);
      if (!location.hash || location.hash === '#/') location.hash = '#/dashboard';
      start();
    },
  });
}

function logout() {
  auth.set(null);
  showLogin();
}

// ===== Alertas em tempo (quase) real =====
async function poll() {
  if (!auth.token) return;
  try {
    const status = await api.get('/alerts/status');
    setBadge(status.unread);

    const firstRun = state.latestAlertId == null;
    const previous = state.latestAlertId;
    state.latestAlertId = status.latestId;
    const hasNew = !firstRun && status.latestId > previous;

    if (hasNew) {
      const { alerts } = await api.get(`/alerts?after=${previous}&limit=5`);
      for (const alert of alerts.reverse()) announce(alert);
    }
    // O dashboard acompanha o consumo ao vivo; a tela de alertas só muda quando chega alerta novo.
    const page = PAGES[currentPage()];
    if (!firstRun && (page.alwaysRefresh || (hasNew && page.live))) render({ silent: true });
  } catch {
    /* sem conexão: tenta de novo no próximo ciclo */
  }
  updateClock();
}

async function announce(alert) {
  alertToast(alert);
  const s = state.me?.settings;
  if (!s?.notifyAnomaly || !s?.notifyPush) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = { body: alert.message, icon: '/img/logo.svg', badge: '/img/logo.svg', tag: `alert-${alert.id}` };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(alert.title, options);
    else new Notification(alert.title, options);
  } catch {
    /* alguns navegadores bloqueiam notificações fora de HTTPS */
  }
}

async function start() {
  await render();
  if (!auth.token) return;
  await poll();
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(poll, POLL_MS);
}

window.addEventListener('hashchange', () => render());
window.addEventListener('gotalert:logout', () => {
  toast('Sua sessão expirou. Entre novamente.', 'error');
  showLogin();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

start();
