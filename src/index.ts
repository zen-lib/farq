import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, extname, relative, dirname } from 'path';
import { Project, FunctionDeclaration } from 'ts-morph';
import { fileURLToPath } from 'url';

const project = new Project();

// Get the directory of the current module (works in both ESM and CJS)
const getCurrentDir = () => {
	try {
		// For ESM
		if (typeof import.meta.url !== 'undefined') {
			return dirname(fileURLToPath(import.meta.url));
		}
	} catch (e) {
		// Fallback for CJS or environments where import.meta is not available
		return process.cwd();
	}
	return process.cwd();
};

/**
 * Configuration options for the Easy RPC library
 */
export type EasyRpcOptions = {
	/** Directory containing the RPC endpoint functions */
	entryDir: string;
	/**
	 * URL path prefix for all endpoints
	 * @default "/"
	 */
	endpointPathPrefix?: string;
	/**
	 * Client generation options
	 * @default {}
	 */
	client?: ClientOptions;
	/**
	 * Router generation options
	 * @default {}
	 */
	router?: RouterOptions;
	/**
	 * Indentation string for the generated code
	 * @default "\t"
	 */
	indent?: string;
};

/**
 * Supported server frameworks
 */
export type ServerType = 'fastify' | 'express' | 'koa' | 'hono';

/**
 * Options for router generation
 */
export type RouterOptions = {
	/**
	 * Output file path for the generated router
	 * @default "src/rpcRouter.ts"
	 */
	outPath?: string;
	/**
	 * Server framework to use for the router
	 * @default "fastify"
	 */
	serverType?: ServerType;
	/**
	 * Path to the router template file
	 * If not provided, will use the default template for the specified serverType.
	 * Can be an absolute path or a path relative to the templates directory.
	 */
	templatePath?: string;
	/**
	 * Path to the router fragment template file
	 * If not provided, will use the default fragment for the specified serverType.
	 * Can be an absolute path or a path relative to the templates directory.
	 */
	fragmentPath?: string;
};

/**
 * Options for client generation
 */
export type ClientOptions = {
	/**
	 * Output directory for the generated client
	 * @default "src/client/"
	 */
	outDir?: string;
	/**
	 * Name of the generated client class
	 * @default "RpcClient"
	 */
	clientName?: string;
	/**
	 * Path to the client template file
	 * If not provided, will use the default template.
	 * Can be an absolute path or a path relative to the templates directory.
	 */
	templatePath?: string;
	/**
	 * Path to the client fragment template file
	 * If not provided, will use the default fragment.
	 * Can be an absolute path or a path relative to the templates directory.
	 */
	fragmentPath?: string;
};

interface Endpoint {
	subDirs: string[];
	functionName: string;
	fileName: string;
	bodyTypeName: string;
	returnTypeName: string;
}

interface EasyRpcTree {
	dir: string | undefined;
	subs: EasyRpcTree[];
	endpoints: Endpoint[];
}

export default async function easyRpc({
	entryDir,
	endpointPathPrefix = '/',
	indent = '\t',
	router = {},
	client = {},
}: EasyRpcOptions) {
	const clientName = client?.clientName || 'RpcClient';
	const routerOutPath = router?.outPath || 'src/rpcRouter.ts';
	const routerOutDir = routerOutPath.split('/').slice(0, -1).join('/');
	const clientOutDir = client?.outDir || 'src/client/';

	// Use the serverType from router options if provided, otherwise use the global one
	const routerServerType = router?.serverType || 'fastify';

	// Get the directory of the current module
	const currentDir = getCurrentDir();

	// Determine template paths based on server type
	// Paths are relative to the module's directory
	const resolveTemplatePath = (path: string) => {
		if (path.startsWith('/')) {
			// Absolute path
			return path;
		}
		// Relative path - resolve from the module's directory
		return join(currentDir, '..', 'src', 'templates', path);
	};

	const clientTemplatePath = client?.templatePath || resolveTemplatePath('client.ts.template');
	const clientFragmentPath = client?.fragmentPath || resolveTemplatePath('client.ts.fragment');
	const routerTemplatePath = router?.templatePath || resolveTemplatePath(`${routerServerType}/router.ts.template`);
	const routerFragmentPath = router?.fragmentPath || resolveTemplatePath(`${routerServerType}/route.ts.fragment`);

	// Ensure endpointPathPrefix has leading and trailing slashes
	if (endpointPathPrefix !== '/') {
		endpointPathPrefix = endpointPathPrefix.startsWith('/') ? endpointPathPrefix : '/' + endpointPathPrefix;
		endpointPathPrefix = endpointPathPrefix.endsWith('/') ? endpointPathPrefix : endpointPathPrefix + '/';
	}

	try {
		const clientTemplate = readFileSync(clientTemplatePath, 'utf8');
		const clientFragment = readFileSync(clientFragmentPath, 'utf8');
		const routerTemplate = readFileSync(routerTemplatePath, 'utf8');
		const routerFragment = readFileSync(routerFragmentPath, 'utf8');

		const tree = readRoutes(entryDir, []);

		if (!existsSync(routerOutDir)) {
			mkdirSync(routerOutDir, { recursive: true });
		}
		if (!existsSync(clientOutDir)) {
			mkdirSync(clientOutDir, { recursive: true });
		}

		const clientToEntryRel = relative(clientOutDir, entryDir);
		const clientCode = genClient(tree, clientToEntryRel, endpointPathPrefix, clientTemplate, clientFragment, indent);
		const justClientFileName = `${clientName}.ts`;
		writeFileSync(join(clientOutDir, justClientFileName), clientCode);

		let baseDirName = entryDir;
		if (entryDir.startsWith('./')) {
			baseDirName = entryDir.slice(2);
		}
		const routerToEntryRel = relative(routerOutDir, entryDir);
		const routerCode = genRouter(tree, routerToEntryRel, endpointPathPrefix, routerTemplate, routerFragment, indent);
		writeFileSync(routerOutPath, routerCode);
	} catch (error: any) {
		console.error('Error generating RPC code:', error);
		if (error.code === 'ENOENT') {
			console.error(`Could not find template file. Make sure the template paths are correct.`);
			console.error(`Current template paths:`);
			console.error(`- Client template: ${clientTemplatePath}`);
			console.error(`- Client fragment: ${clientFragmentPath}`);
			console.error(`- Router template: ${routerTemplatePath}`);
			console.error(`- Router fragment: ${routerFragmentPath}`);
			console.error(`\nModule directory: ${currentDir}`);
			console.error(
				`\nTry providing absolute paths to the templates or check if the templates exist in the expected location.`
			);
		}
		throw error;
	}
}

function genRouter(
	tree: EasyRpcTree,
	relPathToEntry: string,
	prefix: string,
	template: string,
	fragment: string,
	indent: string
) {
	let result = updateRouterTemplate(template, fragment, tree, relPathToEntry, prefix, indent, {});
	result = result.replace('{{imports}}', '');
	result = result.replace('{{routes}}', '');
	return result;
}

function updateRouterTemplate(
	template: string,
	fragment: string,
	tree: EasyRpcTree,
	relPathToEntry: string,
	prefix: string,
	indent: string,
	usedNames: { [name: string]: number }
) {
	for (const endpoint of tree.endpoints) {
		let funcName = endpoint.functionName;
		if (usedNames[funcName]) {
			usedNames[funcName]++;
			funcName = `${funcName}_${usedNames[funcName]}`;
		}
		const importInsertIndex = template.indexOf('{{imports}}');
		template =
			template.slice(0, importInsertIndex) +
			`import ${funcName} from '${relPathToEntry}/${endpoint.subDirs.join('/')}/${endpoint.fileName}';\n` +
			template.slice(importInsertIndex);

		const routeInsertIndex = template.indexOf('{{routes}}');
		template =
			template.slice(0, routeInsertIndex) +
			addIndent(
				fragment
					.replace('{{endpoint}}', `${prefix}${endpoint.subDirs.join('/')}/${endpoint.functionName}`)
					.replace('{{bodyTypeName}}', endpoint.bodyTypeName)
					.replace('{{functionName}}', funcName),
				indent,
				1
			) +
			template.slice(routeInsertIndex);
	}
	for (const sub of tree.subs) {
		template = updateRouterTemplate(template, fragment, sub, relPathToEntry, prefix, indent, usedNames);
	}
	return template;
}

function genClient(
	tree: EasyRpcTree,
	relPathToEntry: string,
	prefix: string,
	template: string,
	fragment: string,
	indent: string
) {
	let result = updateClientTemplate(template, fragment, tree, relPathToEntry, prefix, 0, indent, {});
	result = result.replace('{{imports}}', '');
	result = result.replace('{{functions}}', '');
	return result;
}

function updateClientTemplate(
	template: string,
	fragment: string,
	tree: EasyRpcTree,
	relPathToEntry: string,
	prefix: string,
	level: number,
	indent: string,
	usedNames: { [name: string]: number }
) {
	for (const endpoint of tree.endpoints) {
		let bodyName = endpoint.bodyTypeName;
		if (usedNames[bodyName]) {
			usedNames[bodyName]++;
			bodyName = `${bodyName}_${usedNames[bodyName]}`;
		}
		let returnName = endpoint.returnTypeName;
		if (usedNames[returnName]) {
			usedNames[returnName]++;
			returnName = `${returnName}_${usedNames[returnName]}`;
		}

		const importsInsertIndex = template.indexOf('{{imports}}');
		template =
			template.slice(0, importsInsertIndex) +
			`import { ${bodyName}, ${returnName} } from '${relPathToEntry}/${endpoint.subDirs.join('/')}/${
				endpoint.fileName
			}';\n` +
			template.slice(importsInsertIndex);

		const funcInsertIndex = template.indexOf('{{functions}}');

		if (tree.dir) {
			template =
				template.slice(0, funcInsertIndex) +
				`${indent.repeat(level)}${tree.dir}: {\n` +
				template.slice(funcInsertIndex);
		}
		for (const endpoint of tree.endpoints) {
			template =
				template.slice(0, funcInsertIndex) +
				genClientFuncSnippet(
					{ ...endpoint, bodyTypeName: bodyName, returnTypeName: returnName },
					prefix,
					level,
					indent,
					fragment
				) +
				template.slice(funcInsertIndex);
		}
		for (const sub of tree.subs) {
			template = updateClientTemplate(template, fragment, sub, relPathToEntry, prefix, level + 1, indent, usedNames);
		}
		if (tree.dir) {
			template = template.slice(0, funcInsertIndex) + `${indent.repeat(level)}}\n` + template.slice(funcInsertIndex);
		}
	}
	for (const sub of tree.subs) {
		template = updateClientTemplate(template, fragment, sub, relPathToEntry, prefix, level + 1, indent, usedNames);
	}
	return template;
}

function genClientFuncSnippet(
	{ subDirs, functionName, bodyTypeName, returnTypeName }: Endpoint,
	prefix: string,
	level: number,
	indent: string,
	fragment: string
) {
	const path = prefix + subDirs.join('/');
	const dotTypesPath = ['types', ...subDirs].join('.');
	const separator = level === 0 ? ' =' : ' :';
	const end = level === 0 ? ';' : ',';

	return addIndent(
		fragment
			.replace('{{functionName}}', functionName)
			.replace('{{bodyTypeName}}', bodyTypeName)
			.replace('{{returnTypeName}}', returnTypeName)
			.replace('{{endpoint}}', `${path}/${functionName}`),
		indent,
		level + 2
	);
}

function readRoutes(baseDir: string, subDirs: string[]): EasyRpcTree {
	const dir = join(baseDir, subDirs.join('/'));
	const items = readdirSync(dir);

	const tree: EasyRpcTree = {
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
					const firstArgTypeName = getFirstArgumentTypeName(functionDeclaration);
					if (!firstArgTypeName) {
						continue;
					}
					const returnTypeName = getReturnTypeName(functionDeclaration);
					if (!returnTypeName) {
						continue;
					}

					const endpoint: Endpoint = {
						subDirs,
						functionName,
						fileName: item,
						bodyTypeName: firstArgTypeName,
						returnTypeName,
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

function getFirstArgumentTypeName(functionDeclaration: FunctionDeclaration): string | undefined {
	const firstParameter = functionDeclaration.getParameters()[0];
	if (!firstParameter) {
		return;
	}
	const parameterType = firstParameter.getType();
	return parameterType.getText();
}

function getReturnTypeName(functionDeclaration: FunctionDeclaration): string | undefined {
	const returnType = functionDeclaration.getReturnType();
	const promiseTypeArgs = returnType.getTypeArguments();

	if (promiseTypeArgs.length === 0) {
		return;
	}

	const promiseReturnType = promiseTypeArgs[0];
	return promiseReturnType.getText();
}

function addIndent(str: string, indent: string, level: number) {
	return str
		.split('\n')
		.map((line) => indent.repeat(level) + line)
		.join('\n');
}
