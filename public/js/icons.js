// Ícones em SVG (traço), no estilo dos protótipos
const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-8"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  drop: '<path d="M12 2.7s-6.5 7.1-6.5 11.8a6.5 6.5 0 0 0 13 0C18.5 9.8 12 2.7 12 2.7z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M14.5 10.4a10 10 0 0 1 4.5 2.1M2 9a15 15 0 0 1 4.2-2.7M10.7 5.1A15 15 0 0 1 22 9"/><path d="M12 20h.01"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowRight: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M2 2l20 20"/><path d="M6.7 6.7C3.9 8.4 2 12 2 12s3.5 7 10 7c2 0 3.8-.7 5.3-1.7M10 5.2c.6-.1 1.3-.2 2-.2 6.5 0 10 7 10 7s-.8 1.6-2.3 3.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  filter: '<path d="M8 3h8v3a4 4 0 0 1-1 2.6V19a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V8.6A4 4 0 0 1 8 6z"/><path d="M11 12v5M13 11v6"/>',
  box: '<path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M2 4h20v4H2z"/><path d="M10 12h4"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L2 10l8-8z" transform="scale(.9) translate(1.3 1.3)"/>',
  shower: '<path d="M4 20V8a4 4 0 0 1 4-4h1a4 4 0 0 1 4 4"/><path d="M9 8h8"/><path d="M11 12v1M14 12v1M17 12v1M12.5 16v1M15.5 16v1M14 20v1"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

// Logo: gota com exclamação, ondas de alerta e as mãos que cuidam da água
export function logo({ hands = '#ffffff' } = {}) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="ga-drop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3ABEF9"/><stop offset="1" stop-color="#3572EF"/>
      </linearGradient>
    </defs>
    <g fill="none" stroke="#3ABEF9" stroke-width="3" stroke-linecap="round">
      <path d="M14 22c-4 6-4 14 0 20"/><path d="M8.5 17c-6.5 9-6.5 21 0 30"/>
      <path d="M50 22c4 6 4 14 0 20"/><path d="M55.5 17c6.5 9 6.5 21 0 30"/>
    </g>
    <path d="M32 5S18 21 18 32a14 14 0 0 0 28 0C46 21 32 5 32 5z" fill="url(#ga-drop)"/>
    <rect x="29.5" y="18" width="5" height="15" rx="2.5" fill="#fff"/>
    <circle cx="32" cy="39.5" r="3" fill="#fff"/>
    <path d="M14 51c6-5 12-5 18 0 6-5 12-5 18 0" fill="none" stroke="${hands}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M20 57c4-2.5 8-2.5 12 0 4-2.5 8-2.5 12 0" fill="none" stroke="${hands}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
  </svg>`;
}
