// Scrub guard: fail if internal markers ever appear in tracked files.
// Patterns are base64-encoded so this file does not itself reintroduce them.
import { execFileSync } from "node:child_process";

const B64 = "VXNlcnNcSmFucmUKTWFkZXJQYWNrZXIKTGFnUGFjawptaWR2YXVsdAp5YW5paW51Cg==";
const patterns = Buffer.from(B64, "base64").toString("utf8").split("\n").filter(Boolean);

const args = ["grep", "-n", "-I", "-F"];
for (const p of patterns) args.push("-e", p);
args.push("--", ".");

let output = "";
try {
  output = execFileSync("git", args, { encoding: "utf8" });
} catch (err) {
  if (err.status === 1) {
    console.log("scrub guard: clean");
    process.exit(0);
  }
  throw err;
}

console.error("scrub guard: internal markers found in tracked files:\n" + output);
process.exit(1);
