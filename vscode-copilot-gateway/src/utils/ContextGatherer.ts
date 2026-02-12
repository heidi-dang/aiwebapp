import * as vscode from 'vscode'
import * as path from 'path'

export class ContextGatherer {
  public static async buildOmniContext(): Promise<string> {
    let contextString = `<ide_context>\n`

    const editor = vscode.window.activeTextEditor
    if (editor) {
      const fileName = path.basename(editor.document.fileName)
      const cursorLine = editor.selection.active.line + 1
      contextString += `[Active File]: ${fileName} (Cursor on line ${cursorLine})\n`

      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
      const errors = diagnostics.filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Error
      )
      if (errors.length > 0) {
        contextString += `[Active Errors]:\n`
        for (const err of errors) {
          contextString += `- Line ${err.range.start.line + 1}: ${err.message}\n`
        }
      }
    }

    try {
      const openTabs = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .map((tab) => tab.label)
        .filter(Boolean)
        .join(', ')
      if (openTabs) {
        contextString += `[Open Tabs]: ${openTabs}\n`
      }
    } catch {
      contextString += ''
    }

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath
      contextString += `[Workspace Root]: ${rootPath}\n`
    }

    contextString += `</ide_context>\n`
    return contextString
  }

  public static async injectContext(messages: any[]): Promise<any[]> {
    const omniContext = await this.buildOmniContext()

    let lastUserMsgIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        lastUserMsgIndex = i
        break
      }
    }

    if (lastUserMsgIndex !== -1) {
      const originalContent = messages[lastUserMsgIndex]?.content ?? ''
      messages[lastUserMsgIndex].content = `${originalContent}\n\n${omniContext}`
    }

    return messages
  }
}
