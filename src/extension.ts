// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SymbolController } from './features/symbol/SymbolController';
import { SymbolWebviewProvider } from './features/symbol/SymbolWebviewProvider';
import { SymbolDatabase } from './shared/db/database';
import { SymbolIndexer } from './features/symbol/indexer/indexer';

let globalDb: SymbolDatabase | undefined;

export function activate(context: vscode.ExtensionContext) {
	console.log('Symbol Window is active!');

    let db: SymbolDatabase | undefined;
    let indexer: SymbolIndexer | undefined;

    if (context.storageUri) {
        const dbPath = vscode.Uri.joinPath(context.storageUri, 'symbols.db').fsPath;
        console.log('[SymbolWindow] Database path:', dbPath);
        
        try {
            db = new SymbolDatabase(dbPath);
            db.init();
            globalDb = db;
            // We create the controller first so we can pass it to the indexer callback if needed, 
            // but actually we need to pass indexer to controller.
            // So we'll use a closure or setup after.
        } catch (e) {
            console.error('[SymbolWindow] Failed to initialize database:', e);
            db = undefined;
        }
    }

    const controller = new SymbolController(context, db, undefined); // Pass undefined indexer first
    const provider = new SymbolWebviewProvider(context.extensionUri, controller);

    const config = vscode.workspace.getConfiguration('symbolWindow');
    const enableDatabaseMode = config.get<boolean>('enableDatabaseMode', true);

    if (db && enableDatabaseMode) {
        try {
            indexer = new SymbolIndexer(context, db, 
                (percent) => {
                    controller.updateProgress(percent);
                },
                () => {
                    // onIndexingComplete
                    controller.setDatabaseReady(true);
                },
                () => {
                    // onRebuildFullStart
                    controller.setDatabaseReady(false);
                }
            );

            // Now inject indexer into controller
            controller.setIndexer(indexer);

            indexer.startWatching();
            // Trigger Warm Start
            indexer.syncIndex();
            console.log('[SymbolWindow] Database initialized.');
        } catch (e) {
            console.error('[SymbolWindow] Failed to start indexer:', e);
            indexer = undefined;
        }
    }	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(SymbolWebviewProvider.viewType, provider)
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

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.rebuildIndex', () => {
            if (indexer) {
                // Default to Incremental
                indexer.rebuildIndexIncremental();
            } else {
                vscode.window.showErrorMessage('Symbol Database is not available.');
            }
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('symbol-window.rebuildIndexFull', () => {
            if (indexer) {
                indexer.rebuildIndexFull();
            } else {
                vscode.window.showErrorMessage('Symbol Database is not available.');
            }
		})
	);
}

export function deactivate() {
    if (globalDb) {
        globalDb.close();
        console.log('[SymbolWindow] Database closed.');
    }
}
