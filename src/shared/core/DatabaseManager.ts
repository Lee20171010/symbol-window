import * as vscode from 'vscode';
import { SymbolDatabase } from '../db/database';
import { SymbolIndexer } from '../../features/symbol/indexer/indexer';

export class DatabaseManager {
    private _db: SymbolDatabase | undefined;
    private _indexer: SymbolIndexer | undefined;
    private _isReady: boolean = false;
    
    private _onProgress = new vscode.EventEmitter<number>();
    public readonly onProgress = this._onProgress.event;

    private _onReadyChange = new vscode.EventEmitter<boolean>();
    public readonly onReadyChange = this._onReadyChange.event;

    constructor(private context: vscode.ExtensionContext) {
        this.init();
    }

    private init() {
        if (this.context.storageUri) {
            const dbPath = vscode.Uri.joinPath(this.context.storageUri, 'symbols.db').fsPath;
            console.log('[DatabaseManager] Database path:', dbPath);
            
            try {
                this._db = new SymbolDatabase(dbPath);
                this._db.init();
            } catch (e) {
                console.error('[DatabaseManager] Failed to initialize database:', e);
                this._db = undefined;
            }
        }

        const sharedConfig = vscode.workspace.getConfiguration('shared');
        const enableDatabaseMode = sharedConfig.get<boolean>('enableDatabaseMode', true);

        if (this._db && enableDatabaseMode) {
            try {
                this._indexer = new SymbolIndexer(
                    this.context,
                    this._db,
                    (percent) => this._onProgress.fire(percent),
                    () => this.setReady(true),
                    () => this.setReady(false)
                );
                
                this._indexer.startWatching();
                this._indexer.syncIndex();
                console.log('[DatabaseManager] Database initialized.');
            } catch (e) {
                console.error('[DatabaseManager] Failed to start indexer:', e);
                this._indexer = undefined;
            }
        }
    }

    private setReady(ready: boolean) {
        if (this._isReady !== ready) {
            this._isReady = ready;
            this._onReadyChange.fire(ready);
        }
    }

    public get db(): SymbolDatabase | undefined {
        return this._db;
    }

    public get indexer(): SymbolIndexer | undefined {
        return this._indexer;
    }

    public get isReady(): boolean {
        return this._isReady;
    }

    public pauseIndexing() {
        this._indexer?.pause();
    }

    public resumeIndexing() {
        this._indexer?.resume();
    }

    public dispose() {
        this._db?.close();
    }
}
