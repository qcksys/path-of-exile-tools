import { ImageOffIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import { findItemPresentation } from "~/lib/item-presentation";
import { cn } from "~/lib/utils";

/**
 * Flask art is a sprite of three frames side by side: the empty bottle, its overlay and its
 * liquid. Tincture art in the same folder is a single frame.
 */
function isFlaskSprite(image: HTMLImageElement) {
    return (
        image.src.includes("/2DItems/Flasks/") &&
        image.naturalHeight > 0 &&
        image.naturalWidth === image.naturalHeight * 1.5
    );
}

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
    const [sprite, setSprite] = useState("");
    // Also checks on mount, for art that loaded before hydration attached `onLoad`.
    const detectSprite = useCallback((image: HTMLImageElement | null) => {
        if (image && isFlaskSprite(image)) setSprite(image.getAttribute("src")!);
    }, []);
    return (
        <span
            aria-hidden={decorative || undefined}
            data-item-art={name}
            className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded border border-border bg-muted/60 p-1",
                className,
            )}
        >
            {src && failed !== src && sprite === src ? (
                // The liquid under the bottle, under the overlay, as the game draws a full flask.
                <span
                    role="img"
                    aria-label={name}
                    data-flask-sprite=""
                    className="block aspect-[1/2] h-full bg-no-repeat"
                    style={{
                        backgroundImage: Array(3).fill(`url("${src}")`).join(", "),
                        backgroundSize: "300% 100%",
                        backgroundPosition: "center, left, right",
                    }}
                />
            ) : src && failed !== src ? (
                <img
                    ref={detectSprite}
                    src={src}
                    alt={decorative ? "" : name}
                    loading="lazy"
                    decoding="async"
                    width={96}
                    height={96}
                    className="max-h-full max-w-full object-contain"
                    onLoad={(event) => detectSprite(event.currentTarget)}
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
