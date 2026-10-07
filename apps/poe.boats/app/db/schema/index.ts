import { tAuthAccount } from "~/db/schema/auth.account";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthUser } from "~/db/schema/auth.user";
import { tAuthVerification } from "~/db/schema/auth.verification";
import { tCraftingShare } from "~/db/schema/crafting.share";
import { tCraftingWorkspace } from "~/db/schema/crafting.workspace";
import { tIdolPlannerIdol } from "~/db/schema/idol-planner.idol";
import { tIdolPlannerPlacement } from "~/db/schema/idol-planner.placement";
import { tIdolPlannerPriceCache } from "~/db/schema/idol-planner.price-cache";
import { tIdolPlannerSet } from "~/db/schema/idol-planner.set";
import { tIdolPlannerSharedSet } from "~/db/schema/idol-planner.shared-set";
import { tIdolPlannerUserPrefs } from "~/db/schema/idol-planner.user-prefs";
import { tStashBasemapSnapshot } from "~/db/schema/stash.basemap-snapshot";
import { tStashCohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";

export const schema = {
    tAuthAccount,
    tAuthSession,
    tAuthUser,
    tAuthVerification,
    tCraftingWorkspace,
    tCraftingShare,
    tIdolPlannerSet,
    tIdolPlannerIdol,
    tIdolPlannerPlacement,
    tIdolPlannerUserPrefs,
    tIdolPlannerSharedSet,
    tIdolPlannerPriceCache,
    tStashUniqueHourly,
    tStashCurrencyHourly,
    tStashCohortHourly,
    tStashCohort,
    tStashBasemapSnapshot,
};
