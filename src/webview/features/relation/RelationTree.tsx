import React from 'react';
import { RelationItem } from '../../../shared/common/types';
import RelationItemView from './RelationItemView';

interface RelationTreeProps {
    root: RelationItem;
    items: RelationItem[];
    direction: 'incoming' | 'outgoing';
    selectedId: string | null;
    onSelect: (item: RelationItem) => void;
    onExpand: (item: RelationItem, direction: 'incoming' | 'outgoing') => void;
    onJump: (item: RelationItem, isDouble?: boolean) => void;
    autoExpandBothDirections?: boolean;
}

const RelationTree: React.FC<RelationTreeProps> = ({ root, items, direction, selectedId, onSelect, onExpand, onJump, autoExpandBothDirections }) => {
    // We treat the root as a regular item that is initially expanded and has 'items' as its children.
    // However, 'root' object itself might not have 'children' property populated with 'items'.
    // So we construct a temporary root object that includes the children.
    const rootWithChildren = { ...root, children: items, hasChildren: items.length > 0 };

    return (
        <div className="relation-tree">
            <div className="relation-root-container">
                <RelationItemView 
                    item={rootWithChildren} 
                    direction={direction}
                    isRoot={true} 
                    expanded={true}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onExpand={onExpand} 
                    onJump={onJump}
                    autoExpandBothDirections={autoExpandBothDirections}
                />
            </div>
        </div>
    );
};

export default RelationTree;
