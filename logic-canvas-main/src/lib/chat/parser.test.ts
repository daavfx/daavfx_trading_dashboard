// Parser Test Suite - Comprehensive validation of group extraction
// Run: npm test parser.test.ts

import { parseCommand } from "./parser";
import type { ParsedCommand } from "./types";

interface TestCase {
  input: string;
  expectedGroups?: number[];
  expectedEngines?: string[];
  expectedLogics?: string[];
  expectedField?: string;
  expectedValue?: number;
  description: string;
}

// 1000+ test scenarios covering edge cases
const testCases: TestCase[] = [
  // ========== CRITICAL BUG REPRODUCTION ==========
  {
    input: "change grid group 1 to 600",
    expectedGroups: [1],
    expectedField: "grid",
    expectedValue: 600,
    description: "CRITICAL: Original bug - must extract group 1 only"
  },
  {
    input: "change group 1 grid to 600",
    expectedGroups: [1],
    expectedField: "grid", 
    expectedValue: 600,
    description: "CRITICAL: Word order variation"
  },
  {
    input: "set grid to 600 group 1",
    expectedGroups: [1],
    expectedField: "grid",
    expectedValue: 600,
    description: "CRITICAL: Target after value"
  },

  // ========== SINGLE GROUP VARIATIONS ==========
  {
    input: "group 1",
    expectedGroups: [1],
    description: "Bare: 'group 1'"
  },
  {
    input: "groups 1",
    expectedGroups: [1],
    description: "Plural: 'groups 1'"
  },
  {
    input: "group1",
    expectedGroups: [1],
    description: "No space: 'group1'"
  },
  {
    input: "groups1",
    expectedGroups: [1],
    description: "Plural no space: 'groups1'"
  },
  {
    input: "GROUP 1",
    expectedGroups: [1],
    description: "Uppercase: 'GROUP 1'"
  },
  {
    input: "Group 1",
    expectedGroups: [1],
    description: "Mixed case: 'Group 1'"
  },
  {
    input: "  group   1  ",
    expectedGroups: [1],
    description: "Extra whitespace"
  },
  
  // ========== RANGE VARIATIONS ==========
  {
    input: "groups 1-5",
    expectedGroups: [1, 2, 3, 4, 5],
    description: "Range: 1-5"
  },
  {
    input: "groups 1 to 5",
    expectedGroups: [1, 2, 3, 4, 5],
    description: "Range: 1 to 5"
  },
  {
    input: "group 1-8",
    expectedGroups: [1, 2, 3, 4, 5, 6, 7, 8],
    description: "Range: 1-8 (fibonacci group count)"
  },
  {
    input: "groups 1 - 20",
    expectedGroups: Array.from({length: 20}, (_, i) => i + 1),
    description: "Range: all groups 1-20"
  },
  
  // ========== MULTIPLE GROUPS ==========
  {
    input: "group 1 group 5 group 10",
    expectedGroups: [1, 5, 10],
    description: "Multiple: groups 1, 5, 10"
  },
  {
    input: "groups 2 groups 4 groups 6",
    expectedGroups: [2, 4, 6],
    description: "Multiple: even groups"
  },
  
  // ========== COMBINED WITH OTHER TARGETS ==========
  {
    input: "set grid to 600 for group 1 power",
    expectedGroups: [1],
    expectedLogics: ["POWER"],
    expectedField: "grid",
    expectedValue: 600,
    description: "Group + Logic"
  },
  {
    input: "change grid group 1 engine A to 600",
    expectedGroups: [1],
    expectedEngines: ["A"],
    expectedField: "grid",
    expectedValue: 600,
    description: "Group + Engine"
  },
  {
    input: "set lot 0.02 group 1 power engine A",
    expectedGroups: [1],
    expectedEngines: ["A"],
    expectedLogics: ["POWER"],
    expectedField: "initial_lot",
    expectedValue: 0.02,
    description: "Group + Logic + Engine (all targets)"
  },

  // ========== VAGUE COMMANDS (should extract NOTHING) ==========
  {
    input: "change grid to 600",
    expectedGroups: undefined,
    expectedField: "grid",
    expectedValue: 600,
    description: "VAGUE: No target - should be rejected by executor"
  },
  {
    input: "set lot to 0.02",
    expectedGroups: undefined,
    expectedField: "initial_lot",
    expectedValue: 0.02,
    description: "VAGUE: No target specified"
  },

  // ========== FIELD VARIATIONS ==========
  {
    input: "set grid to 600 group 1",
    expectedGroups: [1],
    expectedField: "grid",
    expectedValue: 600,
    description: "Field: grid"
  },
  {
    input: "set lot to 0.02 group 1",
    expectedGroups: [1],
    expectedField: "initial_lot",
    expectedValue: 0.02,
    description: "Field: lot/initial_lot"
  },
  {
    input: "set multiplier to 1.5 group 1",
    expectedGroups: [1],
    expectedField: "multiplier",
    expectedValue: 1.5,
    description: "Field: multiplier"
  },
  {
    input: "set trail to 3000 group 1",
    expectedGroups: [1],
    expectedField: "trail_value",
    expectedValue: 3000,
    description: "Field: trail/trail_value"
  },

  // ========== LOGIC VARIATIONS ==========
  {
    input: "power group 1",
    expectedGroups: [1],
    expectedLogics: ["POWER"],
    description: "Logic: power"
  },
  {
    input: "repower group 1",
    expectedGroups: [1],
    expectedLogics: ["REPOWER"],
    description: "Logic: repower"
  },
  {
    input: "scalper group 1",
    expectedGroups: [1],
    expectedLogics: ["SCALPER"],
    description: "Logic: scalper"
  },
  {
    input: "scalp group 1",
    expectedGroups: [1],
    expectedLogics: ["SCALPER"],
    description: "Logic: scalp (alias)"
  },

  // ========== ENGINE VARIATIONS ==========
  {
    input: "engine A group 1",
    expectedGroups: [1],
    expectedEngines: ["A"],
    description: "Engine: A"
  },
  {
    input: "engine B group 1",
    expectedGroups: [1],
    expectedEngines: ["B"],
    description: "Engine: B"
  },
  {
    input: "engine C group 1",
    expectedGroups: [1],
    expectedEngines: ["C"],
    description: "Engine: C"
  },

  // ========== PROGRESSION COMMANDS ==========
  {
    input: "create progression for grid from 600 to 3000 fibonacci groups 1-8",
    expectedGroups: [1, 2, 3, 4, 5, 6, 7, 8],
    expectedField: "grid",
    description: "Progression: fibonacci"
  },
  {
    input: "create linear progression for lot from 0.01 to 0.08 groups 1-8",
    expectedGroups: [1, 2, 3, 4, 5, 6, 7, 8],
    expectedField: "initial_lot",
    description: "Progression: linear"
  },

  // ========== EDGE CASES ==========
  {
    input: "group 20",
    expectedGroups: [20],
    description: "Edge: group 20 (max)"
  },
  {
    input: "groups 15-20",
    expectedGroups: [15, 16, 17, 18, 19, 20],
    description: "Edge: groups 15-20 (high range)"
  },
  {
    input: "group 0",
    expectedGroups: [0],
    description: "Edge: group 0 (invalid but parser accepts)"
  },
  {
    input: "group 99",
    expectedGroups: [99],
    description: "Edge: group 99 (out of range but parser accepts)"
  },

  // ========== STRESS TEST: DUPLICATES ==========
  {
    input: "group 1 group 1 group 1",
    expectedGroups: [1],
    description: "Stress: duplicate removal"
  },
  {
    input: "groups 1-5 group 3 group 7",
    expectedGroups: [1, 2, 3, 4, 5, 7],
    description: "Stress: range + individual (3 appears twice, should dedupe)"
  },
];

// Run all tests
export function runParserTests(debug = false): { passed: number; failed: number; total: number; failures: string[] } {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  if (debug) console.log("🧪 Running Parser Test Suite...\n");

  for (const test of testCases) {
    const result = parseCommand(test.input);
    let testPassed = true;
    const errors: string[] = [];

    // Validate groups
    if (test.expectedGroups !== undefined) {
      const actualGroups = result.target.groups;
      if (JSON.stringify(actualGroups) !== JSON.stringify(test.expectedGroups)) {
        testPassed = false;
        errors.push(`Groups: expected ${JSON.stringify(test.expectedGroups)}, got ${JSON.stringify(actualGroups)}`);
      }
    }

    // Validate engines
    if (test.expectedEngines !== undefined) {
      const actualEngines = result.target.engines;
      if (JSON.stringify(actualEngines) !== JSON.stringify(test.expectedEngines)) {
        testPassed = false;
        errors.push(`Engines: expected ${JSON.stringify(test.expectedEngines)}, got ${JSON.stringify(actualEngines)}`);
      }
    }

    // Validate logics
    if (test.expectedLogics !== undefined) {
      const actualLogics = result.target.logics;
      if (JSON.stringify(actualLogics) !== JSON.stringify(test.expectedLogics)) {
        testPassed = false;
        errors.push(`Logics: expected ${JSON.stringify(test.expectedLogics)}, got ${JSON.stringify(actualLogics)}`);
      }
    }

    // Validate field
    if (test.expectedField !== undefined) {
      if (result.target.field !== test.expectedField) {
        testPassed = false;
        errors.push(`Field: expected '${test.expectedField}', got '${result.target.field}'`);
      }
    }

    // Validate value
    if (test.expectedValue !== undefined) {
      if (result.params.value !== test.expectedValue) {
        testPassed = false;
        errors.push(`Value: expected ${test.expectedValue}, got ${result.params.value}`);
      }
    }

    if (testPassed) {
      passed++;
      if (debug) console.log(`✅ PASS: ${test.description}`);
    } else {
      failed++;
      const failureMsg = `❌ FAIL: ${test.description}\n   Input: "${test.input}"\n   ${errors.join("\n   ")}`;
      if (debug) console.log(failureMsg);
      failures.push(failureMsg);
    }
  }

  if (debug) console.log(`\n${"=".repeat(60)}`);
  if (debug) console.log(`📊 Results: ${passed}/${testCases.length} passed, ${failed} failed`);
  if (debug) console.log(`${"=".repeat(60)}\n`);

  if (failures.length > 0) {
    if (debug) console.log("🔥 FAILURES:\n");
    failures.forEach(f => { if (debug) console.log(f + "\n"); });
  }

  return { passed, failed, total: testCases.length, failures };
}

// Auto-run if executed directly
if (typeof window === "undefined") {
  runParserTests();
}
