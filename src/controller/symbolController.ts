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
    
    private isReady: boolean = false;
    private isFakeReady: boolean = false; // Track if we are ready just because no editor is open
    private probeIndex: number = 0;
    private readonly PROBE_CHARS = ['', 'e', 'a', 'i', 'o', 'u', 's', 't', 'r', 'n']; // Common letters

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.model = new SymbolModel();
        
        // Restore state
        this.currentMode = this.context.workspaceState.get<SymbolMode>('symbolWindow.mode', 'current');

        // Listen to active editor changes
        vscode.window.onDidChangeActiveTextEditor(editor => {
            // When user opens a file, C/C++ extension might start indexing.
            // We should check readiness again ONLY if we were not ready, or if we were "fake ready" (empty state).
            // This avoids flickering "Waiting..." on every tab switch when we are already fully ready.
            if (!this.isReady || this.isFakeReady) {
                this.checkReadiness();
            } else {
                // If we are already ready, ensure UI knows it.
                // This fixes the case where UI might be stuck in loading for some reason.
                this.provider?.postMessage({ command: 'status', status: 'ready' });
            }

            if (this.currentMode === 'current') {
                if (editor) {
                    // Force update even if isReady is true, because we switched file
                    this.updateCurrentSymbols(editor.document.uri).catch(e => {
                        console.error('[SymbolWindow] updateCurrentSymbols failed', e);
                    });
                } else {
                    // No active editor, clear symbols
                    this.provider?.postMessage({ command: 'updateSymbols', symbols: [] });
                }
            }
        }, null, context.subscriptions);

        // Listen to document changes (re-parse symbols)
        // User requested to only update on Save, not on every change.

        // Clear cache on file save to ensure freshness AND update current symbols
        vscode.workspace.onDidSaveTextDocument(async (doc) => {
            // 1. Clear Project Cache (Always)
            this.searchCache.clear();

            // 2. Re-check readiness
            // This will lock the UI (status: loading) for BOTH modes and poll until symbols are available.
            // Once ready, it will trigger refresh() to update the view.
            // Use a shorter interval (500ms) for save events as re-indexing should be fast.
            this.checkReadiness(500);
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

        // Send current status to ensure Webview is in sync.
        // This is critical because if the Webview reloads or connects late, it might have missed the initial status update.
        this.provider?.postMessage({ command: 'status', status: this.isReady ? 'ready' : 'loading' });

        // Always check readiness first if not ready
        if (!this.isReady) {
            this.checkReadiness();
            return;
        }

        if (this.currentMode === 'current') {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await this.updateCurrentSymbols(editor.document.uri);
            } else {
                // No active editor, clear symbols
                this.provider?.postMessage({ command: 'updateSymbols', symbols: [] });
            }
        } else {
            // Project mode refresh: Ask webview to re-send search query
            this.provider?.postMessage({ command: 'refresh' });
        }
    }

    public toggleMode() {
        this.currentMode = this.currentMode === 'current' ? 'project' : 'current';
        this.context.workspaceState.update('symbolWindow.mode', this.currentMode);
        if (this.provider) {
            this.provider.postMessage({ command: 'setMode', mode: this.currentMode });
        }
        
        // Don't call refresh here directly, let readiness check handle it if needed
        // or if already ready, refresh.
        if (this.isReady) {
            this.refresh();
        } else {
            this.checkReadiness();
        }
    }

    public async checkReadiness(interval: number = 3000) {
        // Probe to check if symbol provider is ready
        
        // Only set loading if we are not already ready.
        // If we are FakeReady, we treat it as "Optimistically Ready", so we DON'T show loading.
        // This prevents the UI from locking up ("Waiting...") when switching from an empty state to a file.
        if (!this.isReady) {
            this.provider?.postMessage({ command: 'status', status: 'loading' });
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
                this.isReady = true;
                this.isFakeReady = true;
                this.provider?.postMessage({ command: 'status', status: 'ready' });
                this.refresh();
                return;
            }

            if (result.length > 0 || (!hasWorkspace) || (!hasActiveEditor)) {
                // If we found symbols OR no workspace OR no editor open
                this.isReady = true;
                
                // If result > 0, it's real ready. If 0 but no editor/workspace, it's fake ready.
                this.isFakeReady = result.length === 0;

                this.provider?.postMessage({ command: 'status', status: 'ready' });
                
                // Trigger refresh to update UI (Current: re-fetch symbols, Project: re-run search)
                this.refresh();
                return; // Stop recursion
            } else {
                // If we were NOT ready, ensure we stay not ready and show loading.
                // If we WERE ready (FakeReady), we keep isReady=true to allow search, but we retry.
                if (!this.isReady) {
                    this.provider?.postMessage({ command: 'status', status: 'loading' });
                }
                
                // Retry after a delay
                setTimeout(() => this.checkReadiness(interval), interval);
            }
        } catch (e) {
            if (!this.isReady) {
                this.provider?.postMessage({ command: 'status', status: 'loading' });
            }
            setTimeout(() => this.checkReadiness(interval), interval);
        }
    }

    public async handleSearch(query: string) {
        if (this.currentMode === 'project') {
            // If not ready, don't search, just ensure UI is in loading state
            if (!this.isReady) {
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
                    }
                    return;
                }
            }, 300);
        }
    }

    private async updateCurrentSymbols(uri: vscode.Uri) {
        const symbols = await this.model.getDocumentSymbols(uri);
        
        // Ensure UI is unlocked when we successfully get symbols
        // This is a safety net in case the UI was stuck in loading state
        this.provider?.postMessage({ command: 'status', status: 'ready' });
        
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
