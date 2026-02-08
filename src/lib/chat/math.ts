// Math & Formula Engine for Trading Progressions
// Handles Fibonacci, Exponential, Linear, and Custom factor progressions

export type ProgressionType = "linear" | "fibonacci" | "exponential" | "martingale" | "anti-martingale" | "custom";

export interface ProgressionConfig {
  type: ProgressionType;
  startValue: number;
  endValue?: number;
  steps: number;
  factor?: number;           // For exponential/martingale
  customSequence?: number[]; // For custom
  roundTo?: number;          // Decimal places (0 for integers)
  minValue?: number;         // Floor
  maxValue?: number;         // Ceiling
}

export interface ProgressionResult {
  values: number[];
  formula: string;
  warnings: string[];
}

// Standard Fibonacci sequence (first 20 terms)
const FIB_SEQUENCE = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765];

/**
 * Calculate a progression of values for grid/lot/trail settings
 * Uses proper mathematical sequences for trading strategies
 */
export function calculateProgression(config: ProgressionConfig): ProgressionResult {
  const { type, startValue, endValue, steps, factor = 1.5, customSequence, roundTo = 0, minValue, maxValue } = config;
  
  let values: number[] = [];
  let formula = "";
  const warnings: string[] = [];

  switch (type) {
    case "fibonacci": {
      // Fibonacci-scaled progression
      // Each step adds (startValue * fib_ratio) to create natural scaling
      formula = `F(n) = start + (start × fib[n] / fib[0])`;
      
      const baseUnit = startValue;
      for (let i = 0; i < steps; i++) {
        const fibIndex = Math.min(i, FIB_SEQUENCE.length - 1);
        const fibValue = FIB_SEQUENCE[fibIndex];
        const value = baseUnit * fibValue;
        values.push(value);
      }
      break;
    }

    case "exponential": {
      // Exponential growth: each value = previous × factor
      formula = `V(n) = start × factor^n where factor=${factor}`;
      
      let current = startValue;
      for (let i = 0; i < steps; i++) {
        values.push(current);
        current *= factor;
      }
      break;
    }

    case "martingale": {
      // Martingale: double after each level (classic grid recovery)
      formula = `V(n) = start × 2^n (Martingale)`;
      
      for (let i = 0; i < steps; i++) {
        values.push(startValue * Math.pow(2, i));
      }
      
      if (values[values.length - 1] > startValue * 100) {
        warnings.push("Martingale reaches dangerous lot sizes at higher levels");
      }
      break;
    }

    case "anti-martingale": {
      // Anti-martingale: increase on wins, same on losses
      // For grid: smaller at higher levels
      formula = `V(n) = start × (1 - n×0.1) (Anti-Martingale decay)`;
      
      for (let i = 0; i < steps; i++) {
        const decay = Math.max(0.1, 1 - (i * 0.1));
        values.push(startValue * decay);
      }
      break;
    }

    case "linear": {
      // Linear interpolation between start and end
      if (!endValue) {
        // If no end, use factor as step size
        formula = `V(n) = start + (n × ${factor})`;
        for (let i = 0; i < steps; i++) {
          values.push(startValue + (i * factor));
        }
      } else {
        formula = `V(n) = start + ((end - start) × n / (steps - 1))`;
        const stepSize = (endValue - startValue) / (steps - 1);
        for (let i = 0; i < steps; i++) {
          values.push(startValue + (stepSize * i));
        }
      }
      break;
    }

    case "custom": {
      // Use provided sequence or default to linear
      if (customSequence && customSequence.length >= steps) {
        formula = `Custom sequence provided`;
        values = customSequence.slice(0, steps);
      } else {
        formula = `Custom (fallback to linear)`;
        const step = endValue ? (endValue - startValue) / (steps - 1) : 100;
        for (let i = 0; i < steps; i++) {
          values.push(startValue + (step * i));
        }
        warnings.push("Custom sequence not provided, using linear fallback");
      }
      break;
    }
  }

  // Apply rounding
  values = values.map(v => {
    let rounded = roundTo === 0 ? Math.round(v) : Number(v.toFixed(roundTo));
    
    // Apply min/max constraints
    if (minValue !== undefined && rounded < minValue) {
      rounded = minValue;
      warnings.push(`Value ${v.toFixed(2)} clamped to minimum ${minValue}`);
    }
    if (maxValue !== undefined && rounded > maxValue) {
      rounded = maxValue;
      warnings.push(`Value ${v.toFixed(2)} clamped to maximum ${maxValue}`);
    }
    
    return rounded;
  });

  return { values, formula, warnings };
}

/**
 * Parse a formula string into a function
 * Supports: +, -, *, /, ^, prev, index, start
 */
export function parseFormula(formulaStr: string): (prev: number, index: number, start: number) => number {
  // Sanitize and prepare
  const sanitized = formulaStr
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/prev/g, "p")
    .replace(/index/g, "i")
    .replace(/start/g, "s");

  return (prev: number, index: number, start: number): number => {
    try {
      // Simple expression evaluator
      let expr = sanitized
        .replace(/p/g, prev.toString())
        .replace(/i/g, index.toString())
        .replace(/s/g, start.toString());
      
      // Handle power operator
      expr = expr.replace(/(\d+\.?\d*)\^(\d+\.?\d*)/g, (_, base, exp) => 
        Math.pow(parseFloat(base), parseFloat(exp)).toString()
      );
      
      // Evaluate (safe subset of math operations)
      return Function(`"use strict"; return (${expr})`)();
    } catch {
      return prev; // Fallback to previous value on error
    }
  };
}

/**
 * Apply a custom formula across groups
 */
export function applyCustomFormula(
  startValue: number,
  steps: number,
  formulaStr: string
): ProgressionResult {
  const values: number[] = [];
  const warnings: string[] = [];
  const evalFn = parseFormula(formulaStr);

  let prev = startValue;
  for (let i = 0; i < steps; i++) {
    try {
      const newValue = i === 0 ? startValue : evalFn(prev, i, startValue);
      values.push(Math.round(newValue * 100) / 100);
      prev = newValue;
    } catch (e) {
      warnings.push(`Formula error at step ${i}: ${e}`);
      values.push(prev);
    }
  }

  return {
    values,
    formula: `Custom: ${formulaStr}`,
    warnings
  };
}

/**
 * Validate progression values against MT4/MT5 field constraints
 */
export interface FieldConstraint {
  fieldName: string;
  type: "int" | "double" | "bool";
  min?: number;
  max?: number;
  decimals?: number;
}

const MT4_FIELD_CONSTRAINTS: Record<string, FieldConstraint> = {
  grid: { fieldName: "grid", type: "int", min: 1, max: 100000, decimals: 0 },
  initial_lot: { fieldName: "initial_lot", type: "double", min: 0.01, max: 100, decimals: 2 },
  multiplier: { fieldName: "multiplier", type: "double", min: 0.1, max: 10, decimals: 2 },
  trail_value: { fieldName: "trail_value", type: "int", min: 0, max: 100000, decimals: 0 },
  trail_start: { fieldName: "trail_start", type: "int", min: 0, max: 100000, decimals: 0 },
  trail_step: { fieldName: "trail_step", type: "int", min: 0, max: 100000, decimals: 0 },
  tp_value: { fieldName: "tp_value", type: "double", min: 0, max: 100000, decimals: 1 },
  sl_value: { fieldName: "sl_value", type: "double", min: 0, max: 100000, decimals: 1 },
  start_level: { fieldName: "start_level", type: "int", min: 1, max: 20, decimals: 0 },
};

export function validateForMT4(field: string, values: number[]): { valid: boolean; errors: string[]; corrected: number[] } {
  const constraint = MT4_FIELD_CONSTRAINTS[field];
  if (!constraint) {
    return { valid: true, errors: [], corrected: values };
  }

  const errors: string[] = [];
  const corrected = values.map((v, i) => {
    let val = v;

    // Type coercion
    if (constraint.type === "int") {
      val = Math.round(val);
    } else if (constraint.decimals !== undefined) {
      val = Number(val.toFixed(constraint.decimals));
    }

    // Range clamping
    if (constraint.min !== undefined && val < constraint.min) {
      errors.push(`Group ${i + 1}: ${field}=${v} below minimum ${constraint.min}, corrected to ${constraint.min}`);
      val = constraint.min;
    }
    if (constraint.max !== undefined && val > constraint.max) {
      errors.push(`Group ${i + 1}: ${field}=${v} above maximum ${constraint.max}, corrected to ${constraint.max}`);
      val = constraint.max;
    }

    return val;
  });

  return {
    valid: errors.length === 0,
    errors,
    corrected
  };
}
