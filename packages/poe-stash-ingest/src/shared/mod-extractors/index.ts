import { createHash } from "node:crypto";
import type { Item } from "@poe-tools/api-client";
import { emptyResonatorExtractor } from "#src/shared/mod-extractors/empty-resonator.ts";
import { forbiddenJewelExtractor } from "#src/shared/mod-extractors/forbidden-jewels.ts";
import { forbiddenShakoExtractor } from "#src/shared/mod-extractors/forbidden-shako.ts";
import { foulbornExtractor } from "#src/shared/mod-extractors/foulborn.ts";
import { impossibleEscapeExtractor } from "#src/shared/mod-extractors/impossible-escape.ts";
import type { ModExtractor, ModSignature } from "#src/shared/mod-extractors/types.ts";
import { uniqueModSplitExtractor } from "#src/shared/mod-extractors/unique-mod-splits.ts";
import { watchersEyeExtractor } from "#src/shared/mod-extractors/watchers-eye.ts";

export const EXTRACTORS: readonly ModExtractor[] = [
    forbiddenJewelExtractor,
    watchersEyeExtractor,
    impossibleEscapeExtractor,
    forbiddenShakoExtractor,
    foulbornExtractor,
    emptyResonatorExtractor,
    uniqueModSplitExtractor,
];

export function extractModSignature(item: Item): ModSignature | null {
    for (const e of EXTRACTORS) {
        if (e.matches(item)) {
            const sig = e.extract(item);
            if (sig) return sig;
        }
    }
    return null;
}

export type { ModExtractor, ModSignature };

export function signatureValue(signature: ModSignature | null): string {
    if (!signature) return "";
    const extractor = EXTRACTORS.find((entry) => entry.kind === signature.kind);
    return (
        extractor?.value?.(signature) ??
        createHash("sha256").update(JSON.stringify(signature)).digest("hex")
    );
}
