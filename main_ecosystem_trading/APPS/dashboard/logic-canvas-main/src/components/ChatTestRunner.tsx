// Test Runner Component - Click to run comprehensive parser + executor tests
// Add this to your dashboard to run simulations on-demand

"use client";

import { useState } from "react";
import { runParserTests } from "@/lib/chat/parser.test";
import { runExecutorTests } from "@/lib/chat/executor.test";

const debug = import.meta.env.VITE_DEBUG === 'true';

export function ChatTestRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{
    parser?: { passed: number; failed: number; total: number };
    executor?: { passed: number; failed: number; total: number };
  }>({});

  const runTests = async () => {
    setRunning(true);
    if (debug) console.clear();
    
    if (debug) console.log("🚀 Starting Comprehensive Chat Command Test Suite\n");
    if (debug) console.log("=" .repeat(60));
    
    // Run parser tests
    const parserResults = runParserTests();
    
    if (debug) console.log("\n" + "=".repeat(60) + "\n");
    
    // Run executor tests
    const executorResults = runExecutorTests();
    
    setResults({
      parser: {
        passed: parserResults.passed,
        failed: parserResults.failed,
        total: parserResults.total
      },
      executor: {
        passed: executorResults.passed,
        failed: executorResults.failed,
        total: executorResults.total
      }
    });
    
    setRunning(false);
    
    // Summary
    const totalPassed = parserResults.passed + executorResults.passed;
    const totalFailed = parserResults.failed + executorResults.failed;
    const totalTests = parserResults.total + executorResults.total;
    
    if (debug) {
      console.log("\n" + "=".repeat(60));
      console.log("🎯 FINAL SUMMARY");
      console.log("=".repeat(60));
      console.log(`Parser Tests: ${parserResults.passed}/${parserResults.total} passed`);
      console.log(`Executor Tests: ${executorResults.passed}/${executorResults.total} passed`);
      console.log(`\nTOTAL: ${totalPassed}/${totalTests} passed (${((totalPassed/totalTests)*100).toFixed(1)}%)`);
      console.log("=".repeat(60) + "\n");
    }
    
    if (totalFailed === 0) {
      if (debug) console.log("✅ ALL TESTS PASSED! Bug is fixed.");
    } else {
      if (debug) console.log(`❌ ${totalFailed} tests failed. Review logs above.`);
    }
  };

  return (
    <div className="p-4 border border-cyan-500/30 rounded-lg bg-black/40">
      <h3 className="text-cyan-400 font-bold mb-2">Chat Command Test Suite</h3>
      <p className="text-cyan-300/60 text-sm mb-4">
        Runs comprehensive tests to validate group filter bug fix
      </p>
      
      <button
        onClick={runTests}
        disabled={running}
        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 
                   text-white rounded transition-colors"
      >
        {running ? "Running Tests..." : "Run Tests"}
      </button>

      {results.parser && results.executor && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-cyan-300">Parser Tests:</span>
            <span className={results.parser.failed === 0 ? "text-green-400" : "text-red-400"}>
              {results.parser.passed}/{results.parser.total} passed
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-cyan-300">Executor Tests:</span>
            <span className={results.executor.failed === 0 ? "text-green-400" : "text-red-400"}>
              {results.executor.passed}/{results.executor.total} passed
            </span>
          </div>

          <div className="pt-2 border-t border-cyan-500/30">
            <div className="flex justify-between font-bold">
              <span className="text-cyan-300">Total:</span>
              <span className={
                (results.parser.failed + results.executor.failed) === 0 
                  ? "text-green-400" 
                  : "text-red-400"
              }>
                {results.parser.passed + results.executor.passed}/
                {results.parser.total + results.executor.total} passed
              </span>
            </div>
          </div>

          <p className="text-xs text-cyan-300/60 pt-2">
            Check browser console for detailed logs
          </p>
        </div>
      )}
    </div>
  );
}
