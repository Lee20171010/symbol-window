
import * as vscode from 'vscode';
import { SymbolParser, ParsedSymbol } from '../SymbolParser';

export class DefaultParser implements SymbolParser {
    id = 'default';

    parse(name: string, detail: string, kind: vscode.SymbolKind): ParsedSymbol {
        return { name, detail };
    }
}
