# Test Plan for Symbol Window Extension

## 1. Toolbar Actions
- [ ] **Refresh Button**
    - Click to reload symbols.
    - **Current Window Mode**: Re-fetches symbols for the active document.
    - **Project Window Mode**: Clears keyword cache and re-executes the search with the current query.
    - Verify that the search bar content is preserved and results are updated.
- [ ] **Toggle Mode Button**
    - Click to switch between "Current Document" and "Project Workspace" modes.
    - Verify the UI title changes (e.g., "Current Document" vs "Project Workspace").
    - Verify the search bar placeholder text changes.
    - Verify the symbol list updates to reflect the new mode.

## 2. Navigation & Selection
- [ ] **Selection State**
    - Single Click a symbol in the list.
    - Verify the symbol in the list is selected (highlighted).
- [ ] **Jump to Definition**
    - Double Click a symbol in the list.
    - Verify the editor scrolls to the correct line and column.
    - Verify the symbol range is highlighted/selected in the editor.
- [ ] **Keyboard Navigation**
    - Click inside the symbol list (or search bar).
    - Use `Arrow Up` / `Arrow Down` to navigate items.
    - Verify the selection moves up and down.
    - Press `Enter` to jump to the selected symbol.
- [ ] **Sync Selection (Editor to List)** (Planned - Not Implemented)
    - Click on a symbol (e.g., function name) in the active editor.
    - Verify the corresponding item in the Symbol Window list is automatically selected and scrolled into view.

## 3. Current Symbol Window (Mode: Current)
- [ ] **Default State**
    - Open a file (e.g., `.c`, `.cpp`, `.ts`).
    - Verify all symbols in the file are displayed in a tree structure.
- [ ] **Readiness State**
    - Open a large C/C++ project (or simulate slow extension activation).
    - Verify the view shows a "Waiting for language server..." or similar loading state initially.
    - Verify it automatically updates to show symbols once the language server is ready.
- [ ] **Context Switching**
    - Switch between two open files.
    - Verify the list updates immediately to show symbols for the newly active file.
- [ ] **Search/Filtering**
    - Type in the search bar.
    - Verify the list is filtered in real-time (Client-side filtering).
    - Verify parent nodes expand if a child matches the query.
    - Verify clearing the search bar restores the full list.
- [ ] **Empty State**
    - Close all editors.
    - Verify the list is empty.
    - Verify no error messages are shown.
- [ ] **Consistency**
    - Perform the same search multiple times.
    - Verify the results are identical each time.

## 4. Project Symbol Window (Mode: Project)
- [ ] **Default State**
    - Switch to Project Mode.
    - Verify the list is initially empty (or shows a prompt to search).
- [ ] **Search Functionality**
    - Type a query (e.g., `main`, `Symbol`).
    - Verify results are fetched from the workspace.
    - Verify "No results found" is displayed if the query matches nothing.
- [ ] **Consistency**
    - Perform the same search multiple times.
    - Verify the results are identical each time.

## 5. Deep Search (Experimental)
- [ ] **Enable Deep Search**
    - Set `symbolWindow.enableDeepSearch` to `true`.
    - Switch to Project Mode.
    - Verify the "Deep Search" button appears below the search bar (after a search).
- [ ] **Disable Deep Search**
    - Set `symbolWindow.enableDeepSearch` to `false`.
    - Switch to Project Mode.
    - Verify the "Deep Search" button is **hidden**.
- [ ] **Force Deep Search**
    - Set `symbolWindow.enableDeepSearch` to `true`.
    - Set `symbolWindow.forceDeepSearch` to `true`.
    - Type a query in Project Mode.
    - Verify that "Deep Search" is triggered automatically (no button click needed).
    - Verify the "Deep Search" button is hidden (since it's automatic).
    - Verify results are returned.
    - Verify results do NOT have a special background highlight (since all results are from Deep Search).
- [ ] **Cancel Deep Search**
    - Trigger a long-running Deep Search (e.g., common keyword in large repo).
    - Click the "Cancel" button.
    - Verify the search stops and the loading indicator disappears.
- [ ] **Triggering (Manual Mode)**
    - Set `symbolWindow.forceDeepSearch` to `false`.
    - Enter a common keyword (e.g., "User") that likely exceeds the LSP limit (100 results).
    - Verify the "Deep Search" button is visible.
    - Click "Deep Search".
- [ ] **Results (Manual Mode)**
    - Verify the UI shows a "Searching..." state.
    - Verify new results appear at the top of the list.
    - Verify Deep Search results have a distinct background highlight (to distinguish from standard results).
    - Verify hovering over a Deep Search result shows a tooltip "Result from Deep Search".
    - Verify results are relevant (contain the keyword).
- [ ] **Deduplication**
    - Ensure symbols already found by the standard search are not duplicated in the Deep Search results.

## 6. Search Bar Robustness
- [ ] **Special Characters**
    - Search for symbols with characters like `::`, `->`, `.`, `_`, `~`.
    - Verify the application does not crash.
    - Verify correct matching (e.g., `std::vector` matches `vector` inside `std`).
- [ ] **Race Conditions (Fast Typing)**
    - Type a long query quickly, then immediately clear it.
    - Verify the result list ends up empty (not showing results for the intermediate query).
    - Type "abc", wait slightly, then type "d". Verify results are for "abcd".

## 7. State Management & Synchronization
- [ ] **File Updates (Data Freshness)**
    - **Current Mode**:
        - Modify a symbol in the active file (e.g., rename a function) and **Save**.
        - Verify the name updates in the list immediately.
    - **Project Mode**:
        - Search for a symbol (e.g., `MyFunction`) and verify it appears.
        - Rename `MyFunction` to `MyFunctionNew` in the editor and **Save** the file.
        - Without clicking Refresh, search for `MyFunction` again.
        - Verify it returns **no results** (proving the old data was invalidated).
        - Search for `MyFunctionNew`.
        - Verify it is found immediately.
- [ ] **Readiness Feedback (Project Mode)**
    - Open the extension in a large workspace (or one where the language server is slow to start).
    - Verify the view shows a **Loading Indicator** with text "Waiting for symbol provider...".
    - Verify the search bar is disabled while loading.
    - Verify the UI automatically unlocks (search bar enabled, loading disappears) when ready.
- [ ] **Transition Flow**
    - **Empty to Active (Cold Start)**:
        - Start with no files open (Empty Workspace).
        - Verify the Symbol Window is empty and shows no loading spinner (UI is "Ready").
        - Open a file in a large project (where LSP takes time).
        - Verify the "Waiting for symbol provider..." loading state appears immediately.
        - Verify symbols load once the LSP is ready.
    - **Active to Active**:
        - Open File A. Verify status transitions to Ready and symbols load.
        - Open File B. Verify status remains Ready (no "Loading" flash) and symbols update.
- [ ] **Timeout & Retry Feedback**
    - If the extension stays in "Loading..." for too long (simulated timeout), verify a **"Timeout" or "Error" message** appears (e.g., red text).
    - Click the **Refresh Button**.
    - Verify the error message disappears, and the "Loading..." state reappears as it retries.
- [ ] **"Best Effort" Responsiveness**
    - Trigger a "Loading" or "Timeout" state in Project Mode (e.g., by opening a huge folder).
    - Switch to **Current Document Mode**.
    - Verify the list **immediately** populates with symbols for the active file, ignoring the Project Mode error/loading state.

## 8. Performance & User Experience
- [ ] **Instant Search (Cache Verification)**
    - Type a query (e.g., "Controller") in Project Mode. Note the time it takes to appear (e.g., ~1 second).
    - Clear the search bar.
    - Type "Controller" again immediately.
    - Verify the results appear **instantly** (perceptibly faster than the first time), indicating efficient reuse of data.
- [ ] **Manual Refresh**
    - Perform a search and see results.
    - Click the **Refresh Button**.
    - Verify the view briefly flashes or shows a loading state, indicating that a fresh search is being performed against the workspace.

## 9. Additional Considerations (Edge Cases)
- [ ] **Pagination / Infinite Scroll** (Project Mode)
    - Search for a common term (e.g., `e`) that returns > 100 results.
    - Scroll to the bottom of the list.
    - Verify more results are loaded automatically.
- [ ] **Theme Compatibility**
    - Switch VS Code themes (Light, Dark, High Contrast).
    - Verify text is readable and selection highlights are visible.
- [ ] **Extension Activation**
    - Reload the window (`Developer: Reload Window`) with the view open.
    - Verify the extension activates and restores the previous mode/state correctly.

## 10. Configuration & Display
- [ ] **Clean C-Style Types** (`symbolWindow.cleanCStyleTypes`)
    - **Enabled (Default)**:
        - Create/Open a C/C++ file with a struct typedef: `typedef struct MyStruct { ... } MyStruct;`
        - Verify the symbol appears as `MyStruct` in the list.
        - Verify `(struct)` or `(typedef)` appears in gray text next to the name (Detail).
    - **Disabled**:
        - Go to Settings -> Symbol Window -> Uncheck "Clean CStyle Types".
        - Refresh the view.
        - Verify the symbol appears as `MyStruct (struct)` (or similar) in the main name text.
- [ ] **Move Function Signatures** (`symbolWindow.moveSignatureToDetail`)
    - **Enabled (Default)**:
        - Create/Open a file with a function: `void myFunction(int a, char b);`
        - Verify the symbol appears as `myFunction` in the list.
        - Verify `(int a, char b)` appears in gray text next to the name (Detail).
    - **Disabled**:
        - Go to Settings -> Symbol Window -> Uncheck "Move Signature To Detail".
        - Refresh the view.
        - Verify the symbol appears as `myFunction(int a, char b)` in the main name text.
