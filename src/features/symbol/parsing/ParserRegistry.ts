
import { SymbolParser } from './SymbolParser';
import { CStyleParser } from './strategies/CStyleParser';
import { DefaultParser } from './strategies/DefaultParser';

export class ParserRegistry {
    private parsers = new Map<string, SymbolParser>();
    private defaultParser = new DefaultParser();
    
    // Default mapping for auto mode
    private languageMap: Record<string, string> = {
        'c': 'c-style',
        'cpp': 'c-style',
        'java': 'c-style',
        'csharp': 'c-style',
        'objective-c': 'c-style',
        'objective-cpp': 'c-style'
    };

    constructor() {
        this.register(new CStyleParser());
        this.register(new DefaultParser());
    }

    public register(parser: SymbolParser) {
        this.parsers.set(parser.id, parser);
    }

    public getParser(languageId: string, configMode: string): SymbolParser {
        // 1. User forced mode
        if (configMode && configMode !== 'auto') {
            if (this.parsers.has(configMode)) {
                return this.parsers.get(configMode)!;
            }
            // Fallback to default if mode not found (e.g. typo in settings)
            return this.defaultParser;
        }

        // 2. Auto mode based on language ID
        const mappedMode = this.languageMap[languageId];
        if (mappedMode && this.parsers.has(mappedMode)) {
            return this.parsers.get(mappedMode)!;
        }

        // 3. Fallback
        return this.defaultParser;
    }
}

export const parserRegistry = new ParserRegistry();
