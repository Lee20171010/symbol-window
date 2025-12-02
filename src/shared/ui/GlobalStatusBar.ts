import * as vscode from 'vscode';
import { LspClient, LspStatus } from '../core/LspClient';
import { DatabaseManager } from '../core/DatabaseManager';

export class GlobalStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private lspStatus: LspStatus = 'standby';
    private isIndexing: boolean = false;
    private indexProgress: number = 0;

    constructor(
        context: vscode.ExtensionContext,
        private lspClient: LspClient,
        private dbManager: DatabaseManager
    ) {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        context.subscriptions.push(this.statusBarItem);

        // Listen to LSP
        this.lspClient.onStatusChange(status => {
            this.lspStatus = status;
            this.update();
        });
        this.lspStatus = this.lspClient.status;

        // Listen to DB
        this.dbManager.onProgress(percent => {
            this.isIndexing = percent < 100;
            this.indexProgress = percent;
            this.update();
        });

        this.update();
    }

    private update() {
        if (this.lspStatus === 'loading') {
            this.statusBarItem.text = '$(sync~spin) Symbol: Waiting for LSP...';
            this.statusBarItem.show();
            return;
        }

        if (this.isIndexing) {
            this.statusBarItem.text = `$(sync~spin) Symbol: Indexing (${this.indexProgress}%)`;
            this.statusBarItem.show();
            return;
        }

        if (this.lspStatus === 'timeout') {
            this.statusBarItem.text = '$(warning) Symbol: LSP Timeout';
            this.statusBarItem.tooltip = 'Language Server Protocol failed to respond. Some features may be limited.';
            this.statusBarItem.show();
            return;
        }

        // If everything is ready/idle, we can hide it or show a "Ready" state briefly
        // For now, let's hide it to reduce clutter, or show a static icon
        this.statusBarItem.hide();
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}
