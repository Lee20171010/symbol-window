import * as vscode from 'vscode';

export type LspStatus = 'standby' | 'loading' | 'ready' | 'timeout';

export class LspClient {
    private _status: LspStatus = 'standby';
    private _onStatusChange = new vscode.EventEmitter<LspStatus>();
    public readonly onStatusChange = this._onStatusChange.event;

    private retryCount: number = 0;
    private readonly MAX_RETRIES = 20; // 20 * 3s = 60s
    private probeIndex: number = 0;
    private readonly PROBE_CHARS = ['', 'e', 'a', 'i', 'o', 'u', 's', 't', 'r', 'n']; // Common letters
    private pollingTimer: NodeJS.Timeout | undefined;

    constructor() {
        // Listen to active editor changes to trigger polling if needed
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (this._status === 'standby' && editor) {
                this.startPolling();
            } else if (this._status === 'ready') {
                // Re-confirm readiness or just notify listeners?
                // For now, do nothing, assuming ready state persists until timeout or error.
            }
        });

        // Listen to document saves (might fix LSP issues)
        vscode.workspace.onDidSaveTextDocument(() => {
            if (this._status === 'standby') {
                this.startPolling();
            }
        });
    }

    public get status(): LspStatus {
        return this._status;
    }

    private setStatus(status: LspStatus) {
        if (this._status !== status) {
            this._status = status;
            this._onStatusChange.fire(status);
        }
    }

    public startPolling() {
        if (this._status === 'loading' || this._status === 'ready') {
            return;
        }

        this.setStatus('loading');
        this.retryCount = 0;
        this.poll();
    }

    private async poll() {
        if (this._status !== 'loading') {
            return;
        }

        try {
            // Rotate probe characters
            const probeChar = this.PROBE_CHARS[this.probeIndex];
            this.probeIndex = (this.probeIndex + 1) % this.PROBE_CHARS.length;

            // Use executeWorkspaceSymbolProvider to check if LSP is alive
            // We don't need the full SymbolModel here, just the raw command
            const result = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider', 
                probeChar
            );

            const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
            const hasActiveEditor = !!vscode.window.activeTextEditor;

            // If we found symbols OR no workspace OR no editor open
            // (If no workspace/editor, we can't really use LSP, so we consider it "ready" in the sense that we stop polling)
            if ((result && result.length > 0) || (!hasWorkspace) || (!hasActiveEditor)) {
                this.setStatus('ready');
                return;
            } else {
                // Fail condition (empty result but workspace exists)
                this.handlePollFailure();
            }
        } catch (e) {
            // Error condition
            this.handlePollFailure();
        }
    }

    private handlePollFailure() {
        this.retryCount++;
        if (this.retryCount > this.MAX_RETRIES) {
            this.setStatus('timeout');
            // After timeout, we might want to go back to standby eventually?
            // Or stay in timeout until user action?
            // For now, let's stay in timeout.
            return;
        }

        this.pollingTimer = setTimeout(() => this.poll(), 3000);
    }

    public dispose() {
        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
        }
        this._onStatusChange.dispose();
    }
}
