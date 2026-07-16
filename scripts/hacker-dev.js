#!/usr/bin/env node
'use strict';

// ─── Dependencias ─────────────────────────────────────────────────────────
const blessed = require('blessed');
const figlet = require('figlet');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// ─── Constantes ───────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const NODE_VER = process.version;
const START_TIME = new Date();

// ─── Estado global ────────────────────────────────────────────────────────
const stats = {
  requests: 0,
  usersOnline: 0,
  dbQueries: 0,
  errors: 0,
  totalDuration: 0,
  durationCount: 0,
};

let apiReady = false;
let webReady = false;
let debugMode = false;
let silentMode = false;
let apiProc = null;
let webProc = null;

// ─── Banner figlet ─────────────────────────────────────────────────────────
let bannerLines = [];
try {
  const raw = figlet.textSync('ASOMMMN', { font: 'Small', horizontalLayout: 'fitted' });
  bannerLines = raw.split('\n').filter((l) => l.trim());
} catch {
  bannerLines = [' ASOMMMN'];
}

// ─── Pantalla Blessed ──────────────────────────────────────────────────────
const screen = blessed.screen({
  smartCSR: true,
  title: 'ASOMMMN DEV SERVER',
  fullUnicode: true,
  dockBorders: false,
  forceUnicode: true,
});

// Panel izquierdo
const leftBox = blessed.box({
  top: 0,
  left: 0,
  width: 32,
  height: '100%-2',
  border: { type: 'line' },
  style: { border: { fg: 'green' }, bg: 'black', fg: 'white' },
  tags: true,
  scrollable: false,
});

// Panel derecho (log)
const logBox = blessed.log({
  top: 0,
  left: 32,
  width: '100%-32',
  height: '100%-2',
  border: { type: 'line' },
  style: { border: { fg: 'blue' }, bg: 'black', fg: 'white' },
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  scrollbar: { style: { bg: 'green' } },
  wrap: true,
});

// Barra de estado inferior
const statusBar = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 2,
  style: { bg: 'black', fg: 'green' },
  tags: true,
  content: '',
});

screen.append(leftBox);
screen.append(logBox);
screen.append(statusBar);

// ─── Panel izquierdo ──────────────────────────────────────────────────────
function memBar(pct) {
  const n = Math.min(10, Math.max(0, Math.round(pct / 10)));
  return (
    '{green-fg}' +
    '▮'.repeat(n) +
    '{/}' +
    '{gray-fg}' +
    '░'.repeat(10 - n) +
    '{/}' +
    ' ' +
    Math.round(pct) +
    '%'
  );
}

function padDot(label, value, w) {
  const total = w || 16;
  const dots = Math.max(1, total - label.length - String(value).length);
  return label + '.'.repeat(dots) + value;
}

function updateLeft() {
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memPct = ((totalMem - freeMem) / totalMem) * 100;
  const load = os.loadavg()[0];
  const cpuPct = Math.min(100, (load / os.cpus().length) * 100);
  const avgMs =
    stats.durationCount > 0 ? Math.round(stats.totalDuration / stats.durationCount) : 0;
  const startStr = START_TIME.toLocaleTimeString('es-MX', { hour12: false });

  const lines = [];

  // Banner
  lines.push('');
  for (const l of bannerLines) {
    lines.push(' {bold}{green-fg}' + l + '{/}{/}');
  }
  lines.push('');
  lines.push('{bold}{green-fg} ▶▶ ASOMMMN SERVER ◄◄{/}{/}');
  lines.push('');

  // Estado del sistema
  lines.push('{bold}{gray-fg} ── ESTADO DEL SISTEMA ──{/}{/}');
  lines.push(
    ' ' +
      (apiReady ? '{green-fg}🟢{/}' : '{yellow-fg}🟡{/}') +
      ' ' +
      padDot('NestJS API', ':3001', 20),
  );
  lines.push(
    ' ' +
      (webReady ? '{green-fg}🟢{/}' : '{yellow-fg}🟡{/}') +
      ' ' +
      padDot('Next.js Web', ':3000', 20),
  );
  lines.push(' {green-fg}🟢{/} ' + padDot('MongoDB', 'OK', 20));
  lines.push(' {blue-fg}🔵{/} ' + padDot('Entorno', 'dev', 20));
  lines.push(' {blue-fg}🔵{/} ' + padDot('Node.js', NODE_VER, 20));
  lines.push(' {gray-fg}🕐 ' + padDot('Iniciado', startStr, 20) + '{/}');
  lines.push('');

  // Estadísticas
  lines.push('{bold}{gray-fg} ── ESTAD\xCDSTICAS ────────{/}{/}');
  lines.push(' {white-fg}' + padDot('Requests', String(stats.requests), 22) + '{/}');
  lines.push(' {white-fg}' + padDot('Online', String(stats.usersOnline), 22) + '{/}');
  lines.push(' {white-fg}' + padDot('Consultas DB', String(stats.dbQueries), 22) + '{/}');
  lines.push(
    ' {' +
      (stats.errors > 0 ? 'red' : 'white') +
      '-fg}' +
      padDot('Errores', String(stats.errors), 22) +
      '{/}',
  );
  lines.push(' {white-fg}' + padDot('Tiempo Prom', avgMs + 'ms', 22) + '{/}');
  lines.push(' Mem ' + memBar(memPct));
  lines.push(' CPU ' + memBar(cpuPct));
  lines.push('');

  // Atajos
  lines.push('{bold}{gray-fg} ── ATAJOS ───────────{/}{/}');
  lines.push(' {cyan-fg}[R]{/} Recargar servidor');
  lines.push(' {cyan-fg}[C]{/} Limpiar consola');
  lines.push(
    ' {cyan-fg}[D]{/} Debug ' + (debugMode ? '{green-fg}ON{/}' : '{gray-fg}off{/}'),
  );
  lines.push(
    ' {cyan-fg}[S]{/} Silent ' + (silentMode ? '{yellow-fg}ON{/}' : '{gray-fg}off{/}'),
  );
  lines.push(' {cyan-fg}[Q]{/} Salir');

  leftBox.setContent(lines.join('\n'));
  screen.render();
}

// ─── Barra de estado ──────────────────────────────────────────────────────
function updateStatus(msg) {
  const now = new Date().toLocaleTimeString('es-MX', { hour12: false });
  statusBar.setContent(
    '{black-bg}{green-fg}⬛ ASOMMMN DEV SERVER [{/}' +
      '{bold}{green-fg}' +
      now +
      '{/}{green-fg}]  ▶ ' +
      msg +
      '  ' +
      '{/}{cyan-fg}[R]{/}{gray-fg} Recargar  {/}{cyan-fg}[C]{/}{gray-fg} Limpiar  {/}' +
      '{cyan-fg}[D]{/}{gray-fg} Debug  {/}{cyan-fg}[S]{/}{gray-fg} Silent  {/}' +
      '{cyan-fg}[Q]{/}{gray-fg} Salir{/}',
  );
  screen.render();
}

// ─── Log helpers ──────────────────────────────────────────────────────────
function appendLog(line) {
  if (silentMode) return;
  logBox.log(line);
}

function ts() {
  return new Date().toLocaleTimeString('es-MX', { hour12: false });
}

// ─── Parseo eventos API (JSON SOC_MODE) ───────────────────────────────────
function handleApiEvent(event) {
  const t = event.timestamp || ts();
  const d = event.data || {};

  switch (event.type) {
    case 'SYSTEM': {
      if (d.status === 'ready') {
        apiReady = true;
        updateLeft();
      }
      const portStr = d.port ? ':' + d.port : '';
      appendLog(
        '{gray-fg}[' +
          t +
          ']{/} {bold}{green-fg}● SYSTEM{/}{/}' +
          '  {green-fg}▶ API lista' +
          portStr +
          '{/}',
      );
      break;
    }

    case 'AUTH': {
      if (d.action === 'LOGIN' || d.action === 'REGISTER') stats.usersOnline++;
      if (d.action === 'LOGOUT') stats.usersOnline = Math.max(0, stats.usersOnline - 1);
      appendLog('');
      appendLog(
        '{gray-fg}[' +
          t +
          ']{/} {bold}{green-fg}● LOGIN{/}{/}' +
          '  {green-fg}▶ ' +
          (d.action || 'Auth') +
          '{/}',
      );
      if (d.user) appendLog('  {gray-fg}Usuario{/} : {white-fg}' + d.user + '{/}');
      if (d.route) appendLog('  {gray-fg}Ruta{/}    : {cyan-fg}' + d.route + '{/}');
      if (d.method) appendLog('  {gray-fg}M\xE9todo{/}  : {white-fg}' + d.method + '{/}');
      if (d.ip) appendLog('  {gray-fg}IP{/}      : {white-fg}' + d.ip + '{/}');
      if (d.duration != null) {
        appendLog(
          '  {gray-fg}Tiempo{/}  : {' +
            (d.duration < 100 ? 'green' : 'yellow') +
            '-fg}' +
            d.duration +
            'ms{/}',
        );
        stats.totalDuration += d.duration;
        stats.durationCount++;
      }
      appendLog('');
      updateLeft();
      break;
    }

    case 'DATABASE': {
      stats.dbQueries++;
      appendLog('');
      appendLog(
        '{gray-fg}[' +
          t +
          ']{/} {bold}{magenta-fg}● DATABASE{/}{/}' +
          '  {magenta-fg}▶ Consulta ejecutada{/}',
      );
      if (d.collection) appendLog('  {gray-fg}Tabla{/}    : {white-fg}' + d.collection + '{/}');
      if (d.action) appendLog('  {gray-fg}Acci\xF3n{/}   : {white-fg}' + d.action + '{/}');
      if (d.records != null) appendLog('  {gray-fg}Registros{/}: {white-fg}' + d.records + '{/}');
      if (d.duration != null) {
        appendLog(
          '  {gray-fg}Duraci\xF3n{/} : {' +
            (d.duration < 50 ? 'green' : 'yellow') +
            '-fg}' +
            d.duration +
            'ms{/}',
        );
        stats.totalDuration += d.duration;
        stats.durationCount++;
      }
      appendLog('');
      updateLeft();
      break;
    }

    case 'REQUEST': {
      stats.requests++;
      if (d.duration != null) {
        stats.totalDuration += d.duration;
        stats.durationCount++;
      }
      const isErr = d.status && d.status >= 400;
      if (isErr) stats.errors++;
      const col = isErr ? 'red' : 'blue';
      appendLog(
        '{gray-fg}[' +
          t +
          ']{/} {bold}{' +
          col +
          '-fg}● REQUEST{/}{/}' +
          '  {white-fg}' +
          (d.method || '') +
          '{/}' +
          ' {cyan-fg}' +
          (d.route || '') +
          '{/}' +
          ' {' +
          (isErr ? 'red' : 'green') +
          '-fg}' +
          (d.status || '') +
          '{/}' +
          ' {gray-fg}' +
          (d.duration != null ? d.duration + 'ms' : '') +
          '{/}' +
          (d.user ? '  {gray-fg}' + d.user + '{/}' : ''),
      );
      updateLeft();
      break;
    }

    case 'WARNING': {
      appendLog('');
      appendLog(
        '{gray-fg}[' +
          t +
          ']{/} {bold}{yellow-fg}● WARNING{/}{/}' +
          (d.context ? '  {gray-fg}[' + d.context + ']{/}' : ''),
      );
      if (d.message) appendLog('  {yellow-fg}' + d.message + '{/}');
      appendLog('');
      break;
    }

    case 'ERROR': {
      stats.errors++;
      appendLog('');
      appendLog(
        '{gray-fg}[' +
          t +
          ']{/} {bold}{red-fg}● ERROR{/}{/}' +
          (d.context ? '  {gray-fg}[' + d.context + ']{/}' : ''),
      );
      if (d.route) appendLog('  {gray-fg}Ruta{/}    : {white-fg}' + d.route + '{/}');
      if (d.status) appendLog('  {gray-fg}Status{/}  : {red-fg}' + d.status + '{/}');
      if (d.message) appendLog('  {red-fg}' + d.message + '{/}');
      appendLog('');
      updateLeft();
      break;
    }

    case 'SECURITY': {
      stats.errors++;
      appendLog(
        '{gray-fg}[' +
          t +
          ']{/} {bold}{red-fg}● SECURITY{/}{/}' +
          '  {red-fg}' +
          (d.event || '') +
          '{/}',
      );
      if (d.user) appendLog('  {gray-fg}Usuario{/} : {white-fg}' + d.user + '{/}');
      if (d.ip) appendLog('  {gray-fg}IP{/}      : {white-fg}' + d.ip + '{/}');
      updateLeft();
      break;
    }

    case 'AUDIT': {
      appendLog(
        '{gray-fg}[' +
          t +
          ']{/} {cyan-fg}● AUDIT{/}' +
          '  ' +
          (d.action || '') +
          (d.user ? ' {gray-fg}por ' + d.user + '{/}' : '') +
          (d.resource ? ' → ' + d.resource : ''),
      );
      break;
    }

    case 'MAIL': {
      appendLog(
        '{gray-fg}[' + t + ']{/} {bold}{cyan-fg}● MAIL{/}{/}' + '  📧 {green-fg}SMTP real{/}',
      );
      if (d.detalle) appendLog('  {gray-fg}' + d.detalle + '{/}');
      break;
    }

    default:
      if (debugMode)
        appendLog('{gray-fg}[' + t + '] [' + event.type + '] ' + JSON.stringify(d) + '{/}');
  }
}

// ─── Parseo salida Next.js ─────────────────────────────────────────────────
const RE_HTTP = /^\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)\s+(\d+)\s+in\s+(\d+)ms/i;
const RE_READY = /ready|started server on|listening on/i;
const RE_COMPILE = /Compiling|compiled|wait\s+compiling/i;
const RE_ERR = /\berror\b|\bfailed\b/i;

function handleWebLine(raw) {
  // Strip ANSI codes
  const line = raw.replace(/\x1B\[[0-9;]*m/g, '').trim();
  if (!line) return;

  const now = ts();

  const httpMatch = line.match(RE_HTTP);
  if (httpMatch) {
    stats.requests++;
    const [, method, route, statusStr, durStr] = httpMatch;
    const status = parseInt(statusStr);
    const dur = parseInt(durStr);
    const isErr = status >= 400;
    if (isErr) stats.errors++;
    stats.totalDuration += dur;
    stats.durationCount++;
    appendLog(
      '{gray-fg}[' +
        now +
        ']{/} {bold}{blue-fg}● DASHBOARD{/}{/}' +
        '  {white-fg}' +
        method +
        '{/}' +
        ' {cyan-fg}' +
        route +
        '{/}' +
        ' {' +
        (isErr ? 'red' : 'green') +
        '-fg}' +
        status +
        '{/}' +
        ' {gray-fg}' +
        dur +
        'ms{/}',
    );
    updateLeft();
    return;
  }

  if (RE_READY.test(line)) {
    webReady = true;
    appendLog(
      '{gray-fg}[' + now + ']{/} {bold}{blue-fg}● SYSTEM{/}{/}' + '  {blue-fg}▶ ' + line + '{/}',
    );
    updateLeft();
    return;
  }

  if (RE_COMPILE.test(line)) {
    appendLog('{gray-fg}[' + now + '] ◦ {dim}' + line + '{/}');
    return;
  }

  if (RE_ERR.test(line)) {
    stats.errors++;
    appendLog(
      '{gray-fg}[' + now + ']{/} {red-fg}● ERROR{/}  {red-fg}' + line + '{/}',
    );
    updateLeft();
    return;
  }

  if (debugMode) {
    appendLog('{gray-fg}[' + now + '] ◦ {dim}' + line + '{/}');
  }
}

// ─── Spawn servidores ──────────────────────────────────────────────────────
function startServers() {
  apiReady = false;
  webReady = false;

  // API — con SOC_MODE=true para recibir eventos JSON
  apiProc = spawn('npm', ['run', 'dev:api'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { SOC_MODE: 'true', FORCE_COLOR: '0' }),
    shell: IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  apiProc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const ev = JSON.parse(t);
        handleApiEvent(ev);
      } catch {
        // El API emite algunos mensajes de NestJS antes de que arranque SOC
        const now = ts();
        if (debugMode) appendLog('{gray-fg}[' + now + '] [api] ' + t + '{/}');
      }
    }
  });

  apiProc.stderr.on('data', (chunk) => {
    if (!debugMode) return;
    const now = ts();
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (t) appendLog('{gray-fg}[' + now + '] [api/err] {dim}' + t + '{/}');
    }
  });

  apiProc.on('close', (code) => {
    apiReady = false;
    updateLeft();
    if (code && code !== 0) {
      appendLog('{red-fg}[API] Proceso terminó con código ' + code + '{/}');
    }
  });

  // Web — Next.js dev server
  webProc = spawn('npm', ['run', 'dev:web'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { FORCE_COLOR: '0' }),
    shell: IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  webProc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) handleWebLine(line);
  });

  webProc.stderr.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) handleWebLine(line);
  });

  webProc.on('close', (code) => {
    webReady = false;
    updateLeft();
    if (code && code !== 0) {
      appendLog('{red-fg}[WEB] Proceso terminó con código ' + code + '{/}');
    }
  });
}

function killServers() {
  if (apiProc) {
    try {
      apiProc.kill();
    } catch {}
    apiProc = null;
  }
  if (webProc) {
    try {
      webProc.kill();
    } catch {}
    webProc = null;
  }
}

function restartServers() {
  appendLog('{yellow-fg}▶ Reiniciando servidores...{/}');
  killServers();
  stats.requests = 0;
  stats.usersOnline = 0;
  stats.dbQueries = 0;
  stats.errors = 0;
  stats.totalDuration = 0;
  stats.durationCount = 0;
  updateLeft();
  setTimeout(startServers, 1200);
}

// ─── Atajos de teclado ────────────────────────────────────────────────────
screen.key(['q', 'Q', 'C-c'], () => {
  killServers();
  screen.destroy();
  process.exit(0);
});

screen.key(['r', 'R'], () => {
  restartServers();
  updateStatus('Reiniciando...');
});

screen.key(['c', 'C'], () => {
  logBox.setContent('');
  screen.render();
});

screen.key(['d', 'D'], () => {
  debugMode = !debugMode;
  updateLeft();
  updateStatus('Debug ' + (debugMode ? 'ACTIVADO' : 'desactivado'));
});

screen.key(['s', 'S'], () => {
  silentMode = !silentMode;
  updateLeft();
  updateStatus('Logs ' + (silentMode ? 'SILENCIADOS' : 'activados'));
});

// ─── Actualizador de stats ─────────────────────────────────────────────────
setInterval(updateLeft, 4000);
setInterval(() => {
  const now = ts();
  updateStatus('Esperando conexiones...');
  const statusMsg =
    'API ' + (apiReady ? '{green-fg}OK{/}' : '{yellow-fg}arranc.{/}') +
    '  Web ' + (webReady ? '{green-fg}OK{/}' : '{yellow-fg}arranc.{/}');
  statusBar.setContent(
    '{black-bg}{green-fg}⬛ ASOMMMN DEV SERVER [{/}{bold}{green-fg}' +
      now +
      '{/}{green-fg}]  ▶ ' +
      statusMsg +
      '  {/}{cyan-fg}[R]{/}{gray-fg} Recargar  {/}{cyan-fg}[C]{/}{gray-fg} Limpiar  ' +
      '{/}{cyan-fg}[D]{/}{gray-fg} Debug  {/}{cyan-fg}[S]{/}{gray-fg} Silent  ' +
      '{/}{cyan-fg}[Q]{/}{gray-fg} Salir{/}',
  );
  screen.render();
}, 1000);

// ─── Inicio ────────────────────────────────────────────────────────────────
updateLeft();
updateStatus('Iniciando servidores...');

appendLog('');
appendLog(
  '{bold}{green-fg}  🚀 SERVIDOR INICIADO CORRECTAMENTE{/}{/}',
);
appendLog('  {cyan-fg}http://localhost:3000{/}');
appendLog('  {gray-fg}MODO: □ HACKER{/}');
appendLog('');
appendLog('{gray-fg}' + '─'.repeat(60) + '{/}');
appendLog('');

screen.render();
startServers();
