import { parseHTML } from "linkedom";
import type {
    IdolBaseType,
    Locale,
    ParsedPage,
    RawModifier,
    UniqueIdol,
    ValueRange,
} from "./types.ts";
import { IDOL_BASE_TYPES } from "./types.ts";

interface PoedbModifier {
    Name: string;
    Level: string;
    ModGenerationTypeID: string;
    ModFamilyList: string[];
    DropChance: number;
    str: string;
    hover?: string;
}

interface ModsViewData {
    baseitem?: {
        Code?: string;
    };
    normal?: PoedbModifier[];
}

const IDOL_PAGE_TO_TYPE: Record<string, IdolBaseType> = {
    Minor_Idol: "Minor",
    Noble_Idol: "Noble",
    Kamasan_Idol: "Kamasan",
    Burial_Idol: "Burial",
    Totemic_Idol: "Totemic",
    Conqueror_Idol: "Conqueror",
};

function extractValues(text: string): ValueRange[] {
    const values: ValueRange[] = [];
    const plainText = text.replace(/<[^>]*>/g, "");

    const rangePattern = /\((\d+(?:\.\d+)?)[—–-](\d+(?:\.\d+)?)\)/g;
    for (const match of plainText.matchAll(rangePattern)) {
        values.push({
            min: Number.parseFloat(match[1]),
            max: Number.parseFloat(match[2]),
        });
    }

    return values;
}

function normalizeModText(html: string): string {
    return (
        html
            // Remove entire <span class="secondary">...</span> (internal poedb metadata)
            .replace(/<span[^>]*class=['"]secondary['"][^>]*>[\s\S]*?<\/span>/gi, "")
            // Remove opening mod-value spans (we want to keep the content)
            .replace(/<span[^>]*class=['"]mod-value['"][^>]*>/gi, "")
            .replace(/<\/span>/gi, "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim()
    );
}

// All known mechanics that can be extracted from modFamily or text
const KNOWN_MECHANICS = [
    "abyss",
    "anarchy",
    "ascendancy",
    "bestiary",
    "betrayal",
    "beyond",
    "blight",
    "breach",
    "cleansing",
    "conqueror",
    "delirium",
    "delve",
    "elder",
    "essence",
    "expedition",
    "fortune",
    "harbinger",
    "harvest",
    "heist",
    "incursion",
    "legion",
    "maven",
    "ritual",
    "scarab",
    "scouting",
    "settlers",
    "shaper",
    "shrine",
    "strongbox",
    "synthesis",
    "tangle",
    "torment",
    "ultimatum",
    "vaal",
    "zana",
] as const;

function detectMechanicFromModFamily(modFamily: string): string | null {
    // Remove "MapRelic" prefix and convert to lowercase for matching
    const normalized = modFamily.replace(/^MapRelic/, "").toLowerCase();

    // Check if the modFamily starts with a known mechanic
    for (const mechanic of KNOWN_MECHANICS) {
        if (normalized.startsWith(mechanic)) {
            return mechanic;
        }
    }

    // Handle typos in poedb data
    if (normalized.startsWith("beastiary") || normalized.startsWith("besitary")) {
        return "bestiary";
    }

    return null;
}

function detectMechanicFromText(text: string): string {
    const lowerText = text.toLowerCase();

    // Check multi-word phrases first (order matters - check before single words)
    const phraseKeywords: Record<string, string[]> = {
        anarchy: ["rogue exile"],
    };

    for (const [mechanic, keywords] of Object.entries(phraseKeywords)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                return mechanic;
            }
        }
    }

    // Then check single-word keywords
    // Note: Order matters - more specific mechanics should come before generic ones
    const mechanicKeywords: Record<string, string[]> = {
        abyss: ["abyss", "abyssal"],
        bestiary: ["bestiary", "einhar", "beast"],
        betrayal: ["betrayal", "syndicate", "safehouse", "jun"],
        beyond: ["beyond", "demon"],
        blight: ["blight", "tower", "blighted"],
        breach: ["breach", "breachstone"],
        conqueror: ["conqueror", "influenced", "elderslayer"],
        delirium: ["delirium", "simulacrum", "delirious"],
        delve: ["delve", "sulphite", "darkness", "niko"],
        elder: ["elder", "shaper"],
        essence: ["essence"],
        expedition: ["expedition", "artifact", "logbook"],
        harbinger: ["harbinger"],
        harvest: ["harvest", "lifeforce"],
        heist: ["heist", "blueprint", "contract", "rogue"],
        incursion: ["incursion", "temple", "alva"],
        legion: ["legion", "incubator", "splinter"],
        maven: ["maven", "witnessed"],
        ritual: ["ritual", "tribute"],
        scarab: ["scarab"],
        settlers: ["settlers", "shipment"],
        shrine: ["shrine"],
        strongbox: ["strongbox"],
        torment: ["torment", "possessed", "spirit"],
        ultimatum: ["ultimatum"],
    };

    for (const [mechanic, keywords] of Object.entries(mechanicKeywords)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                return mechanic;
            }
        }
    }

    // Fall back to "map" for generic map mods (contains "maps" but no specific mechanic)
    if (lowerText.includes("map") || lowerText.includes("atlas")) {
        return "map";
    }

    return "generic";
}

function detectMechanic(modFamily: string, text: string): string {
    // First try to extract mechanic from modFamily (more reliable)
    const fromFamily = detectMechanicFromModFamily(modFamily);
    if (fromFamily) {
        return fromFamily;
    }

    // Fall back to text-based detection
    return detectMechanicFromText(text);
}

function extractModsViewJson(html: string): ModsViewData | null {
    const startMarker = "new ModsView(";
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) {
        return null;
    }

    const jsonStart = startIdx + startMarker.length;
    let depth = 0;
    let endIdx = jsonStart;

    for (let i = jsonStart; i < html.length; i++) {
        const char = html[i];
        if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth--;
            if (depth === 0) {
                endIdx = i + 1;
                break;
            }
        }
    }

    const jsonStr = html.substring(jsonStart, endIdx);

    try {
        return JSON.parse(jsonStr) as ModsViewData;
    } catch {
        console.error("Failed to parse ModsView JSON");
        return null;
    }
}

function generateModId(modFamily: string, type: string): string {
    const slug = modFamily
        .replace(/^MapRelic/, "")
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "")
        .replace(/_+/g, "_");
    return `${type}_${slug}`;
}

function parseUniqueIdolsFromHtml(html: string, locale: Locale): UniqueIdol[] {
    const { document } = parseHTML(html);
    const uniques: UniqueIdol[] = [];

    const uniqueItems = document.querySelectorAll(".row.row-cols-1.row-cols-lg-2 > .col");

    for (const item of uniqueItems) {
        const nameEl = item.querySelector(".uniqueName");
        const name = nameEl?.textContent?.trim();
        if (!name) continue;

        const baseTypeEl = item.querySelector(".uniqueTypeLine");
        const baseTypeText = baseTypeEl?.textContent?.trim() || "";
        let baseType: IdolBaseType = "Minor";
        for (const type of IDOL_BASE_TYPES) {
            if (baseTypeText.toLowerCase().includes(type.toLowerCase())) {
                baseType = type;
                break;
            }
        }

        const linkEl = item.querySelector("a.uniqueitem[href]");
        const href = linkEl?.getAttribute("href") || "";
        const idFromHref = href.split("/").pop() || "";
        const id =
            idFromHref ||
            name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_|_$/g, "");

        const implicitMods = item.querySelectorAll(".implicitMod");
        const explicitMods = item.querySelectorAll(".explicitMod");

        const modifiers: {
            text: Record<Locale, string>;
            values: ValueRange[];
        }[] = [];

        for (const modEl of implicitMods) {
            const modText = normalizeModText(modEl.innerHTML);
            if (modText) {
                modifiers.push({
                    text: { [locale]: modText } as Record<Locale, string>,
                    values: extractValues(modEl.innerHTML),
                });
            }
        }

        for (const modEl of explicitMods) {
            const modText = normalizeModText(modEl.innerHTML);
            const descriptionEl = modEl.querySelector(".item_description");
            const secondaryEl = modEl.querySelector(".secondary");
            if (descriptionEl || secondaryEl) {
                continue;
            }
            if (modText) {
                modifiers.push({
                    text: { [locale]: modText } as Record<Locale, string>,
                    values: extractValues(modEl.innerHTML),
                });
            }
        }

        uniques.push({
            id,
            name: { [locale]: name } as Record<Locale, string>,
            baseType,
            modifiers,
        });
    }

    return uniques;
}

export function parseIdolPage(html: string, locale: Locale, idolPage: string): ParsedPage {
    const modsViewData = extractModsViewJson(html);

    if (!modsViewData || !modsViewData.normal) {
        console.warn(`No ModsView data found for ${idolPage}`);
        return { modifiers: [], uniqueIdols: [] };
    }

    const idolType = IDOL_PAGE_TO_TYPE[idolPage];
    if (!idolType) {
        console.warn(`Unknown idol page: ${idolPage}`);
        return { modifiers: [], uniqueIdols: [] };
    }

    const modifiers: RawModifier[] = [];

    for (const mod of modsViewData.normal) {
        const type = mod.ModGenerationTypeID === "1" ? "prefix" : "suffix";
        const modText = normalizeModText(mod.str);
        const values = extractValues(mod.str);
        const levelReq = Number.parseInt(mod.Level, 10) || 68;
        const modFamily = mod.ModFamilyList?.[0] || mod.Name;
        const mechanic = detectMechanic(modFamily, modText);

        modifiers.push({
            modId: generateModId(modFamily, type),
            type,
            name: mod.Name,
            tier: 1,
            levelReq,
            mechanic,
            text: modText,
            values,
            weight: mod.DropChance || 1000,
            tags: [mechanic],
            idolSource: idolType,
            modFamily,
        });
    }

    const uniqueIdols = parseUniqueIdolsFromHtml(html, locale);

    return {
        modifiers,
        uniqueIdols,
    };
}
