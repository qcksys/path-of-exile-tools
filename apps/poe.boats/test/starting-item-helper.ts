import { fireEvent, screen } from "@testing-library/react";
import type { CraftingCatalog } from "../app/schemas/crafting";

export function chooseStartingItem(catalog: CraftingCatalog) {
    if (!screen.queryByText("Choose a starting item")) return;
    const base =
        Object.values(catalog.bases).find(
            (base) => base.item_class === "Body Armour" && base.drop_level === 1,
        ) ?? Object.values(catalog.bases)[0]!;
    const picker = screen.getByRole("combobox", { name: "Item base" });
    fireEvent.change(picker, { target: { value: base.name } });
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    const option = screen.getByRole("option", { name: `${base.name} · ${base.item_class}` });
    fireEvent.mouseMove(option);
    fireEvent.click(option);
}
