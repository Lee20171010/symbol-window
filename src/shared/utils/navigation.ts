import * as vscode from 'vscode';

export async function previewLocation(uri: string | vscode.Uri, range: any) {
    try {
        const uriString = typeof uri === 'string' ? uri : uri.toString();
        // Ensure range is in the correct format if it's an array or VS Code Range
        let targetRange = range;
        
        // Handle [start, end] array format if necessary (though usually it's an object with start/end)
        if (Array.isArray(range)) {
            targetRange = { start: range[0], end: range[1] };
        }

        // Convert 0-based range (VS Code standard) to 1-based range (expected by vscode-context-window)
        const oneBasedRange = {
            start: { 
                line: targetRange.start.line + 1, 
                character: targetRange.start.character + 1 
            },
            end: { 
                line: targetRange.end.line + 1, 
                character: targetRange.end.character + 1 
            }
        };

        await vscode.commands.executeCommand('vscode-context-window.navigateUri', uriString, oneBasedRange);
    } catch (e) {
        // Command might not be available
        console.debug('Preview command failed', e);
    }
}
