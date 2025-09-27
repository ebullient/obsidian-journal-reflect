import { Notice } from "obsidian";
import { Ollama } from "ollama/browser";

export interface IOllamaClient {
    generate(
        model: string,
        systemPrompt: string,
        documentText: string,
    ): Promise<string | null>;
    checkConnection(): Promise<boolean>;
    listModels(): Promise<string[]>;
}

export class OllamaClient implements IOllamaClient {
    private ollama: Ollama;

    constructor(baseUrl: string) {
        this.ollama = new Ollama({ host: baseUrl });
    }

    async generate(
        model: string,
        systemPrompt: string,
        documentText: string,
    ): Promise<string | null> {
        try {
            const response = await this.ollama.generate({
                model: model,
                prompt: documentText,
                system: systemPrompt,
                stream: false,
            });

            return response.response?.trim() || null;
        } catch (error) {
            console.error("Error calling Ollama API: ", error);
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            new Notice(`Ollama API error: ${errorMsg}`);
            return null;
        }
    }

    async checkConnection(): Promise<boolean> {
        try {
            await this.ollama.list();
            return true;
        } catch (_error) {
            return false;
        }
    }

    async listModels(): Promise<string[]> {
        try {
            const response = await this.ollama.list();
            return response.models?.map((model) => model.name) || [];
        } catch (error) {
            console.error("Error fetching models:", error);
            return [];
        }
    }

    // Factory method for testing
    static createForTesting(baseUrl: string): OllamaClient {
        return new OllamaClient(baseUrl);
    }
}
