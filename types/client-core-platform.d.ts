/**
 * WHAT A HOST MUST PROVIDE TO THE CLIENT CORE (`app/present/`), and nothing more (2026-10-10).
 *
 * `tsconfig.core.json` type-checks the core with ES2022 alone — no browser types — so a use of
 * `document`, `HTMLElement` or any other page API fails the check. The two platform services the
 * core does use are declared here, in the narrow shape it calls them with. Browsers, Node 18+,
 * Cloudflare Workers and React Native all provide them.
 */

interface CoreFetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  json(): Promise<any>;
}

declare function fetch(
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<CoreFetchResponse>;

declare var crypto: { getRandomValues<T extends ArrayBufferView | null>(array: T): T } | undefined;

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare function queueMicrotask(callback: () => void): void;
