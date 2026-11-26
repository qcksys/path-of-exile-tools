import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { useTranslations } from "~/i18n";
import type { IdolSet } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";

interface ShareModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    set: IdolSet | null;
    inventory: InventoryIdol[];
}

type ShareState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; shareUrl: string }
    | { status: "error"; message: string };

export function ShareModal({ open, onOpenChange, set, inventory }: ShareModalProps) {
    const t = useTranslations();
    const [shareState, setShareState] = useState<ShareState>({
        status: "idle",
    });
    const request = useRef<AbortController | null>(null);
    useEffect(() => () => request.current?.abort(), []);

    const handleShare = async () => {
        if (!set) return;
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setShareState({ status: "loading" });

        try {
            const response = await fetch("/1/idol-planner/api/share", {
                method: "POST",
                signal: controller.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ set, inventory }),
            });

            if (!response.ok) {
                const errorData = (await response.json().catch(() => ({}))) as {
                    error?: string;
                };
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = (await response.json()) as { shareUrl: string };
            if (controller.signal.aborted) return;
            setShareState({ status: "success", shareUrl: data.shareUrl });
        } catch (error) {
            if (controller.signal.aborted) return;
            setShareState({
                status: "error",
                message: error instanceof Error ? error.message : "Failed to create share link",
            });
        }
    };

    const handleClose = (newOpen: boolean) => {
        if (!newOpen) {
            setShareState({ status: "idle" });
            request.current?.abort();
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("share.title")}</DialogTitle>
                    <DialogDescription>{t("share.description")}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {shareState.status === "idle" && set && (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-border bg-muted/50 p-3">
                                <p className="font-medium text-accent">{set.name}</p>
                                <p className="text-muted-foreground text-sm">
                                    {set.placements.length} placement
                                    {set.placements.length !== 1 && "s"}
                                </p>
                            </div>
                            <Button onClick={handleShare} className="w-full">
                                {t("share.generateLink")}
                            </Button>
                        </div>
                    )}

                    {shareState.status === "loading" && (
                        <div className="flex flex-col items-center py-6">
                            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                            <p className="text-muted-foreground text-sm">{t("share.loading")}</p>
                        </div>
                    )}

                    {shareState.status === "success" && (
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <Input readOnly value={shareState.shareUrl} className="flex-1" />
                                <CopyButton
                                    getText={() => shareState.shareUrl}
                                    onCopyError={() =>
                                        toast.error("Copy failed. Select and copy the link.")
                                    }
                                    variant="outline"
                                    className="shrink-0"
                                    copiedLabel={t("actions.copied")}
                                >
                                    {t("actions.copy")}
                                </CopyButton>
                            </div>
                            <p className="text-center text-muted-foreground text-xs">
                                {t("share.linkExpiry")}
                            </p>
                        </div>
                    )}

                    {shareState.status === "error" && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                                <p className="text-destructive text-sm">{shareState.message}</p>
                            </div>
                            <Button onClick={handleShare} variant="outline" className="w-full">
                                {t("actions.tryAgain")}
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
