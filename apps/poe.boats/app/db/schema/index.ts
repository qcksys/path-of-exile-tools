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
import { tIngestWorker } from "~/db/schema/ingest.worker";
import { tStashBasemapSnapshot } from "~/db/schema/stash.basemap-snapshot";
import { tStashCheckpoint, tStashDailySample } from "~/db/schema/stash.checkpoint";
import { tStashCohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCohortRevisionHour } from "~/db/schema/stash.cohort-revision-hour";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashCurrencyLatest } from "~/db/schema/stash.currency-latest";
import { tStashCurrencyMarket } from "~/db/schema/stash.currency-market";
import { tStashHourCoverage } from "~/db/schema/stash.hour-coverage";
import { tStashUniqueDaily } from "~/db/schema/stash.unique-daily";
import { tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";

export const schema = {
    tStashCheckpoint,
    tStashDailySample,
    tIngestWorker,
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
    tStashUniqueDaily,
    tStashCurrencyHourly,
    tStashCurrencyLatest,
    tStashCurrencyMarket,
    tStashHourCoverage,
    tStashCohortHourly,
    tStashCohortRevisionHour,
    tStashCohort,
    tStashBasemapSnapshot,
};
