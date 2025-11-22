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


    
    // Fix recursion bug in previous block and apply same logic
    private mapDocumentSymbolsRecursive(symbols: vscode.DocumentSymbol[], cleanCStyle: boolean, moveSignature: boolean): SymbolItem[] {
        return symbols.map(s => {
            let finalName = s.name;
            let finalDetail = s.detail;

            if (cleanCStyle) {
                const { name, type } = parseCStyleType(finalName);
                if (type) {
                    finalName = name;
                    if (!finalDetail.toLowerCase().includes(type)) {
                        finalDetail = finalDetail ? `${finalDetail}  ${type}` : type;
                    }
                }
            }

            if (moveSignature) {
                const { name, signature } = parseSignature(finalName);
                if (signature) {
                    finalName = name;
                    finalDetail = finalDetail ? `${finalDetail} ${signature}` : signature;
                }
            }

            return {
                name: finalName,
                detail: finalDetail,
                kind: s.kind,
                range: s.range,
                selectionRange: s.selectionRange,
                children: this.mapDocumentSymbolsRecursive(s.children, cleanCStyle, moveSignature)
            };
        });
    }

    private mapDocumentSymbols(symbols: vscode.DocumentSymbol[]): SymbolItem[] {
        const config = vscode.workspace.getConfiguration('symbolWindow');
        const cleanCStyle = config.get<boolean>('cleanCStyleTypes', true);
        const moveSignature = config.get<boolean>('moveSignatureToDetail', true);
        return this.mapDocumentSymbolsRecursive(symbols, cleanCStyle, moveSignature);
    }

    private mapWorkspaceSymbols(symbols: vscode.SymbolInformation[]): SymbolItem[] {
        const config = vscode.workspace.getConfiguration('symbolWindow');
        const cleanCStyle = config.get<boolean>('cleanCStyleTypes', true);
        const moveSignature = config.get<boolean>('moveSignatureToDetail', true);

        return symbols.map(s => {
            let finalName = s.name;
            let finalDetail = s.containerName;

            if (cleanCStyle) {
                const { name, type } = parseCStyleType(finalName);
                if (type) {
                    finalName = name;
                    finalDetail = finalDetail ? `${finalDetail}  ${type}` : type;
                }
            }

            if (moveSignature) {
                const { name, signature } = parseSignature(finalName);
                if (signature) {
                    finalName = name;
                    finalDetail = finalDetail ? `${finalDetail} ${signature}` : signature;
                }
            }

            return {
                name: finalName,
                detail: finalDetail,
                kind: s.kind,
                range: s.location.range,
                selectionRange: s.location.range,
                children: [],
                uri: s.location.uri.toString(),
                containerName: s.containerName
            };
        });
    }

}

export function parseCStyleType(name: string): { name: string, type: string } {
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

export function parseSignature(name: string): { name: string, signature: string } {
    // Match anything starting with '(' at the end of the string, 
    // but be careful not to match simple types if they were not caught by parseCStyleType.
    // We assume a signature contains at least one comma or space inside parens, or is empty ().
    // Regex: \s*(\(.*\))$
    
    const regex = /\s*(\(.*\))$/;
    const match = name.match(regex);
    
    if (match) {
        return {
            name: name.replace(regex, ''),
            signature: match[1]
        };
    }
    return { name, signature: '' };
}
