export interface PromptConfig {
    name: string;
    displayLabel: string;
    promptFile: string;
    prompt?: string;
}

export interface JournalReflectSettings {
    ollamaUrl: string;
    modelName: string;
    prompts: Record<string, PromptConfig>;
}
