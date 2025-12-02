import * as vscode from 'vscode';

export class DisabledWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'all-disabled-view';

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', data.setting);
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Symbol Window Disabled</title>
                <style>
                    body {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        padding: 20px;
                        text-align: center;
                        color: var(--vscode-foreground);
                        font-family: var(--vscode-font-family);
                    }
                    button {
                        margin-top: 10px;
                        padding: 8px 16px;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        cursor: pointer;
                        font-family: var(--vscode-font-family);
                        width: 100%;
                        max-width: 200px;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
			</head>
			<body>
				<p>All windows are currently disabled.</p>
                <button onclick="openSettings('symbolWindow.enable')">Enable Symbol Window</button>
                <button onclick="openSettings('relationWindow.enable')">Enable Relation Window</button>
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    function openSettings(setting) {
                        vscode.postMessage({ command: 'openSettings', setting: setting });
                    }
                </script>
			</body>
			</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
