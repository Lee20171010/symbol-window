import { DatabaseSync } from 'node:sqlite';

export function runPoc() {
    console.log('[POC] Starting SQLite POC...');

    try {
        // 1. Initialize DB (In-memory for POC)
        // In a real scenario, this would be a file path
        const db = new DatabaseSync(':memory:');
        console.log('[POC] Database created successfully.');

        // 2. Enable WAL
        db.exec('PRAGMA journal_mode = WAL;');
        db.exec('PRAGMA synchronous = NORMAL;');
        console.log('[POC] WAL mode enabled.');

        // 3. Create Tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE,
                mtime INTEGER,
                indexed_at INTEGER
            );
        `);
        db.exec(`
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
        console.log('[POC] Tables created.');

        // 4. Insert Data (Transaction + Bulk)
        const insertFile = db.prepare('INSERT INTO files (path, mtime, indexed_at) VALUES (?, ?, ?)');
        const insertSymbol = db.prepare(`
            INSERT INTO symbols (
                file_id, name, detail, kind, 
                range_start_line, range_start_char, range_end_line, range_end_char,
                selection_range_start_line, selection_range_start_char, selection_range_end_line, selection_range_end_char,
                container_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Transaction
        db.exec('BEGIN');
        try {
            // Insert File
            // Note: In real implementation, use insertFile.get() if expecting a return value, but DatabaseSync.prepare().run() returns RunResult
            const fileResult = insertFile.run('c:/test/file.ts', Date.now(), Date.now());
            const fileId = fileResult.lastInsertRowid as number;
            console.log(`[POC] File inserted with ID: ${fileId}`);

            // Insert Symbols (Simulate Bulk)
            for (let i = 0; i < 10; i++) {
                insertSymbol.run(
                    fileId, 
                    `Symbol${i}`, 
                    'void', 
                    11, // Function
                    i, 0, i, 10,
                    i, 0, i, 5,
                    'TestClass'
                );
            }
            db.exec('COMMIT');
            console.log('[POC] Symbols inserted via transaction.');
        } catch (err) {
            db.exec('ROLLBACK');
            console.error('[POC] Transaction failed:', err);
            throw err;
        }

        // 5. Query Data
        const query = db.prepare(`
            SELECT * FROM symbols 
            WHERE name LIKE ? 
            ORDER BY name ASC 
            LIMIT 5 OFFSET 0
        `);
        const results = query.all('%Symbol%');
        console.log('[POC] Query Results:', results);

        db.close();
        console.log('[POC] Completed Successfully.');

    } catch (error) {
        console.error('[POC] Failed:', error);
    }
}

// Run the POC if executed directly
runPoc();
