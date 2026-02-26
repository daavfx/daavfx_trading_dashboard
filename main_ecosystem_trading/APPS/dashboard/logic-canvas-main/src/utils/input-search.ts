import type { LogicFieldDef } from "@/data/logic-inputs";
import { logicInputs } from "@/data/logic-inputs";

export interface SearchableItem {
  type: "field" | "logic" | "category" | "engine" | "group";
  id: string;
  label: string;
  aliases: string[];
  category?: string;
  description?: string;
}

const ALL_LOGICS = [
  "POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO",
  "BPOWER", "BREPOWER", "BSCALPER", "BSTOPPER", "BSTO", "BSCA", "BRPO",
  "CPOWER", "CREPOWER", "CSCALPER", "CSTOPPER", "CSTO", "CSCA", "CRPO"
];

const ALL_CATEGORIES = [
  "Mode Selectors", "Core", "Grid", "Trail", "Trail Advanced",
  "Logic", "Restart", "TPSL", "Reverse/Hedge", "Close Partial", "Safety", "Triggers"
];

const FIELD_ALIASES: Record<string, string[]> = {
  "initial_lot": ["lot", "lots", "initial", "start lot"],
  "multiplier": ["mult", "multiplier", "martingale"],
  "grid": ["grid", "spacing", "distance", "gap"],
  "trail_value": ["trail", "trailing", "trail value", "trailing stop"],
  "trail_start": ["trail start", "start trail", "trailing start"],
  "trail_step": ["trail step", "step", "trailing step"],
  "trail_method": ["trail method", "trailing method"],
  "trail_step_method": ["trail step method"],
  "trail_step_mode": ["trail step mode", "step mode"],
  "trail_step_cycle": ["trail cycle", "cycle", "trail step cycle"],
  "trail_step_balance": ["trail balance", "balance", "trail step balance"],
  "tp_value": ["tp", "take profit", "takeprofit", "take_profit"],
  "sl_value": ["sl", "stop loss", "stoploss", "stop_loss"],
  "use_tp": ["use tp", "enable tp", "tp enabled"],
  "use_sl": ["use sl", "enable sl", "sl enabled"],
  "tp_mode": ["tp mode", "take profit mode"],
  "sl_mode": ["sl mode", "stop loss mode"],
  "start_level": ["start level", "startlevel", "level", "start"],
  "last_lot": ["last lot", "lastlot", "max lot", "maxlot"],
  "close_targets": ["close targets", "targets", "close targets"],
  "order_count_reference": ["order count ref", "order ref", "reference"],
  "reset_lot_on_restart": ["reset lot", "reset lot on restart"],
  "reverse_enabled": ["reverse", "reverse enabled", "enable reverse"],
  "hedge_enabled": ["hedge", "hedge enabled", "enable hedge"],
  "reverse_scale": ["reverse scale", "reverse percent", "reverse %"],
  "hedge_scale": ["hedge scale", "hedge percent", "hedge %"],
  "reverse_reference": ["reverse reference", "reverse ref"],
  "hedge_reference": ["hedge reference", "hedge ref"],
  "trading_mode": ["trading mode", "mode"],
  "close_partial": ["partial", "close partial", "partial close"],
  "close_partial_cycle": ["partial cycle", "close partial cycle"],
  "close_partial_mode": ["partial mode", "close partial mode"],
  "close_partial_balance": ["partial balance", "close partial balance"],
  "trigger_type": ["trigger type", "trigger"],
  "trigger_bars": ["trigger bars", "bars"],
  "trigger_minutes": ["trigger minutes", "minutes", "trigger time"],
  "trigger_pips": ["trigger pips", "pips"],
  "enabled": ["enabled", "active", "enable"],
  "entry_delay_bars": ["entry delay", "delay", "entry delay bars"],
};

const LOGIC_ALIASES: Record<string, string[]> = {
  "POWER": ["power", "pow", "powe"],
  "REPOWER": ["repower", "repo", "rpower"],
  "SCALPER": ["scalper", "scalp", "scalping"],
  "STOPPER": ["stopper", "stop"],
  "STO": ["sto", "stochastic"],
  "SCA": ["sca", "scalper alt"],
  "RPO": ["rpo", "repower optimized"],
};

function buildFieldSearchItems(): SearchableItem[] {
  const items: SearchableItem[] = [];
  const seenFields = new Set<string>();
  
  for (const [logicName, config] of Object.entries(logicInputs)) {
    const allFields = [...config.group_1, ...config.standard];
    for (const field of allFields) {
      if (seenFields.has(field.id)) continue;
      seenFields.add(field.id);
      
      items.push({
        type: "field",
        id: field.id,
        label: field.label,
        aliases: FIELD_ALIASES[field.id] || [],
        category: field.category,
        description: field.description,
      });
    }
  }
  
  return items;
}

function buildLogicSearchItems(): SearchableItem[] {
  return ALL_LOGICS.map(logic => ({
    type: "logic" as const,
    id: logic,
    label: logic.charAt(0) === 'B' || logic.charAt(0) === 'C' 
      ? `${logic.charAt(0)}-${logic.slice(1)}` 
      : logic,
    aliases: LOGIC_ALIASES[logic] || [logic.toLowerCase()],
  }));
}

function buildCategorySearchItems(): SearchableItem[] {
  return ALL_CATEGORIES.map(category => ({
    type: "category" as const,
    id: category,
    label: category,
    aliases: [category.toLowerCase()],
  }));
}

function buildEngineSearchItems(): SearchableItem[] {
  return ["A", "B", "C"].map(engine => ({
    type: "engine" as const,
    id: engine,
    label: `Engine ${engine}`,
    aliases: [`engine ${engine.toLowerCase()}`, engine.toLowerCase()],
  }));
}

function buildGroupSearchItems(): SearchableItem[] {
  return Array.from({ length: 15 }, (_, i) => ({
    type: "group" as const,
    id: String(i + 1),
    label: `Group ${i + 1}`,
    aliases: [`group ${i + 1}`, `g${i + 1}`, `g ${i + 1}`],
  }));
}

const SEARCH_INDEX: SearchableItem[] = [
  ...buildFieldSearchItems(),
  ...buildLogicSearchItems(),
  ...buildCategorySearchItems(),
  ...buildEngineSearchItems(),
  ...buildGroupSearchItems(),
];

export function searchInputs(query: string): SearchableItem[] {
  if (!query.trim()) return [];
  
  const lowerQuery = query.toLowerCase().trim();
  const words = lowerQuery.split(/\s+/);
  
  const scored = SEARCH_INDEX.map(item => {
    const searchableText = [
      item.label,
      item.id,
      ...item.aliases,
      item.category || "",
      item.description || "",
    ].join(" ").toLowerCase();
    
    let score = 0;
    
    if (item.id.toLowerCase() === lowerQuery) {
      score = 100;
    } else if (item.label.toLowerCase() === lowerQuery) {
      score = 95;
    } else if (item.label.toLowerCase().startsWith(lowerQuery)) {
      score = 80;
    } else if (item.id.toLowerCase().startsWith(lowerQuery)) {
      score = 75;
    } else if (item.aliases.some(a => a === lowerQuery)) {
      score = 70;
    } else if (item.aliases.some(a => a.startsWith(lowerQuery))) {
      score = 60;
    } else if (searchableText.includes(lowerQuery)) {
      score = 40;
    } else {
      const allWordsMatch = words.every(word => searchableText.includes(word));
      if (allWordsMatch) {
        score = 20;
      }
    }
    
    return { item, score };
  });
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(s => s.item);
}

export function getMatchingFieldIds(query: string): string[] {
  if (!query.trim()) return [];
  
  const results = searchInputs(query);
  const fieldIds: string[] = [];
  
  for (const item of results) {
    if (item.type === "field") {
      fieldIds.push(item.id);
    } else if (item.type === "category") {
      const categoryFields = SEARCH_INDEX.filter(
        i => i.type === "field" && i.category === item.id
      );
      fieldIds.push(...categoryFields.map(f => f.id));
    }
  }
  
  return [...new Set(fieldIds)];
}

export function getSearchIndex(): SearchableItem[] {
  return SEARCH_INDEX;
}

export function getFieldDisplayName(fieldId: string): string {
  const item = SEARCH_INDEX.find(i => i.type === "field" && i.id === fieldId);
  return item?.label || fieldId;
}
