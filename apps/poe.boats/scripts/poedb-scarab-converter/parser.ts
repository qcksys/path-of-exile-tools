import type { RawScarab } from "./types.ts";

function extractCategoryFromId(id: string): string {
    // Extract category from scarab ID (e.g., "breach_scarab" -> "breach")
    const match = id.match(/^(\w+)_scarab/i);
    if (match) {
        return match[1].toLowerCase();
    }
    // Handle "horned_scarab_of_x" pattern
    if (id.startsWith("horned_scarab")) {
        return "horned";
    }
    return "other";
}

function normalizeEffect(effectHtml: string): string {
    // Convert <br /> to newlines and clean up HTML
    return effectHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function parseScarabPage(html: string): RawScarab[] {
    const scarabs: RawScarab[] = [];

    // Find the ScarabsItem section - the ID varies by locale
    // English: id="ScarabsItem", Chinese: id="聖甲蟲物品", etc.
    // Look for the first tab pane with scarab items
    const scarabsItemMatch = html.match(
        /<div id="[^"]*"[^>]*class="tab-pane fade show active">([\s\S]*?)(?=<\/div><div id="|<div class="tab-content">|$)/,
    );
    if (!scarabsItemMatch) {
        console.error("Could not find scarab items tab pane");
        return [];
    }

    const scarabsHtml = scarabsItemMatch[1];

    // Use regex to extract each scarab item
    const itemPattern =
        /<div class="col"><div class="d-flex border-top rounded">([\s\S]*?)<\/div><\/div>(?=<div class="col">|$)/g;

    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
    while ((match = itemPattern.exec(scarabsHtml)) !== null) {
        const itemHtml = match[1];

        try {
            // Extract image URL (inside img tag)
            const imgMatch = itemHtml.match(/src="(https:\/\/cdn\.poedb\.tw\/image\/[^"]+\.webp)"/);
            const imageUrl = imgMatch?.[1] || "";

            // Extract the href link to get the English scarab page name (stable across locales)
            // Look for pattern like href="Breach_Scarab" or href="Breach_Scarab_of_the_Dreamer"
            const hrefMatch = itemHtml.match(
                /<div class="flex-grow-1[^>]*"><a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/,
            );
            const hrefPath = hrefMatch?.[1] || "";
            const name = hrefMatch?.[2]?.trim() || "";

            if (!name || !imageUrl || !hrefPath) continue;

            // Generate ID from href path (which is the English scarab name)
            // e.g., "Breach_Scarab_of_the_Dreamer" -> "breach_scarab_of_the_dreamer"
            const id = hrefPath.toLowerCase();

            // Extract limit - handle different languages
            // English: "Limit:", Chinese: "上限:", etc.
            const limitMatch = itemHtml.match(
                /<span class='colourDefault'>(\d+)<\/span><\/div><div class="separator">/,
            );
            const limit = limitMatch ? Number.parseInt(limitMatch[1], 10) : 5;

            // Extract effect from explicitMod
            const effectMatch = itemHtml.match(/<div class="explicitMod">([\s\S]*?)<\/div>/);
            const effectHtml = effectMatch?.[1] || "";
            const effect = normalizeEffect(effectHtml);

            if (!effect) continue;

            // Extract category from ID (uses English name so categories stay consistent)
            const category = extractCategoryFromId(id);

            scarabs.push({
                id,
                name,
                effect,
                category,
                imageUrl,
                limit,
            });
        } catch (error) {
            console.error("Error parsing scarab item:", error);
        }
    }

    return scarabs;
}
