import { tAuthAccount } from "~/db/schema/auth.account";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthUser } from "~/db/schema/auth.user";
import { tAuthVerification } from "~/db/schema/auth.verification";

export const schema = {
  tAuthAccount,
  tAuthSession,
  tAuthUser,
  tAuthVerification,
};
