const base = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[app] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[app] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[app] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[app] ${msg}`, ...args),
}

export function createLogger(scope: string) {
  const prefix = `[${scope}]`
  return {
    debug: (msg: string, ...args: unknown[]) => base.debug(`${prefix} ${msg}`, ...args),
    info: (msg: string, ...args: unknown[]) => base.info(`${prefix} ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => base.warn(`${prefix} ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => base.error(`${prefix} ${msg}`, ...args),
  }
}
