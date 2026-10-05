import { execFileSync } from 'node:child_process';
import { check } from './article-cards.mjs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
await check(process.cwd());
const allowed = ['article-cards/state.json', 'fucksponsors.txt', 'sponsored-article-cards.txt',
  ...['gazzettinodelchianti.it', 'quiantella.it', 'daicollifiorentini.it', 'firenzedintorni.it'].map(h => `article-cards/registries/${h}.json`)];
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).split('\n').filter(Boolean);
if (dirty.some(line => !allowed.includes(line.slice(3)))) throw new Error('Unexpected changes in discovery checkout');
if (dirty.length) {
  git('add', '--', ...allowed);
  git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', 'Update optional sponsored article cards');
}
