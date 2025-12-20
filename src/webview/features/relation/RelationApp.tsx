import React, { useState, useEffect, useRef } from 'react';
import { RelationItem, HistoryEntry, RelationMessage, RelationSettings } from '../../../shared/common/types';
import { vscode } from '../../vscode-api';
import RelationTree from './RelationTree';
import FilterView from '../../components/FilterView';
import SettingsView from './SettingsView';
import { symbolKindNames } from '../../utils';

const ALL_KINDS = Object.keys(symbolKindNames).map(Number);

// Default filter: Function, Method, Constructor, Constant
// 11: Function, 5: Method, 8: Constructor, 13: Constant
const DEFAULT_KINDS = [11, 5, 8, 13];

const RelationApp: React.FC = () => {
    const savedState = vscode.getState() || {};
    const [root, setRoot] = useState<RelationItem | null>(null);
    const [children, setChildren] = useState<RelationItem[]>([]);
    const [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming');
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [isLocked, setIsLocked] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [lastRequestId, setLastRequestId] = useState(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showBothDirections, setShowBothDirections] = useState(false);
    const [autoExpandBothDirections, setAutoExpandBothDirections] = useState(false);
    const [filter, setFilter] = useState<number[]>(savedState.filter || DEFAULT_KINDS);
    const [incomingFilter, setIncomingFilter] = useState<number[]>(savedState.incomingFilter || DEFAULT_KINDS);
    const [outgoingFilter, setOutgoingFilter] = useState<number[]>(savedState.outgoingFilter || DEFAULT_KINDS);
    const [showFilterView, setShowFilterView] = useState(false);
    const [filterScope, setFilterScope] = useState<'incoming' | 'outgoing' | null>(null);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [settings, setSettings] = useState<RelationSettings>(savedState.settings || { removeDuplicate: true, showDefinitionPath: false });
    const [showSettingsView, setShowSettingsView] = useState(false);
    
    const rootRef = useRef<RelationItem | null>(null);

    // Save state
    useEffect(() => {
        vscode.setState({ filter, incomingFilter, outgoingFilter, settings });
    }, [filter, incomingFilter, outgoingFilter, settings]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data as RelationMessage;
            switch (message.command) {
                case 'updateRelation':
                    if (message.requestId !== undefined) {
                        if (message.requestId < lastRequestId) {
                            return; // Ignore stale response
                        }
                        setLastRequestId(message.requestId);
                    }
                    setRoot(message.root);
                    rootRef.current = message.root;
                    setChildren(message.children);
                    setDirection(message.direction);
                    setHistory(message.history);
                    setHistoryIndex(message.historyIndex);
                    setIsLocked(message.isLocked);
                    if (message.showBothDirections !== undefined) {
                        setShowBothDirections(message.showBothDirections);
                    }
                    if (message.autoExpandBothDirections !== undefined) {
                        setAutoExpandBothDirections(message.autoExpandBothDirections);
                    }
                    // Reset selection on new root
                    setSelectedId(null);
                    break;
                case 'updateNode':
                    // If the target is the root, update the top-level children directly
                    if (rootRef.current && message.itemId === rootRef.current.id) {
                        setChildren(message.children);
                    } else {
                        setChildren(prev => updateNodeChildren(prev, message.itemId, message.children));
                    }
                    break;
                case 'setDirection':
                    setDirection(message.direction);
                    break;
                case 'setLoading':
                    setIsLoading(message.isLoading);
                    break;
                case 'setFilter':
                    if (message.filter) {
                        setFilter(message.filter);
                    }
                    break;
                case 'setFilters':
                    if (message.filter) setFilter(message.filter);
                    if (message.incomingFilter) setIncomingFilter(message.incomingFilter);
                    if (message.outgoingFilter) setOutgoingFilter(message.outgoingFilter);
                    break;
                case 'setSettings':
                    if (message.settings) {
                        setSettings(message.settings);
                    }
                    break;
                case 'error':
                    console.error('[Source Window]', message.message);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        
        // Request initial state
        vscode.postMessage({ command: 'ready' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleFilterClick = () => {
        if (showBothDirections) {
            setShowFilterMenu(true);
        } else {
            setFilterScope(direction);
            setShowFilterView(true);
        }
    };

    const handleFilterMenuSelect = (scope: 'incoming' | 'outgoing') => {
        setFilterScope(scope);
        setShowFilterMenu(false);
        setShowFilterView(true);
    };

    const handleFilterApply = (newFilter: number[]) => {
        if (filterScope === 'incoming') {
            setIncomingFilter(newFilter);
        } else if (filterScope === 'outgoing') {
            setOutgoingFilter(newFilter);
        }

        // Also update the main 'filter' state if it matches the current direction (for single view)
        if (!showBothDirections && filterScope === direction) {
            setFilter(newFilter);
        }

        setShowFilterView(false);
        vscode.postMessage({ command: 'saveFilter', filter: newFilter, scope: filterScope });
    };

    const handleSettingsApply = (newSettings: RelationSettings) => {
        setSettings(newSettings);
        setShowSettingsView(false);
        vscode.postMessage({ command: 'saveSettings', settings: newSettings });
    };

    const updateNodeChildren = (items: RelationItem[], targetId: string, newChildren: RelationItem[]): RelationItem[] => {
        return items.map(item => {
            if (item.id === targetId) {
                return { ...item, children: newChildren, hasChildren: newChildren.length > 0 };
            }
            if (item.children) {
                return { ...item, children: updateNodeChildren(item.children, targetId, newChildren) };
            }
            return item;
        });
    };

    const findParent = (items: RelationItem[], targetId: string): RelationItem | null => {
        for (const item of items) {
            if (item.children && item.children.some(c => c.id === targetId)) {
                return item;
            }
            if (item.children) {
                const found = findParent(item.children, targetId);
                if (found) return found;
            }
        }
        return null;
    };

    const handleKeyNavigation = (e: React.KeyboardEvent) => {
        if (showFilterMenu && e.key === 'Escape') {
            e.stopPropagation();
            setShowFilterMenu(false);
            return;
        }

        if (!selectedId || !root) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            
            // Find current item and its parent (to get siblings)
            let siblings: RelationItem[] = [];
            let index = -1;

            if (root.id === selectedId) {
                // Root selected
                if (e.key === 'ArrowDown' && children.length > 0) {
                    setSelectedId(children[0].id);
                }
                return;
            }

            // Check if it's a direct child of root
            index = children.findIndex(c => c.id === selectedId);
            if (index !== -1) {
                siblings = children;
            } else {
                // Deep search
                const parent = findParent(children, selectedId);
                if (parent && parent.children) {
                    siblings = parent.children;
                    index = siblings.findIndex(c => c.id === selectedId);
                }
            }

            if (index !== -1) {
                if (e.key === 'ArrowDown') {
                    if (index < siblings.length - 1) {
                        setSelectedId(siblings[index + 1].id);
                    }
                } else if (e.key === 'ArrowUp') {
                    if (index > 0) {
                        setSelectedId(siblings[index - 1].id);
                    } else {
                        // Select parent if at top
                        const parent = findParent(children, selectedId);
                        if (parent) {
                            setSelectedId(parent.id);
                        } else {
                            setSelectedId(root.id);
                        }
                    }
                }
            }
        } else if (e.key === 'Enter') {
             // Trigger jump
             // We need to find the item object
             const findItem = (items: RelationItem[], id: string): RelationItem | undefined => {
                 if (root && root.id === id) return root;
                 for (const item of items) {
                     if (item.id === id) return item;
                     if (item.children) {
                         const found = findItem(item.children, id);
                         if (found) return found;
                     }
                 }
                 return undefined;
             };
             
             const item = findItem(children, selectedId);
             if (item) {
                 if (item.isLoadMore) {
                     vscode.postMessage({ command: 'loadMoreRelation' });
                 } else {
                     vscode.postMessage({ 
                        command: 'jump', 
                        uri: item.uri, 
                        range: item.range 
                    });
                 }
             }
        }
    };

    useEffect(() => {
        // Sync selection to controller for commands
        if (selectedId) {
            vscode.postMessage({ command: 'setSelected', itemId: selectedId });

            // Find item to send preview
            const findItem = (items: RelationItem[], id: string): RelationItem | undefined => {
                if (root && root.id === id) return root;
                for (const item of items) {
                    if (item.id === id) return item;
                    if (item.children) {
                        const found = findItem(item.children, id);
                        if (found) return found;
                    }
                }
                return undefined;
            };
            
            const item = findItem(children, selectedId);
            if (item && item.uri && item.range) {
                vscode.postMessage({ 
                    command: 'preview', 
                    uri: item.uri, 
                    range: item.range 
                });
            }
        } else {
            vscode.postMessage({ command: 'setSelected', itemId: null });
        }
    }, [selectedId, root, children]);

    return (
        <div className="relation-app" tabIndex={0} onKeyDown={handleKeyNavigation}>
            {showFilterMenu && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 99,
                        cursor: 'default'
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowFilterMenu(false);
                    }}
                />
            )}
            <div className="search-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="mode-indicator">
                    {showBothDirections 
                        ? 'Both Directions' 
                        : (direction === 'incoming' ? 'Incoming Calls (Callers)' : 'Outgoing Calls (Callees)')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <span 
                            className={`codicon codicon-filter ${
                                (showBothDirections 
                                    ? (incomingFilter.length < ALL_KINDS.length || outgoingFilter.length < ALL_KINDS.length)
                                    : filter.length < ALL_KINDS.length
                                ) ? 'active' : ''
                            }`}
                            onClick={handleFilterClick}
                            title="Filter by Kind"
                            style={{ cursor: 'pointer', display: 'block' }}
                        ></span>
                        {showFilterMenu && (
                            <div className="filter-menu" style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                backgroundColor: 'var(--vscode-dropdown-background)',
                                border: '1px solid var(--vscode-dropdown-border)',
                                zIndex: 100,
                                minWidth: '120px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                marginTop: '4px'
                            }}>
                                <div 
                                    className="filter-menu-item" 
                                    onClick={(e) => { e.stopPropagation(); handleFilterMenuSelect('incoming'); }}
                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--vscode-dropdown-border)', whiteSpace: 'nowrap' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    Incoming Filter
                                </div>
                                <div 
                                    className="filter-menu-item" 
                                    onClick={(e) => { e.stopPropagation(); handleFilterMenuSelect('outgoing'); }}
                                    style={{ padding: '8px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    Outgoing Filter
                                </div>
                            </div>
                        )}
                    </div>
                    {(direction === 'outgoing' || showBothDirections) && (
                        <span 
                            className="codicon codicon-gear"
                            onClick={() => setShowSettingsView(true)}
                            title="Settings"
                            style={{ cursor: 'pointer', marginLeft: '8px' }}
                        ></span>
                    )}
                </div>
            </div>
            {isLoading && (
                <div className="progress-bar-container">
                    <div className="progress-bar"></div>
                </div>
            )}
            <div className="tree-container">
                {root ? (
                    <RelationTree 
                        root={root} 
                        items={children} 
                        direction={direction}
                        selectedId={selectedId}
                        autoExpandBothDirections={autoExpandBothDirections}
                        onSelect={(item) => setSelectedId(item.id)}
                        onExpand={(item: RelationItem, dir: 'incoming' | 'outgoing') => vscode.postMessage({ command: 'resolveHierarchy', itemId: item.id, direction: dir })}
                        onJump={(item: RelationItem, isDouble: boolean | undefined) => {
                            if (item.isLoadMore) {
                                vscode.postMessage({ command: 'loadMoreRelation' });
                                return;
                            }
                            vscode.postMessage({ 
                                command: isDouble ? 'jump' : 'preview', 
                                uri: item.uri, 
                                range: item.range 
                            });
                        }}
                    />
                ) : (
                    <div className="empty-state">
                    </div>
                )}
            </div>
            
            {showFilterView && (
                <FilterView 
                    initialSelection={filterScope === 'incoming' ? incomingFilter : (filterScope === 'outgoing' ? outgoingFilter : filter)}
                    onApply={handleFilterApply}
                    onCancel={() => setShowFilterView(false)}
                />
            )}
            {showSettingsView && (
                <SettingsView 
                    initialSettings={settings} 
                    onApply={handleSettingsApply} 
                    onCancel={() => setShowSettingsView(false)} 
                />
            )}
        </div>
    );
};

export default RelationApp;
