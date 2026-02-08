// CLI Test Runner - Execute with: npx tsx run-tests.ts
// This runs the full test harness and reports results

import { runTestHarness } from "./src/lib/chat/test-harness";

console.log("\n🚀 Starting Parser Test Harness...\n");

const startTime = Date.now();
const results = runTestHarness();
const duration = Date.now() - startTime;

console.log(`⏱️  Completed in ${duration}ms\n`);

// Exit with error code if tests failed
if (results.failed > 0) {
  console.log("❌ TESTS FAILED - Parser not ready for production\n");
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED - Parser ready for production\n");
  process.exit(0);
}
