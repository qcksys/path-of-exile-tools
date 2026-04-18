import { createDbConnection } from "~/db/client";
import { updateScarabPrices } from "~/scheduled/poeninja";
import { logger } from "~/services/logger";

const CRON_POENINJA_PRICES = "*/15 * * * *";

export async function handleScheduled(
    controller: ScheduledController,
    env: CloudflareBindings,
): Promise<void> {
    const db = createDbConnection(env.DATABASE_URL);

    switch (controller.cron) {
        case CRON_POENINJA_PRICES:
            await updateScarabPrices(db);
            break;
        default:
            logger.warn({ cron: controller.cron }, "Unknown cron trigger");
    }
}
