import { openDatabase } from "~/db/client";
import { updateCurrencyExchange } from "~/scheduled/currency-exchange";
import { logger } from "~/services/logger";

const CRON_CURRENCY_EXCHANGE = "*/15 * * * *";

export async function handleScheduled(
    controller: ScheduledController,
    env: CloudflareBindings,
): Promise<void> {
    const database = await openDatabase(env.DATABASE_URL, env.DATABASE_DRIVER);
    try {
        switch (controller.cron) {
            case CRON_CURRENCY_EXCHANGE: {
                try {
                    await updateCurrencyExchange(database.db, controller.scheduledTime);
                } catch (error) {
                    logger.error(
                        { source: "currency-exchange", error: String(error) },
                        "Scheduled market capture failed",
                    );
                    throw new AggregateError([error], "Scheduled market capture failed");
                }
                break;
            }
            default:
                logger.warn({ cron: controller.cron }, "Unknown cron trigger");
        }
    } finally {
        await database.close();
    }
}
