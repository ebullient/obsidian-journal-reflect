import {
    type Editor,
    type MarkdownFileInfo,
    MarkdownView,
    Notice,
    Plugin,
    TFile,
} from "obsidian";
import type { JournalReflectSettings } from "./@types/settings";
import {
    DEFAULT_AFFIRMATION_PROMPT,
    DEFAULT_REFLECTION_PROMPT,
    DEFAULT_SETTINGS,
} from "./journal-Constants";
import { OllamaClient } from "./journal-OllamaClient";
import { JournalReflectSettingsTab } from "./journal-SettingsTab";

type ContentType = "reflection" | "affirmation";

const CONTENT_TYPE_LABELS = {
    reflection: "reflection question",
    affirmation: "affirmation",
} as const;

export class JournalReflectPlugin extends Plugin {
    settings!: JournalReflectSettings;
    ollamaClient!: OllamaClient;

    async onload() {
        console.log("Loading Journal Reflect Plugin");

        await this.loadSettings();
        this.ollamaClient = new OllamaClient(this.settings.ollamaUrl);

        this.addSettingTab(new JournalReflectSettingsTab(this.app, this));

        this.addCommand({
            id: "journal-reflect",
            name: "Generate reflection question",
            callback: async () => {
                await this.generateContent("reflection");
            },
        });

        this.addCommand({
            id: "journal-reflect-cursor",
            name: "Generate reflection at cursor",
            editorCallback: async (
                editor: Editor,
                ctx: MarkdownView | MarkdownFileInfo,
            ) => {
                await this.generateContentAtCursor(editor, ctx, "reflection");
            },
        });

        this.addCommand({
            id: "journal-affirmation",
            name: "Generate affirmation",
            callback: async () => {
                await this.generateContent("affirmation");
            },
        });

        this.addCommand({
            id: "journal-affirmation-cursor",
            name: "Generate affirmation at cursor",
            editorCallback: async (
                editor: Editor,
                ctx: MarkdownView | MarkdownFileInfo,
            ) => {
                await this.generateContentAtCursor(editor, ctx, "affirmation");
            },
        });
    }

    onunload() {
        console.log("Unloading Journal Reflect Plugin");
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
        if (this.ollamaClient) {
            this.ollamaClient = new OllamaClient(this.settings.ollamaUrl);
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.ollamaClient = new OllamaClient(this.settings.ollamaUrl);
    }

    async generateContent(type: ContentType) {
        const currentView =
            this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!currentView) {
            new Notice("No active markdown editor found.");
            return;
        }

        const docContent = currentView.editor.getValue();
        const systemPrompt = await this.resolvePrompt(currentView, type);
        const content = await this.getGeneratedContent(
            docContent,
            systemPrompt,
            type,
        );

        if (content) {
            this.insertContentAtEnd(currentView, content, type);
        }
    }

    async generateContentAtCursor(
        editor: Editor,
        ctx: MarkdownView | MarkdownFileInfo,
        type: ContentType,
    ) {
        const docContent = editor.getValue();

        const file = ctx.file;
        if (!file) {
            new Notice("No file context available.");
            return;
        }

        const systemPrompt = await this.resolvePromptFromFile(file, type);
        const content = await this.getGeneratedContent(
            docContent,
            systemPrompt,
            type,
        );

        if (content) {
            this.insertContentAtCursor(editor, content, type);
        }
    }

    private formatAsBlockquote(content: string): string {
        return content
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
    }

    private insertContentAtEnd(
        view: MarkdownView,
        content: string,
        type: ContentType,
    ): void {
        const formattedContent = this.formatAsBlockquote(content);
        const cursorPos = view.editor.getCursor();
        view.editor.setLine(
            cursorPos.line,
            `${view.editor.getLine(cursorPos.line)}\n\n${formattedContent}\n\n`,
        );
        new Notice(`Inserted ${CONTENT_TYPE_LABELS[type]}`);
    }

    private insertContentAtCursor(
        editor: Editor,
        content: string,
        type: ContentType,
    ): void {
        const formattedContent = this.formatAsBlockquote(content);
        editor.replaceSelection(`${formattedContent}\n\n`);
        new Notice(`Inserted ${CONTENT_TYPE_LABELS[type]} at cursor`);
    }

    private async resolvePrompt(
        view: MarkdownView,
        type: ContentType,
    ): Promise<string> {
        const file = view.file;
        if (!file) {
            return this.getDefaultPrompt(type);
        }
        return this.resolvePromptFromFile(file, type);
    }

    private async resolvePromptFromFile(
        file: TFile,
        type: ContentType,
    ): Promise<string> {
        // Get frontmatter using Obsidian's API
        const frontmatter =
            this.app.metadataCache.getFileCache(file)?.frontmatter;

        if (frontmatter) {
            // Check for direct prompt in frontmatter
            if (frontmatter.prompt) {
                if (typeof frontmatter.prompt === "string") {
                    // Single prompt for all commands
                    return frontmatter.prompt;
                }
                if (typeof frontmatter.prompt === "object") {
                    // Object with separate prompts
                    const promptValue =
                        type === "reflection"
                            ? frontmatter.prompt.reflection
                            : frontmatter.prompt.affirmation;
                    if (typeof promptValue === "string") {
                        return promptValue;
                    }
                }
            }

            // Check for prompt-file in frontmatter
            if (frontmatter["prompt-file"]) {
                if (typeof frontmatter["prompt-file"] === "string") {
                    // Single prompt file for all commands
                    const fileContent = await this.readPromptFromFile(
                        frontmatter["prompt-file"],
                    );
                    if (fileContent) {
                        return fileContent;
                    }
                } else if (typeof frontmatter["prompt-file"] === "object") {
                    // Object with separate prompt files
                    const promptFile =
                        type === "reflection"
                            ? frontmatter["prompt-file"].reflection
                            : frontmatter["prompt-file"].affirmation;
                    if (typeof promptFile === "string") {
                        const fileContent =
                            await this.readPromptFromFile(promptFile);
                        if (fileContent) {
                            return fileContent;
                        }
                    }
                }
            }
        }

        // Fallback to global settings or built-in defaults
        return this.getDefaultPrompt(type);
    }

    private async getDefaultPrompt(type: ContentType): Promise<string> {
        // First, try to use the file specified in global settings
        const settingsFilePath =
            type === "reflection"
                ? this.settings.reflectionPromptFile
                : this.settings.affirmationPromptFile;

        if (settingsFilePath) {
            const fileContent = await this.readPromptFromFile(settingsFilePath);
            if (fileContent) {
                return fileContent;
            }
        }

        // Fall back to built-in defaults
        return type === "reflection"
            ? DEFAULT_REFLECTION_PROMPT
            : DEFAULT_AFFIRMATION_PROMPT;
    }

    private async readPromptFromFile(
        promptFilePath: string,
    ): Promise<string | null> {
        const promptFile = this.app.vault.getAbstractFileByPath(promptFilePath);
        if (promptFile instanceof TFile) {
            try {
                const promptContent = await this.app.vault.read(promptFile);
                return promptContent.trim();
            } catch (error) {
                new Notice(`Could not read prompt file: ${promptFilePath}`);
                console.error("Error reading prompt file:", error);
            }
        } else {
            new Notice(`Prompt file not found: ${promptFilePath}`);
        }
        return null;
    }

    private async getGeneratedContent(
        documentText: string,
        systemPrompt: string,
        type: ContentType,
    ): Promise<string | null> {
        if (!documentText.trim()) {
            new Notice("Document is empty. Write something first!");
            return null;
        }

        if (!this.settings.ollamaUrl || !this.settings.modelName) {
            new Notice(
                "Ollama URL or model not configured. Please check settings.",
            );
            return null;
        }

        const isConnected = await this.ollamaClient.checkConnection();
        if (!isConnected) {
            new Notice(
                "Cannot connect to Ollama. Please ensure Ollama is running.",
            );
            return null;
        }

        new Notice(`Generating ${CONTENT_TYPE_LABELS[type]}...`);

        return await this.ollamaClient.generate(
            this.settings.modelName,
            systemPrompt,
            documentText,
        );
    }
}
