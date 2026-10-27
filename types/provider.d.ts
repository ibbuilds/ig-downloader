/** Adapter contract: JavaScript at runtime, TypeScript declarations for contributors. */
export type MediaMode = 'auto' | 'image' | 'video';
export interface MediaResource {
    id?: string;
    url: string;
    isVideo: boolean;
    /** Optional explicit resource type; audio can coexist with legacy isVideo:false. */
    kind?: 'image' | 'video' | 'audio';
    sourceKind: string;
    format: string;
    width?: number;
    height?: number;
    takenAt?: number | null;
    [metadata: string]: unknown;
}
export interface ProviderResult {
    username?: string;
    items: unknown[];
    sourceType?: string;
}
export interface ProviderContext {
    cookie?: string;
    session?: unknown;
    fetchImpl?: typeof fetch;
    /** Include additional page media tags; not a recursive crawler. */
    all?: boolean;
}
export interface Provider {
    id: string;
    name: string;
    /** Lower-priority fallback for otherwise unmatched HTTPS URLs. */
    fallback?: boolean;
    match(input: string): boolean;
    parse(input: string): unknown;
    resolve(target: unknown, context?: ProviderContext): Promise<ProviderResult>;
    select(item: unknown, mode: MediaMode): MediaResource | null;
    /** Throw if an origin, protocol or redirect is not allowed for this provider. */
    validateUrl(url: string): string;
    createSession?(context?: ProviderContext): unknown;
}
