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
exports.WorkspaceRag = void 0;
const vscode = __importStar(require("vscode"));
function extractQueryTerms(text) {
    const words = text
        .toLowerCase()
        .match(/[a-z_][a-z0-9_]{2,}/g)
        ?.slice(0, 200) ?? [];
    const stop = new Set([
        'the',
        'and',
        'for',
        'with',
        'from',
        'that',
        'this',
        'what',
        'how',
        'when',
        'where',
        'why',
        'does',
        'work',
        'please',
        'help',
        'fix',
        'error',
        'issue'
    ]);
    const uniq = [];
    for (const w of words) {
        if (stop.has(w))
            continue;
        if (!uniq.includes(w))
            uniq.push(w);
        if (uniq.length >= 6)
            break;
    }
    return uniq;
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
class WorkspaceRag {
    static async buildRagBlockFromMessages(messages) {
        const config = vscode.workspace.getConfiguration('heidi-gateway-proxy');
        const enabled = config.get('rag.enabled', true);
        if (!enabled)
            return null;
        let lastUserContent = '';
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === 'user' && typeof messages[i]?.content === 'string') {
                lastUserContent = messages[i].content;
                break;
            }
        }
        if (!lastUserContent)
            return null;
        const terms = extractQueryTerms(lastUserContent);
        if (terms.length === 0)
            return null;
        const maxFiles = Number(config.get('rag.maxFiles', 3));
        const maxResults = Number(config.get('rag.maxResults', 30));
        const maxChars = Number(config.get('rag.maxChars', 4000));
        const perFileMaxMatches = Number(config.get('rag.maxMatchesPerFile', 3));
        const pattern = terms.map(escapeRegex).join('|');
        const hitsByUri = new Map();
        const re = new RegExp(pattern, 'i');
        const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,out,dist,build,coverage}/**', Math.min(500, Math.max(50, maxResults * 10)));
        let totalMatches = 0;
        for (const uri of files) {
            if (totalMatches >= maxResults)
                break;
            let text = '';
            try {
                const bytes = await vscode.workspace.fs.readFile(uri);
                text = Buffer.from(bytes).toString('utf8');
            }
            catch {
                continue;
            }
            const lines = text.split(/\r?\n/);
            let score = 0;
            const matches = [];
            for (let i = 0; i < lines.length; i++) {
                if (totalMatches >= maxResults)
                    break;
                if (matches.length >= perFileMaxMatches)
                    break;
                const lineText = lines[i];
                if (!re.test(lineText))
                    continue;
                score++;
                totalMatches++;
                matches.push({ line: i + 1, preview: lineText });
            }
            if (score > 0) {
                hitsByUri.set(uri.toString(), { uri, matches, score });
            }
        }
        const ranked = [...hitsByUri.values()]
            .filter((h) => h.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.max(0, maxFiles));
        if (ranked.length === 0)
            return null;
        let out = `<workspace_search>\n`;
        out += `[Query Terms]: ${terms.join(', ')}\n`;
        for (const h of ranked) {
            const rel = vscode.workspace.asRelativePath(h.uri);
            out += `\n[File]: ${rel}\n`;
            for (const m of h.matches) {
                out += `- Line ${m.line}: ${m.preview.replace(/\s+/g, ' ').trim().slice(0, 400)}\n`;
            }
            if (out.length > maxChars)
                break;
        }
        out += `</workspace_search>\n`;
        if (out.length > maxChars)
            out = out.slice(0, maxChars) + `\n</workspace_search>\n`;
        return out;
    }
}
exports.WorkspaceRag = WorkspaceRag;
//# sourceMappingURL=WorkspaceRag.js.map