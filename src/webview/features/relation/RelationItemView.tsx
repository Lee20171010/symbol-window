import React, { useState, useEffect, useRef } from 'react';
import { RelationItem } from '../../../shared/common/types';
import { getSymbolIconInfo } from '../../utils';

interface RelationItemViewProps {
    item: RelationItem;
    direction: 'incoming' | 'outgoing';
    isRoot?: boolean;
    expanded?: boolean;
    selectedId: string | null;
    onSelect: (item: RelationItem) => void;
    onExpand: (item: RelationItem, direction: 'incoming' | 'outgoing') => void;
    onJump: (item: RelationItem, isDouble?: boolean) => void;
    autoExpandBothDirections?: boolean;
}

const RelationItemView: React.FC<RelationItemViewProps> = ({ item, direction, isRoot, expanded: initialExpanded, selectedId, onSelect, onExpand, onJump, autoExpandBothDirections }) => {
    const [expanded, setExpanded] = useState(() => {
        if (initialExpanded) return true;
        if (item.isCategory && autoExpandBothDirections) return true;
        return false;
    });
    const itemRef = useRef<HTMLDivElement>(null);
    const wasClicked = useRef(false);
    
    const effectiveDirection = item.direction || direction;

    useEffect(() => {
        if (item.isLoadMore && itemRef.current) {
            const observer = new IntersectionObserver(
                (entries) => {
                    if (entries[0].isIntersecting) {
                        onJump(item, false);
                    }
                },
                { threshold: 0.1 }
            );
            observer.observe(itemRef.current);
            return () => observer.disconnect();
        }
    }, [item.isLoadMore, onJump, item]);

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!expanded && (!item.children || item.children.length === 0)) {
            onExpand(item, effectiveDirection);
        }
        setExpanded(!expanded);
    };

    const handleClick = () => {
        if (item.isLoadMore) {
            // Special handling for Load More
            onJump(item, false); // Reuse onJump to trigger command, but we need to distinguish
            return;
        }
        // Select item
        wasClicked.current = true;
        onSelect(item);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent bubbling to parent
        if (item.isLoadMore) {
            return;
        }
        // Double click: Jump (transfer focus)
        onJump(item, true);
    };

    const getIconInfo = () => {
        if (item.isLoadMore) {
            return { icon: 'codicon-loading codicon-modifier-spin', color: undefined };
        }
        const info = getSymbolIconInfo(item.kind);
        return { icon: info.icon, color: `var(${info.colorVar})` };
    };

    const iconInfo = getIconInfo();

    const isSelected = selectedId === item.id;

    useEffect(() => {
        if (isSelected && itemRef.current) {
            if (wasClicked.current) {
                wasClicked.current = false;
                return;
            }
            itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
    }, [isSelected]);

    const contextValue = JSON.stringify({
        webviewSection: 'relation-window-view',
        hasTarget: !!item.targetUri,
        targetUri: item.targetUri,
        targetRange: item.targetRange,
        targetSelectionRange: item.targetSelectionRange,
        preventDefaultContextMenuItems: true
    });

    return (
        <div className="relation-item-container">
            <div 
                ref={itemRef}
                className={`relation-item ${isRoot ? 'root' : ''} ${item.isLoadMore ? 'load-more' : ''} ${isSelected ? 'selected' : ''} ${item.isDeepSearch ? 'deep-search-result' : ''}`} 
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                data-vscode-context={contextValue}
            >
                <span 
                    className={`codicon codicon-chevron-right expand-icon ${expanded ? 'expanded' : ''} ${!item.hasChildren ? 'hidden' : ''}`}
                    onClick={handleExpand}
                />
                {item.isDeepSearch ? (
                    <span className="codicon codicon-zap deep-search-icon" title="Deep Search Result"></span>
                ) : (
                    (!isRoot && !item.isCategory) && (
                        <span className="codicon codicon-zap deep-search-icon placeholder"></span>
                    )
                )}
                <span 
                    className={`codicon ${iconInfo.icon} symbol-icon`} 
                    style={iconInfo.color ? { color: iconInfo.color } : undefined}
                />
                <span className={`name ${isRoot ? 'root' : ''}`}>{item.name}</span>
                <span className="detail">{item.detail}</span>
                {item.path && <span className="path">{item.path}</span>}
            </div>
            {expanded && item.children && (
                <div className="relation-children">
                    {item.children.map(child => (
                        <RelationItemView 
                            key={child.id} 
                            item={child} 
                            direction={effectiveDirection}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onExpand={onExpand}
                            onJump={onJump}
                            autoExpandBothDirections={autoExpandBothDirections}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default RelationItemView;
