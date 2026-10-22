type Level = 'info' | 'warn' | 'error';

const emit = (level: Level, message: string, meta?: unknown) => {
  const line = { ts: new Date().toISOString(), level, message, ...(meta ? { meta } : {}) };
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  stream(JSON.stringify(line));
};

export const logger = {
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
