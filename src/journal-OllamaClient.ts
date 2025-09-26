import { Notice } from "obsidian";

interface OllamaRequest {
    model: string;
    prompt: string;
    system?: string;
    stream?: boolean;
}

interface OllamaResponse {
    response: string;
    done: boolean;
}

export class OllamaClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }

    async generateReflection(
        model: string,
        systemPrompt: string,
        documentText: string,
    ): Promise<string | null> {
        try {
            const prompt = `Suggest a reflection question for this journal:

${documentText}`;

            const request: OllamaRequest = {
                model: model,
                prompt: prompt,
                system: systemPrompt,
                stream: false,
            };

            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            const data: OllamaResponse = await response.json();
            return data.response?.trim() || null;
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
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: "GET",
            });
            return response.ok;
        } catch (_error) {
            return false;
        }
    }

    async listModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            return (
                data.models?.map((model: { name: string }) => model.name) || []
            );
        } catch (error) {
            console.error("Error fetching models:", error);
            return [];
        }
    }
}
