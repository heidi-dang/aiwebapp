import * as vscode from 'vscode';
import * as path from 'path';

export class ContextService {
  
  async collectContext(): Promise<string> {
    const workspace = await this.getWorkspaceStructure();
    const tabs = this.getOpenTabs();
    const terminal = await this.getActiveTerminal(); 

    let context = "=== IDE Context ===\n";
    
    if (workspace) {
      context += `\n[Workspace Structure]\n${workspace}\n`;
    }
    
    if (tabs) {
      context += `\n[Open Tabs]\n${tabs}\n`;
    }
    
    if (terminal) {
      context += `\n[Active Terminal]\n${terminal}\n`;
    }
    
    return context;
  }

  private async getWorkspaceStructure(): Promise<string> {
    if (!vscode.workspace.workspaceFolders) {
      return '';
    }

    try {
        // Limit to 50 files to avoid context bloating
        const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**}', 50);
        
        // Sort files to make structure clear
        const sortedFiles = files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
        
        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        
        // Create a simple list representation
        const tree = sortedFiles.map(file => {
        let relativePath = path.relative(rootPath, file.fsPath);
        return `- ${relativePath}`;
        }).join('\n');

        return tree;
    } catch (e) {
        console.warn('Error getting workspace structure:', e);
        return '';
    }
  }

  private getOpenTabs(): string {
    const tabs = vscode.window.tabGroups.all
        .flatMap(group => group.tabs)
        .map(tab => {
            const label = tab.label;
            const isActive = tab.isActive ? ' (Active)' : '';
            return `- ${label}${isActive}`;
        });

    return tabs.join('\n');
  }

  private async getActiveTerminal(): Promise<string> {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
        return '';
    }

    try {
        const pid = await terminal.processId;
        return `Name: ${terminal.name}\nProcessId: ${pid}`;
    } catch {
        return `Name: ${terminal.name}\nProcessId: unknown`;
    }
  }
}
