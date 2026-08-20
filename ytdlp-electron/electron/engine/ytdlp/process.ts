/**
 * 以 spawn 运行 yt-dlp，支持按行回调与取消
 */

import { spawn, type ChildProcess } from 'child_process';
import { YtdlpCancelled } from '~/electron/engine/ytdlp/errors';

export interface RunYtdlpOptions {
  args: string[];
  cwd?: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  shouldCancel?: () => boolean;
  onSpawn?: (child: ChildProcess) => void;
}

export interface RunYtdlpResult {
  code: number;
  stdout: string;
  stderr: string;
}

function killChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.killed) return;
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }
  child.kill('SIGTERM');
}

function attachLineReader(stream: NodeJS.ReadableStream | null, onLine: (line: string) => void): void {
  if (!stream) return;
  let buffer = '';
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString('utf8');
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (part.length > 0) onLine(part);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) onLine(buffer);
  });
}

export function runYtdlp(bin: string, options: RunYtdlpOptions): Promise<RunYtdlpResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, options.args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });

    options.onSpawn?.(child);

    let stdout = '';
    let stderr = '';
    let settled = false;
    let cancelTimer: ReturnType<typeof setInterval> | null = null;

    attachLineReader(child.stdout, (line) => {
      stdout += `${line}\n`;
      options.onStdoutLine?.(line);
    });
    attachLineReader(child.stderr, (line) => {
      stderr += `${line}\n`;
      options.onStderrLine?.(line);
    });

    if (options.shouldCancel) {
      cancelTimer = setInterval(() => {
        if (options.shouldCancel?.()) {
          killChild(child);
        }
      }, 400);
    }

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (cancelTimer) clearInterval(cancelTimer);
      fn();
    };

    child.on('error', (err) => {
      finish(() => reject(err));
    });

    child.on('close', (code) => {
      finish(() => {
        if (options.shouldCancel?.()) {
          reject(new YtdlpCancelled());
          return;
        }
        resolve({
          code: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
  });
}
