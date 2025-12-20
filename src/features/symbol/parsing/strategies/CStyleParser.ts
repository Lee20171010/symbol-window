
import * as vscode from 'vscode';
import { SymbolParser, ParsedSymbol } from '../SymbolParser';

export class CStyleParser implements SymbolParser {
    id = 'c-style';

    parse(name: string, detail: string, kind: vscode.SymbolKind): ParsedSymbol {
        let finalName = name;
        let finalDetail = detail || '';
        
        let typeSuffix = '';
        let signatureSuffix = '';

        // 1. Parse C-Style Type Suffix: "Name (struct)"
        const typeMatch = this.parseCStyleType(finalName);
        if (typeMatch.type) {
            finalName = typeMatch.name;
            typeSuffix = typeMatch.type;
        }

        // 2. Parse Signature: "Name(int a)"
        const sigMatch = this.parseSignature(finalName);
        if (sigMatch.signature) {
            finalName = sigMatch.name;
            signatureSuffix = sigMatch.signature;
        }

        // 3. Construct Detail
        const parts: string[] = [];
        
        // Order: Signature first, then Type
        if (signatureSuffix) {
            parts.push(signatureSuffix);
        }
        
        if (typeSuffix) {
            // Avoid duplication if detail already contains the type
            if (!finalDetail.toLowerCase().includes(typeSuffix)) {
                parts.push(typeSuffix);
            }
        }
        
        if (finalDetail) {
            // Avoid duplication if detail is exactly the signature (some LSPs do this)
            if (finalDetail !== signatureSuffix) {
                parts.push(finalDetail);
            }
        }
        
        // Use 4 non-breaking spaces for separation
        finalDetail = parts.join('\u00A0\u00A0\u00A0\u00A0');

        return { name: finalName, detail: finalDetail };
    }

    private parseCStyleType(name: string): { name: string, type: string } {
        const regex = /\s*\((typedef|struct|enum|union|class|interface|macro|declaration)\)$/i;
        const match = name.match(regex);
        if (match) {
            return { 
                name: name.replace(regex, ''), 
                type: match[1].toLowerCase() 
            };
        }
        return { name, type: '' };
    }

    private parseSignature(name: string): { name: string, signature: string } {
        // Match anything starting with '(' at the end of the string
        const regex = /\s*(\(.*\))$/;
        const match = name.match(regex);
        
        if (match) {
            return {
                name: name.replace(regex, ''),
                signature: match[1]
            };
        }
        return { name, signature: '' };
    }
}
