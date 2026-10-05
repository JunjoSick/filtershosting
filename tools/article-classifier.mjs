import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { classify } from './article-disclosure.mjs';

if (!isMainThread) parentPort.on('message', ({ site, html }) => {
  const metrics = {};
  try { parentPort.postMessage({ decision: classify(site, html, { metrics }), reason: metrics.limited, metrics }); }
  catch { parentPort.postMessage({ decision: 'review', reason: 'unreadable-content' }); }
});

// One reusable worker; its parent timer can terminate even synchronous parsing.
export class DisclosureClassifier {
  constructor({ timeoutMs = 1000 } = {}) { this.timeoutMs = timeoutMs; this.worker = null; this.busy = false; }
  async classify(site, html, { signal } = {}) {
    signal?.throwIfAborted();
    if (this.busy) throw new Error('Classifier requests must be sequential');
    this.busy = true;
    const worker = this.worker ||= new Worker(new URL(import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 128 } });
    try {
      return await new Promise((resolve, reject) => {
        let finished = false;
        const finish = (value, error, terminate = false) => {
          if (finished) return; finished = true;
          clearTimeout(timer); worker.off('message', message); worker.off('error', failed); worker.off('exit', exited); signal?.removeEventListener('abort', aborted);
          if (terminate) { this.worker = null; void worker.terminate(); }
          if (error) reject(error); else resolve(value);
        };
        const message = value => finish(value);
        const failed = () => finish({ decision: 'review', reason: 'classification-worker-failed' }, null, true);
        const exited = () => failed();
        const aborted = () => finish(null, signal.reason, true);
        const timer = setTimeout(() => finish({ decision: 'review', reason: 'classification-time-limit' }, null, true), this.timeoutMs);
        worker.once('message', message); worker.once('error', failed); worker.once('exit', exited); signal?.addEventListener('abort', aborted, { once: true });
        if (signal?.aborted) aborted(); else worker.postMessage({ site, html });
      });
    } finally { this.busy = false; }
  }
  async close() { const worker = this.worker; this.worker = null; if (worker) await worker.terminate(); }
}
