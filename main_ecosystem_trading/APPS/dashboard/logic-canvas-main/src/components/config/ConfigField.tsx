import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
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
  fieldId?: string;
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
  const normalizedValue = value ?? "";
  const [localValue, setLocalValue] = useState(normalizedValue);
  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  const isNumericSelect =
    type === "select" &&
    Array.isArray(options) &&
    options.length > 0 &&
    options.every((o) => /^\d+$/.test(o));

  const handleChange = (newValue: string | number | boolean) => {
    setLocalValue(newValue as string | number);
    onChange?.(newValue);
  };

  const renderLabel = () => (
    <div className="flex items-start gap-1.5 min-w-0">
      <span className="label-field group-hover:text-foreground/80 transition-colors duration-100 leading-tight break-words">
        {label}
      </span>
      {description && (
        <EnhancedTooltip
          fieldId={fieldId || label.toLowerCase().replace(/\s+/g, "_")}
          description={description}
        >
          <div className="p-0.5 rounded-full hover:bg-white/[0.04] transition-colors duration-100 flex-shrink-0">
            <Info className="w-2.5 h-2.5 text-muted-foreground/50 cursor-help group-hover:text-muted-foreground/70 transition-colors duration-100" />
          </div>
        </EnhancedTooltip>
      )}
    </div>
  );

  const renderValue = () => {
    if (type === "segmented" && options) {
      return (
        <div className="flex p-0.5 rounded bg-white/[0.02] border border-white/[0.05] shrink-0">
          {options.map((option) => {
            const isSelected = localValue === option;
            return (
              <button
                key={option}
                onClick={() => handleChange(option)}
                className={cn(
                  "px-2 py-0.5 value-data rounded transition-all duration-100 whitespace-nowrap",
                  isSelected
                    ? "bg-white/[0.06] text-foreground shadow-[inset_0_-1px_0_hsl(38_10%_24%/0.4)]"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-white/[0.03]",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      );
    }

    if (type === "toggle") {
      return (
        <div className="flex items-center justify-between w-full shrink-0">
          <span className="text-[8px] text-muted-foreground/60 hidden sm:inline">{hint}</span>
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              checked={localValue === "ON"}
              onCheckedChange={(checked) => handleChange(checked ? "ON" : "OFF")}
              className="h-4 w-7 data-[state=checked]:bg-primary/25 data-[state=checked]:border-primary/20"
            />
            <span
              className={cn(
                "value-data min-w-[2rem] text-right transition-colors duration-100",
                localValue === "ON"
                  ? "text-primary/90"
                  : "text-muted-foreground/50",
              )}
            >
              {localValue === "ON" ? "ON" : "OFF"}
            </span>
          </div>
        </div>
      );
    }

    if (type === "select" && options) {
      return (
        <Select
          value={String(localValue)}
          onValueChange={(val) =>
            handleChange(isNumericSelect ? parseInt(val, 10) : val)
          }
        >
          <SelectTrigger className="h-6 min-w-[5rem] w-full value-data text-[12px] depth-input border-l-2 border-l-primary/15 focus:border-l-primary/30 focus:ring-1 focus:ring-white/[0.04] transition-all duration-100 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <SelectValue placeholder={localValue} />
          </SelectTrigger>
          <SelectContent className="bg-popover border-white/[0.06]">
            {options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="value-data focus:bg-white/[0.04] focus:text-foreground"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (type === "multiselect") {
      return (
        <div className="w-full max-w-[150px] shrink-0">
          <MultiSelectLogicDropdown
            value={localValue as string}
            onChange={(val) => handleChange(val)}
            currentLogicId={currentLogicId}
          />
        </div>
      );
    }

    if (type === "number") {
      return (
        <div className="flex items-center gap-1 shrink-0">
            <Input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="min-w-[3.5rem] w-full h-6 text-right value-data text-[12px] px-1.5 depth-input border-l-2 border-l-primary/15 focus:border-l-primary/30 focus:ring-1 focus:ring-white/[0.04] transition-all duration-100 rounded placeholder:text-muted-foreground/30 overflow-hidden text-ellipsis whitespace-nowrap"
          />
          {unit && (
            <span className="text-[8px] text-muted-foreground/60 min-w-[2rem] text-left font-medium">
              {unit}
            </span>
          )}
        </div>
      );
    }

    if (type === "text") {
      return (
        <Input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          className="min-w-[4rem] w-full h-6 text-right value-data text-[12px] px-1.5 depth-input border-l-2 border-l-primary/15 focus:border-l-primary/30 focus:ring-1 focus:ring-white/[0.04] transition-all duration-100 rounded placeholder:text-muted-foreground/30 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap"
        />
      );
    }

    return (
      <span
        className={cn(
          "value-data px-1.5 py-0.5 rounded bg-white/[0.02] border border-white/[0.04] min-w-[2rem] shrink-0",
          value === "-" && "text-muted-foreground/30",
        )}
      >
        {value}
      </span>
    );
  };

  if (type === "toggle") {
    return (
      <div className="group flex flex-col gap-1 py-1 px-2 rounded bg-white/[0.01] hover:bg-white/[0.025] transition-all duration-100 min-h-[1.75rem] min-w-0">
        {renderLabel()}
        {renderValue()}
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-1 py-1 px-2 rounded bg-white/[0.01] hover:bg-white/[0.025] transition-all duration-100 min-h-[2rem] min-w-0">
      <div className="flex items-center justify-between gap-2">
        {renderLabel()}
        {hint && (
          <span className="text-[8px] font-medium text-neutral-500 truncate hidden sm:inline">
            {hint}
          </span>
        )}
      </div>
      <div className="w-full min-w-0">{renderValue()}</div>
    </div>
  );
}
