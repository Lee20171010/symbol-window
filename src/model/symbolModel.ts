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
        return symbols.map(s => {
            const { name, type } = this.parseName(s.name);
            let detail = s.detail;
            // Append type to detail if found and not already present
            if (type && !detail.toLowerCase().includes(type)) {
                detail = detail ? `${detail}  ${type}` : type;
            }

            return {
                name: name,
                detail: detail,
                kind: s.kind,
                range: s.range,
                selectionRange: s.selectionRange,
                children: this.mapDocumentSymbols(s.children)
            };
        });
    }

    private mapWorkspaceSymbols(symbols: vscode.SymbolInformation[]): SymbolItem[] {
        return symbols.map(s => {
            const { name, type } = this.parseName(s.name);
            let detail = s.containerName;
            // Append type to detail (containerName)
            if (type) {
                detail = detail ? `${detail}  ${type}` : type;
            }

            return {
                name: name,
                detail: detail, // Use container name + type as detail
                kind: s.kind,
                range: s.location.range,
                selectionRange: s.location.range, // SymbolInformation doesn't have selectionRange
                children: [], // Workspace symbols are flat
                uri: s.location.uri.toString(),
                containerName: s.containerName
            };
        });
    }

    private parseName(name: string): { name: string, type: string } {
        const regex = /\s*\((typedef|struct|enum|union|class|interface|macro|declaration)\)$/i;
        const match = name.match(regex);
        if (match) {
            return { 
                name: name.replace(regex, ''), 
                type: match[1].toLowerCase() 
            };
        }
        return { name, type: '' };
    }
}
