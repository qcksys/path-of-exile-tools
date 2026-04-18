import * as fs from "node:fs";
import * as path from "node:path";
import ky from "ky";

const OUTPUT_DIR = path.join(import.meta.dirname, "../../app/data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "leagues.json");

interface LeagueResponse {
    result: Array<{
        id: string;
        realm: "pc" | "xbox" | "sony";
        text: string;
    }>;
}

const client = ky.create({
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
    },
    retry: {
        limit: 3,
        methods: ["get"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
    },
    timeout: 30000,
});

async function fetchLeagues(): Promise<LeagueResponse> {
    console.log("Fetching leagues from pathofexile.com...");

    const response = await client
        .get("https://www.pathofexile.com/api/trade/data/leagues")
        .json<LeagueResponse>();

    return response;
}

async function main() {
    try {
        const data = await fetchLeagues();

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, "\t"), "utf-8");

        console.log(`Saved ${data.result.length} leagues to ${OUTPUT_FILE}`);

        const pcLeagues = data.result.filter((l) => l.realm === "pc");
        console.log(`  PC leagues: ${pcLeagues.map((l) => l.id).join(", ")}`);
    } catch (error) {
        console.error("Failed to fetch leagues:", error);
        process.exit(1);
    }
}

main();
