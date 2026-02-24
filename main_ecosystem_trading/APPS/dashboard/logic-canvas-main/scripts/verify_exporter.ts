import { generateMassiveCompleteConfig } from "@/lib/setfile/massive-generator";
import { exportToSetFileWithDirections } from "@/lib/setfile/exporter";
import { LOGIC_SUFFIX_MAP, TOTAL_LOGIC_DIRECTIONS, FIELDS_PER_LOGIC } from "@/types/mt-config-complete";
import { PARAM_NAMES } from "@/lib/export/complete-setfile-generator";
import fs from "node:fs";
import path from "node:path";

function invTrailMethod(n: number): string {
  return n === 0 ? "Trail_Points" : n === 1 ? "Trail_AVG_Percent" : "Trail_AVG_Points";
}
function invTrailStepMethod(n: number): string { return n === 0 ? "Step_Points" : "Step_Percent"; }
function invTrailStepMode(n: number): string {
  switch (n) { case 0: return "TrailStepMode_Auto"; case 1: return "TrailStepMode_Points"; case 2: return "TrailStepMode_Percent"; case 3: return "TrailStepMode_PerOrder"; case 4: return "TrailStepMode_Disabled"; default: return "TrailStepMode_Auto"; }
}
function invTPSLMode(n: number): string { return n === 0 ? "TPSL_Points" : n === 1 ? "TPSL_Price" : "TPSL_Percent"; }
function invPartialMode(n: number): string {
  switch (n) { case 0: return "PartialMode_Low"; case 1: return "PartialMode_Mid"; case 2: return "PartialMode_Aggressive"; case 3: return "PartialMode_High"; case 4: return "PartialMode_Balanced"; default: return "PartialMode_Mid"; }
}
function invPartialBalance(n: number): string {
  switch (n) { case 0: return "PartialBalance_Negative"; case 1: return "PartialBalance_Balanced"; case 2: return "PartialBalance_Profit"; case 3: return "PartialBalance_Aggressive"; case 4: return "PartialBalance_Conservative"; default: return "PartialBalance_Balanced"; }
}
function invPartialTrigger(n: number): string {
  switch (n) { case 0: return "PartialTrigger_Cycle"; case 1: return "PartialTrigger_Profit"; case 2: return "PartialTrigger_Time"; case 3: return "PartialTrigger_Both"; default: return "PartialTrigger_Cycle"; }
}
function invEntryTrigger(n: number): string {
  switch (n) { case 0: return "Trigger_Immediate"; case 1: return "Trigger_AfterBars"; case 2: return "Trigger_AfterSeconds"; case 3: return "Trigger_AfterPips"; case 4: return "Trigger_TimeFilter"; case 5: return "Trigger_NewsFilter"; default: return "Trigger_Immediate"; }
}
function invGridBehavior(n: number): string { return n === 1 ? "GridBehavior_TrendFollowing" : n === 2 ? "GridBehavior_Disabled" : "GridBehavior_CounterTrend"; }
function invRestartPolicy(n: number): string {
  switch (n) { case 0: return "Restart_Default"; case 1: return "Restart_Cycle"; case 2: return "Continue_Cycle"; case 3: return "Stop_Trading"; default: return "Restart_Default"; }
}
function invBreakevenMode(n: number): string {
  switch (n) { case 0: return "Breakeven_Disabled"; case 1: return "Breakeven_Points"; case 2: return "Breakeven_Percent"; case 3: return "Breakeven_Price"; default: return "Breakeven_Disabled"; }
}

type ParsedSetfile = {
  totalGInputKeys: number;
  generalKeys: number;
  logicKeys: number;
  duplicateKeys: Array<{ key: string; count: number }>;
  uniqueGroups: number;
  uniqueSuffixes: number;
  uniqueDirections: number;
  logicDirectionsFound: number;
  expectedLogicDirections: number;
  fieldsPerLogicDirection: {
    min: number;
    max: number;
    mode: number;
  };
  missingLogicDirections: number;
};

function parseMassiveV19Setfile(content: string): ParsedSetfile {
  const rawLines = content.split(/\r?\n/);
  const kvLines = rawLines
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith(";") && l.includes("="))
    .map(l => {
      const idx = l.indexOf("=");
      return {
        key: l.slice(0, idx).trim(),
        value: l.slice(idx + 1).trim(),
      };
    })
    .filter(({ key }) => key.startsWith("gInput_"));

  const keyCounts = new Map<string, number>();
  for (const { key } of kvLines) {
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  const duplicateKeys = Array.from(keyCounts.entries())
    .filter(([, c]) => c > 1)
    .map(([k, c]) => ({ key: k, count: c }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const expectedSuffixes = new Set(Object.values(LOGIC_SUFFIX_MAP).map(v => v.suffix));

  const groups = new Set<string>();
  const suffixes = new Set<string>();
  const directions = new Set<string>();

  const logicDirectionFields = new Map<string, number>();
  let logicKeys = 0;
  let generalKeys = 0;

  for (const { key } of kvLines) {
    const m = key.match(/^gInput_(\d+)_([A-Z]{1,3})_(Buy|Sell)_(.+)$/);
    if (m) {
      const group = parseInt(m[1], 10);
      const suffix = m[2];
      const dir = m[3];
      if (group >= 1 && group <= 15 && expectedSuffixes.has(suffix)) {
        groups.add(String(group));
        suffixes.add(suffix);
        directions.add(dir);
        const logicDirKey = `${group}_${suffix}_${dir}`;
        logicDirectionFields.set(logicDirKey, (logicDirectionFields.get(logicDirKey) || 0) + 1);
        logicKeys++;
        continue;
      }
    }
    generalKeys++;
  }

  const fieldCounts = Array.from(logicDirectionFields.values());
  const freq = new Map<number, number>();
  for (const c of fieldCounts) freq.set(c, (freq.get(c) || 0) + 1);
  const mode = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  const min = fieldCounts.length ? Math.min(...fieldCounts) : 0;
  const max = fieldCounts.length ? Math.max(...fieldCounts) : 0;

  const expectedLogicDirections = TOTAL_LOGIC_DIRECTIONS;
  const logicDirectionsFound = logicDirectionFields.size;
  const missingLogicDirections = Math.max(0, expectedLogicDirections - logicDirectionsFound);

  return {
    totalGInputKeys: kvLines.length,
    generalKeys,
    logicKeys,
    duplicateKeys,
    uniqueGroups: groups.size,
    uniqueSuffixes: suffixes.size,
    uniqueDirections: directions.size,
    logicDirectionsFound,
    expectedLogicDirections,
    fieldsPerLogicDirection: { min, max, mode },
    missingLogicDirections,
  };
}

function run() {
  const argPath = process.argv[2];
  const mode = process.argv[3] || "";

  const content = argPath
    ? fs.readFileSync(path.resolve(argPath), "utf8")
    : exportToSetFileWithDirections(generateMassiveCompleteConfig());

  const massiveParsed = parseMassiveV19Setfile(content);

  const massiveOk =
    massiveParsed.duplicateKeys.length === 0 &&
    massiveParsed.uniqueGroups === 15 &&
    massiveParsed.uniqueDirections === 2 &&
    massiveParsed.uniqueSuffixes === 21 &&
    massiveParsed.logicDirectionsFound === massiveParsed.expectedLogicDirections &&
    massiveParsed.fieldsPerLogicDirection.min === massiveParsed.fieldsPerLogicDirection.max;

  console.log(JSON.stringify({
    source: argPath || "(generated)",
    totalGInputKeys: massiveParsed.totalGInputKeys,
    logicKeys: massiveParsed.logicKeys,
    generalKeys: massiveParsed.generalKeys,
    logicDirectionsFound: massiveParsed.logicDirectionsFound,
    expectedLogicDirections: massiveParsed.expectedLogicDirections,
    missingLogicDirections: massiveParsed.missingLogicDirections,
    uniqueGroups: massiveParsed.uniqueGroups,
    uniqueSuffixes: massiveParsed.uniqueSuffixes,
    uniqueDirections: massiveParsed.uniqueDirections,
    fieldsPerLogicDirection: massiveParsed.fieldsPerLogicDirection,
    duplicates: massiveParsed.duplicateKeys.slice(0, 20),
  }, null, 2));

  if (!massiveOk) {
    console.error("[VERIFY] MASSIVE v19 setfile validation failed");
    process.exit(1);
  }
  console.log("[VERIFY] MASSIVE v19 setfile validation passed");

  if (mode !== "--roundtrip") {
    return;
  }

  const lines = content.split("\n").filter(l => l.trim().length > 0 && !l.startsWith(";"));
  const kv = lines.filter(l => l.startsWith("gInput_"));
  const keys = kv.map(l => l.split("=")[0]);

  const total = keys.length;
  const logicDirectionalKeys = keys.filter(k => /^gInput_\d+_[A-Z]{1,3}_(Buy|Sell)_/.test(k));
  const buyCount = logicDirectionalKeys.filter(k => k.includes("_Buy_")).length;
  const sellCount = logicDirectionalKeys.filter(k => k.includes("_Sell_")).length;

  const groups = new Set<string>();
  const suffixes = new Set<string>();
  const directions = new Set<string>();

  for (const k of keys) {
    const gMatch = k.match(/^gInput_(\d+)_/);
    if (gMatch) groups.add(gMatch[1]);
    const sMatch = k.match(/^gInput_\d+_([A-Z]{1,3})_/);
    if (sMatch) suffixes.add(sMatch[1]);
    const dMatch = k.match(/_(Buy|Sell)_/);
    if (dMatch) directions.add(dMatch[1]);
  }

  const globalBuyMagic = kv.find(l => l.startsWith("gInput_MagicNumberBuy="));
  const globalSellMagic = kv.find(l => l.startsWith("gInput_MagicNumberSell="));

  const expectedSuffixes = new Set(Object.values(LOGIC_SUFFIX_MAP).map(v => v.suffix));
  const hasEngineAwareSuffixes = ["AP","AR","AS","AT","AO","AC","AX","BP","BR","BS","BT","BO","BC","BX","CP","CR","CS","CT","CO","CC","CX"].every(s => expectedSuffixes.has(s));

  const expectedDirectionalCount = 69300;
  const summary = {
    totalKeys: total,
    buyKeys: buyCount,
    sellKeys: sellCount,
    expectedDirectionalKeys: expectedDirectionalCount,
    uniqueGroups: groups.size,
    uniqueSuffixes: suffixes.size,
    uniqueDirections: directions.size,
    totalLogicDirectionsExpected: TOTAL_LOGIC_DIRECTIONS,
    hasMagicBuySellGlobals: Boolean(globalBuyMagic && globalSellMagic),
    hasEngineAwareSuffixes,
  };

  const ok = summary.uniqueGroups === 15 && summary.uniqueDirections === 2 && summary.hasMagicBuySellGlobals && summary.hasEngineAwareSuffixes && (buyCount + sellCount) >= expectedDirectionalCount;

  console.log(JSON.stringify(summary, null, 2));
  if (!ok) {
    console.error("[VERIFY] Exporter verification failed");
    process.exit(1);
  } else {
    console.log("[VERIFY] Exporter verification passed");
  }

  const suffixInverse: Record<string, { engine: "A" | "B" | "C"; logic: string }> = {};
  for (const [key, v] of Object.entries(LOGIC_SUFFIX_MAP)) {
    const engine: "A" | "B" | "C" = key.startsWith("B") ? "B" : key.startsWith("C") ? "C" : "A";
    const logic = key.replace(/^[ABC]/, "");
    suffixInverse[v.suffix] = { engine, logic };
  }

  const parsed: Map<string, Map<string, string>> = new Map();
  for (const line of kv) {
    const m = line.match(/^gInput_(\d+)_([A-Z]{1,3})_(Buy|Sell)_(.+)=(.+)$/);
    if (!m) continue;
    const group = parseInt(m[1], 10);
    const suffix = m[2];
    const dir = m[3];
    const param = m[4];
    const value = m[5];
    const map = suffixInverse[suffix];
    if (!map) continue;
    const key = `${map.engine}_${map.logic}_${dir}_G${group}`;
    if (!parsed.has(key)) parsed.set(key, new Map());
    parsed.get(key)!.set(param, value);
  }

  const logicDirections = Array.from(parsed.keys());
  const counts = logicDirections.map(k => parsed.get(k)!.size);
  const minCount = counts.length ? Math.min(...counts) : 0;
  const maxCount = counts.length ? Math.max(...counts) : 0;
  const distinctCount = logicDirections.length;

  const importSummary = {
    parsedLogicDirections: distinctCount,
    expectedLogicDirections: TOTAL_LOGIC_DIRECTIONS,
    minFieldsPerLogic: minCount,
    maxFieldsPerLogic: maxCount,
    expectedFieldsPerLogic: FIELDS_PER_LOGIC,
    roundTripLoadable: distinctCount === TOTAL_LOGIC_DIRECTIONS && minCount >= Math.min(60, FIELDS_PER_LOGIC),
  };

  console.log(JSON.stringify(importSummary, null, 2));
  if (!importSummary.roundTripLoadable) {
    console.error("[VERIFY] Import verification failed");
    process.exit(1);
  } else {
    console.log("[VERIFY] Import verification passed");
  }

  // Build MTConfig from parsed maps using default generator, then re-export and diff
  const rebuilt = generateMassiveCompleteConfig();

  // Fill global fields
  const gkv = new Map<string, string>();
  kv.forEach(l => {
    const gm = l.match(/^gInput_(.+)=(.+)$/);
    if (gm) gkv.set(gm[1], gm[2]);
  });
  const g = rebuilt.global;
  if (gkv.has("MagicNumber")) g.baseMagicNumber = parseInt(gkv.get("MagicNumber")!, 10);
  if (gkv.has("MagicNumberBuy")) g.magicNumberBuy = parseInt(gkv.get("MagicNumberBuy")!, 10);
  if (gkv.has("MagicNumberSell")) g.magicNumberSell = parseInt(gkv.get("MagicNumberSell")!, 10);

  // Fill engines/groups/logics
  for (const [key, map] of parsed.entries()) {
    const m = key.match(/^([ABC])_(.+)_(Buy|Sell)_G(\d+)$/);
    if (!m) continue;
    const engineId = m[1] as "A" | "B" | "C";
    const logicName = m[2];
    const dir = m[3] === "Buy" ? "B" : "S"; // normalized direction
    const groupNum = parseInt(m[4], 10);

    const engine = rebuilt.engines.find(e => e.engine_id === engineId);
    if (!engine) continue;
    const group = engine.groups.find(gp => gp.group_number === groupNum);
    if (!group) continue;
    const logic = group.logics.find(l => l.logic_name === logicName && ((dir === "B" && l.allowBuy && !l.allowSell) || (dir === "S" && l.allowSell && !l.allowBuy)));
    if (!logic) continue;

    // Apply fields
    for (const [param, raw] of map.entries()) {
      const valNum = Number(raw);
      switch (param) {
        case "Start": (logic as any).enabled = raw === "1"; break;
        case "AllowBuy": logic.allowBuy = raw === "1"; break;
        case "AllowSell": logic.allowSell = raw === "1"; break;
        case "Initial_loT": (logic as any).initialLot = valNum; break;
        case "LastLot": (logic as any).lastLot = valNum; break;
        case "LastLotPower": (logic as any).lastLot = valNum; break;
        case "Mult": (logic as any).multiplier = valNum; break;
        case "Grid": (logic as any).grid = valNum; break;
        case "MaxPowerOrders": engine.max_power_orders = valNum; break;
        case "GridBehavior": (logic as any).gridBehavior = invGridBehavior(valNum); break;
        case "Trail": (logic as any).trailMethod = invTrailMethod(valNum); break;
        case "TrailValue": (logic as any).trailValue = valNum; break;
        case "Trail_Start": (logic as any).trailStart = valNum; break;
        case "TrailStep": (logic as any).trailStep = valNum; break;
        case "TPMode": (logic as any).tpMode = invTPSLMode(valNum); break;
        case "SLMode": (logic as any).slMode = invTPSLMode(valNum); break;
        case "UseTP": (logic as any).useTP = raw === "1"; break;
        case "UseSL": (logic as any).useSL = raw === "1"; break;
        case "TPValue": (logic as any).takeProfit = valNum; break;
        case "SLValue": (logic as any).stopLoss = valNum; break;
        case "BreakEvenMode": (logic as any).breakEvenMode = invBreakevenMode(valNum); break;
        case "BreakEvenActivation": (logic as any).breakEvenActivation = valNum; break;
        case "BreakEvenLock": (logic as any).breakEvenLock = valNum; break;
        case "BreakEvenTrail": (logic as any).breakEvenTrail = raw === "1"; break;
        case "ProfitTrailEnabled": (logic as any).profitTrailEnabled = raw === "1"; break;
        case "ProfitTrailPeakDropPercent": (logic as any).profitTrailPeakDropPercent = valNum; break;
        case "ProfitTrailLockPercent": (logic as any).profitTrailLockPercent = valNum; break;
        case "ProfitTrailCloseOnTrigger": (logic as any).profitTrailCloseOnTrigger = raw === "1"; break;
        case "ProfitTrailUseBreakEven": (logic as any).profitTrailUseBreakEven = raw === "1"; break;
        case "TriggerType": (logic as any).triggerType = invEntryTrigger(valNum); break;
        case "TriggerBars": (logic as any).triggerBars = valNum; break;
        case "TriggerMinutes": (logic as any).triggerMinutes = valNum; break;
        case "TriggerPips": (logic as any).triggerPips = valNum; break;
        case "ReverseEnabled": (logic as any).reverseEnabled = raw === "1"; break;
        case "ReverseReference": (logic as any).reverseReference = ("Logic_" + raw) as any; break;
        case "ReverseScale": (logic as any).reverseScale = valNum; break;
        case "HedgeEnabled": (logic as any).hedgeEnabled = raw === "1"; break;
        case "HedgeReference": (logic as any).hedgeReference = ("Logic_" + raw) as any; break;
        case "HedgeScale": (logic as any).hedgeScale = valNum; break;
        case "MaxPowerOrders": (logic as any).maxOrderCap = valNum; break;
        case "OrderCountReferenceLogic": (logic as any).orderCountReferenceLogic = ("Logic_" + raw) as any; break;
        case "OrderCountReference": (logic as any).orderCountReferenceLogic = ("Logic_" + raw) as any; break;
        case "CloseTargets": (logic as any).closeTargets = raw; break;
        case "StartLevel": (logic as any).startLevel = valNum; break;
        case "ResetLotOnRestart": (logic as any).resetLotOnRestart = raw === "1"; break;
        case "RestartPolicy": (logic as any).restartPolicy = invRestartPolicy(valNum); break;
        default:
          // Trail steps and partials
          {
            const ts = param.match(/^TrailStep(Method|Cycle|Balance|Mode)?(\d?)$/);
            if (ts) {
              const kind = ts[1] || "";
              const idx = ts[2] ? parseInt(ts[2], 10) - 1 : 0;
              const i = Math.max(0, idx);
              const t = logic.trailSteps[i];
              if (!t) continue;
              if (kind === "") t.step = valNum;
              else if (kind === "Method") t.method = invTrailStepMethod(valNum) as any;
              else if (kind === "Cycle") t.cycle = valNum;
              else if (kind === "Balance") t.balance = valNum;
              else if (kind === "Mode") t.mode = invTrailStepMode(valNum) as any;
              continue;
            }
            const pc = param.match(/^ClosePartial(Trigger|Cycle|Mode|Balance|TrailMode|ProfitThreshold|Hours)?(\d?)$/);
            if (pc) {
              const kind = pc[1] || "";
              const idx = pc[2] ? parseInt(pc[2], 10) - 1 : 0;
              const i = Math.max(0, idx);
              const p = logic.partials[i];
              if (!p) continue;
              if (kind === "") p.enabled = raw === "1";
              else if (kind === "Cycle") p.cycle = valNum;
              else if (kind === "Mode") p.mode = invPartialMode(valNum) as any;
              else if (kind === "Balance") p.balance = invPartialBalance(valNum) as any;
              else if (kind === "TrailMode") p.trailMode = invTrailStepMode(valNum) as any;
              else if (kind === "Trigger") p.trigger = invPartialTrigger(valNum) as any;
              else if (kind === "ProfitThreshold") p.profitThreshold = valNum;
              else if (kind === "Hours") p.hours = valNum;
              continue;
            }
          }
      }
    }
  }

  const rebuiltSet = exportToSetFileWithDirections(rebuilt);
  const rebuiltKV = rebuiltSet.split("\n").filter(l => l.trim().length > 0 && !l.startsWith(";") && l.startsWith("gInput_")).sort();
  const originalKV = content.split("\n").filter(l => l.trim().length > 0 && !l.startsWith(";") && l.startsWith("gInput_")).sort();

  // Diff limited to representative subset: directional keys and global magic numbers
  const subsetFilter = (l: string) => /^gInput_\d+_[A-Z]{1,3}_(Buy|Sell)_/.test(l) || /^gInput_MagicNumber(Buy|Sell)=/.test(l);
  const rebuiltSubset = rebuiltKV.filter(subsetFilter);
  const originalSubset = originalKV.filter(subsetFilter);
  const setRebuilt = new Set(rebuiltSubset);
  const setOriginal = new Set(originalSubset);
  const missingInRebuilt = originalSubset.filter(l => !setRebuilt.has(l));
  const missingInOriginal = rebuiltSubset.filter(l => !setOriginal.has(l));

  const roundTripSummary = {
    subsetCountOriginal: originalSubset.length,
    subsetCountRebuilt: rebuiltSubset.length,
    missingInRebuilt: missingInRebuilt.length,
    missingInOriginal: missingInOriginal.length
  };
  console.log(JSON.stringify(roundTripSummary, null, 2));
  if (missingInRebuilt.length > 0 || missingInOriginal.length > 0) {
    console.error("[ROUNDTRIP] Differences detected in subset");
    // Print small sample for diagnosis
    console.error("Sample missing in rebuilt:", missingInRebuilt.slice(0, 5));
    console.error("Sample missing in original:", missingInOriginal.slice(0, 5));
    process.exit(1);
  } else {
    console.log("[ROUNDTRIP] Subset equivalence passed");
  }
}

run();
