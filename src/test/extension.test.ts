import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseCStyleType, parseSignature } from '../features/symbol/SymbolModel';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('parseCStyleType should extract type suffixes', () => {
		const cases = [
			{ input: 'MyStruct (struct)', expectedName: 'MyStruct', expectedType: 'struct' },
			{ input: 'MyTypedef (typedef)', expectedName: 'MyTypedef', expectedType: 'typedef' },
			{ input: 'MyEnum (enum)', expectedName: 'MyEnum', expectedType: 'enum' },
			{ input: 'NormalName', expectedName: 'NormalName', expectedType: '' },
			{ input: 'NameWithSpace (struct)', expectedName: 'NameWithSpace', expectedType: 'struct' },
            { input: '   Indented (class)', expectedName: '   Indented', expectedType: 'class' }
		];

		cases.forEach(c => {
			const result = parseCStyleType(c.input);
			assert.strictEqual(result.name.trim(), c.expectedName.trim(), `Name mismatch for ${c.input}`);
			assert.strictEqual(result.type, c.expectedType, `Type mismatch for ${c.input}`);
		});
	});

	test('parseSignature should extract function parameters', () => {
		const cases = [
			{ input: 'myFunction(int a, int b)', expectedName: 'myFunction', expectedSig: '(int a, int b)' },
			{ input: 'noParams()', expectedName: 'noParams', expectedSig: '()' },
			{ input: 'complex(std::vector<int> v)', expectedName: 'complex', expectedSig: '(std::vector<int> v)' },
			{ input: 'variable', expectedName: 'variable', expectedSig: '' },
            { input: '   spacedFunction (int x)', expectedName: '   spacedFunction', expectedSig: '(int x)' }
		];

		cases.forEach(c => {
			const result = parseSignature(c.input);
			assert.strictEqual(result.name.trim(), c.expectedName.trim(), `Name mismatch for ${c.input}`);
			assert.strictEqual(result.signature, c.expectedSig, `Signature mismatch for ${c.input}`);
		});
	});

    test('parseSignature should handle nested parentheses roughly', () => {
        // The current regex is greedy \s*(\(.*\))$, so it takes from the first ( found at the end?
        // Wait, regex was /\s*(\(.*\))$/
        // If input is "func(a, b(c))", it matches "(a, b(c))"
        const input = 'func(a, b(c))';
        const result = parseSignature(input);
        assert.strictEqual(result.name, 'func');
        assert.strictEqual(result.signature, '(a, b(c))');
    });
});
