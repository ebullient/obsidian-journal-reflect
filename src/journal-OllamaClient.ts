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
        options?: GenerateOptions,
    ): Promise<GenerateResult>;
    checkConnection(): Promise<boolean>;
    listModels(): Promise<string[]>;
}

export interface GenerateOptions {
    numCtx?: number;
    context?: number[];
}

export interface GenerateResult {
    response: string | null;
    context?: number[];
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
        options?: GenerateOptions,
    ): Promise<GenerateResult> {
        try {
            const generateRequest: GenerateRequest = {
                model: model,
                prompt: documentText,
                system: systemPrompt,
                stream: false,
            };

            if (options?.numCtx !== undefined) {
                generateRequest.options = {
                    num_ctx: options.numCtx,
                };
            }
            if (options?.context && options.context.length > 0) {
                generateRequest.context = options.context;
            }

            const response = await requestUrl({
                url: `${this.baseUrl}/api/generate`,
                method: "POST",
                contentType: "application/json",
                body: JSON.stringify(generateRequest),
            });

            const data: GenerateResponse = response.json;
            return {
                response:
                    data.response !== undefined ? data.response.trim() : null,
                context: data.context,
            };
        } catch (error) {
            console.error("Error calling Ollama API: ", error);
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            new Notice(`Ollama API error: ${errorMsg}`);
            return { response: null };
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
