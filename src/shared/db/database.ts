import * as fs from 'fs';
import * as path from 'path';
import { SymbolKind } from 'vscode';

let DatabaseSync: any;
try {
    // @ts-ignore
    DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
    console.warn('node:sqlite not available');
}

export interface FileRecord {
    id: number;
    path: string;
    mtime: number;
    indexed_at: number;
}

export interface SymbolRecord {
    id: number;
    file_id: number;
    name: string;
    detail: string;
    kind: number;
    range_start_line: number;
    range_start_char: number;
    range_end_line: number;
    range_end_char: number;
    selection_range_start_line: number;
    selection_range_start_char: number;
    selection_range_end_line: number;
    selection_range_end_char: number;
    container_name: string;
    // Joined fields
    file_path?: string;
}

export class SymbolDatabase {
    private db: any | null = null;
    private insertFileStmt: any;
    private insertSymbolStmt: any;
    private deleteFileStmt: any;

    constructor(private storagePath: string) {}

    private readonly SCHEMA_VERSION = 1;

    public init() {
        // Ensure directory exists
        const dbDir = path.dirname(this.storagePath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.db = new DatabaseSync(this.storagePath);
        
        // Enable WAL for performance
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA synchronous = NORMAL;');

        // Check Schema Version
        const versionResult = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
        const currentVersion = versionResult.user_version;

        if (currentVersion !== this.SCHEMA_VERSION) {
            console.log(`[SymbolDatabase] Schema version mismatch (DB: ${currentVersion}, App: ${this.SCHEMA_VERSION}). Rebuilding DB.`);
            this.db.close();
            if (fs.existsSync(this.storagePath)) {
                fs.unlinkSync(this.storagePath);
                // Also delete WAL/SHM files if they exist
                if (fs.existsSync(this.storagePath + '-wal')) {
                    fs.unlinkSync(this.storagePath + '-wal');
                }
                if (fs.existsSync(this.storagePath + '-shm')) {
                    fs.unlinkSync(this.storagePath + '-shm');
                }
            }
            this.db = new DatabaseSync(this.storagePath);
            this.db.exec('PRAGMA journal_mode = WAL;');
            this.db.exec('PRAGMA synchronous = NORMAL;');
            this.db.exec(`PRAGMA user_version = ${this.SCHEMA_VERSION}`);
        }

        this.createTables();
        this.prepareStatements();
    }

    private createTables() {
        if (!this.db) { throw new Error('DB not initialized'); }

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE,
                mtime INTEGER,
                indexed_at INTEGER
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS symbols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER,
                name TEXT,
                detail TEXT,
                kind INTEGER,
                range_start_line INTEGER,
                range_start_char INTEGER,
                range_end_line INTEGER,
                range_end_char INTEGER,
                selection_range_start_line INTEGER,
                selection_range_start_char INTEGER,
                selection_range_end_line INTEGER,
                selection_range_end_char INTEGER,
                container_name TEXT,
                FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
            );
        `);

        // Indexes for faster search
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_symbols_container ON symbols(container_name);');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);');
    }

    private prepareStatements() {
        if (!this.db) { throw new Error('DB not initialized'); }

        this.insertFileStmt = this.db.prepare(`
            INSERT INTO files (path, mtime, indexed_at) VALUES (?, ?, ?)
        `);

        this.deleteFileStmt = this.db.prepare('DELETE FROM files WHERE path = ?');
        
        // Symbol insertion is dynamic due to bulk insert, so we don't prepare a single statement here
        // but we can prepare a single-row insert if needed. 
        // Actually, for bulk insert, we'll construct the query dynamically or use a loop with a prepared statement inside a transaction.
        // Using a prepared statement in a loop inside a transaction is usually fast enough and safer.
        this.insertSymbolStmt = this.db.prepare(`
            INSERT INTO symbols (
                file_id, name, detail, kind, 
                range_start_line, range_start_char, range_end_line, range_end_char,
                selection_range_start_line, selection_range_start_char, selection_range_end_line, selection_range_end_char,
                container_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
    }

    public close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    public deleteFile(filePath: string) {
        if (!this.db) { throw new Error('DB not initialized'); }
        this.deleteFileStmt.run(filePath);
    }

    public insertFileAndSymbols(filePath: string, mtime: number, symbols: Omit<SymbolRecord, 'id' | 'file_id'>[]) {
        if (!this.db) { throw new Error('DB not initialized'); }

        this.db.exec('BEGIN');
        try {
            // 1. Delete existing file (cascades to symbols)
            this.deleteFileStmt.run(filePath);

            // 2. Insert File
            const result = this.insertFileStmt.run(filePath, mtime, Date.now());
            const fileId = result.lastInsertRowid as number;

            // 3. Insert Symbols
            const chunkSize = 100;
            for (let i = 0; i < symbols.length; i += chunkSize) {
                const chunk = symbols.slice(i, i + chunkSize);
                for (const sym of chunk) {
                    this.insertSymbolStmt.run(
                        fileId,
                        sym.name,
                        sym.detail,
                        sym.kind,
                        sym.range_start_line,
                        sym.range_start_char,
                        sym.range_end_line,
                        sym.range_end_char,
                        sym.selection_range_start_line,
                        sym.selection_range_start_char,
                        sym.selection_range_end_line,
                        sym.selection_range_end_char,
                        sym.container_name
                    );
                }
            }
            this.db.exec('COMMIT');
        } catch (err) {
            this.db.exec('ROLLBACK');
            throw err;
        }
    }

    public getFiles(): Map<string, FileRecord> {
        if (!this.db) { throw new Error('DB not initialized'); }
        
        const stmt = this.db.prepare('SELECT * FROM files');
        const rows = stmt.all() as FileRecord[];
        
        const map = new Map<string, FileRecord>();
        for (const row of rows) {
            map.set(row.path, row);
        }
        return map;
    }

    public search(query: string, limit: number, offset: number): SymbolRecord[] {
        if (!this.db) { throw new Error('DB not initialized'); }

        // Split query into tokens
        const tokens = query.split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) {
            return [];
        }

        // Build dynamic SQL
        // WHERE (name LIKE ? OR container_name LIKE ?) AND ...
        const conditions: string[] = [];
        const params: any[] = [];

        for (const token of tokens) {
            const likePattern = `%${token}%`;
            conditions.push('(name LIKE ? OR container_name LIKE ?)');
            params.push(likePattern, likePattern);
        }

        const sql = `
            SELECT s.*, f.path as file_path 
            FROM symbols s
            JOIN files f ON s.file_id = f.id
            WHERE ${conditions.join(' AND ')}
            ORDER BY s.name ASC, f.path ASC
            LIMIT ? OFFSET ?
        `;

        params.push(limit, offset);

        const stmt = this.db.prepare(sql);
        return stmt.all(...params) as SymbolRecord[];
    }

    public getFileCount(): number {
        if (!this.db) { return 0; }
        const result = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
        return result.count;
    }

    public clear() {
        if (!this.db) { return; }
        this.db.exec('DELETE FROM symbols;');
        this.db.exec('DELETE FROM files;');
        // Vacuum to reclaim space? Maybe overkill for now.
    }
}
