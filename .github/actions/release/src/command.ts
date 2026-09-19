import { spawn } from "node:child_process";

export interface CommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stream?: boolean;
}
export interface CommandResult {
  stdout: string;
  stderr: string;
}

export function runCommand(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (options.stream) process.stdout.write(chunk);
      else stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      if (options.stream) process.stderr.write(chunk);
      else stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else {
        const detail = !options.stream && stderr.trim() ? `: ${stderr.trim()}` : "";
        reject(new Error(`${command} exited with status ${code}${detail}`));
      }
    });
  });
}
