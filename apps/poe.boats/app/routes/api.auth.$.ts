import { dbContext, envContext } from "~/context";
import { authServer } from "~/lib/auth.server";
import type { Route } from "./+types/api.auth.$";
export const loader = async ({ request, context }: Route.LoaderArgs) => {
  return authServer({
    env: context.get(envContext),
    db: context.get(dbContext),
  }).handler(request);
};
export const action = async ({ request, context }: Route.ActionArgs) => {
  return authServer({
    env: context.get(envContext),
    db: context.get(dbContext),
  }).handler(request);
};
