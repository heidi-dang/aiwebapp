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
exports.ContextService = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class ContextService {
    async collectContext() {
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
    async getWorkspaceStructure() {
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
        }
        catch (e) {
            console.warn('Error getting workspace structure:', e);
            return '';
        }
    }
    getOpenTabs() {
        const tabs = vscode.window.tabGroups.all
            .flatMap(group => group.tabs)
            .map(tab => {
            const label = tab.label;
            const isActive = tab.isActive ? ' (Active)' : '';
            return `- ${label}${isActive}`;
        });
        return tabs.join('\n');
    }
    async getActiveTerminal() {
        const terminal = vscode.window.activeTerminal;
        if (!terminal) {
            return '';
        }
        try {
            const pid = await terminal.processId;
            return `Name: ${terminal.name}\nProcessId: ${pid}`;
        }
        catch {
            return `Name: ${terminal.name}\nProcessId: unknown`;
        }
    }
}
exports.ContextService = ContextService;
//# sourceMappingURL=ContextService.js.map