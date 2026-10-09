import { openDatabase } from "~/db/client";
import { updateScarabPrices } from "~/scheduled/poeninja";
import { logger } from "~/services/logger";

const CRON_POENINJA_PRICES = "*/15 * * * *";

export async function handleScheduled(
    controller: ScheduledController,
    env: CloudflareBindings,
): Promise<void> {
    const database = await openDatabase(env.DATABASE_URL, env.DATABASE_DRIVER);
    try {
        switch (controller.cron) {
            case CRON_POENINJA_PRICES:
                await updateScarabPrices(database.db);
                break;
            default:
                logger.warn({ cron: controller.cron }, "Unknown cron trigger");
        }
    } finally {
        await database.close();
    }
}
