// Simula o sensor do GotAlert enviando leituras para a API, como o ESP32 faria.
//
// Uso:
//   npm run simulate                       (chave da demonstração, uma leitura por minuto)
//   npm run simulate -- --leak             (adiciona um vazamento contínuo)
//   npm run simulate -- --key GA-XXXX-XXXX --url http://localhost:3000 --interval 10
import { parseArgs } from 'node:util';
import { DEMO_DEVICE_KEY, PORT } from '../server/config.js';

const { values: args } = parseArgs({
  options: {
    key: { type: 'string', default: DEMO_DEVICE_KEY },
    url: { type: 'string', default: `http://localhost:${PORT}` },
    interval: { type: 'string', default: '60' }, // segundos entre envios
    leak: { type: 'boolean', default: false },
  },
});

const intervalS = Math.max(5, Number(args.interval) || 60);
const LEAK_LPM = 0.7;

// Uso em andamento (banho, louça...) que continua nos próximos envios
let active = null;

const USES = [
  { name: 'banho', lpm: 9, minutes: [6, 10], weight: 2 },
  { name: 'descarga', lpm: 6, minutes: [1, 1], weight: 5 },
  { name: 'pia', lpm: 2, minutes: [1, 2], weight: 7 },
  { name: 'louça', lpm: 4, minutes: [5, 10], weight: 1.5 },
];

function maybeStartUse() {
  const hour = new Date().getHours();
  const awake = hour >= 6 && hour < 23;
  // Chance de alguém abrir a água neste intervalo (bem menor de madrugada)
  const chance = (awake ? 0.12 : 0.005) * (intervalS / 60);
  if (Math.random() > chance) return;
  const totalWeight = USES.reduce((s, u) => s + u.weight, 0);
  let pick = Math.random() * totalWeight;
  const use = USES.find((u) => (pick -= u.weight) < 0) ?? USES[0];
  const minutes = use.minutes[0] + Math.random() * (use.minutes[1] - use.minutes[0]);
  active = { ...use, remainingS: Math.round(minutes * 60) };
  console.log(`  ↳ começou: ${use.name}`);
}

async function post(path, body) {
  const res = await fetch(args.url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Key': args.key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function tick() {
  if (!active) maybeStartUse();

  let liters = args.leak ? LEAK_LPM * (intervalS / 60) : 0;
  if (active) {
    const seconds = Math.min(intervalS, active.remainingS);
    liters += active.lpm * (seconds / 60);
    active.remainingS -= seconds;
    if (active.remainingS <= 0) active = null;
  }

  const time = new Date().toLocaleTimeString('pt-BR');
  try {
    if (liters > 0) {
      const result = await post('/api/ingest/readings', { liters: Math.round(liters * 100) / 100 });
      console.log(`${time}  ${liters.toFixed(2)} L enviados`);
      for (const a of result.newAlerts) console.log(`  ⚠ alerta criado: ${a.title}`);
    } else {
      await post('/api/ingest/heartbeat', {});
      console.log(`${time}  sem consumo (sinal de vida enviado)`);
    }
  } catch (err) {
    console.error(`${time}  falha ao enviar: ${err.message}`);
  }
}

console.log(`Simulador GotAlert → ${args.url}  (chave ${args.key}, a cada ${intervalS}s${args.leak ? ', com vazamento' : ''})`);
console.log('Ctrl+C para parar.\n');
await tick();
setInterval(tick, intervalS * 1000);
