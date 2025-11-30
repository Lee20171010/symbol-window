import React, { useState } from 'react';
import { SymbolItem } from '../../../shared/types';

interface SymbolTreeProps {
    symbols: SymbolItem[];
    onJump: (symbol: SymbolItem) => void;
    onSelect: (symbol: SymbolItem) => void;
    selectedSymbol: SymbolItem | null;
    defaultExpanded?: boolean;
}

const SymbolNode: React.FC<{ 
    symbol: SymbolItem; 
    depth: number; 
    onJump: (s: SymbolItem) => void;
    onSelect: (s: SymbolItem) => void;
    selectedSymbol: SymbolItem | null;
    defaultExpanded?: boolean;
}> = ({ symbol, depth, onJump, onSelect, selectedSymbol, defaultExpanded }) => {
    const [expanded, setExpanded] = useState(() => {
        if (symbol.autoExpand !== undefined) {
            return symbol.autoExpand;
        }
        return defaultExpanded || false;
    });
    const hasChildren = symbol.children && symbol.children.length > 0;

    // Update expanded state when defaultExpanded prop changes or when autoExpand is set by search filter
    React.useEffect(() => {
        if (symbol.autoExpand !== undefined) {
            setExpanded(symbol.autoExpand);
        } else {
            setExpanded(defaultExpanded || false);
        }
    }, [defaultExpanded, symbol.autoExpand]);

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
        // See vscode.SymbolKind (0-based)
        const map: {[key: number]: { icon: string, colorVar: string }} = {
            0: { icon: 'codicon-symbol-file', colorVar: '--vscode-symbolIcon-fileForeground' },
            1: { icon: 'codicon-symbol-module', colorVar: '--vscode-symbolIcon-moduleForeground' },
            2: { icon: 'codicon-symbol-namespace', colorVar: '--vscode-symbolIcon-namespaceForeground' },
            3: { icon: 'codicon-symbol-package', colorVar: '--vscode-symbolIcon-packageForeground' },
            4: { icon: 'codicon-symbol-class', colorVar: '--vscode-symbolIcon-classForeground' },
            5: { icon: 'codicon-symbol-method', colorVar: '--vscode-symbolIcon-methodForeground' },
            6: { icon: 'codicon-symbol-property', colorVar: '--vscode-symbolIcon-propertyForeground' },
            7: { icon: 'codicon-symbol-field', colorVar: '--vscode-symbolIcon-fieldForeground' },
            8: { icon: 'codicon-symbol-constructor', colorVar: '--vscode-symbolIcon-constructorForeground' },
            9: { icon: 'codicon-symbol-enum', colorVar: '--vscode-symbolIcon-enumForeground' },
            10: { icon: 'codicon-symbol-interface', colorVar: '--vscode-symbolIcon-interfaceForeground' },
            11: { icon: 'codicon-symbol-function', colorVar: '--vscode-symbolIcon-functionForeground' },
            12: { icon: 'codicon-symbol-variable', colorVar: '--vscode-symbolIcon-variableForeground' },
            13: { icon: 'codicon-symbol-constant', colorVar: '--vscode-symbolIcon-constantForeground' },
            14: { icon: 'codicon-symbol-string', colorVar: '--vscode-symbolIcon-stringForeground' },
            15: { icon: 'codicon-symbol-number', colorVar: '--vscode-symbolIcon-numberForeground' },
            16: { icon: 'codicon-symbol-boolean', colorVar: '--vscode-symbolIcon-booleanForeground' },
            17: { icon: 'codicon-symbol-array', colorVar: '--vscode-symbolIcon-arrayForeground' },
            18: { icon: 'codicon-symbol-object', colorVar: '--vscode-symbolIcon-objectForeground' },
            19: { icon: 'codicon-symbol-key', colorVar: '--vscode-symbolIcon-keyForeground' },
            20: { icon: 'codicon-symbol-null', colorVar: '--vscode-symbolIcon-nullForeground' },
            21: { icon: 'codicon-symbol-enum-member', colorVar: '--vscode-symbolIcon-enumMemberForeground' },
            22: { icon: 'codicon-symbol-struct', colorVar: '--vscode-symbolIcon-structForeground' },
            23: { icon: 'codicon-symbol-event', colorVar: '--vscode-symbolIcon-eventForeground' },
            24: { icon: 'codicon-symbol-operator', colorVar: '--vscode-symbolIcon-operatorForeground' },
            25: { icon: 'codicon-symbol-type-parameter', colorVar: '--vscode-symbolIcon-typeParameterForeground' },
        };
        return map[kind] || { icon: 'codicon-symbol-misc', colorVar: '--vscode-symbolIcon-nullForeground' };
    };

    const iconInfo = getIconInfo(symbol.kind);

    return (
        <div>
            <div 
                className={`symbol-item ${selectedSymbol === symbol ? 'selected' : ''}`}
                style={{ 
                    paddingLeft: `${depth * 15 + 5}px`,
                    backgroundColor: symbol.isDeepSearch ? 'var(--vscode-editor-findMatchHighlightBackground)' : undefined
                }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                title={symbol.isDeepSearch ? "Result from Deep Search" : undefined}
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
                            // Fix: Do NOT pass defaultExpanded to children. 
                            // This ensures that if a Struct matches, it expands to show itself, 
                            // but its children (members) remain collapsed by default.
                            defaultExpanded={false} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const SymbolTree: React.FC<SymbolTreeProps> = ({ symbols, onJump, onSelect, selectedSymbol, defaultExpanded }) => {
    return (
        <div className="symbol-tree">
            {symbols.map((symbol, index) => (
                <SymbolNode 
                    key={`${symbol.name}-${index}`} 
                    symbol={symbol} 
                    depth={0} 
                    onJump={onJump}
                    onSelect={onSelect}
                    selectedSymbol={selectedSymbol}
                    defaultExpanded={defaultExpanded}
                />
            ))}
        </div>
    );
};

export default SymbolTree;
