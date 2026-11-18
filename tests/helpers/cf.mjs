// Node testlerinde `cloudflare:workers` modülünü basit bir DurableObject sınıfıyla değiştirir.
import { register } from 'node:module';
const stub = 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: ${JSON.stringify(stub)}, shortCircuit: true };
  return next(specifier, context);
}`));
