import { PinIcon, PinOffIcon, XIcon } from "lucide-react";
import { type ReactNode, useContext, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import type { CraftingEngine } from "~/lib/crafting-engine";
import type { CraftingItem } from "~/schemas/crafting";
import { CraftingDisplay } from "./display-settings";
import { ItemCard } from "./item-card";

export function ItemCardPopover({
    engine,
    item,
    label,
    children,
    note,
}: {
    engine: CraftingEngine;
    item: CraftingItem | (() => CraftingItem | null);
    label: string;
    children: ReactNode;
    note?: string;
}) {
    const [open, setOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const restoringFocus = useRef(false);
    const display = useContext(CraftingDisplay);
    const preview = open ? (typeof item === "function" ? item() : item) : null;
    return (
        <Popover
            open={open}
            onOpenChange={(value, details) => {
                if (details.reason === "trigger-press") {
                    setOpen(true);
                    setPinned(true);
                    return;
                }
                if (!value && pinned && details.reason !== "escape-key") return;
                setOpen(value);
                if (!value) setPinned(false);
            }}
        >
            <PopoverTrigger
                ref={trigger}
                openOnHover
                delay={200}
                closeDelay={150}
                onFocus={() => {
                    if (!restoringFocus.current) setOpen(true);
                }}
                render={
                    <Button
                        variant="ghost"
                        className="nodrag nopan h-auto w-full justify-start whitespace-normal text-left"
                    />
                }
                aria-label={`Preview ${label}`}
            >
                {children}
            </PopoverTrigger>
            <PopoverContent
                ref={popup}
                side="right"
                className="nodrag nopan nowheel max-h-[80dvh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto"
                initialFocus={false}
                finalFocus={() => {
                    if (
                        popup.current?.contains(document.activeElement) ||
                        document.activeElement === document.body
                    ) {
                        restoringFocus.current = true;
                        trigger.current?.focus({ preventScroll: true });
                        restoringFocus.current = false;
                    }
                    return false;
                }}
            >
                <div className="flex items-center gap-2">
                    <PopoverTitle className="flex-1 text-xs">{label}</PopoverTitle>
                    <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={pinned ? "Unpin item card" : "Pin item card"}
                        aria-pressed={pinned}
                        onClick={() => setPinned((value) => !value)}
                    >
                        {pinned ? <PinOffIcon /> : <PinIcon />}
                    </Button>
                    <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Close item card"
                        onClick={() => {
                            setPinned(false);
                            setOpen(false);
                        }}
                    >
                        <XIcon />
                    </Button>
                </div>
                {note && <p className="text-xs text-muted-foreground">{note}</p>}
                {preview ? (
                    <CraftingDisplay.Provider value={{ ...display, compact: true }}>
                        <ItemCard
                            engine={engine}
                            item={preview}
                            label={label}
                            collapsibleProperties
                        />
                    </CraftingDisplay.Provider>
                ) : (
                    <p className="text-xs">
                        No concrete item is specified. Calculate the process to preview a sampled
                        item at this step.
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}
