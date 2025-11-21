import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { SymbolItem, SymbolMode, WebviewMessage, Message } from '../shared/types';
import SymbolTree from './components/SymbolTree';
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
    const [backendStatus, setBackendStatus] = useState<'ready' | 'loading'>(
        (savedState.mode || 'current') === 'project' ? 'loading' : 'ready'
    );

    // Refs for accessing state in event listener
    const modeRef = useRef(mode);
    const queryRef = useRef(query);

    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { queryRef.current = query; }, [query]);

    // Save state
    useEffect(() => {
        vscode.setState({ mode, query });
    }, [mode, query]);

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
                case 'refresh':
                    if (modeRef.current === 'project') {
                        // Re-trigger search with current query
                        vscode.postMessage({ command: 'search', query: queryRef.current });
                    }
                    break;
                case 'highlight':
                    // TODO: Implement highlight logic (expand tree and select)
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
            vscode.postMessage({ command: 'search', query: newQuery });
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
                const filteredChildren = item.children ? filterTree(item.children) : [];
                
                if (match || filteredChildren.length > 0) {
                    result.push({
                        ...item,
                        children: filteredChildren
                    });
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
                console.log('Content smaller than container, loading more...');
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
        <div className={`container mode-${mode}`}>
            <div className="search-container">
                <div className="mode-indicator">
                    {mode === 'current' ? 'Current Document' : 'Project Workspace'}
                </div>
                {backendStatus === 'loading' && (
                    <div className="status-warning">
                        <span className="codicon codicon-loading codicon-modifier-spin"></span>
                        Waiting for symbol provider...
                    </div>
                )}
                <VSCodeTextField 
                    placeholder={mode === 'current' ? "Filter symbols..." : "Search workspace..."}
                    value={query}
                    onInput={handleSearch}
                    style={{ width: '100%' }}
                    disabled={backendStatus === 'loading'}
                >
                    <span slot="start" className="codicon codicon-search"></span>
                </VSCodeTextField>
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
                />
            </div>
        </div>
    );
};

export default App;
