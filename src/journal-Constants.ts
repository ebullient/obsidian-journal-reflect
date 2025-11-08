import type { JournalReflectSettings } from "./@types/settings";

export const DEFAULT_PROMPT = `You are a helpful journaling assistant that helps the user reflect while they journal.
You will be given a user's journal entry as markdown. Blockquotes represent past reflection questions asked by you.
Your job is to read the journal and suggest a reflection question to further stimulate the writer's thoughts and guide their thinking.
Return the reflection question in raw text and not a markdown blockquote.
Keep your response concise and thought-provoking.`;

export const DEFAULT_SETTINGS: JournalReflectSettings = {
    ollamaUrl: "http://localhost:11434",
    modelName: "llama3.1",
    excludePatterns: "",
    keepAlive: "10m",
    prompts: {
        reflection: {
            displayLabel: "reflection question",
        },
        affirmation: {
            displayLabel: "affirmation",
        },
    },
};
