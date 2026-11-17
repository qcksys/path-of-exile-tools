import { expect, it } from "vite-plus/test";
import { grantedEffects } from "../src/normalize.ts";
import type { Row, Tables } from "../src/tables.ts";

const templates = {
    ModGrantsEffectWithLevel: "Grants Level {1} {0}",
    ModGrantsSupportEffectWithLevel: "Socketed Gems are Supported by Level {1} {0}",
};
const tables = (strings: Record<string, string> = templates) =>
    ({
        rows: () =>
            Object.entries(strings).map(([id, text]) => ({ id: () => id, string: () => text })),
    }) as unknown as Tables;
const skill = (name: string) => ({
    boolean: () => false,
    ref: () => ({ string: () => name }),
});
const support = (name: string) => ({ boolean: () => true, string: () => name });
const mod = (shown: boolean, effects: [ReturnType<typeof skill | typeof support>, number][]) =>
    ({
        unnamedBoolean: (index: number) => {
            if (index !== 80) throw new Error(`Unexpected column ${index}`);
            return shown;
        },
        refs: () => effects.map(([effect, level]) => ({ ref: () => effect, number: () => level })),
    }) as unknown as Row;

it("writes PoE 1 3.30 granted skill and support lines from the client's strings", () => {
    const lines = grantedEffects(tables());
    expect(lines(mod(true, [[skill("Aspect of the Cat"), 20]]))).toEqual([
        { text: "Grants Level 20 Aspect of the Cat", level: 20 },
    ]);
    expect(
        lines(
            mod(true, [
                [support("Added Fire Damage Support"), 10],
                [skill("Herald of the Hive"), 30],
            ]),
        ),
    ).toEqual([
        { text: "Socketed Gems are Supported by Level 10 Added Fire Damage Support", level: 10 },
        { text: "Grants Level 30 Herald of the Hive", level: 30 },
    ]);
});

it("omits lines the mod does not show or the effect does not name", () => {
    const lines = grantedEffects(tables());
    expect(lines(mod(false, [[skill("Ceaseless Flesh"), 25]]))).toEqual([]);
    expect(lines(mod(true, [[support(""), 1]]))).toEqual([]);
});

it("refuses client strings without both placeholders", () => {
    expect(() => grantedEffects(tables({ ModGrantsEffectWithLevel: "Grants {0}" }))).toThrow(
        "Missing granted effect client string: ModGrantsEffectWithLevel",
    );
});
