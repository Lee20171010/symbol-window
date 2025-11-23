const esbuild = require("esbuild");
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

function copyFile(src, dest) {
	fs.copyFileSync(src, dest);
}

async function main() {
	const extensionCtx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode', '@vscode/ripgrep'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	const webviewCtx = await esbuild.context({
		entryPoints: [
			'src/webview/index.tsx'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/webview.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	// Copy CSS and Fonts
	if (!fs.existsSync('dist')) {
		fs.mkdirSync('dist');
	}
	copyFile('src/webview/style.css', 'dist/style.css');
	copyFile('node_modules/@vscode/codicons/dist/codicon.css', 'dist/codicon.css');
	copyFile('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/codicon.ttf');

	if (watch) {
		// Watch for CSS changes manually if needed, or just copy once on start
		// For simplicity, we just copy on start. In a real watch script we might want to watch these files too.
		await Promise.all([
			extensionCtx.watch(),
			webviewCtx.watch()
		]);
	} else {
		await Promise.all([
			extensionCtx.rebuild(),
			webviewCtx.rebuild()
		]);
		await Promise.all([
			extensionCtx.dispose(),
			webviewCtx.dispose()
		]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});

