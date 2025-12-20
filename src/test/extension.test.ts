import * as assert from 'assert';
import * as vscode from 'vscode';
import { CStyleParser } from '../features/symbol/parsing/strategies/CStyleParser';

suite('CStyleParser Test Suite', () => {
	const parser = new CStyleParser();

	test('should extract type suffixes', () => {
		const cases = [
			{ input: 'MyStruct (struct)', expectedName: 'MyStruct', expectedDetailContains: 'struct' },
			{ input: 'MyTypedef (typedef)', expectedName: 'MyTypedef', expectedDetailContains: 'typedef' },
			{ input: 'MyEnum (enum)', expectedName: 'MyEnum', expectedDetailContains: 'enum' },
			{ input: 'NormalName', expectedName: 'NormalName', expectedDetailContains: '' },
			{ input: 'NameWithSpace (struct)', expectedName: 'NameWithSpace', expectedDetailContains: 'struct' },
            { input: '   Indented (class)', expectedName: '   Indented', expectedDetailContains: 'class' }
		];

		cases.forEach(c => {
			const result = parser.parse(c.input, '', vscode.SymbolKind.Struct);
			assert.strictEqual(result.name.trim(), c.expectedName.trim(), `Name mismatch for ${c.input}`);
			if (c.expectedDetailContains) {
                assert.ok(result.detail.includes(c.expectedDetailContains), `Detail mismatch for ${c.input}. Got: ${result.detail}`);
            }
		});
	});

	test('should extract function parameters', () => {
		const cases = [
			{ input: 'myFunction(int a, int b)', expectedName: 'myFunction', expectedDetailContains: '(int a, int b)' },
			{ input: 'noParams()', expectedName: 'noParams', expectedDetailContains: '()' },
			{ input: 'complex(std::vector<int> v)', expectedName: 'complex', expectedDetailContains: '(std::vector<int> v)' },
			{ input: 'variable', expectedName: 'variable', expectedDetailContains: '' },
            { input: '   spacedFunction (int x)', expectedName: '   spacedFunction', expectedDetailContains: '(int x)' }
		];

		cases.forEach(c => {
			const result = parser.parse(c.input, '', vscode.SymbolKind.Function);
			assert.strictEqual(result.name.trim(), c.expectedName.trim(), `Name mismatch for ${c.input}`);
            if (c.expectedDetailContains) {
			    assert.ok(result.detail.includes(c.expectedDetailContains), `Detail mismatch for ${c.input}. Got: ${result.detail}`);
            }
		});
	});

    test('should handle nested parentheses roughly', () => {
        const input = 'func(a, b(c))';
        const result = parser.parse(input, '', vscode.SymbolKind.Function);
        assert.strictEqual(result.name, 'func');
        assert.ok(result.detail.includes('(a, b(c))'));
    });
});
