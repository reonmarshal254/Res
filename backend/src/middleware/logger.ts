import { Request, Response, NextFunction } from 'express';

// ANSI escape codes for clear, professional terminal output
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m\x1b[37m',
};

function getStatusBadge(code: number): string {
  if (code >= 200 && code < 300) {
    return `${ANSI.green}${ANSI.bold}[${code}]${ANSI.reset}`;
  }
  if (code >= 300 && code < 400) {
    return `${ANSI.cyan}${ANSI.bold}[${code}]${ANSI.reset}`;
  }
  if (code === 401 || code === 403) {
    return `${ANSI.magenta}${ANSI.bold}[${code} AUTH]${ANSI.reset}`;
  }
  if (code >= 400 && code < 500) {
    return `${ANSI.yellow}${ANSI.bold}[${code} WARN]${ANSI.reset}`;
  }
  return `${ANSI.bgRed}${ANSI.bold}[${code} ERROR]${ANSI.reset}`;
}

function getMethodBadge(method: string): string {
  switch (method) {
    case 'GET': return `${ANSI.cyan}${ANSI.bold}GET   ${ANSI.reset}`;
    case 'POST': return `${ANSI.green}${ANSI.bold}POST  ${ANSI.reset}`;
    case 'PUT': return `${ANSI.yellow}${ANSI.bold}PUT   ${ANSI.reset}`;
    case 'DELETE': return `${ANSI.red}${ANSI.bold}DELETE${ANSI.reset}`;
    default: return `${ANSI.white}${ANSI.bold}${method.padEnd(6)}${ANSI.reset}`;
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

  // Exclude static assets spam from terminal logs (e.g. /admin/style.css)
  const isStatic = req.url.startsWith('/admin') && (req.url.endsWith('.css') || req.url.endsWith('.js') || req.url.endsWith('.ico'));

  res.on('finish', () => {
    if (isStatic) return;

    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const statusBadge = getStatusBadge(statusCode);
    const methodBadge = getMethodBadge(req.method);
    const timeStr = `${ANSI.gray}${duration}ms${ANSI.reset}`;

    console.log(
      `${ANSI.gray}[${timestamp}]${ANSI.reset} ${methodBadge} ${req.originalUrl} -> ${statusBadge} ${timeStr}`
    );

    // If request failed with 4xx or 5xx, log brief context to help debugging
    if (statusCode >= 400 && req.method !== 'GET') {
      const sanitizedBody = { ...req.body };
      delete sanitizedBody.password;
      delete sanitizedBody.transaction_pin;
      delete sanitizedBody.pin;
      if (Object.keys(sanitizedBody).length > 0) {
        console.log(`   ${ANSI.dim}↳ Payload:${ANSI.reset}`, JSON.stringify(sanitizedBody));
      }
    }
  });

  next();
}
