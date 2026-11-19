import { handle, type Env } from './handler';

interface ExecutionContext {
  waitUntil(p: Promise<unknown>): void;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cache = (globalThis as unknown as { caches?: { default: NonNullable<Parameters<typeof handle>[2]['cache']> } }).caches?.default;
    return handle(request, env, { fetch: (...a) => fetch(...a), cache, waitUntil: (p) => ctx.waitUntil(p) });
  },
};
