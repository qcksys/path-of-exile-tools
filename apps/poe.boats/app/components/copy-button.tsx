import { LoaderCircle } from "lucide-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";

export function CopyButton({
    getText,
    onCopyError,
    onCopied,
    copiedLabel = "Copied",
    children,
    disabled,
    ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
    getText: () => string;
    onCopyError: () => void;
    onCopied?: () => void;
    copiedLabel?: string;
}) {
    const [status, setStatus] = useState<"idle" | "copying" | "copied">("idle");
    useEffect(() => {
        if (status !== "copied") return;
        const timeout = window.setTimeout(() => setStatus("idle"), 2000);
        return () => window.clearTimeout(timeout);
    }, [status]);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    async function copy() {
        setStatus("copying");
        try {
            await navigator.clipboard.writeText(getText());
            if (mounted.current) {
                setStatus("copied");
                onCopied?.();
            }
        } catch {
            if (mounted.current) {
                setStatus("idle");
                onCopyError();
            }
        }
    }
    return (
        <Button
            {...props}
            type="button"
            disabled={disabled || status === "copying"}
            aria-busy={status === "copying" || undefined}
            onClick={copy}
        >
            {status === "copying" && (
                <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
            )}
            {status === "copied" ? copiedLabel : children}
        </Button>
    );
}
