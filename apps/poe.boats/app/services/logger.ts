import { env } from "cloudflare:workers";

const LEVELS = { debug: 0, info: 1, log: 2, warn: 3, error: 4 } as const;
type LogLevel = keyof typeof LEVELS;

type TLogArg = { message: string; [key: string]: unknown };

const isEnabled = (level: LogLevel): boolean => {
  const min = LEVELS[env.LOG_LEVEL as LogLevel] ?? LEVELS.warn;
  return LEVELS[level] >= min;
};

const emit = (level: LogLevel, fn: (...args: unknown[]) => void, arg: TLogArg) => {
  if (!isEnabled(level)) return;
  fn(arg);
};

export const logger = {
  debug: (arg: TLogArg) => emit("debug", console.debug, arg),
  info: (arg: TLogArg) => emit("info", console.info, arg),
  log: (arg: TLogArg) => emit("log", console.log, arg),
  warn: (arg: TLogArg) => emit("warn", console.warn, arg),
  error: (arg: TLogArg) => emit("error", console.error, arg),
};
