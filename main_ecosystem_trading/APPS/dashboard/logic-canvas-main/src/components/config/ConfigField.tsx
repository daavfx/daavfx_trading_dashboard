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
    <div className="group flex items-center justify-between py-2 px-2 rounded-md bg-zinc-800/40 border border-zinc-700/50 hover:bg-zinc-800/60 hover:border-zinc-600 transition-all duration-200">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors truncate">
            {label}
          </span>
          {description && (
            <EnhancedTooltip
              fieldId={fieldId || label.toLowerCase().replace(/\s+/g, "_")}
              description={description}
            >
              <div className="p-0.5 rounded-full hover:bg-zinc-700 transition-colors flex-shrink-0">
                <Info className="w-3 h-3 text-zinc-500 cursor-help group-hover:text-zinc-400 transition-colors" />
              </div>
            </EnhancedTooltip>
          )}
        </div>
        {hint ? (
          <div className="text-[9px] font-mono text-zinc-500 truncate">
            {hint}
          </div>
        ) : null}
      </div>

      {type === "segmented" && options ? (
        <div className="flex p-0.5 rounded-md bg-zinc-800 border border-zinc-700">
          {options.map((option) => {
            const isSelected = localValue === option;
            return (
              <button
                key={option}
                onClick={() => handleChange(option)}
                className={cn(
                  "px-2 py-1 text-[10px] font-medium rounded transition-all",
                  isSelected
                    ? "bg-zinc-600 text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700",
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
            className="h-5 w-9 data-[state=checked]:bg-zinc-500"
          />
          <span
            className={cn(
              "text-[10px] font-mono w-8 text-right transition-colors",
              localValue === "ON"
                ? "text-zinc-300 font-bold"
                : "text-zinc-600",
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
          <SelectTrigger className="h-7 w-[120px] text-[10px] font-mono bg-zinc-800 border-zinc-700 hover:border-zinc-500 focus:ring-1 focus:ring-zinc-600 transition-all">
            <SelectValue placeholder={localValue} />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
            {options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="text-[10px] font-mono focus:bg-zinc-800 focus:text-zinc-200"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === "multiselect" ? (
        <div className="w-full max-w-[200px]">
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
            className="w-16 h-7 text-right font-mono text-[10px] px-2 bg-zinc-800 border-zinc-700 hover:border-zinc-500 text-zinc-200 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-600 transition-all rounded shadow-inner placeholder:text-zinc-600"
          />
          {unit && (
            <span className="text-[9px] text-zinc-500 w-6 text-left font-medium">
              {unit}
            </span>
          )}
        </div>
      ) : type === "text" ? (
        <Input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full max-w-[150px] h-7 text-right font-mono text-[10px] px-2 bg-zinc-800 border-zinc-700 hover:border-zinc-500 text-zinc-200 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-600 transition-all rounded shadow-inner placeholder:text-zinc-600"
        />
      ) : (
        <span
          className={cn(
            "text-[10px] font-mono px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300",
            value === "-" && "text-zinc-600",
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}
