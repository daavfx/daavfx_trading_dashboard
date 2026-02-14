// Command Parser - Natural Language → Structured Commands

import type { ParsedCommand, CommandType, CommandTarget, ProgressionType } from "./types";
import { parseSemanticCommand, type SemanticCommand } from "./semanticEngine";

// Field name aliases - includes V17.04+ Reverse/Hedge and TrailStep fields
const FIELD_ALIASES: Record<string, string> = {
  // Core
  "initial_lot": "initial_lot",
  "lot": "initial_lot",
  "lots": "initial_lot",
  "initial": "initial_lot",
  "multiplier": "multiplier",
  "mult": "multiplier",
  "grid": "grid",
  "spacing": "grid",
  // Trail
  "trail": "trail_value",
  "trailing": "trail_value",
  "trail_value": "trail_value",
  "trail_start": "trail_start",
  "trail_step": "trail_step",
  // Trail Step Advanced (V17.04+)
  "trail_step_mode": "trail_step_mode",
  "trail_step_cycle": "trail_step_cycle",
  "trail_cycle": "trail_step_cycle",
  "trail_step_balance": "trail_step_balance",
  "trail_balance": "trail_step_balance",
  // TPSL
  "tp": "tp_value",
  "takeprofit": "tp_value",
  "sl": "sl_value",
  "stoploss": "sl_value",
  // Logic-specific
  "start_level": "start_level",
  "start level": "start_level",
  "level": "start_level",
  // Reverse/Hedge (V17.04+)
  "reverse": "reverse_enabled",
  "reverse_enabled": "reverse_enabled",
  "reverse enabled": "reverse_enabled",
  "hedge": "hedge_enabled",
  "hedge_enabled": "hedge_enabled",
  "hedge enabled": "hedge_enabled",
  "reverse_scale": "reverse_scale",
  "reverse scale": "reverse_scale",
  "hedge_scale": "hedge_scale",
  "hedge scale": "hedge_scale",
  "reverse_reference": "reverse_reference",
  "hedge_reference": "hedge_reference",
  // Close Partial
  "close_partial": "close_partial",
  "partial": "close_partial",
};

// Logic name aliases
const LOGIC_ALIASES: Record<string, string> = {
  "power": "POWER",
  "repower": "REPOWER",
  "scalp": "SCALPER",
  "scalper": "SCALPER",
  "stopper": "STOPPER",
  "sto": "STO",
  "sca": "SCA",
  "rpo": "RPO",
  "powe": "POWER",
  "all": "ALL",  // Special: means all logics
};

// Progression type detection
const PROGRESSION_KEYWORDS: Record<string, ProgressionType> = {
  "linear": "linear",
  "fibonacci": "fibonacci",
  "fib": "fibonacci",
  "exponential": "exponential",
  "exp": "exponential",
  "custom": "custom",
};

export function parseCommand(input: string): ParsedCommand {
  const original = input.trim();
  const body = original.startsWith("/") || original.startsWith("#")
    ? original.slice(1)
    : original;
  const raw = body.toLowerCase();
  
  // Detect command type
  let type = detectCommandType(raw);
  
  // Extract target (engines, groups, logics, field)
  const target = extractTarget(raw);
  
  // Extract parameters based on command type
  const params = extractParams(raw, type);
  
  // SEMANTIC ENGINE INTEGRATION:
  // If command is "set" or "unknown" but missing field/value, try semantic parsing
  // This handles: "30% more aggressive", "make it safer", "double the lot"
  let semantic: SemanticCommand | undefined;
  if ((type === "set" || type === "unknown") && (!target.field || params.value === undefined)) {
    const semanticResult = parseSemanticCommand(raw);
    if (semanticResult) {
      semantic = semanticResult;
      type = "semantic";
    }
  }
  
  return { type, target, params, raw: original, semantic };
}

function detectCommandType(input: string): CommandType {
  // Query patterns
  if (/^(show|find|list|get|what|which|display)/.test(input)) {
    return "query";
  }
  
  // Set patterns - includes enable/disable for boolean toggles
  if (/^(set|change|update|modify|make|enable|disable|turn)/.test(input)) {
    return "set";
  }
  
  // Progression patterns
  if (/progression|sequence|generate|create.*from.*to/.test(input)) {
    return "progression";
  }
  
  // Copy patterns
  if (/^(copy|duplicate|clone|replicate)/.test(input)) {
    return "copy";
  }
  
  // Compare patterns
  if (/^(compare|diff|difference)/.test(input)) {
    return "compare";
  }
  
  // Reset patterns
  if (/^(reset|restore|default)/.test(input)) {
    return "reset";
  }
  
  // Formula patterns
  if (/^(apply|formula|calculate|compute)/.test(input)) {
    return "formula";
  }

  // Import patterns
  if (/(import|load|apply)\s+(set|\.set|setfile)/.test(input)) {
    return "import";
  }
  
  return "unknown";
}

function extractTarget(input: string): CommandTarget {
  const target: CommandTarget = {};
  
  // Extract engines - support explicit "engine A" and context-implied "power A"
  // This allows "show power a inputs" to be parsed as Logic=POWER, Engine=A
  const engineContextRegex = /(?:engine|power|powe|repower|scalper|scalp)\s*([abc])\b/gi;
  const engineMatches = [...input.matchAll(engineContextRegex)];
  
  if (engineMatches.length > 0) {
    target.engines = [...new Set(engineMatches.map(m => m[1].toUpperCase()))];
  }
  
  // CRITICAL FIX: Extract group ranges ONLY with explicit range syntax
  // Pattern: "groups 1-8", "groups 1 to 8" (requires hyphen or "X to Y" where Y <= 50)
  // This prevents "group 1 to 600" from being parsed as range 1-600
  
  // First try hyphen-based range: "groups 1-8", "group 1-5"
  const hyphenRangeMatch = input.match(/groups?\s*(\d+)\s*-\s*(\d+)(?!\d)/i);
  if (hyphenRangeMatch) {
    const start = parseInt(hyphenRangeMatch[1]);
    const end = parseInt(hyphenRangeMatch[2]);
    // Sanity check: end should be reasonable (max 50 groups)
    if (end <= 50 && end >= start) {
      target.groups = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
  }
  
  // Try "to" range ONLY when explicitly followed by non-digit (word boundary)
  // This prevents "group 1 to 100" from matching "group 1 to 10" via backtracking
  if (!target.groups) {
    // Pattern requires: number followed by non-digit (word boundary)
    const toRangeMatch = input.match(/groups?\s*(\d+)\s+to\s+(\d+)(?!\d)/i);
    if (toRangeMatch) {
      const start = parseInt(toRangeMatch[1]);
      const end = parseInt(toRangeMatch[2]);
      // Only treat as range if end is reasonable (max 50) - otherwise it's likely a value
      if (end <= 50 && end >= start) {
        target.groups = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }
    }
  }
  
  // Single group extraction (if no range found)
  if (!target.groups) {
    // Match "group 1", "group1", "groups 1", "groups 1,2,3"
    // Use word boundary approach instead of negative lookahead
    const groupMatches = input.match(/groups?\s*(\d+)/gi);
    if (groupMatches) {
      const groupNums = groupMatches.map(m => {
        const numMatch = m.match(/(\d+)/);
        return numMatch ? parseInt(numMatch[1]) : null;
      }).filter((n): n is number => n !== null && n >= 1 && n <= 50); // Valid group range 1-50
      
      if (groupNums.length > 0) {
        // Dedupe and sort
        target.groups = Array.from(new Set(groupNums)).sort((a, b) => a - b);
      }
    }
  }
  
  // Extract logics - use word boundaries to prevent substring collisions
  // e.g., "power" should not match inside "repower"
  let hasAllLogic = false;
  for (const [alias, logic] of Object.entries(LOGIC_ALIASES)) {
    // Use word boundary regex to ensure exact word match
    const wordBoundaryRegex = new RegExp(`\\b${alias}\\b`, 'i');
    if (wordBoundaryRegex.test(input)) {
      if (logic === "ALL") {
        hasAllLogic = true;
      } else {
        target.logics = target.logics || [];
        if (!target.logics.includes(logic)) {
          target.logics.push(logic);
        }
      }
    }
  }
  
  // Handle "all" keywords - "all groups", "all logics", "all engines"
  if (/\ball\s+groups?\b/i.test(input)) {
    target.groups = Array.from({ length: 15 }, (_, i) => i + 1); // Groups 1-15
  }
  if (/\ball\s+logics?\b/i.test(input) || /\ball\s+logic\b/i.test(input) || hasAllLogic) {
    target.logics = ["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"];
  }
  if (/\ball\s+engines?\b/i.test(input)) {
    target.engines = ["A", "B", "C"];
  }
  
  // Extract field - sort aliases by length (longest first) to prevent partial matches
  // e.g., "trail_step" should match before "trail"
  const sortedFieldAliases = Object.entries(FIELD_ALIASES)
    .sort((a, b) => b[0].length - a[0].length); // Longest first
  
  for (const [alias, field] of sortedFieldAliases) {
    // Use word boundary for multi-word aliases, substring for single words
    const hasSpace = alias.includes(' ');
    const hasUnderscore = alias.includes('_');
    let regex: RegExp;
    
    if (hasSpace) {
      // Multi-word alias with spaces: replace space with flexible space/underscore pattern
      regex = new RegExp(alias.replace(/ /g, '[ _]'), 'i');
    } else if (hasUnderscore) {
      // Underscore-containing field: match underscore OR space between words
      // e.g., "initial_lot" should match "initial lot" or "initial_lot"
      regex = new RegExp(alias.replace(/_/g, '[ _]'), 'i');
    } else {
      // Single word: use word boundaries
      regex = new RegExp(`\\b${alias}\\b`, 'i');
    }
    
    if (regex.test(input)) {
      target.field = field;
      break;
    }
  }
  
  return target;
}

function extractParams(input: string, type: CommandType): Record<string, any> {
  const params: Record<string, any> = {};
  
  switch (type) {
    case "set": {
      // Extract value: "set grid to 600", "set lot = 0.02"
      // ALSO SUPPORT: "set grid 600", "set lot 0.02" (implicit separator)
      
      // 1. Try explicit separators first (to, =, :)
      const explicitMatch = input.match(/(?:to|=|:)\s*([\d.]+)/);
      if (explicitMatch) {
        params.value = parseFloat(explicitMatch[1]);
      } else {
        // 2. Fallback: Scan for numbers and verify they aren't group IDs or engine letters
        // This allows "set grid 600" to work while ignoring "set group 1 grid 600"
        const numberMatches = [...input.matchAll(/(\d+(?:\.\d+)?)/g)];
        for (const match of numberMatches) {
          const val = match[1];
          const numVal = parseFloat(val);
          const idx = match.index || 0;
          
          // Skip single digits that could be engine identifiers (a=1, b=2, c=3)
          // when preceded by "power", "engine", "repower", "scalper", etc.
          if (numVal >= 1 && numVal <= 3) {
            const precedingText = input.slice(Math.max(0, idx - 12), idx).trim().toLowerCase();
            if (/(power|engine|repower|scalper|scalp|stopper|sto|sca|rpo|for)\s*$/i.test(precedingText)) {
              continue; // Skip this number - it's likely an engine identifier
            }
          }
          
          // Check text immediately preceding this number
          // Look at the 7 chars before (enough for "groups ")
          const precedingText = input.slice(Math.max(0, idx - 8), idx).trim();
          
          // If NOT preceded by "group" or "groups", treat as value
          if (!/groups?$/i.test(precedingText)) {
             params.value = numVal;
             break; // Use first non-group number found
          }
        }
      }

      // Handle boolean toggles: "enable reverse", "disable hedge"
      if (input.includes("enable") || input.includes("on")) {
        params.value = true;
      } else if (input.includes("disable") || input.includes("off")) {
        params.value = false;
      }
      break;
    }
    
    case "progression": {
      // Extract start/end values: "from 600 to 3000"
      const rangeMatch = input.match(/from\s*([\d.]+)\s*to\s*([\d.]+)/i);
      if (rangeMatch) {
        params.startValue = parseFloat(rangeMatch[1]);
        params.endValue = parseFloat(rangeMatch[2]);
      }
      
      // Extract progression type
      for (const [keyword, progType] of Object.entries(PROGRESSION_KEYWORDS)) {
        if (input.includes(keyword)) {
          params.progressionType = progType;
          break;
        }
      }
      params.progressionType = params.progressionType || "linear";
      
      // Extract factor: "factor 1.5", "multiply by 1.5"
      const factorMatch = input.match(/(?:factor|multiply\s*by)\s*([\d.]+)/i);
      if (factorMatch) {
        params.factor = parseFloat(factorMatch[1]);
      }
      break;
    }
    
    case "query": {
      // Extract comparison operator and value
      const compMatch = input.match(/(>|<|>=|<=|=|==)\s*([\d.]+)/);
      if (compMatch) {
        params.operator = compMatch[1];
        params.compareValue = parseFloat(compMatch[2]);
      }
      break;
    }
    
    case "copy": {
      // Extract source group: "from group 1"
      const sourceMatch = input.match(/from\s*group\s*(\d+)/i);
      if (sourceMatch) {
        params.sourceGroup = parseInt(sourceMatch[1]);
      }
      break;
    }
    
    case "formula": {
      // Extract formula: "grid * 1.5", "lot + 0.01"
      const formulaMatch = input.match(/formula\s*(.+?)(?:\s+(?:to|for)|$)/i);
      if (formulaMatch) {
        params.formula = formulaMatch[1].trim();
      }
      break;
    }
    case "import": {
      const block = input.match(/```[\s\S]*?```/);
      if (block) {
        const inner = block[0].replace(/^```/, "").replace(/```$/, "");
        params.setContent = inner.trim();
      } else {
        const contentMatch = input.match(/content\s*:(.+)$/i);
        if (contentMatch) {
          params.setContent = contentMatch[1].trim();
        }
      }
      break;
    }
  }
  
  return params;
}

// Generate helpful suggestions based on partial input
export function getSuggestions(input: string): string[] {
  const suggestions: string[] = [];
  const lower = input.toLowerCase();
  
  if (lower.startsWith("show") || lower.startsWith("find")) {
    suggestions.push(
      "show all groups with grid > 500",
      "show power settings for group 1",
      "find groups where start_level = 4",
      "show reverse_enabled for all groups"
    );
  } else if (lower.startsWith("set")) {
    suggestions.push(
      "set grid to 600 for groups 1-8",
      "set initial_lot to 0.02 for power",
      "set multiplier to 1.5 for all logics"
    );
  } else if (lower.includes("enable") || lower.includes("disable")) {
    suggestions.push(
      "enable reverse for power groups 1-5",
      "disable hedge for all groups",
      "enable close_partial for scalper groups 1-10"
    );
  } else if (lower.includes("reverse") || lower.includes("hedge")) {
    suggestions.push(
      "enable reverse for power groups 1-5",
      "set reverse_scale to 100 for groups 1-8",
      "disable hedge for all logics",
      "show reverse_enabled for all groups"
    );
  } else if (lower.startsWith("create") || lower.includes("progression")) {
    suggestions.push(
      "create progression for grid from 600 to 3000 fibonacci groups 1-8",
      "create linear progression for lot from 0.01 to 0.08 groups 1-8",
      "create exponential progression factor 1.5 for grid groups 1-10"
    );
  } else if (lower.startsWith("copy")) {
    suggestions.push(
      "copy power settings from group 1 to groups 2-8",
      "copy all settings from engine A to engine B"
    );
  } else {
    // Default suggestions
    suggestions.push(
      "show grid for all groups",
      "set grid to 500 for group 1",
      "enable reverse for power groups 1-5",
      "create progression for grid fibonacci groups 1-8"
    );
  }
  
  return suggestions.slice(0, 5);
}
