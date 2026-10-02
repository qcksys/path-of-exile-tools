import * as fs from "node:fs";
import * as path from "node:path";
import { Command, runCli } from "@poe-tools/cli";
import ky from "ky";

const OUTPUT_DIR = path.join(import.meta.dirname, "../../app/data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "api.trade.data.stats.json");

interface TradeStatEntry {
    id: string;
    text: string;
    type: string;
}

interface TradeStatCategory {
    id: string;
    label: string;
    entries: TradeStatEntry[];
}

interface TradeStatsResponse {
    result: TradeStatCategory[];
}

const client = ky.create({
    headers: {
        "User-Agent": "poe-idol-planner/1.0",
        Accept: "application/json",
    },
    retry: {
        limit: 3,
        methods: ["get"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
    },
    timeout: 30000,
});

async function fetchTradeStats(): Promise<TradeStatsResponse> {
    console.log("Fetching trade stats from pathofexile.com...");

    const response = await client
        .get("https://www.pathofexile.com/api/trade/data/stats")
        .json<TradeStatsResponse>();

    return response;
}

async function main() {
    try {
        const data = await fetchTradeStats();

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(data, null, "\t")}\n`, "utf-8");

        const totalEntries = data.result.reduce((sum, cat) => sum + cat.entries.length, 0);

        console.log(`Saved ${data.result.length} categories to ${OUTPUT_FILE}`);
        console.log(`  Total stat entries: ${totalEntries}`);
        console.log(
            `  Categories: ${data.result.map((c) => `${c.label} (${c.entries.length})`).join(", ")}`,
        );
    } catch (error) {
        console.error("Failed to fetch trade stats:", error);
        process.exit(1);
    }
}

const program = new Command()
    .name("trade-stats-fetcher")
    .description("Fetch trade-stats data from the official trade API")
    .action(main);
process.exitCode = await runCli(program);
