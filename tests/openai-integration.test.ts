import { describe, it, expect, beforeAll } from "vitest";
import { OpenAICompatibleClient } from "../src/pflow-OpenAICompatibleClient";
import { ConnectionConfig, Logger } from "../src/@types";

// Integration test for OpenAICompatibleClient (llama-server, OpenWebUI, ...)
// Set OPENAI_URL in .env or it defaults to http://localhost:8080
// Set OPENAI_MODEL in .env to force a specific generation model
// Set OPENAI_API_KEY in .env if the server requires one
// Make sure the server is running and has a model loaded

// A lone half of a surrogate pair. JSON.stringify emits it as "\ud83c",
// which strict server-side parsers reject: llama-server answers 500 and the
// whole request is lost. See replaceUnpairedSurrogates in pflow-Utils.
const LONE_SURROGATE =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// U+1F3B4 is astral: two UTF-16 code units, D83C DFB4.
const EMOJI_DOCUMENT = [
    "## Tarot",
    "",
    "- 🎴 Four of Swords: rest, retreat, recovery.",
    "- ✅ A plain BMP character, safe either way.",
].join("\n");

const logger: Logger = {
    logInfo: function (message: string, ...params: unknown[]): void {
        console.log(message, ...params);
    },
    logWarn: function (message: string, ...params: unknown[]): void {
        console.log(message, ...params);
    },
    logError: function (error: unknown, message: string, ...params: unknown[]) {
        console.log(error, message, ...params);
        return "error";
    },
    logDebug: function (message: string, ...params: unknown[]): void {
        console.log(message, ...params);
    },
    logLlmRequest: function (payload: unknown): void {
        console.log(payload);
    },
    logReasoning: function (reasoning: string): void {
        console.log(reasoning);
    }
}

describe("OpenAICompatibleClient Integration Test", () => {
    let client: OpenAICompatibleClient;
    let selectedModel: string;

    const openaiUrl = process.env.OPENAI_URL || "http://localhost:8080";
    const apiKey = process.env.OPENAI_API_KEY || "no-key";
    const preferredModel = process.env.OPENAI_MODEL;

    // Terse instructions: a short answer finishes with stop rather than
    // length, and the client throws on a length finish_reason.
    const systemPrompt = "Answer in one short sentence. Be brief.";

    beforeAll(async () => {
        const connectionConfig: ConnectionConfig = {
            provider: "openai-compatible",
            baseUrl: openaiUrl,
        };
        client = new OpenAICompatibleClient(
            openaiUrl,
            apiKey,
            logger,
            connectionConfig,
            // Prefix auto-detection has nowhere to persist in a test
            async () => {},
        );

        const isConnected = await client.checkConnection();
        if (!isConnected) {
            throw new Error(`No OpenAI-compatible server at ${openaiUrl}. Start one, e.g.: llama-server -m model.gguf --jinja`);
        }

        const models = await client.listModels();
        if (models.length === 0) {
            throw new Error(`No models reported by ${openaiUrl}. Load a model first.`);
        }

        if (preferredModel) {
            if (!models.includes(preferredModel)) {
                throw new Error(
                    `Configured OPENAI_MODEL '${preferredModel}' is not available. Models: ${models.join(", ")}`,
                );
            }
            selectedModel = preferredModel;
        } else {
            selectedModel = models[0];
        }

        console.log(`🔗 Testing with OpenAI-compatible server at: ${openaiUrl}`);
        console.log(`📦 Models: ${models.join(', ')}`);
        console.log(`🎯 Selected model: ${selectedModel}`);
    });

    // Regression: conversation history used to be encoded to number[] one
    // code point at a time, which dropped the low half of every astral pair.
    // The next request replayed that history with a lone surrogate in it and
    // the server rejected the whole body as invalid JSON.
    it("keeps an emoji intact when context is replayed", async () => {
        const first = await client.generate(
            selectedModel,
            systemPrompt,
            EMOJI_DOCUMENT,
        );
        expect(first.response).toBeTruthy();

        const context = first.context;
        expect(context).toBeDefined();
        if (!context || context.kind !== "messages") {
            throw new Error(`Expected a message context, got: ${JSON.stringify(context)}`);
        }

        // The document we sent must come back byte for byte
        const sent = context.messages.find((m) => m.role === "user");
        expect(sent?.content).toBe(EMOJI_DOCUMENT);
        expect(sent?.content).not.toMatch(LONE_SURROGATE);

        // Replaying it is the request that used to fail. A rejected body
        // surfaces as a null response: generate() reports errors, not throws.
        const second = await client.generate(
            selectedModel,
            systemPrompt,
            "Which card did I mention?",
            { context },
        );
        expect(second.response).toBeTruthy();

        const replayed = second.context;
        if (!replayed || replayed.kind !== "messages") {
            throw new Error(`Expected a message context, got: ${JSON.stringify(replayed)}`);
        }
        expect(replayed.messages.some((m) => m.content === EMOJI_DOCUMENT)).toBe(true);
        for (const message of replayed.messages) {
            expect(message.content).not.toMatch(LONE_SURROGATE);
        }
    }, 60000);
});
