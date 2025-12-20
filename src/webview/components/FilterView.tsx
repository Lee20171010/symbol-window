import React, { useState, useEffect, useRef } from 'react';
import { VSCodeButton, VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';
import { symbolKindNames, getSymbolIconInfo } from '../utils';

interface FilterViewProps {
    initialSelection: number[];
    onApply: (selection: number[]) => void;
    onCancel: () => void;
}

const FilterView: React.FC<FilterViewProps> = ({ initialSelection, onApply, onCancel }) => {
    const [selection, setSelection] = useState<number[]>(initialSelection);
    const containerRef = useRef<HTMLDivElement>(null);

    // Focus container on mount to capture keyboard events
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.focus();
        }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
            onApply(selection);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
        }
    };

    const toggleKind = (kind: number) => {
        setSelection(prev => {
            if (prev.includes(kind)) {
                return prev.filter(k => k !== kind);
            } else {
                return [...prev, kind];
            }
        });
    };

    const toggleAll = () => {
        const allKinds = Object.keys(symbolKindNames).map(Number);
        if (selection.length === allKinds.length) {
            setSelection([]);
        } else {
            setSelection(allKinds);
        }
    };

    return (
        <div className="filter-view-overlay" onClick={onCancel}>
            <div 
                className="filter-view-content" 
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                ref={containerRef}
            >
                <div className="filter-header">
                    <span className="title">Filter by Kind</span>
                    <span className="codicon codicon-close close-btn" onClick={onCancel}></span>
                </div>
                
                <div className="filter-actions-top">
                    <span className="filter-description">Check to show</span>
                    <VSCodeButton appearance="icon" onClick={toggleAll} title="Toggle All">
                        <span className="codicon codicon-check-all"></span>
                    </VSCodeButton>
                </div>

                <div className="filter-list">
                    {Object.entries(symbolKindNames).map(([key, name]) => {
                        const kind = Number(key);
                        const info = getSymbolIconInfo(kind);
                        const isChecked = selection.includes(kind);
                        
                        return (
                            <div 
                                key={kind} 
                                className={`filter-item ${isChecked ? 'checked' : ''}`}
                                onClick={() => toggleKind(kind)}
                            >
                                <VSCodeCheckbox 
                                    checked={isChecked} 
                                    // @ts-ignore
                                    onClick={(e) => { e.stopPropagation(); toggleKind(kind); }}
                                    style={{ pointerEvents: 'none' }} // Let parent handle click
                                ></VSCodeCheckbox>
                                <span 
                                    className={`codicon ${info.icon}`} 
                                    style={{ color: `var(${info.colorVar})`, marginRight: '6px' }}
                                ></span>
                                <span className="name">{name}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="filter-footer">
                    <VSCodeButton appearance="secondary" onClick={onCancel}>Cancel</VSCodeButton>
                    <VSCodeButton appearance="primary" onClick={() => onApply(selection)}>OK</VSCodeButton>
                </div>
            </div>
        </div>
    );
};

export default FilterView;
