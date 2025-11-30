import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { SymbolItem, SymbolMode, WebviewMessage, Message } from '../shared/types';
import SymbolTree from './features/symbol/SymbolTree';
import './style.css';

// Acquire VS Code API
const vscode = acquireVsCodeApi();

const App: React.FC = () => {
    const savedState = vscode.getState() || {};
    const [mode, setMode] = useState<SymbolMode>(savedState.mode || 'current');
    const [query, setQuery] = useState(savedState.query || '');
    const [symbols, setSymbols] = useState<SymbolItem[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [selectedSymbol, setSelectedSymbol] = useState<SymbolItem | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [backendStatus, setBackendStatus] = useState<'ready' | 'loading' | 'timeout'>(
        (savedState.mode || 'current') === 'project' ? 'loading' : 'ready'
    );
    const [enableDeepSearch, setEnableDeepSearch] = useState(false);
    const [scopePath, setScopePath] = useState<string | undefined>(undefined);
    const [includePattern, setIncludePattern] = useState(savedState.includePattern || '');
    const [showDetails, setShowDetails] = useState(savedState.showDetails || false);
    const [indexingProgress, setIndexingProgress] = useState<number | null>(null);
    const [isDatabaseMode, setIsDatabaseMode] = useState(savedState.isDatabaseMode || false);

    // Refs for accessing state in event listener
    const modeRef = useRef(mode);
    const queryRef = useRef(query);
    const includePatternRef = useRef(includePattern);

    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { queryRef.current = query; }, [query]);
    useEffect(() => { includePatternRef.current = includePattern; }, [includePattern]);

    // Save state
    useEffect(() => {
        vscode.setState({ mode, query, showDetails, includePattern, isDatabaseMode });
    }, [mode, query, showDetails, includePattern, isDatabaseMode]);

    // Handle messages from extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data as Message;
            switch (message.command) {
                case 'updateSymbols':
                    setSymbols(message.symbols);
                    if (message.totalCount !== undefined) {
                        setTotalCount(message.totalCount);
                    }
                    setIsSearching(false);
                    break;
                case 'searchStart':
                    setIsSearching(true);
                    break;
                case 'setMode':
                    // Only clear if mode actually changes
                    if (modeRef.current !== message.mode) {
                        setMode(message.mode);
                        setQuery(''); // Clear query on mode toggle
                        setSymbols([]);
                        // Don't auto-set status here, rely on backend 'status' message
                    }
                    break;
                case 'status':
                    setBackendStatus(message.status);
                    break;
                case 'setQuery':
                    setQuery(message.query);
                    break;
                case 'setSettings':
                    if (message.settings?.enableDeepSearch !== undefined) {
                        setEnableDeepSearch(message.settings.enableDeepSearch);
                    }
                    break;
                case 'refresh':
                    if (modeRef.current === 'project') {
                        // Re-trigger search with current query
                        vscode.postMessage({ command: 'search', query: queryRef.current, includePattern: includePatternRef.current });
                    }
                    break;
                case 'highlight':
                    // TODO: Implement highlight logic (expand tree and select)
                    break;
                case 'setScope':
                    setScopePath(message.scopePath);
                    break;
                case 'progress':
                    // @ts-ignore
                    setIndexingProgress(message.percent);
                    // @ts-ignore
                    if (message.percent >= 100) {
                        setIndexingProgress(null);
                    }
                    break;
                case 'setDatabaseMode':
                    // @ts-ignore
                    setIsDatabaseMode(message.enabled);
                    // If database mode is enabled, ensure we are in project mode if not already?
                    // No, user might be in current mode. But if in project mode, UI should update label.
                    if (message.enabled && modeRef.current === 'project') {
                        // Force re-render of title if needed, but React handles state change.
                    }
                    break;
                case 'appendSymbols':
                    // @ts-ignore
                    setSymbols(prev => [...prev, ...message.symbols]);
                    if (message.totalCount !== undefined) {
                        setTotalCount(message.totalCount);
                    }
                    setIsSearching(false);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        
        // Notify extension that we are ready
        vscode.postMessage({ command: 'ready' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Handle search input
    const handleSearch = (e: any) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        
        if (mode === 'project') {
            // Debounce is handled in backend or here? 
            // Spec says "Triggered only when the user types".
            // Let's send every keystroke and let backend debounce.
            vscode.postMessage({ command: 'search', query: newQuery, includePattern: includePatternRef.current });
        }
    };

    const handleIncludePatternChange = (e: any) => {
        const newPattern = e.target.value;
        setIncludePattern(newPattern);
        
        if (mode === 'project' && query) {
            vscode.postMessage({ command: 'search', query: query, includePattern: newPattern });
        }
    };

    const handleIncludePatternKeyDown = (e: any) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            setIncludePattern('');
            if (mode === 'project' && query) {
                vscode.postMessage({ command: 'search', query: query, includePattern: '' });
            }
        }
    };

    // Handle jump
    const handleJump = (symbol: SymbolItem) => {
        vscode.postMessage({ 
            command: 'jump', 
            uri: symbol.uri, 
            range: symbol.selectionRange 
        });
    };

    // Handle selection
    const handleSelect = (symbol: SymbolItem) => {
        setSelectedSymbol(symbol);
    };

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle navigation if not typing in an input (unless it's the search box and we want to support arrow keys there too)
            // Actually, usually we want arrow keys to work even if focused on search box to navigate the list.
            // But if the user is typing, ArrowLeft/Right should work in input. ArrowUp/Down usually navigate list.
            
            if (e.key === 'Escape') {
                // Clear search query if focused on search bar or generally if query exists
                if (queryRef.current.length > 0) {
                    e.preventDefault();
                    setQuery('');
                    vscode.postMessage({ command: 'search', query: '', includePattern: includePatternRef.current });
                }
                return;
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const selectedEl = document.querySelector('.symbol-item.selected');
                const allItems = Array.from(document.querySelectorAll('.symbol-item'));
                
                if (allItems.length === 0) return;

                let nextIndex = 0;
                if (selectedEl) {
                    const currentIndex = allItems.indexOf(selectedEl);
                    if (e.key === 'ArrowDown') {
                        nextIndex = Math.min(currentIndex + 1, allItems.length - 1);
                    } else {
                        nextIndex = Math.max(currentIndex - 1, 0);
                    }
                } else {
                    // If nothing selected, select first
                    nextIndex = 0;
                }

                const nextEl = allItems[nextIndex] as HTMLElement;
                if (nextEl) {
                    nextEl.click();
                    nextEl.scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'Enter') {
                if (selectedSymbol) {
                    handleJump(selectedSymbol);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedSymbol]);

    // Filter symbols for Current Mode (Client-side)
    const displaySymbols = React.useMemo(() => {
        if (mode === 'project') {
            return symbols; // Backend handles filtering
        }
        
        if (!query) return symbols;

        const lowerQuery = query.toLowerCase();
        const keywords = lowerQuery.split(/\s+/).filter((k: string) => k.length > 0);

        const filterTree = (items: SymbolItem[]): SymbolItem[] => {
            const result: SymbolItem[] = [];
            for (const item of items) {
                const match = keywords.every((k: string) => item.name.toLowerCase().includes(k));
                
                if (match) {
                    // If parent matches, include it and ALL its original children (no filtering on children)
                    // This allows users to expand the result and see members
                    // We don't force expand here, so user sees the match but not necessarily all children immediately
                    result.push({
                        ...item,
                        autoExpand: false
                    });
                } else {
                    // If parent doesn't match, check children
                    const filteredChildren = item.children ? filterTree(item.children) : [];
                    
                    if (filteredChildren.length > 0) {
                        result.push({
                            ...item,
                            children: filteredChildren,
                            autoExpand: true // Force expand because a child matched
                        });
                    }
                }
            }
            return result;
        };

        return filterTree(symbols);
    }, [symbols, query, mode]);

    // Auto-load more if content doesn't fill container
    useEffect(() => {
        if (mode === 'project' && symbols.length > 0 && symbols.length < totalCount) {
            const container = document.querySelector('.tree-container');
            if (container && container.scrollHeight <= container.clientHeight) {
                vscode.postMessage({ command: 'loadMore' });
            }
        }
    }, [symbols, mode, totalCount]);

    // Handle scroll for infinite loading
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (mode === 'project') {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            // If scrolled to bottom (within 20px)
            if (scrollTop + clientHeight >= scrollHeight - 20) {
                vscode.postMessage({ command: 'loadMore' });
            }
        }
    };

    return (
        <div className={`container mode-${mode} ${indexingProgress !== null ? 'has-progress' : ''}`}>
            {indexingProgress !== null && (
                <div className="indexing-progress-container">
                    <div className="indexing-label">
                        <span className="codicon codicon-sync codicon-modifier-spin"></span>
                        <span>Indexing Symbols... {indexingProgress}%</span>
                    </div>
                    <div className="indexing-progress">
                        {/* eslint-disable-next-line react/forbid-dom-props */}
                        <div className="indexing-progress-bar" style={{ width: `${indexingProgress}%` }} />
                    </div>
                </div>
            )}
            <div className="search-container">
                <div className="mode-indicator">
                    {mode === 'current' ? 'Current Document' : (isDatabaseMode ? 'Project Workspace (Database)' : 'Project Workspace')}
                </div>
                {backendStatus === 'loading' && (
                    <div className="status-warning">
                        <span className="codicon codicon-loading codicon-modifier-spin"></span>
                        {mode === 'project' && query ? 'Searching...' : 'Waiting for symbol provider...'}
                        {mode === 'project' && query && (
                            <span 
                                className="codicon codicon-close cancel-button" 
                                title="Cancel Search"
                                onClick={() => vscode.postMessage({ command: 'cancel' })}
                            ></span>
                        )}
                    </div>
                )}
                {backendStatus === 'timeout' && (
                    <div className="status-error">
                        <span className="codicon codicon-warning"></span>
                        Symbol provider not ready. Open a file to retry.
                    </div>
                )}
                <VSCodeTextField 
                    placeholder={mode === 'current' ? "Filter symbols..." : "Search workspace..."}
                    value={query}
                    onInput={handleSearch}
                    style={{ width: '100%' }}
                    disabled={backendStatus === 'loading' || backendStatus === 'timeout'}
                >
                    <span slot="start" className="codicon codicon-search"></span>
                    {mode === 'project' && enableDeepSearch && !isDatabaseMode && (
                        <span 
                            slot="end" 
                            className={`codicon codicon-kebab-vertical ${showDetails ? 'active' : ''}`}
                            onClick={() => setShowDetails(!showDetails)}
                            title="Toggle Search Details(DeepSearch)"
                        ></span>
                    )}
                </VSCodeTextField>
                
                {mode === 'project' && enableDeepSearch && !isDatabaseMode && showDetails && (
                    <div className="search-details">
                        <div className="scope-control">
                            <span className="label">Scope:</span>
                            <span className="scope-path" title={scopePath || 'Workspace Root'}>
                                {scopePath ? scopePath.split(/[\\/]/).pop() : 'Workspace Root'}
                            </span>
                            <span 
                                className="codicon codicon-folder-opened action-icon" 
                                title="Select Folder"
                                onClick={() => vscode.postMessage({ command: 'selectScope' })}
                            ></span>
                            {scopePath && (
                                <span 
                                    className="codicon codicon-clear-all action-icon" 
                                    title="Clear Scope"
                                    onClick={() => vscode.postMessage({ command: 'clearScope' })}
                                ></span>
                            )}
                        </div>
                        <div className="include-pattern-container">
                            <span className="label">files to include</span>
                            <VSCodeTextField 
                                placeholder="e.g. *.ts, src/**/include"
                                value={includePattern}
                                onInput={handleIncludePatternChange}
                                onKeyDown={handleIncludePatternKeyDown}
                                className="include-pattern-input"
                            >
                                <span slot="start" className="codicon codicon-files"></span>
                            </VSCodeTextField>
                        </div>
                    </div>
                )}
            </div>
            <div className="tree-container" onScroll={handleScroll}>
                {isSearching && <div className="loading-indicator">Searching...</div>}
                {!isSearching && displaySymbols.length === 0 && query.length > 0 && (
                    <div className="no-results">No results found</div>
                )}
                <SymbolTree 
                    symbols={displaySymbols} 
                    onJump={handleJump}
                    onSelect={handleSelect}
                    selectedSymbol={selectedSymbol}
                    defaultExpanded={mode === 'current' ? !!query : false}
                />
            </div>
        </div>
    );
};

export default App;
