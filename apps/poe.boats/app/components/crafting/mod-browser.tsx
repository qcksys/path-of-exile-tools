import { useId, useMemo, useState } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { eldritchFamilyKey, eldritchLabel } from "~/lib/crafting-eldritch";
import { type CraftingEngine, eldritchTier } from "~/lib/crafting-engine";
import { graspingMailBase, graspingPool } from "~/lib/crafting-grasping";
import { modifierLevelText, modifierTiers } from "~/lib/crafting-modifier-details";
import { omenEffects } from "~/lib/crafting-omens";
import { replaceTarget, targetEntries } from "~/lib/crafting-targets";
import type { CraftingItem, CraftingMethod, CraftingMod, CraftingTarget } from "~/schemas/crafting";
import { ClusterPassiveDetails } from "./cluster-passive-details";
import type { FilterEffect, ModifierLayout } from "./display-settings";
import { modText } from "./item-card";
import { controlClass } from "./method-picker";
import { initialModifierPages, ModifierPoolLayout } from "./modifier-pool-layout";

export function ModBrowser({
    engine,
    item,
    method,
    target,
    onTarget,
    onAdd,
    layout = "columns",
    filterEffect = "cross",
    showTagFilter = true,
    showWeightPercentages = true,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    method: CraftingMethod;
    target: CraftingTarget;
    layout?: ModifierLayout;
    filterEffect?: FilterEffect;
    showTagFilter?: boolean;
    showWeightPercentages?: boolean;
    onTarget: (target: CraftingTarget) => void;
    onAdd: (
        id: string,
        source:
            | "natural"
            | "essence"
            | "emotion"
            | "revealed"
            | "attribute"
            | "ukatoa"
            | "influence",
    ) => void;
}) {
    const [search, setSearch] = useState("");
    const [side, setSide] = useState("all");
    const [tagFilters, setTagFilters] = useState<{ tag: string; excluded: boolean }[]>([]);
    const [group, setGroup] = useState("new");
    const [pages, setPages] = useState(initialModifierPages);
    const [selectedSource, setSource] = useState("natural");
    const influences = engine.catalog.crafting.influences.filter(
        (entry) => entry.itemClass === engine.base(item).item_class,
    );
    const selectedInfluence = influences.find(
        (entry) => selectedSource === `influence:${entry.influence}`,
    );
    const source =
        (selectedSource.startsWith("influence:") && !selectedInfluence) ||
        (selectedSource === "breach" &&
            (engine.catalog.game !== "poe1" || engine.base(item).item_class !== "Body Armour"))
            ? "natural"
            : selectedSource;
    const influence = selectedInfluence?.influence;
    const [selectedRevealSource, setRevealSource] = useState("");
    const revealSources = useMemo(
        () => (source === "revealed" && !item.reveal ? engine.revealSources(item) : []),
        [engine, item, source],
    );
    const previewSource =
        revealSources.find((entry) => entry.id === selectedRevealSource) ??
        revealSources.find((entry) => method.kind === "currency" && entry.id === method.id) ??
        revealSources[0];
    const revealPreview = useMemo(
        () => (previewSource ? engine.revealPreview(item, previewSource.id) : undefined),
        [engine, item, previewSource],
    );
    const explicit = !["ukatoa", "eldritch", "gilded", "corrupted"].includes(source);
    const tiers = useMemo(
        () =>
            modifierTiers(
                engine,
                item.baseId,
                source === "essence" ? "essence" : "ordinary",
                item.cluster,
            ),
        [engine, item.baseId, item.cluster, source],
    );
    const ducatSource = [
        "reroll_rare_infamous",
        "add_deepwater_hazard_belt_mod",
        "add_pantheon_aspect",
    ].includes(source);
    const destinationId = useId();
    const [destination, setDestination] = useState("root");
    const destinations = targetEntries(target).map((entry) => ({
        ...entry,
        id: entry.path.length ? entry.path.join(".") : "root",
        label: entry.path.length
            ? `Condition ${entry.path.map((index) => index + 1).join(".")}`
            : "Main requirements",
    }));
    const active = destinations.find((entry) => entry.id === destination) ?? destinations[0]!;
    const activeTarget = active.target;
    const sourcePool = useMemo(
        () =>
            influence !== undefined
                ? engine.influenceModifiers(
                      item,
                      influence,
                      method.kind === "fossils"
                          ? {
                                fossils: method.ids,
                                logic: method.logic,
                                tangled: method.tangled,
                            }
                          : { memoryStrands: item.unidentified ? item.memoryStrands : undefined },
                  )
                : source === "breach"
                  ? graspingPool(
                        engine.catalog,
                        { ...item, baseId: graspingMailBase, mods: [] },
                        "legacy",
                    )
                  : source === "natural" && method.kind === "genesis"
                    ? engine.genesisModifiers(item, method.nodes)
                    : source === "ukatoa"
                      ? engine.ukatoaModifiers(item)
                      : source === "attribute"
                        ? engine.attributeModifiers(item)
                        : ducatSource
                          ? engine.ducatPool(
                                {
                                    ...item,
                                    rarity: engine.base(item).rarities.includes("rare")
                                        ? "rare"
                                        : "magic",
                                    mods: [],
                                },
                                source,
                            )
                          : source === "bench" ||
                              source === "essence" ||
                              source === "aspect" ||
                              source === "emotion"
                            ? engine.recipePool(item, source)
                            : source === "corrupted-essence"
                              ? engine.corruptedEssencePool(
                                    { ...item, mods: item.mods.filter((entry) => entry.fractured) },
                                    method.kind === "fossils"
                                        ? {
                                              fossils: method.ids,
                                              logic: method.logic,
                                              tangled: method.tangled,
                                          }
                                        : {},
                                )
                              : source === "eldritch"
                                ? engine.eldritchModifiers(item)
                                : source === "gilded"
                                  ? engine.gildedModifiers(item)
                                  : source === "corrupted"
                                    ? engine.corruptedModifiers(item)
                                    : source === "revealed"
                                      ? item.reveal
                                          ? engine.revealPool(item)
                                          : (revealPreview?.pool ?? [])
                                      : engine.pool(
                                            {
                                                ...item,
                                                rarity: engine.base(item).rarities.includes("rare")
                                                    ? "rare"
                                                    : "magic",
                                                mods: [],
                                            },
                                            method.kind === "fossils"
                                                ? {
                                                      fossils: method.ids,
                                                      logic: method.logic,
                                                      tangled: method.tangled,
                                                  }
                                                : {
                                                      memoryStrands: item.unidentified
                                                          ? item.memoryStrands
                                                          : undefined,
                                                      catalysing: omenEffects(
                                                          engine.catalog,
                                                          method,
                                                      ).catalysing,
                                                  },
                                        ),
        [engine, item, method, source, ducatSource, influence, revealPreview],
    );
    const pool =
        influence === undefined
            ? sourcePool
            : sourcePool.filter(
                  (entry) => engine.catalog.crafting.modRules[entry.id]?.influence === influence,
              );
    const revealProbabilities = useMemo(
        () =>
            source === "revealed" && item.reveal
                ? engine.revealProbabilities(item)
                : revealPreview?.probabilities,
        [engine, item, source, revealPreview],
    );
    const tags = [
        ...new Set([
            ...pool.flatMap((entry) => entry.mod.implicit_tags),
            ...tagFilters.map((entry) => entry.tag),
        ]),
    ].sort();
    const matchesTags = (mod: CraftingMod) =>
        tagFilters.every(({ tag, excluded }) => mod.implicit_tags.includes(tag) !== excluded);
    const lastTag = tagFilters.at(-1);
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const selected = new Set(activeTarget.groups.flatMap((entry) => entry.mods));
    const filtered = pool
        .filter(
            (entry) =>
                (!explicit ||
                    layout === "tabs" ||
                    side === "all" ||
                    entry.mod.generation_type === side) &&
                (filterEffect === "cross" || selected.has(entry.id) || matchesTags(entry.mod)) &&
                words.every((word) =>
                    `${modText(entry.mod)} ${entry.mod.name} ${entry.id}`
                        .toLowerCase()
                        .includes(word),
                ),
        )
        .sort(
            (a, b) =>
                a.mod.generation_type.localeCompare(b.mod.generation_type) ||
                b.mod.required_level - a.mod.required_level ||
                a.id.localeCompare(b.id),
        );
    const matching = filtered.filter((entry) => matchesTags(entry.mod)).length;
    const total = sourcePool.reduce((sum, entry) => sum + entry.weight, 0);
    const typeTotals = new Map<string, number>();
    for (const { mod, weight } of sourcePool) {
        const key =
            source === "eldritch"
                ? `${mod.generation_type}:${eldritchTier(mod)}`
                : mod.generation_type;
        typeTotals.set(key, (typeTotals.get(key) ?? 0) + weight);
    }
    const tagPool = pool.filter((entry) => matchesTags(entry.mod));
    const tagTotal = tagPool.reduce((sum, entry) => sum + entry.weight, 0);
    const tagTypeTotals = new Map<string, number>();
    for (const { mod, weight } of tagPool) {
        const key =
            source === "eldritch"
                ? `${mod.generation_type}:${eldritchTier(mod)}`
                : mod.generation_type;
        tagTypeTotals.set(key, (tagTypeTotals.get(key) ?? 0) + weight);
    }
    const weighted =
        total > 0 &&
        (influence !== undefined ||
            ducatSource ||
            ["ukatoa", "natural", "corrupted-essence", "corrupted", "breach"].includes(source));
    function changeTarget(value: CraftingTarget) {
        onTarget(replaceTarget(target, active.path, value));
    }
    function requireMods(ids: string[]) {
        const index = group === "new" ? -1 : Number(group);
        if (index >= 0 && activeTarget.groups[index])
            changeTarget({
                ...activeTarget,
                groups: activeTarget.groups.map((entry, position) =>
                    position === index
                        ? { ...entry, mods: [...new Set([...entry.mods, ...ids])] }
                        : entry,
                ),
            });
        else if (activeTarget.groups.length < 12)
            changeTarget({
                ...activeTarget,
                groups: [...activeTarget.groups, { mods: ids, minimum: 1 }],
            });
    }
    return (
        <section
            className="@container min-w-0 rounded-lg border border-border bg-card"
            aria-label="Modifier pool"
            data-modifier-layout={explicit ? layout : "list"}
        >
            <div className="space-y-3 border-b border-border p-4">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-semibold">Modifier pool</h2>
                    <span className="text-xs text-muted-foreground">
                        {matching} matching tiers
                        {matching !== filtered.length ? ` · ${filtered.length} shown` : ""}
                    </span>
                </div>
                <input
                    aria-label="Search modifiers"
                    className={controlClass}
                    placeholder="Search life, resistance, damage…"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPages(initialModifierPages);
                    }}
                />
                <label className="block text-xs text-muted-foreground">
                    Modifier source
                    <select
                        className={`${controlClass} mt-1`}
                        value={source}
                        onChange={(event) => {
                            setSource(event.target.value);
                            setSide("all");
                            setTagFilters([]);
                            setPages(initialModifierPages);
                        }}
                    >
                        <option value="natural">Natural modifier pool</option>
                        {influences.map((entry) => (
                            <option key={entry.influence} value={`influence:${entry.influence}`}>
                                {entry.name} modifiers
                            </option>
                        ))}
                        <option value="essence">Essence guarantees</option>
                        {engine.catalog.game === "poe2" ? (
                            <option value="emotion">Liquid Emotion guarantees</option>
                        ) : null}
                        <option value="revealed">
                            {engine.catalog.game === "poe1"
                                ? "Unveiled modifiers"
                                : "Desecrated modifiers"}
                        </option>
                        {engine.catalog.game === "poe1" ? (
                            <>
                                <option value="bench">Crafting bench</option>
                                {engine.base(item).item_class === "Body Armour" ? (
                                    <option value="breach">Breach modifiers (wiki weights)</option>
                                ) : null}
                                <option value="corrupted-essence">
                                    Glyphic essence guarantees
                                </option>
                                <option value="aspect">Beastcraft Aspects</option>
                                <option value="attribute">Genteel attribute conversions</option>
                                <option value="ukatoa">Ukatoa amulet implicits</option>
                                <option value="reroll_rare_infamous">Infamous modifiers</option>
                                <option value="add_deepwater_hazard_belt_mod">
                                    Ducat Trap and Mine modifiers
                                </option>
                                <option value="add_pantheon_aspect">Pantheon Aspects</option>
                                <option value="eldritch">Eldritch implicits</option>
                                <option value="gilded">Gilded Fossil implicit</option>
                            </>
                        ) : null}
                        <option value="corrupted">Corrupted implicits</option>
                    </select>
                </label>
                {previewSource ? (
                    <label className="block text-xs text-muted-foreground">
                        Preview reveal source
                        <select
                            className={`${controlClass} mt-1`}
                            value={previewSource.id}
                            onChange={(event) => {
                                setRevealSource(event.target.value);
                                setPages(initialModifierPages);
                            }}
                        >
                            {revealSources.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.name}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                    {explicit && layout === "columns" ? (
                        <select
                            aria-label="Affix type"
                            className={controlClass}
                            value={side}
                            onChange={(event) => {
                                setSide(event.target.value);
                                setPages(initialModifierPages);
                            }}
                        >
                            <option value="all">Prefixes + suffixes</option>
                            <option value="prefix">Prefixes</option>
                            <option value="suffix">Suffixes</option>
                        </select>
                    ) : null}
                    {showTagFilter ? (
                        <select
                            aria-label="Modifier tag"
                            className={controlClass}
                            value={lastTag ? `${lastTag.excluded ? "!" : ""}${lastTag.tag}` : ""}
                            onChange={(event) => {
                                const value = event.target.value;
                                const excluded = value.startsWith("!");
                                const tag = excluded ? value.slice(1) : value;
                                setTagFilters((current) =>
                                    value
                                        ? [
                                              ...current.filter((entry) => entry.tag !== tag),
                                              { tag, excluded },
                                          ]
                                        : [],
                                );
                                setPages(initialModifierPages);
                            }}
                        >
                            <option value="">All tags</option>
                            {tags.map((entry) => (
                                <option key={entry} value={entry}>
                                    {entry}
                                </option>
                            ))}
                            {tags.map((entry) => (
                                <option key={`!${entry}`} value={`!${entry}`}>
                                    non-{entry}
                                </option>
                            ))}
                        </select>
                    ) : null}
                </div>
                {tagFilters.length ? (
                    <div className="space-y-2">
                        <fieldset
                            className="flex min-w-0 flex-wrap gap-2"
                            aria-label="Active tag filters"
                        >
                            {tagFilters.map(({ tag, excluded }) => (
                                <Button
                                    key={tag}
                                    size="xs"
                                    variant="secondary"
                                    aria-label={`Remove ${excluded ? "non-" : ""}${tag} filter`}
                                    onClick={() => {
                                        setTagFilters((current) =>
                                            current.filter((entry) => entry.tag !== tag),
                                        );
                                        setPages(initialModifierPages);
                                    }}
                                >
                                    {excluded ? "non-" : ""}
                                    {tag} ×
                                </Button>
                            ))}
                            <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                    setTagFilters([]);
                                    setPages(initialModifierPages);
                                }}
                            >
                                Clear tag filters
                            </Button>
                        </fieldset>
                        <p className="text-xs text-muted-foreground">
                            Match all included tags and none of the excluded tags. Filtered shares
                            compare only these matches; crafting uses the full eligible pool.
                        </p>
                    </div>
                ) : null}
                {destinations.length > 1 ? (
                    <CatalogPicker
                        id={destinationId}
                        label="Requirement destination"
                        options={destinations}
                        value={active}
                        onSelect={(value) => {
                            setDestination(value);
                            setGroup("new");
                        }}
                    />
                ) : null}
                <label className="block text-xs text-muted-foreground">
                    Add requirements to
                    <select
                        className={`${controlClass} mt-1`}
                        value={group}
                        onChange={(event) => setGroup(event.target.value)}
                    >
                        <option value="new">A new required group</option>
                        {activeTarget.groups.map((entry, index) => (
                            <option key={entry.mods.join(",")} value={index}>
                                Group {index + 1} (
                                {entry.negated ? "exclude matches" : "alternative tier / modifier"})
                            </option>
                        ))}
                    </select>
                </label>
                <p className="text-xs text-muted-foreground">
                    {selectedInfluence
                        ? `${selectedInfluence.name} preview. Percentages include ordinary modifiers and ${engine.effectiveInfluences(item).includes(selectedInfluence.influence) ? "all active influences" : "this influence alone"}, using the selected fossil effects. Previewing leaves the item unchanged; adding a modifier also adds its influence when allowed. Existing modifiers and occupied slots are checked when adding or crafting.`
                        : source === "breach"
                          ? "PoE Wiki weights for the combined legacy Breach pool. Modern recipe odds also depend on the selected ring composition. These modifiers cannot roll with ordinary currency."
                          : source === "ukatoa"
                            ? "Ukatoa replaces one randomly selected implicit. This pool uses the build's item-level requirements and weights. Previewing a replacement changes the starting item."
                            : source === "attribute"
                              ? "Equivalent attributes for the item's current modifiers, from the extracted build. Each Genteel copy chooses one modifier and one alternative uniformly. A conflicting replacement removes the chosen modifier without adding another. Replace attribute previews one chosen replacement."
                              : ducatSource
                                ? "Weights show this Ducat's extracted pool for the base and item level. Existing modifiers, metamod blockers and occupied affix slots are accounted for when crafting."
                                : source === "natural"
                                  ? "Weights show the base pool at this item level, including selected fossil or Catalysing effects. Existing modifiers and full affix slots are accounted for when crafting."
                                  : source === "corrupted-essence"
                                    ? "Glyphic selects one eligible corrupted essence modifier. The model starts with equal weights, then applies the selected fossil effects. Item level does not restrict this guarantee."
                                    : source === "eldritch"
                                      ? "Weight shares apply within the same influence and implicit tier. They do not include Orb of Conflict upgrade odds. Zero-weight modifiers and Exquisite or Perfect tiers require Conflict upgrades."
                                      : source === "revealed"
                                        ? item.reveal
                                            ? item.reveal.choices.length
                                                ? "The current choices are fixed: offered modifiers show 100% and other eligible modifiers show 0%. Rerolling replaces the current offer."
                                                : "Offer is the chance to appear among up to three choices for the current hidden affix. It includes the reveal source, item level, existing modifier groups and applied omens. An optional reroll is not included."
                                            : previewSource
                                              ? `Preview offer is the chance to appear among up to three choices from ${previewSource.name}, given a hidden prefix or suffix on this base at this item level. Each affix side is calculated separately. Existing affixes, Marks, omens and optional rerolls are excluded. This preview does not change the selected craft or item.`
                                              : "No reveal source is available for this base and item level."
                                        : source === "corrupted"
                                          ? "Corrupted-implicit rolls use these build weights. The selected craft determines how many implicits are replaced. Adding a starting modifier replaces one changeable implicit, chosen equally when several are present, and marks the item corrupted."
                                          : "These modifiers are provided by extracted recipes; they are not part of the natural random pool."}
                </p>
            </div>
            <ModifierPoolLayout
                entries={filtered}
                layout={explicit ? layout : "list"}
                pages={pages}
                onPage={(group, page) => setPages((current) => ({ ...current, [group]: page }))}
            >
                {({ id, mod, weight }) => {
                    const mismatch = !matchesTags(mod);
                    const typeTotal =
                        typeTotals.get(
                            source === "eldritch"
                                ? `${mod.generation_type}:${eldritchTier(mod)}`
                                : mod.generation_type,
                        ) ?? 0;
                    const tierShare =
                        source === "eldritch" && weight > 0 && typeTotal > 0
                            ? weight / typeTotal
                            : undefined;
                    const offerChance = revealProbabilities?.get(id);
                    const tagTypeTotal =
                        tagTypeTotals.get(
                            source === "eldritch"
                                ? `${mod.generation_type}:${eldritchTier(mod)}`
                                : mod.generation_type,
                        ) ?? 0;
                    const tagWeight = mismatch ? 0 : weight;
                    return (
                        <div
                            key={id}
                            data-modifier-id={id}
                            data-tag-mismatch={mismatch}
                            className={`min-w-0 break-words border-b border-border/60 p-4 ${selected.has(id) ? "bg-primary/5" : ""}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <p
                                    className={`min-w-0 whitespace-pre-line text-sm font-medium ${mismatch ? "line-through text-muted-foreground" : ""}`}
                                >
                                    {modText(mod)}
                                </p>
                                <span
                                    title="Modifier weight"
                                    className={`shrink-0 font-mono text-xs text-muted-foreground ${mismatch ? "line-through" : ""}`}
                                >
                                    {weight
                                        ? weight.toLocaleString()
                                        : source === "eldritch"
                                          ? "Conflict"
                                          : "Recipe"}
                                </span>
                            </div>
                            {mismatch ? (
                                <span className="sr-only">Does not match the selected tags.</span>
                            ) : null}
                            <ClusterPassiveDetails catalog={engine.catalog} mod={mod} />
                            <p
                                className={`mt-1 text-xs text-muted-foreground ${mismatch ? "line-through" : ""}`}
                            >
                                {source === "gilded"
                                    ? "Gilded implicit"
                                    : (eldritchLabel(mod) ??
                                      `${mod.generation_type} · ${mod.name} · ${modifierLevelText(engine, id)}`)}
                                {tiers.has(id) ? ` · Tier ${tiers.get(id)}` : ""} ·{" "}
                                {mod.implicit_tags.join(", ")}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                    variant={selected.has(id) ? "secondary" : "outline"}
                                    size="xs"
                                    onClick={() => {
                                        if (selected.has(id)) {
                                            changeTarget({
                                                ...activeTarget,
                                                minimumGroups: 0,
                                                groups: activeTarget.groups
                                                    .map((entry) => ({
                                                        ...entry,
                                                        mods: entry.mods.filter(
                                                            (mod) => mod !== id,
                                                        ),
                                                    }))
                                                    .filter((entry) => entry.mods.length)
                                                    .map((entry) => ({
                                                        ...entry,
                                                        minimum: Math.min(
                                                            entry.minimum,
                                                            entry.mods.length,
                                                        ),
                                                    })),
                                            });
                                            return;
                                        }
                                        requireMods([id]);
                                    }}
                                >
                                    {selected.has(id) ? "Remove target" : "Require"}
                                </Button>
                                <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() =>
                                        requireMods(
                                            pool
                                                .filter(
                                                    (entry) =>
                                                        entry.mod.type === mod.type &&
                                                        entry.mod.generation_type ===
                                                            mod.generation_type &&
                                                        entry.mod.groups.join("|") ===
                                                            mod.groups.join("|") &&
                                                        (eldritchTier(mod)
                                                            ? eldritchFamilyKey(entry.mod) ===
                                                                  eldritchFamilyKey(mod) &&
                                                              eldritchTier(entry.mod) >=
                                                                  eldritchTier(mod)
                                                            : source === "aspect"
                                                              ? entry.mod.stats[0]!.min >=
                                                                mod.stats[0]!.min
                                                              : entry.mod.required_level >=
                                                                mod.required_level),
                                                )
                                                .map((entry) => entry.id),
                                        )
                                    }
                                >
                                    Tier or better
                                </Button>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    disabled={Boolean(item.unidentified)}
                                    onClick={() =>
                                        onAdd(
                                            id,
                                            influence !== undefined
                                                ? "influence"
                                                : source === "corrupted-essence"
                                                  ? "essence"
                                                  : source === "essence" ||
                                                      source === "emotion" ||
                                                      source === "revealed" ||
                                                      source === "ukatoa" ||
                                                      source === "attribute"
                                                    ? source
                                                    : "natural",
                                        )
                                    }
                                >
                                    {source === "ukatoa"
                                        ? "Replace implicit"
                                        : source === "attribute"
                                          ? "Replace attribute"
                                          : "Add to item"}
                                </Button>
                                {showWeightPercentages &&
                                (weighted ||
                                    tierShare !== undefined ||
                                    offerChance !== undefined) ? (
                                    <span
                                        className={`ml-auto flex flex-wrap gap-x-2 font-mono text-[11px] text-muted-foreground ${mismatch ? "line-through" : ""}`}
                                    >
                                        {offerChance !== undefined ? (
                                            <span
                                                title={
                                                    !item.reveal
                                                        ? `Chance to appear in one offer from ${previewSource?.name}, given a hidden ${mod.generation_type} and no other affixes, Marks or omens`
                                                        : item.reveal.choices.length
                                                          ? "Whether the modifier appears in the current revealed choices"
                                                          : "Chance the modifier appears in one reveal offer, before an optional reroll"
                                                }
                                            >
                                                {!item.reveal
                                                    ? "Preview offer"
                                                    : item.reveal.choices.length
                                                      ? "Current offer"
                                                      : "Offer"}{" "}
                                                {(offerChance * 100).toFixed(3)}%
                                            </span>
                                        ) : tierShare !== undefined ? (
                                            <span
                                                title={`Weight relative to the full ${eldritchLabel(mod)} pool`}
                                            >
                                                Tier {(tierShare * 100).toFixed(3)}%
                                            </span>
                                        ) : (
                                            <>
                                                {explicit && typeTotal ? (
                                                    <span
                                                        title={`Weight relative to the full ${mod.generation_type} pool`}
                                                    >
                                                        {mod.generation_type === "prefix"
                                                            ? "Prefix"
                                                            : "Suffix"}{" "}
                                                        {((weight / typeTotal) * 100).toFixed(3)}%
                                                    </span>
                                                ) : null}
                                                <span title="Weight relative to the full source pool">
                                                    Pool {((weight / total) * 100).toFixed(3)}%
                                                </span>
                                            </>
                                        )}
                                    </span>
                                ) : null}
                            </div>
                            {showWeightPercentages &&
                            tagFilters.length > 0 &&
                            (weighted || tierShare !== undefined) &&
                            offerChance === undefined ? (
                                <p className="mt-2 flex flex-wrap justify-end gap-x-2 font-mono text-[11px] text-muted-foreground">
                                    {explicit || source === "eldritch" ? (
                                        <span title="Weight relative to the same affix side or implicit tier matching all tag filters">
                                            Filtered{" "}
                                            {source === "eldritch" ? "tier" : mod.generation_type}{" "}
                                            {(tagTypeTotal
                                                ? (tagWeight / tagTypeTotal) * 100
                                                : 0
                                            ).toFixed(3)}
                                            %
                                        </span>
                                    ) : null}
                                    {source !== "eldritch" ? (
                                        <span title="Weight relative to the displayed source pool matching all tag filters">
                                            Filtered pool{" "}
                                            {(tagTotal ? (tagWeight / tagTotal) * 100 : 0).toFixed(
                                                3,
                                            )}
                                            %
                                        </span>
                                    ) : null}
                                </p>
                            ) : null}
                        </div>
                    );
                }}
            </ModifierPoolLayout>
        </section>
    );
}
