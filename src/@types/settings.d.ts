export interface PromptConfig {
    displayLabel: string;
    promptFile?: string;
    calloutHeading?: string;
    excludeCalloutTypes?: string;
}

export interface ResolvedPrompt {
    prompt: string;
    model?: string;
}

export interface JournalReflectSettings {
    ollamaUrl: string;
    modelName: string;
    excludeLinkPatterns: string;
    prompts: Record<string, PromptConfig>;
}
