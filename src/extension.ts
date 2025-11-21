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
}

export function deactivate() {}
