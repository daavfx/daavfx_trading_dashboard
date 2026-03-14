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
      <span className="label-field group-hover:text-neutral-100 transition-colors leading-tight break-words">
        {label}
      </span>
      {description && (
        <EnhancedTooltip
          fieldId={fieldId || label.toLowerCase().replace(/\s+/g, "_")}
          description={description}
        >
          <div className="p-0.5 rounded-full hover:bg-neutral-800 transition-colors flex-shrink-0">
            <Info className="w-2.5 h-2.5 text-neutral-500 cursor-help group-hover:text-neutral-400 transition-colors" />
          </div>
        </EnhancedTooltip>
      )}
    </div>
  );

  const renderValue = () => {
    if (type === "segmented" && options) {
      return (
        <div className="flex p-0.5 rounded bg-neutral-900/50 border border-neutral-800 shrink-0">
          {options.map((option) => {
            const isSelected = localValue === option;
            return (
              <button
                key={option}
                onClick={() => handleChange(option)}
                className={cn(
                  "px-2 py-0.5 value-data rounded transition-all whitespace-nowrap",
                  isSelected
                    ? "bg-neutral-700 text-neutral-100 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800",
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
          <span className="text-[8px] text-neutral-500 hidden sm:inline">{hint}</span>
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              checked={localValue === "ON"}
              onCheckedChange={(checked) => handleChange(checked ? "ON" : "OFF")}
              className="h-4 w-7 data-[state=checked]:bg-[#4A5568]"
            />
            <span
              className={cn(
                "value-data min-w-[2rem] text-right transition-colors",
                localValue === "ON"
                  ? "text-primary"
                  : "text-muted-foreground",
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
          <SelectTrigger className="h-6 min-w-[5rem] w-full value-data text-[12px] depth-input focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <SelectValue placeholder={localValue} />
          </SelectTrigger>
          <SelectContent className="bg-neutral-950 border-white/10">
            {options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="value-data focus:bg-neutral-900 focus:text-neutral-200"
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
            className="min-w-[3.5rem] w-full h-6 text-right value-data text-[12px] px-1.5 depth-input focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all rounded placeholder:text-neutral-700 overflow-hidden text-ellipsis whitespace-nowrap"
          />
          {unit && (
            <span className="text-[8px] text-neutral-500 min-w-[2rem] text-left font-medium">
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
          className="min-w-[4rem] w-full h-6 text-right value-data text-[12px] px-1.5 depth-input focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all rounded placeholder:text-neutral-700 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap"
        />
      );
    }

    return (
      <span
        className={cn(
          "value-data px-1.5 py-0.5 rounded bg-background/30 border border-border/60 min-w-[2rem] shrink-0",
          value === "-" && "text-neutral-700",
        )}
      >
        {value}
      </span>
    );
  };

  if (type === "toggle") {
    return (
      <div className="group flex flex-col gap-1 py-1 px-2 rounded bg-neutral-900/20 hover:bg-neutral-800/40 transition-all duration-200 min-h-[1.75rem] min-w-0">
        {renderLabel()}
        {renderValue()}
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-1 py-1 px-2 rounded bg-neutral-900/20 hover:bg-neutral-800/40 transition-all duration-200 min-h-[2rem] min-w-0">
      <div className="flex items-center justify-between gap-2">
        {renderLabel()}
        {hint && type !== "toggle" && (
          <span className="text-[8px] font-medium text-neutral-500 truncate hidden sm:inline">
            {hint}
          </span>
        )}
      </div>
      <div className="w-full min-w-0">{renderValue()}</div>
    </div>
  );
}
