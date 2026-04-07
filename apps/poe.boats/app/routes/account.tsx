import { requireSession } from "~/lib/session.server";
import type { Route } from "./+types/account";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
  const session = await requireSession(request, context);
  return { user: session.user };
};

const Account = ({ loaderData }: Route.ComponentProps) => {
  const { user } = loaderData;

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="font-heading text-2xl font-bold mb-6">Account</h1>
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div>
          <span className="text-muted-foreground text-sm">Name</span>
          <p className="font-medium">{user.name}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-sm">Email</span>
          <p className="font-medium">{user.email}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-sm">Role</span>
          <p className="font-medium capitalize">{user.role}</p>
        </div>
      </div>
    </main>
  );
};

export default Account;
