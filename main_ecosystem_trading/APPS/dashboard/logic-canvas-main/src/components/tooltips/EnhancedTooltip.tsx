// Enhanced tooltip component that connects to the help documentation system
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getHelpById, HelpEntry } from "@/data/help-docs";

interface EnhancedTooltipProps {
  fieldId?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function EnhancedTooltip({
  fieldId = "unknown",
  description,
  children,
  className,
  side = "top",
  align = "center",
}: EnhancedTooltipProps) {
  // Ensure fieldId is defined
  const safeFieldId = fieldId || "unknown";

  // Try to find help entry by the fieldId first, then try variations
  let helpEntry: HelpEntry | undefined = getHelpById(safeFieldId);

  // If not found, try converting common field name formats
  if (!helpEntry) {
    // Convert from camelCase to snake_case
    const snakeCaseId = safeFieldId.replace(
      /[A-Z]/g,
      (letter) => `_${letter.toLowerCase()}`,
    );
    helpEntry = getHelpById(snakeCaseId);
  }

  // If still not found, try the original description
  if (!helpEntry && description) {
    // Create a temporary help entry from the description
    helpEntry = {
      id: safeFieldId,
      title: safeFieldId
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      category: "general",
      shortDesc: description,
      fullDesc: description,
    };
  }

  // If we have specific help content, use it; otherwise fall back to description
  const tooltipContent = helpEntry ? (
    <div className="max-w-sm space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-primary">{helpEntry.title}</h4>
        <Badge variant="secondary" className="text-xs">
          {helpEntry.category}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{helpEntry.shortDesc}</p>
      {helpEntry.fullDesc && (
        <div className="text-xs leading-relaxed max-h-40 overflow-y-auto pr-2">
          {helpEntry.fullDesc.split("\n").map((paragraph, idx) => (
            <p key={idx} className="mb-2 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      )}
      {helpEntry.examples && helpEntry.examples.length > 0 && (
        <div className="pt-1">
          <p className="text-xs font-medium text-muted-foreground">Examples:</p>
          <ul className="text-xs list-disc pl-4 space-y-1">
            {helpEntry.examples.slice(0, 3).map((example, idx) => (
              <li key={idx} className="text-muted-foreground">
                {example}
              </li>
            ))}
          </ul>
        </div>
      )}
      {helpEntry.tips && helpEntry.tips.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Tips:</p>
          <ul className="text-xs list-disc pl-4 space-y-1">
            {helpEntry.tips.slice(0, 3).map((tip, idx) => (
              <li key={idx} className="text-muted-foreground">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
      {helpEntry.mt4Variable && (
        <div className="pt-1">
          <p className="text-xs text-muted-foreground">
            EA Variable:{" "}
            <span className="font-mono bg-muted px-1 rounded">
              {helpEntry.mt4Variable}
            </span>
          </p>
        </div>
      )}
    </div>
  ) : (
    <div className="max-w-xs">
      <p className="text-xs">{description || "No description available"}</p>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          {children || (
            <div className="p-0.5 rounded-full hover:bg-primary/10 transition-colors">
              <Info className="w-3 h-3 text-muted-foreground/40 cursor-help hover:text-primary/60 transition-colors" />
            </div>
          )}
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          sideOffset={8}
          className={cn(
            "max-w-md text-xs bg-popover/95 backdrop-blur-md border-border shadow-lg p-3 z-[100]",
            className,
          )}
        >
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
