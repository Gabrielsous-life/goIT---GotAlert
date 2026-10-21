import { api } from '../api.js';
import { esc } from '../format.js';
import { icon, logo } from '../icons.js';
import { busy } from '../ui.js';

export async function render(root, { onLogin }) {
  root.innerHTML = `
    <div class="auth">
      <header class="auth-top">
        <a class="brand" href="#/">${logo({ hands: '#050C9C' })}<div class="brand-name">Got<b>Alert</b></div></a>
      </header>
      <div class="auth-body">
        <section class="auth-hero">
          ${logo()}
          <h1>Got<b>Alert</b></h1>
          <p>Saiba quanto sua casa gasta de água e seja avisado na hora quando algo foge do normal.</p>
        </section>
        <section class="auth-card" data-card></section>
      </div>
    </div>`;

  const card = root.querySelector('[data-card]');
  const config = await api.get('/auth/config').catch(() => ({}));
  let mode = 'login';

  const draw = () => {
    const isLogin = mode === 'login';
    card.innerHTML = `
      <h2>${isLogin ? 'Entrar na sua conta' : 'Criar conta'}</h2>
      <form class="form" novalidate>
        ${isLogin ? '' : `
          <label class="input-icon"><span class="sr-only">Nome</span>${icon('user')}
            <input class="input" name="name" placeholder="Seu nome" autocomplete="name" required></label>`}
        <label class="input-icon"><span class="sr-only">E-mail</span>${icon('mail')}
          <input class="input" name="email" type="email" placeholder="E-mail" autocomplete="email" required></label>
        <label class="input-icon"><span class="sr-only">Senha</span>${icon('lock')}
          <input class="input" name="password" type="password" placeholder="${isLogin ? 'Senha' : 'Senha (mínimo 8 caracteres)'}"
            autocomplete="${isLogin ? 'current-password' : 'new-password'}" required>
          <button type="button" class="peek" data-peek aria-label="Mostrar senha">${icon('eyeOff')}</button></label>
        <p class="form-error" data-error hidden></p>
        <button class="btn btn-primary btn-block" type="submit">${isLogin ? 'Entrar' : 'Criar conta'} ${icon('arrowRight')}</button>
      </form>
      <p class="auth-switch">${isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
        <button type="button" data-switch>${isLogin ? 'Criar agora' : 'Entrar'}</button></p>
      ${isLogin && config.demoAccount ? `
        <div class="demo-box">
          <span>Conta de demonstração: <b>${esc(config.demoAccount.email)}</b> · senha <b>${esc(config.demoAccount.password)}</b></span>
          <button type="button" class="btn btn-outline btn-sm" data-demo>Usar</button>
        </div>` : ''}`;

    const form = card.querySelector('form');
    const errorBox = card.querySelector('[data-error]');
    const passwordInput = form.elements.password;

    card.querySelector('[data-switch]').addEventListener('click', () => {
      mode = isLogin ? 'register' : 'login';
      draw();
    });
    card.querySelector('[data-peek]').addEventListener('click', (e) => {
      const show = passwordInput.type === 'password';
      passwordInput.type = show ? 'text' : 'password';
      e.currentTarget.innerHTML = icon(show ? 'eye' : 'eyeOff');
      e.currentTarget.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
    });
    card.querySelector('[data-demo]')?.addEventListener('click', () => {
      form.elements.email.value = config.demoAccount.email;
      passwordInput.value = config.demoAccount.password;
      form.requestSubmit();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      busy(form.querySelector('[type=submit]'), async () => {
        const { token } = await api.post(isLogin ? '/auth/login' : '/auth/register', data);
        onLogin(token);
      }, errorBox);
    });
    form.elements[0].focus();
  };

  draw();
}
