# Symbol Window Extension Specification

## 1. Overview
**Name:** Symbol Window
**Goal:** Create a "Source Insight"-like symbol navigation experience within VS Code.
**Core Philosophy:** Fast, native look-and-feel, leveraging VS Code APIs to avoid custom parsing overhead.

## 2. Marketplace Optimization
**Keywords:**
- `symbol`
- `outline`
- `navigation`
- `source insight`
- `structure`
- `jump`
- `code map`

## 3. UI/UX Design

### 3.1 Entry Point
- **Activity Bar:** A dedicated icon opens the "Symbol Window" in the Primary Sidebar.
- **View Container:** A custom view container in the sidebar.

### 3.2 Layout
- **Technology:** **Webview View** (using React). This is necessary to implement the "Always-visible Search Bar" and custom filtering logic that standard VS Code TreeViews cannot support.
- **Search Bar:** Fixed at the top of the view.
    - **Project Mode:** Includes a "Toggle Search Details" (kebab menu) button when Deep Search is enabled.
- **Search Details Panel:** (Project Mode and DeepSearch only)
    - **Scope Control:** Display current scope path, button to select folder, button to clear scope.
    - **Files to Include:** Input field for glob patterns.
- **Symbol Tree:** The main area displaying the list/tree of symbols below the search bar.
- **Mode Switching:**
    - **Mechanism:** Icons/Buttons in the View Title area (top right of the panel).
    - **Modes:**
        1.  **Current Editor (Document Symbols)**
        2.  **Project (Workspace Symbols)**

### 3.3 Interaction
- **Click:**
    - **Single Click:** Selects the item in the list (visual feedback only).
    - **Double Click:** Jumps to the symbol location in the editor and reveals it.
- **Cursor Sync (Current Editor Mode):** (Planned) Moving the cursor in the editor automatically highlights/selects the corresponding symbol in the tree and scrolls it into view.
- **Keyboard Shortcuts:**
    - The extension provides commands (`symbol-window.focus`, `symbol-window.refresh`, `symbol-window.toggleMode`) that users can bind to custom shortcuts.
- **Keyboard Navigation (Webview):**
    - `Arrow Up/Down`: Move focus from Search Bar to the List, or navigate within the List.
    - `Arrow Left/Right`: Move cursor within the Search Bar (when focused).
    - `Enter`: Jump to the selected symbol (same as Double Click).
- **State Persistence:**
    - The extension remembers the last active mode (Current vs. Project), search query, details panel visibility (`showDetails`), and include pattern (`includePattern`) when the view is hidden or VS Code is restarted using `vscode.Memento`.

## 4. Functional Requirements

### 4.1 Mode: Current Editor Symbols
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

### 4.2 Mode: Project Symbols
- **Data Source:** `vscode.executeWorkspaceSymbolProvider` (Standard) + `ripgrep` (Deep Search).
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

### 4.3 Search Logic
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
    - **Deep Search (Text Scan Fallback) [Experimental]:**
        - **Configuration:**
            - `symbolWindow.enableDeepSearch`: Master switch (Default: `false`).
            - `symbolWindow.forceDeepSearch`: Auto-trigger switch (Default: `false`).
        - **Trigger:**
            - Manual button click in Project Mode (if `enableDeepSearch` is true).
            - Automatic if `forceDeepSearch` is true.
            - Fallback if standard search yields insufficient results (implementation detail).
        - **Optimization:**
            - **Regex Permutations:** Generates regex for all permutations of keywords (up to 5) to allow order-independent matching directly in `ripgrep` (e.g., `A.*B|B.*A`).
            - **Ripgrep Options:** Uses `--multiline`, `--multiline-dotall`, and `--max-columns 1000` (to skip minified files).
        - **Purpose:** Overcome LSP result truncation (e.g., searching "User" returns only first 100 results).
        - **Strategy:**
            1.  Identify the longest keyword (Primary Keyword).
            2.  Use **Ripgrep (`rg`)** to scan the entire workspace for files containing the Primary Keyword.
            3.  For each matching file, invoke `vscode.executeDocumentSymbolProvider` to parse symbols.
            4.  Filter symbols in memory to ensure they match **ALL** keywords.
            5.  **If Forced:** Return these results directly.
            6.  **If Manual:** Deduplicate against existing results (using `SelectionRange`) and prepend to the list.

### 4.4 Visuals
- **Icons:** Use VS Code native `ThemeIcon` mapped to `vscode.SymbolKind` (e.g., `SymbolKind.Method` -> `$(symbol-method)`). This ensures it looks exactly like the native outline/search.

## 5. Architecture

### 5.1 Components
1.  **ExtensionController:** Main entry point.
2.  **SymbolWebviewProvider:** Implements `vscode.WebviewViewProvider`. Hosts the React app.
3.  **React App (Frontend):**
    - **Library:** Use `@vscode/webview-ui-toolkit` for native VS Code UI components.
    - `App`: Main container, handles state (Mode, SearchQuery, TreeData).
    - `SearchBar`: Input component.
    - `SymbolTree`: Renders the tree/list. Handles expansion and selection.
    - `SymbolItem`: Renders individual rows (Icon + Name + Detail).
4.  **SymbolController (Backend):** Handles business logic, message passing, caching, and readiness checks.
5.  **SymbolModel:** Wraps VS Code APIs (`executeDocumentSymbolProvider`, `executeWorkspaceSymbolProvider`).

### 5.2 Project Structure
```
src/
├── extension.ts           // Entry point
├── controller/
│   └── symbolController.ts // Backend Logic: Message passing, Caching, Readiness
├── webview/               // Frontend (React)
│   ├── index.tsx          // React Entry
│   ├── App.tsx
│   ├── components/
│   │   └── SymbolTree.tsx
│   └── style.css
├── model/
│   └── symbolModel.ts      // Data fetching
└── shared/
    └── types.ts            // Shared interfaces
```

### 5.3 Data Flow
1.  **Init:** Extension activates -> Registers `SymbolWebviewProvider`.
2.  **Update:** User opens file -> `SymbolController` checks readiness -> fetches symbols -> Sends `updateSymbols` message to Webview.
3.  **Search:** User types in React SearchBar -> React filters locally (Current Mode) OR sends `search` message to Extension (Project Mode).
4.  **Navigation:** User double-clicks item in React -> Sends `jump` message to Extension -> Extension opens file & reveals range.

### 5.4 Readiness State Machine
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

## 6. Future Improvements
- **Sync Selection:** Implement logic to highlight the symbol in the tree when the cursor moves in the editor.
- **Sorting:** Add toggle to sort symbols by Name vs. Position.
- **Context Window Integration:** Explore integration with "Context Window" extensions.
