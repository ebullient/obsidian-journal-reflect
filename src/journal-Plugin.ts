import {
    type Editor,
    type MarkdownFileInfo,
    MarkdownView,
    Notice,
    Plugin,
    TFile,
} from "obsidian";
import type { JournalReflectSettings } from "./@types/settings";
import { DEFAULT_SETTINGS } from "./journal-Constants";
import { OllamaClient } from "./journal-OllamaClient";
import { JournalReflectSettingsTab } from "./journal-SettingsTab";

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
                await this.generateReflection();
            },
        });

        this.addCommand({
            id: "journal-reflect-cursor",
            name: "Generate reflection at cursor",
            editorCallback: async (
                editor: Editor,
                ctx: MarkdownView | MarkdownFileInfo,
            ) => {
                await this.generateReflectionAtCursor(editor, ctx);
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

    async generateReflection() {
        const currentView =
            this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!currentView) {
            new Notice("No active markdown editor found.");
            return;
        }

        const docContent = currentView.editor.getValue();
        const systemPrompt = await this.resolveSystemPrompt(currentView);
        const reflectionQuestion = await this.getReflectionQuestion(
            docContent,
            systemPrompt,
        );

        if (reflectionQuestion) {
            const formattedQuestion = reflectionQuestion
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n");

            const cursorPos = currentView.editor.getCursor();
            currentView.editor.setLine(
                cursorPos.line,
                `${currentView.editor.getLine(cursorPos.line)}\n\n${formattedQuestion}\n\n`,
            );

            new Notice("Reflection question inserted!");
        }
    }

    async generateReflectionAtCursor(
        editor: Editor,
        ctx: MarkdownView | MarkdownFileInfo,
    ) {
        const docContent = editor.getValue();

        // Get the file from either context type
        const file = ctx instanceof MarkdownView ? ctx.file : ctx.file;
        if (!file) {
            new Notice("No file context available.");
            return;
        }

        const systemPrompt = await this.resolveSystemPromptFromFile(file);
        const reflectionQuestion = await this.getReflectionQuestion(
            docContent,
            systemPrompt,
        );

        if (reflectionQuestion) {
            const formattedQuestion = reflectionQuestion
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n");

            editor.replaceSelection(`${formattedQuestion}\n\n`);
            new Notice("Reflection question inserted at cursor!");
        }
    }

    private async resolveSystemPrompt(view: MarkdownView): Promise<string> {
        const file = view.file;
        if (!file) {
            return this.settings.systemPrompt;
        }
        return this.resolveSystemPromptFromFile(file);
    }

    private async resolveSystemPromptFromFile(file: TFile): Promise<string> {
        // Get frontmatter using Obsidian's API
        const frontmatter =
            this.app.metadataCache.getFileCache(file)?.frontmatter;

        if (frontmatter) {
            // Check for direct prompt in frontmatter
            if (frontmatter.prompt && typeof frontmatter.prompt === "string") {
                return frontmatter.prompt;
            }

            // Check for prompt-file in frontmatter
            if (
                frontmatter["prompt-file"] &&
                typeof frontmatter["prompt-file"] === "string"
            ) {
                const promptFile = this.app.vault.getAbstractFileByPath(
                    frontmatter["prompt-file"],
                );
                if (promptFile instanceof TFile) {
                    try {
                        const promptContent =
                            await this.app.vault.read(promptFile);
                        return promptContent.trim();
                    } catch (error) {
                        new Notice(
                            `Could not read prompt file: ${frontmatter["prompt-file"]}`,
                        );
                        console.error("Error reading prompt file:", error);
                    }
                } else {
                    new Notice(
                        `Prompt file not found: ${frontmatter["prompt-file"]}`,
                    );
                }
            }
        }

        // Fallback to plugin settings
        return this.settings.systemPrompt;
    }

    private async getReflectionQuestion(
        documentText: string,
        systemPrompt: string,
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

        new Notice("Generating reflection question...");

        return await this.ollamaClient.generateReflection(
            this.settings.modelName,
            systemPrompt,
            documentText,
        );
    }
}
