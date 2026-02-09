
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export class SandboxService {
  private readonly image = 'node:20-slim';

  /**
   * Create a new ephemeral sandbox container for a job
   */
  async createSandbox(jobId: string): Promise<string> {
    const containerName = `sandbox_${jobId}`;
    
    // We start a container that stays alive. 'tail -f /dev/null' is a common trick.
    // We mount a volume or set working directory if needed.
    // For now, ephemeral workspace.
    
    // Security:
    // - --network none (optional, but we probably want web access for now as per phase 13)
    // - --cpus 1.0
    // - --memory 512m
    // - --rm (automatically remove when stopped? No, we want manual control to persist across multiple execs)
    
    const command = `docker run -d \
      --name ${containerName} \
      --cpus 1.0 \
      --memory 512m \
      ${this.image} \
      tail -f /dev/null`;

    try {
      await execAsync(command);
      // Install basic tools inside the sandbox if they are missing in the base image
      // node:20-slim is very bare. We might want to install git/python3 if needed.
      // For speed, we should ideally have a pre-built "sandbox-image".
      // But for this MVP, we'll install on demand or assume basic node usage.
      // Let's at least ensure we can run basic shell commands.
      return containerName;
    } catch (err) {
      console.error(`Failed to create sandbox ${containerName}:`, err);
      throw err;
    }
  }

  /**
   * Execute a command inside the sandbox
   */
  async execCommand(jobId: string, command: string, cwd: string = '/app'): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const containerName = `sandbox_${jobId}`;
    
    // Create workspace dir if not exists (lazy init)
    // We use "sh -c" to allow complex commands like pipes and redirects
    const dockerCmd = `docker exec -w ${cwd} ${containerName} sh -c "${command.replace(/"/g, '\\"')}"`;

    try {
      const { stdout, stderr } = await execAsync(dockerCmd);
      return { stdout, stderr, exitCode: 0 };
    } catch (err: any) {
      // execAsync throws if exit code is non-zero
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.code || 1
      };
    }
  }

  /**
   * Copy file into sandbox
   */
  async writeFile(jobId: string, path: string, content: string): Promise<void> {
    const containerName = `sandbox_${jobId}`;
    // Easiest way: pipe to docker exec
    // Note: This is fragile for binary data, but okay for text.
    // For robust file transfer, we should use 'docker cp' or mount volumes.
    // Let's use 'docker exec' with cat for MVP simplicity with text files.
    
    // Ensure dir exists
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      await execAsync(`docker exec ${containerName} mkdir -p ${dir}`);
    }

    const child = exec(`docker exec -i ${containerName} sh -c "cat > '${path}'"`);
    child.stdin?.write(content);
    child.stdin?.end();
    
    return new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to write file ${path}, exit code ${code}`));
      });
      child.on('error', reject);
    });
  }

  /**
   * Read file from sandbox
   */
  async readFile(jobId: string, path: string): Promise<string> {
    const containerName = `sandbox_${jobId}`;
    const { stdout } = await execAsync(`docker exec ${containerName} cat '${path}'`);
    return stdout;
  }

  /**
   * Destroy the sandbox container
   */
  async destroySandbox(jobId: string): Promise<void> {
    const containerName = `sandbox_${jobId}`;
    try {
      await execAsync(`docker rm -f ${containerName}`);
    } catch (err) {
      console.warn(`Failed to destroy sandbox ${containerName}:`, err);
    }
  }
}

export const sandboxService = new SandboxService();
