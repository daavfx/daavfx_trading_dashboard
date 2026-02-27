// Field Descriptions - Human-readable explanations for trading config fields
// Used by the chat system to explain what fields mean

export const FIELD_DESCRIPTIONS: Record<string, {
  name: string;
  description: string;
  unit?: string;
  example?: string;
  category: "core" | "trail" | "tpsl" | "trigger" | "reverse" | "partial";
}> = {
  // Core Parameters
  initial_lot: {
    name: "Initial Lot",
    description: "The starting lot size for new orders. This is the lot size for the first trade in a grid sequence.",
    unit: "lots",
    example: "0.01, 0.02, 0.05",
    category: "core"
  },
  multiplier: {
    name: "Multiplier",
    description: "The lot multiplier for each subsequent grid level. Each new order multiplies the previous lot by this factor.",
    unit: "factor",
    example: "1.2, 1.5, 2.0",
    category: "core"
  },
  grid: {
    name: "Grid Spacing",
    description: "The distance (in points/pips) between each grid level. When price moves this distance, a new order is opened.",
    unit: "points",
    example: "300, 500, 1000",
    category: "core"
  },
  last_lot: {
    name: "Max Lot / Last Lot",
    description: "The maximum lot size. Once reached, no more orders will be added to the grid even if price continues moving.",
    unit: "lots",
    example: "0.1, 0.5, 1.0",
    category: "core"
  },
  start_level: {
    name: "Start Level",
    description: "The number of orders from another logic that must be reached before this logic starts trading. Used for sequential activation.",
    unit: "orders",
    example: "5, 10",
    category: "core"
  },
  order_count_reference: {
    name: "Order Count Reference",
    description: "Which logic to watch for the start level trigger. This logic will start after the referenced logic reaches the start level.",
    unit: "logic",
    example: "Power, Repower",
    category: "core"
  },
  close_targets: {
    name: "Close Targets",
    description: "Which other logics should close when this logic opens a trade. Used for profit-taking across multiple logics.",
    unit: "logics",
    example: "Power, Scalper",
    category: "core"
  },
  reset_lot_on_restart: {
    name: "Reset Lot on Restart",
    description: "Whether to reset to initial lot when the EA restarts, regardless of current grid position.",
    unit: "boolean",
    example: "ON, OFF",
    category: "core"
  },

  // Trail Parameters
  trail_value: {
    name: "Trail Distance",
    description: "The distance (in points) the price must move in profit before the stop-loss is activated or moved.",
    unit: "points",
    example: "300, 500, 1000",
    category: "trail"
  },
  trail_start: {
    name: "Trail Start",
    description: "How many points in profit before trailing begins. Wait for this profit before activating the trailing stop.",
    unit: "points",
    example: "100, 200, 500",
    category: "trail"
  },
  trail_step: {
    name: "Trail Step",
    description: "The distance to move the stop-loss each time profit increases by the trail value. Controls trailing granularity.",
    unit: "points",
    example: "100, 200",
    category: "trail"
  },
  trail_method: {
    name: "Trail Method",
    description: "How trailing is calculated: Points, Pips, or Percent of profit.",
    unit: "method",
    example: "Points, Pips, Percent",
    category: "trail"
  },
  trail_step_method: {
    name: "Trail Step Method",
    description: "How trail step is applied: Points, Pips, or Percent.",
    unit: "method",
    example: "Points, Pips, Percent",
    category: "trail"
  },
  trail_step_mode: {
    name: "Trail Step Mode",
    description: "Controls when trail steps activate: Auto (based on profit), or Manual configuration.",
    unit: "mode",
    example: "Auto, Manual",
    category: "trail"
  },
  trail_step_cycle: {
    name: "Trail Step Cycle",
    description: "Update the trailing stop every N cycles. 1 = every cycle, 2 = every other cycle, etc.",
    unit: "cycles",
    example: "1, 2, 3",
    category: "trail"
  },
  trail_step_balance: {
    name: "Trail Step Balance",
    description: "Minimum account balance required for this trail step level to be active.",
    unit: "currency",
    example: "1000, 5000",
    category: "trail"
  },

  // TPSL Parameters
  use_tp: {
    name: "Use Take Profit",
    description: "Enable or disable fixed take-profit levels for this logic.",
    unit: "boolean",
    example: "ON, OFF",
    category: "tpsl"
  },
  tp_value: {
    name: "Take Profit Value",
    description: "The fixed profit target in points. When reached, all trades for this logic are closed.",
    unit: "points",
    example: "300, 500",
    category: "tpsl"
  },
  tp_mode: {
    name: "Take Profit Mode",
    description: "How TP is calculated: Points, Pips, or Percent of the grid spacing.",
    unit: "mode",
    example: "Points, Pips, Percent",
    category: "tpsl"
  },
  use_sl: {
    name: "Use Stop Loss",
    description: "Enable or disable fixed stop-loss levels for this logic.",
    unit: "boolean",
    example: "ON, OFF",
    category: "tpsl"
  },
  sl_value: {
    name: "Stop Loss Value",
    description: "The fixed loss limit in points. When reached, all trades for this logic are closed.",
    unit: "points",
    example: "500, 1000",
    category: "tpsl"
  },
  sl_mode: {
    name: "Stop Loss Mode",
    description: "How SL is calculated: Points, Pips, or Percent of the grid spacing.",
    unit: "mode",
    example: "Points, Pips, Percent",
    category: "tpsl"
  },

  // Trigger Parameters
  trigger_type: {
    name: "Trigger Type",
    description: "How this logic is activated: Immediate (always active), or based on bars/price conditions.",
    unit: "type",
    example: "Immediate, Bar Count, Price Level",
    category: "trigger"
  },
  trigger_bars: {
    name: "Trigger Bars",
    description: "Number of bars that must pass after the previous logic's signal before this logic can activate.",
    unit: "bars",
    example: "3, 5, 10",
    category: "trigger"
  },
  trigger_minutes: {
    name: "Trigger Minutes",
    description: "Number of minutes that must pass after the previous logic's signal before this logic can activate.",
    unit: "minutes",
    example: "15, 30, 60",
    category: "trigger"
  },
  trigger_pips: {
    name: "Trigger Pips",
    description: "Price distance required after previous logic signal before this logic activates.",
    unit: "pips",
    example: "5, 10, 20",
    category: "trigger"
  },

  // Reverse Mode
  reverse_enabled: {
    name: "Reverse Mode",
    description: "Enable reverse trading. When enabled, this logic trades opposite to its normal direction based on another logic's signals.",
    unit: "boolean",
    example: "ON, OFF",
    category: "reverse"
  },
  reverse_scale: {
    name: "Reverse Scale",
    description: "Lot size multiplier for reverse trades as a percentage of the original logic's lot.",
    unit: "percent",
    example: "50%, 100%",
    category: "reverse"
  },
  reverse_reference: {
    name: "Reverse Reference",
    description: "Which logic to watch for reverse signals. When that logic loses, this logic opens in the opposite direction.",
    unit: "logic",
    example: "Power, Repower",
    category: "reverse"
  },

  // Hedge Mode
  hedge_enabled: {
    name: "Hedge Mode",
    description: "Enable hedge trading. Opens opposite-direction trades to reduce overall exposure.",
    unit: "boolean",
    example: "ON, OFF",
    category: "reverse"
  },
  hedge_scale: {
    name: "Hedge Scale",
    description: "Lot size for hedge trades as a percentage of the original logic's lot.",
    unit: "percent",
    example: "25%, 50%",
    category: "reverse"
  },
  hedge_reference: {
    name: "Hedge Reference",
    description: "Which logic to hedge against. When that logic opens, this logic opens in opposite direction.",
    unit: "logic",
    example: "Power, Scalper",
    category: "reverse"
  },

  // Partial Close
  close_partial: {
    name: "Use Partial Close",
    description: "Enable partial close functionality. Close a portion of the grid at predefined profit levels.",
    unit: "boolean",
    example: "ON, OFF",
    category: "partial"
  },
  close_partial_cycle: {
    name: "Partial Close Cycle",
    description: "How many grid levels to open before checking for partial close. Controls close frequency.",
    unit: "levels",
    example: "1, 2, 3",
    category: "partial"
  },
  close_partial_mode: {
    name: "Partial Close Mode",
    description: "Which positions to close first: Low (oldest), High (newest), or Balanced.",
    unit: "mode",
    example: "Low, High, Balanced",
    category: "partial"
  },
  close_partial_balance: {
    name: "Partial Close Balance",
    description: "Balance strategy: Close to target balance, equity, or evenly across all positions.",
    unit: "mode",
    example: "Balanced, Equity, Balance",
    category: "partial"
  },
};

export function getFieldExplanation(field: string): string {
  const info = FIELD_DESCRIPTIONS[field];
  if (!info) {
    return `Parameter: ${field}`;
  }
  
  let text = `📊 **${info.name}** (${field})\n\n`;
  text += `${info.description}\n\n`;
  if (info.unit) {
    text += `Unit: ${info.unit}\n`;
  }
  if (info.example) {
    text += `Example: ${info.example}`;
  }
  
  return text;
}

export function getFieldCategory(field: string): string {
  return FIELD_DESCRIPTIONS[field]?.category || "unknown";
}

export function getFieldsByCategory(category: string): string[] {
  return Object.entries(FIELD_DESCRIPTIONS)
    .filter(([_, info]) => info.category === category)
    .map(([field]) => field);
}
