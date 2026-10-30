import { tAuthAccount } from "~/db/schema/auth.account";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthTwoFactor } from "~/db/schema/auth.two-factor";
import { tAuthUser } from "~/db/schema/auth.user";
import { tAuthVerification } from "~/db/schema/auth.verification";
import { tCraftingShare } from "~/db/schema/crafting.share";
import { tCraftingWorkspace } from "~/db/schema/crafting.workspace";
import { tIdolPlannerIdol } from "~/db/schema/idol-planner.idol";
import { tIdolPlannerPlacement } from "~/db/schema/idol-planner.placement";
import { tIdolPlannerSet } from "~/db/schema/idol-planner.set";
import { tIdolPlannerSharedSet } from "~/db/schema/idol-planner.shared-set";
import { tIdolPlannerUserPrefs } from "~/db/schema/idol-planner.user-prefs";
import { tIngestWorker } from "~/db/schema/ingest.worker";
import {
    tStashPoe1BasemapSnapshot,
    tStashPoe2BasemapSnapshot,
} from "~/db/schema/stash.basemap-snapshot";
import {
    tStashPoe1Checkpoint,
    tStashPoe1DailySample,
    tStashPoe2Checkpoint,
    tStashPoe2DailySample,
} from "~/db/schema/stash.checkpoint";
import { tStashCohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCohortRevision } from "~/db/schema/stash.cohort-revision";
import { tStashCohortWindow } from "~/db/schema/stash.cohort-window";
import { tStashPoe1CurrencyDaily, tStashPoe2CurrencyDaily } from "~/db/schema/stash.currency-daily";
import { tStashPoe1CurrencyHour, tStashPoe2CurrencyHour } from "~/db/schema/stash.currency-hourly";
import {
    tStashPoe1CurrencyMarket,
    tStashPoe2CurrencyMarket,
} from "~/db/schema/stash.currency-market";
import { tStashPoe1HourCoverage, tStashPoe2HourCoverage } from "~/db/schema/stash.hour-coverage";
import { tStashPoe1League, tStashPoe2League } from "~/db/schema/stash.league";
import { tStashPoe1MarketDaily, tStashPoe2MarketDaily } from "~/db/schema/stash.market-daily";
import {
    tStashPoe1Market,
    tStashPoe1MarketHour,
    tStashPoe2Market,
    tStashPoe2MarketHour,
} from "~/db/schema/stash.unique-hourly";

export const schema = {
    tStashPoe1Checkpoint,
    tStashPoe2Checkpoint,
    tStashPoe1DailySample,
    tStashPoe2DailySample,
    tIngestWorker,
    tAuthAccount,
    tAuthSession,
    tAuthTwoFactor,
    tAuthUser,
    tAuthVerification,
    tCraftingWorkspace,
    tCraftingShare,
    tIdolPlannerSet,
    tIdolPlannerIdol,
    tIdolPlannerPlacement,
    tIdolPlannerUserPrefs,
    tIdolPlannerSharedSet,
    tStashPoe1Market,
    tStashPoe2Market,
    tStashPoe1MarketHour,
    tStashPoe2MarketHour,
    tStashPoe1MarketDaily,
    tStashPoe2MarketDaily,
    tStashPoe1CurrencyHour,
    tStashPoe2CurrencyHour,
    tStashPoe1CurrencyDaily,
    tStashPoe2CurrencyDaily,
    tStashPoe1CurrencyMarket,
    tStashPoe2CurrencyMarket,
    tStashPoe1HourCoverage,
    tStashPoe2HourCoverage,
    tStashPoe1League,
    tStashPoe2League,
    tStashCohortHourly,
    tStashCohortRevision,
    tStashCohortWindow,
    tStashCohort,
    tStashPoe1BasemapSnapshot,
    tStashPoe2BasemapSnapshot,
};
