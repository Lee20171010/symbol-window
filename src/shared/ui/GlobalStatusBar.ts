import * as vscode from 'vscode';
import { LspClient, LspStatus } from '../services/LspClient';
import { DatabaseManager } from '../services/DatabaseManager';

export class GlobalStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private lspStatus: LspStatus = 'standby';
    private isIndexing: boolean = false;
    private indexProgress: number = 0;

    private dbListener: vscode.Disposable | undefined;

    constructor(
        context: vscode.ExtensionContext,
        private lspClient: LspClient,
        private dbManager: DatabaseManager | undefined
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
        if (this.dbManager) {
            this.bindDbEvents();
        }

        // Register command handler for status bar click
        this.statusBarItem.command = 'symbol-window.showStatusMenu';
        context.subscriptions.push(
            vscode.commands.registerCommand('symbol-window.showStatusMenu', this.showMenu.bind(this))
        );

        this.update();
    }

    public setDatabaseManager(dbManager: DatabaseManager | undefined) {
        this.dbListener?.dispose();
        this.dbManager = dbManager;
        if (this.dbManager) {
            this.bindDbEvents();
        } else {
            this.isIndexing = false;
            this.update();
        }
    }

    private bindDbEvents() {
        if (!this.dbManager) {
            return;
        }
        this.dbListener = this.dbManager.onProgress(percent => {
            this.isIndexing = percent < 100;
            this.indexProgress = percent;
            this.update();
        });
    }

    private async showMenu() {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(sync) Rebuild Index (Incremental)',
                description: 'Update index based on file changes',
                detail: 'Use this if symbols are missing or outdated.',
                picked: true // Default selection
            },
            {
                label: '$(trash) Rebuild Index (Full)',
                description: 'Clear database and rebuild from scratch',
                detail: 'Use this if the database is corrupted or incremental update fails.'
            }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Symbol Window Database Actions'
        });

        if (selection) {
            if (selection.label.includes('Incremental')) {
                vscode.commands.executeCommand('symbol-window.rebuildIndex');
            } else if (selection.label.includes('Full')) {
                vscode.commands.executeCommand('symbol-window.rebuildIndexFull');
            }
        }
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
        // Per SPEC: Standby/Ready: $(database) Symbols: Ready
        this.statusBarItem.text = '$(database) Symbols: Ready';
        this.statusBarItem.tooltip = 'Click for Database Actions';
        this.statusBarItem.show();
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}
