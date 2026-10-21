import { api } from '../api.js';
import { barChart } from '../charts.js';
import { esc, fmtAgo, fmtLiters, fmtNumber, fmtTime } from '../format.js';
import { icon } from '../icons.js';
import { ALERT_TYPES } from '../ui.js';

const TIPS = [
  'Banhos mais curtos economizam muita água. Tente fechar o registro enquanto se ensaboa.',
  'Feche a torneira enquanto escova os dentes.',
  'Junte roupa para usar a máquina de lavar com a carga completa.',
  'Use balde em vez de mangueira para lavar o quintal ou o carro.',
  'Uma torneira pingando parece pouco, mas soma muitos litros no mês. Troque a borrachinha (vedante).',
  'Antes de dormir, confira se todas as torneiras estão bem fechadas.',
  'Reaproveite a água da máquina de lavar para limpar o quintal.',
];

export function header(me) {
  const first = me.user.name.split(' ')[0];
  return { title: `Olá, ${first}!`, subtitle: 'Acompanhe o consumo de água da sua casa.' };
}

export async function render(el) {
  const s = await api.get('/consumption/summary');

  if (!s.hasDevice) {
    el.innerHTML = `
      <section class="card empty">
        <div class="chip-icon lg">${icon('gauge')}</div>
        <strong>Cadastre o seu GotAlert</strong>
        <p>Para ver o consumo, conecte o módulo instalado na saída da caixa d’água.</p>
        <a class="btn btn-primary" href="#/dispositivo">${icon('plus')} Cadastrar dispositivo</a>
      </section>`;
    return;
  }

  const change = s.today.changePct;
  const changeHtml =
    change == null
      ? '<span class="stat-note">Sem dados de ontem para comparar</span>'
      : `<span class="stat-note ${change <= 0 ? 'down' : 'up'}">${icon(change <= 0 ? 'arrowDown' : 'arrowUp')}
           ${fmtNumber(Math.abs(change))}% ${change <= 0 ? 'a menos' : 'a mais'} que ontem até este horário</span>`;

  const alert = s.latestAlert;
  const tip = TIPS[new Date().getDate() % TIPS.length];
  const d = s.device;
  const maintenance = Math.max(d.filter.pct, d.reservoir.pct);

  el.innerHTML = `
    ${alert ? `
      <a class="banner ${alert.severity}" href="#/alertas">
        <div class="chip-icon ${alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warn' : ''}">${icon(ALERT_TYPES[alert.type]?.icon ?? 'bell')}</div>
        <div class="grow"><strong>${esc(alert.title)}</strong><span>${esc(alert.message)}</span></div>
        ${icon('chevronRight')}
      </a>` : ''}

    <div class="grid grid-3">
      <section class="card stat">
        <div class="chip-icon lg">${icon('drop')}</div>
        <div><div class="stat-label">Consumo de hoje</div>
          <div class="stat-value">${fmtNumber(s.today.liters)} <small>L</small></div>${changeHtml}</div>
      </section>
      <a class="card stat" href="#/relatorios">
        <div class="chip-icon lg">${icon('calendar')}</div>
        <div><div class="stat-label">Consumo de ontem</div>
          <div class="stat-value">${fmtNumber(s.yesterday.liters)} <small>L</small></div>
          <span class="stat-note">Dia completo</span></div>
      </a>
      <section class="card stat">
        <div class="chip-icon lg">${icon('chart')}</div>
        <div><div class="stat-label">Sua média diária</div>
          <div class="stat-value">${fmtNumber(s.average.liters)} <small>L</small></div>
          <span class="stat-note">${s.average.days ? `Últimos ${s.average.days} dias com dados` : 'Ainda sem histórico'}</span></div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <div class="chip-icon">${icon('drop')}</div>
        <div class="grow"><h2>Consumo de água hoje</h2><p>Litros por hora. Toque numa barra para ver o valor.</p></div>
      </div>
      <div data-chart></div>
      <div class="legend">
        <span><i style="background:var(--c-400)"></i>Consumo normal</span>
        <span><i style="background:var(--warn-strong)"></i>Consumo fora do padrão</span>
        <span><i style="background:var(--c-900)"></i>Hora atual</span>
      </div>
    </section>

    <div class="grid grid-2">
      <a class="card" href="#/dispositivo" style="text-decoration:none;color:inherit">
        <div class="card-head">
          <div class="chip-icon ${d.online ? 'ok' : ''}">${icon(d.online ? 'wifi' : 'wifiOff')}</div>
          <div class="grow"><h2>${esc(d.name)}</h2>
            <p>${d.online ? 'Conectado' : `Sem sinal · última conexão ${fmtAgo(d.lastSeenAt)}`}${d.lastReadingAt ? ` · última leitura ${fmtTime(d.lastReadingAt)}` : ''}</p></div>
          ${maintenance >= 90 ? '<span class="pill pill-warning">Manutenção</span>' : ''}
        </div>
        ${bar('Vela do filtro', d.filter.pct)}
        <div style="height:12px"></div>
        ${bar('Reservatório de resíduos', d.reservoir.pct)}
      </a>
      <section class="card">
        <div class="card-head">
          <div class="chip-icon">${icon('bulb')}</div>
          <div class="grow"><h2>Dica do dia</h2></div>
        </div>
        <p style="color:var(--muted)">${esc(tip)}</p>
      </section>
    </div>`;

  const anomalies = new Set(s.anomalyHours);
  const currentHour = new Date(s.now).getHours();
  const data = s.hourly.map((liters, h) => ({
    label: `${h}h`,
    value: h > currentHour ? null : liters,
    cls: anomalies.has(h) ? 'warn' : h === currentHour ? 'hi' : '',
    tip: h > currentHour ? `${h}h: ainda não chegou` : `${h}h às ${h + 1}h: ${fmtLiters(liters)}`,
  }));
  barChart(el.querySelector('[data-chart]'), data, { height: 270, labelEvery: 2, maxBar: 30, label: 'Consumo de água por hora hoje' });
}

function bar(label, pct) {
  const cls = pct >= 100 ? 'danger' : pct >= 90 ? 'warn' : '';
  return `<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px">
      <span>${label}</span><strong>${Math.min(pct, 999)}%</strong></div>
    <div class="progress ${cls}"><span style="width:${Math.min(pct, 100)}%"></span></div>`;
}
