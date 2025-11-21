import React, { useState } from 'react';
import { SymbolItem } from '../../shared/types';

interface SymbolTreeProps {
    symbols: SymbolItem[];
    onJump: (symbol: SymbolItem) => void;
    onSelect: (symbol: SymbolItem) => void;
    selectedSymbol: SymbolItem | null;
}

const SymbolNode: React.FC<{ 
    symbol: SymbolItem; 
    depth: number; 
    onJump: (s: SymbolItem) => void;
    onSelect: (s: SymbolItem) => void;
    selectedSymbol: SymbolItem | null;
}> = ({ symbol, depth, onJump, onSelect, selectedSymbol }) => {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = symbol.children && symbol.children.length > 0;

    const handleClick = () => {
        onSelect(symbol);
    };

    const handleDoubleClick = () => {
        onJump(symbol);
    };

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };

    // Map SymbolKind to Codicon class and color
    const getIconInfo = (kind: number) => {
        // See vscode.SymbolKind
        const map: {[key: number]: { icon: string, colorVar: string }} = {
            5: { icon: 'codicon-symbol-class', colorVar: '--vscode-symbolIcon-classForeground' },
            6: { icon: 'codicon-symbol-method', colorVar: '--vscode-symbolIcon-methodForeground' },
            11: { icon: 'codicon-symbol-method', colorVar: '--vscode-symbolIcon-methodForeground' },
            12: { icon: 'codicon-symbol-property', colorVar: '--vscode-symbolIcon-propertyForeground' },
            13: { icon: 'codicon-symbol-field', colorVar: '--vscode-symbolIcon-fieldForeground' },
            9: { icon: 'codicon-symbol-constructor', colorVar: '--vscode-symbolIcon-constructorForeground' },
            10: { icon: 'codicon-symbol-enum', colorVar: '--vscode-symbolIcon-enumForeground' },
            14: { icon: 'codicon-symbol-interface', colorVar: '--vscode-symbolIcon-interfaceForeground' },
            1: { icon: 'codicon-symbol-file', colorVar: '--vscode-symbolIcon-fileForeground' },
            2: { icon: 'codicon-symbol-module', colorVar: '--vscode-symbolIcon-moduleForeground' },
            3: { icon: 'codicon-symbol-namespace', colorVar: '--vscode-symbolIcon-namespaceForeground' },
            4: { icon: 'codicon-symbol-package', colorVar: '--vscode-symbolIcon-packageForeground' },
            7: { icon: 'codicon-symbol-property', colorVar: '--vscode-symbolIcon-propertyForeground' },
            8: { icon: 'codicon-symbol-field', colorVar: '--vscode-symbolIcon-fieldForeground' },
            15: { icon: 'codicon-symbol-key', colorVar: '--vscode-symbolIcon-keyForeground' },
            16: { icon: 'codicon-symbol-snippet', colorVar: '--vscode-symbolIcon-snippetForeground' },
            17: { icon: 'codicon-symbol-text', colorVar: '--vscode-symbolIcon-textForeground' },
            18: { icon: 'codicon-symbol-color', colorVar: '--vscode-symbolIcon-colorForeground' },
            19: { icon: 'codicon-symbol-file', colorVar: '--vscode-symbolIcon-fileForeground' },
            20: { icon: 'codicon-symbol-reference', colorVar: '--vscode-symbolIcon-referenceForeground' },
            21: { icon: 'codicon-symbol-customcolor', colorVar: '--vscode-symbolIcon-customColorForeground' },
            22: { icon: 'codicon-symbol-event', colorVar: '--vscode-symbolIcon-eventForeground' },
            23: { icon: 'codicon-symbol-operator', colorVar: '--vscode-symbolIcon-operatorForeground' },
            24: { icon: 'codicon-symbol-type-parameter', colorVar: '--vscode-symbolIcon-typeParameterForeground' },
            25: { icon: 'codicon-symbol-user', colorVar: '--vscode-symbolIcon-nullForeground' }, // User?
            26: { icon: 'codicon-symbol-issue', colorVar: '--vscode-symbolIcon-nullForeground' }, // Issue?
        };
        return map[kind] || { icon: 'codicon-symbol-misc', colorVar: '--vscode-symbolIcon-nullForeground' };
    };

    const iconInfo = getIconInfo(symbol.kind);

    return (
        <div>
            <div 
                className={`symbol-item ${selectedSymbol === symbol ? 'selected' : ''}`}
                style={{ paddingLeft: `${depth * 15 + 5}px` }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
            >
                <span 
                    className={`codicon symbol-expand-icon ${hasChildren ? (expanded ? 'codicon-chevron-down' : 'codicon-chevron-right') : 'hidden'}`}
                    onClick={toggleExpand}
                ></span>
                <span 
                    className={`symbol-icon codicon ${iconInfo.icon}`}
                    style={{ color: `var(${iconInfo.colorVar})` }}
                ></span>
                <span className="symbol-name">{symbol.name}</span>
                <span className="symbol-detail">{symbol.detail}</span>
            </div>
            {hasChildren && expanded && (
                <div>
                    {symbol.children.map((child, index) => (
                        <SymbolNode 
                            key={index} 
                            symbol={child} 
                            depth={depth + 1} 
                            onJump={onJump}
                            onSelect={onSelect}
                            selectedSymbol={selectedSymbol}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const SymbolTree: React.FC<SymbolTreeProps> = ({ symbols, onJump, onSelect, selectedSymbol }) => {
    return (
        <div className="tree-container">
            {symbols.map((symbol, index) => (
                <SymbolNode 
                    key={index} 
                    symbol={symbol} 
                    depth={0} 
                    onJump={onJump}
                    onSelect={onSelect}
                    selectedSymbol={selectedSymbol}
                />
            ))}
        </div>
    );
};

export default SymbolTree;
