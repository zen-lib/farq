import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { Project, FunctionDeclaration } from 'ts-morph';

// TODO: think how to resolve import paths for both client and server
// * need to think how to determine output dir for both client and server
// * as they are not acutally related to entryDir at the moment
// * maybe router and client outputs needs to be set relative to entryDir

const project = new Project();
// TODO: move inside the function and read path from options
const clientTemplate = readFileSync('src/client.template.ts', 'utf8');
const serverTemplate = readFileSync('src/server.template.ts', 'utf8');

export type EasyRpcOptions = {
	entryDir: string;
	endpointPathPrefix?: string;
	routerFilePath?: string;
	client?: ClientOptions;
};

export type ClientOptions = {
	outDir?: string;
	clientName?: string;
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
	// TODO: implement endpointPathPrefix
	endpointPathPrefix = '',
	routerFilePath = 'src/rpcRouter.ts',
	client = {},
}: EasyRpcOptions) {
	const clientName = client?.clientName || 'RpcClient';
	const routerOutDir = routerFilePath.split('/').slice(0, -1).join('/');
	const clientOutDir = client?.outDir || 'src/client/';

	const tree = readRoutes(entryDir, []);

	if (!existsSync(routerOutDir)) {
		mkdirSync(routerOutDir, { recursive: true });
	}
	if (!existsSync(clientOutDir)) {
		mkdirSync(clientOutDir, { recursive: true });
	}

	const clientCode = genClient(tree, clientOutDir);
	const justClientFileName = `${clientName}.ts`;
	writeFileSync(join(clientOutDir, justClientFileName), clientCode);

	let baseDirName = entryDir;
	if (entryDir.startsWith('./')) {
		baseDirName = entryDir.slice(2);
	}
	const routerCode = genRouter(tree, baseDirName);
	writeFileSync(routerFilePath, routerCode);
}

function genRouter(tree: EasyRpcTree, dir: string) {
	let result = updateRouterTemplate(serverTemplate, tree, dir, {});
	result = result.replace('/* {{imports}} */', '');
	result = result.replace('/* {{routes}} */', '');
	return result;
}

function updateRouterTemplate(
	template: string,
	tree: EasyRpcTree,
	baseDirName: string,
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
			`import ${funcName} from '../${baseDirName}/${endpoint.subDirs.join('/')}/${endpoint.fileName}';\n` +
			template.slice(importInsertIndex);

		const routeInsertIndex = template.indexOf('/* {{routes}} */');
		template =
			template.slice(0, routeInsertIndex) +
			`\tapp.post('/${endpoint.subDirs.join('/')}/${endpoint.functionName}', ${funcName});\n` +
			template.slice(routeInsertIndex);
	}
	for (const sub of tree.subs) {
		template = updateRouterTemplate(template, sub, baseDirName, usedNames);
	}
	return template;
}

function genClient(tree: EasyRpcTree, dir: string) {
	let result = updateClientTemplate(clientTemplate, tree, dir, 0, {});
	result = result.replace('/* {{imports}} */', '');
	result = result.replace('/* {{functions}} */', '');
	return result;
}

function updateClientTemplate(
	template: string,
	tree: EasyRpcTree,
	baseDirName: string,
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
			`import { ${bodyName}, ${returnName} } from '../${baseDirName}/${endpoint.subDirs.join('/')}/${
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
				genClientFuncSnippet({ ...endpoint, bodyTypeName: bodyName, returnTypeName: returnName }, level) +
				template.slice(funcInsertIndex);
		}
		for (const sub of tree.subs) {
			template = updateClientTemplate(template, sub, baseDirName, level + 1, usedNames);
		}
		if (tree.dir) {
			template = template.slice(0, funcInsertIndex) + `${'\t'.repeat(level)}}\n` + template.slice(funcInsertIndex);
		}
	}
	for (const sub of tree.subs) {
		template = updateClientTemplate(template, sub, baseDirName, level + 1, usedNames);
	}
	return template;
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
