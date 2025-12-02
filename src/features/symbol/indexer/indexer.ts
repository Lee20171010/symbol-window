import * as vscode from 'vscode';
import { SymbolDatabase, SymbolRecord } from '../../../shared/db/database';
import * as cp from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import * as path from 'path';
import * as fs from 'fs';

export class SymbolIndexer {
    private queue: vscode.Uri[] = [];
    private queueSet = new Set<string>();
    private isProcessing = false;
    private isPaused = true; // Default to paused (wait for LSP ready)
    private processedCount = 0;
    private totalToProcess = 0;

    private rootIgnored = new Set<string>(['.git', '.DS_Store', '.vscode']);
    private anywhereIgnored = new Set<string>([]);

    constructor(
        private context: vscode.ExtensionContext, 
        private db: SymbolDatabase,
        private onProgress?: (percent: number) => void,
        private onIndexingComplete?: () => void,
        private onRebuildFullStart?: () => void
    ) {
    }

    public async rebuildIndexFull() {
        console.log('[Indexer] Rebuilding index (Full)...');
        
        // Notify start of full rebuild (set ready=false)
        if (this.onRebuildFullStart) {
            this.onRebuildFullStart();
        }

        this.isPaused = true; // Pause current processing
        this.queue = []; // Clear queue
        this.queueSet.clear();
        this.processedCount = 0;
        this.totalToProcess = 0;
        
        // Clear DB
        this.db.clear();
        
        // Re-scan all files
        const files = await this.findAllFiles();
        this.totalToProcess = files.length;
        this.queue = files;
        this.queueSet = new Set(files.map(u => u.toString()));
        
        this.isPaused = false;
        this.processQueue();
    }

    public async rebuildIndexIncremental() {
        console.log('[Indexer] Rebuilding index (Incremental)...');
        // Just trigger syncIndex, which does the diffing
        await this.syncIndex();
    }

    private async findAllFiles(): Promise<vscode.Uri[]> {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            return [];
        }

        const sharedConfig = vscode.workspace.getConfiguration('shared');
        const includeFiles = sharedConfig.get<string>('includeFiles', '');
        // Default is now handled by package.json settings
        const excludeFiles = sharedConfig.get<string>('excludeFiles', '');

        return new Promise((resolve, reject) => {
            // Use rg --files to list all files respecting .gitignore
            const args = [
                '--files'
            ];

            // Add user defined include/exclude patterns
            if (includeFiles) {
                const patterns = includeFiles.split(',').map(p => p.trim()).filter(p => p.length > 0);
                patterns.forEach(p => args.push('--glob', p));
            }

            if (excludeFiles) {
                const patterns = excludeFiles.split(',').map(p => p.trim()).filter(p => p.length > 0);
                patterns.forEach(p => args.push('--glob', `!${p}`));
            }

            const child = cp.spawn(rgPath, args, {
                cwd: rootPath
            });

            let output = '';
            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    const lines = output.split('\n').filter(line => line.trim().length > 0);
                    const uris = lines.map(line => {
                        // Normalize path: rg returns relative paths or absolute depending on context, 
                        // but usually relative to cwd if '.' is not passed, or just paths.
                        // Let's ensure we construct absolute URIs.
                        // Actually rg --files output depends. 
                        // If we run in cwd, it returns relative paths.
                        const absolutePath = path.join(rootPath, line.trim());
                        return vscode.Uri.file(absolutePath);
                    });
                    resolve(uris);
                } else {
                    console.error(`[Indexer] rg --files failed with code ${code}`);
                    resolve([]); // Fallback to empty or maybe throw?
                }
            });

            child.on('error', (err) => {
                console.error('[Indexer] Failed to spawn rg:', err);
                resolve([]);
            });
        });
    }

    public addToQueue(uri: vscode.Uri) {
        // Avoid duplicates
        const key = uri.toString();
        if (!this.queueSet.has(key)) {
            this.queueSet.add(key);
            this.queue.push(uri);
            this.totalToProcess++;
            this.updateStatusBar();
            this.processQueue();
        }
    }

    public startWatching() {
        this.loadGitignore();

        // Watch .gitignore changes to update fast path filters
        const gitignoreWatcher = vscode.workspace.createFileSystemWatcher('**/.gitignore');
        gitignoreWatcher.onDidChange(() => this.loadGitignore());
        gitignoreWatcher.onDidCreate(() => this.loadGitignore());
        gitignoreWatcher.onDidDelete(() => this.loadGitignore());
        this.context.subscriptions.push(gitignoreWatcher);

        // 1. Handle File Creation, Deletion, and Changes
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.context.subscriptions.push(watcher);
        
        watcher.onDidCreate(uri => {
            if (this.shouldIgnore(uri)) { return; }
            console.log('[Indexer] File created:', uri.fsPath);
            this.addToQueue(uri);
        });

        watcher.onDidChange(uri => {
            if (this.shouldIgnore(uri)) { return; }
            console.log('[Indexer] File changed:', uri.fsPath);
            this.addToQueue(uri);
        });
        
        watcher.onDidDelete(uri => {
            if (this.shouldIgnore(uri)) { return; }
            console.log('[Indexer] File deleted:', uri.fsPath);
            this.db.deleteFile(uri.fsPath);
        });
    }

    private async processQueue() {
        if (this.isPaused) { return; }
        if (this.isProcessing) { return; }
        this.isProcessing = true;

        while (this.queue.length > 0) {
            // Check if paused
            if (this.isPaused) {
                break;
            }

            // Get batch size from settings
            const sharedConfig = vscode.workspace.getConfiguration('shared');
            let batchSize = sharedConfig.get<number>('indexingBatchSize', 15);

            // Limit batch size to avoid LSP crash
            const MAX_BATCH_SIZE = 200;
            if (batchSize <= 0 || batchSize > MAX_BATCH_SIZE) {
                batchSize = MAX_BATCH_SIZE;
            }

            const batch = this.queue.splice(0, batchSize);
            // Remove from set
            for (const u of batch) {
                this.queueSet.delete(u.toString());
            }

            // Filter out files that are ignored by .gitignore (using rg)
            const validBatch = await this.filterExcludedFiles(batch);

            if (validBatch.length > 0) {
                await Promise.all(validBatch.map(uri => this.indexFile(uri)));
                this.processedCount += validBatch.length; // Count valid ones
            }
            
            // We also count ignored ones as "processed" for the progress bar
            const ignoredCount = batch.length - validBatch.length;
            if (ignoredCount > 0) {
                this.processedCount += ignoredCount;
            }

            this.updateStatusBar();

            // Small delay to yield to UI
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.isProcessing = false;
        if (this.queue.length === 0) {
            console.log('[Indexer] Indexing complete.');
            // Notify completion
            if (this.onIndexingComplete) {
                this.onIndexingComplete();
            }
            // Also notify progress 100% to clear UI
            if (this.onProgress) {
                this.onProgress(100);
            }
        } else {
            console.log('[Indexer] Indexing paused.');
        }
    }

    private async indexFile(uri: vscode.Uri) {
        try {
            // 0. Check existence and get mtime first
            // This prevents ENOENT errors if the file was deleted before we could process it
            let stat: vscode.FileStat;
            try {
                stat = await vscode.workspace.fs.stat(uri);
            } catch (error) {
                // File likely deleted or not accessible, skip silently
                return;
            }

            // 1. Get Symbols
            // We use executeDocumentSymbolProvider. 
            // Note: This might open the document in the background.
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            // Even if symbols is empty, we should record the file in DB to track mtime
            // and avoid re-indexing it on every sync.
            const flatSymbols = (symbols && symbols.length > 0) ? this.flattenSymbols(symbols) : [];

            // 3. Insert into DB
            const mtime = stat.mtime;

            // Use transaction for atomic update
            this.db.insertFileAndSymbols(uri.fsPath, mtime, flatSymbols);

        } catch (error) {
            console.error(`[Indexer] Failed to index ${uri.fsPath}:`, error);
        }
    }

    private flattenSymbols(symbols: vscode.DocumentSymbol[], parentName: string = ''): Omit<SymbolRecord, 'id' | 'file_id'>[] {
        let result: Omit<SymbolRecord, 'id' | 'file_id'>[] = [];
        
        for (const sym of symbols) {
            const containerName = parentName;
            const fullName = parentName ? `${parentName}.${sym.name}` : sym.name;
            
            result.push({
                name: sym.name,
                detail: sym.detail,
                kind: sym.kind,
                range_start_line: sym.range.start.line,
                range_start_char: sym.range.start.character,
                range_end_line: sym.range.end.line,
                range_end_char: sym.range.end.character,
                selection_range_start_line: sym.selectionRange.start.line,
                selection_range_start_char: sym.selectionRange.start.character,
                selection_range_end_line: sym.selectionRange.end.line,
                selection_range_end_char: sym.selectionRange.end.character,
                container_name: containerName
            });

            if (sym.children && sym.children.length > 0) {
                result = result.concat(this.flattenSymbols(sym.children, fullName));
            }
        }
        return result;
    }

    private updateStatusBar() {
        const percent = Math.floor((this.processedCount / this.totalToProcess) * 100);
        if (this.onProgress) {
            this.onProgress(percent);
        }
    }

    public async syncIndex() {
        console.log('[Indexer] Starting Warm Start Sync...');
        
        // 1. Get all files in workspace using Ripgrep
        const workspaceFiles = await this.findAllFiles();
        const workspaceFileMap = new Map(workspaceFiles.map(f => [f.fsPath, f]));

        // 2. Get all files in DB
        const dbFiles = this.db.getFiles();

        // 3. Compare
        const toIndex: vscode.Uri[] = [];
        
        // Check for new or modified files
        const filesToCheck: { path: string, uri: vscode.Uri, dbMtime: number }[] = [];

        for (const [path, uri] of workspaceFileMap) {
            const dbRecord = dbFiles.get(path);
            if (!dbRecord) {
                // New file
                toIndex.push(uri);
            } else {
                filesToCheck.push({ path, uri, dbMtime: dbRecord.mtime });
            }
        }

        // Process filesToCheck in batches to check mtime
        const BATCH_SIZE = 100;
        for (let i = 0; i < filesToCheck.length; i += BATCH_SIZE) {
            const batch = filesToCheck.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (item) => {
                try {
                    const stat = await vscode.workspace.fs.stat(item.uri);
                    // Allow 1s difference due to precision
                    if (stat.mtime > item.dbMtime + 1000) {
                        toIndex.push(item.uri);
                    }
                } catch (e) {
                    // File might be gone or inaccessible
                }
            }));
        }

        // Check for deleted files
        for (const [path, record] of dbFiles) {
            if (!workspaceFileMap.has(path)) {
                this.db.deleteFile(path);
            }
        }

        if (toIndex.length > 0) {
            console.log(`[Indexer] Found ${toIndex.length} files to update.`);
            this.totalToProcess += toIndex.length;
            
            for (const uri of toIndex) {
                const key = uri.toString();
                if (!this.queueSet.has(key)) {
                    this.queueSet.add(key);
                    this.queue.push(uri);
                }
            }

            this.updateStatusBar();
            this.processQueue();
        } else {
            console.log('[Indexer] Index is up to date.');
            if (this.onIndexingComplete) {
                this.onIndexingComplete();
            }
            // Also notify progress 100% to clear UI
            if (this.onProgress) {
                this.onProgress(100);
            }
        }
    }

    public pause() {
        this.isPaused = true;
        this.isProcessing = false;
        console.log('[Indexer] Paused.');
    }

    public resume() {
        if (this.isPaused) {
            console.log('[Indexer] Resumed.');
            this.isPaused = false;
            this.processQueue();
        }
    }

    private shouldIgnore(uri: vscode.Uri): boolean {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) { return false; }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        const segments = relativePath.split(path.sep);
        
        // Check root ignored (e.g. /dist)
        if (segments.length > 0 && this.rootIgnored.has(segments[0])) {
            return true;
        }

        // Check anywhere ignored (e.g. node_modules)
        return segments.some(s => this.anywhereIgnored.has(s));
    }

    private async filterExcludedFiles(uris: vscode.Uri[]): Promise<vscode.Uri[]> {
        if (uris.length === 0) { return []; }

        // 1. Check files.exclude using findFiles
        // We check each file individually to respect files.exclude settings
        const notExcludedBySettings = await Promise.all(uris.map(async uri => {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) { 
                return uri; // File outside workspace, assume valid
            }

            const relative = vscode.workspace.asRelativePath(uri, false);
            if (relative === uri.fsPath) { return uri; } 

            // findFiles respects files.exclude (but NOT .gitignore by default)
            // We pass the relative path as include pattern. If it returns the file, it's NOT excluded.
            const found = await vscode.workspace.findFiles(relative, null, 1);
            return found.length > 0 ? uri : null;
        }));
        
        const candidates = notExcludedBySettings.filter(u => u !== null) as vscode.Uri[];
        if (candidates.length === 0) { return []; }

        // 2. Check .gitignore using git check-ignore
        // This is the most robust way to handle complex .gitignore rules (negations, nested, etc.)
        return this.checkGitIgnore(candidates);
    }

    private async checkGitIgnore(uris: vscode.Uri[]): Promise<vscode.Uri[]> {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) { return uris; }

        try {
            // Convert to relative paths for git check-ignore
            const relativePaths = uris.map(u => vscode.workspace.asRelativePath(u, false));
            
            return new Promise((resolve) => {
                // git check-ignore -v -n <paths>
                // We use --stdin is safer for many files, but here we have small batch (10).
                // We use simple `git check-ignore <paths>` which outputs the paths that ARE ignored.
                
                const args = ['check-ignore', ...relativePaths];
                const child = cp.spawn('git', args, { cwd: rootPath });
                
                let output = '';
                child.stdout.on('data', d => output += d.toString());
                
                child.on('close', (code) => {
                    // If code is 0, some files were ignored.
                    // If code is 1, none were ignored.
                    // Output contains the list of ignored files (one per line).
                    
                    const ignoredFiles = new Set(output.split('\n').map(l => l.trim()).filter(l => l.length > 0));
                    
                    // Filter out ignored files
                    const valid = uris.filter(u => {
                        const rel = vscode.workspace.asRelativePath(u, false);
                        // git check-ignore output might use different separators on Windows?
                        // Usually it matches input format.
                        // Let's normalize to be safe.
                        return !ignoredFiles.has(rel) && !ignoredFiles.has(rel.replace(/\\/g, '/'));
                    });
                    resolve(valid);
                });
                
                child.on('error', () => {
                    // git not found or error, assume all valid (fail open)
                    resolve(uris);
                });
            });
        } catch (e) {
            return uris;
        }
    }

    private loadGitignore() {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) { return; }
        
        // Always reset to defaults first. 
        // This ensures that if .gitignore is deleted, we revert to the safe defaults.
        this.rootIgnored = new Set(['.git', '.DS_Store', '.vscode']);
        this.anywhereIgnored = new Set([]);

        const gitignorePath = path.join(rootPath, '.gitignore');
        if (!fs.existsSync(gitignorePath)) { return; }

        try {
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            const lines = content.split('\n');
            
            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#')) { continue; }
                
                // Handle simple cases for fast path
                // Skip globs (*, ?, []) as they are too complex for simple string matching
                // We let the robust filterExcludedFiles (using vscode.findFiles) handle those.
                if (/[*?\[\]]/.test(line)) { continue; }

                const isRoot = line.startsWith('/');
                if (isRoot) { line = line.substring(1); }
                
                if (line.endsWith('/')) { line = line.substring(0, line.length - 1); }

                // If it still contains slash, it's a nested path e.g. "foo/bar"
                // We skip these for fast path optimization to keep it simple
                if (line.includes('/')) { continue; }

                if (isRoot) {
                    this.rootIgnored.add(line);
                } else {
                    this.anywhereIgnored.add(line);
                }
            }
            console.log('[Indexer] Loaded .gitignore patterns for fast path filtering.');
        } catch (e) {
            console.error('[Indexer] Failed to load .gitignore:', e);
        }
    }
}
