
import { createInterface } from 'readline';
import { parseCommand } from './parser';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const debug = process.env.DEBUG !== 'false';

if (debug) {
  console.log("==========================================");
  console.log("   DAAVFX Chat Parser Verification CLI    ");
  console.log("==========================================");
  console.log("Verifying fixes for 'set grid 600' style commands...\n");
}

const testCases = [
  "set grid 600",
  "set lot 0.01",
  "set grid to 600",
  "set grid = 600",
  "set group 1 grid 600",
  "change group 1 grid 600"
];

let allPassed = true;

testCases.forEach(cmd => {
  const result = parseCommand(cmd);
  const passed = result.params?.value !== undefined;
  const icon = passed ? "✅" : "❌";
  
  if (debug) {
    console.log(`${icon} Input: "${cmd}"`);
    console.log(`   Parsed: ${JSON.stringify(result.params)}`);
  }
  if (!passed) allPassed = false;
  if (debug) console.log("---");
});

if (debug) {
  if (allPassed) {
    console.log("\n✅ All automated checks PASSED!");
  } else {
    console.log("\n❌ Some automated checks FAILED.");
  }

  console.log("\nENTERING INTERACTIVE MODE");
  console.log("Type a command to parse it (or 'exit' to quit):");
  console.log("-----------------------------------------------");
}

const prompt = () => {
  rl.question('> ', (answer) => {
    if (answer.toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    try {
      const result = parseCommand(answer);
      if (debug) {
        console.log("Parsed Result:");
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error("Error parsing:", err);
    }
    
    prompt();
  });
};

prompt();
