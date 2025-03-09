import { build } from 'esbuild';
import { createRequire } from 'module';
import process from 'process';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

/** @type {import('esbuild').BuildOptions} */
const baseConfig = {
	bundle: false,
	// external: [
	// 	// Get all dependencies from package.json
	// 	...Object.keys(pkg.dependencies || {}),
	// 	...Object.keys(pkg.peerDependencies || {}),
	// 	...Object.keys(pkg.devDependencies || {}),
	// ],
};

Promise.all([
	build({
		...baseConfig,
		entryPoints: ['src/munk_cli.ts', 'src/munk.ts'],
		platform: 'node',
		format: 'esm',
		outdir: 'dist',
	}),
]).catch(() => process.exit(1));
