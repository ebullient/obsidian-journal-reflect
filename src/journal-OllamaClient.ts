import { Notice, requestUrl } from "obsidian";
import type {
    GenerateRequest,
    GenerateResponse,
    ListResponse,
} from "ollama/browser";

export interface IOllamaClient {
    generate(
        model: string,
        systemPrompt: string,
        documentText: string,
        numCtx?: number,
    ): Promise<string | null>;
    checkConnection(): Promise<boolean>;
    listModels(): Promise<string[]>;
}

export class OllamaClient implements IOllamaClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    }

    async generate(
        model: string,
        systemPrompt: string,
        documentText: string,
        numCtx?: number,
    ): Promise<string | null> {
        try {
            const generateRequest: GenerateRequest = {
                model: model,
                prompt: documentText,
                system: systemPrompt,
                stream: false,
            };

            if (typeof numCtx === "number") {
                generateRequest.options = {
                    num_ctx: numCtx,
                };
            }

            const response = await requestUrl({
                url: `${this.baseUrl}/api/generate`,
                method: "POST",
                contentType: "application/json",
                body: JSON.stringify(generateRequest),
            });

            const data: GenerateResponse = response.json;
            return data.response !== undefined ? data.response.trim() : null;
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
            await requestUrl({
                url: `${this.baseUrl}/api/tags`,
                method: "GET",
            });
            return true;
        } catch (_error) {
            return false;
        }
    }

    async listModels(): Promise<string[]> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/api/tags`,
                method: "GET",
            });

            const data: ListResponse = response.json;
            return data.models?.map((model) => model.name) || [];
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
