# Symbol & Relation Window Specification

## 1. Overview
**Name:** `symbol-relation-window`
**DisplayName:** Symbol & Relation Window
**Goal:** Provide a comprehensive "Source Insight"-like experience in VS Code, featuring a Symbol List for navigation and a Relation Window for call hierarchy analysis.
**Core Philosophy:** Fast, native look-and-feel, leveraging VS Code APIs to avoid custom parsing overhead where possible.

## 2. Marketplace Optimization
**Keywords:**
- `symbol`
- `outline`
- `navigation`
- `source insight`
- `structure`
- `call hierarchy`
- `references`
- `caller`
- `callee`
- `relation`
- `code map`

## 3. Architecture & Modules

### 3.1 Module Structure
The extension follows a modular architecture, separating business logic (Features) from infrastructure (Shared) and presentation (Webview).

```
src/
├── extension.ts                       // Entry point
├── features/                          // Feature Modules (MVC-like structure)
│   ├── symbol/                        // Symbol Window
│   │   ├── parsing/                   // Symbol Name Cleaning Strategies
│   │   └── indexer/                   // Background SQLite Indexer
│   ├── relation/                      // Relation Window (Call Hierarchy)
│   └── reference/                     // Reference Window
├── shared/                            // Infrastructure & Utilities
│   ├── core/                          // Singleton Services (LSP Client, DB Manager)
│   ├── db/                            // SQLite Access Layer
│   └── searchUtils.ts                 // Deep Search Engine (Ripgrep wrapper)
└── webview/                           // Frontend Application (React)
    ├── features/                      // UI Components per feature
    └── vscode-api.ts                  // VS Code Webview API wrapper
```

**Key Components:**
*   **Features (`src/features/*`)**: Each folder (symbol, relation) is self-contained, typically consisting of:
    *   `Controller`: Orchestrates events and updates.
    *   `Model`: Fetches data from LSP or Database.
    *   `WebviewProvider`: Manages the UI panel and IPC.
*   **Shared Core (`src/shared/core`)**: Manages expensive resources like the Language Server connection and SQLite database connection, shared across all features to save memory.
*   **Webview (`src/webview`)**: A single React application that renders different "Apps" (`SymbolApp`, `RelationApp`) based on the view context.

### 3.2 Data Flow
1.  **Init:** Extension activates -> Reads config -> Instantiates enabled Controllers (`SymbolController`, `RelationController`) -> Registers ViewProviders.
2.  **Update (Symbol):** User opens file -> `SymbolController` checks readiness -> fetches symbols -> Sends `updateSymbols` message to Webview.
3.  **Update (Relation):** User moves cursor -> `RelationController` debounces -> checks symbol validity -> fetches hierarchy -> Sends `updateRelation` message to Webview.
4.  **Search:** User types in SearchBar -> React filters locally (Current Mode) OR sends `search` message to Extension (Project Mode).
5.  **Navigation:** User double-clicks item -> Sends `jump` message to Extension -> Extension opens file & reveals range.

### 3.3 Resource Management & Layout
- **Container:** The main Activity Bar container is named **"Window"** to serve as a neutral parent for both views.
- **Independent Switches:**
    - `symbolWindow.enable`: Boolean. Controls the Symbol Window.
    - `relationWindow.enable`: Boolean. Controls the Relation Window.
- **Layout Logic:**
    - **Both Enabled:** Vertical Split. Symbol Window on Top, Relation Window on Bottom.
    - **Only Symbol Enabled:** Symbol Window takes full height. Relation Window is hidden.
    - **Only Relation Enabled:** Relation Window takes full height. Symbol Window is hidden.
    - **Both Disabled:** A special "Foolproof" view (`all-disabled-view`) is shown. It displays buttons to "Enable Symbol Window" and "Enable Relation Window" to guide the user back to a working state.
- **Lifecycle:**
    - When a module is disabled via settings, its ViewProvider must be disposed, and all associated event listeners (e.g., `onDidChangeTextEditorSelection`, `FileSystemWatcher`) must be removed to free up resources.
    - The UI View Container should remain, but the specific View should be hidden or show a "Disabled" message if possible.

### 3.4 Global Status Bar (Shared)
Since the Database is a shared resource, its status and controls are hosted in the VS Code Status Bar to avoid UI clutter in the side bar.
- **Location:** VS Code Status Bar (Bottom Right).
- **States:**
    -   **Standby/Ready:** `$(database) Symbols: Ready`
    -   **Indexing:** `$(sync~spin) Symbols: Indexing (45%)...`
    -   **Error:** `$(error) Symbols: Error`
- **Interaction:**
    -   **Click:** Opens a Quick Pick menu with shared commands:
        -   `Rebuild Index (Incremental)`: Triggers an incremental update based on file changes.
    -   **Note:** There is no manual "Switch Mode" in the menu. The extension automatically uses Database Mode if available. Users cannot manually revert to Normal Mode unless they disable `shared.enableDatabaseMode` in settings.
    -   **Full Rebuild:** To prevent accidental triggers, the "Full Rebuild" (Drop & Recreate DB) command is **only** available via the VS Code Command Palette (`symbol-window.rebuildIndexFull`).

## 4. Shared Feature: Database Indexing

### 4.1 Core Logic
1.  **Configuration:**
    -   `shared.enableDatabaseMode`: Master switch (Default: `true`).
    -   **If True:**
        -   Start indexing in the background.
        -   Use "Hybrid Transition Strategy": Use LSP + Deep Search (if enabled) until indexing is complete, then switch to Database Mode.
    -   **If False:**
        -   Do not start indexing.
        -   Permanently use LSP + Deep Search (if enabled).
    -   **Shared Resource:** This database is used by both the **Symbol Window** (for fast project-wide searching) and the **Relation Window** (for validating symbol existence before hierarchy lookups).
2.  **Data Source:** `vscode.executeDocumentSymbolProvider` (for every file).
3.  **Storage:** `node:sqlite` (Built-in Node.js module).
    -   **Feature Detection:** On extension activation, attempt to dynamically import `node:sqlite`.
    -   **Fallback:** If the import fails (e.g., older VS Code versions), **completely disable** the Indexing feature and revert to the standard "Project Mode" (LSP + Deep Search).
    -   **Versioning:** Store a schema version (e.g., `PRAGMA user_version`). On startup, check if the DB version matches the extension's expected version. If mismatch, **drop and rebuild** the entire database to ensure schema compatibility.
    -   **Self-Healing:** Wrap database operations in try-catch blocks. If a critical error (e.g., `SQLITE_CORRUPT`) is detected, automatically delete the database file and trigger a full rebuild.
    -   **Optimization:** Enable WAL mode (`PRAGMA journal_mode = WAL;`) and `PRAGMA synchronous = NORMAL;` for better concurrency.
    -   **Lifecycle:** Explicitly close the database connection (`db.close()`) in the extension's `deactivate` method to ensure WAL files are merged and resources are released.
4.  **Indexing Strategy:**
    -   **LSP Dependency:** The indexer **MUST** wait for the `SymbolController` to report `ready` state before processing the queue. If the LSP becomes unavailable, indexing pauses.
    -   **Initial Scan (Cold Start):**
        -   Iterate over all workspace folders (`vscode.workspace.workspaceFolders`).
        -   Run `rg --files` for each folder to build the initial file list.
    -   **Startup Sync (Warm Start):**
        -   Load the list of indexed files from SQLite.
        -   Compare with the current workspace state (using `rg --files` per folder).
        -   **Deleted Files:** Remove from DB.
        -   **New Files:** Add to the indexing queue.
        -   **Modified Files:** Check `mtime` (modification time). If changed, add to the indexing queue.
    -   **Queue System:**
        -   Process files in small batches to avoid blocking the UI.
        -   **Deduplication:** Use a `Set` or `Map` to track pending files. If a file is already in the queue, update its status but do not add a duplicate entry.
        -   **Fault Isolation:** Wrap individual file processing in try-catch blocks. If parsing or indexing fails for a specific file, log the error and **continue** to the next file in the queue.
    -   **Persistence:** Store the index in `workspaceStorage` (`context.storageUri`) which is managed by VS Code per workspace.
    -   **Tree Flattening & Bulk Insert:**
        -   **Strategy:** Perform a Depth-First Search (DFS) traversal to collect all symbols in memory first.
        -   **Container Name:** Pass the **accumulated ancestor path** (e.g., "Namespace.Class") down during DFS. This allows searching for a method using its namespace or any ancestor name (e.g., "Namespace Method").
        -   **Bulk Insert:** Once all symbols for a file are collected, insert them into the database using a **single transaction**.
            -   **Chunking:** Split the symbols into smaller batches (e.g., 100 symbols per INSERT) to avoid SQLite's parameter limit (SQLITE_MAX_VARIABLE_NUMBER). This prevents "too many terms in compound SELECT" errors for large files.
    -   **Incremental Updates:**
        -   **Watcher:** Use `vscode.workspace.createFileSystemWatcher` to detect external changes (e.g., `git pull`).
            -   *Optimization:* Since VS Code's watcher API does not support complex exclude patterns (like `node_modules`), we use a global watcher (`**/*`) combined with a **Fast Path Filter** (`shouldIgnore`) that checks against `.gitignore` rules in memory to quickly discard irrelevant events.
        -   **Events:**
            -   `onDidChange` / `onDidCreate`: Add file to indexing queue.
            -   `onDidDelete`: Remove from DB immediately.
        -   **Transactions:** Use SQLite transactions (`BEGIN`...`COMMIT`) when updating a file. This ensures that "Delete old symbols", "Insert new symbols", and "Update file metadata (mtime)" happen atomically.

### 4.2 Database Schema
The database schema is normalized to reduce storage size and improve query performance.

**Table: `files`** (Stores file metadata)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
    - *Purpose:* Unique identifier for the file, used as a foreign key in the `symbols` table.
- `path`: TEXT UNIQUE
    - *Purpose:* The absolute file path.
    - *Normalization:* Paths must be normalized (e.g., using `vscode.Uri.file(path).fsPath`) before storage to handle Windows drive letter inconsistencies (e.g., `c:` vs `C:`).
- `mtime`: INTEGER
    - *Purpose:* Last modification timestamp. Used to detect if a file has changed since the last index.
- `indexed_at`: INTEGER
    - *Purpose:* Timestamp of when the file was last successfully indexed.

**Table: `symbols`** (Stores symbol data)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
    - *Purpose:* Unique identifier for the symbol.
- `file_id`: INTEGER
    - *Purpose:* Foreign Key referencing `files.id`. Links the symbol to its source file.
    - *Constraint:* `ON DELETE CASCADE` (Automatically delete symbols when the file is deleted).
- `name`: TEXT
    - *Purpose:* The name of the symbol (e.g., "MyClass", "init").
- `detail`: TEXT
    - *Purpose:* Additional details (e.g., function signature "(int a, int b)", class inheritance).
- `kind`: INTEGER
    - *Purpose:* The `vscode.SymbolKind` enum value (e.g., 5 for Method, 11 for Function). Used to render the correct icon.
- `range_start_line`: INTEGER
- `range_start_char`: INTEGER
- `range_end_line`: INTEGER
- `range_end_char`: INTEGER
    - *Purpose:* The full range of the symbol (including body). Used for highlighting.
- `selection_range_start_line`: INTEGER
- `selection_range_start_char`: INTEGER
- `selection_range_end_line`: INTEGER
- `selection_range_end_char`: INTEGER
    - *Purpose:* The range of the symbol's name (identifier). Used for "Jump to Definition" to position the cursor exactly on the name.
- `container_name`: TEXT
    - *Purpose:* The name of the parent symbol (e.g., class name for a method). Used to reconstruct the hierarchy or display context in flat lists.

### 4.3 Benefits
-   **Precision:** Eliminates fuzzy/regex matching errors.
-   **Completeness:** Bypasses the 100-result limit of standard LSP calls.
-   **Performance:** SQL queries are extremely fast once indexed.

### 4.4 Challenges & Solutions
1.  **Initialization Time (The 'Cold Start' Problem):**
    -   *Challenge:* Indexing thousands of files takes time.
    -   *Solution:* **Hybrid Transition Strategy**.
        -   While indexing is in progress, the extension continues to use the existing "LSP + Deep Search" mechanism.
        -   Show a non-intrusive progress indicator (Status Bar) during indexing.
2.  **LSP Bottleneck:**
    -   *Challenge:* Flooding the LSP with `getDocumentSymbol` requests can cause high CPU usage or crashes.
    -   *Solution:* **Smart Scheduler**.
        -   **Batching:** Process files in configurable batches (Default: 15 files) with delays (100ms) between batches.
            -   **Configuration:** `shared.indexingBatchSize` allows users to tune this.
        -   **User Preemption:** If the user triggers a search or interacts with the editor, pause the background indexing to prevent UI lag.
3.  **File Filtering:**
    -   *Challenge:* Indexing irrelevant files (minified JS, logs, node_modules) wastes resources.
    -   *Solution:* **Leverage Ripgrep & Configuration**.
        -   Use `rg --files` to discover files for indexing. This automatically respects `.gitignore` and handles binary/large file exclusion.
        -   **Configuration:**
            -   `shared.includeFiles`: Whitelist specific patterns (e.g., `**/*.c, **/*.h`). If set, only matching files are indexed.
            -   `shared.excludeFiles`: Blacklist specific patterns (e.g., `**/*.md, **/*.txt`). These are excluded even if they pass `.gitignore`.
        -   Explicitly exclude `node_modules` unless configured otherwise.
4.  **Path Consistency (Windows):**
    -   *Challenge:* Windows file paths are case-insensitive but inconsistent (e.g., `c:\Project` vs `C:\Project`). `ripgrep` and VS Code APIs may return different casing, leading to duplicate indexing or lookup failures.
    -   *Solution:* **Canonicalization**. Always normalize paths (e.g., `vscode.Uri.file(path).fsPath`) before storing in the database or querying.
5.  **Atomic Saves & Race Conditions:**
    -   *Challenge:* Many editors perform "atomic saves" (write new file -> delete old -> rename new). `FileSystemWatcher` events can trigger for the "delete" phase, causing `ENOENT` errors if the indexer tries to read the file immediately.
    -   *Solution:* **Robust Event Handling**.
        -   Use `FileSystemWatcher` for all events (`create`, `change`, `delete`) to ensure external changes (e.g., git pull) are captured.
        -   Implement existence checks (`fs.stat`) before processing any file in the queue to gracefully handle files that disappear during processing (e.g., during atomic saves).

## 5. Part I: Symbol Window

### 5.1 UI/UX Design

#### 5.1.1 Entry Point
- **Activity Bar:** A dedicated icon opens the "Symbol Window" in the Primary Sidebar.
- **View Container:** A custom view container in the sidebar.

#### 5.1.2 Layout
- **Technology:** **Webview View** (using React). This is necessary to implement the "Always-visible Search Bar" and custom filtering logic that standard VS Code TreeViews cannot support.
- **Search Bar:** Fixed at the top of the view.
    - **Project Mode:** Includes a "Toggle Search Details" (kebab menu) button when Deep Search is enabled.
- **Search Details Panel:** (Project Mode and DeepSearch only)
    - **Scope Control:** Display current scope path, button to select folder, button to clear scope.
    - **Files to Include:** Input field for glob patterns.
- **Symbol Tree:** The main area displaying the list/tree of symbols below the search bar.
- **Toolbar Actions (View Title):**
    - **Mode Switching:** Icons/Buttons in the View Title area (top right of the panel).
        - **Modes:**
            1.  **Current Editor (Document Symbols)**
            2.  **Project (Workspace Symbols)**
    - **Deep Search:** (Visible only in **Project Mode** when Database is NOT ready). Triggers text-based search fallback. Hidden when Database Mode is active.

#### 5.1.3 Interaction
- **Click:**
    - **Single Click:** Selects the item in the list (visual feedback only).
    - **Double Click:** Jumps to the symbol location in the editor and reveals it.
- **Cursor Sync (Current Editor Mode):** Moving the cursor in the editor automatically highlights/selects the corresponding symbol in the tree and scrolls it into view.
- **Keyboard Shortcuts:**
    - The extension provides commands (`symbol-window.refresh`, `symbol-window.toggleMode`, `symbol-window.rebuildIndex`, `symbol-window.rebuildIndexFull`) that users can bind to custom shortcuts.
- **Keyboard Navigation (Webview):**
    - `Arrow Up/Down`: Move focus from Search Bar to the List, or navigate within the List.
    - `Arrow Left/Right`: Move cursor within the Search Bar (when focused).
    - `Enter`: Jump to the selected symbol (same as Double Click).
- **State Persistence:**
    - The extension remembers the last active mode (Current vs. Project), search query, details panel visibility (`showDetails`), and include pattern (`includePattern`) when the view is hidden or VS Code is restarted using `vscode.Memento`.

### 5.2 Functional Requirements

#### 5.2.1 Mode: Current Editor Symbols
- **Data Source:** `vscode.executeDocumentSymbolProvider`.
- **Default State:** Shows all symbols in the active document (Tree structure).
- **Search/Filter:**
    - Typing in the search bar filters the existing tree.
    - **Result Display:** Show all matching symbols within the document hierarchy. Expand parent nodes to reveal matching children.
    - Empty search bar restores the full tree.
- **Context Switching:**
    - Updates automatically when the active editor changes.
    - **Readiness Check:** If the language server is not ready (e.g., C/C++ extension indexing), the view waits and retries until symbols are available.
- **Display Details:**
    - Show Symbol Name.
    - Show Symbol Detail/Signature (e.g., function parameters) in a subtle color.
    - **Icons:** Use VS Code Codicons mapped to `vscode.SymbolKind`.
    - **Symbol Parsing (C-Style Optimization):**
        - **Configuration:** `symbolWindow.symbolParsing.mode` (Default: `auto`).
        - **Auto Mode:** Automatically detects language ID. For C/C++/Java/C#, it applies specialized parsing to extract function signatures and type suffixes (e.g., `(struct)`) from the name and move them to the detail view for cleaner display.
        - **Fallback:** For other languages, or if configured to `none`, symbols are displayed exactly as returned by the LSP.
        - **Extensibility:** Designed with a Strategy Pattern (`SymbolParser` interface) to easily add support for other languages in the future.

#### 5.2.2 Mode: Project Symbols
- **Data Source:** `vscode.executeWorkspaceSymbolProvider` (Standard) + `ripgrep` (Deep Search) OR **SQLite Database** (Database Mode).
- **Default State:** Empty (to save resources and reduce noise).
- **Search:**
    - Triggered only when the user types.
    - **Debounce:** 300ms delay to prevent API flooding.
    - **Cancellation:** If user continues typing, cancel the previous pending API request.
    - **Scope (Deep Search only):** User can select a specific folder to limit the search context.
    - **Files to Include (Deep Search only):** User can provide glob patterns to filter files.
    - **Result Display:** Show all matching symbols from the workspace.
        - **Pagination:** Infinite scroll mechanism loads more results (batches of 100) as the user scrolls to the bottom.
        - **Expansion:** Results are collapsed by default to show more items.
- **Display:** Flat list (grouped by file).

#### 5.2.3 Search Logic
- **Debouncing:** 300ms delay.
- **Multi-keyword Support:**
    - **Goal:** Order-independent matching (e.g., "User Controller" and "Controller User" should both find "UserController").
    - **Current Mode (Client-side):**
        - Split query by spaces into keywords.
        - Filter tree nodes: A node matches if it contains **ALL** keywords (AND logic).
        - Preserve hierarchy: If a child matches, show its parents.
    - **Project Mode (Hybrid):**
        - **Strategy:** "Fetch Missing + Cache + Client Filter".
        - Step 1: Split query into keywords.
        - Step 2: Identify keywords not present in the cache.
        - Step 3: Fetch results for missing keywords (up to 3 at a time) using `vscode.executeWorkspaceSymbolProvider`.
        - Step 4: Cache the results for each keyword.
        - Step 5: Collect all cached results for the current keywords.
        - Step 6: Filter the collected results in memory to ensure each symbol matches **ALL** keywords.
    - **Deep Search (Text Scan Fallback):**
        - **Configuration:**
            - `symbolWindow.enableDeepSearch`: Master switch (Default: `true`).
        - **Trigger:**
            - Manual button click in Project Mode (if `enableDeepSearch` is true).
            - Fallback if standard search yields insufficient results (implementation detail).
        - **Optimization:**
            - **Regex Permutations:** Generates regex for all permutations of keywords (up to 5) to allow order-independent matching directly in `ripgrep` (e.g., `A.*B|B.*A`).
            - **Ripgrep Options:** Uses standard line-based search (no `--multiline`) for maximum performance.
        - **Purpose:** Overcome LSP result truncation (e.g., searching "User" returns only first 100 results).
        - **Strategy:**
            1.  Generate regex permutations for the top 5 keywords (e.g., `A.*B|B.*A`).
            2.  Use **Ripgrep (`rg`)** to scan the workspace for files containing matching lines.
            3.  For each matching file, invoke `vscode.executeDocumentSymbolProvider` to parse symbols.
            4.  Filter symbols in memory to ensure they match **ALL** keywords.
            5.  **If Forced:** Return these results directly.
            6.  **If Manual:** Deduplicate against existing results (using `SelectionRange`) and prepend to the list.

#### 5.2.4 Visuals
- **Icons:** Use VS Code native `ThemeIcon` mapped to `vscode.SymbolKind` (e.g., `SymbolKind.Method` -> `$(symbol-method)`). This ensures it looks exactly like the native outline/search.

### 5.3 Architecture (Symbol Window Specific)

#### 5.3.1 Components
1.  **SymbolWebviewProvider:** Implements `vscode.WebviewViewProvider`. Hosts the React app.
2.  **React App (Frontend):**
    - **Library:** Use `@vscode/webview-ui-toolkit` for native VS Code UI components.
    - `App`: Main container, handles state (Mode, SearchQuery, TreeData).
    - `SearchBar`: Input component.
    - `SymbolTree`: Renders the tree/list. Handles expansion and selection.
    - `SymbolItem`: Renders individual rows (Icon + Name + Detail).
3.  **SymbolController (Backend):** Handles business logic, message passing, caching, and readiness checks.
4.  **SymbolModel:** Wraps VS Code APIs (`executeDocumentSymbolProvider`, `executeWorkspaceSymbolProvider`).
5.  **Database Module (`src/db`):** Manages the SQLite connection and schema.
6.  **Indexer Module (`src/indexer`):** Handles workspace crawling, symbol extraction, and incremental updates.

#### 5.3.2 Readiness State Machine
The `SymbolController` maintains a state machine to handle the availability of the Language Server Protocol (LSP).

- **States:**
    - `standby`: Initial state, or after a timeout/error. The extension is waiting for a trigger to check availability.
    - `loading`: The extension is actively polling `getWorkspaceSymbols` to check if the LSP is ready.
    - `ready`: The LSP has successfully returned symbols.
- **Transitions:**
    - `standby` -> `loading`: Triggered by `startPolling()` (e.g., on activation or manual retry).
    - `loading` -> `ready`: Polling succeeds (symbols returned or empty result with no error).
    - `loading` -> `standby`: Polling times out (MAX_RETRIES exceeded) or fails repeatedly.
    - `ready` -> `standby`: Triggered by an LSP crash or error during search.
- **Mode-Specific Behavior:**
    - **Project Mode:** Strictly respects the state. If `standby` (timeout), it shows an error. If `loading`, it shows a spinner.
    - **Current Mode:** Also respects the global readiness state. It will fetch and display symbols if available, but the UI will remain in a "Loading" state until the global polling confirms the LSP is fully ready.
        - **Exception:** If no editor is active, the UI shows "Ready" (empty state) to avoid a perpetual spinner, but the internal state remains `standby` to trigger polling immediately when an editor is opened.

### 5.4 Database Mode Integration

#### 5.4.1 Hybrid Transition Strategy
-   **Behavior:**
    -   While indexing is in progress, the extension continues to use the existing "LSP + Deep Search" mechanism.
    -   Once indexing is complete, the UI seamlessly switches to "Database Mode" (labeled as **PROJECT WORKSPACE (DATABASE)**).
    -   **UI Changes:** The "Deep Search" controls (kebab menu) are hidden when Database Mode is active.
    -   **Toolbar:** The "Rebuild Index" icon in the Symbol Window toolbar is removed (moved to Status Bar).

#### 5.4.2 Search & Pagination
-   **Performance:** Since `node:sqlite` is synchronous, queries **MUST** use `LIMIT` and `OFFSET` (e.g., `LIMIT 100`) to prevent blocking the Extension Host when the result set is large.
-   **Pagination State:** The frontend (React) maintains the current page index. When the user scrolls to the bottom (Infinite Scroll), it sends a new search request with an incremented `OFFSET` (e.g., `OFFSET 100`, `OFFSET 200`).
-   **Multi-keyword Logic:**
    -   **Debounce:** Apply the same 300ms debounce as standard search to prevent excessive synchronous queries during rapid typing.
    -   **Case Insensitivity:** SQL `LIKE` queries should be case-insensitive (default behavior for ASCII in SQLite, but explicit `COLLATE NOCASE` can be used if needed).
    -   **Strategy:** Split the search query by spaces into tokens (e.g., "User Controller" -> `["User", "Controller"]`).
    -   **Sanitization:** Escape SQL wildcards (`%`, `_`) and backslashes in user input to prevent injection or incorrect matching (e.g., searching for "100%" should not match "1000"). Use `ESCAPE '\'` in the SQL query.
    -   **SQL Construction:** Use `AND` operators to ensure the result matches **ALL** tokens.
    -   **Scope:** Search across both `name` and `container_name` columns. This allows finding a method by combining its class name and method name (e.g., "MyClass init").
    -   **Example SQL:**
        ```sql
        SELECT * FROM symbols 
        WHERE (name LIKE '%User%' OR container_name LIKE '%User%') 
        AND (name LIKE '%Controller%' OR container_name LIKE '%Controller%')
        ORDER BY name ASC, path ASC
        LIMIT 100 OFFSET ?
        ```
-   **Precise Matching:** Use SQL `LIKE` with `%` wildcards (e.g., `%keyword%`) for substring matching.
-   **No Fuzzy Matching:** We explicitly avoid fuzzy subsequence matching (e.g., "SC" finding "SymbolController") to ensure high precision.
-   **Frontend Highlighting:** The Webview is responsible for highlighting the matching keywords in the result list.
    -   *Performance:* Since results are paginated (100 items), simple substring highlighting is performant and does not cause rendering lag.
    -   *Consistency:* Frontend highlighting logic must match the backend's `AND` logic (highlight all occurrences of all keywords).

## 6. Part II: Relation Window (New)

### 6.1 UI/UX Design
- **Location:**
    - Same View Container as Symbol Window (`symbol-relation-window-container`).
    - Appears **below** the Symbol Window by default.
    - **Resizable:** Users can drag the split line between Symbol and Relation windows.
- **View ID:** `relation-window-view`.
- **Interaction:**
    -   **Auto-Sync:** As the user moves the cursor in the editor, the Relation Window updates to show the hierarchy of the symbol under the cursor.
    -   **Click:** Single click selects/highlights the item and previews the location in the editor.
        -   **Focus Management:** The preview MUST use `{ preserveFocus: true, preview: true }`. This allows the user to navigate the list using keyboard arrows (`↓`/`↑`) while seeing the code update, without losing focus from the Relation Window.
    -   **Double Click / Enter:** Jumps to the code location and **transfers focus** to the editor.
    -   **Keyboard:** Arrow keys to navigate, Enter to jump. (Consistent with Symbol Window).
    - **Toolbar Actions (View Title):**
    - **Refresh:** Force Sync to Current Cursor. Manually triggers the Auto-Sync logic for the current cursor position, even if "Lock View" is enabled.
    - **Lock View:** Toggle button. When enabled, the view ignores all cursor movements (Auto-Sync disabled). The view only updates via manual "Refresh" or explicit commands.
    - **History Navigation:** `<` (Back) and `>` (Forward) buttons to navigate through previously viewed root symbols.
    - **Toggle Direction:** Switch between "Calls" (Outgoing) and "Called By" (Incoming).
        -   **Session Persistence:** The selected direction persists for the duration of the session. If the user switches to "Outgoing", subsequent Auto-Sync updates will continue to use "Outgoing" until changed again. The configuration setting `relationWindow.defaultDirection` is only used for the initial state on startup.
    - **Filter:** Toggle button to show/hide the Filter View. Allows filtering results by Symbol Kind (e.g., Function, Method, Constructor).
    - **Settings:** Gear icon to open the Settings View.
        -   **Remove Duplicates:** Option to merge multiple calls from the same function into a single node.
        -   **Show Definition Path:** Option to show the definition path instead of the call site path in the details.

### 6.2 Functional Requirements

#### 6.2.1 Auto-Sync Logic
- **Trigger:** `vscode.window.onDidChangeTextEditorSelection`.
- **Debounce:** **1000ms**.
    - If the user moves the cursor or types within 1000ms, the timer resets.
    - Only triggers after the cursor has been stationary for 1000ms.
- **Lock Check:** If "Lock View" is enabled, ignore the event immediately.
- **Jump Suppression (Context Preservation):**
    - **Problem:** When the user double-clicks a node in the Relation Window to jump to its definition, the cursor moves, which would normally trigger Auto-Sync and reset the view to the *target* symbol, causing the user to lose their current browsing context (the *caller*).
    -   **Solution:** When a jump is initiated by the Relation Window, set a temporary flag `isJumping = true`. The `onDidChangeTextEditorSelection` listener checks this flag; if true, it ignores the event and resets the flag. This keeps the Relation Window focused on the original symbol while the editor shows the target.
    -   **Suppression Window:** Instead of resetting the flag on the *first* event, the flag should remain active for a short duration (e.g., 100ms) after the jump command is issued. This handles cases where VS Code fires multiple selection events (e.g., focus change + cursor move + scroll) in rapid succession during a single jump operation.
- **Logic:**
    - **Flag Lifecycle:**
        1.  **Set:** `isJumping = true` immediately before executing the jump command (`vscode.window.showTextDocument` / `revealRange`).
        2.  **Safety Timeout:** Set a timeout (e.g., 1000ms) to automatically reset `isJumping = false`. This ensures the flag doesn't get stuck if the editor event fails to fire (e.g., jumping to the exact same location).
        3.  **Check & Reset:** Inside the `onDidChangeTextEditorSelection` handler:
            ```typescript
            if (this.isJumping) {
                // Do NOT reset immediately. Wait for the suppression window or timeout.
                return; // Suppress this specific update
            }
            ```
    -   **Symbol Validation (Retain State & Anti-Flicker):**
        -   **Goal:** The Relation Window should **only** update when the user clicks on a valid symbol. Clicking on whitespace, comments, or non-symbols should **NOT** clear the view; it should retain the last valid hierarchy.
        -   **Step 1:** Call `vscode.prepareCallHierarchy` at the new cursor position.
            -   **Multiple Results:** If the API returns an array of items, use the **first item** as the candidate.
        -   **Step 2 (Stability Check):** If a valid `CallHierarchyItem` is returned, compare it with the **Current Root Symbol**.
            -   If `New Root` is identical to `Current Root` (same `uri`, same `name`, and `range` overlaps), **ignore the update**. This prevents the tree from redrawing/collapsing while the user navigates within the same function.
        -   **Step 3 (Update):** If it is a *new* valid symbol, update the Relation Window.
            -   **Empty Results:** The view updates even if the symbol has no incoming/outgoing calls (it will display the Root with no children).
        -   **Step 4 (Failure/No Symbol):** If `undefined` or empty is returned, **abort the update** (maintain the last valid state).
            -   **Exception (Manual Refresh):** If the update was triggered manually (Refresh button), proceed to **Data Fetching Strategy** (Section 6.2.2) to attempt a Reference lookup using the word under the cursor.

#### 6.2.2 Data Fetching Strategy (Parallel & Hybrid)
The Relation Window employs a **Parallel Execution Strategy** to combine the precision of LSP with the breadth of Deep Search.

1.  **Parallel Execution:**
    -   Upon triggering a search, the extension launches two asynchronous tasks simultaneously:
        -   **Task A: LSP Hierarchy** (`vscode.provideIncomingCalls` / `vscode.provideOutgoingCalls`).
        -   **Task B: Deep Search** (Database + Ripgrep).
    -   **UI Feedback:**
        -   **Window Progress:** Show an indeterminate blue progress bar (`vscode.window.withProgress` with `location: Window`) immediately.
        -   **Webview:** Show a "Loading..." state or skeleton loader.

2.  **Result Merging (First-Paint & Append):**
    -   **First Response (Usually LSP):**
        -   As soon as the first task (usually LSP) completes, **immediately** render its results in the Webview.
        -   Do **not** wait for the second task.
    -   **Second Response (Usually Deep Search):**
        -   When the second task completes, perform **Deduplication**:
            -   Compare new items against the already displayed items.
            -   **Criteria:** If `File Path` AND `Range` overlap, consider it a duplicate and discard the Deep Search result (preferring the LSP result).
        -   **Append:** Add the non-duplicate items to the list.
        -   **Visual Distinction:** Optionally mark Deep Search results (e.g., different icon color) to indicate they are text-based matches.
    -   **Completion:** Once both tasks are done (or failed), hide the progress bar.

3.  **Deep Search Logic:**
    -   **Pre-check:**
        -   Check if the **Symbol Database** is available. If not, skip Deep Search.
        -   Check if the **Symbol Name** exists in the database. If not, skip Deep Search (avoid useless global text search).
    -   **Incoming Calls (Callers):**
        1.  **Ripgrep:** Search workspace for `Symbol Name`.
        2.  **Map:** For each match `(File, Line)`, query DB to find the "Enclosing Symbol" (the function containing that line).
    -   **Outgoing Calls (Callees):**
        1.  **Read Body:** Read source code of the current function.
        2.  **Tokenize:** Extract words/tokens.
        3.  **DB Query:** Find symbols in the DB that match these tokens.

4.  **Error Handling & Cancellation:**
    -   **Cancellation:** If the user moves the cursor again (triggering a new Debounce) or manually cancels, **abort** both running tasks immediately.
    -   **Database Error:** If the DB is busy or corrupt, catch the error silently and return empty results for Deep Search. Do **not** block LSP results.
    -   **Timeout:** Set a reasonable timeout (e.g., 5s) for Deep Search. If it takes too long, abort it to save resources.

#### 6.2.3 View Content & Data Protocol
- **Tree Structure:**
    -   **Lazy Loading:** Initial fetch retrieves only the first level of children. Subsequent levels are fetched dynamically when the user expands a node.
    -   **Root:** The symbol under cursor.
    -   **Children:** The callers (or callees).
    -   **Aggregation:** If a function calls the target multiple times, VS Code returns one item with multiple ranges. The Relation Window should display **one node per call range**.
        -   *Example:* If `Function B` calls `Function A` at line 10 and line 20, the tree should show two nodes for `Function B`, one pointing to line 10 and another to line 20. This avoids complex "badge" UI and allows direct navigation to each call site.
- **Communication Protocol:**
    -   **Frontend Request:** `{ command: 'resolveHierarchy', itemId: string, direction: 'incoming'|'outgoing' }`
    -   **Backend Response:** `{ command: 'updateNode', itemId: string, children: RelationItem[] }`
    -   **Cache:** The Backend must maintain a `Map<string, CallHierarchyItem>` to map the `itemId` back to the actual VS Code object needed for API calls.
        -   **Cache Clearing:** The cache MUST be cleared whenever the **Root Symbol** changes (i.e., when `updateRelation` is sent). This prevents memory leaks from accumulated items.
        -   **Unique IDs:** `itemId` MUST be a unique identifier (e.g., UUID or incrementing counter) to ensure that even if the same function appears multiple times in the tree (recursion), each node is treated as a distinct entity by the React frontend.
- **Loading Feedback:**
    -   **State:** `isLoading` (boolean).
    -   **UI:** Display a spinner in the View Title or on the expanding node when data is being fetched. This follows the same pattern as the Symbol Window's search loading state.
- **History Management:**
    -   **Concept:** The history records the **Root Symbol** (the subject of the view), not the entire tree state. Navigating history simply changes the "Current Subject" and re-fetches the hierarchy for it.
    -   **Capacity:** Store up to **20** history entries.
    -   **Entry Data:** `{ rootSymbol: CallHierarchyItem | string, label: string }`.
        -   `rootSymbol`: The VS Code object (for semantic modes) or the word string (for Fallback mode).
        -   `label`: The display name for the history entry (e.g., function name or the word).
    -   **Behavior:**
        -   **Push:** When the Root Symbol changes (via Auto-Sync or Manual Refresh), push the new state to the history stack.
        -   **Back/Forward:**
            1.  Retrieve the target entry from the stack.
            2.  **Validation:** Attempt to resolve the `rootSymbol`. If the file no longer exists or the symbol is invalid:
                -   **Abort:** Do not perform the jump.
                -   **Cleanup:** Remove the invalid entry from the history stack silently (no error toast).
                -   **Stay:** Remain on the current view.
            3.  Set the view's Root Symbol to the stored `rootSymbol`.
            4.  Trigger a hierarchy fetch (resolve children) for this root using the **current** direction.
            5.  **Note:** This action does **NOT** trigger a new "Push" to history.
        -   **Duplicate Check:** If the new Root is identical to the current one (same file, same range), do not push to history.
- **Display Info:**
    -   **Icon:** Symbol Kind icon.
    -   **Name:** Function name.
    -   **Detail:** File path or line number (grayed out).
    -   **Highlight:** If possible, highlight the specific line of code where the call happens.
-   **Stale Data Handling:**
    -   Since the view persists after file closure, the cached `CallHierarchyItem` (specifically its `Range`) may become outdated if the underlying file is modified.
    -   **Strategy:** When `resolveHierarchy` is called, wrap the API call in a try-catch block. If VS Code throws an error (e.g., "Invalid Range"), the extension should:
        1.  Log the error.
        2.  Send a message to the frontend to show a toast/notification: "Data is stale. Please refresh."
        3.  Optionally, attempt to re-resolve the symbol at the current cursor position if the editor is active.

#### 6.2.4 Concurrency & Lifecycle
-   **Race Condition Handling:**
    -   Assign a unique `requestId` (incrementing integer or timestamp) to each hierarchy fetch request.
    -   The Frontend stores the latest `requestId`.
    -   When the Backend responds, it includes the `requestId`.
    -   The Frontend discards any response where `response.requestId != current.requestId`. This prevents "stale" results from overwriting newer ones (e.g., fast cursor movement).

## 7. Part III: Reference Window (Lookup References)

### 7.1 UI/UX Design
- **Location:**
    -   **Panel Area (Bottom)**: The view is hosted in the bottom panel (alongside Terminal, Output, Debug Console).
    -   **Goal:** Provide a persistent, non-intrusive view for reference results that doesn't clutter the editor area.
- **Trigger:**
    -   **Method 1:** Click "Lookup References" button in the Relation Window toolbar.
    -   **Method 2:** Right-click in the editor and select "Lookup References".
    -   **Method 3:** Click the "Search" button in the Reference Window (uses input box content).
    -   **Note:** The Reference Window does **NOT** update automatically on cursor movement. It only updates when explicitly triggered via one of the above methods.
    -   **Behavior:** When triggered, the Reference Window automatically opens (if hidden) and gains focus.
- **Interaction:**
    -   **Click:** Selects the reference item and shows a **Code Preview** in the panel (if supported) or jumps to the location in the editor.
    -   **Close/Hide:** The view provides a "Close" or "Hide" button (or standard VS Code UI controls) to dismiss the panel when not needed.

### 7.2 Functional Requirements

#### 7.2.1 Data Fetching Strategy
1.  **Parallel Execution:**
    -   The extension executes **LSP Reference Provider** and **Deep Search (Ripgrep)** simultaneously.
    -   Results are displayed incrementally as they arrive to ensure responsiveness.

2.  **Deduplication & Merging:**
    -   **LSP Results:** Displayed with standard styling.
    -   **Deep Search Results:** Displayed with a distinct background color (e.g., light yellow/blue) to indicate they are text matches.
    -   **Intersection:** If a result appears in *both* LSP and Deep Search:
        -   It is treated as a confirmed reference.
        -   The "Deep Search" background color is **removed**.
        -   Duplicates are merged into a single entry.


#### 7.2.2 Code Preview
-   **Mechanism:**
    -   When a reference is found, the extension reads the file content (using `vscode.workspace.openTextDocument` or `fs.readFile`).
    -   Extracts the line of code containing the reference.
    -   Displays this line in the Reference Window list item, allowing the user to see context without opening the file.

## 8. Configuration Settings
- `symbolWindow.enable`: (Default: true)
- `relationWindow.enable`: (Default: true)
- `relationWindow.autoSync`: (Default: true) - If false, only updates on manual refresh command.
- `relationWindow.defaultDirection`: "incoming" | "outgoing" (Default: "incoming" - "Called By").

## 9. Testing Strategy (TEST.md)

### 9.1 Symbol Window Tests
*(Refer to TEST.md for full test cases)*

### 9.2 Relation Window Tests
- [ ] **Activation & Layout**
    - Enable `relationWindow.enable`.
    - Verify "Relation Window" appears in the Side Bar below Symbol Window.
    - Verify it can be resized.
- [ ] **Auto-Sync**
    - Open a file with known functions (e.g., `function A() calls B()`).
    - Place cursor on `B`.
    - Verify Relation Window updates to show `A` as a caller (Incoming mode).
    - Move cursor to whitespace. Verify Window does not clear immediately (or retains last valid state).
- [ ] **Direction Toggle**
    - Click "Outgoing Calls".
    - Verify list shows functions called *by* the current symbol.
    - Click "Incoming Calls".
    - Verify list shows functions that *call* the current symbol.
- [ ] **Navigation**
    - Double-click a caller in the list.
    - Verify editor jumps to the location where the call happens.
- [ ] **Fallback Handling**
    - Open a file type with no LSP (e.g., Plain Text or a language without extension).
    - Place cursor on a word.
    - Verify UI shows "No hierarchy info" or "Deep Search" button.
    - Click "Deep Search".
    - Verify it finds text occurrences.
- [ ] **Resource Release**
    - Set `relationWindow.enable` to `false`.
    - Verify the view is hidden or empty.
    - Verify `onDidChangeTextEditorSelection` listeners are disposed (check logs/performance).
