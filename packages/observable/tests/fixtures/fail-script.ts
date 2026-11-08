// Run as a process by loader-resolve.test.ts: a loader that fails.
import { fail } from "../../src/loader/fail.js";

fail(`graph "demo": data.nodes[2].id: must be a string`);
