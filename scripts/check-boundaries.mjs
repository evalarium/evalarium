import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const REPOSITORY_ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const PACKAGE_ROOTS = ['apps', 'packages', 'fixtures'];
const LAYER_BY_PATH = new Map([
  ['packages/core', 0],
  ['packages/capture', 1],
  ['packages/proxy', 1],
  ['packages/shims', 1],
  ['packages/compiler', 2],
  ['packages/runtime', 3],
  ['packages/verify', 4],
  ['packages/adapter-browsergym', 4],
  ['packages/inspector', 4],
  ['packages/mcp', 4],
  ['packages/packager', 4],
]);

const violations = [];
const workspacePackages = [];

for (const root of PACKAGE_ROOTS) {
  const rootPath = path.join(REPOSITORY_ROOT, root);
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const relativePath = `${root}/${entry.name}`;
    const manifestPath = path.join(rootPath, entry.name, 'package.json');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      workspacePackages.push({ manifest, relativePath });
    } catch {
      // environments/ is intentionally allowed to contain documentation only.
    }
  }
}

const packageByName = new Map(
  workspacePackages.map((workspacePackage) => [
    workspacePackage.manifest.name,
    workspacePackage,
  ]),
);

function layerFor(relativePath) {
  if (relativePath === 'packages/config') {
    return -1;
  }
  if (
    relativePath.startsWith('apps/') ||
    relativePath.startsWith('fixtures/')
  ) {
    return 5;
  }
  return LAYER_BY_PATH.get(relativePath);
}

for (const workspacePackage of workspacePackages) {
  const dependencySections = [
    workspacePackage.manifest.dependencies,
    workspacePackage.manifest.devDependencies,
    workspacePackage.manifest.peerDependencies,
  ];
  for (const dependencies of dependencySections) {
    if (dependencies === undefined) {
      continue;
    }
    for (const dependencyName of Object.keys(dependencies)) {
      const dependencyPackage = packageByName.get(dependencyName);
      if (
        dependencyPackage === undefined ||
        dependencyName === '@evalarium/config'
      ) {
        continue;
      }
      const sourceLayer = layerFor(workspacePackage.relativePath);
      const dependencyLayer = layerFor(dependencyPackage.relativePath);
      if (
        sourceLayer !== undefined &&
        dependencyLayer !== undefined &&
        sourceLayer <= dependencyLayer
      ) {
        violations.push(
          `${workspacePackage.relativePath} cannot depend on ${dependencyPackage.relativePath}`,
        );
      }
      if (
        workspacePackage.relativePath.startsWith('apps/') &&
        dependencyPackage.relativePath.startsWith('apps/')
      ) {
        violations.push(
          `${workspacePackage.relativePath} cannot import another app (${dependencyPackage.relativePath})`,
        );
      }
    }
  }
}

async function inspectDirectory(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const sourceFiles = entries.filter(
    (entry) =>
      entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)),
  );
  if (sourceFiles.length > 20) {
    violations.push(
      `${path.relative(REPOSITORY_ROOT, directoryPath)} has ${sourceFiles.length} direct source files`,
    );
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || ['dist', 'node_modules'].includes(entry.name)) {
      continue;
    }
    await inspectDirectory(path.join(directoryPath, entry.name));
  }
}

for (const root of PACKAGE_ROOTS) {
  await inspectDirectory(path.join(REPOSITORY_ROOT, root));
}

if (violations.length > 0) {
  process.stderr.write(`Boundary check failed:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    'Dependency boundaries and source-directory sizes are valid.\n',
  );
}
