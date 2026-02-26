// Executor Test Suite - Validate filter logic and change counts
// Tests the CRITICAL BUG: "change grid group 1 to 600" affecting 420 values instead of 21

import { CommandExecutor } from "./executor";
import { parseCommand } from "./parser";
import type { MTConfig } from "@/types/mt-config";

interface SimulationResult {
  command: string;
  expectedChanges: number;
  actualChanges: number;
  passed: boolean;
  details: string;
}

// Create a minimal test config (3 engines × 20 groups × 7 logics = 420 total)
function createTestConfig(): MTConfig {
  const logicNames = ["Power", "Repower", "Scalper", "Stopper", "STO", "SCA", "RPO"];
  
  const engines = (["A", "B", "C"] as const).map(engineId => ({
    engine_id: engineId,
    engine_name: `Engine ${engineId}`,
    max_power_orders: 10,
    groups: Array.from({ length: 20 }, (_, g) => ({
      group_number: g + 1,
      enabled: true,
      reverse_mode: false,
      hedge_mode: false,
      hedge_reference: "Logic_None" as any,
      entry_delay_bars: 0,
      logics: logicNames.map(name => ({
        logic_name: name,
        logic_id: `${engineId}_${name}_G${g + 1}`,
        enabled: true,
        initial_lot: 0.02,
        multiplier: 1.2,
        grid: 300, // Default grid value
        trail_method: "Points" as any,
        trail_value: 3000,
        trail_start: 1,
        trail_step: 1500,
        trail_step_method: "Step_Points" as any,
        close_targets: "",
        order_count_reference: "Logic_Self" as any,
        reset_lot_on_restart: false,
        use_tp: false,
        tp_mode: "TPSL_Points" as any,
        tp_value: 0,
        use_sl: false,
        sl_mode: "TPSL_Points" as any,
        sl_value: 0,
        reverse_enabled: false,
        hedge_enabled: false,
        reverse_scale: 100,
        hedge_scale: 50,
        reverse_reference: "Logic_None" as any,
        hedge_reference: "Logic_None" as any,
        trail_step_mode: "TrailStepMode_Auto" as any,
        trail_step_cycle: 1,
        trail_step_balance: 0,
        close_partial: false,
        close_partial_cycle: 3,
        close_partial_mode: "PartialMode_Low" as any,
        close_partial_balance: "PartialBalance_Balanced" as any,
        close_partial_trail_step_mode: "TrailStepMode_Auto" as any,
      }))
    }))
  }));

  return {
    version: "17.04",
    platform: "MT4",
    timestamp: new Date().toISOString(),
    total_inputs: 11081,
    general: {} as any,
    engines
  };
}

const testScenarios = [
  // ========== CRITICAL BUG REPRODUCTIONS ==========
  {
    command: "change grid group 1 to 600",
    expectedChanges: 21, // 3 engines × 7 logics × 1 group
    description: "CRITICAL: Original bug - Group 1 only"
  },
  {
    command: "set grid to 600 for group 1",
    expectedChanges: 21,
    description: "CRITICAL: Variation - 'for group 1'"
  },
  {
    command: "change group 1 grid to 600",
    expectedChanges: 21,
    description: "CRITICAL: Word order - 'group 1 grid'"
  },

  // ========== SINGLE GROUP TESTS ==========
  {
    command: "set grid to 500 group 5",
    expectedChanges: 21, // 3 engines × 7 logics × 1 group
    description: "Single group: Group 5"
  },
  {
    command: "set grid to 800 group 20",
    expectedChanges: 21,
    description: "Single group: Group 20 (edge)"
  },

  // ========== RANGE TESTS ==========
  {
    command: "set grid to 600 groups 1-5",
    expectedChanges: 105, // 3 engines × 7 logics × 5 groups
    description: "Range: Groups 1-5"
  },
  {
    command: "set grid to 700 groups 1-8",
    expectedChanges: 168, // 3 engines × 7 logics × 8 groups
    description: "Range: Groups 1-8 (fibonacci)"
  },
  {
    command: "set grid to 400 groups 1 to 20",
    expectedChanges: 420, // 3 engines × 7 logics × 20 groups
    description: "Range: ALL groups 1-20"
  },

  // ========== LOGIC FILTERING ==========
  {
    command: "set grid to 600 group 1 power",
    expectedChanges: 3, // 3 engines × 1 logic (Power) × 1 group
    description: "Group 1 + Power only"
  },
  {
    command: "set lot to 0.03 group 1 power",
    expectedChanges: 3,
    description: "Group 1 + Power + different field"
  },
  {
    command: "set grid to 700 groups 1-5 power",
    expectedChanges: 15, // 3 engines × 1 logic × 5 groups
    description: "Groups 1-5 + Power only"
  },

  // ========== ENGINE FILTERING ==========
  {
    command: "set grid to 600 group 1 engine A",
    expectedChanges: 7, // 1 engine × 7 logics × 1 group
    description: "Group 1 + Engine A only"
  },
  {
    command: "set grid to 700 groups 1-5 engine B",
    expectedChanges: 35, // 1 engine × 7 logics × 5 groups
    description: "Groups 1-5 + Engine B only"
  },

  // ========== COMBINED FILTERS ==========
  {
    command: "set grid to 600 group 1 power engine A",
    expectedChanges: 1, // 1 engine × 1 logic × 1 group
    description: "ALL filters: Group 1 + Power + Engine A"
  },
  {
    command: "set lot to 0.02 groups 1-3 power engine B",
    expectedChanges: 3, // 1 engine × 1 logic × 3 groups
    description: "ALL filters: Groups 1-3 + Power + Engine B"
  },

  // ========== VAGUE COMMANDS (should be REJECTED) ==========
  {
    command: "change grid to 600",
    expectedChanges: 0, // Should be rejected - no target
    description: "VAGUE: No target specified - should reject"
  },
  {
    command: "set lot to 0.02",
    expectedChanges: 0,
    description: "VAGUE: No target - should reject"
  },
  {
    command: "set multiplier to 1.5",
    expectedChanges: 0,
    description: "VAGUE: No target - should reject"
  },
];

export function runExecutorTests(): { passed: number; failed: number; total: number; results: SimulationResult[] } {
  const executor = new CommandExecutor();
  const config = createTestConfig();
  executor.setConfig(config);
  executor.setAutoApprove(true);

  let passed = 0;
  let failed = 0;
  const results: SimulationResult[] = [];

  const debug = process.env.DEBUG !== 'false';

  if (debug) {
    console.log("🧪 Running Executor Test Suite (Filter Logic Validation)...\n");
    console.log(`Test Config: 3 engines × 20 groups × 7 logics = 420 total logic instances\n`);
  }

  for (const scenario of testScenarios) {
    const parsed = parseCommand(scenario.command);
    const result = executor.execute(parsed);

    const actualChanges = result.changes?.length || 0;
    const testPassed = actualChanges === scenario.expectedChanges;

    const simResult: SimulationResult = {
      command: scenario.command,
      expectedChanges: scenario.expectedChanges,
      actualChanges,
      passed: testPassed,
      details: scenario.description
    };

    results.push(simResult);

    if (testPassed) {
      passed++;
      if (debug) {
        console.log(`✅ PASS: ${scenario.description}`);
        console.log(`   "${scenario.command}"`);
        console.log(`   Expected: ${scenario.expectedChanges} changes, Got: ${actualChanges}\n`);
      }
    } else {
      failed++;
      if (debug) {
        console.log(`❌ FAIL: ${scenario.description}`);
        console.log(`   "${scenario.command}"`);
        console.log(`   Expected: ${scenario.expectedChanges} changes, Got: ${actualChanges}`);
        console.log(`   Difference: ${actualChanges - scenario.expectedChanges}\n`);
      }
    }
  }

  if (debug) {
    console.log(`${"=".repeat(60)}`);
    console.log(`📊 Results: ${passed}/${testScenarios.length} passed, ${failed} failed`);
    console.log(`${"=".repeat(60)}\n`);

    if (failed > 0) {
      console.log("🔥 FAILED TESTS:\n");
      results.filter(r => !r.passed).forEach(r => {
        console.log(`❌ ${r.details}`);
        console.log(`   Command: "${r.command}"`);
        console.log(`   Expected: ${r.expectedChanges}, Got: ${r.actualChanges}\n`);
      });
    }
  }

  return { passed, failed, total: testScenarios.length, results };
}

// Auto-run if executed directly
if (typeof window === "undefined") {
  runExecutorTests();
}
