import * as vscode from 'vscode';
import { CopilotGatewayServer } from '../server/CopilotGatewayServer';
export declare class GatewayDashboard {
    private panel;
    private context;
    private server;
    constructor(context: vscode.ExtensionContext);
    show(): void;
    private getWebviewContent;
    private handleWebviewMessage;
    private startDashboardUpdates;
    setServer(server: CopilotGatewayServer): void;
    dispose(): void;
}
//# sourceMappingURL=GatewayDashboard.d.ts.map