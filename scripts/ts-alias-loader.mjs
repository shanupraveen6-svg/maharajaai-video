// Node ESM loader hooks so plain `node` can import the project's TypeScript sources:
// resolves the "@/..." alias and extensionless relative imports to .ts files.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function withTsExtension(base) {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = withTsExtension(path.join(SRC, specifier.slice(2)));
    if (resolved) return { url: resolved, shortCircuit: true };
  } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL?.startsWith('file:')) {
    const resolved = withTsExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (resolved) return { url: resolved, shortCircuit: true };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Package subpaths like "next/server" lack an exports map entry under plain Node ESM.
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && !specifier.startsWith('.') && !specifier.startsWith('/') && !path.extname(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}
