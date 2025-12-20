import React, { useState } from 'react';
import { SymbolItem } from '../../../shared/common/types';
import { getSymbolIconInfo } from '../../utils';

interface SymbolTreeProps {
    symbols: SymbolItem[];
    onJump: (symbol: SymbolItem) => void;
    onSelect: (symbol: SymbolItem) => void;
    selectedSymbol: SymbolItem | null;
    defaultExpanded?: boolean;
    query?: string;
}

const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    
    // Split query into terms and escape them
    const terms = query.split(/\s+/).filter(t => t.length > 0).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (terms.length === 0) return text;

    // Create regex to match any term
    const regex = new RegExp(`(${terms.join('|')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => {
        // Check if this part matches any of the terms (case-insensitive)
        const isMatch = terms.some(term => new RegExp(`^${term}$`, 'i').test(part));
        return isMatch ? <span key={i} className="symbol-highlight">{part}</span> : part;
    });
};

const SymbolNode: React.FC<{ 
    symbol: SymbolItem; 
    depth: number; 
    onJump: (s: SymbolItem) => void;
    onSelect: (s: SymbolItem) => void;
    selectedSymbol: SymbolItem | null;
    defaultExpanded?: boolean;
    query?: string;
}> = ({ symbol, depth, onJump, onSelect, selectedSymbol, defaultExpanded, query }) => {
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

    const iconInfo = getSymbolIconInfo(symbol.kind);
    const elementRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (selectedSymbol === symbol && elementRef.current) {
            elementRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [selectedSymbol, symbol]);

    return (
        <div>
            <div 
                ref={elementRef}
                className={`symbol-item ${selectedSymbol === symbol ? 'selected' : ''} ${symbol.isDeepSearch ? 'deep-search-result' : ''}`}
                style={{ 
                    paddingLeft: `${depth * 15 + 5}px`
                }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                title={symbol.isDeepSearch ? "Result from Deep Search" : undefined}
            >
                <span 
                    className={`codicon symbol-expand-icon ${hasChildren ? (expanded ? 'codicon-chevron-down' : 'codicon-chevron-right') : 'hidden'}`}
                    onClick={toggleExpand}
                ></span>
                {symbol.isDeepSearch && (
                    <span className="codicon codicon-zap deep-search-icon" title="Deep Search Result"></span>
                )}
                <span 
                    className={`symbol-icon codicon ${iconInfo.icon}`}
                    style={{ color: `var(${iconInfo.colorVar})` }}
                ></span>
                <span className="symbol-name">{query ? highlightMatch(symbol.name, query) : symbol.name}</span>
                <span className="symbol-detail">{symbol.detail}</span>
                {symbol.path && <span className="path">{symbol.path}</span>}
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
                            query={query}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const SymbolTree: React.FC<SymbolTreeProps> = ({ symbols, onJump, onSelect, selectedSymbol, defaultExpanded, query }) => {
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
                    query={query}
                />
            ))}
        </div>
    );
};

export default SymbolTree;
