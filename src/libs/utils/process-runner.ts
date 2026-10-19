import { spawn } from 'child_process';
import fs from 'fs';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Bash and FFmpeg share a dedicated process group, including grandchildren.
export class ProcessRunner {
  private stopped = false;
  private readonly groups = new Set<number>();

  async run(command: string, args: string[], outputFile?: string): Promise<string> {
    if (this.stopped) throw new Error('Process runner stopped');
    const output = outputFile ? fs.openSync(outputFile, 'a') : undefined;
    try {
      const child = spawn(command, args, { detached: true, stdio: ['ignore', output ?? 'pipe', 'pipe'] });
      if (child.pid) this.groups.add(child.pid);
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', data => {
        stdout = (stdout + data).slice(-1024 * 1024);
      });
      child.stderr?.on('data', data => {
        stderr = (stderr + data).slice(-64 * 1024);
      });
      return await new Promise<string>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
          if (child.pid && !this.groupAlive(child.pid)) this.groups.delete(child.pid);
          if (code === 0) resolve(stdout);
          else reject(new Error(`${command} exited (${signal || code}): ${stderr}`));
        });
      });
    } finally {
      if (output !== undefined) fs.closeSync(output);
    }
  }

  private groupAlive(pid: number): boolean {
    try {
      process.kill(-pid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false;
      throw err;
    }
    // Linux can retain orphan zombies until PID 1 reaps them. They cannot write output.
    if (process.platform === 'linux') {
      return fs.readdirSync('/proc').some(entry => {
        if (!/^\d+$/.test(entry)) return false;
        try {
          const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8');
          const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
          return +fields[2] === pid && fields[0] !== 'Z';
        } catch {
          return false;
        }
      });
    }
    return true;
  }

  async close(): Promise<void> {
    this.stopped = true;
    const signal = (pid: number, value: NodeJS.Signals) => {
      try {
        process.kill(-pid, value);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
      }
    };
    for (const pid of this.groups) signal(pid, 'SIGTERM');
    const deadline = Date.now() + 5000;
    while ([...this.groups].some(pid => this.groupAlive(pid)) && Date.now() < deadline) await delay(25);
    for (const pid of this.groups) if (this.groupAlive(pid)) signal(pid, 'SIGKILL');
    const forceDeadline = Date.now() + 1000;
    while ([...this.groups].some(pid => this.groupAlive(pid)) && Date.now() < forceDeadline) await delay(25);
    if ([...this.groups].some(pid => this.groupAlive(pid))) throw new Error('Conversion process group did not stop');
    this.groups.clear();
  }
}
