// src/munk.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, extname } from "path";
import { Project } from "ts-morph";
import { build } from "esbuild";
var project = new Project();
var clientTemplate = readFileSync("src/client.template.ts", "utf8");
var serverTemplate = readFileSync("src/server.template.ts", "utf8");
async function munk({
  dir,
  outDir = "./dist",
  serverFileName = "server.ts",
  clientFileName = "client.ts",
  munkDir = "./.munk"
}) {
  const tree = readRoutes(dir, []);
  if (!existsSync(munkDir)) {
    mkdirSync(munkDir, { recursive: true });
  }
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const client = genClient(tree);
  const justClientFileName = clientFileName.split(".")[0];
  writeFileSync(join(munkDir, `${justClientFileName}.ts`), client);
  let baseDirName = dir;
  if (dir.startsWith("./")) {
    baseDirName = dir.slice(2);
  }
  const server = genServer(tree, baseDirName);
  const justServerName = serverFileName.split(".")[0];
  writeFileSync(join(munkDir, `${justServerName}.ts`), server);
  await buildJs({ outDir, munkDir, serverFileName: justServerName, clientFileName: justClientFileName });
}
function genServer(tree, dir) {
  let result = serverTemplate.replace("/* {{imports}} */", genImports(tree, dir));
  result = result.replace("/* {{routes}} */", genServerLevel(tree));
  return result;
}
function genImports(tree, baseDirName) {
  let result = "";
  for (const endpoint of tree.endpoints) {
    const snakePathPrefix = endpoint.subDirs.join("_");
    result += `import ${snakePathPrefix}_${endpoint.functionName} from '../${baseDirName}/${endpoint.subDirs.join(
      "/"
    )}/${endpoint.fileName}';
`;
  }
  for (const sub of tree.subs) {
    result += genImports(sub, baseDirName);
  }
  return result;
}
function genServerLevel(tree) {
  let result = "";
  for (const endpoint of tree.endpoints) {
    const snakePathPrefix = endpoint.subDirs.join("_");
    result += `	app.post('/${endpoint.subDirs.join("/")}/${endpoint.functionName}', ${snakePathPrefix}_${endpoint.functionName});
`;
  }
  for (const sub of tree.subs) {
    result += genServerLevel(sub);
  }
  return result;
}
function genNamespacedTypes(tree, level) {
  let result = "";
  if (tree.dir) {
    result += `export namespace ${tree.dir} {
`;
  } else {
    result += `export namespace types {
`;
  }
  for (const endpoint of tree.endpoints) {
    result += endpoint.bodyTypeDeclaration.split("\n").map((line) => "	" + line).join("\n") + "\n";
    result += endpoint.returnTypeDeclaration.split("\n").map((line) => "	" + line).join("\n") + "\n";
  }
  for (const sub of tree.subs) {
    result += genNamespacedTypes(sub, level + 1);
  }
  result += `}
`;
  result = result.split("\n").map((line) => "	".repeat(level) + line).join("\n");
  return result;
}
function genClient(tree) {
  let result = clientTemplate.replace("/* {{imports}} */", genImports(tree, ""));
  result = result.replace("/* {{types}} */", genNamespacedTypes(tree, 0));
  result = result.replace("/* {{functions}} */", genClientLevel(tree, 0));
  return result;
}
function genClientLevel(tree, level) {
  let result = "";
  if (tree.dir) {
    const separator = level < 2 ? " =" : ":";
    result += `${"	".repeat(level)}${tree.dir}${separator} {
`;
  }
  for (const endpoint of tree.endpoints) {
    result += genClientFuncSnippet(endpoint, level);
  }
  for (const sub of tree.subs) {
    result += genClientLevel(sub, level + 1);
  }
  if (tree.dir) {
    result += `${"	".repeat(level)}}
`;
  }
  return result;
}
function readRoutes(baseDir, subDirs) {
  const dir = join(baseDir, subDirs.join("/"));
  const items = readdirSync(dir);
  const tree = {
    dir: subDirs.length > 0 ? subDirs[subDirs.length - 1] : void 0,
    subs: [],
    endpoints: []
  };
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const nestedTree = readRoutes(baseDir, subDirs.concat(item));
      tree.subs.push(nestedTree);
    } else if (extname(item) === ".ts") {
      try {
        const sourceFile = project.addSourceFileAtPath(fullPath);
        const defaultExport = sourceFile.getExportedDeclarations().get("default")?.[0];
        if (defaultExport?.getKindName() === "FunctionDeclaration") {
          const functionDeclaration = defaultExport;
          const functionName = functionDeclaration.getName();
          if (!functionName) {
            continue;
          }
          const { typeName: firstArgTypeName, declaration: firstArgDeclaration } = getFirstArgumentDeclaration(functionDeclaration);
          if (!firstArgTypeName || !firstArgDeclaration) {
            continue;
          }
          const { typeName: returnTypeName, declaration: returnDeclaration } = getReturnTypeDeclaration(functionDeclaration);
          if (!returnTypeName || !returnDeclaration) {
            continue;
          }
          const endpoint = {
            subDirs,
            functionName,
            fileName: item,
            bodyTypeName: firstArgTypeName,
            bodyTypeDeclaration: firstArgDeclaration,
            returnTypeName,
            returnTypeDeclaration: returnDeclaration
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
function getFirstArgumentDeclaration(functionDeclaration) {
  const firstParameter = functionDeclaration.getParameters()[0];
  if (!firstParameter) {
    return { typeName: void 0, declaration: void 0 };
  }
  const parameterType = firstParameter.getType();
  const typeSymbol = parameterType.getSymbol();
  if (!typeSymbol) {
    return { typeName: parameterType.getText(), declaration: void 0 };
  }
  const declarations = typeSymbol.getDeclarations();
  const declaration = declarations[0];
  const fullTypeName = parameterType.getText();
  const typeNameMatch = fullTypeName.match(/\.([^.]+)$/);
  const cleanTypeName = typeNameMatch ? typeNameMatch[1] : fullTypeName;
  return {
    typeName: cleanTypeName,
    declaration: declaration?.getText()
  };
}
function getReturnTypeDeclaration(functionDeclaration) {
  const returnType = functionDeclaration.getReturnType();
  const promiseTypeArgs = returnType.getTypeArguments();
  if (promiseTypeArgs.length === 0) {
    return { typeName: void 0, declaration: void 0 };
  }
  const promiseReturnType = promiseTypeArgs[0];
  const returnTypeSymbol = promiseReturnType.getSymbol();
  if (!returnTypeSymbol) {
    return { typeName: promiseReturnType.getText(), declaration: void 0 };
  }
  const returnTypeDeclarations = returnTypeSymbol.getDeclarations();
  const returnTypeDeclaration = returnTypeDeclarations[0];
  const fullTypeName = promiseReturnType.getText();
  const typeNameMatch = fullTypeName.match(/\.([^.]+)$/);
  const cleanTypeName = typeNameMatch ? typeNameMatch[1] : fullTypeName;
  return {
    typeName: cleanTypeName,
    declaration: returnTypeDeclaration?.getText()
  };
}
function genClientFuncSnippet({ subDirs, functionName, bodyTypeName, returnTypeName }, level) {
  const path = "/" + subDirs.join("/");
  const dotTypesPath = ["types", ...subDirs].join(".");
  const separator = level === 0 ? " =" : " :";
  const end = level === 0 ? ";" : ",";
  return `${"	".repeat(
    level + 2
  )}${functionName}${separator} async (body: ${dotTypesPath}.${bodyTypeName}): Promise<${dotTypesPath}.${returnTypeName}> =>
${"	".repeat(
    level + 3
  )}await this.jet<${dotTypesPath}.${bodyTypeName}, ${dotTypesPath}.${returnTypeName}>('${path}/${functionName}', { body })${end}
`;
}
async function buildJs({ outDir, serverFileName, clientFileName, munkDir }) {
  const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
  const baseConfig = {
    bundle: true,
    external: [
      // Get all dependencies from package.json
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      ...Object.keys(pkg.devDependencies || {})
    ]
  };
  await Promise.all([
    build({
      ...baseConfig,
      entryPoints: [`${munkDir}/${clientFileName}.ts`],
      platform: "browser",
      format: "esm",
      outdir: outDir
    }),
    build({
      ...baseConfig,
      entryPoints: [`${munkDir}/${clientFileName}.ts`],
      platform: "browser",
      format: "cjs",
      outdir: outDir,
      outExtension: { ".js": ".cjs" }
    }),
    build({
      ...baseConfig,
      entryPoints: [`${munkDir}/${serverFileName}.ts`],
      platform: "node",
      format: "esm",
      outdir: outDir
    }),
    build({
      ...baseConfig,
      entryPoints: [`${munkDir}/${serverFileName}.ts`],
      platform: "node",
      format: "cjs",
      outdir: outDir,
      outExtension: { ".js": ".cjs" }
    })
  ]);
}
var munk_default = munk;
export {
  munk_default as default
};
