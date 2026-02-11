import { useState, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

const ENGINES = {
  A: ["Logic_A_Power", "Logic_A_Repower", "Logic_A_Scalp", "Logic_A_Stopper", "Logic_A_STO", "Logic_A_SCA", "Logic_A_RPO"],
  B: ["Logic_B_Power", "Logic_B_Repower", "Logic_B_Scalp", "Logic_B_Stopper", "Logic_B_STO", "Logic_B_SCA", "Logic_B_RPO"],
  C: ["Logic_C_Power", "Logic_C_Repower", "Logic_C_Scalp", "Logic_C_Stopper", "Logic_C_STO", "Logic_C_SCA", "Logic_C_RPO"],
};

const LOGIC_LABELS: Record<string, string> = {
    Logic_A_Power: "A-Power", Logic_A_Repower: "A-Repower", Logic_A_Scalp: "A-Scalp", Logic_A_Stopper: "A-Stopper", Logic_A_STO: "A-STO", Logic_A_SCA: "A-SCA", Logic_A_RPO: "A-RPO",
    Logic_B_Power: "B-Power", Logic_B_Repower: "B-Repower", Logic_B_Scalp: "B-Scalp", Logic_B_Stopper: "B-Stopper", Logic_B_STO: "B-STO", Logic_B_SCA: "B-SCA", Logic_B_RPO: "B-RPO",
    Logic_C_Power: "C-Power", Logic_C_Repower: "C-Repower", Logic_C_Scalp: "C-Scalp", Logic_C_Stopper: "C-Stopper", Logic_C_STO: "C-STO", Logic_C_SCA: "C-SCA", Logic_C_RPO: "C-RPO",
};

interface MultiSelectLogicDropdownProps {
  value: string;
  onChange: (value: string) => void;
  currentLogicId?: string;
}

export function MultiSelectLogicDropdown({ value, onChange, currentLogicId }: MultiSelectLogicDropdownProps) {
  const [open, setOpen] = useState(false);
  const selectedLogics = useMemo(() => 
    value ? value.split(",").map(s => s.trim()).filter(Boolean) : [],
    [value]
  );

  // Ensure self is selected
  useEffect(() => {
    if (currentLogicId && !selectedLogics.includes(currentLogicId)) {
      // If we're mounting or currentLogicId changes and it's not in value, add it.
      // Note: We should be careful not to trigger infinite loops if onChange updates value which triggers effect.
      // But selectedLogics is derived from value, so if it's not there, we call onChange.
      // The parent will update value, selectedLogics will update, and includes check will pass.
      const newSelected = [...selectedLogics, currentLogicId];
      onChange(newSelected.join(","));
    }
  }, [currentLogicId, selectedLogics, onChange]); // Dependency on selectedLogics array (memoized by value)

  const toggleLogic = (logicId: string) => {
    if (logicId === currentLogicId) return; // Cannot unselect self

    let newSelected;
    if (selectedLogics.includes(logicId)) {
      newSelected = selectedLogics.filter(id => id !== logicId);
    } else {
      newSelected = [...selectedLogics, logicId];
    }
    onChange(newSelected.join(","));
  };

  const toggleEngine = (engine: "A" | "B" | "C") => {
      const engineLogics = ENGINES[engine];
      const allSelected = engineLogics.every(l => selectedLogics.includes(l));
      
      let newSelected = [...selectedLogics];
      if (allSelected) {
          // Deselect all except currentLogicId
          newSelected = newSelected.filter(l => !engineLogics.includes(l) || l === currentLogicId);
      } else {
          // Select all
          const toAdd = engineLogics.filter(l => !newSelected.includes(l));
          newSelected = [...newSelected, ...toAdd];
      }
      onChange(newSelected.join(","));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-[2.5rem] py-2 px-3 text-left font-normal bg-background/50 border-white/10 hover:bg-background/80"
        >
          <div className="flex flex-wrap gap-1">
            {selectedLogics.length > 0 ? (
              selectedLogics.map(logic => (
                <Badge key={logic} variant="secondary" className="mr-1 mb-1 text-[10px] px-1.5 py-0.5 h-5 bg-primary/10 text-primary border-primary/20">
                   {LOGIC_LABELS[logic] || logic}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-xs">Select targets...</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 bg-popover/95 backdrop-blur-xl border-white/10" align="start">
        <Command>
          <CommandInput placeholder="Search logic..." className="h-9 text-xs" />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No logic found.</CommandEmpty>
            {(Object.keys(ENGINES) as Array<keyof typeof ENGINES>).map(engine => (
              <CommandGroup key={engine} heading={`Engine ${engine}`}>
                 <div 
                    className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-accent/50 rounded-sm mb-1 group" 
                    onClick={(e) => { e.preventDefault(); toggleEngine(engine); }}
                 >
                    <div className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-colors",
                        ENGINES[engine].every(l => selectedLogics.includes(l)) 
                            ? "bg-primary text-primary-foreground" 
                            : "opacity-50 group-hover:opacity-100"
                      )}>
                        {ENGINES[engine].every(l => selectedLogics.includes(l)) && <Check className="h-3 w-3" />}
                    </div>
                    <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground transition-colors">Select All Engine {engine}</span>
                 </div>
                {ENGINES[engine].map(logic => (
                  <CommandItem
                    key={logic}
                    value={logic} // Using ID as value for simplicity, though search might be better with label
                    keywords={[LOGIC_LABELS[logic]]}
                    onSelect={() => toggleLogic(logic)}
                    className="text-xs pl-6"
                    disabled={logic === currentLogicId}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        selectedLogics.includes(logic)
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className={cn("h-3 w-3")} />
                    </div>
                    {LOGIC_LABELS[logic] || logic}
                    {logic === currentLogicId && <span className="ml-auto text-[10px] text-muted-foreground">(Self)</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
