import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

export function GraphHelp({ children, content }: { children: ReactElement; content: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={children}
                aria-description={typeof content === "string" ? content : undefined}
            />
            <TooltipContent className="max-w-sm whitespace-pre-line text-left leading-relaxed">
                {content}
            </TooltipContent>
        </Tooltip>
    );
}
