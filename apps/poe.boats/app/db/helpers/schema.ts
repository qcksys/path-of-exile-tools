import { datetime } from "drizzle-orm/mysql-core";

export type TTimestampColNames = "rowCreatedAt" | "rowUpdatedAt" | "rowDeletedAt";

export const timestampCols = {
  get rowCreatedAt() {
    return datetime().defaultNow().notNull();
  },
  get rowUpdatedAt() {
    return datetime().defaultNow().onUpdateNow().notNull();
  },
  get rowDeletedAt() {
    return datetime();
  },
};
