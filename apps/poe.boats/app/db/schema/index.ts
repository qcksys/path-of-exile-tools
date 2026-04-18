import { tAuthAccount } from "~/db/schema/auth.account";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthUser } from "~/db/schema/auth.user";
import { tAuthVerification } from "~/db/schema/auth.verification";
import { tIdolPlannerIdol } from "~/db/schema/idol-planner.idol";
import { tIdolPlannerPlacement } from "~/db/schema/idol-planner.placement";
import { tIdolPlannerPriceCache } from "~/db/schema/idol-planner.price-cache";
import { tIdolPlannerSet } from "~/db/schema/idol-planner.set";
import { tIdolPlannerSharedSet } from "~/db/schema/idol-planner.shared-set";
import { tIdolPlannerUserPrefs } from "~/db/schema/idol-planner.user-prefs";

export const schema = {
    tAuthAccount,
    tAuthSession,
    tAuthUser,
    tAuthVerification,
    tIdolPlannerSet,
    tIdolPlannerIdol,
    tIdolPlannerPlacement,
    tIdolPlannerUserPrefs,
    tIdolPlannerSharedSet,
    tIdolPlannerPriceCache,
};
