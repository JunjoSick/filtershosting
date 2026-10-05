// Public raw URLs are an API: publish real files, never redirects or symlinks.
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PUBLIC_FILES = Object.freeze({
  'fuckquiantella.txt': 'sources/filters/fuckquiantella.txt',
  'fuckgazzettinodelchianti.txt': 'sources/filters/fuckgazzettinodelchianti.txt',
  'fuckdaicollifiorentini.txt': 'sources/filters/fuckdaicollifiorentini.txt',
  'fuckfirenzedintorni.txt': 'sources/filters/fuckfirenzedintorni.txt',
  'kebablastazione.txt': 'sources/filters/kebablastazione.txt',
  'quiantella-adblocker.user.js': 'sources/userscripts/quiantella-adblocker.user.js',
  'article-cards.user.js': 'sources/userscripts/article-cards.user.js',
});

async function regularFile(root, file, { optional = false } = {}) {
  const target = path.join(root, file);
  try {
    if (!(await lstat(target)).isFile()) throw new Error(`Expected regular file: ${file}`);
    return await readFile(target);
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function differences(root) {
  // Read every source before writing anything; incomplete inputs fail closed.
  return Promise.all(Object.entries(PUBLIC_FILES).map(async ([output, source]) => ({
    output, source,
    content: await regularFile(root, source),
    previous: await regularFile(root, output, { optional: true }),
  })));
}

export async function buildPublicFiles(root) {
  const changed = (await differences(root)).filter(({ content, previous }) => !previous?.equals(content));
  for (const { output, content } of changed) await writeFile(path.join(root, output), content);
  return changed.map(({ output }) => output);
}

export async function checkPublicFiles(root) {
  const stale = (await differences(root)).filter(({ content, previous }) => !previous?.equals(content));
  if (stale.length) throw new Error(`Public files differ from sources: ${stale.map(({ output }) => output).join(', ')}; run npm run build`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'build') console.log(`Updated ${(await buildPublicFiles(process.cwd())).length} public compatibility files`);
    else if (process.argv[2] === 'check') { await checkPublicFiles(process.cwd()); console.log('Verified public compatibility files'); }
    else throw new Error('Usage: node tools/public-files.mjs build|check');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
