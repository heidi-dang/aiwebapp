
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export class GitService {
  constructor(private cwd: string) {}

  private async execGit(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git ${command}`, { cwd: this.cwd });
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Git command failed: ${error.message}`);
    }
  }

  async status(): Promise<string> {
    return this.execGit('status --short');
  }

  async add(files: string[] = ['.']): Promise<void> {
    const fileList = files.join(' ');
    await this.execGit(`add ${fileList}`);
  }

  async commit(message: string): Promise<string> {
    // Escape quotes in message
    const escapedMessage = message.replace(/"/g, '\\"');
    await this.execGit(`commit -m "${escapedMessage}"`);
    // Return the short hash of the new commit
    return this.execGit('rev-parse --short HEAD');
  }

  async diff(target: string = 'HEAD'): Promise<string> {
    return this.execGit(`diff ${target}`);
  }

  async log(limit: number = 5): Promise<string> {
    return this.execGit(`log -n ${limit} --oneline`);
  }

  async undo(): Promise<void> {
    // Soft reset to keep changes in staging/working dir
    await this.execGit('reset --soft HEAD~1');
  }

  async applyPatch(patchPath: string): Promise<void> {
    await this.execGit(`apply ${patchPath}`);
  }
  
  async getLastCommitHash(): Promise<string> {
    return this.execGit('rev-parse HEAD');
  }
}
