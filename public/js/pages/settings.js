import { api, auth } from '../api.js';
import { esc } from '../format.js';
import { icon } from '../icons.js';
import { busy, toast } from '../ui.js';

export const header = () => ({
  title: 'Configurações',
  subtitle: 'Gerencie suas informações, notificações e as regras dos alertas.',
});

const hours = (selected) =>
  Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === selected ? 'selected' : ''}>${h}h</option>`).join('');

function toggle(name, title, text, checked, iconName) {
  return `
    <label class="toggle-row">
      <div class="chip-icon">${icon(iconName)}</div>
      <div class="grow"><strong>${title}</strong><small>${text}</small></div>
      <span class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span></span></span>
    </label>`;
}

function pushStatus() {
  if (!('Notification' in window)) return 'Este navegador não suporta notificações.';
  if (!window.isSecureContext) return 'Notificações do sistema só funcionam em HTTPS ou localhost. Os avisos dentro do app continuam funcionando.';
  if (Notification.permission === 'denied') return 'As notificações foram bloqueadas no navegador. Libere nas configurações do site.';
  return 'Receba o aviso no celular ou computador assim que um alerta for criado.';
}

export async function render(el, ctx) {
  const { user, settings: s } = ctx.me;

  el.innerHTML = `
    <div class="grid grid-2" style="align-items:start">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div class="chip-icon">${icon('user')}</div>
            <div class="grow"><h2>Dados do usuário</h2><p>Atualize suas informações pessoais.</p></div></div>
          <form class="form" data-form="profile">
            <label class="field"><span>Nome completo</span><input class="input" name="name" value="${esc(user.name)}" required maxlength="80" autocomplete="name"></label>
            <label class="field"><span>E-mail</span><input class="input" name="email" type="email" value="${esc(user.email)}" required autocomplete="email"></label>
            <label class="field"><span>Celular (opcional)</span><input class="input" name="phone" value="${esc(user.phone)}" placeholder="(00) 00000-0000" inputmode="tel" autocomplete="tel"></label>
            <p class="form-error" data-error hidden></p>
            <button class="btn btn-outline">${icon('check')} Salvar dados</button>
          </form>
        </section>

        <section class="card">
          <div class="card-head"><div class="chip-icon">${icon('lock')}</div>
            <div class="grow"><h2>Senha</h2><p>Use pelo menos 8 caracteres.</p></div></div>
          <form class="form" data-form="password">
            <label class="field"><span>Senha atual</span><input class="input" name="current" type="password" required autocomplete="current-password"></label>
            <label class="field"><span>Nova senha</span><input class="input" name="next" type="password" required minlength="8" autocomplete="new-password"></label>
            <p class="form-error" data-error hidden></p>
            <button class="btn btn-outline">Trocar senha</button>
          </form>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head"><div class="chip-icon">${icon('bell')}</div>
            <div class="grow"><h2>Notificações</h2><p>Escolha como deseja receber os alertas.</p></div></div>
          <form class="form" data-form="notify">
            ${toggle('notifyAnomaly', 'Alertas de consumo anormal', 'Picos de consumo, uso fora do horário e possíveis vazamentos.', s.notifyAnomaly, 'alert')}
            ${toggle('notifyPush', 'Notificações no celular', pushStatus(), s.notifyPush, 'bell')}
            ${toggle('notifyEmail', 'Notificações por e-mail', 'No protótipo, o e-mail é simulado (aparece no console do servidor).', s.notifyEmail, 'mail')}
          </form>
        </section>

        <section class="card">
          <div class="card-head"><div class="chip-icon">${icon('sliders')}</div>
            <div class="grow"><h2>Regras dos alertas</h2><p>Ajuste o que o GotAlert considera fora do padrão na sua casa.</p></div></div>
          <form class="form" data-form="rules">
            <div class="form-row">
              <label class="field"><span>Ninguém usa água das</span><select class="input" name="quietStart">${hours(s.quietStart)}</select></label>
              <label class="field"><span>até as</span><select class="input" name="quietEnd">${hours(s.quietEnd)}</select></label>
            </div>
            <div class="form-row">
              <label class="field"><span>Alerta de madrugada a partir de (L)</span><input class="input" name="nightMinLiters" type="number" min="1" max="500" value="${s.nightMinLiters}"></label>
              <label class="field"><span>Possível vazamento após (min seguidos)</span><input class="input" name="leakMinutes" type="number" min="10" max="600" value="${s.leakMinutes}"></label>
            </div>
            <div class="form-row">
              <label class="field"><span>Alerta acima da média (%)</span><input class="input" name="tolerancePct" type="number" min="5" max="200" value="${s.tolerancePct}"></label>
              <label class="field"><span>Limite diário (L, opcional)</span><input class="input" name="dailyLimitL" type="number" min="50" max="10000" value="${s.dailyLimitL ?? ''}" placeholder="Sem limite"></label>
            </div>
            <p class="hint">As regras valem para os próximos consumos medidos.</p>
            <p class="form-error" data-error hidden></p>
            <button class="btn btn-outline">${icon('check')} Salvar regras</button>
          </form>
        </section>

        <button class="btn btn-danger" data-logout>${icon('logout')} Sair da conta</button>
      </div>
    </div>`;

  const forms = Object.fromEntries([...el.querySelectorAll('[data-form]')].map((f) => [f.dataset.form, f]));
  const errorOf = (form) => form.querySelector('[data-error]');

  forms.profile.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(forms.profile.querySelector('button'), async () => {
      const me = await api.patch('/me', Object.fromEntries(new FormData(forms.profile)));
      ctx.setMe(me);
      toast('Dados salvos.');
      ctx.refresh();
    }, errorOf(forms.profile));
  });

  forms.password.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(forms.password.querySelector('button'), async () => {
      await api.patch('/me/password', Object.fromEntries(new FormData(forms.password)));
      forms.password.reset();
      toast('Senha alterada.');
    }, errorOf(forms.password));
  });

  // Os interruptores salvam na hora
  forms.notify.addEventListener('change', async (e) => {
    const input = e.target;
    if (input.name === 'notifyPush' && input.checked && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
    try {
      const { settings } = await api.patch('/settings', { [input.name]: input.checked });
      ctx.setMe({ settings });
      toast('Preferência salva.');
    } catch (err) {
      input.checked = !input.checked;
      toast(err.message, 'error');
    }
  });

  forms.rules.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(forms.rules));
    if (!data.dailyLimitL) data.dailyLimitL = null;
    busy(forms.rules.querySelector('button'), async () => {
      const { settings } = await api.patch('/settings', data);
      ctx.setMe({ settings });
      toast('Regras salvas.');
    }, errorOf(forms.rules));
  });

  el.querySelector('[data-logout]').addEventListener('click', () => {
    auth.set(null);
    location.reload();
  });
}
