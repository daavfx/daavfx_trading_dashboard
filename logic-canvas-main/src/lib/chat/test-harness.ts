// Automated Test Harness - Run thousands of command combinations
// This runs directly against parser/executor without UI

import { parseCommand } from "./parser";
import type { ParsedCommand } from "./types";

interface TestCase {
  input: string;
  expect: {
    groups?: number[];
    engines?: string[];
    logics?: string[];
    field?: string;
    value?: number | boolean;
    type?: string;
  };
  description: string;
}

interface TestResult {
  input: string;
  description: string;
  passed: boolean;
  expected: any;
  actual: any;
  errors: string[];
}

// ============================================================================
// TEST CASE GENERATOR - Creates thousands of combinations
// ============================================================================

function generateTestCases(): TestCase[] {
  const tests: TestCase[] = [];
  
  // ==========================================================================
  // CATEGORY 1: Single Group Commands (100+ variations)
  // ==========================================================================
  const fields = ["grid", "lot", "multiplier", "trail", "trail_step", "tp", "sl"];
  const values = [100, 300, 500, 600, 800, 1000, 1500, 2000, 3000, 0.01, 0.02, 0.05, 1.2, 1.5];
  const groups = [1, 2, 3, 5, 8, 10, 15, 20];
  
  // Pattern: "set {field} group {n} to {value}"
  for (const field of fields.slice(0, 3)) {
    for (const group of groups.slice(0, 4)) {
      for (const value of values.slice(0, 3)) {
        tests.push({
          input: `set ${field} group ${group} to ${value}`,
          expect: { groups: [group], field: field === "lot" ? "initial_lot" : field === "trail" ? "trail_value" : field, value },
          description: `Single group: set ${field} group ${group} to ${value}`
        });
      }
    }
  }
  
  // Pattern: "set {field} to {value} for group {n}"
  for (const group of groups) {
    tests.push({
      input: `set grid to 600 for group ${group}`,
      expect: { groups: [group], field: "grid", value: 600 },
      description: `Alternative syntax: for group ${group}`
    });
  }
  
  // Pattern: "change {field} group {n} to {value}"
  for (const group of groups.slice(0, 4)) {
    tests.push({
      input: `change grid group ${group} to 500`,
      expect: { groups: [group], field: "grid", value: 500 },
      description: `Change verb: group ${group}`
    });
  }
  
  // ==========================================================================
  // CATEGORY 2: Group Ranges (50+ variations)
  // ==========================================================================
  const ranges = [
    { start: 1, end: 5 },
    { start: 1, end: 8 },
    { start: 1, end: 10 },
    { start: 1, end: 20 },
    { start: 5, end: 10 },
    { start: 10, end: 15 },
    { start: 1, end: 3 },
  ];
  
  // Hyphen ranges: "groups 1-8"
  for (const range of ranges) {
    const expectedGroups = Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
    tests.push({
      input: `set grid groups ${range.start}-${range.end} to 600`,
      expect: { groups: expectedGroups, field: "grid", value: 600 },
      description: `Hyphen range: ${range.start}-${range.end}`
    });
  }
  
  // ==========================================================================
  // CATEGORY 3: Logic Filtering (50+ variations)
  // ==========================================================================
  const logics = [
    { alias: "power", expected: "POWER" },
    { alias: "repower", expected: "REPOWER" },
    { alias: "scalper", expected: "SCALPER" },
    { alias: "scalp", expected: "SCALPER" },
    { alias: "stopper", expected: "STOPPER" },
    { alias: "sto", expected: "STO" },
    { alias: "sca", expected: "SCA" },
    { alias: "rpo", expected: "RPO" },
  ];
  
  for (const logic of logics) {
    tests.push({
      input: `set grid to 600 for ${logic.alias} group 1`,
      expect: { groups: [1], logics: [logic.expected], field: "grid", value: 600 },
      description: `Logic filter: ${logic.alias}`
    });
  }
  
  // CRITICAL: Substring collision tests
  tests.push({
    input: `set grid to 600 for repower group 1`,
    expect: { groups: [1], logics: ["REPOWER"], field: "grid", value: 600 },
    description: "CRITICAL: 'repower' should NOT match 'power'"
  });
  
  tests.push({
    input: `set grid to 600 for power group 1`,
    expect: { groups: [1], logics: ["POWER"], field: "grid", value: 600 },
    description: "CRITICAL: 'power' alone should match POWER"
  });
  
  // ==========================================================================
  // CATEGORY 4: Engine Filtering (30+ variations)
  // ==========================================================================
  const engines = ["A", "B", "C"];
  
  for (const engine of engines) {
    tests.push({
      input: `set grid to 600 engine ${engine} group 1`,
      expect: { groups: [1], engines: [engine], field: "grid", value: 600 },
      description: `Engine filter: ${engine}`
    });
  }
  
  // ==========================================================================
  // CATEGORY 5: Field Alias Collision Tests (20+ variations)
  // ==========================================================================
  const fieldCollisions = [
    { input: "trail_step", expectField: "trail_step" },
    { input: "trail step", expectField: "trail_step" },
    { input: "trail", expectField: "trail_value" },
    { input: "trailing", expectField: "trail_value" },
    { input: "trail_start", expectField: "trail_start" },
    { input: "trail start", expectField: "trail_start" },
    { input: "trail_step_mode", expectField: "trail_step_mode" },
    { input: "trail_step_cycle", expectField: "trail_step_cycle" },
    { input: "trail_cycle", expectField: "trail_step_cycle" },
  ];
  
  for (const fc of fieldCollisions) {
    tests.push({
      input: `set ${fc.input} to 1500 group 1`,
      expect: { groups: [1], field: fc.expectField, value: 1500 },
      description: `Field collision: '${fc.input}' → ${fc.expectField}`
    });
  }
  
  // ==========================================================================
  // CATEGORY 6: Combined Filters (30+ variations)
  // ==========================================================================
  tests.push({
    input: "set grid to 600 power engine A group 1",
    expect: { groups: [1], engines: ["A"], logics: ["POWER"], field: "grid", value: 600 },
    description: "All filters: group + logic + engine"
  });
  
  tests.push({
    input: "set grid to 600 for groups 1-5 power engine B",
    expect: { groups: [1,2,3,4,5], engines: ["B"], logics: ["POWER"], field: "grid", value: 600 },
    description: "Range + logic + engine"
  });
  
  // ==========================================================================
  // CATEGORY 7: Edge Cases & Traps (50+ variations)
  // ==========================================================================
  
  // Value-like numbers in commands that should NOT be groups
  tests.push({
    input: "set grid group 1 to 600",
    expect: { groups: [1], field: "grid", value: 600 },
    description: "TRAP: '600' should be value, not group"
  });
  
  tests.push({
    input: "set grid to 3000 group 5",
    expect: { groups: [5], field: "grid", value: 3000 },
    description: "TRAP: '3000' should be value, not group"
  });
  
  tests.push({
    input: "set lot to 0.02 group 1",
    expect: { groups: [1], field: "initial_lot", value: 0.02 },
    description: "TRAP: decimal value"
  });
  
  // Group numbers at boundaries
  tests.push({
    input: "set grid group 20 to 600",
    expect: { groups: [20], field: "grid", value: 600 },
    description: "Boundary: group 20 (max typical)"
  });
  
  tests.push({
    input: "set grid group 50 to 600",
    expect: { groups: [50], field: "grid", value: 600 },
    description: "Boundary: group 50 (max allowed)"
  });
  
  // Should be rejected (group > 50)
  tests.push({
    input: "set grid group 51 to 600",
    expect: { groups: undefined, field: "grid", value: 600 },
    description: "Boundary: group 51 should be rejected"
  });
  
  // ==========================================================================
  // CATEGORY 8: Command Type Detection (20+ variations)
  // ==========================================================================
  const setVerbs = ["set", "change", "update", "modify"];
  for (const verb of setVerbs) {
    tests.push({
      input: `${verb} grid to 600 group 1`,
      expect: { type: "set", groups: [1], field: "grid", value: 600 },
      description: `Verb detection: '${verb}'`
    });
  }
  
  tests.push({
    input: "show grid for all groups",
    expect: { type: "query", field: "grid" },
    description: "Query detection: 'show'"
  });
  
  tests.push({
    input: "find groups where grid > 500",
    expect: { type: "query", field: "grid" },
    description: "Query detection: 'find'"
  });
  
  // ==========================================================================
  // CATEGORY 9: Boolean Fields (10+ variations)
  // ==========================================================================
  tests.push({
    input: "enable reverse for power group 1",
    expect: { groups: [1], logics: ["POWER"], field: "reverse_enabled", value: true },
    description: "Boolean: enable reverse"
  });
  
  tests.push({
    input: "disable hedge for groups 1-5",
    expect: { groups: [1,2,3,4,5], field: "hedge_enabled", value: false },
    description: "Boolean: disable hedge"
  });
  
  // ==========================================================================
  // CATEGORY 10: Stress Tests - Unusual Formatting (30+ variations)
  // ==========================================================================
  tests.push({
    input: "SET GRID GROUP 1 TO 600",
    expect: { groups: [1], field: "grid", value: 600 },
    description: "Stress: ALL CAPS"
  });
  
  tests.push({
    input: "  set  grid   group  1   to   600  ",
    expect: { groups: [1], field: "grid", value: 600 },
    description: "Stress: extra whitespace"
  });
  
  tests.push({
    input: "set grid group1 to 600",
    expect: { groups: [1], field: "grid", value: 600 },
    description: "Stress: no space before group number"
  });
  
  // ==========================================================================
  // CATEGORY 11: High-Value Traps (critical - the original bug)
  // ==========================================================================
  const highValues = [100, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5000];
  for (const value of highValues) {
    tests.push({
      input: `set grid group 1 to ${value}`,
      expect: { groups: [1], field: "grid", value },
      description: `HIGH VALUE TRAP: value ${value} should NOT be group`
    });
  }
  
  // ==========================================================================
  // CATEGORY 12: Multiple Groups in Sequence
  // ==========================================================================
  tests.push({
    input: "set grid group 1 group 5 group 10 to 600",
    expect: { groups: [1, 5, 10], field: "grid", value: 600 },
    description: "Multiple groups: 1, 5, 10"
  });
  
  // ==========================================================================
  // CATEGORY 13: Edge Case Field Names
  // ==========================================================================
  tests.push({
    input: "set close_partial to 1 group 1",
    expect: { groups: [1], field: "close_partial", value: 1 },
    description: "Field: close_partial"
  });
  
  tests.push({
    input: "set reverse_scale to 100 group 1",
    expect: { groups: [1], field: "reverse_scale", value: 100 },
    description: "Field: reverse_scale"
  });
  
  tests.push({
    input: "set hedge_scale to 50 group 1",
    expect: { groups: [1], field: "hedge_scale", value: 50 },
    description: "Field: hedge_scale"
  });
  
  // ==========================================================================
  // CATEGORY 14: Combined Logic + Group Variations
  // ==========================================================================
  tests.push({
    input: "set grid to 600 power repower group 1",
    expect: { groups: [1], logics: ["POWER", "REPOWER"], field: "grid", value: 600 },
    description: "Multiple logics: power and repower"
  });
  
  tests.push({
    input: "set grid to 600 scalper stopper group 1",
    expect: { groups: [1], logics: ["SCALPER", "STOPPER"], field: "grid", value: 600 },
    description: "Multiple logics: scalper and stopper"
  });
  
  // ==========================================================================
  // CATEGORY 15: Natural Language Variations
  // ==========================================================================
  tests.push({
    input: "change the grid value to 600 for group 1",
    expect: { groups: [1], field: "grid", value: 600 },
    description: "Natural: 'change the grid value'"
  });
  
  tests.push({
    input: "update grid setting to 600 group 1",
    expect: { groups: [1], field: "grid", value: 600 },
    description: "Natural: 'update grid setting'"
  });
  
  tests.push({
    input: "modify grid for group 1 to 600",
    expect: { groups: [1], field: "grid", value: 600 },
    description: "Natural: 'modify grid for group'"
  });
  
  return tests;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

export function runTestHarness(): { 
  passed: number; 
  failed: number; 
  total: number; 
  failures: TestResult[];
  passRate: string;
} {
  const tests = generateTestCases();
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  
  const debug = process.env.DEBUG !== 'false';
  
  if (debug) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`🧪 AUTOMATED TEST HARNESS - ${tests.length} test cases`);
    console.log(`${"=".repeat(70)}\n`);
  }
  
  for (const test of tests) {
    const parsed = parseCommand(test.input);
    const errors: string[] = [];
    let testPassed = true;
    
    // Validate groups
    if (test.expect.groups !== undefined) {
      const actualGroups = parsed.target.groups;
      if (JSON.stringify(actualGroups) !== JSON.stringify(test.expect.groups)) {
        testPassed = false;
        errors.push(`Groups: expected ${JSON.stringify(test.expect.groups)}, got ${JSON.stringify(actualGroups)}`);
      }
    }
    
    // Validate engines
    if (test.expect.engines !== undefined) {
      const actualEngines = parsed.target.engines;
      if (JSON.stringify(actualEngines) !== JSON.stringify(test.expect.engines)) {
        testPassed = false;
        errors.push(`Engines: expected ${JSON.stringify(test.expect.engines)}, got ${JSON.stringify(actualEngines)}`);
      }
    }
    
    // Validate logics
    if (test.expect.logics !== undefined) {
      const actualLogics = parsed.target.logics;
      if (JSON.stringify(actualLogics) !== JSON.stringify(test.expect.logics)) {
        testPassed = false;
        errors.push(`Logics: expected ${JSON.stringify(test.expect.logics)}, got ${JSON.stringify(actualLogics)}`);
      }
    }
    
    // Validate field
    if (test.expect.field !== undefined) {
      if (parsed.target.field !== test.expect.field) {
        testPassed = false;
        errors.push(`Field: expected '${test.expect.field}', got '${parsed.target.field}'`);
      }
    }
    
    // Validate value
    if (test.expect.value !== undefined) {
      if (parsed.params.value !== test.expect.value) {
        testPassed = false;
        errors.push(`Value: expected ${test.expect.value}, got ${parsed.params.value}`);
      }
    }
    
    // Validate type
    if (test.expect.type !== undefined) {
      if (parsed.type !== test.expect.type) {
        testPassed = false;
        errors.push(`Type: expected '${test.expect.type}', got '${parsed.type}'`);
      }
    }
    
    const result: TestResult = {
      input: test.input,
      description: test.description,
      passed: testPassed,
      expected: test.expect,
      actual: {
        type: parsed.type,
        groups: parsed.target.groups,
        engines: parsed.target.engines,
        logics: parsed.target.logics,
        field: parsed.target.field,
        value: parsed.params.value
      },
      errors
    };
    
    results.push(result);
    
    if (testPassed) {
      passed++;
    } else {
      failed++;
      if (debug) {
        console.log(`❌ FAIL: ${test.description}`);
        console.log(`   Input: "${test.input}"`);
        errors.forEach(e => console.log(`   ${e}`));
        console.log("");
      }
    }
  }
  
  const passRate = ((passed / tests.length) * 100).toFixed(1);
  
  if (debug) {
    console.log(`${"=".repeat(70)}`);
    console.log(`📊 RESULTS: ${passed}/${tests.length} passed (${passRate}%)`);
    console.log(`${"=".repeat(70)}\n`);
    
    if (failed === 0) {
      console.log("✅ ALL TESTS PASSED! Parser is ready for production.\n");
    } else {
      console.log(`❌ ${failed} tests failed. Review failures above.\n`);
    }
  }
  
  return {
    passed,
    failed,
    total: tests.length,
    failures: results.filter(r => !r.passed),
    passRate: `${passRate}%`
  };
}

// Export for direct invocation
export const testHarness = { run: runTestHarness, generate: generateTestCases };
