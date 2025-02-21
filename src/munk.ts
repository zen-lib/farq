import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { Project, FunctionDeclaration } from 'ts-morph';
import { build, BuildOptions } from 'esbuild';

const project = new Project();
const clientTemplate = readFileSync('src/client.template.ts', 'utf8');
const serverTemplate = readFileSync('src/server.template.ts', 'utf8');

interface Endpoint {
	subDirs: string[];
	functionName: string;
	fileName: string;
	bodyTypeName: string;
	bodyTypeDeclaration: string;
	returnTypeName: string;
	returnTypeDeclaration: string;
}

interface MunkTree {
	dir: string | undefined;
	subs: MunkTree[];
	endpoints: Endpoint[];
}

export type ClientMunkOptions {
	outDir?: string;
	tsOutDir?: string;
	clientName?: string;
}

export type ServerMunkOptions {
	outDir?: string;
	tsOutDir?: string;
	serverFileName?: string;
}
export interface MunkOptions {
	dir: string;
	server: ServerMunkOptions;
	client: ClientMunkOptions;
}

async function munk({
	dir,
	server: { outDir = 'dist', serverFileName = 'server.ts' },
	client: { outDir: clientOutDir = 'dist', clientName = 'ApiClient' },
}: MunkOptions) {

	const tree = readRoutes(dir, []);
	if (!existsSync(outDir)) {
		mkdirSync(outDir, { recursive: true });
	}
	const client = genClient(tree);
	// const justClientFileName = clientFileName.split('.')[0];
	writeFileSync(join(clientOutDir, `${clientName}.ts`), client);

	let baseDirName = dir;
	if (dir.startsWith('./')) {
		baseDirName = dir.slice(2);
	}
	const server = genServer(tree, baseDirName);
	const justServerName = serverFileName.split('.')[0];
	writeFileSync(join(munkDir, `${justServerName}.ts`), server);

	await buildJs({ outDir, munkDir, serverFileName: justServerName, clientFileName: justClientFileName });
}

function genServer(tree: MunkTree, dir: string) {
	let result = serverTemplate.replace('/* {{imports}} */', genImports(tree, dir));
	result = result.replace('/* {{routes}} */', genServerLevel(tree));
	return result;
}

function genImports(tree: MunkTree, baseDirName: string) {
	let result = '';
	for (const endpoint of tree.endpoints) {
		const snakePathPrefix = endpoint.subDirs.join('_');
		result += `import ${snakePathPrefix}_${endpoint.functionName} from '../${baseDirName}/${endpoint.subDirs.join(
			'/'
		)}/${endpoint.fileName}';\n`;
	}
	for (const sub of tree.subs) {
		result += genImports(sub, baseDirName);
	}
	return result;
}

function genServerLevel(tree: MunkTree) {
	let result = '';
	for (const endpoint of tree.endpoints) {
		const snakePathPrefix = endpoint.subDirs.join('_');
		result += `\tapp.post('/${endpoint.subDirs.join('/')}/${endpoint.functionName}', ${snakePathPrefix}_${
			endpoint.functionName
		});\n`;
		// const path = '/' + endpoint.subDirs.join('/') + '/' + endpoint.functionName;
		// result += `\t'${path}': ${snakePathPrefix}_${endpoint.functionName},\n`;
	}
	for (const sub of tree.subs) {
		result += genServerLevel(sub);
	}
	return result;
}

function genNamespacedTypes(tree: MunkTree, level: number) {
	let result = '';
	if (tree.dir) {
		result += `export namespace ${tree.dir} {\n`;
	} else {
		result += `export namespace types {\n`;
	}
	for (const endpoint of tree.endpoints) {
		result +=
			endpoint.bodyTypeDeclaration
				.split('\n')
				.map((line) => '\t' + line)
				.join('\n') + '\n';
		result +=
			endpoint.returnTypeDeclaration
				.split('\n')
				.map((line) => '\t' + line)
				.join('\n') + '\n';
	}
	for (const sub of tree.subs) {
		result += genNamespacedTypes(sub, level + 1);
	}
	result += `}\n`;
	result = result
		.split('\n')
		.map((line) => '\t'.repeat(level) + line)
		.join('\n');
	return result;
}

function genClient(tree: MunkTree) {
	let result = clientTemplate.replace('/* {{imports}} */', genImports(tree, ''));
	result = result.replace('/* {{types}} */', genNamespacedTypes(tree, 0));
	result = result.replace('/* {{functions}} */', genClientLevel(tree, 0));
	return result;
}

function genClientLevel(tree: MunkTree, level: number) {
	let result = '';
	if (tree.dir) {
		const separator = level < 2 ? ' =' : ':';
		result += `${'\t'.repeat(level)}${tree.dir}${separator} {\n`;
	}
	for (const endpoint of tree.endpoints) {
		result += genClientFuncSnippet(endpoint, level);
	}
	for (const sub of tree.subs) {
		result += genClientLevel(sub, level + 1);
	}
	if (tree.dir) {
		result += `${'\t'.repeat(level)}}\n`;
	}
	return result;
}

function readRoutes(baseDir: string, subDirs: string[]): MunkTree {
	const dir = join(baseDir, subDirs.join('/'));
	const items = readdirSync(dir);

	const tree: MunkTree = {
		dir: subDirs.length > 0 ? subDirs[subDirs.length - 1] : undefined,
		subs: [],
		endpoints: [],
	};

	for (const item of items) {
		const fullPath = join(dir, item);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			const nestedTree = readRoutes(baseDir, subDirs.concat(item));
			tree.subs.push(nestedTree);
		} else if (extname(item) === '.ts') {
			try {
				const sourceFile = project.addSourceFileAtPath(fullPath);
				const defaultExport = sourceFile.getExportedDeclarations().get('default')?.[0];
				if (defaultExport?.getKindName() === 'FunctionDeclaration') {
					const functionDeclaration = defaultExport as FunctionDeclaration;
					const functionName = functionDeclaration.getName();
					if (!functionName) {
						continue;
					}
					const { typeName: firstArgTypeName, declaration: firstArgDeclaration } =
						getFirstArgumentDeclaration(functionDeclaration);
					if (!firstArgTypeName || !firstArgDeclaration) {
						continue;
					}
					const { typeName: returnTypeName, declaration: returnDeclaration } =
						getReturnTypeDeclaration(functionDeclaration);
					if (!returnTypeName || !returnDeclaration) {
						continue;
					}

					const endpoint: Endpoint = {
						subDirs,
						functionName,
						fileName: item,
						bodyTypeName: firstArgTypeName,
						bodyTypeDeclaration: firstArgDeclaration,
						returnTypeName,
						returnTypeDeclaration: returnDeclaration,
					};

					tree.endpoints.push(endpoint);
				}
				project.removeSourceFile(sourceFile);
			} catch (error) {
				console.error(`Error processing file ${fullPath}:`, error);
			}
		}
	}
	return tree;
}

function getFirstArgumentDeclaration(functionDeclaration: FunctionDeclaration): {
	typeName: string | undefined;
	declaration: string | undefined;
} {
	const firstParameter = functionDeclaration.getParameters()[0];
	if (!firstParameter) {
		return { typeName: undefined, declaration: undefined };
	}

	const parameterType = firstParameter.getType();
	const typeSymbol = parameterType.getSymbol();

	if (!typeSymbol) {
		return { typeName: parameterType.getText(), declaration: undefined };
	}

	const declarations = typeSymbol.getDeclarations();
	const declaration = declarations[0];

	// Get clean type name without import
	const fullTypeName = parameterType.getText();
	const typeNameMatch = fullTypeName.match(/\.([^.]+)$/);
	const cleanTypeName = typeNameMatch ? typeNameMatch[1] : fullTypeName;

	return {
		typeName: cleanTypeName,
		declaration: declaration?.getText(),
	};
}

function getReturnTypeDeclaration(functionDeclaration: FunctionDeclaration): {
	typeName: string | undefined;
	declaration: string | undefined;
} {
	const returnType = functionDeclaration.getReturnType();
	const promiseTypeArgs = returnType.getTypeArguments();

	if (promiseTypeArgs.length === 0) {
		return { typeName: undefined, declaration: undefined };
	}

	const promiseReturnType = promiseTypeArgs[0];
	const returnTypeSymbol = promiseReturnType.getSymbol();

	if (!returnTypeSymbol) {
		return { typeName: promiseReturnType.getText(), declaration: undefined };
	}

	const returnTypeDeclarations = returnTypeSymbol.getDeclarations();
	const returnTypeDeclaration = returnTypeDeclarations[0];

	// Get clean type name without import
	const fullTypeName = promiseReturnType.getText();
	const typeNameMatch = fullTypeName.match(/\.([^.]+)$/);
	const cleanTypeName = typeNameMatch ? typeNameMatch[1] : fullTypeName;

	return {
		typeName: cleanTypeName,
		declaration: returnTypeDeclaration?.getText(),
	};
}

function genClientFuncSnippet({ subDirs, functionName, bodyTypeName, returnTypeName }: Endpoint, level: number) {
	const path = '/' + subDirs.join('/');
	const dotTypesPath = ['types', ...subDirs].join('.');
	const separator = level === 0 ? ' =' : ' :';
	const end = level === 0 ? ';' : ',';
	return `${'\t'.repeat(
		level + 2
	)}${functionName}${separator} async (body: ${dotTypesPath}.${bodyTypeName}): Promise<${dotTypesPath}.${returnTypeName}> =>
${'\t'.repeat(
	level + 3
)}await this.jet<${dotTypesPath}.${bodyTypeName}, ${dotTypesPath}.${returnTypeName}>('${path}/${functionName}', { body })${end}
`;
}

interface BuildJSOptions {
	outDir: string;
	serverFileName: string;
	clientFileName: string;
	munkDir: string;
}

async function buildJs({ outDir, serverFileName, clientFileName, munkDir }: BuildJSOptions) {
	const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

	const baseConfig: BuildOptions = {
		bundle: true,
		external: [
			// Get all dependencies from package.json
			...Object.keys(pkg.dependencies || {}),
			...Object.keys(pkg.peerDependencies || {}),
			...Object.keys(pkg.devDependencies || {}),
		],
	};

	await Promise.all([
		build({
			...baseConfig,
			entryPoints: [`${munkDir}/${clientFileName}.ts`],
			platform: 'browser',
			format: 'esm',
			outdir: outDir,
		}),
		build({
			...baseConfig,
			entryPoints: [`${munkDir}/${clientFileName}.ts`],
			platform: 'browser',
			format: 'cjs',
			outdir: outDir,
			outExtension: { '.js': '.cjs' },
		}),
		build({
			...baseConfig,
			entryPoints: [`${munkDir}/${serverFileName}.ts`],
			platform: 'node',
			format: 'esm',
			outdir: outDir,
		}),
		build({
			...baseConfig,
			entryPoints: [`${munkDir}/${serverFileName}.ts`],
			platform: 'node',
			format: 'cjs',
			outdir: outDir,
			outExtension: { '.js': '.cjs' },
		}),
	]);
}

export default munk;
