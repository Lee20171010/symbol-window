import React, { useState, useEffect, useRef } from 'react';
import { VSCodeButton, VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';
import { RelationSettings } from '../../../shared/common/types';

interface SettingsViewProps {
    initialSettings: RelationSettings;
    onApply: (settings: RelationSettings) => void;
    onCancel: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ initialSettings, onApply, onCancel }) => {
    const [settings, setSettings] = useState<RelationSettings>(initialSettings);
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
            onApply(settings);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
        }
    };

    const toggleSetting = (key: keyof RelationSettings) => {
        setSettings((prev: RelationSettings) => ({
            ...prev,
            [key]: !prev[key]
        }));
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
                    <span className="title">Settings</span>
                    <span className="codicon codicon-close close-btn" onClick={onCancel}></span>
                </div>

                <div className="filter-list" style={{ padding: '10px' }}>
                    <div 
                        style={{ marginBottom: '15px', cursor: 'pointer' }}
                        onClick={() => toggleSetting('removeDuplicate')}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                            <VSCodeCheckbox 
                                checked={settings.removeDuplicate} 
                                style={{ pointerEvents: 'none' }}
                                tabIndex={-1}
                            />
                            <span style={{ marginLeft: '8px' }}>Remove Duplicate</span>
                        </div>
                        <div style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)', marginLeft: '28px', lineHeight: '1.3', opacity: 0.9 }}>
                            Show only one result for same name (preserves multiple definitions)
                        </div>
                    </div>

                    <div 
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleSetting('showDefinitionPath')}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                            <VSCodeCheckbox 
                                checked={settings.showDefinitionPath} 
                                style={{ pointerEvents: 'none' }}
                                tabIndex={-1}
                            />
                            <span style={{ marginLeft: '8px' }}>Show Definition Path</span>
                        </div>
                        <div style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)', marginLeft: '28px', lineHeight: '1.3', opacity: 0.9 }}>
                            Show definition path instead of call path in details
                        </div>
                    </div>
                </div>

                <div className="filter-footer">
                    <VSCodeButton appearance="secondary" onClick={onCancel}>Cancel</VSCodeButton>
                    <VSCodeButton appearance="primary" onClick={() => onApply(settings)}>OK</VSCodeButton>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
