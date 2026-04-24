import { ClipboardPaste, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { IdolCard } from "~/components/idol-planner/idol-card";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { useTranslations } from "~/i18n";
import { type ParseResult, parseIdolText } from "~/lib/idol-parser";
import type { IdolInstance } from "~/schemas/idol";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (idols: IdolInstance[]) => void;
}

export function ImportModal({ open, onOpenChange, onImport }: ImportModalProps) {
  const t = useTranslations();
  const [inputText, setInputText] = useState("");
  const [parseResults, setParseResults] = useState<ParseResult[]>([]);
  const [hasAttemptedParse, setHasAttemptedParse] = useState(false);

  const parseText = useCallback((text: string) => {
    if (!text.trim()) {
      setParseResults([]);
      setHasAttemptedParse(false);
      return;
    }

    const sections = text.split(/(?=Rarity:)/);
    const results = sections.filter((s) => s.trim()).map((section) => parseIdolText(section));

    setParseResults(results);
    setHasAttemptedParse(true);
  }, []);

  useEffect(() => {
    if (open) {
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text.trim()) {
            const sections = text.split(/(?=Rarity:)/);
            const results = sections
              .filter((s) => s.trim())
              .map((section) => parseIdolText(section));
            const hasValidIdol = results.some((r) => r.success);

            if (hasValidIdol) {
              setInputText(text);
              setParseResults(results);
              setHasAttemptedParse(true);
            }
          }
        })
        .catch(() => {
          // Permission denied - user can paste manually
        });
    }
  }, [open]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
      parseText(text);
    } catch {
      // Clipboard access denied - user can paste manually
    }
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    parseText(text);
  };

  const handleImport = () => {
    const successfulIdols = parseResults
      .filter((r) => r.success && r.idol)
      .map((r) => r.idol as IdolInstance);

    if (successfulIdols.length > 0) {
      onImport(successfulIdols);
      handleClose();
    }
  };

  const handleClose = () => {
    setInputText("");
    setParseResults([]);
    setHasAttemptedParse(false);
    onOpenChange(false);
  };

  const successCount = parseResults.filter((r) => r.success).length;
  const errorCount = parseResults.filter((r) => !r.success).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-[1000px] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-0 flex-1 pr-4">
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="text-foreground">
                <p className="font-medium">{t("import.howTo")}</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  <li>{t("import.ctrlC")}</li>
                  <li>{t("import.ctrlAltC")}</li>
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="idol-text" className="font-medium text-sm">
                  {t("import.pasteHere")}
                </label>
                <Button variant="outline" size="sm" onClick={handlePaste}>
                  <ClipboardPaste className="mr-1 h-4 w-4" />
                  {t("import.pasteFromClipboard")}
                </Button>
              </div>
              <Textarea
                id="idol-text"
                value={inputText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleTextChange(e.target.value)
                }
                placeholder={t("import.placeholder")}
                className="min-h-[150px] font-mono text-sm"
              />
            </div>

            {hasAttemptedParse && parseResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {successCount > 0 && (
                    <span className="text-success">
                      {t("import.parseSuccess", { count: successCount })}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-destructive">
                      {t("import.parseFailed", { count: errorCount })}
                    </span>
                  )}
                </div>

                <div className="max-h-[200px] space-y-2 overflow-y-auto rounded border border-border p-2">
                  {parseResults.map((result, index) =>
                    result.success && result.idol ? (
                      <IdolCard key={result.idol.id} idol={result.idol} showTooltip={false} />
                    ) : (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: error results don't have stable ids and the list is display-only
                        key={`error-${index}`}
                        className="rounded border border-destructive/50 bg-destructive/10 p-2 text-destructive text-sm"
                      >
                        {result.error || t("errors.unknown")}
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleImport} disabled={successCount === 0}>
            {t("import.importButton")} ({successCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
