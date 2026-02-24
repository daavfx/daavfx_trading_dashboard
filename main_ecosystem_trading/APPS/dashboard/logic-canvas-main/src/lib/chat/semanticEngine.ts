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
    pattern: /(\d+)\s*%\s*more\s+(aggressive|stronger|faster)/i,
    description: "Scale aggressive parameters up by percentage",
    extract: (match) => {
      const percent = parseInt(match[1]);
      const factor = 1 + (percent / 100);
      const gridFactor = 1 / factor;
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
    pattern: /(\d+)\s*%\s*(less|more)\s+(conservative|safer)/i,
    description: "Scale toward safety by percentage",
    extract: (match) => {
      const percent = parseInt(match[1]);
      const factor = 1 - (percent / 100);
      const gridFactor = 1 + (percent / 100);
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
    pattern: /(\d+)\s*%\s*safer/i,
    description: "Scale safety parameters by percentage",
    extract: (match) => {
      const percent = parseInt(match[1]);
      const gridFactor = 1 + (percent / 100);
      const lotFactor = 1 - (percent / 100 * 0.5);
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
    pattern: /triple\s*(?:the\s*)?(lot|grid|multiplier|trail)/i,
    description: "Triple a specific field",
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
        operations: [{ field, op: "scale", factor: 3.0 }],
        description: `Triple ${field}`,
      };
    },
  },
  {
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
  {
    pattern: /increase\s+(?:the\s*)?(lot|grid|multiplier|trail)\s+by\s+(\d+(?:\.\d+)?)/i,
    description: "Increase field by value",
    extract: (match) => {
      const fieldAlias = match[1].toLowerCase();
      const value = parseFloat(match[2]);
      const fieldMap: Record<string, string> = {
        lot: "initial_lot",
        grid: "grid",
        multiplier: "multiplier",
        trail: "trail_value",
      };
      const field = fieldMap[fieldAlias] || fieldAlias;
      return {
        operations: [{ field, op: "add", value }],
        description: `Increase ${field} by ${value}`,
      };
    },
  },
  {
    pattern: /decrease\s+(?:the\s*)?(lot|grid|multiplier|trail)\s+by\s+(\d+(?:\.\d+)?)/i,
    description: "Decrease field by value",
    extract: (match) => {
      const fieldAlias = match[1].toLowerCase();
      const value = parseFloat(match[2]);
      const fieldMap: Record<string, string> = {
        lot: "initial_lot",
        grid: "grid",
        multiplier: "multiplier",
        trail: "trail_value",
      };
      const field = fieldMap[fieldAlias] || fieldAlias;
      return {
        operations: [{ field, op: "subtract", value }],
        description: `Decrease ${field} by ${value}`,
      };
    },
  },

  // === TIGHTEN/LOOSEN ===
  {
    pattern: /tighten\s*(?:the\s*)?grid(?:\s*(?:by\s*)?(\d+))?/i,
    description: "Reduce grid spacing",
    extract: (match) => {
      if (match[1]) {
        const reduction = parseInt(match[1]);
        return {
          operations: [{ field: "grid", op: "subtract", value: reduction }],
          description: `Reduce grid by ${reduction} points`,
        };
      }
      return {
        operations: [{ field: "grid", op: "scale", factor: 0.8 }],
        description: "Tighten grid by 20%",
      };
    },
  },
  {
    pattern: /(loosen|widen)\s*(?:the\s*)?grid(?:\s*(?:by\s*)?(\d+))?/i,
    description: "Increase grid spacing",
    extract: (match) => {
      if (match[2]) {
        const increase = parseInt(match[2]);
        return {
          operations: [{ field: "grid", op: "add", value: increase }],
          description: `Increase grid by ${increase} points`,
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
  {
    pattern: /(?:scalping|scalper)\s*(?:mode|setup|preset)?/i,
    description: "Apply scalping preset",
    extract: () => ({
      operations: [
        { field: "grid", op: "set", value: 150 },
        { field: "trail_value", op: "set", value: 100 },
        { field: "trail_step", op: "set", value: 50 },
        { field: "initial_lot", op: "set", value: 0.01 },
      ],
      description: "Apply scalping preset (tight grid=150, tight trail)",
    }),
  },
  {
    pattern: /swing\s*(?:mode|trading|preset)?/i,
    description: "Apply swing trading preset",
    extract: () => ({
      operations: [
        { field: "grid", op: "set", value: 800 },
        { field: "trail_value", op: "set", value: 500 },
        { field: "trail_step", op: "set", value: 250 },
        { field: "multiplier", op: "set", value: 1.3 },
      ],
      description: "Apply swing preset (wide grid=800, wide trail)",
    }),
  },
  {
    pattern: /martingale\s*(?:mode|setup|preset)?/i,
    description: "Apply martingale-style preset",
    extract: () => ({
      operations: [
        { field: "multiplier", op: "set", value: 2.0 },
        { field: "grid", op: "scale", factor: 0.8 },
      ],
      description: "Apply martingale preset (mult=2.0, tighter grid)",
    }),
  },
  {
    pattern: /low\s*risk\s*(?:mode|preset)?/i,
    description: "Apply low risk preset",
    extract: () => ({
      operations: [
        { field: "initial_lot", op: "set", value: 0.01 },
        { field: "multiplier", op: "set", value: 1.2 },
        { field: "grid", op: "scale", factor: 1.5 },
        { field: "sl_value", op: "set", value: 500 },
        { field: "use_sl", op: "set", value: true },
      ],
      description: "Apply low risk preset (min lot, low mult, wide grid, SL enabled)",
    }),
  },
  {
    pattern: /high\s*risk\s*(?:mode|preset)?/i,
    description: "Apply high risk preset",
    extract: () => ({
      operations: [
        { field: "initial_lot", op: "set", value: 0.05 },
        { field: "multiplier", op: "set", value: 1.8 },
        { field: "grid", op: "scale", factor: 0.7 },
      ],
      description: "Apply high risk preset (higher lot, aggressive mult, tight grid)",
    }),
  },

  // === TRAIL ADJUSTMENTS ===
  {
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

  // === TRADING MODE ===
  {
    pattern: /(?:set\s+)?trading\s*mode\s+(?:to\s+)?(counter\s*trend|hedge|reverse)/i,
    description: "Set trading mode",
    extract: (match) => {
      const mode = match[1].toLowerCase().replace(/\s+/g, ' ');
      const modeMap: Record<string, string> = {
        "counter trend": "Counter Trend",
        "hedge": "Hedge",
        "reverse": "Reverse",
      };
      return {
        operations: [{ field: "trading_mode", op: "set", value: modeMap[mode] || mode }],
        description: `Set trading mode to ${modeMap[mode] || mode}`,
      };
    },
  },

  // === ENABLE/DISABLE ===
  {
    pattern: /enable\s+(reverse|hedge|partial|close_partial|tp|sl|use_tp|use_sl)/i,
    description: "Enable a feature",
    extract: (match) => {
      const featureAlias = match[1].toLowerCase();
      const featureMap: Record<string, string> = {
        reverse: "reverse_enabled",
        hedge: "hedge_enabled",
        partial: "close_partial",
        close_partial: "close_partial",
        tp: "use_tp",
        sl: "use_sl",
        use_tp: "use_tp",
        use_sl: "use_sl",
      };
      const field = featureMap[featureAlias] || featureAlias;
      return {
        operations: [{ field, op: "set", value: true }],
        description: `Enable ${featureAlias}`,
      };
    },
  },
  {
    pattern: /disable\s+(reverse|hedge|partial|close_partial|tp|sl|use_tp|use_sl)/i,
    description: "Disable a feature",
    extract: (match) => {
      const featureAlias = match[1].toLowerCase();
      const featureMap: Record<string, string> = {
        reverse: "reverse_enabled",
        hedge: "hedge_enabled",
        partial: "close_partial",
        close_partial: "close_partial",
        tp: "use_tp",
        sl: "use_sl",
        use_tp: "use_tp",
        use_sl: "use_sl",
      };
      const field = featureMap[featureAlias] || featureAlias;
      return {
        operations: [{ field, op: "set", value: false }],
        description: `Disable ${featureAlias}`,
      };
    },
  },

  // === LOT MULTIPLIER SCALE ===
  {
    pattern: /set\s+lot\s+(?:to\s+)?(\d+(?:\.\d+)?)/i,
    description: "Set initial lot",
    extract: (match) => {
      const value = parseFloat(match[1]);
      return {
        operations: [{ field: "initial_lot", op: "set", value }],
        description: `Set initial_lot to ${value}`,
      };
    },
  },
  {
    pattern: /set\s+mult(?:iplier)?\s+(?:to\s+)?(\d+(?:\.\d+)?)/i,
    description: "Set multiplier",
    extract: (match) => {
      const value = parseFloat(match[1]);
      return {
        operations: [{ field: "multiplier", op: "set", value }],
        description: `Set multiplier to ${value}`,
      };
    },
  },

  // === TPSL ===
  {
    pattern: /set\s+(?:tp|takeprofit)\s+(?:to\s+)?(\d+(?:\.\d+)?)/i,
    description: "Set take profit",
    extract: (match) => {
      const value = parseFloat(match[1]);
      return {
        operations: [
          { field: "tp_value", op: "set", value },
          { field: "use_tp", op: "set", value: true },
        ],
        description: `Set TP to ${value} and enable`,
      };
    },
  },
  {
    pattern: /set\s+(?:sl|stoploss)\s+(?:to\s+)?(\d+(?:\.\d+)?)/i,
    description: "Set stop loss",
    extract: (match) => {
      const value = parseFloat(match[1]);
      return {
        operations: [
          { field: "sl_value", op: "set", value },
          { field: "use_sl", op: "set", value: true },
        ],
        description: `Set SL to ${value} and enable`,
      };
    },
  },

  // === START LEVEL ===
  {
    pattern: /set\s+start\s*level\s+(?:to\s+)?(\d+)/i,
    description: "Set start level",
    extract: (match) => {
      const value = parseInt(match[1]);
      return {
        operations: [{ field: "start_level", op: "set", value }],
        description: `Set start_level to ${value}`,
      };
    },
  },

  // === SCALE ADJUSTMENTS ===
  {
    pattern: /set\s+(?:reverse|hedge)\s*scale\s+(?:to\s+)?(\d+(?:\.\d+)?)/i,
    description: "Set reverse/hedge scale",
    extract: (match) => {
      const type = match[1].toLowerCase();
      const value = parseFloat(match[2]);
      const field = type === "reverse" ? "reverse_scale" : "hedge_scale";
      return {
        operations: [{ field, op: "set", value }],
        description: `Set ${field} to ${value}%`,
      };
    },
  },
];

export function parseSemanticCommand(raw: string): SemanticCommand | null {
  const input = raw.toLowerCase().trim();
  
  for (const rule of SEMANTIC_RULES) {
    const match = input.match(rule.pattern);
    if (match) {
      const result = rule.extract(match);
      if (result) {
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

export function applyOperation(currentValue: any, operation: FieldOperation): any {
  if (operation.op === "set" && (typeof operation.value === "string" || typeof operation.value === "boolean")) {
    return operation.value;
  }

  const numValue = typeof currentValue === "number" ? currentValue : parseFloat(currentValue);
  if (isNaN(numValue)) return currentValue;

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
    start_level: [0, 100],
    last_lot: [0.01, 100],
  };
  
  const [min, max] = bounds[field] || [0, Infinity];
  return Math.max(min, Math.min(max, value));
}

export function getSemanticSuggestions(): string[] {
  return SEMANTIC_RULES.map(r => r.description);
}
