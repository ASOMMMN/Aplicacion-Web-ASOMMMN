import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import { mkdirSync } from 'node:fs';

/* ── Modo SOC: cuando SOC_MODE=true el dashboard spawn consume JSON ────────── */
const SOC = process.env.SOC_MODE === 'true';

/* ── Paleta ANSI (solo en modo normal) ─────────────────────────────────────── */
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[92m',
  blue: '\x1b[94m',
  yellow: '\x1b[93m',
  red: '\x1b[91m',
  magenta: '\x1b[95m',
  white: '\x1b[97m',
  gray: '\x1b[90m',
  cyan: '\x1b[96m',
} as const;

/* ── Archivo de persistencia (lazy singleton) ─────────────────────────────── */
let _fl: winston.Logger | null = null;
function fl(): winston.Logger | null {
  if (_fl) return _fl;
  try {
    mkdirSync('logs', { recursive: true });
    _fl = winston.createLogger({
      transports: [
        new winston.transports.File({
          filename: 'logs/app-error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/app.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    });
  } catch {
    /* entornos sin acceso a disco */
  }
  return _fl;
}

/* ── Emitir evento JSON para el SOC dashboard ────────────────────────────── */
function soc(type: string, data: object): void {
  process.stdout.write(
    JSON.stringify({
      type,
      timestamp: new Date().toLocaleTimeString('es-MX', { hour12: false }),
      data,
    }) + '\n',
  );
}

/* ── Helpers ANSI ────────────────────────────────────────────────────────── */
function ts(): string {
  return new Date().toLocaleTimeString('es-MX', { hour12: false });
}
function div(n = 34): string {
  return '━'.repeat(n);
}
function out(s: string): void {
  process.stdout.write(s + '\n');
}

/* ── Arte ASCII decorativo por tipo de tarjeta (13 chars por línea) ─────── */
const ART_AUTH = [
  '  .-------.  ',
  '  / o  o  \\  ',
  '  |  ___  |  ',
  '  |  \\_/  |  ',
  '  \\-------/  ',
  '  /|     |\\  ',
  ' / |     | \\ ',
];

const ART_DB = [
  '  .-------.  ',
  ' /░░░░░░░░░\\ ',
  '|░░░░░░░░░░░|',
  '|░─────────░|',
  '|░░░░░░░░░░░|',
  ' \\░░░░░░░░░/ ',
  '  .-------.  ',
];

const ART_ERR = [
  '  .-------.  ',
  '  | X   X |  ',
  '  |  ---  |  ',
  '  | (___) |  ',
  '  |       |  ',
  '  .-------.  ',
  '  [ERROR!!]  ',
];

const ART_REQ = [
  '  ○───●───○  ',
  '  │   │   │  ',
  '  ●───○───●  ',
  '  │   │   │  ',
  '  ○───●───○  ',
  '  10110 101  ',
  '  01001 010  ',
];

const ART_WARN = [
  '             ',
  '      /\\     ',
  '     /!!\\    ',
  '    /----\\   ',
  '   .------.  ',
  '             ',
  '             ',
];

/* ── Longitud visual de un string (ignora secuencias ANSI) ──────────────── */
const ANSI_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
function visLen(s: string): number {
  return s.replace(ANSI_RE, '').length;
}

/* ── Imprime líneas de contenido con arte ASCII al lado derecho ─────────── */
function printWithArt(
  lines: string[],
  art: string[],
  artColor: string,
  leftW = 44,
): void {
  const isTTY = process.stdout.isTTY === true;
  const termW = process.stdout.columns ?? 120;
  const artW = art.reduce((m, l) => Math.max(m, l.length), 0);
  const showArt = isTTY && termW >= leftW + 2 + artW;
  const count = showArt ? Math.max(lines.length, art.length) : lines.length;
  for (let i = 0; i < count; i++) {
    const line = lines[i] ?? '';
    const artLine = showArt ? art[i] : undefined;
    if (artLine !== undefined) {
      const pad = ' '.repeat(Math.max(0, leftW - visLen(line)));
      out(`${line}${pad}  ${artColor}${artLine}${C.reset}`);
    } else {
      out(line);
    }
  }
}

/* ── Interfaces públicas ─────────────────────────────────────────────────── */
export interface RequestLogOpts {
  method: string;
  route: string;
  duration: number;
  user?: string;
  status?: number;
  ip?: string;
}
export interface AuthLogOpts {
  action: string;
  user?: string;
  route?: string;
  method?: string;
  duration?: number;
  ip?: string;
}
export interface DatabaseLogOpts {
  collection: string;
  action: string;
  duration: number;
  records?: number;
}
export interface ErrorLogOpts {
  message: string;
  route?: string;
  stack?: string;
  context?: string;
  status?: number;
}
export interface SystemLogOpts {
  status: string;
  port?: number;
  env?: string;
  swagger?: boolean;
}
export interface SecurityLogOpts {
  event: string;
  user?: string;
  ip?: string;
  message?: string;
}
export interface AuditLogOpts {
  action: string;
  user?: string;
  resource?: string;
  details?: string;
}
export interface MailLogOpts {
  detalle: string;
}

/* ── LoggerService ───────────────────────────────────────────────────────── */
@Injectable()
export class LoggerService {
  /* ── Banner de inicio (solo modo normal) ─────────────────────────────── */
  static banner(opts: { port: number; env: string; swagger?: boolean }): void {
    if (SOC) return;
    const { port, env, swagger } = opts;
    const p = (label: string, w = 22) =>
      label + '.'.repeat(Math.max(2, w - label.length));
    out('');
    out(
      `  ${C.bold}${C.blue}╔══════════════════════════════════════════════╗${C.reset}`,
    );
    out(
      `  ${C.bold}${C.blue}║           ASOMMMN  ·  API SERVER             ║${C.reset}`,
    );
    out(
      `  ${C.bold}${C.blue}╚══════════════════════════════════════════════╝${C.reset}`,
    );
    out('');
    out(
      `  ${C.green}🟢${C.reset}  ${C.white}${p('NestJS')}${C.reset} ${C.bold}${C.white}Iniciado${C.reset}`,
    );
    out(
      `  ${C.green}🟢${C.reset}  ${C.white}${p('MongoDB')}${C.reset} ${C.bold}${C.white}Conectado${C.reset}`,
    );
    out(
      `  ${C.green}🟢${C.reset}  ${C.white}${p('Puerto')}${C.reset} ${C.bold}${C.white}${port}${C.reset}`,
    );
    out(
      `  ${C.green}🟢${C.reset}  ${C.white}${p('Entorno')}${C.reset} ${C.bold}${C.white}${env}${C.reset}`,
    );
    if (swagger)
      out(
        `  ${C.blue}🔵${C.reset}  ${C.white}${p('Swagger')}${C.reset} ${C.cyan}http://localhost:${port}/api-docs${C.reset}`,
      );
    out('');
    out(`  ${C.gray}${'─'.repeat(44)}${C.reset}`);
    out('');
  }

  /* ── SYSTEM ──────────────────────────────────────────────────────────── */
  static system(opts: SystemLogOpts): void {
    if (SOC) {
      soc('SYSTEM', opts);
      return;
    }
    fl()?.info('System event', { type: 'system', ...opts });
  }

  /* ── SUCCESS ─────────────────────────────────────────────────────────── */
  static success(message: string, context?: string): void {
    if (SOC) {
      soc('SUCCESS', { message, context });
      return;
    }
    out(
      `${C.gray}[${ts()}]${C.reset} ${C.green}🟢${C.reset} ${C.bold}${C.white}${message}${C.reset}${context ? ` ${C.gray}[${context}]${C.reset}` : ''}`,
    );
    fl()?.info(message, { type: 'success', context });
  }

  /* ── INFO ────────────────────────────────────────────────────────────── */
  static info(message: string, context?: string): void {
    if (SOC) {
      soc('INFO', { message, context });
      return;
    }
    out(
      `${C.gray}[${ts()}]${C.reset} ${C.blue}🔵${C.reset} ${message}${context ? ` ${C.gray}[${context}]${C.reset}` : ''}`,
    );
    fl()?.info(message, { type: 'info', context });
  }

  /* ── WARNING ─────────────────────────────────────────────────────────── */
  static warning(message: string, context?: string): void {
    if (SOC) {
      soc('WARNING', { message, context });
      return;
    }
    const lines = [
      '',
      `${C.gray}[${ts()}]${C.reset} ${C.yellow}🟡 ${C.bold}WARNING${C.reset}${context ? ` ${C.gray}[${context}]${C.reset}` : ''}`,
      `${C.yellow}${div()}${C.reset}`,
      '',
      `  ${C.yellow}${message}${C.reset}`,
      '',
      `${C.yellow}${div()}${C.reset}`,
      '',
    ];
    printWithArt(lines, ART_WARN, C.yellow);
    fl()?.warn(message, { type: 'warning', context });
  }

  /* ── DEBUG ───────────────────────────────────────────────────────────── */
  static debug(message: string, context?: string): void {
    if (SOC || process.env.NODE_ENV === 'production') return;
    out(
      `${C.gray}[${ts()}]${C.reset} ⚪ ${C.dim}${message}${C.reset}${context ? ` ${C.gray}[${context}]${C.reset}` : ''}`,
    );
  }

  /* ── REQUEST ─────────────────────────────────────────────────────────── */
  static request(opts: RequestLogOpts): void {
    if (SOC) {
      soc('REQUEST', opts);
      return;
    }
    const { method, route, user, duration, status, ip } = opts;
    const isErr = !!status && status >= 400;
    const dot = isErr ? `${C.red}🔴` : `${C.green}🟢`;
    const bar = isErr ? C.red : C.blue;
    const art = isErr ? ART_ERR : ART_REQ;
    const artColor = isErr ? C.red : C.blue;
    const lines: string[] = [
      '',
      `${C.gray}[${ts()}]${C.reset} ${dot} ${C.bold}${method}${C.reset}`,
      `${bar}${div()}${C.reset}`,
      '',
    ];
    if (user)
      lines.push(
        `  👤 ${C.gray}Usuario${C.reset}  : ${C.white}${user}${C.reset}`,
      );
    lines.push(
      `  📍 ${C.gray}Ruta${C.reset}     : ${C.cyan}${route}${C.reset}`,
    );
    lines.push(
      `  🌐 ${C.gray}Método${C.reset}   : ${C.white}${method}${C.reset}`,
    );
    if (ip)
      lines.push(
        `  🌍 ${C.gray}IP${C.reset}       : ${C.white}${ip}${C.reset}`,
      );
    if (status)
      lines.push(
        `  📊 ${C.gray}Status${C.reset}   : ${isErr ? C.red : C.green}${status}${C.reset}`,
      );
    lines.push(
      `  ⚡ ${C.gray}Tiempo${C.reset}   : ${duration < 100 ? C.green : C.yellow}${duration} ms${C.reset}`,
    );
    lines.push('', `${bar}${div()}${C.reset}`, '');
    printWithArt(lines, art, artColor);
    fl()?.info(`${method} ${route}`, { type: 'request', ...opts });
  }

  /* ── AUTH ────────────────────────────────────────────────────────────── */
  static auth(opts: AuthLogOpts): void {
    if (SOC) {
      soc('AUTH', opts);
      return;
    }
    const { action, user, route, method, duration, ip } = opts;
    const lines: string[] = [
      '',
      `${C.gray}[${ts()}]${C.reset} ${C.green}🟢 ${C.bold}${action.toUpperCase()}${C.reset}`,
      `${C.green}${div()}${C.reset}`,
      '',
    ];
    if (user)
      lines.push(
        `  👤 ${C.gray}Usuario${C.reset}  : ${C.white}${user}${C.reset}`,
      );
    if (route)
      lines.push(
        `  📍 ${C.gray}Ruta${C.reset}     : ${C.cyan}${route}${C.reset}`,
      );
    if (method)
      lines.push(
        `  🌐 ${C.gray}Método${C.reset}   : ${C.white}${method}${C.reset}`,
      );
    if (ip)
      lines.push(
        `  🌍 ${C.gray}IP${C.reset}       : ${C.white}${ip}${C.reset}`,
      );
    if (duration !== undefined)
      lines.push(
        `  ⚡ ${C.gray}Tiempo${C.reset}   : ${duration < 100 ? C.green : C.yellow}${duration} ms${C.reset}`,
      );
    lines.push('', `${C.green}${div()}${C.reset}`, '');
    printWithArt(lines, ART_AUTH, C.green);
    fl()?.info(`AUTH ${action}`, { type: 'auth', ...opts });
  }

  /* ── DATABASE ────────────────────────────────────────────────────────── */
  static database(opts: DatabaseLogOpts): void {
    if (SOC) {
      soc('DATABASE', opts);
      return;
    }
    const { collection, action, records, duration } = opts;
    const lines: string[] = [
      '',
      `${C.gray}[${ts()}]${C.reset} ${C.magenta}🟣 ${C.bold}DATABASE${C.reset}`,
      `${C.magenta}${div()}${C.reset}`,
      '',
      `  📋 ${C.gray}Colección${C.reset} : ${C.white}${collection}${C.reset}`,
      `  🔎 ${C.gray}Acción${C.reset}    : ${C.white}${action}${C.reset}`,
    ];
    if (records !== undefined)
      lines.push(
        `  📦 ${C.gray}Registros${C.reset} : ${C.white}${records}${C.reset}`,
      );
    lines.push(
      `  ⚡ ${C.gray}Tiempo${C.reset}    : ${duration < 50 ? C.green : C.yellow}${duration} ms${C.reset}`,
    );
    lines.push('', `${C.magenta}${div()}${C.reset}`, '');
    printWithArt(lines, ART_DB, C.magenta);
    fl()?.info(`DB ${action}`, { type: 'database', ...opts });
  }

  /* ── ERROR ───────────────────────────────────────────────────────────── */
  static error(opts: ErrorLogOpts): void {
    if (SOC) {
      soc('ERROR', opts);
      return;
    }
    const { route, message, stack, context, status } = opts;
    const lines: string[] = [
      '',
      `${C.gray}[${ts()}]${C.reset} ${C.red}🔴 ${C.bold}ERROR${C.reset}${context ? ` ${C.gray}[${context}]${C.reset}` : ''}`,
      `${C.red}${div()}${C.reset}`,
      '',
    ];
    if (route) {
      lines.push(
        `  ${C.red}❌ Ruta${C.reset}`,
        `  ${C.white}${route}${C.reset}`,
        '',
      );
    }
    if (status)
      lines.push(
        `  📊 ${C.gray}Status${C.reset}   : ${C.red}${status}${C.reset}`,
      );
    lines.push(
      `  ${C.red}📝 Mensaje${C.reset}`,
      `  ${C.white}${message}${C.reset}`,
    );
    if (stack) {
      lines.push('', `  ${C.red}⚡ Stack${C.reset}`);
      stack
        .split('\n')
        .slice(0, 5)
        .forEach((l) => lines.push(`  ${C.dim}${l}${C.reset}`));
    }
    lines.push('', `${C.red}${div()}${C.reset}`, '');
    printWithArt(lines, ART_ERR, C.red);
    fl()?.error(message, { type: 'error', ...opts });
  }

  /* ── SECURITY ────────────────────────────────────────────────────────── */
  static security(opts: SecurityLogOpts): void {
    if (SOC) {
      soc('SECURITY', opts);
      return;
    }
    const { event, user, ip, message } = opts;
    const lines: string[] = [
      '',
      `${C.gray}[${ts()}]${C.reset} ${C.red}🔴 ${C.bold}SECURITY: ${event}${C.reset}`,
      `${C.red}${div()}${C.reset}`,
      '',
    ];
    if (user)
      lines.push(
        `  👤 ${C.gray}Usuario${C.reset} : ${C.white}${user}${C.reset}`,
      );
    if (ip)
      lines.push(`  🌍 ${C.gray}IP${C.reset}      : ${C.white}${ip}${C.reset}`);
    if (message)
      lines.push(
        `  📝 ${C.gray}Detalle${C.reset} : ${C.yellow}${message}${C.reset}`,
      );
    lines.push('', `${C.red}${div()}${C.reset}`, '');
    printWithArt(lines, ART_ERR, C.red);
    fl()?.warn(`SECURITY: ${event}`, { type: 'security', ...opts });
  }

  /* ── AUDIT ───────────────────────────────────────────────────────────── */
  static audit(opts: AuditLogOpts): void {
    if (SOC) {
      soc('AUDIT', opts);
      return;
    }
    const { action, user, resource, details } = opts;
    out(
      `${C.gray}[${ts()}]${C.reset} ${C.cyan}🛰️  AUDIT${C.reset} ${C.bold}${action}${C.reset}` +
        (user ? ` ${C.gray}by ${user}${C.reset}` : '') +
        (resource ? ` ${C.gray}→ ${resource}${C.reset}` : '') +
        (details ? ` ${C.dim}— ${details}${C.reset}` : ''),
    );
    fl()?.info(`AUDIT: ${action}`, { type: 'audit', ...opts });
  }

  /* ── MAIL (estado del servicio de correo SMTP) ─────────────────────────── */
  static mail(opts: MailLogOpts): void {
    if (SOC) {
      soc('MAIL', opts);
      return;
    }
    const { detalle } = opts;
    const etiqueta = `${C.green}SMTP real${C.reset}`;
    out(
      `${C.gray}[${ts()}]${C.reset} 📧 ${C.bold}Servicio de correo${C.reset}: ${etiqueta} ${C.gray}— ${detalle}${C.reset}`,
    );
    fl()?.info('Correo: smtp', { type: 'mail', ...opts });
  }

  /* ── Métodos de instancia (para inyección DI) ─────────────────────────── */
  success(m: string, ctx?: string): void {
    LoggerService.success(m, ctx);
  }
  info(m: string, ctx?: string): void {
    LoggerService.info(m, ctx);
  }
  warning(m: string, ctx?: string): void {
    LoggerService.warning(m, ctx);
  }
  debug(m: string, ctx?: string): void {
    LoggerService.debug(m, ctx);
  }
  error(opts: ErrorLogOpts): void {
    LoggerService.error(opts);
  }
  request(opts: RequestLogOpts): void {
    LoggerService.request(opts);
  }
  auth(opts: AuthLogOpts): void {
    LoggerService.auth(opts);
  }
  database(opts: DatabaseLogOpts): void {
    LoggerService.database(opts);
  }
  system(opts: SystemLogOpts): void {
    LoggerService.system(opts);
  }
  security(opts: SecurityLogOpts): void {
    LoggerService.security(opts);
  }
  audit(opts: AuditLogOpts): void {
    LoggerService.audit(opts);
  }
  mail(opts: MailLogOpts): void {
    LoggerService.mail(opts);
  }
}
