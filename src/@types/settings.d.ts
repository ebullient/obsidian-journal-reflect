export interface PromptConfig {
    name: string;
    displayLabel: string;
    promptFile: string;
    prompt?: string;
    calloutHeading?: string;
    excludeCalloutTypes?: string;
}

export interface JournalReflectSettings {
    ollamaUrl: string;
    modelName: string;
    excludeLinkPatterns: string;
    prompts: Record<string, PromptConfig>;
}
