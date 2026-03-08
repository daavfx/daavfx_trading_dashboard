import { Input } from "@/components/ui/input";
import { useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { MultiSelectLogicDropdown } from "./MultiSelectLogicDropdown";
import { EnhancedTooltip } from "@/components/tooltips/EnhancedTooltip";

interface ConfigFieldProps {
  label: string;
  value: string | number | undefined | null;
  type: "number" | "toggle" | "text" | "select" | "segmented" | "multiselect";
  unit?: string;
  description?: string;
  hint?: string;
  options?: string[];
  onChange?: (value: string | number | boolean) => void;
  currentLogicId?: string;
  fieldId?: string; // Added field ID for help documentation lookup
}

export function ConfigField({
  label,
  value,
  type,
  unit,
  description,
  hint,
  options,
  onChange,
  currentLogicId,
  fieldId,
}: ConfigFieldProps) {
  const formatDebugValue = (raw: unknown) => {
    if (raw === undefined) return "undefined";
    if (raw === null) return "null";
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  };
  const previousDisplayValueRef = useRef<string | number | undefined | null>(
    value,
  );
  const isNumericSelect =
    type === "select" &&
    Array.isArray(options) &&
    options.length > 0 &&
    options.every((o) => /^\d+$/.test(o));

  const handleChange = (newValue: string | number | boolean) => {
    console.log(
      `[ConfigField] CHANGE field=${fieldId || label} logic=${currentLogicId || "none"} prev=${formatDebugValue(displayValue)} next=${formatDebugValue(newValue)} type=${type}`,
    );
    console.log("[ConfigField] CHANGE", {
      fieldId: fieldId || label,
      label,
      currentLogicId: currentLogicId || null,
      previousValue: displayValue,
      nextValue: newValue,
      type,
    });
    onChange?.(newValue);
  };

  const displayValue =
    value === undefined || value === null ? "" : value;
  const selectValue =
    displayValue === "" ? undefined : String(displayValue);

  useEffect(() => {
    const previousValue = previousDisplayValueRef.current;
    if (previousValue !== value) {
      console.log(
        `[ConfigField] PROP_SYNC field=${fieldId || label} logic=${currentLogicId || "none"} prev=${formatDebugValue(previousValue)} next=${formatDebugValue(value)} type=${type}`,
      );
      console.log("[ConfigField] PROP_SYNC", {
        fieldId: fieldId || label,
        label,
        currentLogicId: currentLogicId || null,
        previousValue,
        nextValue: value,
        type,
      });
      previousDisplayValueRef.current = value;
    }
  }, [currentLogicId, fieldId, label, type, value]);

  return (
    <div className="group flex items-center justify-between py-2.5 px-3 rounded-lg bg-background/40 border border-white/5 shadow-sm hover:shadow-md hover:bg-background/60 hover:border-primary/20 hover:ring-1 hover:ring-primary/5 transition-all duration-300 backdrop-blur-sm">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground/90 transition-colors">
            {label}
          </span>
          {description && (
            <EnhancedTooltip
              fieldId={fieldId || label.toLowerCase().replace(/\s+/g, "_")}
              description={description}
            >
              <div className="p-0.5 rounded-full hover:bg-primary/10 transition-colors">
                <Info className="w-3 h-3 text-muted-foreground/40 cursor-help group-hover:text-primary/60 transition-colors" />
              </div>
            </EnhancedTooltip>
          )}
        </div>
        {hint ? (
          <div className="text-[10px] font-mono text-muted-foreground/70">
            {hint}
          </div>
        ) : null}
      </div>

      {type === "segmented" && options ? (
        <div className="flex p-0.5 rounded-md bg-muted/40 border border-white/5">
          {options.map((option) => {
            const isSelected = displayValue === option;
            return (
              <button
                key={option}
                onClick={() => handleChange(option)}
                className={cn(
                  "px-3 py-1 text-[10px] font-medium rounded-sm transition-all",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : type === "toggle" ? (
        <div className="flex items-center gap-2">
          <Switch
            checked={displayValue === "ON"}
            onCheckedChange={(checked) => handleChange(checked ? "ON" : "OFF")}
            className="h-4 w-8 data-[state=checked]:bg-primary data-[state=checked]:shadow-[0_0_12px_rgba(var(--primary),0.5)]"
          />
          <span
            className={cn(
              "text-[10px] font-mono w-7 text-right transition-colors",
              displayValue === "ON"
                ? "text-primary font-bold shadow-primary/20"
                : "text-muted-foreground",
            )}
          >
            {displayValue}
          </span>
        </div>
      ) : type === "select" && options ? (
        <Select
          value={selectValue}
          onValueChange={(val) =>
            handleChange(isNumericSelect ? parseInt(val, 10) : val)
          }
        >
          <SelectTrigger className="h-7 w-[130px] text-[10px] font-mono bg-black/5 dark:bg-white/5 border-transparent hover:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-all shadow-inner">
            <SelectValue placeholder="Unconfigured" />
          </SelectTrigger>
          <SelectContent className="bg-popover/95 backdrop-blur-xl border-white/10">
            {options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="text-[10px] font-mono focus:bg-primary/10 focus:text-primary"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === "multiselect" ? (
        <div className="w-full max-w-[200px]">
          <MultiSelectLogicDropdown
            value={displayValue as string}
            onChange={(val) => handleChange(val)}
            currentLogicId={currentLogicId}
          />
        </div>
      ) : type === "number" ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            value={displayValue}
            onChange={(e) => handleChange(e.target.value)}
            className="w-20 h-7 text-right font-mono text-[11px] px-2 bg-black/5 dark:bg-white/5 border-transparent hover:border-primary/30 text-foreground focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20 transition-all rounded-md shadow-inner placeholder:text-muted-foreground/30"
          />
          {unit && (
            <span className="text-[9px] text-muted-foreground/60 w-6 text-left font-medium">
              {unit}
            </span>
          )}
        </div>
      ) : type === "text" ? (
        <Input
          type="text"
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full max-w-[180px] h-7 text-right font-mono text-[10px] px-2 bg-black/5 dark:bg-white/5 border-transparent hover:border-primary/30 text-foreground focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20 transition-all rounded-md shadow-inner placeholder:text-muted-foreground/30"
        />
      ) : (
        <span
          className={cn(
            "text-[11px] font-mono px-2.5 py-1 rounded-md bg-black/5 dark:bg-white/5 border border-transparent",
            displayValue === "-"
              ? "text-muted-foreground/40"
              : "text-foreground font-medium",
          )}
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}
