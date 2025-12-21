# Change Log

All notable changes to the "symbol-relation-window" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [unrelease]

### Added
- **Relation Window**: Fully implemented the Relation Window for exploring Call Hierarchy.
    - **Incoming/Outgoing Calls**: View callers and callees for the selected symbol.
    - **Deep Search**: Integrated `ripgrep`-based Deep Search for relations to find calls even when LSP is incomplete (e.g., in C/C++ projects).
    - **Filtering**: Filter relation results by symbol kind (e.g., show only Functions or Methods).
    - **Settings**: Added options to "Remove Duplicates" and "Show Definition Path".
- **Reference Window**: Added a dedicated window for looking up references.
    - **Code Preview**: View code context for each reference directly in the list.
    - **Navigation**: Quick jump to reference locations.
- **Symbol Window**:
    - **Kind Filtering**: Added a new filter button to the search bar allowing users to filter symbols by type (Class, Method, Variable, etc.).
    - **C-Style Parsing**: Improved symbol parsing for C/C++ to cleaner display names by stripping type suffixes and signatures (configurable).
- **Shared**:
    - **Deep Search Utility**: Centralized `ripgrep` search logic for use by both Symbol and Relation windows.

### Refactor
- **Shared Core**: Extracted `LspClient` and `DatabaseManager` to `src/shared/core`. This centralizes the LSP connection and SQLite database management, allowing both the Symbol Window and the upcoming Relation Window to share the same resources efficiently.
- **Status Bar**: Removed the dedicated status bar logic from `SymbolIndexer`.

### UI/UX
- **Container**: Renamed the main Activity Bar container from "Symbol Window" to **"Window"**. This provides a neutral parent container for both the Symbol and Relation views.
- **Foolproof View**: Introduced a "Foolproof" view (`all-disabled-view`) that activates when both `symbolWindow.enable` and `relationWindow.enable` are set to `false`. It displays a clean interface with buttons to easily re-enable either window.

## [0.1.2] - 2025-11-27

### Fixed
- **Incremental Indexing**: Fixed a critical bug where files with 0 symbols were ignored by the indexer, causing them to be re-scanned infinitely during incremental updates.
- **Race Condition Handling**: Added robust existence checks (`fs.stat`) before processing files in the indexing queue. This prevents `ENOENT` errors caused by atomic save operations (delete-then-rename) when using `FileSystemWatcher`.

### Changed
- **Performance Tuning**: 
    - Reduced default `symbolWindow.indexingBatchSize` from 30 to **15** to further reduce LSP load.
    - Increased batch processing delay from 50ms to **100ms** to give the CPU more breathing room between batches.
    - **Data Transfer**: Optimized `loadMore` to use incremental data transfer, reducing IPC overhead when scrolling through large result lists.
- **Configuration**: 
    - `symbolWindow.indexingBatchSize`: Added a hard limit of 200 files/batch to prevent LSP crashes.
    - `symbolWindow.excludeFiles`: Added new setting to control which files are excluded from indexing. Default value now covers a comprehensive list of binary files, images, archives, and documentation (e.g., `.md`, `.txt`, `.pdf`, `.zip`, `.exe`) to prevent them from being indexed.
    - `symbolWindow.includeFiles`: Added new setting to whitelist specific file patterns for indexing.

### Removed
- **Deep Search**: Removed `symbolWindow.enableDeepSearch` configuration. Deep Search is now an integrated fallback feature in Project Mode (when Database Mode is not ready) and Relation Window, rather than a globally toggled setting.

## [0.1.1] - 2025-11-26

### Added
- **Configuration**: 
    - `symbolWindow.indexingBatchSize`: Configure indexing performance (Default: 30 files/batch). Set to `0` for unlimited speed.
- **Commands**:
    - `Rebuild Symbol Index (Incremental)`: Safely updates the index for changed files.
    - `Rebuild Symbol Index (Full)`: Completely clears and rebuilds the database.

### Fixed
- **State Persistence**: Fixed an issue where the "Database Mode" UI state and Indexing Progress bar would be lost when switching views or reloading the window.
- **Progress Tracking**: Indexing progress is now robustly synced between the backend and the webview.

### Removed
- **Dev Commands**: Removed `symbol-window.testSqlite` and `symbol-window.focus` as they are no longer needed.

## [0.1.0] - 2025-11-26

### Added
- **Database Mode**: A new high-performance mode backed by SQLite for instant symbol search in large workspaces.
    - **Persistent Index**: Symbols are indexed once and persisted to disk, eliminating wait times on startup.
    - **Incremental Updates**: The index is automatically updated in the background as you edit files.
    - **Hybrid Search**: Combines database speed with LSP accuracy.
- **Configuration**: 
    - `symbolWindow.enableDatabaseMode`: Enable the new SQLite-based mode.
- **UI**: Added a distinct **PROJECT WORKSPACE (DATABASE)** label when Database Mode is active.

### Changed
- **Performance**: Significantly reduced memory usage and improved search responsiveness in large projects when using Database Mode.
- **Documentation**: Updated README and SPEC to reflect the new architecture.

## [0.0.4] - 2025-11-25

### Changed
- **Deep Search Graduation**: Deep Search is no longer experimental and is now enabled by default (`symbolWindow.enableDeepSearch` defaults to `true`).
- **Deep Search Optimization**: Implemented Regex Permutations for multi-keyword matching to significantly improve search speed with `ripgrep`.
- **UI Polish**: Updated the Search Details UI to match VS Code's native design (transparent backgrounds, better spacing).
- **UX Improvements**:
    - Deep Search results are now collapsed by default to reduce clutter.
    - Added `Esc` key support to clear the "Files to Include" input.
    - The "Search Details" toggle is now only visible when Deep Search is enabled.

### Added
- **Advanced Deep Search Filtering**:
    - **Search Scope**: Users can now limit Deep Search to specific folders.
    - **Files to Include**: Added support for glob patterns (e.g., `*.ts`, `src/**`) to filter search results.
- **Search Details Panel**: A new toggleable panel in the search bar (Project Mode) to access advanced filtering options.
- **State Persistence**: The extension now remembers the Search Scope, Include Patterns, and Details Panel visibility across sessions.

## [0.0.2] - 2025-11-24

### Added
- **Deep Search**: A new hybrid search mechanism combining Ripgrep (text scan) and LSP (symbol parsing) to find symbols in large projects where standard LSP results are truncated.
- **Deep Search UI**: Added a "Deep Search" button in Project Mode that appears when results might be incomplete.
- **Result Highlighting**: Deep Search results are highlighted to distinguish them from standard search results.

### Changed
- **Search Logic**: Improved deduplication logic using `selectionRange` to better merge Document and Workspace symbols.
- **UI Feedback**: Enhanced loading state indicators during search operations.

## [0.0.1] - 2025-11-23

### Features
- **Current Document Mode**: Tree view of symbols in the active file with real-time filtering.
- **Project Workspace Mode**: Global symbol search with multi-keyword support.
- **Readiness State Machine**: Robust handling of Language Server initialization and timeouts.
- **LSP Crash Recovery**: Automatic detection and recovery from Language Server failures.
- **Native UI**: Built with VS Code Webview UI Toolkit for a seamless look and feel.
- **Performance**: Implemented caching and debouncing for search queries.