// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SymbolController } from './controller/symbolController';
import { SymbolWebviewProvider } from './view/SymbolWebviewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Symbol Window is active!');

	const controller = new SymbolController(context);
	const provider = new SymbolWebviewProvider(context.extensionUri, controller);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(SymbolWebviewProvider.viewType, provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.focus', () => {
			// Focus the view
			vscode.commands.executeCommand('symbol-window-view.focus');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.refresh', () => {
			controller.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.toggleMode', () => {
			controller.toggleMode();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.deepSearch', () => {
			controller.deepSearch();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.deepSearchDisabled', async () => {
			const selection = await vscode.window.showInformationMessage(
				'Deep Search is currently disabled.',
				'Open Settings'
			);
			if (selection === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'symbolWindow.enableDeepSearch');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.searchInFolder', async (uri: vscode.Uri) => {
            if (uri && uri.fsPath) {
                // Focus the view
                await vscode.commands.executeCommand('symbol-window-view.focus');
                // Set scope
                controller.setScope(uri.fsPath);
            }
		})
	);
}

export function deactivate() {}
