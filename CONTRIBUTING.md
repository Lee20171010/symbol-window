# Contributing to Symbol Window

Thank you for your interest in contributing to Symbol Window! We welcome bug reports, feature requests, and pull requests.

## Development Setup

1.  **Prerequisites**:
    - Node.js (v16 or higher)
    - npm
    - Visual Studio Code

2.  **Clone the repository**:
    ```bash
    git clone https://github.com/Lee20171010/symbol-window.git
    cd symbol-window
    ```

3.  **Install dependencies**:
    ```bash
    npm install
    ```

4.  **Run the extension**:
    - Open the project in VS Code.
    - Press `F5` to start debugging. This will open a new "Extension Development Host" window with the extension loaded.

## Project Structure

- `src/extension.ts`: The main entry point of the extension.
- `src/controller/`: Contains the business logic (`SymbolController`) handling communication between VS Code and the Webview.
- `src/webview/`: The React application running inside the Webview.
    - `App.tsx`: Main React component.
    - `components/`: UI components like `SymbolTree`.
- `src/model/`: Handles data fetching from VS Code APIs.
- `src/view/`: Manages the Webview panel creation.

## Building

To compile the project manually:

```bash
npm run compile
```

To watch for changes:

```bash
npm run watch
```

## Testing

We use `@vscode/test-electron` for integration tests.

```bash
npm test
```

See `TEST.md` for the manual test plan.

## Code Style

- We use **ESLint** for linting. Please ensure your code passes linting before submitting a PR.
- Keep code comments and documentation in **English**.

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
