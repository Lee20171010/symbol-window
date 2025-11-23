import * as vscode from 'vscode';
import { SymbolController } from '../controller/symbolController';
import { WebviewMessage } from '../shared/types';

export class SymbolWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'symbol-window-view';

    private _view?: vscode.WebviewView;
    private controller: SymbolController;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        controller: SymbolController
    ) {
        this.controller = controller;
        this.controller.setProvider(this);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: WebviewMessage) => {
            switch (data.command) {
                case 'ready':
                    this.controller.refresh();
                    break;
                case 'search':
                    this.controller.handleSearch(data.query);
                    break;
                case 'jump':
                    this.controller.jumpTo(data.uri, data.range);
                    break;
                case 'loadMore':
                    this.controller.loadMore();
                    break;
                case 'deepSearch':
                    this.controller.deepSearch();
                    break;
                case 'cancel':
                    this.controller.cancelSearch();
                    break;
            }
        });
    }

    public postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'style.css'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'codicon.css'));

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet">
                <title>Symbol Window</title>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
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
