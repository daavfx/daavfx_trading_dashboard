import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MTConfig } from "@/types/mt-config";

type Props = {
  config: MTConfig;
  selectedGroups: string[];
  onConfigChange: (next: MTConfig) => void;
};

function parseGroupNums(selectedGroups: string[]): number[] {
  const out: number[] = [];
  for (const g of selectedGroups) {
    const m = String(g).match(/(\d+)/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function applyGroupPowerStart(
  config: MTConfig,
  targets: number[],
  valueForGroup: (groupNum: number) => number | null,
): MTConfig {
  const next: MTConfig = JSON.parse(JSON.stringify(config));
  next.engines = (next.engines || []).map((e) => {
    if (e.engine_id !== "A") return e;
    return {
      ...e,
      groups: (e.groups || []).map((g) => {
        if (!targets.includes(g.group_number)) return g;
        if (g.group_number <= 1) return { ...g, group_power_start: undefined };
        const v = valueForGroup(g.group_number);
        if (v === null) return { ...g, group_power_start: undefined };
        return { ...g, group_power_start: v };
      }),
    };
  });
  return next;
}

export function GroupThresholdsCard({ config, selectedGroups, onConfigChange }: Props) {
  const groupNums = useMemo(() => parseGroupNums(selectedGroups), [selectedGroups]);
  const selectedEffective = groupNums.filter((g) => g > 1);

  const currentFirst = useMemo(() => {
    const g = selectedEffective[0];
    if (!g) return "";
    const engA = config.engines?.find((e) => e.engine_id === "A");
    const grp = engA?.groups?.find((x) => x.group_number === g);
    const v = grp?.group_power_start;
    return typeof v === "number" ? String(v) : "";
  }, [config.engines, selectedEffective]);

  const [manualValue, setManualValue] = useState<string>(currentFirst);

  const title = selectedEffective.length > 0
    ? `Group Thresholds (selected: ${selectedEffective.join(", ")})`
    : "Group Thresholds";

  const canApplySelected = selectedEffective.length > 0;

  const applySimpleAll = () => {
    const targets = Array.from({ length: 15 }, (_, i) => i + 1).filter((g) => g > 1);
    onConfigChange(
      applyGroupPowerStart(config, targets, (g) => g),
    );
  };

  const applyV3RampAll = () => {
    const ramp: Record<number, number> = {
      2: 4,
      3: 6,
      4: 9,
      5: 12,
      6: 15,
      7: 17,
      8: 19,
      9: 23,
      10: 24,
      11: 26,
      12: 28,
      13: 29,
      14: 31,
      15: 32,
    };
    const targets = Object.keys(ramp).map((k) => parseInt(k, 10)).filter((n) => Number.isFinite(n));
    onConfigChange(
      applyGroupPowerStart(config, targets, (g) => ramp[g] ?? null),
    );
  };

  const applyManualSelected = () => {
    const n = parseInt(String(manualValue).trim(), 10);
    if (!Number.isFinite(n)) return;
    onConfigChange(
      applyGroupPowerStart(config, selectedEffective, () => n),
    );
  };

  const clearSelected = () => {
    onConfigChange(
      applyGroupPowerStart(config, selectedEffective, () => null),
    );
  };

  return (
    <div className="card-elevated rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-primary/10">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-[10px] text-muted-foreground">
              Power A trades required to activate Group N (Engine A).
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 text-[11px]")}
            onClick={applySimpleAll}
          >
            Apply Simple (g→g)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 text-[11px]")}
            onClick={applyV3RampAll}
          >
            Apply v3 Ramp
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <Input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="Set selected groups to…"
            className="h-8 text-xs"
            disabled={!canApplySelected}
          />
          <Button
            size="sm"
            className="h-8 text-[11px]"
            onClick={applyManualSelected}
            disabled={!canApplySelected}
          >
            Apply to Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[11px]"
            onClick={clearSelected}
            disabled={!canApplySelected}
          >
            Clear Selected
          </Button>
        </div>
      </div>
    </div>
  );
}

