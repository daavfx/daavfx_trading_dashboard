/**
 * Semantic Value Resolver
 * 
 * Transforms semantic values (off, disable, enable) to numeric values
 * before validation. This is the INVARIANT GUARD that prevents the class
 * of errors where non-numeric strings crash the validator.
 */

export interface FieldSemanticMapping {
  [key: string]: number;
}

/**
 * Known semantic → numeric mappings per field
 * These map user-friendly terms to actual MT4 values
 */
export const SEMANTIC_MAPPINGS: Record<string, FieldSemanticMapping> = {
  // TP/SL Fields - 0 = disabled/off, 1 = enabled
  tp_value: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1, none: 0 },
  sl_value: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1, none: 0 },
  
  // Trail fields
  trail_distance: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1, none: 0 },
  trail_step: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1, none: 0 },
  
  // Grid/Multiplier - specific mappings
  grid_spacing: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1, none: 0 },
  multiplier: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1 },
  
  // Boolean fields
  use_tp: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1 },
  use_sl: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1 },
  use_trailing: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1 },
  use_martingale: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1 },
  active: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1 },
  enabled: { off: 0, disabled: 0, false: 0, no: 0, on: 1, enabled: 1, true: 1, yes: 1 },
  
  // Risk fields - can use "low", "medium", "high" in future
  risk_level: { low: 1, medium: 2, high: 3, off: 0, disabled: 0 },
};

/**
 * Get valid semantic values for a field
 */
export function getValidSemanticValues(field: string): string[] {
  const mapping = SEMANTIC_MAPPINGS[field];
  if (!mapping) return [];
  return Object.keys(mapping);
}

/**
 * Check if a field accepts semantic values
 */
export function fieldAcceptsSemantic(field: string): boolean {
  return field in SEMANTIC_MAPPINGS;
}

/**
 * Resolve a value to numeric
 * 
 * @param value - The raw value (string or number)
 * @param field - The target field name
 * @returns The resolved numeric value
 * @throws Error if value cannot be resolved
 */
export function resolveValue(value: unknown, field: string): number {
  // Already numeric - pass through
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  
  // String value - check semantic mappings first
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    
    // Check field-specific semantic mapping
    const fieldMapping = SEMANTIC_MAPPINGS[field];
    if (fieldMapping && trimmed in fieldMapping) {
      return fieldMapping[trimmed];
    }
    
    // Check global fallback mappings (common terms)
    const GLOBAL_MAPPINGS: FieldSemanticMapping = {
      off: 0, disabled: 0, false: 0, no: 0,
      on: 1, enabled: 1, true: 1, yes: 1,
      none: 0, zero: 0,
    };
    
    if (trimmed in GLOBAL_MAPPINGS) {
      // If field exists but doesn't have this mapping, it's invalid
      if (!fieldMapping) {
        throw new Error(
          `Field '${field}' does not accept semantic value '${value}'. ` +
          `Use a numeric value${fieldMapping ? ` or: ${Object.keys(fieldMapping).join(', ')}` : ''}.`
        );
      }
      return GLOBAL_MAPPINGS[trimmed];
    }
    
    // Try numeric parsing
    const parsed = parseFloat(trimmed);
    if (!isNaN(parsed)) {
      return parsed;
    }
    
    // Value not recognized
    const validOptions = fieldMapping 
      ? Object.keys(fieldMapping).join(', ')
      : 'any number';
    throw new Error(
      `Cannot interpret '${value}' for field '${field}'. ` +
      `Expected: ${validOptions}.`
    );
  }
  
  // Invalid type
  throw new Error(`Invalid value type: ${typeof value}. Expected string or number.`);
}

/**
 * Safe value resolver - returns null instead of throwing
 */
export function tryResolveValue(value: unknown, field: string): number | null {
  try {
    return resolveValue(value, field);
  } catch {
    return null;
  }
}

/**
 * Infer field type from value pattern
 * Useful for auto-detecting field types
 */
export function inferFieldType(field: string): 'boolean' | 'numeric' | 'semantic' {
  const mapping = SEMANTIC_MAPPINGS[field];
  if (!mapping) return 'numeric';
  
  // Check if mapping has only 0/1 values (boolean-like)
  const values = new Set(Object.values(mapping));
  if (values.size <= 2 && values.has(0) && values.has(1)) {
    return 'boolean';
  }
  
  return 'semantic';
}
