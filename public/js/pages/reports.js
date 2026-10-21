import { api } from '../api.js';
import { barChart } from '../charts.js';
import {
  dayKey, esc, fmtDateLong, fmtDayMonth, fmtLiters, fmtMonth, fmtNumber, fmtTime, fmtWeekday, fmtWeekdayShort, parseDay,
} from '../format.js';
import { icon } from '../icons.js';
import { ALERT_TYPES } from '../ui.js';

export const header = () => ({
  title: 'Relatórios',
  subtitle: 'Acompanhe o seu consumo de água e veja os dias de maior uso.',
});

const monthKey = (ts) => dayKey(ts).slice(0, 7);
let selectedMonth = monthKey(Date.now());
let selectedDay = dayKey(Date.now());

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function level(liters, avg) {
  if (!liters || !avg) return '';
  const r = liters / avg;
  return r < 0.85 ? 'l1' : r < 1.1 ? 'l2' : r < 1.25 ? 'l4' : 'l5';
}

function calendar(month) {
  const first = parseDay(month.days[0].date);
  const offset = (new Date(first).getDay() + 6) % 7; // semana começando na segunda
  const alertDays = new Set(month.alertDates);
  const today = dayKey(Date.now());
  const isCurrentMonth = month.month === monthKey(Date.now());

  const cells = month.days.map((d) => {
    const n = Number(d.date.slice(8));
    const cls = [level(d.liters, month.average), d.date === today ? 'today' : '', d.date === selectedDay ? 'selected' : ''].join(' ');
    const label = d.liters == null ? `${n}` : `${n}: ${fmtLiters(d.liters)}${alertDays.has(d.date) ? ', com alerta' : ''}`;
    return `<button class="${cls}" data-day="${d.date}" ${d.liters == null ? 'disabled' : ''} aria-label="${label}" title="${label}">
      ${n}${alertDays.has(d.date) ? '<span class="alert-dot"></span>' : ''}</button>`;
  });

  return `
    <div class="cal-head">
      <button data-month="-1" aria-label="Mês anterior">${icon('chevronLeft')}</button>
      <h2>${fmtMonth(first).replace(/^./, (c) => c.toUpperCase())}</h2>
      <button data-month="1" aria-label="Próximo mês" ${isCurrentMonth ? 'disabled' : ''}>${icon('chevronRight')}</button>
    </div>
    <div class="cal">
      ${WEEKDAYS.map((w) => `<div class="wd">${w}</div>`).join('')}
      ${'<div></div>'.repeat(offset)}${cells.join('')}
    </div>
    <div class="legend" style="justify-content:center">
      <span><i style="background:var(--c-50)"></i>Abaixo da média</span>
      <span><i style="background:var(--c-200)"></i>Na média</span>
      <span><i style="background:var(--c-600)"></i>Acima</span>
      <span><i style="background:var(--c-900)"></i>Bem acima</span>
      <span><i style="background:var(--warn-strong);border-radius:50%"></i>Dia com alerta</span>
    </div>`;
}

function dayDetail(day) {
  const ts = parseDay(day.date);
  const diff = day.average ? ((day.total - day.average) / day.average) * 100 : null;
  return `
    <div class="card-head">
      <div class="chip-icon">${icon('calendar')}</div>
      <div class="grow"><h2>${fmtWeekday(ts)}, ${fmtDayMonth(ts)}</h2>
        <p>${fmtLiters(day.total)} no dia${diff == null ? '' : ` · ${fmtNumber(Math.abs(diff))}% ${diff <= 0 ? 'abaixo' : 'acima'} da média`}</p></div>
    </div>
    <div data-day-chart></div>
    ${day.alerts.length ? `<div class="list" style="margin-top:14px">${day.alerts.map((a) => `
      <a class="tip" href="#/alertas" style="text-decoration:none">${icon(ALERT_TYPES[a.type]?.icon ?? 'bell')}
        <span><b>${esc(a.title)}</b><br>${a.type === 'leak' || a.type === 'night' ? `${fmtTime(a.periodStart)} – ${fmtTime(a.periodEnd)} · ` : ''}${fmtLiters(a.liters)}</span></a>`).join('')}</div>` : ''}`;
}

export async function render(el, ctx) {
  const today = dayKey(Date.now());
  const [month, week, day] = await Promise.all([
    api.get(`/consumption/month?month=${selectedMonth}`),
    api.get('/consumption/week'),
    api.get(`/consumption/day?date=${selectedDay}`),
  ]);

  const weekMax = Math.max(...week.days.map((d) => d.liters));
  const weekMaxIndex = week.days.findIndex((d) => d.liters === weekMax && weekMax > 0);
  const monthWeeksMax = Math.max(...month.weeks.map((w) => w.liters));
  const change = month.changePct;

  el.innerHTML = `
    <div class="grid grid-reports">
      <div class="stack">
        <section class="card">${calendar(month)}</section>
        <section class="card">${dayDetail(day)}</section>
      </div>
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="chip-icon">${icon('chart')}</div>
            <div class="grow"><h2>Consumo da semana</h2><p>Últimos 7 dias. Toque em um dia para ver o detalhe por hora.</p></div>
          </div>
          <div data-week></div>
          <div class="legend"><span><i style="background:none;border-top:2px dashed var(--c-900);border-radius:0;height:0"></i>Média da semana: ${fmtLiters(week.average)}</span></div>
        </section>
        <section class="card">
          <div class="card-head">
            <div class="chip-icon">${icon('calendar')}</div>
            <div class="grow"><h2>Consumo do mês</h2><p>${fmtMonth(parseDay(month.days[0].date))}, somado por semana.</p></div>
          </div>
          <div class="grid" style="grid-template-columns:minmax(0,1fr) auto;align-items:center" data-month-grid>
            <div data-month-chart></div>
            <div class="stack" style="gap:14px;min-width:170px">
              <div><div class="stat-label">Total do mês</div><div class="stat-value">${fmtNumber(month.total)} <small>L</small></div>
                ${change == null ? '' : `<span class="stat-note ${change <= 0 ? 'down' : 'up'}">${icon(change <= 0 ? 'arrowDown' : 'arrowUp')}
                  ${fmtNumber(Math.abs(change))}% vs. mês anterior${month.previous.samePeriod ? ' (mesmo período)' : ''}</span>`}</div>
              <div><div class="stat-label">Média por dia</div><strong style="font-size:20px;color:var(--c-900)">${fmtLiters(month.average)}</strong></div>
              ${month.maxDay ? `<div><div class="stat-label">Dia de maior consumo</div>
                <strong style="font-size:20px;color:var(--c-900)">${fmtDateLong(parseDay(month.maxDay.date))}</strong>
                <div class="hint">${fmtLiters(month.maxDay.liters)} consumidos</div></div>` : ''}
            </div>
          </div>
        </section>
        <section class="card tip" style="box-shadow:var(--shadow);background:#fff">${icon('bulb')}
          <span><b>Dica</b><br>Mantenha o hábito de verificar torneiras e vazamentos, principalmente nos períodos de menor uso.</span></section>
      </div>
    </div>`;

  barChart(el.querySelector('[data-week]'), week.days.map((d, i) => ({
    label: fmtDayMonth(parseDay(d.date)),
    sub: d.date === today ? 'Hoje' : fmtWeekdayShort(parseDay(d.date)),
    value: d.liters,
    strong: d.date === selectedDay,
    cls: i === weekMaxIndex ? 'hi' : '',
    tip: `${fmtWeekday(parseDay(d.date))}, ${fmtDayMonth(parseDay(d.date))}: ${fmtLiters(d.liters)}`,
  })), {
    showValues: true,
    refLine: { value: week.average },
    onSelect: (i) => selectDay(week.days[i].date, ctx),
    label: 'Consumo dos últimos 7 dias',
  });

  barChart(el.querySelector('[data-month-chart]'), month.weeks.map((w) => ({
    label: `${w.from.slice(8)}–${w.to.slice(8)}`,
    sub: fmtMonth(parseDay(w.from)).split(' ')[0].slice(0, 3),
    value: w.liters,
    tip: w.liters == null ? 'Semana ainda não chegou' : undefined,
    cls: w.liters === monthWeeksMax && w.liters > 0 ? 'hi' : '',
  })), { showValues: true, height: 240, label: 'Consumo do mês por semana' });

  const hourly = new Set(day.anomalyHours);
  barChart(el.querySelector('[data-day-chart]'), day.hourly.map((v, h) => ({
    label: `${h}h`,
    value: v,
    cls: hourly.has(h) ? 'warn' : '',
    tip: `${h}h às ${h + 1}h: ${fmtLiters(v)}`,
  })), { height: 180, labelEvery: 3, maxBar: 18, label: 'Consumo por hora no dia selecionado' });

  // O gráfico do mês fica embaixo dos números quando a tela é estreita
  const grid = el.querySelector('[data-month-grid]');
  const fit = () => (grid.style.gridTemplateColumns = grid.clientWidth < 560 ? '1fr' : 'minmax(0,1fr) auto');
  new ResizeObserver(fit).observe(grid);

  el.addEventListener('click', (e) => {
    const dayBtn = e.target.closest('[data-day]');
    if (dayBtn) return selectDay(dayBtn.dataset.day, ctx);
    const monthBtn = e.target.closest('[data-month]');
    if (monthBtn && !monthBtn.disabled) {
      const [y, m] = selectedMonth.split('-').map(Number);
      selectedMonth = monthKey(new Date(y, m - 1 + Number(monthBtn.dataset.month), 1).getTime());
      ctx.refresh();
    }
  });
}

function selectDay(date, ctx) {
  selectedDay = date;
  selectedMonth = date.slice(0, 7);
  ctx.refresh();
}
