// Global window type extensions for journal-reflect plugin
type FilterFn = (content: string) => string;

declare global {
    interface Window {
        journal?: {
            filters?: Record<string, FilterFn>;
        };
    }
}

export type { FilterFn };
