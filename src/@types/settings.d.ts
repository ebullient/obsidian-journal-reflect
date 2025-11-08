export interface PromptConfig {
    displayLabel: string;
    promptFile?: string;
    calloutHeading?: string;
    excludeCalloutTypes?: string;
}

export interface ResolvedPrompt {
    prompt: string;
    model?: string;
    numCtx?: number;
    isContinuous?: boolean;
    includeLinks?: boolean;
    excludePatterns?: RegExp[];
    sourcePath?: string;
    temperature?: number;
    topP?: number;
    repeatPenalty?: number;
}

export interface JournalReflectSettings {
    ollamaUrl: string;
    modelName: string;
    prompts: Record<string, PromptConfig>;
    excludePatterns: string;
    excludeLinkPatterns?: string;
    keepAlive: string;
}
