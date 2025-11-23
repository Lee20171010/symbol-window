import * as vscode from 'vscode';
import { SymbolItem } from '../shared/types';
import * as cp from 'child_process';
import { rgPath } from '@vscode/ripgrep';

export class SymbolModel {
    
    public async getDocumentSymbols(uri: vscode.Uri): Promise<SymbolItem[]> {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider', 
            uri
        );
        
        if (!symbols) {
            return [];
        }

        return this.mapDocumentSymbols(symbols, uri);
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
            // If we fail to map symbols, we should probably return the raw symbols or empty?
            // If we return empty, checkReadiness loops forever.
            // Let's try to return empty but log it.
            return [];
        }
    }

    public async findSymbolsByTextSearch(query: string, keywords: string[], token?: vscode.CancellationToken): Promise<SymbolItem[]> {
        // Strategy: Use ripgrep to find files containing the LONGEST keyword (most specific).
        // Then filter the results in memory to ensure ALL keywords are present on the line.
        // This avoids complex regex lookarounds which might not be supported or slow.
        
        const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
        const primaryKeyword = sortedKeywords[0];
        const otherKeywords = sortedKeywords.slice(1);
        
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            return [];
        }

        const matchedUris = new Set<string>();

        try {
            // rg arguments:
            // --files-with-matches (-l): Only print filenames
            // --ignore-case (-i)
            // --fixed-strings (-F): Treat pattern as literal string (faster)
            // --glob: Follow .gitignore (default)
            
            const args = ['-i', '-F', '-l', primaryKeyword, '.'];
            
            const output = await new Promise<string>((resolve, reject) => {
                const child = cp.execFile(rgPath, args, { 
                    cwd: rootPath,
                    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
                }, (err, stdout, stderr) => {
                    if (err && (err as any).code !== 1) { // code 1 means no matches found, which is fine
                        reject(err);
                    } else {
                        resolve(stdout);
                    }
                });
                
                token?.onCancellationRequested(() => {
                    child.kill();
                });
            });

            const files = output.split('\n').filter(f => f.trim().length > 0);

            // Limit to top 50 files to avoid performance issues
            const topFiles = files.slice(0, 50);

            for (const file of topFiles) {
                const uri = vscode.Uri.file(vscode.Uri.joinPath(vscode.Uri.file(rootPath), file).fsPath);
                matchedUris.add(uri.toString());
            }

        } catch (e) {
            console.error('[SymbolModel] Ripgrep failed', e);
            return [];
        }

        if (matchedUris.size === 0) {
            return [];
        }

        const promises = Array.from(matchedUris).map(async (uriStr) => {
            const uri = vscode.Uri.parse(uriStr);
            try {
                const symbols = await this.getDocumentSymbols(uri);
                // We still need to filter symbols because rg only checked for the primary keyword
                // and it checked the whole file, not necessarily the symbol definition line.
                const filtered = this.filterSymbols(symbols, keywords);
                return filtered;
            } catch (e) {
                console.error(`[SymbolModel] Error getting symbols for ${uriStr}`, e);
                return [];
            }
        });

        const results = await Promise.all(promises);
        return results.flat();
    }

    private filterSymbols(symbols: SymbolItem[], keywords: string[]): SymbolItem[] {
        const lowerKeywords = keywords.map(k => k.toLowerCase());
        const matches: SymbolItem[] = [];

        const traverse = (items: SymbolItem[]) => {
            for (const item of items) {
                const name = item.name.toLowerCase();
                const detail = (item.detail || '').toLowerCase();
                
                const isMatch = lowerKeywords.every(k => name.includes(k) || detail.includes(k));
                
                if (isMatch) {
                    matches.push(item);
                }
                
                if (item.children && item.children.length > 0) {
                    traverse(item.children);
                }
            }
        };

        traverse(symbols);
        return matches;
    }
    
    // Fix recursion bug in previous block and apply same logic
    private mapDocumentSymbolsRecursive(symbols: vscode.DocumentSymbol[], cleanCStyle: boolean, moveSignature: boolean, uri: vscode.Uri): SymbolItem[] {
        return symbols.map(s => {
            let finalName = s.name;
            let finalDetail = s.detail || '';

            // Order matters: We want Signature first, then Type info in detail.
            // But we process them sequentially.
            // If we process CStyle first, detail = "struct".
            // Then Signature, detail = "struct (int a)". -> This is wrong order for display if we want Signature first.
            // User wants: Name (Signature) Type
            // So detail should be: "(int a)  struct"
            
            let typeSuffix = '';
            let signatureSuffix = '';

            if (cleanCStyle) {
                const { name, type } = parseCStyleType(finalName);
                if (type) {
                    finalName = name;
                    typeSuffix = type;
                }
            }

            if (moveSignature) {
                const { name, signature } = parseSignature(finalName);
                if (signature) {
                    finalName = name;
                    signatureSuffix = signature;
                }
            }

            // Construct final detail: OriginalDetail + Signature + Type
            // But we need to be careful about existing detail.
            
            const parts: string[] = [];
            if (signatureSuffix) {
                parts.push(signatureSuffix);
            }
            if (typeSuffix) {
                if (!finalDetail.toLowerCase().includes(typeSuffix)) {
                    parts.push(typeSuffix);
                }
            }
            if (finalDetail) {
                parts.push(finalDetail);
            }
            
            finalDetail = parts.join('  ');

            return {
                name: finalName,
                detail: finalDetail,
                kind: s.kind,
                range: s.range,
                selectionRange: s.selectionRange,
                children: this.mapDocumentSymbolsRecursive(s.children, cleanCStyle, moveSignature, uri),
                uri: uri.toString()
            };

        });
    }

    private mapDocumentSymbols(symbols: vscode.DocumentSymbol[], uri: vscode.Uri): SymbolItem[] {
        const config = vscode.workspace.getConfiguration('symbolWindow');
        const cleanCStyle = config.get<boolean>('cleanCStyleTypes', true);
        const moveSignature = config.get<boolean>('moveSignatureToDetail', true);
        return this.mapDocumentSymbolsRecursive(symbols, cleanCStyle, moveSignature, uri);
    }

    private mapWorkspaceSymbols(symbols: vscode.SymbolInformation[]): SymbolItem[] {
        const config = vscode.workspace.getConfiguration('symbolWindow');
        const cleanCStyle = config.get<boolean>('cleanCStyleTypes', true);
        const moveSignature = config.get<boolean>('moveSignatureToDetail', true);

        return symbols.map(s => {
            let finalName = s.name;
            let finalDetail = s.containerName || '';

            let typeSuffix = '';
            let signatureSuffix = '';

            if (cleanCStyle) {
                const { name, type } = parseCStyleType(finalName);
                if (type) {
                    finalName = name;
                    typeSuffix = type;
                }
            }

            if (moveSignature) {
                const { name, signature } = parseSignature(finalName);
                if (signature) {
                    finalName = name;
                    signatureSuffix = signature;
                }
            }

            const parts: string[] = [];
            if (signatureSuffix) {
                parts.push(signatureSuffix);
            }
            if (typeSuffix) {
                if (!finalDetail.toLowerCase().includes(typeSuffix)) {
                    parts.push(typeSuffix);
                }
            }
            if (finalDetail) {
                parts.push(finalDetail);
            }
            
            finalDetail = parts.join('  ');

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
