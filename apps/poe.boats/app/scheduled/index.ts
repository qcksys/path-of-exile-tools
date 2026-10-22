import { openDatabase } from "~/db/client";
import { updateCurrencyExchange } from "~/scheduled/currency-exchange";
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
            case CRON_POENINJA_PRICES: {
                const results = await Promise.allSettled([
                    updateScarabPrices(database.db).then((result) => {
                        if (result.errorCount)
                            throw new Error(
                                `Scarab capture failed for ${result.errorCount} leagues.`,
                            );
                    }),
                    updateCurrencyExchange(database.db, controller.scheduledTime),
                ]);
                const failures = results.flatMap((result, index) => {
                    if (result.status === "fulfilled") return [];
                    logger.error(
                        {
                            source: index === 0 ? "scarabs" : "currency-exchange",
                            error: String(result.reason),
                        },
                        "Scheduled market capture failed",
                    );
                    return [result.reason];
                });
                if (failures.length)
                    throw new AggregateError(failures, "Scheduled market capture failed");
                break;
            }
            default:
                logger.warn({ cron: controller.cron }, "Unknown cron trigger");
        }
    } finally {
        await database.close();
    }
}
