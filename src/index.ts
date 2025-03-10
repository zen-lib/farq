import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, extname, relative } from 'path';
import { Project, FunctionDeclaration } from 'ts-morph';

// TODO: generate from client and router fragment templates

const project = new Project();

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
};

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
	 * Path to the router template file
	 * @default "src/router.template.ts"
	 */
	templatePath?: string;
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
	 * @default "src/client/client.template.ts"
	 */
	templatePath?: string;
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
	router = {},
	client = {},
}: EasyRpcOptions) {
	const clientName = client?.clientName || 'RpcClient';
	const routerOutPath = router?.outPath || 'src/rpcRouter.ts';
	const routerOutDir = routerOutPath.split('/').slice(0, -1).join('/');
	const clientOutDir = client?.outDir || 'src/client/';
	const clientTemplatePath = client?.templatePath || 'src/client/client.template.ts';
	const routerTemplatePath = router?.templatePath || 'src/router.template.ts';

	// Ensure endpointPathPrefix has leading and trailing slashes
	if (endpointPathPrefix !== '/') {
		endpointPathPrefix = endpointPathPrefix.startsWith('/') ? endpointPathPrefix : '/' + endpointPathPrefix;
		endpointPathPrefix = endpointPathPrefix.endsWith('/') ? endpointPathPrefix : endpointPathPrefix + '/';
	}

	const clientTemplate = readFileSync(clientTemplatePath, 'utf8');
	const routerTemplate = readFileSync(routerTemplatePath, 'utf8');

	const tree = readRoutes(entryDir, []);

	if (!existsSync(routerOutDir)) {
		mkdirSync(routerOutDir, { recursive: true });
	}
	if (!existsSync(clientOutDir)) {
		mkdirSync(clientOutDir, { recursive: true });
	}

	const clientToEntryRel = relative(clientOutDir, entryDir);
	const clientCode = genClient(tree, clientToEntryRel, endpointPathPrefix, clientTemplate);
	const justClientFileName = `${clientName}.ts`;
	writeFileSync(join(clientOutDir, justClientFileName), clientCode);

	let baseDirName = entryDir;
	if (entryDir.startsWith('./')) {
		baseDirName = entryDir.slice(2);
	}
	const routerToEntryRel = relative(routerOutDir, entryDir);
	const routerCode = genRouter(tree, routerToEntryRel, endpointPathPrefix, routerTemplate);
	writeFileSync(routerOutPath, routerCode);
}

function genRouter(tree: EasyRpcTree, relPathToEntry: string, prefix: string, template: string) {
	let result = updateRouterTemplate(template, tree, relPathToEntry, prefix, {});
	result = result.replace('/* {{imports}} */', '');
	result = result.replace('/* {{routes}} */', '');
	return result;
}

function updateRouterTemplate(
	template: string,
	tree: EasyRpcTree,
	relPathToEntry: string,
	prefix: string,
	usedNames: { [name: string]: number }
) {
	for (const endpoint of tree.endpoints) {
		let funcName = endpoint.functionName;
		if (usedNames[funcName]) {
			usedNames[funcName]++;
			funcName = `${funcName}_${usedNames[funcName]}`;
		}
		const importInsertIndex = template.indexOf('/* {{imports}} */');
		template =
			template.slice(0, importInsertIndex) +
			`import ${funcName} from '${relPathToEntry}/${endpoint.subDirs.join('/')}/${endpoint.fileName}';\n` +
			template.slice(importInsertIndex);

		const routeInsertIndex = template.indexOf('/* {{routes}} */');
		template =
			template.slice(0, routeInsertIndex) +
			`\tapp.post('${prefix}${endpoint.subDirs.join('/')}/${endpoint.functionName}', ${funcName});\n` +
			template.slice(routeInsertIndex);
	}
	for (const sub of tree.subs) {
		template = updateRouterTemplate(template, sub, relPathToEntry, prefix, usedNames);
	}
	return template;
}

function genClient(tree: EasyRpcTree, relPathToEntry: string, prefix: string, template: string) {
	let result = updateClientTemplate(template, tree, relPathToEntry, prefix, 0, {});
	result = result.replace('/* {{imports}} */', '');
	result = result.replace('/* {{functions}} */', '');
	return result;
}

function updateClientTemplate(
	template: string,
	tree: EasyRpcTree,
	relPathToEntry: string,
	prefix: string,
	level: number,
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

		const importsInsertIndex = template.indexOf('/* {{imports}} */');
		template =
			template.slice(0, importsInsertIndex) +
			`import { ${bodyName}, ${returnName} } from '${relPathToEntry}/${endpoint.subDirs.join('/')}/${
				endpoint.fileName
			}';\n` +
			template.slice(importsInsertIndex);

		const funcInsertIndex = template.indexOf('/* {{functions}} */');

		if (tree.dir) {
			template =
				template.slice(0, funcInsertIndex) + `${'\t'.repeat(level)}${tree.dir}: {\n` + template.slice(funcInsertIndex);
		}
		for (const endpoint of tree.endpoints) {
			template =
				template.slice(0, funcInsertIndex) +
				genClientFuncSnippet({ ...endpoint, bodyTypeName: bodyName, returnTypeName: returnName }, prefix, level) +
				template.slice(funcInsertIndex);
		}
		for (const sub of tree.subs) {
			template = updateClientTemplate(template, sub, relPathToEntry, prefix, level + 1, usedNames);
		}
		if (tree.dir) {
			template = template.slice(0, funcInsertIndex) + `${'\t'.repeat(level)}}\n` + template.slice(funcInsertIndex);
		}
	}
	for (const sub of tree.subs) {
		template = updateClientTemplate(template, sub, relPathToEntry, prefix, level + 1, usedNames);
	}
	return template;
}

function genClientFuncSnippet(
	{ subDirs, functionName, bodyTypeName, returnTypeName }: Endpoint,
	prefix: string,
	level: number
) {
	const path = prefix + subDirs.join('/');
	const dotTypesPath = ['types', ...subDirs].join('.');
	const separator = level === 0 ? ' =' : ' :';
	const end = level === 0 ? ';' : ',';
	return `${'\t'.repeat(
		level + 2
	)}${functionName}${separator} async (body: ${dotTypesPath}.${bodyTypeName}): Promise<${dotTypesPath}.${returnTypeName}> =>
${'\t'.repeat(
	level + 3
)}await jet<${dotTypesPath}.${bodyTypeName}, ${dotTypesPath}.${returnTypeName}>('${path}/${functionName}', { body })${end}
`;
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
