export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function text(value, label, { min = 1, max = 120, optional = false } = {}) {
  if (value == null || value === '') {
    if (optional) return null;
    throw new HttpError(400, `Preencha o campo ${label}.`);
  }
  if (typeof value !== 'string') throw new HttpError(400, `O campo ${label} é inválido.`);
  const v = value.trim();
  if (!v && optional) return null;
  if (v.length < min || v.length > max) {
    throw new HttpError(400, `O campo ${label} deve ter entre ${min} e ${max} caracteres.`);
  }
  return v;
}

export function email(value) {
  const v = text(value, 'E-mail', { max: 160 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new HttpError(400, 'Digite um e-mail válido.');
  return v;
}

export function password(value, label = 'Senha') {
  if (typeof value !== 'string' || value.length < 8) {
    throw new HttpError(400, `${label}: use pelo menos 8 caracteres.`);
  }
  if (value.length > 128) throw new HttpError(400, `${label}: use no máximo 128 caracteres.`);
  return value;
}

export function int(value, label, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return n;
}

export function num(value, label, min, max) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${label} deve ser um número entre ${min} e ${max}.`);
  }
  return n;
}

export function bool(value, label) {
  if (typeof value !== 'boolean') throw new HttpError(400, `${label} deve ser verdadeiro ou falso.`);
  return value ? 1 : 0;
}
