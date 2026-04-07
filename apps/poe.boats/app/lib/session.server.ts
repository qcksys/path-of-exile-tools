import type { RouterContext } from "react-router";
import { redirect } from "react-router";
import { dbContext, envContext, serverTimingContext } from "~/context";
import { selectUserRole } from "~/db/queries/auth.queries";
import { authServer } from "~/lib/auth.server";

export interface AppSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export const requireSession = async (
  request: Request,
  context: {
    get: <T>(ctx: RouterContext<T>) => T;
  },
): Promise<AppSession> => {
  const timing = context.get(serverTimingContext);
  const env = context.get(envContext);
  const db = context.get(dbContext);

  const auth = authServer({ env, db });
  const session = await timing.time("auth", () =>
    auth.api.getSession({ headers: request.headers }),
  );

  if (!session) {
    throw redirect("/login");
  }

  const { user } = session;

  const [dbUser] = await selectUserRole(db, user.id);

  const role = dbUser?.role ?? "user";

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role,
    },
  };
};
