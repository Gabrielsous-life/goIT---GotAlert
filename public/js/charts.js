import { esc, fmtNumber } from './format.js';

// Arredonda o topo do eixo para um valor "redondo" (100, 250, 500, 1.000...)
function niceMax(value) {
  if (value <= 0) return 10;
  const exp = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (value <= step * exp) return step * exp;
  }
  return 10 * exp;
}

/**
 * Gráfico de barras em SVG que se ajusta à largura do container.
 * data: [{ label, sub?, value (null = sem dado), cls?, tip? }]
 * opts: { height, showValues, refLine: { value, label }, unit, labelEvery, onSelect(index) }
 */
export function barChart(el, data, opts = {}) {
  el.classList.add('chart');
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;

  let lastWidth = 0;
  const draw = () => {
    const width = Math.max(260, el.clientWidth);
    if (width === lastWidth) return;
    lastWidth = width;

    const height = opts.height ?? 260;
    const hasSub = data.some((d) => d.sub);
    const pad = { top: opts.showValues ? 26 : 12, right: 6, bottom: hasSub ? 44 : 28, left: 44 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = niceMax(Math.max(...data.map((d) => d.value ?? 0), opts.refLine?.value ?? 0));
    const y = (v) => pad.top + innerH - (v / max) * innerH;

    const slot = innerW / data.length;
    const barW = Math.min(opts.maxBar ?? 52, slot * 0.64);
    const every = Math.max(opts.labelEvery ?? 1, Math.ceil(36 / slot));

    let svg = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg += `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis-label" x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end">${fmtNumber(v)}</text>`;
    }

    data.forEach((d, i) => {
      const cx = pad.left + slot * i + slot / 2;
      const x = cx - barW / 2;
      const v = d.value ?? 0;
      const h = Math.max(v > 0 ? 3 : 0, (v / max) * innerH);
      const r = Math.min(7, barW / 2, h);
      const top = pad.top + innerH - h;
      const tipText = d.tip ?? `${d.label}: ${fmtNumber(v)} ${opts.unit ?? 'L'}`;

      svg += `<rect class="hit" data-i="${i}" x="${pad.left + slot * i}" y="${pad.top}" width="${slot}" height="${innerH}"><title>${esc(tipText)}</title></rect>`;
      if (d.value == null) {
        svg += `<rect class="bar empty" x="${x}" y="${pad.top + innerH - 3}" width="${barW}" height="3" rx="1.5"/>`;
      } else if (h > 0) {
        // Só os cantos de cima arredondados
        svg += `<path class="bar ${d.cls ?? ''}" data-bar="${i}" d="M${x},${top + h}V${top + r}q0,-${r} ${r},-${r}H${x + barW - r}q${r},0 ${r},${r}V${top + h}Z"/>`;
      }
      if (opts.showValues && d.value != null) {
        svg += `<text class="value-label" x="${cx}" y="${top - 8}" text-anchor="middle">${fmtNumber(v)} L</text>`;
      }
      if (i % every === 0 || data.length <= 8) {
        svg += `<text class="axis-label ${d.strong ? 'strong' : ''}" x="${cx}" y="${pad.top + innerH + 18}" text-anchor="middle">${esc(d.label)}</text>`;
        if (d.sub) svg += `<text class="axis-label" x="${cx}" y="${pad.top + innerH + 34}" text-anchor="middle">${esc(d.sub)}</text>`;
      }
    });

    if (opts.refLine?.value > 0) {
      const ry = y(opts.refLine.value);
      svg += `<line class="ref-line" x1="${pad.left}" x2="${width - pad.right}" y1="${ry}" y2="${ry}"/>`;
      if (opts.refLine.label) svg += `<text class="ref-label" x="${width - pad.right}" y="${ry - 6}" text-anchor="end">${esc(opts.refLine.label)}</text>`;
    }

    el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" height="${height}" role="img" aria-label="${esc(opts.label ?? 'Gráfico de consumo')}">${svg}</svg>`;
    el.append(tip);
  };

  // Tooltip que também funciona com toque no celular
  const show = (e) => {
    const hit = e.target.closest?.('.hit');
    el.querySelectorAll('.bar.focus').forEach((b) => b.classList.remove('focus'));
    if (!hit) return (tip.hidden = true);
    const i = Number(hit.dataset.i);
    const d = data[i];
    tip.textContent = d.tip ?? `${d.label}: ${fmtNumber(d.value ?? 0)} ${opts.unit ?? 'L'}`;
    const box = hit.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(box.left - host.left + box.width / 2, 60), host.width - 60)}px`;
    tip.style.top = `${Math.max(24, (el.querySelector(`[data-bar="${i}"]`)?.getBoundingClientRect().top ?? box.top + box.height / 2) - host.top)}px`;
    tip.hidden = false;
    el.querySelector(`[data-bar="${i}"]`)?.classList.add('focus');
  };
  el.addEventListener('pointermove', show);
  el.addEventListener('pointerdown', show);
  el.addEventListener('pointerleave', () => (tip.hidden = true));
  if (opts.onSelect) {
    el.addEventListener('click', (e) => {
      const hit = e.target.closest?.('.hit');
      if (hit) opts.onSelect(Number(hit.dataset.i));
    });
  }

  draw();
  const observer = new ResizeObserver(() => (el.isConnected ? draw() : observer.disconnect()));
  observer.observe(el);
}
