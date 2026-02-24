import type { MTConfigComplete, LogicConfig } from "@/types/mt-config-complete";
import { LOGIC_SUFFIX_MAP } from "@/types/mt-config-complete";
import type { ChangePreview } from "@/lib/chat/types";

function invTrailMethod(n: number): string { return n === 0 ? "Trail_Points" : n === 1 ? "Trail_AVG_Percent" : "Trail_AVG_Points"; }
function invTrailStepMethod(n: number): string { return n === 0 ? "Step_Points" : "Step_Percent"; }
function invTrailStepMode(n: number): string { switch (n) { case 0: return "TrailStepMode_Auto"; case 1: return "TrailStepMode_Points"; case 2: return "TrailStepMode_Percent"; case 3: return "TrailStepMode_PerOrder"; case 4: return "TrailStepMode_Disabled"; default: return "TrailStepMode_Auto"; } }
function invTPSLMode(n: number): string { return n === 0 ? "TPSL_Points" : n === 1 ? "TPSL_Price" : "TPSL_Percent"; }
function invPartialMode(n: number): string { switch (n) { case 0: return "PartialMode_Low"; case 1: return "PartialMode_Mid"; case 2: return "PartialMode_Aggressive"; case 3: return "PartialMode_High"; case 4: return "PartialMode_Balanced"; default: return "PartialMode_Mid"; } }
function invPartialBalance(n: number): string { switch (n) { case 0: return "PartialBalance_Negative"; case 1: return "PartialBalance_Balanced"; case 2: return "PartialBalance_Profit"; case 3: return "PartialBalance_Aggressive"; case 4: return "PartialBalance_Conservative"; default: return "PartialBalance_Balanced"; } }
function invPartialTrigger(n: number): string { switch (n) { case 0: return "PartialTrigger_Cycle"; case 1: return "PartialTrigger_Profit"; case 2: return "PartialTrigger_Time"; case 3: return "PartialTrigger_Both"; default: return "PartialTrigger_Cycle"; } }
function invEntryTrigger(n: number): string { switch (n) { case 0: return "Trigger_Immediate"; case 1: return "Trigger_AfterBars"; case 2: return "Trigger_AfterSeconds"; case 3: return "Trigger_AfterPips"; case 4: return "Trigger_TimeFilter"; case 5: return "Trigger_NewsFilter"; default: return "Trigger_Immediate"; } }
function invGridBehavior(n: number): string { return n === 1 ? "GridBehavior_TrendFollowing" : n === 2 ? "GridBehavior_Disabled" : "GridBehavior_CounterTrend"; }
function invRestartPolicy(n: number): string { switch (n) { case 0: return "Restart_Default"; case 1: return "Restart_Cycle"; case 2: return "Continue_Cycle"; case 3: return "Stop_Trading"; default: return "Restart_Default"; } }
function invBreakevenMode(n: number): string { switch (n) { case 0: return "Breakeven_Disabled"; case 1: return "Breakeven_Points"; case 2: return "Breakeven_Percent"; case 3: return "Breakeven_Price"; default: return "Breakeven_Disabled"; } }

function suffixInverse(): Record<string, { engine: "A" | "B" | "C"; logic: string }> {
  const map: Record<string, { engine: "A" | "B" | "C"; logic: string }> = {};
  for (const [key, v] of Object.entries(LOGIC_SUFFIX_MAP)) {
    const engine: "A" | "B" | "C" = key.startsWith("B") ? "B" : key.startsWith("C") ? "C" : "A";
    const logic = key.replace(/^[ABC]/, "");
    map[v.suffix] = { engine, logic };
  }
  return map;
}

export interface ParsedSet {
  globals: Map<string, string>;
  directional: Map<string, Map<string, string>>;
}

export function parseSetContent(content: string): ParsedSet {
  const lines = content.split("\n").filter(l => l.trim().length > 0 && !l.startsWith(";"));
  const globals = new Map<string, string>();
  const directional = new Map<string, Map<string, string>>();
  for (const line of lines) {
    const gm = line.match(/^gInput_(MagicNumber|MagicNumberBuy|MagicNumberSell)=(.+)$/);
    if (gm) { globals.set(gm[1], gm[2]); continue; }
    const m = line.match(/^gInput_(\d+)_([A-Z]{1,3})_(Buy|Sell)_(.+)=(.+)$/);
    if (!m) continue;
    const group = parseInt(m[1], 10);
    const suffix = m[2];
    const dir = m[3];
    const param = m[4];
    const value = m[5];
    const key = `${suffix}_${dir}_G${group}`;
    if (!directional.has(key)) directional.set(key, new Map());
    directional.get(key)!.set(param, value);
  }
  return { globals, directional };
}

function findDirectionalLogic(config: MTConfigComplete, engineId: "A" | "B" | "C", logicName: string, dir: "B" | "S", groupNum: number): LogicConfig | undefined {
  const engine = config.engines.find(e => e.engine_id === engineId);
  if (!engine) return undefined;
  const group = engine.groups.find(g => g.group_number === groupNum);
  if (!group) return undefined;
  return group.logics.find(l => l.logic_name === logicName && ((dir === "B" && l.allowBuy && !l.allowSell) || (dir === "S" && l.allowSell && !l.allowBuy)));
}

export function computeSetChanges(config: MTConfigComplete, content: string): ChangePreview[] {
  const parsed = parseSetContent(content);
  const inverse = suffixInverse();
  const changes: ChangePreview[] = [];

  for (const [key, map] of parsed.directional.entries()) {
    const km = key.match(/^([A-Z]{1,3})_(Buy|Sell)_G(\d+)$/)!;
    const suffix = km[1];
    const dir = km[2] === "Buy" ? "B" : "S";
    const group = parseInt(km[3], 10);
    const res = inverse[suffix];
    if (!res) continue;
    const engineId = res.engine;
    const logicName = res.logic;

    const logic = findDirectionalLogic(config, engineId, logicName, dir, group);
    if (!logic) continue;

    for (const [param, raw] of map.entries()) {
      const valNum = Number(raw);
      let field: string | null = null;
      let newValue: any = raw;
      switch (param) {
        case "Start": field = "enabled"; newValue = raw === "1"; break;
        case "AllowBuy": field = "allowBuy"; newValue = raw === "1"; break;
        case "AllowSell": field = "allowSell"; newValue = raw === "1"; break;
        case "Initial_loT": field = "initialLot"; newValue = valNum; break;
        case "LastLot": field = "lastLot"; newValue = valNum; break;
        case "LastLotPower": field = "lastLot"; newValue = valNum; break;
        case "Mult": field = "multiplier"; newValue = valNum; break;
        case "Grid": field = "grid"; newValue = valNum; break;
        case "GridBehavior": field = "gridBehavior"; newValue = invGridBehavior(valNum); break;
        case "Trail": field = "trailMethod"; newValue = invTrailMethod(valNum); break;
        case "TrailValue": field = "trailValue"; newValue = valNum; break;
        case "Trail_Start": field = "trailStart"; newValue = valNum; break;
        case "TrailStep": field = "trailStep"; newValue = valNum; break;
        case "TPMode": field = "tpMode"; newValue = invTPSLMode(valNum); break;
        case "SLMode": field = "slMode"; newValue = invTPSLMode(valNum); break;
        case "UseTP": field = "useTP"; newValue = raw === "1"; break;
        case "UseSL": field = "useSL"; newValue = raw === "1"; break;
        case "TPValue": field = "takeProfit"; newValue = valNum; break;
        case "SLValue": field = "stopLoss"; newValue = valNum; break;
        case "BreakEvenMode": field = "breakEvenMode"; newValue = invBreakevenMode(valNum); break;
        case "BreakEvenActivation": field = "breakEvenActivation"; newValue = valNum; break;
        case "BreakEvenLock": field = "breakEvenLock"; newValue = valNum; break;
        case "BreakEvenTrail": field = "breakEvenTrail"; newValue = raw === "1"; break;
        case "ProfitTrailEnabled": field = "profitTrailEnabled"; newValue = raw === "1"; break;
        case "ProfitTrailPeakDropPercent": field = "profitTrailPeakDropPercent"; newValue = valNum; break;
        case "ProfitTrailLockPercent": field = "profitTrailLockPercent"; newValue = valNum; break;
        case "ProfitTrailCloseOnTrigger": field = "profitTrailCloseOnTrigger"; newValue = raw === "1"; break;
        case "ProfitTrailUseBreakEven": field = "profitTrailUseBreakEven"; newValue = raw === "1"; break;
        case "TriggerType": field = "triggerType"; newValue = invEntryTrigger(valNum); break;
        case "TriggerBars": field = "triggerBars"; newValue = valNum; break;
        case "TriggerMinutes": field = "triggerMinutes"; newValue = valNum; break;
        case "TriggerPips": field = "triggerPips"; newValue = valNum; break;
        case "ReverseEnabled": field = "reverseEnabled"; newValue = raw === "1"; break;
        case "ReverseReference": field = "reverseReference"; newValue = ("Logic_" + raw); break;
        case "ReverseScale": field = "reverseScale"; newValue = valNum; break;
        case "HedgeEnabled": field = "hedgeEnabled"; newValue = raw === "1"; break;
        case "HedgeReference": field = "hedgeReference"; newValue = ("Logic_" + raw); break;
        case "HedgeScale": field = "hedgeScale"; newValue = valNum; break;
        case "OrderCountReferenceLogic": field = "orderCountReferenceLogic"; newValue = ("Logic_" + raw); break;
        case "OrderCountReference": field = "orderCountReferenceLogic"; newValue = ("Logic_" + raw); break;
        case "MaxPowerOrders": field = "maxOrderCap"; newValue = valNum; break;
        case "CloseTargets": field = "closeTargets"; newValue = raw; break;
        case "StartLevel": field = "startLevel"; newValue = valNum; break;
        case "ResetLotOnRestart": field = "resetLotOnRestart"; newValue = raw === "1"; break;
        case "RestartPolicy": field = "restartPolicy"; newValue = invRestartPolicy(valNum); break;
        default: {
          const ts = param.match(/^TrailStep(Method|Cycle|Balance|Mode)?(\d?)$/);
          if (ts) {
            const kind = ts[1] || "";
            const idx = ts[2] ? parseInt(ts[2], 10) - 1 : 0;
            const i = Math.max(0, idx);
            const t = logic.trailSteps[i];
            if (!t) break;
            if (kind === "") { field = `trailSteps_${i}_step`; newValue = valNum; }
            else if (kind === "Method") { field = `trailSteps_${i}_method`; newValue = invTrailStepMethod(valNum); }
            else if (kind === "Cycle") { field = `trailSteps_${i}_cycle`; newValue = valNum; }
            else if (kind === "Balance") { field = `trailSteps_${i}_balance`; newValue = valNum; }
            else if (kind === "Mode") { field = `trailSteps_${i}_mode`; newValue = invTrailStepMode(valNum); }
          } else {
            const pc = param.match(/^ClosePartial(Trigger|Cycle|Mode|Balance|TrailMode|ProfitThreshold|Hours)?(\d?)$/);
            if (pc) {
              const kind = pc[1] || "";
              const idx = pc[2] ? parseInt(pc[2], 10) - 1 : 0;
              const i = Math.max(0, idx);
              const p = logic.partials[i];
              if (!p) break;
              if (kind === "") { field = `partials_${i}_enabled`; newValue = raw === "1"; }
              else if (kind === "Cycle") { field = `partials_${i}_cycle`; newValue = valNum; }
              else if (kind === "Mode") { field = `partials_${i}_mode`; newValue = invPartialMode(valNum); }
              else if (kind === "Balance") { field = `partials_${i}_balance`; newValue = invPartialBalance(valNum); }
              else if (kind === "TrailMode") { field = `partials_${i}_trailMode`; newValue = invTrailStepMode(valNum); }
              else if (kind === "Trigger") { field = `partials_${i}_trigger`; newValue = invPartialTrigger(valNum); }
              else if (kind === "ProfitThreshold") { field = `partials_${i}_profitThreshold`; newValue = valNum; }
              else if (kind === "Hours") { field = `partials_${i}_hours`; newValue = valNum; }
            }
          }
        }
      }
      if (!field) continue;
      let currentValue: any;
      if (field.startsWith("trailSteps_")) {
        const [, idxStr, sub] = field.split("_");
        const idx = Number(idxStr);
        const t = logic.trailSteps[idx];
        currentValue = (t as any)[sub];
      } else if (field.startsWith("partials_")) {
        const [, idxStr, sub] = field.split("_");
        const idx = Number(idxStr);
        const p = logic.partials[idx];
        currentValue = (p as any)[sub];
      } else {
        currentValue = (logic as any)[field];
      }
      if (currentValue === undefined) continue;
      if (currentValue === newValue) continue;
      changes.push({ engine: engineId, group, logic: logicName, field, currentValue, newValue });
    }
  }

  if (parsed.globals.has("MagicNumberBuy")) {
    const newVal = Number(parsed.globals.get("MagicNumberBuy")!);
    if (config.global.magicNumberBuy !== newVal) {
      changes.push({ engine: "GLOBAL", group: 0, logic: "-", field: "magicNumberBuy", currentValue: config.global.magicNumberBuy, newValue: newVal });
    }
  }
  if (parsed.globals.has("MagicNumberSell")) {
    const newVal = Number(parsed.globals.get("MagicNumberSell")!);
    if (config.global.magicNumberSell !== newVal) {
      changes.push({ engine: "GLOBAL", group: 0, logic: "-", field: "magicNumberSell", currentValue: config.global.magicNumberSell, newValue: newVal });
    }
  }
  if (parsed.globals.has("MagicNumber")) {
    const newVal = Number(parsed.globals.get("MagicNumber")!);
    if (config.global.baseMagicNumber !== newVal) {
      changes.push({ engine: "GLOBAL", group: 0, logic: "-", field: "baseMagicNumber", currentValue: config.global.baseMagicNumber, newValue: newVal });
    }
  }

  return changes;
}

// Apply parsed .set content directly to a config clone (non-mutating original)
export function applySetContent(config: MTConfigComplete, content: string): MTConfigComplete {
  const parsed = parseSetContent(content);
  const inverse = suffixInverse();
  const newConfig: MTConfigComplete = structuredClone(config);

  for (const [key, map] of parsed.directional.entries()) {
    const km = key.match(/^([A-Z]{1,3})_(Buy|Sell)_G(\d+)$/)!;
    const suffix = km[1];
    const dir = km[2] === "Buy" ? "B" : "S";
    const group = parseInt(km[3], 10);
    const res = inverse[suffix];
    if (!res) continue;
    const engineId = res.engine;
    const logicName = res.logic;

    const logic = findDirectionalLogic(newConfig, engineId, logicName, dir, group);
    if (!logic) continue;

    for (const [param, raw] of map.entries()) {
      const valNum = Number(raw);
      let field: string | null = null;
      let newValue: any = raw;
      switch (param) {
        case "Start": field = "enabled"; newValue = raw === "1"; break;
        case "AllowBuy": field = "allowBuy"; newValue = raw === "1"; break;
        case "AllowSell": field = "allowSell"; newValue = raw === "1"; break;
        case "Initial_loT": field = "initialLot"; newValue = valNum; break;
        case "LastLot": field = "lastLot"; newValue = valNum; break;
        case "LastLotPower": field = "lastLot"; newValue = valNum; break;
        case "Mult": field = "multiplier"; newValue = valNum; break;
        case "Grid": field = "grid"; newValue = valNum; break;
        case "GridBehavior": field = "gridBehavior"; newValue = invGridBehavior(valNum); break;
        case "Trail": field = "trailMethod"; newValue = invTrailMethod(valNum); break;
        case "TrailValue": field = "trailValue"; newValue = valNum; break;
        case "Trail_Start": field = "trailStart"; newValue = valNum; break;
        case "TrailStep": field = "trailStep"; newValue = valNum; break;
        case "TPMode": field = "tpMode"; newValue = invTPSLMode(valNum); break;
        case "SLMode": field = "slMode"; newValue = invTPSLMode(valNum); break;
        case "UseTP": field = "useTP"; newValue = raw === "1"; break;
        case "UseSL": field = "useSL"; newValue = raw === "1"; break;
        case "TPValue": field = "takeProfit"; newValue = valNum; break;
        case "SLValue": field = "stopLoss"; newValue = valNum; break;
        case "BreakEvenMode": field = "breakEvenMode"; newValue = invBreakevenMode(valNum); break;
        case "BreakEvenActivation": field = "breakEvenActivation"; newValue = valNum; break;
        case "BreakEvenLock": field = "breakEvenLock"; newValue = valNum; break;
        case "BreakEvenTrail": field = "breakEvenTrail"; newValue = raw === "1"; break;
        case "ProfitTrailEnabled": field = "profitTrailEnabled"; newValue = raw === "1"; break;
        case "ProfitTrailPeakDropPercent": field = "profitTrailPeakDropPercent"; newValue = valNum; break;
        case "ProfitTrailLockPercent": field = "profitTrailLockPercent"; newValue = valNum; break;
        case "ProfitTrailCloseOnTrigger": field = "profitTrailCloseOnTrigger"; newValue = raw === "1"; break;
        case "ProfitTrailUseBreakEven": field = "profitTrailUseBreakEven"; newValue = raw === "1"; break;
        case "TriggerType": field = "triggerType"; newValue = invEntryTrigger(valNum); break;
        case "TriggerBars": field = "triggerBars"; newValue = valNum; break;
        case "TriggerMinutes": field = "triggerMinutes"; newValue = valNum; break;
        case "TriggerPips": field = "triggerPips"; newValue = valNum; break;
        case "ReverseEnabled": field = "reverseEnabled"; newValue = raw === "1"; break;
        case "ReverseReference": field = "reverseReference"; newValue = ("Logic_" + raw); break;
        case "ReverseScale": field = "reverseScale"; newValue = valNum; break;
        case "HedgeEnabled": field = "hedgeEnabled"; newValue = raw === "1"; break;
        case "HedgeReference": field = "hedgeReference"; newValue = ("Logic_" + raw); break;
        case "HedgeScale": field = "hedgeScale"; newValue = valNum; break;
        case "OrderCountReferenceLogic": field = "orderCountReferenceLogic"; newValue = ("Logic_" + raw); break;
        case "OrderCountReference": field = "orderCountReferenceLogic"; newValue = ("Logic_" + raw); break;
        case "MaxPowerOrders": field = "maxOrderCap"; newValue = valNum; break;
        case "CloseTargets": field = "closeTargets"; newValue = raw; break;
        case "StartLevel": field = "startLevel"; newValue = valNum; break;
        case "ResetLotOnRestart": field = "resetLotOnRestart"; newValue = raw === "1"; break;
        case "RestartPolicy": field = "restartPolicy"; newValue = invRestartPolicy(valNum); break;
        default: {
          const ts = param.match(/^TrailStep(Method|Cycle|Balance|Mode)?(\d?)$/);
          if (ts) {
            const kind = ts[1] || "";
            const idx = ts[2] ? parseInt(ts[2], 10) - 1 : 0;
            const i = Math.max(0, idx);
            const t = logic.trailSteps[i];
            if (!t) break;
            if (kind === "") { (t as any).step = valNum; }
            else if (kind === "Method") { (t as any).method = invTrailStepMethod(valNum); }
            else if (kind === "Cycle") { (t as any).cycle = valNum; }
            else if (kind === "Balance") { (t as any).balance = valNum; }
            else if (kind === "Mode") { (t as any).mode = invTrailStepMode(valNum); }
            continue;
          } else {
            const pc = param.match(/^ClosePartial(Trigger|Cycle|Mode|Balance|TrailMode|ProfitThreshold|Hours)?(\d?)$/);
            if (pc) {
              const kind = pc[1] || "";
              const idx = pc[2] ? parseInt(pc[2], 10) - 1 : 0;
              const i = Math.max(0, idx);
              const p = logic.partials[i];
              if (!p) break;
              if (kind === "") { (p as any).enabled = raw === "1"; }
              else if (kind === "Cycle") { (p as any).cycle = valNum; }
              else if (kind === "Mode") { (p as any).mode = invPartialMode(valNum); }
              else if (kind === "Balance") { (p as any).balance = invPartialBalance(valNum); }
              else if (kind === "TrailMode") { (p as any).trailMode = invTrailStepMode(valNum); }
              else if (kind === "Trigger") { (p as any).trigger = invPartialTrigger(valNum); }
              else if (kind === "ProfitThreshold") { (p as any).profitThreshold = valNum; }
              else if (kind === "Hours") { (p as any).hours = valNum; }
              continue;
            }
          }
        }
      }
      if (!field) continue;
      (logic as any)[field] = newValue;
    }
  }

  if (parsed.globals.has("MagicNumberBuy")) {
    newConfig.global.magicNumberBuy = Number(parsed.globals.get("MagicNumberBuy")!);
  }
  if (parsed.globals.has("MagicNumberSell")) {
    newConfig.global.magicNumberSell = Number(parsed.globals.get("MagicNumberSell")!);
  }
  if (parsed.globals.has("MagicNumber")) {
    newConfig.global.baseMagicNumber = Number(parsed.globals.get("MagicNumber")!);
  }

  return newConfig;
}

// Build key-value map from .set content for diffing
export function buildSetMap(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content.split("\n").filter(l => l.trim().length > 0 && !l.startsWith(";"));
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    map.set(key, val);
  }
  return map;
}

export interface SetDiffEntry {
  key: string;
  left?: string;
  right?: string;
}

export interface RoundTripReport {
  totalKeysLeft: number;
  totalKeysRight: number;
  matchingKeys: number;
  valueMismatches: number;
  missingOnRight: number;
  missingOnLeft: number;
  diffs: SetDiffEntry[];
}

export function diffSetContents(left: string, right: string): RoundTripReport {
  const leftMap = buildSetMap(left);
  const rightMap = buildSetMap(right);
  const diffs: SetDiffEntry[] = [];

  let matchingKeys = 0;
  let valueMismatches = 0;
  let missingOnRight = 0;
  let missingOnLeft = 0;

  // Check left against right
  for (const [k, lv] of leftMap.entries()) {
    if (!rightMap.has(k)) {
      diffs.push({ key: k, left: lv, right: undefined });
      missingOnRight++;
    } else {
      const rv = rightMap.get(k)!;
      if (rv === lv) {
        matchingKeys++;
      } else {
        diffs.push({ key: k, left: lv, right: rv });
        valueMismatches++;
      }
    }
  }

  // Check keys present only in right
  for (const [k, rv] of rightMap.entries()) {
    if (!leftMap.has(k)) {
      diffs.push({ key: k, left: undefined, right: rv });
      missingOnLeft++;
    }
  }

  return {
    totalKeysLeft: leftMap.size,
    totalKeysRight: rightMap.size,
    matchingKeys,
    valueMismatches,
    missingOnRight,
    missingOnLeft,
    diffs,
  };
}
