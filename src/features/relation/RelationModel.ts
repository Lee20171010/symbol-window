import * as vscode from 'vscode';
import * as path from 'path';
import { performDeepSearch } from '../../shared/utils/search';
import { DatabaseManager } from '../../shared/services/DatabaseManager';
import { SymbolRecord } from '../../shared/db/database';
import { parserRegistry } from '../symbol/parsing/ParserRegistry';

export interface DeepCall {
    from: {
        name: string;
        detail: string;
        kind: number;
        uri: vscode.Uri;
        range: vscode.Range;
        selectionRange: vscode.Range;
    };
    fromRanges: vscode.Range[];
    to: {
        name: string;
        detail: string;
        kind: number;
        uri: vscode.Uri;
        range: vscode.Range;
        selectionRange: vscode.Range;
    };
}

export class RelationModel {
    private dbManager: DatabaseManager;

    constructor(dbManager: DatabaseManager) {
        this.dbManager = dbManager;
    }
    
    public async prepareCallHierarchy(uri: vscode.Uri, position: vscode.Position): Promise<vscode.CallHierarchyItem | undefined> {
        try {
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy',
                uri,
                position
            );
            if (items && items.length > 0) {
                return items[0];
            }
        } catch (e) {
            console.warn('[Source Window] prepareCallHierarchy failed', e);
        }
        return undefined;
    }

    public async findSymbolAtLocation(uri: vscode.Uri, position: vscode.Position): Promise<vscode.CallHierarchyItem | undefined> {
        const db = this.dbManager.getDb();
        
        // 1. Try to identify word under cursor
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const wordRange = doc.getWordRangeAtPosition(position);
            if (wordRange) {
                const word = doc.getText(wordRange);
                
                // A. Try to find definition in DB
                if (db) {
                    const symbols = db.findSymbolsByNames([word]);
                    if (symbols && symbols.length > 0) {
                        // Prefer symbol in the same file if multiple exist (heuristic)
                        const bestMatch = symbols.find(s => s.file_path === uri.fsPath) || symbols[0];
                        
                        return new vscode.CallHierarchyItem(
                            bestMatch.kind,
                            bestMatch.name,
                            '',
                            vscode.Uri.file(bestMatch.file_path!),
                            new vscode.Range(
                                bestMatch.range_start_line, bestMatch.range_start_char,
                                bestMatch.range_end_line, bestMatch.range_end_char
                            ),
                            new vscode.Range(
                                bestMatch.selection_range_start_line, bestMatch.selection_range_start_char,
                                bestMatch.selection_range_end_line, bestMatch.selection_range_end_char
                            )
                        );
                    }
                }

                // B. If not in DB, return Dummy Item (Deep Search fallback)
                // This ensures we search for the "word" instead of the "enclosing function"
                return new vscode.CallHierarchyItem(
                    vscode.SymbolKind.Function,
                    word,
                    '', // Empty detail to avoid "Deep Search" label confusion
                    uri,
                    wordRange,
                    wordRange
                );
            }
        } catch (e) {
            console.warn('[Source Window] findSymbolAtLocation word resolution failed', e);
        }

        // 2. Fallback to Enclosing Symbol (Container) - REMOVED
        // User prefers strict matching: only update if cursor is on a word/symbol.
        // If we are on whitespace, return undefined so the view doesn't change unexpectedly.
        
        return undefined;
    }

    public async getIncomingCalls(item: vscode.CallHierarchyItem): Promise<vscode.CallHierarchyIncomingCall[]> {
        // Hybrid Mode: Merge LSP and DB results
        const lspCalls = await this.getLspIncomingCalls(item);
        // TODO: Implement DB calls
        // const dbCalls = await this.getDbIncomingCalls(item);
        
        return lspCalls;
    }

    private async getLspIncomingCalls(item: vscode.CallHierarchyItem): Promise<vscode.CallHierarchyIncomingCall[]> {
        try {
            const calls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                'vscode.provideIncomingCalls',
                item
            );
            return calls || [];
        } catch (e: any) {
            if (e?.message?.includes('invalid item')) {
                // This is expected for manually constructed items (Deep Search results)
                // console.debug('[Source Window] getIncomingCalls skipped for manual item');
                console.warn('[Source Window] getIncomingCalls failed1', e);
            } else {
                console.warn('[Source Window] getIncomingCalls failed', e);
            }
            return [];
        }
    }

    public async getOutgoingCalls(item: vscode.CallHierarchyItem): Promise<vscode.CallHierarchyOutgoingCall[]> {
        // Hybrid Mode: Merge LSP and DB results
        const lspCalls = await this.getLspOutgoingCalls(item);
        // TODO: Implement DB calls
        
        return lspCalls;
    }

    private async getLspOutgoingCalls(item: vscode.CallHierarchyItem): Promise<vscode.CallHierarchyOutgoingCall[]> {
        try {
            const calls = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                'vscode.provideOutgoingCalls',
                item
            );
            return calls || [];
        } catch (e: any) {
            if (e?.message?.includes('invalid item')) {
                // This is expected for manually constructed items
                console.warn('[Source Window] getOutgoingCalls1 failed', e);
            } else {
                console.warn('[Source Window] getOutgoingCalls failed', e);
            }
            return [];
        }
    }

    public async getDefinition(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location | undefined> {
        try {
            const locations = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
                'vscode.executeDefinitionProvider',
                uri,
                position
            );
            
            if (!locations || locations.length === 0) {
                return undefined;
            }

            const loc = locations[0];
            if ('targetUri' in loc) {
                // LocationLink
                return new vscode.Location(loc.targetUri, loc.targetRange);
            } else {
                // Location
                return loc;
            }
        } catch (e) {
            console.warn('[Source Window] getDefinition failed', e);
            return undefined;
        }
    }

    public async getReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
        try {
            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                uri,
                position
            );
            return locations || [];
        } catch (e) {
            console.warn('[Source Window] getReferences failed', e);
            return [];
        }
    }

    public async deepSearch(query: string, rootUri: vscode.Uri): Promise<vscode.Location[]> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(rootUri);
        if (!workspaceFolder) {
            return [];
        }

        return performDeepSearch({
            query,
            cwd: workspaceFolder.uri.fsPath,
            isCaseSensitive: false,
            isWordMatch: true
        });
    }

    private getAllowedSymbolKinds(): Set<vscode.SymbolKind> {
        const config = vscode.workspace.getConfiguration();
        const allowedKinds = config.get<string[]>('relationWindow.deepSearch.allowedSymbolKinds', ['Function', 'Method', 'Constructor', 'Constant']);
        
        const kinds = new Set<vscode.SymbolKind>();
        for (const kindStr of allowedKinds) {
            const kind = vscode.SymbolKind[kindStr as keyof typeof vscode.SymbolKind];
            if (kind !== undefined) {
                kinds.add(kind);
            }
        }
        return kinds;
    }

    public async getDeepIncomingCalls(item: vscode.CallHierarchyItem, token?: vscode.CancellationToken, filter?: number[]): Promise<DeepCall[]> {
        const db = this.dbManager.getDb();
        if (!db) { return []; }

        let searchName = item.name;

        // 1. Extract clean word from document (User Intent)
        try {
            const doc = await vscode.workspace.openTextDocument(item.uri);
            const text = doc.getText(item.selectionRange);
            const match = text.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
            if (match) {
                searchName = match[0];
            }
        } catch (e) {
            // Fallback to item.name
        }

        // 2. Try to upgrade to DB Enclosing Symbol (if it matches)
        const enclosing = db.findEnclosingSymbol(item.uri.fsPath, item.selectionRange.start.line);
        
        // Use C-style parser for cleaning heuristics
        const parser = parserRegistry.getParser('c', 'c-style');

        if (enclosing) {
             // Name Check: Enclosing must contain the extracted word
             const { name: cleanEnclosingName } = parser.parse(enclosing.name, '', vscode.SymbolKind.Function);
             const nameMatch = cleanEnclosingName.includes(searchName);

             if (nameMatch) {
                 searchName = enclosing.name;
             }
        }
        
        // Strategy 2: Heuristic cleaning (mainly for C/C++)
        // if DB lookup failed (e.g. file not indexed yet).
        const { name: cleaned } = parser.parse(searchName, '', vscode.SymbolKind.Function);
        searchName = cleaned;

        // 2. Ripgrep
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(item.uri);
        if (!workspaceFolder) { return []; }

        const startTime = Date.now();
        const locations = await performDeepSearch({
            query: searchName,
            cwd: workspaceFolder.uri.fsPath,
            isCaseSensitive: false,
            isWordMatch: true
        });

        if (token?.isCancellationRequested) { return []; }

        // 3. Map to Enclosing Symbols (Optimized Batching)
        const calls: DeepCall[] = [];
        const processed = new Map<string, DeepCall>();
        const allowedKinds = filter ? new Set(filter) : this.getAllowedSymbolKinds();

        // Group locations by file path to minimize DB queries
        const fileGroups = new Map<string, vscode.Location[]>();
        for (const loc of locations) {
            const fsPath = loc.uri.fsPath;
            if (!fileGroups.has(fsPath)) {
                fileGroups.set(fsPath, []);
            }
            fileGroups.get(fsPath)!.push(loc);
        }

        let loopCount = 0;
        const entries = Array.from(fileGroups.entries());

        for (const [filePath, fileLocations] of entries) {
            if (token?.isCancellationRequested) { return []; }

            loopCount++;
            // Yield to event loop every 10 files to allow cancellation/UI updates
            if (loopCount % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            // Batch Query: Get all symbols for this file once
            const fileSymbols = db.getSymbolsForFile(filePath);
            if (fileSymbols.length === 0) { continue; }

            let locCount = 0;
            for (const loc of fileLocations) {
                locCount++;
                if (locCount % 50 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                const line = loc.range.start.line;
                
                // Find enclosing symbol in memory
                // Logic: smallest range that contains the line
                let enclosing: SymbolRecord | undefined;
                let minRangeSize = Number.MAX_SAFE_INTEGER;

                for (const sym of fileSymbols) {
                    if (sym.range_start_line <= line && sym.range_end_line >= line) {
                        const size = sym.range_end_line - sym.range_start_line;
                        if (size < minRangeSize) {
                            minRangeSize = size;
                            enclosing = sym;
                        }
                    }
                }

                if (enclosing) {
                    // Filter by kind
                    if (!allowedKinds.has(enclosing.kind)) {
                        continue;
                    }

                    const key = `${enclosing.file_path}:${enclosing.range_start_line}:${enclosing.name}`;
                    if (processed.has(key)) {
                        processed.get(key)!.fromRanges.push(loc.range);
                        continue;
                    }

                    const uri = vscode.Uri.file(enclosing.file_path!);
                    const detail = `${vscode.workspace.asRelativePath(uri)}:${enclosing.range_start_line + 1}`;

                    const newCall: DeepCall = {
                        from: {
                            name: enclosing.name,
                            detail: detail,
                            kind: enclosing.kind,
                            uri: vscode.Uri.file(enclosing.file_path!),
                            range: new vscode.Range(
                                enclosing.range_start_line,
                                enclosing.range_start_char,
                                enclosing.range_end_line,
                                enclosing.range_end_char
                            ),
                            selectionRange: new vscode.Range(
                                enclosing.selection_range_start_line,
                                enclosing.selection_range_start_char,
                                enclosing.selection_range_end_line,
                                enclosing.selection_range_end_char
                            )
                        },
                        fromRanges: [loc.range], // The call site
                        to: { // Dummy, not used for incoming
                            name: item.name,
                            detail: item.detail || '',
                            kind: item.kind,
                            uri: item.uri,
                            range: item.range,
                            selectionRange: item.selectionRange
                        }
                    };

                    processed.set(key, newCall);
                    calls.push(newCall);
                }
            }
        }
        return calls;
    }

    public async getDeepOutgoingCalls(item: vscode.CallHierarchyItem, token?: vscode.CancellationToken, filter?: number[]): Promise<DeepCall[]> {
        const db = this.dbManager.getDb();
        if (!db) { return []; }

        let doc: vscode.TextDocument;
        try {
            doc = await vscode.workspace.openTextDocument(item.uri);
        } catch (e) {
            return [];
        }

        // 2. Tokenize with location (Line-by-Line to avoid offset issues)
        const tokenMap = new Map<string, vscode.Range[]>();
        const regex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;

        const startLine = item.range.start.line;
        const endLine = item.range.end.line;

        let lineCount = 0;
        for (let i = startLine; i <= endLine; i++) {
            lineCount++;
            if (lineCount % 100 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            if (token?.isCancellationRequested) { return []; }
            const line = doc.lineAt(i);
            const lineText = line.text;
            
            // Calculate effective range for this line
            let textToSearch = lineText;
            let charOffset = 0; // The character index in 'lineText' where 'textToSearch' starts

            // If first line, start from range.start.character
            if (i === startLine) {
                charOffset = item.range.start.character;
                // If single line range
                if (i === endLine) {
                    textToSearch = lineText.substring(charOffset, item.range.end.character);
                } else {
                    textToSearch = lineText.substring(charOffset);
                }
            } else if (i === endLine) {
                // Last line (but not first), end at range.end.character
                textToSearch = lineText.substring(0, item.range.end.character);
                charOffset = 0;
            } else {
                // Middle lines, search whole line
                textToSearch = lineText;
                charOffset = 0;
            }

            let match;
            while ((match = regex.exec(textToSearch)) !== null) {
                const token = match[0];
                const startChar = charOffset + match.index;
                const endChar = startChar + token.length;
                const range = new vscode.Range(i, startChar, i, endChar);
                
                if (!tokenMap.has(token)) {
                    tokenMap.set(token, []);
                }
                tokenMap.get(token)!.push(range);
            }
        }

        const tokens = Array.from(tokenMap.keys());
        if (tokens.length === 0) {
            return [];
        }

        // 3. Query DB
        // Chunking to avoid too many params? findSymbolsByNames handles it? 
        // SQLite limit is usually 999.
        const chunkedTokens = [];
        for (let i = 0; i < tokens.length; i += 500) {
            chunkedTokens.push(tokens.slice(i, i + 500));
        }

        const calls: DeepCall[] = [];
        const allowedKinds = filter ? new Set(filter) : this.getAllowedSymbolKinds();
        
        let chunkCount = 0;
        for (const chunk of chunkedTokens) {
            if (token?.isCancellationRequested) { return []; }
            
            chunkCount++;
            // Yield occasionally for large files with many tokens
            if (chunkCount % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const symbols = db.findSymbolsByNames(chunk);
            
            for (const sym of symbols) {
                // Check for exact self-reference (same file, same range)
                // We use a loose check on file path and start line to avoid complex path normalization issues if possible,
                // but best is to compare fsPath.
                const symUri = vscode.Uri.file(sym.file_path!);
                if (sym.name === item.name && 
                    symUri.fsPath === item.uri.fsPath && 
                    sym.range_start_line === item.range.start.line) {
                    continue; 
                }

                // Filter by kind
                if (!allowedKinds.has(sym.kind)) {
                    continue;
                }

                // Find which token matched
                // Since we use prefix match in DB, sym.name might be "tst(int)" while token is "tst"
                // We need to extract the identifier from sym.name
                
                const match = sym.name.match(/^([a-zA-Z0-9_]+)/);
                const cleanName = match ? match[1] : sym.name;
                
                // Try exact match with clean name first
                let ranges = tokenMap.get(cleanName);
                
                if (!ranges) { continue; }

                const uri = vscode.Uri.file(sym.file_path!);
                const detail = `${vscode.workspace.asRelativePath(uri)}:${sym.range_start_line + 1}`;

                calls.push({
                    from: {
                        name: item.name,
                        detail: item.detail || '',
                        kind: item.kind,
                        uri: item.uri,
                        range: item.range,
                        selectionRange: item.selectionRange
                    },
                    fromRanges: ranges, // Correct call sites
                    to: {
                        name: sym.name,
                        detail: detail,
                        kind: sym.kind,
                        uri: vscode.Uri.file(sym.file_path!),
                        range: new vscode.Range(
                            sym.range_start_line,
                            sym.range_start_char,
                            sym.range_end_line,
                            sym.range_end_char
                        ),
                        selectionRange: new vscode.Range(
                            sym.selection_range_start_line,
                            sym.selection_range_start_char,
                            sym.selection_range_end_line,
                            sym.selection_range_end_char
                        )
                    }
                });
            }
        }
        return calls;
    }
}
