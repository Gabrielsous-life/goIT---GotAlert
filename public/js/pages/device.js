import { api } from '../api.js';
import { esc, fmtAgo, fmtDayMonth, fmtLiters, fmtWhen } from '../format.js';
import { icon } from '../icons.js';
import { busy, toast } from '../ui.js';

export const header = () => ({
  title: 'Meu dispositivo',
  subtitle: 'Status do módulo GotAlert, manutenção do filtro e instalação.',
});

let showKey = false;

const INSTALL_STEPS = [
  'Feche o registro de saída da caixa d’água.',
  'Encaixe o módulo GotAlert no cano logo após a saída da caixa, respeitando a seta do sentido da água.',
  'Abra o registro devagar e confira se não há vazamento nas conexões.',
  'Ligue o módulo na energia e conecte ao Wi-Fi da casa.',
  'Informe a chave do dispositivo (no topo desta tela) na configuração do módulo.',
];

function partCard({ title, iconName, part, action, actionLabel, help }) {
  const cls = part.pct >= 100 ? 'danger' : part.pct >= 90 ? 'warn' : '';
  return `
    <section class="card">
      <div class="card-head">
        <div class="chip-icon ${cls === 'danger' ? 'danger' : cls}">${icon(iconName)}</div>
        <div class="grow"><h2>${title}</h2><p>${help}</p></div>
        ${part.pct >= 90 ? `<span class="pill pill-${cls === 'danger' ? 'critical' : 'warning'}">${part.pct >= 100 ? 'Atrasado' : 'Em breve'}</span>` : '<span class="pill pill-ok">Em dia</span>'}
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:14px">
        <span>${fmtLiters(part.usedL)} de ${fmtLiters(part.capacityL)}</span><strong>${part.pct}%</strong>
      </div>
      <div class="progress ${cls}"><span style="width:${Math.min(part.pct, 100)}%"></span></div>
      <p class="hint" style="margin:10px 0 14px">Última vez: ${fmtWhen(part.since)}</p>
      <button class="btn btn-outline btn-sm" data-action="${action}">${icon('check')} ${actionLabel}</button>
    </section>`;
}

export async function render(el, ctx) {
  const { device, health } = await api.get('/device');

  if (!device) {
    el.innerHTML = `
      <section class="card" style="max-width:640px">
        <div class="card-head"><div class="chip-icon">${icon('plus')}</div>
          <div class="grow"><h2>Cadastrar meu GotAlert</h2><p>Depois do cadastro você recebe a chave para configurar o módulo.</p></div></div>
        <form class="form">
          <label class="field"><span>Nome do dispositivo</span><input class="input" name="name" placeholder="Ex.: GotAlert da casa" maxlength="40"></label>
          <button class="btn btn-primary">Cadastrar</button>
        </form>
      </section>`;
    const form = el.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('button'), async () => {
        await api.post('/device', { name: form.elements.name.value });
        toast('Dispositivo cadastrado!');
        ctx.refresh();
      });
    });
    return;
  }

  const a = device.address;
  el.innerHTML = `
    <section class="card">
      <div class="card-head">
        <div class="chip-icon lg ${health.online ? 'ok' : ''}">${icon(health.online ? 'wifi' : 'wifiOff')}</div>
        <div class="grow">
          <span class="pill ${health.online ? 'pill-ok' : 'pill-info'}"><span class="dot"></span>${health.online ? 'Conectado' : 'Sem sinal'}</span>
          <h2 style="margin-top:6px">${esc(device.name)}</h2>
          <p>Último sinal ${fmtAgo(health.lastSeenAt)}${health.lastReadingAt ? ` · última leitura de consumo ${fmtAgo(health.lastReadingAt)}` : ''}</p>
        </div>
      </div>
      <dl class="kv">
        <dt>Chave do dispositivo</dt>
        <dd><code class="key">${showKey ? esc(device.deviceKey) : '••••-••••-••••'}</code>
          <button class="btn btn-ghost btn-sm" data-action="toggle-key">${icon(showKey ? 'eyeOff' : 'eye')} ${showKey ? 'Esconder' : 'Mostrar'}</button>
          <button class="btn btn-ghost btn-sm" data-action="copy-key">${icon('copy')} Copiar</button></dd>
        <dt>Cadastrado em</dt><dd>${fmtDayMonth(device.createdAt)}/${new Date(device.createdAt).getFullYear()}</dd>
      </dl>
      <p class="hint" style="margin-top:12px">${icon('info')} A chave identifica o seu módulo na API. Não compartilhe.
        <button class="btn btn-ghost btn-sm" data-action="new-key">${icon('refresh')} Gerar nova chave</button></p>
    </section>

    <div class="grid grid-2">
      ${partCard({
        title: 'Vela do filtro', iconName: 'filter', part: health.filter, action: 'filter-cleaned',
        actionLabel: 'Registrei a limpeza da vela', help: 'A vela de pedra segura a sujeira da água. Limpe com escova macia, sem sabão.',
      })}
      ${partCard({
        title: 'Reservatório de resíduos', iconName: 'box', part: health.reservoir, action: 'reservoir-emptied',
        actionLabel: 'Esvaziei o reservatório', help: 'Guarda os resíduos retirados na filtração.',
      })}
    </div>

    ${ctx.me.demoMode ? `
      <section class="card">
        <div class="card-head"><div class="chip-icon warn">${icon('play')}</div>
          <div class="grow"><h2>Modo demonstração</h2><p>Gera leituras como se o sensor tivesse medido agora. Use no pitch para mostrar os alertas ao vivo.</p></div></div>
        <div class="btn-row">
          <button class="btn btn-outline btn-sm" data-sim="shower">${icon('shower')} Simular banho (8 min)</button>
          <button class="btn btn-outline btn-sm" data-sim="leak">${icon('alert')} Simular vazamento (75 min)</button>
          <button class="btn btn-outline btn-sm" data-sim="night">${icon('moon')} Simular uso de madrugada</button>
        </div>
      </section>` : ''}

    <div class="grid grid-2">
      <section class="card">
        <div class="card-head"><div class="chip-icon">${icon('pin')}</div>
          <div class="grow"><h2>Endereço de instalação</h2><p>Onde o filtro está instalado.</p></div></div>
        <form class="form" data-form="device">
          <label class="field"><span>Nome do dispositivo</span><input class="input" name="name" value="${esc(device.name)}" maxlength="40" required></label>
          <label class="field"><span>Endereço</span><input class="input" name="street" value="${esc(a.street)}" placeholder="Rua e número" maxlength="120"></label>
          <div class="form-row">
            <label class="field"><span>Bairro</span><input class="input" name="district" value="${esc(a.district)}" maxlength="80"></label>
            <label class="field"><span>CEP</span><input class="input" name="cep" value="${esc(a.cep)}" placeholder="00000-000" inputmode="numeric" maxlength="9"></label>
          </div>
          <div class="form-row">
            <label class="field"><span>Cidade</span><input class="input" name="city" value="${esc(a.city)}" maxlength="80"></label>
            <label class="field"><span>UF</span><input class="input" name="state" value="${esc(a.state)}" maxlength="2" style="text-transform:uppercase"></label>
          </div>
          <details>
            <summary class="hint" style="cursor:pointer">Capacidades do filtro (avançado)</summary>
            <div class="form-row" style="margin-top:12px">
              <label class="field"><span>Litros até limpar a vela</span><input class="input" name="filterCapacityL" type="number" min="100" value="${device.filterCapacityL}"></label>
              <label class="field"><span>Litros até esvaziar o reservatório</span><input class="input" name="reservoirCapacityL" type="number" min="100" value="${device.reservoirCapacityL}"></label>
            </div>
            <p class="hint" style="margin-top:8px">São estimativas. Ajustem depois de testar o protótipo físico com a vela escolhida.</p>
          </details>
          <p class="form-error" data-error hidden></p>
          <button class="btn btn-primary">Salvar</button>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><div class="chip-icon">${icon('gauge')}</div>
          <div class="grow"><h2>Como instalar</h2><p>Um único módulo: filtro, reservatório e sensor juntos.</p></div></div>
        <ol style="margin:0;padding-left:20px;display:grid;gap:10px">${INSTALL_STEPS.map((s) => `<li>${s}</li>`).join('')}</ol>
      </section>
    </div>`;

  const form = el.querySelector('[data-form=device]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    busy(form.querySelector('button.btn-primary'), async () => {
      await api.patch('/device', {
        name: f.name.value,
        address: { street: f.street.value, district: f.district.value, city: f.city.value, state: f.state.value, cep: f.cep.value },
        filterCapacityL: f.filterCapacityL.value,
        reservoirCapacityL: f.reservoirCapacityL.value,
      });
      toast('Dados do dispositivo salvos.');
      ctx.refresh();
    }, form.querySelector('[data-error]'));
  });

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action], [data-sim]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'toggle-key') {
      showKey = !showKey;
      return ctx.refresh();
    }
    if (action === 'copy-key') {
      return navigator.clipboard?.writeText(device.deviceKey)
        .then(() => toast('Chave copiada.'))
        .catch(() => toast(`Chave: ${device.deviceKey}`));
    }

    busy(btn, async () => {
      if (btn.dataset.sim) {
        const { alerts } = await api.post('/device/simulate', { scenario: btn.dataset.sim });
        toast(alerts.length ? `Leituras enviadas. ${alerts.length} alerta(s) novo(s)!` : 'Leituras enviadas. Nenhum alerta novo.');
        await ctx.checkAlerts();
      } else if (action === 'new-key') {
        await api.post('/device/key');
        showKey = true;
        toast('Nova chave gerada. Atualize a configuração do módulo.');
      } else {
        await api.post(`/device/${action}`);
        toast('Manutenção registrada. Contador zerado.');
        await ctx.checkAlerts();
      }
      ctx.refresh();
    });
  });
}
