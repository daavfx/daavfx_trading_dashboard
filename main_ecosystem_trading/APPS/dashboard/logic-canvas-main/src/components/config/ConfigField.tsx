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

  return (
    <div className="group flex items-center justify-between py-1.5 px-2 rounded bg-transparent border border-transparent hover:bg-neutral-900/30 hover:border-neutral-800 transition-all duration-200">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-medium text-neutral-400 group-hover:text-neutral-300 transition-colors truncate">
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
        {hint ? (
          <div className="text-[8px] font-mono text-neutral-500 truncate">
            {hint}
          </div>
        ) : null}
      </div>

      {type === "segmented" && options ? (
        <div className="flex p-0.5 rounded bg-neutral-900/50 border border-neutral-800">
          {options.map((option) => {
            const isSelected = localValue === option;
            return (
              <button
                key={option}
                onClick={() => handleChange(option)}
                className={cn(
                  "px-2 py-0.5 text-[9px] font-medium rounded transition-all",
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
      ) : type === "toggle" ? (
        <div className="flex items-center gap-2">
          <Switch
            checked={localValue === "ON"}
            onCheckedChange={(checked) => handleChange(checked ? "ON" : "OFF")}
            className="h-4 w-7 data-[state=checked]:bg-neutral-500"
          />
          <span
            className={cn(
              "text-[9px] font-mono w-7 text-right transition-colors",
              localValue === "ON"
                ? "text-neutral-300 font-bold"
                : "text-neutral-600",
            )}
          >
            {localValue === "ON" ? "ON" : "OFF"}
          </span>
        </div>
      ) : type === "select" && options ? (
        <Select
          value={String(localValue)}
          onValueChange={(val) =>
            handleChange(isNumericSelect ? parseInt(val, 10) : val)
          }
        >
          <SelectTrigger className="h-6 w-[100px] text-[9px] font-mono bg-transparent border border-amber-600/20 hover:border-amber-500/30 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-500/20 transition-all">
            <SelectValue placeholder={localValue} />
          </SelectTrigger>
          <SelectContent className="bg-neutral-950 border-neutral-800">
            {options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="text-[9px] font-mono focus:bg-neutral-900 focus:text-neutral-200"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === "multiselect" ? (
        <div className="w-full max-w-[150px]">
          <MultiSelectLogicDropdown
            value={localValue as string}
            onChange={(val) => handleChange(val)}
            currentLogicId={currentLogicId}
          />
        </div>
      ) : type === "number" ? (
        <div className="flex items-center gap-1">
          <Input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="w-14 h-6 text-right font-mono text-[9px] px-1.5 bg-transparent border border-amber-600/20 hover:border-amber-500/30 text-neutral-200 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-500/20 transition-all rounded placeholder:text-neutral-700"
          />
          {unit && (
            <span className="text-[8px] text-neutral-500 w-5 text-left font-medium">
              {unit}
            </span>
          )}
        </div>
      ) : type === "text" ? (
        <Input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full max-w-[120px] h-6 text-right font-mono text-[9px] px-1.5 bg-transparent border border-amber-600/20 hover:border-amber-500/30 text-neutral-200 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-500/20 transition-all rounded placeholder:text-neutral-700"
        />
      ) : (
        <span
          className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded bg-transparent border border-amber-600/15 text-neutral-400",
            value === "-" && "text-neutral-700",
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}
