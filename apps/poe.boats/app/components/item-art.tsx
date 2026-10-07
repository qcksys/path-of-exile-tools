import { ImageOffIcon } from "lucide-react";
import { useState } from "react";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import { cn } from "~/lib/utils";

export function ItemArt({
    src,
    name,
    className,
}: {
    src: string;
    name: string;
    className?: string;
}) {
    const [failed, setFailed] = useState("");
    return (
        <span
            className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded bg-black/80 p-1",
                className,
            )}
        >
            {src && failed !== src ? (
                <img
                    src={src}
                    alt={name}
                    loading="lazy"
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
}: {
    id: string;
    game?: "poe1" | "poe2";
    className?: string;
}) {
    const item = useItemPresentations(game)[id];
    return item ? (
        <span aria-hidden="true">
            <ItemArt src={item.art} name={item.name} className={cn("size-7", className)} />
        </span>
    ) : null;
}
