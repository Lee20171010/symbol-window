export interface SymbolItem {
    name: string;
    detail: string;
    kind: number; // vscode.SymbolKind
    range: any; // vscode.Range
    selectionRange: any; // vscode.Range
    children: SymbolItem[];
    uri?: string; // For workspace symbols
    containerName?: string;
    autoExpand?: boolean;
    isDeepSearch?: boolean;
}

export type SymbolMode = 'current' | 'project';

export interface WebviewState {
    mode: SymbolMode;
    query: string;
    showDetails?: boolean;
    includePattern?: string;
}

export type Message = 
    | { command: 'updateSymbols'; symbols: SymbolItem[]; totalCount?: number }
    | { command: 'highlight'; uri: string; range: any }
    | { command: 'setMode'; mode: SymbolMode }
    | { command: 'status'; status: 'ready' | 'loading' | 'timeout' }
    | { command: 'setQuery'; query: string }
    | { command: 'refresh' }
    | { command: 'searchStart' }
    | { command: 'setSettings'; settings: { forceDeepSearch?: boolean; enableDeepSearch?: boolean } }
    | { command: 'setScope'; scopePath?: string };

export type WebviewMessage =
    | { command: 'search'; query: string; includePattern?: string }
    | { command: 'jump'; uri?: string; range: any }
    | { command: 'ready' }
    | { command: 'loadMore' }
    | { command: 'deepSearch' }
    | { command: 'cancel' }
    | { command: 'selectScope' }
    | { command: 'clearScope' };
