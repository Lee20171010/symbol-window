
import * as vscode from 'vscode';

export interface ParsedSymbol {
    name: string;
    detail: string;
}

export interface SymbolParser {
    id: string;
    parse(name: string, detail: string, kind: vscode.SymbolKind): ParsedSymbol;
}
