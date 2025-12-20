export const getSymbolIconInfo = (kind: number) => {
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

export { symbolKindNames } from '../shared/common/symbolKinds';
