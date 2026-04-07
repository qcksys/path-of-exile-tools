import { defineRelations } from "drizzle-orm";
import { schema } from "~/db/schema";

export const relations = defineRelations(schema, (_r) => ({}));
