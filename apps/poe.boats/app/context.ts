import { createContext } from "react-router";
import type { TDatabase } from "~/db/client.ts";
import type { SupportedLocale } from "~/i18n/types";
import type { ServerTiming } from "~/services/server_timing.server.ts";

export const envContext = createContext<CloudflareBindings>();

export const exeContext = createContext<ExecutionContext>();

export const dbContext = createContext<TDatabase>();

export const serverTimingContext = createContext<ServerTiming>();

export const localeContext = createContext<SupportedLocale>();
