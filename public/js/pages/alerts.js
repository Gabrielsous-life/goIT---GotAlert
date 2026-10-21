import { api } from '../api.js';
import { esc, fmtLiters, fmtTime, fmtWhen, sameDay, fmtDayMonth } from '../format.js';
import { icon } from '../icons.js';
import { ALERT_TYPES, SEVERITY, busy } from '../ui.js';

export const header = () => ({
  title: 'Alertas',
  subtitle: 'Fique por dentro de qualquer atividade fora do padrão no consumo de água.',
});

let filter = '';
const openIds = new Set();

function period(a) {
  if (a.type === 'maintenance') return `Desde ${fmtDayMonth(a.periodStart)}`;
  if (a.type === 'above_avg' || a.type === 'limit') return fmtDayMonth(a.periodStart);
  const days = sameDay(a.periodStart, a.periodEnd) ? '' : `${fmtDayMonth(a.periodStart)} `;
  return `${days}${fmtTime(a.periodStart)} – ${fmtTime(a.periodEnd)}`;
}

const chipClass = (a) => SEVERITY[a.severity]?.chip ?? '';
const typeIcon = (a) => ALERT_TYPES[a.type]?.icon ?? 'bell';

function heroCard(a) {
  return `
    <section class="card alert-hero ${a.severity}" data-id="${a.id}">
      <div class="alert-top">
        <div class="chip-icon lg ${chipClass(a)}">${icon(typeIcon(a))}</div>
        <div>
          <span class="pill pill-${a.severity}">${SEVERITY[a.severity]?.label ?? 'Aviso'}</span>
          <h2>${esc(a.title)}</h2>
          <p>${esc(a.message)}</p>
        </div>
      </div>
      <div class="alert-meta">
        <div><div class="chip-icon">${icon('clock')}</div><div><small>Período</small><strong>${period(a)}</strong></div></div>
        <div><div class="chip-icon">${icon('drop')}</div><div><small>${a.type === 'maintenance' ? 'Água filtrada' : 'Consumo registrado'}</small><strong>${fmtLiters(a.liters)}</strong></div></div>
        <div><div class="chip-icon">${icon('calendar')}</div><div><small>Detectado</small><strong>${fmtWhen(a.createdAt)}</strong></div></div>
      </div>
      <div class="tip">${icon('info')}<span>${esc(ALERT_TYPES[a.type]?.tip ?? '')}</span></div>
      <div class="btn-row">
        <button class="btn btn-outline btn-sm" data-read="${a.id}">${icon('check')} Já verifiquei</button>
        ${a.type === 'maintenance' ? `<a class="btn btn-ghost btn-sm" href="#/dispositivo">Ir para Meu dispositivo</a>` : ''}
      </div>
    </section>`;
}

function listItem(a) {
  const open = openIds.has(a.id);
  return `
    <div class="list-item ${open ? 'open' : ''}">
      <button data-toggle="${a.id}" aria-expanded="${open}">
        <div class="chip-icon ${chipClass(a)}">${icon(typeIcon(a))}</div>
        <div class="grow"><strong>${esc(a.title)}</strong><small>${fmtWhen(a.createdAt)} · ${ALERT_TYPES[a.type]?.label ?? ''}</small></div>
        ${a.read ? '' : '<span class="pill pill-new">Novo</span>'}
        <span class="chev">${icon('chevronRight')}</span>
      </button>
      ${open ? `<div class="detail"><p>${esc(a.message)}</p>
        <dl class="kv"><dt>Período</dt><dd>${period(a)}</dd><dt>Litros</dt><dd>${fmtLiters(a.liters)}</dd></dl></div>` : ''}
    </div>`;
}

export async function render(el, ctx) {
  const [{ alerts: unread }, { alerts: history }] = await Promise.all([
    api.get('/alerts?unread=true&limit=10'),
    api.get(`/alerts?limit=100${filter ? `&type=${filter}` : ''}`),
  ]);

  // Os mais graves primeiro; os demais ficam só no histórico
  const rank = { critical: 0, warning: 1, info: 2 };
  const heroes = [...unread].sort((a, b) => rank[a.severity] - rank[b.severity] || b.createdAt - a.createdAt).slice(0, 3);

  const filters = [['', 'Todos'], ...Object.entries(ALERT_TYPES).map(([k, v]) => [k, v.label])];

  el.innerHTML = `
    ${unread.length
      ? heroes.map(heroCard).join('')
      : `<section class="card empty"><div class="chip-icon lg ok">${icon('check')}</div>
           <strong>Tudo certo por aqui</strong><p>Nenhum consumo fora do padrão aguardando verificação.</p></section>`}

    <section class="card">
      <div class="card-head">
        <div class="grow"><h2>Histórico de alertas</h2><p>Toque em um alerta para ver os detalhes.</p></div>
        ${unread.length > 1 ? `<button class="btn btn-ghost btn-sm" data-read-all>${icon('check')} Marcar todos como verificados</button>` : ''}
      </div>
      <div class="filters" style="margin-bottom:14px">
        ${filters.map(([k, label]) => `<button data-filter="${k}" class="${filter === k ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      <div class="list">
        ${history.length ? history.map(listItem).join('') : '<p class="empty">Nenhum alerta deste tipo.</p>'}
      </div>
    </section>`;

  const afterChange = async () => {
    await ctx.checkAlerts();
    await ctx.refresh();
  };

  el.addEventListener('click', (e) => {
    const read = e.target.closest('[data-read]');
    if (read) return busy(read, async () => { await api.post(`/alerts/${read.dataset.read}/read`); await afterChange(); });

    const all = e.target.closest('[data-read-all]');
    if (all) return busy(all, async () => { await api.post('/alerts/read-all'); await afterChange(); });

    const f = e.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      return ctx.refresh();
    }

    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const id = Number(toggle.dataset.toggle);
      if (!openIds.delete(id)) openIds.add(id);
      ctx.refresh();
    }
  });
}
