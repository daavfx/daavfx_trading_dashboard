// Semantic Engine - Rule-Based Natural Language → Structured Operations
// Handles trader language like "30% more aggressive", "make it safer", "tighten the grid"
// Deterministic, testable, no LLM dependency

export interface FieldOperation {
  field: string;
  op: "scale" | "set" | "add" | "subtract";
  factor?: number;
  value?: number | string | boolean;
}

export interface SemanticCommand {
  operations: FieldOperation[];
  description: string;
  preview?: string[];
}

interface SemanticRule {
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => SemanticCommand | null;
  description: string;
}

// Semantic field groups - which fields represent "aggressiveness" vs "safety"
const AGGRESSIVE_FIELDS = ["multiplier", "initial_lot", "close_partial"];
const SAFETY_FIELDS = ["grid", "trail_start", "trail_value", "sl_value"];
const SPEED_FIELDS = ["grid", "trail_step", "trail_start"];

// Rule definitions - ordered by specificity (most specific first)
const SEMANTIC_RULES: SemanticRule[] = [
  // === HEDGE / VOLATILITY MODES ===
  {
    // "setup hedge mode for high volatility markets"
    pattern: /setup\s+hedge\s+(?:mode\s+)?for\s+(?:high\s+)?(?:volatilit(?:y|ies)|volatile)(?:\s+markets?)?/i,
    description: "Enable Hedge Mode with high-volatility safety settings",
    extract: () => ({
      operations: [
        { field: "trading_mode", op: "set", value: "Hedge" },
        { field: "initial_lot", op: "set", value: 0.01 },
        { field: "trigger_bars", op: "set", value: 5 },
        { field: "trigger_pips", op: "set", value: 5.0 },
        { field: "tp_value", op: "set", value: 60 },
        { field: "sl_value", op: "set", value: 1000 },
      ],
      description: "Activate Hedge Mode for High Volatility (Lot=0.01, Trigger=5/5.0, Wide SL)",
    }),
  },

  // === PERCENTAGE SCALING ===
  {
    // "30% more aggressive", "50% more aggressive"
    pattern: /(\d+)\s*%\s*more\s+(aggressive|stronger|faster)/i,
    description: "Scale aggressive parameters up by percentage",
    extract: (match) => {
      const percent = parseInt(match[1]);
      const factor = 1 + (percent / 100);
      const gridFactor = 1 / factor; // Tighter grid = more aggressive
      return {
        operations: [
          { field: "multiplier", op: "scale", factor },
          { field: "initial_lot", op: "scale", factor },
          { field: "grid", op: "scale", factor: gridFactor },
        ],
        description: `Increase aggressiveness by ${percent}%`,
      };
    },
  },
  {
    // "30% less aggressive", "50% less aggressive"
    pattern: /(\d+)\s*%\s*(less|more)\s+(conservative|safer|safer)/i,
    description: "Scale toward safety by percentage",
    extract: (match) => {
      const percent = parseInt(match[1]);
      const isLess = match[2].toLowerCase() === "less";
      // "less aggressive" = more conservative = scale down
      // "more conservative" = scale down
      const factor = isLess ? (1 - percent / 100) : (1 - percent / 100);
      const gridFactor = 1 / factor; // Wider grid = safer
      return {
        operations: [
          { field: "multiplier", op: "scale", factor },
          { field: "initial_lot", op: "scale", factor },
          { field: "grid", op: "scale", factor: gridFactor },
        ],
        description: `Decrease aggressiveness by ${percent}%`,
      };
    },
  },
  {
    // "make it 50% safer"
    pattern: /(\d+)\s*%\s*safer/i,
    description: "Scale safety parameters by percentage",
    extract: (match) => {
      const percent = parseInt(match[1]);
      const gridFactor = 1 + (percent / 100); // Wider grid = safer
      const lotFactor = 1 - (percent / 100 * 0.5); // Reduce lot by half the percentage
      return {
        operations: [
          { field: "grid", op: "scale", factor: gridFactor },
          { field: "multiplier", op: "scale", factor: lotFactor },
          { field: "initial_lot", op: "scale", factor: lotFactor },
        ],
        description: `Increase safety by ${percent}%`,
      };
    },
  },

  // === RELATIVE ADJUSTMENTS ===
  {
    // "double the lot", "double the grid", "double the multiplier"
    pattern: /double\s*(?:the\s*)?(lot|grid|multiplier|trail)/i,
    description: "Double a specific field",
    extract: (match) => {
      const fieldAlias = match[1].toLowerCase();
      const fieldMap: Record<string, string> = {
        lot: "initial_lot",
        grid: "grid",
        multiplier: "multiplier",
        trail: "trail_value",
      };
      const field = fieldMap[fieldAlias] || fieldAlias;
      return {
        operations: [{ field, op: "scale", factor: 2.0 }],
        description: `Double ${field}`,
      };
    },
  },
  {
    // "half the lot", "halve the grid"
    pattern: /(half|halve)\s*(?:the\s*)?(lot|grid|multiplier|trail)/i,
    description: "Halve a specific field",
    extract: (match) => {
      const fieldAlias = match[2].toLowerCase();
      const fieldMap: Record<string, string> = {
        lot: "initial_lot",
        grid: "grid",
        multiplier: "multiplier",
        trail: "trail_value",
      };
      const field = fieldMap[fieldAlias] || fieldAlias;
      return {
        operations: [{ field, op: "scale", factor: 0.5 }],
        description: `Halve ${field}`,
      };
    },
  },

  // === TIGHTEN/LOOSEN ===
  {
    // "tighten the grid", "tighten grid by 200"
    pattern: /tighten\s*(?:the\s*)?grid(?:\s*(?:by\s*)?(\d+))?/i,
    description: "Reduce grid spacing",
    extract: (match) => {
      if (match[1]) {
        // Absolute reduction: "tighten grid by 200"
        const reduction = parseInt(match[1]);
        return {
          operations: [{ field: "grid", op: "subtract", value: reduction }],
          description: `Reduce grid by ${reduction} pips`,
        };
      }
      // Percentage reduction: "tighten the grid" = 20% tighter
      return {
        operations: [{ field: "grid", op: "scale", factor: 0.8 }],
        description: "Tighten grid by 20%",
      };
    },
  },
  {
    // "loosen the grid", "widen grid by 200"
    pattern: /(loosen|widen)\s*(?:the\s*)?grid(?:\s*(?:by\s*)?(\d+))?/i,
    description: "Increase grid spacing",
    extract: (match) => {
      if (match[2]) {
        const increase = parseInt(match[2]);
        return {
          operations: [{ field: "grid", op: "add", value: increase }],
          description: `Increase grid by ${increase} pips`,
        };
      }
      return {
        operations: [{ field: "grid", op: "scale", factor: 1.25 }],
        description: "Widen grid by 25%",
      };
    },
  },

  // === VIBES / PRESETS ===
  {
    // "make it aggressive", "go aggressive"
    pattern: /(?:make\s*(?:it\s*)?|go\s*)(aggressive|risky)/i,
    description: "Apply aggressive preset",
    extract: () => ({
      operations: [
        { field: "multiplier", op: "scale", factor: 1.3 },
        { field: "initial_lot", op: "scale", factor: 1.2 },
        { field: "grid", op: "scale", factor: 0.75 },
      ],
      description: "Apply aggressive preset (+30% mult, +20% lot, -25% grid)",
    }),
  },
  {
    // "make it conservative", "go safe", "play it safe"
    pattern: /(?:make\s*(?:it\s*)?|go\s*|play\s*(?:it\s*)?)(conservative|safe|safer|defensive)/i,
    description: "Apply conservative preset",
    extract: () => ({
      operations: [
        { field: "multiplier", op: "scale", factor: 0.7 },
        { field: "initial_lot", op: "scale", factor: 0.8 },
        { field: "grid", op: "scale", factor: 1.4 },
      ],
      description: "Apply conservative preset (-30% mult, -20% lot, +40% grid)",
    }),
  },
  {
    // "balanced mode", "make it balanced"
    pattern: /(?:make\s*(?:it\s*)?)?balanced/i,
    description: "Apply balanced preset",
    extract: () => ({
      operations: [
        { field: "multiplier", op: "set", value: 1.5 },
        { field: "grid", op: "set", value: 600 },
        { field: "initial_lot", op: "set", value: 0.01 },
      ],
      description: "Apply balanced preset (mult=1.5, grid=600, lot=0.01)",
    }),
  },

  // === TRAIL ADJUSTMENTS ===
  {
    // "increase trailing by 50%", "boost trail"
    pattern: /(increase|boost)\s*(?:the\s*)?trail(?:ing)?(?:\s*(?:by\s*)?(\d+)\s*%)?/i,
    description: "Increase trailing values",
    extract: (match) => {
      const percent = match[2] ? parseInt(match[2]) : 25;
      const factor = 1 + (percent / 100);
      return {
        operations: [
          { field: "trail_value", op: "scale", factor },
          { field: "trail_start", op: "scale", factor },
        ],
        description: `Increase trailing by ${percent}%`,
      };
    },
  },
  {
    // "reduce trailing by 30%", "decrease trail"
    pattern: /(reduce|decrease|lower)\s*(?:the\s*)?trail(?:ing)?(?:\s*(?:by\s*)?(\d+)\s*%)?/i,
    description: "Decrease trailing values",
    extract: (match) => {
      const percent = match[2] ? parseInt(match[2]) : 25;
      const factor = 1 - (percent / 100);
      return {
        operations: [
          { field: "trail_value", op: "scale", factor },
          { field: "trail_start", op: "scale", factor },
        ],
        description: `Decrease trailing by ${percent}%`,
      };
    },
  },
];

/**
 * Parse a natural language command and return structured semantic operations.
 * Returns null if no semantic rule matches (fall through to regular parser).
 */
export function parseSemanticCommand(raw: string): SemanticCommand | null {
  const input = raw.toLowerCase().trim();
  
  for (const rule of SEMANTIC_RULES) {
    const match = input.match(rule.pattern);
    if (match) {
      const result = rule.extract(match);
      if (result) {
        // Generate preview strings for each operation
        result.preview = result.operations.map(op => {
          const opDesc = op.op === "scale" 
            ? `× ${op.factor?.toFixed(2)}`
            : op.op === "set"
            ? `= ${op.value}`
            : op.op === "add"
            ? `+ ${op.value}`
            : `- ${op.value}`;
          return `${op.field} ${opDesc}`;
        });
        return result;
      }
    }
  }
  
  return null;
}

/**
 * Apply a semantic command to a config value.
 * Returns the new value after applying the operation.
 */
export function applyOperation(currentValue: any, operation: FieldOperation): any {
  // Handle non-numeric sets directly
  if (operation.op === "set" && (typeof operation.value === "string" || typeof operation.value === "boolean")) {
    return operation.value;
  }

  // Ensure current value is a number for math ops
  const numValue = typeof currentValue === "number" ? currentValue : parseFloat(currentValue);
  if (isNaN(numValue)) return currentValue; // Safety check

  switch (operation.op) {
    case "scale":
      return numValue * (operation.factor || 1);
    case "set":
      return operation.value ?? numValue;
    case "add":
      return numValue + (Number(operation.value) || 0);
    case "subtract":
      return numValue - (Number(operation.value) || 0);
    default:
      return currentValue;
  }
}

/**
 * Clamp a value to MT4/MT5 safe bounds.
 */
export function clampToBounds(field: string, value: number): number {
  const bounds: Record<string, [number, number]> = {
    initial_lot: [0.01, 100],
    multiplier: [1.0, 10.0],
    grid: [50, 10000],
    trail_value: [0, 10000],
    trail_start: [0, 10000],
    trail_step: [0, 10000],
    tp_value: [0, 100000],
    sl_value: [0, 100000],
    close_partial: [0, 100],
    reverse_scale: [0, 1000],
    hedge_scale: [0, 1000],
  };
  
  const [min, max] = bounds[field] || [0, Infinity];
  return Math.max(min, Math.min(max, value));
}

/**
 * Get available semantic rule descriptions for help/suggestions.
 */
export function getSemanticSuggestions(): string[] {
  return SEMANTIC_RULES.map(r => r.description);
}
