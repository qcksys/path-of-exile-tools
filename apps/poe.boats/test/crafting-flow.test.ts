import { describe, expect, it } from "vite-plus/test";
import {
    connectProcessSteps,
    copyProcessStep,
    processDestinationId,
    processStepId,
    processStepName,
    validProcessConnection,
} from "../app/lib/crafting-flow";
import { craftingRoute } from "../app/lib/crafting-routes";
import { craftingStepSchema } from "../app/schemas/crafting";

const steps = ["first", "second"].map((id) =>
    craftingStepSchema.parse({ id, condition: { groups: [] } }),
);
const connection = {
    source: processStepId("first"),
    sourceHandle: "pass",
    target: processStepId("second"),
    targetHandle: "in",
};

describe("crafting process flow editing", () => {
    it("copies nested craft settings independently and keeps loops local to the copied step", () => {
        const source = craftingStepSchema.parse({
            id: "source",
            name: "Reveal and retry",
            description: "Keep the desired modifier",
            position: { x: 100, y: 200 },
            method: { kind: "reveal", preferred: ["desired"] },
            condition: { groups: [{ mods: ["desired"] }] },
            onSuccess: "source",
            onFailure: "finish",
            branches: [
                { id: "retry", condition: { groups: [] }, destination: "source" },
                {
                    id: "keep",
                    condition: { groups: [{ mods: ["desired"] }] },
                    destination: "finish",
                },
            ],
        });
        const before = structuredClone(source);
        const copy = copyProcessStep(source, 0);
        expect(copy.id).not.toBe(source.id);
        expect(copy).toMatchObject({
            name: "Reveal and retry (copy)",
            description: source.description,
            position: { x: 140, y: 240 },
            method: source.method,
            condition: source.condition,
            onSuccess: copy.id,
            onFailure: "finish",
        });
        expect(copy.branches!.map((branch) => branch.destination)).toEqual([copy.id, "finish"]);
        expect(craftingStepSchema.parse(JSON.parse(JSON.stringify(copy)))).toEqual(copy);
        if (copy.method?.kind === "reveal") copy.method.preferred.push("another");
        copy.condition.groups[0]!.mods.push("another");
        copy.branches![1]!.condition.groups[0]!.mods.push("another");
        expect(source).toEqual(before);
    });

    it("copies condition-only legacy steps without adding crafting or route settings", () => {
        const source = craftingStepSchema.parse({
            id: "check",
            condition: { groups: [], rarity: "rare" },
            onFailure: "check",
        });
        const copy = copyProcessStep(source, 2);
        expect(copy).toEqual({
            ...source,
            id: copy.id,
            name: "Step 3 (copy)",
            onFailure: copy.id,
        });
        expect(copy.method).toBeUndefined();
        expect(copy.branches).toBeUndefined();
        expect(copy.position).toBeUndefined();
        expect(source.onFailure).toBe("check");
    });

    it("keeps copied names within the schema limit and gives repeated copies unique identities", () => {
        const source = { ...steps[0]!, name: "x".repeat(120) };
        const first = copyProcessStep(source, 0);
        const second = copyProcessStep(source, 0);
        expect(first.name).toBe(`${"x".repeat(113)} (copy)`);
        expect(first.id).not.toBe(second.id);
        expect(craftingStepSchema.parse(first)).toEqual(first);
    });

    it("changes one pass/fail route while retaining the other route and unrelated steps", () => {
        const connected = connectProcessSteps(steps, connection);
        expect(connected[0]).toEqual({ ...steps[0], onSuccess: "second" });
        expect(connected[1]).toBe(steps[1]);
        expect(steps[0]!.onSuccess).toBe("success");
        expect(
            connectProcessSteps(connected, {
                ...connection,
                sourceHandle: "fail",
                target: "restart",
            })[0],
        ).toEqual({ ...connected[0], onFailure: "restart" });
        expect(processDestinationId("restart")).toBe("restart");
        expect(processDestinationId("first")).toBe(processStepId("first"));
    });

    it("allows self loops, backward routes and multiple branches to the same target", () => {
        for (const target of [
            processStepId("first"),
            processStepId("second"),
            "success",
            "failure",
            "restart",
        ]) {
            expect(
                validProcessConnection(steps, {
                    ...connection,
                    source: processStepId("second"),
                    target,
                }),
            ).toBe(true);
            expect(connectProcessSteps(steps, { ...connection, target })[0]!.onSuccess).toBe(
                target.replace(/^step:/, ""),
            );
        }
        const pass = connectProcessSteps(steps, connection);
        expect(connectProcessSteps(pass, { ...connection, sourceHandle: "fail" })[0]).toMatchObject(
            { onSuccess: "second", onFailure: "second" },
        );
    });

    it("changes the entry step without changing any saved routes or losing layout and descriptions", () => {
        const configured = steps.map((step, index) => ({
            ...step,
            name: `Named ${index}`,
            description: "Repeat until the condition passes",
            position: { x: 100 - index * 150, y: 400 },
        }));
        const changed = connectProcessSteps(configured, {
            ...connection,
            source: "start",
            sourceHandle: "next",
        });
        expect(changed).toEqual([configured[1], configured[0]]);
        expect(
            changed.map((step) => craftingStepSchema.parse(JSON.parse(JSON.stringify(step)))),
        ).toEqual(changed);
        expect(processStepName(changed[0]!, 0)).toBe("Named 1");
        expect(processStepName({ ...changed[0]!, name: " " }, 0)).toBe("Step 1");
    });

    it("rejects missing endpoints, source terminals, incorrect handles and entry-to-terminal routes", () => {
        for (const patch of [
            { source: "failure" },
            { target: "start" },
            { source: "missing" },
            { target: "missing" },
            { sourceHandle: "wrong" },
            { targetHandle: "wrong" },
            { source: "start", sourceHandle: "next", target: "success" },
        ]) {
            expect(validProcessConnection(steps, { ...connection, ...patch })).toBe(false);
            expect(() => connectProcessSteps(steps, { ...connection, ...patch })).toThrow(
                "Connect a step",
            );
        }
    });

    it("validates optional presentation fields and leaves old step documents unchanged", () => {
        expect(steps[0]).toEqual({
            id: "first",
            condition: { groups: [], minimumGroups: 0, openPrefixes: 0, openSuffixes: 0 },
            onSuccess: "success",
            onFailure: "failure",
        });
        for (const patch of [
            { name: "x".repeat(121) },
            { description: "x".repeat(1001) },
            { position: { x: Infinity, y: 0 } },
            { position: { x: 0, y: "0" } },
        ])
            expect(() => craftingStepSchema.parse({ ...steps[0], ...patch })).toThrow();
        expect(craftingRoute({}, "__proto__")).toBeUndefined();
        expect(craftingRoute({}, "constructor")).toBeUndefined();
    });
});
