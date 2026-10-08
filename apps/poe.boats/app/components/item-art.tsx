import { ImageOffIcon } from "lucide-react";
import { useState } from "react";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import { findItemPresentation } from "~/lib/item-presentation";
import { cn } from "~/lib/utils";

export function ItemArt({
    src,
    name,
    className,
    decorative = false,
}: {
    src: string;
    name: string;
    className?: string;
    decorative?: boolean;
}) {
    const [failed, setFailed] = useState("");
    return (
        <span
            aria-hidden={decorative || undefined}
            data-item-art={name}
            className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded bg-black/80 p-1",
                className,
            )}
        >
            {src && failed !== src ? (
                <img
                    src={src}
                    alt={decorative ? "" : name}
                    loading="lazy"
                    decoding="async"
                    width={96}
                    height={96}
                    className="max-h-full max-w-full object-contain"
                    onError={() => setFailed(src)}
                />
            ) : (
                <ImageOffIcon
                    className="size-4 text-muted-foreground"
                    aria-label={`Artwork unavailable for ${name}`}
                />
            )}
        </span>
    );
}

export function CatalogItemArt({
    id,
    game,
    className,
    name,
}: {
    id?: string;
    name?: string;
    game?: "poe1" | "poe2";
    className?: string;
}) {
    const item = findItemPresentation(useItemPresentations(game), id, name);
    return (
        <ItemArt
            src={item?.art ?? ""}
            name={name ?? item?.name ?? "Item"}
            className={cn("size-7", className)}
            decorative
        />
    );
}

export function ItemName({
    id,
    name,
    game,
    artName,
}: {
    id?: string;
    name: string;
    game?: "poe1" | "poe2";
    artName?: string;
}) {
    return (
        <span className="inline-flex min-w-0 items-center gap-2 align-middle">
            <CatalogItemArt id={id} name={artName ?? name} game={game} />
            <span className="min-w-0 whitespace-normal break-words">{name}</span>
        </span>
    );
}
