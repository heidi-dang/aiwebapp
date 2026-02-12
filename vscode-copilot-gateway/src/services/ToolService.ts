import * as vscode from 'vscode';
import * as path from 'path';

type FileOperationAction = 'create' | 'modify' | 'delete'

export type FileOperation = {
  action: FileOperationAction
  filePath: string
  content?: string
}

export class ToolService {
  
  async applyWorkspaceEdit(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    try {
      const uri = vscode.Uri.file(filePath);
      
      // Check if file exists to decide on creation vs edit
      // For simplicity, we'll write the full content. 
      // A more advanced version would handle diffs.
      
      const edit = new vscode.WorkspaceEdit();
      // We need to overwrite the file.
      // Since WorkspaceEdit.replace requires a range, we can use create/overwrite logic or 
      // simply write via fs (but WorkspaceEdit is better for undo support).
      
      // Better approach for full replacement via WorkspaceEdit:
      // Delete and Create? No, that loses history.
      // Replace entire range.
      
      let fileExists = false;
      try {
        await vscode.workspace.fs.stat(uri);
        fileExists = true;
      } catch {
        fileExists = false;
      }

      if (fileExists) {
        const doc = await vscode.workspace.openTextDocument(uri);
        const lastLine = doc.lineAt(doc.lineCount - 1);
        const range = new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length);
        edit.replace(uri, range, content);
      } else {
        edit.createFile(uri, { overwrite: true });
        edit.insert(uri, new vscode.Position(0, 0), content);
      }

      const success = await vscode.workspace.applyEdit(edit);
      if (success) {
        // Save the document
        const doc = await vscode.workspace.openTextDocument(uri);
        await doc.save();
        return { success: true };
      } else {
        return { success: false, error: 'Failed to apply workspace edit' };
      }

    } catch (error) {
      console.error('Error applying edit:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async applyFileOperations(operations: FileOperation[]): Promise<{ success: boolean; error?: string }> {
    try {
      if (!Array.isArray(operations) || operations.length === 0) {
        return { success: false, error: 'No operations provided' }
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!workspaceRoot) {
        return { success: false, error: 'No workspace folder found' }
      }

      const edit = new vscode.WorkspaceEdit()

      for (const op of operations) {
        if (!op || typeof op !== 'object') {
          return { success: false, error: 'Invalid operation' }
        }

        const filePath = String((op as any).filePath || '')
        const action = String((op as any).action || '') as FileOperationAction

        if (!filePath) {
          return { success: false, error: 'Operation missing filePath' }
        }

        const resolvedPath = path.resolve(filePath)
        const rel = path.relative(workspaceRoot, resolvedPath)
        const outsideWorkspace =
          rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)
        if (outsideWorkspace) {
          return { success: false, error: `Path is outside workspace: ${filePath}` }
        }

        const uri = vscode.Uri.file(resolvedPath)

        if (action === 'delete') {
          edit.deleteFile(uri, { ignoreIfNotExists: true })
          continue
        }

        const content = typeof (op as any).content === 'string' ? (op as any).content : undefined
        if (content === undefined) {
          return { success: false, error: `Operation missing content for ${action}: ${filePath}` }
        }

        let fileExists = false
        try {
          await vscode.workspace.fs.stat(uri)
          fileExists = true
        } catch {
          fileExists = false
        }

        if (!fileExists) {
          edit.createFile(uri, { overwrite: true })
          edit.insert(uri, new vscode.Position(0, 0), content)
          continue
        }

        const doc = await vscode.workspace.openTextDocument(uri)
        if (doc.lineCount === 0) {
          edit.insert(uri, new vscode.Position(0, 0), content)
          continue
        }

        const lastLine = doc.lineAt(doc.lineCount - 1)
        const range = new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length)
        edit.replace(uri, range, content)
      }

      const success = await vscode.workspace.applyEdit(edit)
      if (!success) return { success: false, error: 'Failed to apply workspace edit' }

      for (const op of operations) {
        if (op.action === 'delete') continue
        const uri = vscode.Uri.file(op.filePath)
        try {
          const doc = await vscode.workspace.openTextDocument(uri)
          await doc.save()
        } catch {
          continue
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Error applying operations:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async runTerminalCommand(command: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Reuse existing terminal if available to avoid clutter
      let terminal = vscode.window.terminals.find(t => t.name === 'AI Agent Task');
      if (!terminal) {
        terminal = vscode.window.createTerminal('AI Agent Task');
      }
      
      terminal.show();
      terminal.sendText(command);
      
      // We can't easily wait for completion or get output with standard API without shell integration hooks
      // which are complex. For now, we fire and forget from the API perspective, 
      // but return success that the command was sent.
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  getToolsDefinition(): any[] {
    return [
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description: 'Edit or create a file in the workspace',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Absolute path to the file' },
              content: { type: 'string', description: 'Full content of the file' }
            },
            required: ['filePath', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'apply_file_operations',
          description: 'Apply multiple file operations (create/modify/delete) in the workspace',
          parameters: {
            type: 'object',
            properties: {
              operations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    action: { type: 'string', enum: ['create', 'modify', 'delete'] },
                    filePath: { type: 'string', description: 'Absolute path to the file' },
                    content: { type: 'string', description: 'Full content for create/modify' }
                  },
                  required: ['action', 'filePath']
                }
              }
            },
            required: ['operations']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_command',
          description: 'Run a shell command in the VS Code terminal',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The command to execute' }
            },
            required: ['command']
          }
        }
      }
    ];
  }
}
