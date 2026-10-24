import { exchangeCurrencyId } from "@poe-tools/market";
import { ItemArt } from "~/components/item-art";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import { findItemPresentation } from "~/lib/item-presentation";
import { cn } from "~/lib/utils";

export function CurrencyLabel({
    currency,
    game,
    label,
    iconOnly = false,
    className,
}: {
    currency: string;
    game?: "poe1" | "poe2";
    label?: string;
    iconOnly?: boolean;
    className?: string;
}) {
    const item = findItemPresentation(
        useItemPresentations(game),
        exchangeCurrencyId(currency) ?? undefined,
        currency,
    );
    const text = label ?? currency;
    return (
        <span
            data-currency={currency}
            className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap align-middle",
                className,
            )}
        >
            {item?.art ? (
                <ItemArt
                    src={item.art}
                    name={item.name}
                    className="size-[1.25em] rounded-none bg-transparent p-0"
                    decorative
                />
            ) : null}
            <span className={iconOnly && item?.art ? "sr-only" : undefined}>{text}</span>
        </span>
    );
}
