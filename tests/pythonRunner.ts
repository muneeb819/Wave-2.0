/**
 * Dependency-free helper that locates a usable Python interpreter for tests which
 * need to cross-check generated Python source or LiveKit tokens.
 *
 * Why this exists:
 *  - CI runners and fresh checkouts do not always expose a `python` binary, and the
 *    Python environment (`uv sync` / `.venv`) may not exist at all.
 *  - `spawnSync` returns `{ status: null, stderr: null, error }` when the command
 *    cannot be started (ENOENT). Calling `result.stderr.toString()` then crashes the
 *    test with `TypeError: Cannot read properties of undefined (reading 'toString')`.
 *
 * Tests should assert on `runPython(...).ok` and print `detail` on failure instead.
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type PythonRunner = {
  command: string;
  args: string[];
  label: string;
};

export type PythonResult = {
  ok: boolean;
  detail: string;
  runner: string | null;
};

const IS_WINDOWS = process.platform === "win32";
const PROBE_TIMEOUT_MS = 20_000;
const DEFAULT_RUN_TIMEOUT_MS = 120_000;

function candidateRunners(): PythonRunner[] {
  const runners: PythonRunner[] = [];

  // 1. Explicit override (CI sets this to the interpreter from actions/setup-python).
  const explicit = process.env.VITEST_PYTHON_BIN?.trim();
  if (explicit) {
    runners.push({ command: explicit, args: [], label: explicit });
  }

  // 2. The project virtualenv created by `uv sync`.
  const venvPython = join(
    process.cwd(),
    ".venv",
    IS_WINDOWS ? join("Scripts", "python.exe") : join("bin", "python"),
  );
  if (existsSync(venvPython)) {
    runners.push({ command: venvPython, args: [], label: ".venv python" });
  }

  // 3. System interpreters.
  runners.push({
    command: IS_WINDOWS ? "python" : "python3",
    args: [],
    label: "python3",
  });
  if (!IS_WINDOWS) {
    runners.push({ command: "python", args: [], label: "python" });
  }

  // 4. `uv run python` (resolves/syncs the project environment on demand).
  runners.push({
    command: "uv",
    args: ["run", "python"],
    label: "uv run python",
  });

  // De-duplicate identical command + args pairs.
  const seen = new Set<string>();
  return runners.filter((runner) => {
    const key = `${runner.command}\u0000${runner.args.join("\u0000")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Turn a `spawnSync` result into a readable message, even when spawning failed. */
export function describeSpawnFailure(result: SpawnSyncReturns<string>): string {
  if (result.error) {
    return String(result.error);
  }
  const stderr =
    typeof result.stderr === "string" ? result.stderr : (result.stderr ?? "");
  const stdout =
    typeof result.stdout === "string" ? result.stdout : (result.stdout ?? "");
  if (stderr.trim()) return stderr.trim();
  if (stdout.trim()) return stdout.trim();
  const signal = result.signal ? ` (signal ${result.signal})` : "";
  return `process exited with status ${String(result.status)}${signal}`;
}

function probe(runner: PythonRunner, probeCode: string): boolean {
  const result = spawnSync(runner.command, [...runner.args, "-c", probeCode], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
    timeout: PROBE_TIMEOUT_MS,
  });
  return !result.error && result.status === 0;
}

/**
 * Run Python `code` with the first interpreter that can import `requireModule`.
 * Never throws: failures are reported through `{ ok: false, detail }`.
 */
export function runPython(
  code: string,
  options: { input?: string; requireModule?: string; timeoutMs?: number } = {},
): PythonResult {
  const { input, requireModule, timeoutMs = DEFAULT_RUN_TIMEOUT_MS } = options;
  const probeCode = requireModule ? `import ${requireModule}` : "import sys";

  for (const runner of candidateRunners()) {
    if (!probe(runner, probeCode)) continue;
    const result = spawnSync(runner.command, [...runner.args, "-c", code], {
      input,
      encoding: "utf8",
      timeout: timeoutMs,
    });
    return {
      ok: result.status === 0 && !result.error,
      detail: describeSpawnFailure(result),
      runner: runner.label,
    };
  }

  return {
    ok: false,
    runner: null,
    detail:
      `No Python interpreter with ${requireModule ? `"${requireModule}"` : "the standard library"} ` +
      "is available. Looked for VITEST_PYTHON_BIN, .venv python, python3, python, and `uv run python`. " +
      'Install the Python dependencies with `uv sync` or set VITEST_PYTHON_BIN="python".',
  };
}

/** True when some interpreter can import `moduleName` (used for `it.skipIf`). */
export function hasPythonWith(moduleName: string): boolean {
  const probeCode = `import ${moduleName}`;
  return candidateRunners().some((runner) => probe(runner, probeCode));
}
