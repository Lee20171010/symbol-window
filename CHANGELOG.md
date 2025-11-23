# Change Log

All notable changes to the "symbol-window" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.1] - 2025-11-23

### Features
- **Current Document Mode**: Tree view of symbols in the active file with real-time filtering.
- **Project Workspace Mode**: Global symbol search with multi-keyword support.
- **Readiness State Machine**: Robust handling of Language Server initialization and timeouts.
- **LSP Crash Recovery**: Automatic detection and recovery from Language Server failures.
- **Native UI**: Built with VS Code Webview UI Toolkit for a seamless look and feel.
- **Performance**: Implemented caching and debouncing for search queries.

## [0.0.2] - 2025-11-24

### Added
- **Deep Search**: A new hybrid search mechanism combining Ripgrep (text scan) and LSP (symbol parsing) to find symbols in large projects where standard LSP results are truncated.
- **Deep Search UI**: Added a "Deep Search" button in Project Mode that appears when results might be incomplete.
- **Result Highlighting**: Deep Search results are highlighted to distinguish them from standard search results.

### Changed
- **Search Logic**: Improved deduplication logic using `selectionRange` to better merge Document and Workspace symbols.
- **UI Feedback**: Enhanced loading state indicators during search operations.