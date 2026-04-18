import { Copy, Download, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useTranslations } from "~/i18n";
import type { IdolSet } from "~/schemas/idol-set";

interface SetTabsProps {
    sets: IdolSet[];
    activeSetId: string | null;
    onSelectSet: (id: string) => void;
    onCreateSet: () => void;
    onRenameSet: (id: string, name: string) => void;
    onDuplicateSet: (id: string) => void;
    onDeleteSet: (id: string) => void;
}

export function SetTabs({
    sets,
    activeSetId,
    onSelectSet,
    onCreateSet,
    onRenameSet,
    onDuplicateSet,
    onDeleteSet,
}: SetTabsProps) {
    const t = useTranslations();
    const navigate = useNavigate();
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [shareUrl, setShareUrl] = useState("");
    const [importError, setImportError] = useState("");

    const handleRenameClick = (set: IdolSet) => {
        setSelectedSetId(set.id);
        setNewName(set.name);
        setRenameDialogOpen(true);
    };

    const handleRenameConfirm = () => {
        if (selectedSetId && newName.trim()) {
            onRenameSet(selectedSetId, newName.trim());
        }
        setRenameDialogOpen(false);
        setSelectedSetId(null);
        setNewName("");
    };

    const handleDeleteClick = (setId: string) => {
        setSelectedSetId(setId);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = () => {
        if (selectedSetId) {
            onDeleteSet(selectedSetId);
        }
        setDeleteDialogOpen(false);
        setSelectedSetId(null);
    };

    const handleImportClick = () => {
        setShareUrl("");
        setImportError("");
        setImportDialogOpen(true);
    };

    const handleImportConfirm = () => {
        const url = shareUrl.trim();
        // Extract share ID from URL - supports various formats
        const shareMatch = url.match(/\/share\/([a-zA-Z0-9_-]+)/);
        if (shareMatch) {
            setImportDialogOpen(false);
            setShareUrl("");
            setImportError("");
            navigate(`/share/${shareMatch[1]}`);
        } else {
            setImportError(t.idolSet.invalidShareUrl);
        }
    };

    return (
        <>
            <div className="flex items-center gap-1 border-border border-b pb-2">
                {/* Scrollable tabs section */}
                <ScrollArea className="min-w-0 shrink">
                    <div className="flex items-center gap-1 pb-2">
                        {sets.map((set) => (
                            <div key={set.id} className="group flex shrink-0 items-center">
                                <Button
                                    variant={activeSetId === set.id ? "default" : "ghost"}
                                    size="sm"
                                    className="rounded-r-none"
                                    onClick={() => onSelectSet(set.id)}
                                >
                                    {set.name}
                                </Button>
                                <DropdownMenu>
                                    <Tooltip>
                                        <TooltipTrigger
                                            render={
                                                <DropdownMenuTrigger
                                                    render={
                                                        <Button
                                                            variant={
                                                                activeSetId === set.id
                                                                    ? "default"
                                                                    : "ghost"
                                                            }
                                                            size="sm"
                                                            className="h-8 w-6 rounded-l-none px-1"
                                                        />
                                                    }
                                                />
                                            }
                                        >
                                            <MoreVertical className="h-3 w-3" />
                                        </TooltipTrigger>
                                        <TooltipContent>{t.actions.moreOptions}</TooltipContent>
                                    </Tooltip>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleRenameClick(set)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            {t.idolSet.rename}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => onDuplicateSet(set.id)}>
                                            <Copy className="mr-2 h-4 w-4" />
                                            {t.idolSet.duplicate}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={() => handleDeleteClick(set.id)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            {t.idolSet.delete}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>

                {/* Action buttons - always visible, aligned after tabs */}
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onCreateSet}
                                className="shrink-0"
                            />
                        }
                    >
                        <Plus className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">{t.idolSet.newSet}</span>
                    </TooltipTrigger>
                    <TooltipContent>{t.actions.newSet}</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger
                        render={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleImportClick}
                                className="shrink-0"
                            />
                        }
                    >
                        <Download className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">{t.idolSet.importShare}</span>
                    </TooltipTrigger>
                    <TooltipContent>{t.idolSet.importShareTitle}</TooltipContent>
                </Tooltip>
            </div>

            <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.idolSet.rename}</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t.idolSet.defaultName}
                        onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm()}
                    />
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setRenameDialogOpen(false)}>
                            {t.actions.cancel}
                        </Button>
                        <Button onClick={handleRenameConfirm}>{t.actions.save}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.idolSet.delete}</DialogTitle>
                        <DialogDescription>{t.idolSet.confirmDelete}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
                            {t.actions.cancel}
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteConfirm}>
                            {t.idolSet.delete}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.idolSet.importShareTitle}</DialogTitle>
                        <DialogDescription>{t.idolSet.importShareDescription}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Input
                            value={shareUrl}
                            onChange={(e) => {
                                setShareUrl(e.target.value);
                                setImportError("");
                            }}
                            placeholder={t.idolSet.shareLinkPlaceholder}
                            onKeyDown={(e) => e.key === "Enter" && handleImportConfirm()}
                        />
                        {importError && <p className="text-destructive text-sm">{importError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setImportDialogOpen(false)}>
                            {t.actions.cancel}
                        </Button>
                        <Button onClick={handleImportConfirm} disabled={!shareUrl.trim()}>
                            {t.idolSet.importShare}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
