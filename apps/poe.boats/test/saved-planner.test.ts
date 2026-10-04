import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/client";
import * as queries from "~/db/queries/idol-planner.queries";
import type { OperationContext } from "~/operations/operation";
import { newPlannerSet } from "~/operations/planner";
import {
    deleteSavedSet,
    editSavedSet,
    getSavedSet,
    updateSavedSet,
} from "~/operations/saved-planner.server";
import { catalogFixture } from "./fixtures/recombinator-catalog";

vi.mock("~/db/queries/idol-planner.queries");

const db = createDbConnection("mysql://test:test@localhost/poe_test");
const context: OperationContext = {
    db,
    origin: "https://poe.boats",
    loadCatalog: async () => catalogFixture,
    caller: { id: "owner", name: "Test", email: "test@example.com", role: "user" },
};
const idol = {
    id: "idol",
    baseType: "minor",
    itemLevel: 80,
    rarity: "rare",
    prefixes: [],
    suffixes: [],
};
const now = new Date(0);
function fixture(
    userId = "owner",
): NonNullable<Awaited<ReturnType<typeof queries.getSetWithData>>> {
    const set = newPlannerSet("Saved", "set");
    return {
        set: {
            id: set.id,
            userId,
            name: set.name,
            mapDevice: set.mapDevice,
            unlockedConditions: set.unlockedConditions,
            isActive: true,
            rowCreatedAt: now,
            rowUpdatedAt: now,
            rowDeletedAt: null,
        },
        idols: [
            {
                id: "inventory",
                setId: set.id,
                data: idol,
                source: "manual",
                importedAt: 0,
                rowCreatedAt: now,
                rowUpdatedAt: now,
                rowDeletedAt: null,
            },
        ],
        placements: [
            {
                id: "placement",
                setId: set.id,
                idolId: "inventory",
                posX: 1,
                posY: 1,
                rowCreatedAt: now,
                rowUpdatedAt: now,
            },
        ],
    };
}

describe("saved planner authorization and commands", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(db, "transaction").mockImplementation(async (callback) => {
            // Every query is mocked; this test double only supplies the transaction callback.
            return callback(db as unknown as Parameters<Parameters<typeof db.transaction>[0]>[0]);
        });
        vi.mocked(queries.getSetWithData).mockResolvedValue(fixture());
    });

    it("requires authentication before reading saved data", async () => {
        await expect(getSavedSet({ ...context, caller: null }, "set")).rejects.toMatchObject({
            status: 401,
        });
        expect(queries.getSetWithData).not.toHaveBeenCalled();
    });

    it.each([
        null,
        fixture("other-owner"),
    ])("refuses missing and foreign sets without mutations", async (data) => {
        vi.mocked(queries.getSetWithData).mockResolvedValue(data);
        await expect(getSavedSet(context, "set")).rejects.toMatchObject({ status: 404 });
        await expect(
            updateSavedSet(context, { setId: "set", name: "Changed" }),
        ).rejects.toMatchObject({ status: 404 });
        await expect(deleteSavedSet(context, "set")).rejects.toMatchObject({ status: 404 });
        expect(queries.updateSet).not.toHaveBeenCalled();
        expect(queries.deleteSet).not.toHaveBeenCalled();
        expect(queries.getSetWithData).toHaveBeenCalledWith(db, "set", "owner", true);
    });

    it("refuses child IDs outside the locked parent set", async () => {
        await expect(
            editSavedSet(context, { action: "removeIdols", setId: "set", ids: ["foreign-idol"] }),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
            editSavedSet(context, {
                action: "move",
                setId: "set",
                placementId: "foreign-placement",
                position: { x: 2, y: 2 },
            }),
        ).rejects.toMatchObject({ status: 404 });
        expect(queries.removeIdols).not.toHaveBeenCalled();
        expect(queries.movePlacement).not.toHaveBeenCalled();
        expect(queries.updateSet).not.toHaveBeenCalled();
    });

    it("applies the shared placement and inventory rules in a transaction", async () => {
        const result = await editSavedSet(context, {
            action: "removeIdols",
            setId: "set",
            ids: ["inventory"],
        });
        expect(result.set.inventory).toEqual([]);
        expect(result.set.placements).toEqual([]);
        expect(db.transaction).toHaveBeenCalledOnce();
        expect(queries.getSetWithData).toHaveBeenCalledWith(db, "set", "owner", true);
        expect(queries.removeIdols).toHaveBeenCalledWith(db, ["inventory"]);
        expect(queries.removePlacement).toHaveBeenCalledWith(db, "placement");
    });

    it("duplicates a saved set with new parent and child references", async () => {
        const result = await editSavedSet(context, { action: "duplicate", setId: "set" });
        expect(result.set.id).not.toBe("set");
        expect(result.set.inventory[0].id).not.toBe("inventory");
        expect(result.set.placements[0].inventoryIdolId).toBe(result.set.inventory[0].id);
        expect(queries.createSet).toHaveBeenCalledWith(
            db,
            expect.objectContaining({ id: result.set.id, userId: "owner" }),
        );
        expect(queries.addPlacement).toHaveBeenCalledWith(
            db,
            expect.objectContaining({ setId: result.set.id, idolId: result.set.inventory[0].id }),
        );
        expect(queries.updateIdol).not.toHaveBeenCalled();
    });

    it("does not activate a set when isActive is explicitly false", async () => {
        await updateSavedSet(context, { setId: "set", isActive: false });
        expect(queries.setActiveSet).not.toHaveBeenCalled();
        expect(queries.updateSet).toHaveBeenCalledWith(db, "set", { isActive: false });
    });
});
