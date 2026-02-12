"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextGatherer = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class ContextGatherer {
    static async buildOmniContext() {
        let contextString = `<ide_context>\n`;
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const fileName = path.basename(editor.document.fileName);
            const cursorLine = editor.selection.active.line + 1;
            contextString += `[Active File]: ${fileName} (Cursor on line ${cursorLine})\n`;
            const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
            const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
            if (errors.length > 0) {
                contextString += `[Active Errors]:\n`;
                for (const err of errors) {
                    contextString += `- Line ${err.range.start.line + 1}: ${err.message}\n`;
                }
            }
        }
        try {
            const openTabs = vscode.window.tabGroups.all
                .flatMap((group) => group.tabs)
                .map((tab) => tab.label)
                .filter(Boolean)
                .join(', ');
            if (openTabs) {
                contextString += `[Open Tabs]: ${openTabs}\n`;
            }
        }
        catch {
            contextString += '';
        }
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            contextString += `[Workspace Root]: ${rootPath}\n`;
        }
        contextString += `</ide_context>\n`;
        return contextString;
    }
    static async injectContext(messages) {
        const omniContext = await this.buildOmniContext();
        let lastUserMsgIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === 'user') {
                lastUserMsgIndex = i;
                break;
            }
        }
        if (lastUserMsgIndex !== -1) {
            const originalContent = messages[lastUserMsgIndex]?.content ?? '';
            messages[lastUserMsgIndex].content = `${originalContent}\n\n${omniContext}`;
        }
        return messages;
    }
}
exports.ContextGatherer = ContextGatherer;
//# sourceMappingURL=ContextGatherer.js.map