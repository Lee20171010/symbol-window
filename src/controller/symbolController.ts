import * as vscode from 'vscode';
import { SymbolModel } from '../model/symbolModel';
import { SymbolWebviewProvider } from '../view/SymbolWebviewProvider';
import { SymbolMode, SymbolItem } from '../shared/types';

export class SymbolController {
    private model: SymbolModel;
    private provider?: SymbolWebviewProvider;
    private context: vscode.ExtensionContext;
    private currentMode: SymbolMode = 'current';
    private debounceTimer: NodeJS.Timeout | undefined;
    private currentSearchId: number = 0;
    private searchCts: vscode.CancellationTokenSource | undefined;
    private lastSearchKeyword: string = '';
    private lastSearchResults: SymbolItem[] = [];
    
    // Caching
    private searchCache: Map<string, SymbolItem[]> = new Map();
    private cacheTimeout: NodeJS.Timeout | undefined;
    private readonly CACHE_DURATION = 120000; // 2 minutes

    // Pagination
    private allSearchResults: SymbolItem[] = [];
    private loadedCount: number = 0;
    private readonly BATCH_SIZE = 100;
    
    private readiness: 'standby' | 'loading' | 'ready' = 'standby';
    private retryCount: number = 0;
    private readonly MAX_RETRIES = 20; // 20 * 3s = 60s
    private probeIndex: number = 0;
    private readonly PROBE_CHARS = ['', 'e', 'a', 'i', 'o', 'u', 's', 't', 'r', 'n']; // Common letters

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.model = new SymbolModel();
        
        // Restore state
        this.currentMode = this.context.workspaceState.get<SymbolMode>('symbolWindow.mode', 'current');

        // Listen to active editor changes
        vscode.window.onDidChangeActiveTextEditor(editor => {
            // Current Mode: Always try to update immediately, independent of workspace readiness
            if (this.currentMode === 'current') {
                if (editor) {
                    this.updateCurrentSymbols(editor.document.uri).catch(e => {
                        console.error('[SymbolWindow] updateCurrentSymbols failed', e);
                    });
                } else {
                    this.provider?.postMessage({ command: 'updateSymbols', symbols: [] });
                }
            }

            // Workspace Readiness Logic
            if (this.readiness === 'standby') {
                // Trigger polling if we have an editor (signal that user is working)
                if (editor) {
                    this.startPolling();
                }
            } else if (this.readiness === 'ready') {
                // Ensure UI knows we are ready (in case of reload)
                this.provider?.postMessage({ command: 'status', status: 'ready' });
            }
        }, null, context.subscriptions);

        // Listen to document changes (re-parse symbols)
        vscode.workspace.onDidSaveTextDocument(async (doc) => {
            // 1. Clear Project Cache (Always)
            this.searchCache.clear();

            // 2. Current Mode: Update immediately
            if (this.currentMode === 'current') {
                this.updateCurrentSymbols(doc.uri);
            }

            // 3. Workspace Readiness: If standby, try polling again (maybe saving fixed LSP?)
            if (this.readiness === 'standby') {
                this.startPolling();
            }
        }, null, context.subscriptions);
        
        // Listen to selection changes for sync
        vscode.window.onDidChangeTextEditorSelection(e => {
            if (this.currentMode === 'current' && this.provider) {
                // Sync logic to be implemented
            }
        }, null, context.subscriptions);
    }

    public setProvider(provider: SymbolWebviewProvider) {
        this.provider = provider;
    }

    public async refresh() {
        // Clear cache on explicit refresh
        this.searchCache.clear();

        // Sync mode to webview to ensure consistency
        this.provider?.postMessage({ command: 'setMode', mode: this.currentMode });

        // If standby, try polling again (Manual Retry)
        if (this.readiness === 'standby') {
            this.startPolling();
        } else {
             this.provider?.postMessage({ command: 'status', status: this.readiness });
        }

        if (this.currentMode === 'current') {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await this.updateCurrentSymbols(editor.document.uri);
            } else {
                // No active editor, clear symbols
                this.provider?.postMessage({ command: 'updateSymbols', symbols: [] });
                this.provider?.postMessage({ command: 'status', status: 'ready' });
            }
            return;
        }

        // Project Mode Logic
        if (this.readiness === 'loading') {
            return;
        }
        
        // Project mode refresh: Ask webview to re-send search query
        this.provider?.postMessage({ command: 'refresh' });
    }

    public toggleMode() {
        this.currentMode = this.currentMode === 'current' ? 'project' : 'current';
        this.context.workspaceState.update('symbolWindow.mode', this.currentMode);
        if (this.provider) {
            this.provider.postMessage({ command: 'setMode', mode: this.currentMode });
        }
        
        // If ready, refresh. If standby, maybe poll?
        if (this.readiness === 'ready') {
            this.refresh();
        } else if (this.readiness === 'standby') {
            this.startPolling();
        }
    }

    public async startPolling() {
        if (this.readiness === 'loading' || this.readiness === 'ready') {
            return;
        }
        
        this.readiness = 'loading';
        this.retryCount = 0;
        this.provider?.postMessage({ command: 'status', status: 'loading' });
        
        this.poll();
    }

    private async poll() {
        if (this.readiness !== 'loading') {
            return; // Guard
        }

        try {
            // Rotate probe characters
            const probeChar = this.PROBE_CHARS[this.probeIndex];
            this.probeIndex = (this.probeIndex + 1) % this.PROBE_CHARS.length;

            const result = await this.model.getWorkspaceSymbols(probeChar);
            
            const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
            const hasActiveEditor = !!vscode.window.activeTextEditor;

            // If we are in Current Mode and there is no active editor, we are "ready" (empty state).
            if (this.currentMode === 'current' && !hasActiveEditor) {
                // We set readiness to 'standby' so that when an editor IS opened, 
                // onDidChangeActiveTextEditor will trigger startPolling() again.
                // We tell the UI we are 'ready' just to stop the spinner.
                this.readiness = 'standby';
                this.provider?.postMessage({ command: 'status', status: 'ready' });
                this.provider?.postMessage({ command: 'updateSymbols', symbols: [] });
                return;
            }

            if (result.length > 0 || (!hasWorkspace) || (!hasActiveEditor)) {
                // If we found symbols OR no workspace OR no editor open
                this.readiness = 'ready';
                this.provider?.postMessage({ command: 'status', status: 'ready' });
                
                // Trigger refresh to update UI (Current: re-fetch symbols, Project: re-run search)
                this.refresh();
                return; // Stop recursion
            } else {
                // Fail condition
                this.retryCount++;
                if (this.retryCount > this.MAX_RETRIES) {
                    this.readiness = 'standby'; // Back to standby (timeout)
                    if (this.currentMode === 'project') {
                        this.provider?.postMessage({ command: 'status', status: 'timeout' });
                    }
                    return;
                }
                
                // Retry after a delay
                setTimeout(() => this.poll(), 3000);
            }
        } catch (e) {
            // Fail condition
            this.retryCount++;
            if (this.retryCount > this.MAX_RETRIES) {
                this.readiness = 'standby'; // Back to standby (timeout)
                if (this.currentMode === 'project') {
                    this.provider?.postMessage({ command: 'status', status: 'timeout' });
                }
                return;
            }
            setTimeout(() => this.poll(), 3000);
        }
    }

    // Removed checkReadiness method as it is replaced by startPolling/poll
    public async handleSearch(query: string) {
        if (this.currentMode === 'project') {
            // If not ready, don't search, just ensure UI is in loading state
            if (this.readiness !== 'ready') {
                this.provider?.postMessage({ command: 'status', status: 'loading' });
                return;
            }

            // Cancel any ongoing search immediately when user types
            if (this.searchCts) {
                this.searchCts.cancel();
                this.searchCts.dispose();
                this.searchCts = undefined;
            }

            // Debounce
            if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
            
            const searchId = ++this.currentSearchId;

            this.debounceTimer = setTimeout(async () => {
                if (searchId !== this.currentSearchId) { return; }

                if (!query) {
                    this.provider?.postMessage({ command: 'updateSymbols', symbols: [] });
                    return;
                }
                
                const keywords = query.trim().split(/\s+/).filter(k => k.length > 0);
                
                this.provider?.postMessage({ command: 'searchStart' });

                if (keywords.length === 0) {
                     this.provider?.postMessage({ command: 'updateSymbols', symbols: [] });
                     return;
                }

                // --- Caching Logic Start ---
                
                // 1. Prune cache: Remove keys not in current query
                for (const key of this.searchCache.keys()) {
                    if (!keywords.includes(key)) {
                        this.searchCache.delete(key);
                    }
                }

                // 2. Reset Timeout
                if (this.cacheTimeout) { clearTimeout(this.cacheTimeout); }
                this.cacheTimeout = setTimeout(() => {
                    this.searchCache.clear();
                }, this.CACHE_DURATION);

                // 3. Identify missing keywords
                const missingKeywords = keywords.filter(k => !this.searchCache.has(k));

                // --- Caching Logic End ---

                this.searchCts = new vscode.CancellationTokenSource();
                const token = this.searchCts.token;

                let allSymbols: SymbolItem[] = [];

                try {
                    // Fetch missing keywords
                    if (missingKeywords.length > 0) {
                        const searchPromises = missingKeywords.slice(0, 3).map(async (keyword) => {
                            const results = await this.model.getWorkspaceSymbols(keyword, token);
                            return { keyword, results };
                        });

                        const newResults = await Promise.all(searchPromises);

                        if (searchId !== this.currentSearchId || token.isCancellationRequested) { 
                            return; 
                        }

                        // Update cache
                        newResults.forEach(({ keyword, results }) => {
                            this.searchCache.set(keyword, results);
                        });
                    }

                    // Collect results from cache for ALL keywords
                    const symbolMap = new Map<string, SymbolItem>();
                    
                    keywords.forEach(k => {
                        const cached = this.searchCache.get(k);
                        if (cached) {
                            cached.forEach(symbol => {
                                const key = `${symbol.name}|${symbol.detail}|${symbol.range.start.line}:${symbol.range.start.character}`;
                                if (!symbolMap.has(key)) {
                                    symbolMap.set(key, symbol);
                                }
                            });
                        }
                    });

                    allSymbols = Array.from(symbolMap.values());

                    // Client-side Filtering: Ensure result matches ALL keywords
                    if (keywords.length > 1) {
                        const lowerKeywords = keywords.map(k => k.toLowerCase());
                        allSymbols = allSymbols.filter(s => {
                            const name = s.name.toLowerCase();
                            const container = (s.detail || '').toLowerCase(); 
                            return lowerKeywords.every(k => name.includes(k) || container.includes(k));
                        });
                    }

                    this.allSearchResults = allSymbols;
                    this.loadedCount = this.BATCH_SIZE;

                    // Send first batch
                    const initialBatch = this.allSearchResults.slice(0, this.loadedCount);
                    this.provider?.postMessage({ 
                        command: 'updateSymbols', 
                        symbols: initialBatch,
                        totalCount: this.allSearchResults.length 
                    });

                } catch (error) {
                    if (error instanceof vscode.CancellationError) {
                        // ignore
                    } else {
                        console.error(`[SymbolWindow] SearchId ${searchId} failed`, error);
                        
                        // LSP Crash / Error Recovery
                        // If the search fails (e.g. LSP crash), revert to standby and try to recover
                        this.readiness = 'standby';
                        this.provider?.postMessage({ command: 'status', status: 'loading' }); // Show loading in UI
                        this.startPolling();
                    }
                    return;
                }
            }, 300);
        }
    }

    private async updateCurrentSymbols(uri: vscode.Uri) {
        const symbols = await this.model.getDocumentSymbols(uri);
        
        // Note: We do NOT force status to 'ready' here anymore.
        // We rely on the global readiness state (determined by workspace polling)
        // to tell the UI when to stop loading. This prevents "False Ready" states
        // where we get empty symbols because the LSP is initializing.
        
        this.provider?.postMessage({ command: 'updateSymbols', symbols });
    }

    public jumpTo(uriStr: string | undefined, range: any) {
        if (uriStr) {
            const uri = vscode.Uri.parse(uriStr);
            vscode.window.showTextDocument(uri, { selection: new vscode.Range(range[0].line, range[0].character, range[1].line, range[1].character) });
        } else {
            // Current document
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.revealRange(new vscode.Range(range[0].line, range[0].character, range[1].line, range[1].character));
                editor.selection = new vscode.Selection(range[0].line, range[0].character, range[1].line, range[1].character);
            }
        }
    }

    public loadMore() {
        if (this.currentMode === 'project' && this.loadedCount < this.allSearchResults.length) {
            this.loadedCount += this.BATCH_SIZE;
            const nextBatch = this.allSearchResults.slice(0, this.loadedCount);
            this.provider?.postMessage({ 
                command: 'updateSymbols', 
                symbols: nextBatch,
                totalCount: this.allSearchResults.length
            });
        }
    }
}
