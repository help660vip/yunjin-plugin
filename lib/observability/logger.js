export function createLogger(prefix = 'YunJin') {
  const write = (level, message, meta) => {
    const suffix = meta === undefined ? '' : ` ${JSON.stringify(meta)}`;
    const line = `[${prefix}] ${message}${suffix}`;
    (console[level] ?? console.log)(line);
  };
  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta)
  };
}
