import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { logToolActivity } from "./_shared";

registerTool({
  name: "run_code",
  description: "Execute sandboxed JavaScript code and return the result. Useful for calculations, data transformations, and quick scripting tasks. Code runs in an isolated VM with a 5-second timeout.",
  inputSchema: z.object({
    code: z.string().describe("JavaScript code to execute"),
  }),
  execute: async (input, context: ToolContext) => {
    const MAX_OUTPUT_LENGTH = 10000;
    const TIMEOUT_MS = 5000;
    const MEMORY_LIMIT_MB = 64;

    const workerCode = `
      const { parentPort, workerData } = require("worker_threads");
      const vm = require("vm");
      const stdoutLogs = [];
      const stderrLogs = [];
      const sandbox = {
        console: {
          log: (...args) => stdoutLogs.push(args.map(String).join(" ")),
          error: (...args) => stderrLogs.push(args.map(String).join(" ")),
          warn: (...args) => stderrLogs.push(args.map(String).join(" ")),
          info: (...args) => stdoutLogs.push(args.map(String).join(" ")),
        },
        Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
        Array, Object, String, Number, Boolean, RegExp, Map, Set,
        setTimeout: undefined, setInterval: undefined, setImmediate: undefined,
        process: undefined, require: undefined, global: undefined,
        globalThis: undefined, fetch: undefined,
      };
      try {
        const ctx = vm.createContext(sandbox);
        const script = new vm.Script(workerData.code, { timeout: ${TIMEOUT_MS} });
        const result = script.runInContext(ctx, { timeout: ${TIMEOUT_MS}, breakOnSigint: true });
        parentPort.postMessage({
          success: true,
          stdout: stdoutLogs.join("\\n"),
          stderr: stderrLogs.join("\\n"),
          result: result !== undefined ? String(result) : undefined,
        });
      } catch (err) {
        parentPort.postMessage({
          success: false,
          stdout: stdoutLogs.join("\\n"),
          stderr: stderrLogs.join("\\n"),
          error: err.message || "Code execution failed",
        });
      }
    `;

    try {
      const { Worker } = await import("worker_threads");
      const result = await new Promise<{
        success: boolean;
        stdout: string;
        stderr: string;
        result?: string;
        error?: string;
      }>((resolve) => {
        const worker = new Worker(workerCode, {
          eval: true,
          workerData: { code: input.code },
          resourceLimits: {
            maxOldGenerationSizeMb: MEMORY_LIMIT_MB,
            maxYoungGenerationSizeMb: MEMORY_LIMIT_MB / 4,
            stackSizeMb: 4,
          },
        });

        const timer = setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            stdout: "",
            stderr: "",
            error: "Code execution timed out (5s limit)",
          });
        }, TIMEOUT_MS + 1000);

        worker.on("message", (msg) => {
          clearTimeout(timer);
          resolve(msg);
          worker.terminate();
        });

        worker.on("error", (err: Error) => {
          clearTimeout(timer);
          const isOOM = err.message.includes("out of memory") || err.message.includes("allocation");
          resolve({
            success: false,
            stdout: "",
            stderr: "",
            error: isOOM ? "Code execution exceeded memory limit (64MB)" : err.message,
          });
        });

        worker.on("exit", (code) => {
          clearTimeout(timer);
          if (code !== 0) {
            resolve({
              success: false,
              stdout: "",
              stderr: "",
              error: `Worker exited with code ${code}`,
            });
          }
        });
      });

      await logToolActivity("run_code", context, { metadata: { codeLength: input.code.length } });

      return {
        success: result.success,
        stdout: (result.stdout || "").slice(0, MAX_OUTPUT_LENGTH),
        stderr: (result.stderr || "").slice(0, MAX_OUTPUT_LENGTH),
        result: result.result?.slice(0, MAX_OUTPUT_LENGTH),
        error: result.error,
      };
    } catch (err) {
      await logToolActivity("run_code", context, { metadata: { error: true } });
      return {
        success: false,
        stdout: "",
        stderr: "",
        error: err instanceof Error ? err.message : "Code execution failed",
      };
    }
  },
});
