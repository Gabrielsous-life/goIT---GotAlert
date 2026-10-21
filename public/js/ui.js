import { esc } from './format.js';
import { icon } from './icons.js';

export function toast(message, type = 'info', ms = 4500) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<div>${esc(message)}</div>`;
  box.append(el);
  setTimeout(() => el.remove(), ms);
}

export function alertToast(alert) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast alert ${alert.severity}`;
  el.innerHTML = `${icon(ALERT_TYPES[alert.type]?.icon ?? 'bell')}
    <div><strong>${esc(alert.title)}</strong><small>${esc(alert.message)}</small><br><a href="#/alertas">Ver alerta</a></div>`;
  box.append(el);
  setTimeout(() => el.remove(), 10_000);
}

export const SEVERITY = {
  critical: { label: 'Crítico', chip: 'danger' },
  warning: { label: 'Atenção', chip: 'warn' },
  info: { label: 'Manutenção', chip: '' },
};

export const ALERT_TYPES = {
  leak: {
    label: 'Vazamento',
    icon: 'alert',
    tip: 'Feche todas as torneiras e veja se o consumo continua no app. Se continuar, pode ser vazamento: confira descargas, boias da caixa d’água e canos aparentes.',
  },
  night: {
    label: 'Madrugada',
    icon: 'moon',
    tip: 'Confira se há torneiras abertas, descarga correndo ou possíveis vazamentos.',
  },
  above_avg: {
    label: 'Acima da média',
    icon: 'chart',
    tip: 'Veja em Relatórios em quais horários o consumo subiu. Banhos mais curtos e lavar a louça com a torneira fechada ajudam a economizar.',
  },
  limit: {
    label: 'Limite diário',
    icon: 'zap',
    tip: 'Você pode ajustar o limite diário em Configurações.',
  },
  maintenance: {
    label: 'Manutenção',
    icon: 'filter',
    tip: 'Depois de fazer a manutenção, registre na tela Meu dispositivo para zerar o contador.',
  },
};

// Desativa o botão enquanto a ação roda e mostra o erro no formulário (ou em um toast)
export async function busy(button, action, errorBox) {
  if (errorBox) errorBox.hidden = true;
  button.disabled = true;
  try {
    return await action();
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } else {
      toast(err.message, 'error');
    }
  } finally {
    button.disabled = false;
  }
}

export const loadingHtml = '<div class="loading"><div class="spinner"></div>Carregando…</div>';

export const errorHtml = (message) =>
  `<div class="card empty">${icon('alert')}<strong>Não foi possível carregar</strong><p>${esc(message)}</p>
   <button class="btn btn-outline btn-sm" onclick="location.reload()">Tentar de novo</button></div>`;
