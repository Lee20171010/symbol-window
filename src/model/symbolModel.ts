import * as vscode from 'vscode';
import { SymbolItem } from '../shared/types';

export class SymbolModel {
    
    public async getDocumentSymbols(uri: vscode.Uri): Promise<SymbolItem[]> {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider', 
            uri
        );
        
        if (!symbols) {
            return [];
        }

        return this.mapDocumentSymbols(symbols);
    }

    public async getWorkspaceSymbols(query: string, token?: vscode.CancellationToken): Promise<SymbolItem[]> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider', 
                query,
                token
            );

            if (!symbols) {
                return [];
            }

            return this.mapWorkspaceSymbols(symbols);
        } catch (e) {
            console.error(`[SymbolModel] Error fetching symbols:`, e);
            return [];
        }
    }

    private mapDocumentSymbols(symbols: vscode.DocumentSymbol[]): SymbolItem[] {
        return symbols.map(s => ({
            name: s.name,
            detail: s.detail,
            kind: s.kind,
            range: s.range,
            selectionRange: s.selectionRange,
            children: this.mapDocumentSymbols(s.children)
        }));
    }

    private mapWorkspaceSymbols(symbols: vscode.SymbolInformation[]): SymbolItem[] {
        return symbols.map(s => ({
            name: s.name,
            detail: s.containerName, // Use container name as detail for workspace symbols
            kind: s.kind,
            range: s.location.range,
            selectionRange: s.location.range, // SymbolInformation doesn't have selectionRange
            children: [], // Workspace symbols are flat
            uri: s.location.uri.toString(),
            containerName: s.containerName
        }));
    }
}
