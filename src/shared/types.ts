export interface SymbolItem {
    name: string;
    detail: string;
    kind: number; // vscode.SymbolKind
    range: any; // vscode.Range
    selectionRange: any; // vscode.Range
    children: SymbolItem[];
    uri?: string; // For workspace symbols
    containerName?: string;
}

export type SymbolMode = 'current' | 'project';

export interface WebviewState {
    mode: SymbolMode;
    query: string;
}

export type Message = 
    | { command: 'updateSymbols'; symbols: SymbolItem[]; totalCount?: number }
    | { command: 'highlight'; uri: string; range: any }
    | { command: 'setMode'; mode: SymbolMode }
    | { command: 'status'; status: 'ready' | 'loading' }
    | { command: 'setQuery'; query: string }
    | { command: 'refresh' }
    | { command: 'searchStart' };

export type WebviewMessage =
    | { command: 'search'; query: string }
    | { command: 'jump'; uri?: string; range: any }
    | { command: 'ready' }
    | { command: 'loadMore' };
