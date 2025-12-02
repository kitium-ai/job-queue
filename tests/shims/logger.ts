export const getLogger = () => ({
  error: (_msg: string, _meta?: unknown) => {},
  warn: (_msg: string, _meta?: unknown) => {},
  info: (_msg: string, _meta?: unknown) => {},
  http: (_msg: string, _meta?: unknown) => {},
  debug: (_msg: string, _meta?: unknown) => {},
  withContext: <T>(_ctx: Record<string, unknown>, fn: () => T) => fn(),
  child: (_metadata: Record<string, unknown>) => getLogger(),
  close: async () => {},
});
