import {
    type Editor,
    type MarkdownFileInfo,
    MarkdownView,
    Notice,
    Plugin,
    TFile,
} from "obsidian";
import type { JournalReflectSettings } from "./@types/settings";
import { DEFAULT_PROMPT, DEFAULT_SETTINGS } from "./journal-Constants";
import { OllamaClient } from "./journal-OllamaClient";
import { JournalReflectSettingsTab } from "./journal-SettingsTab";

export class JournalReflectPlugin extends Plugin {
    settings!: JournalReflectSettings;
    ollamaClient!: OllamaClient;
    private commandIds: string[] = [];

    async onload() {
        console.log("Loading Journal Reflect Plugin");

        await this.loadSettings();
        this.ollamaClient = new OllamaClient(this.settings.ollamaUrl);

        this.addSettingTab(new JournalReflectSettingsTab(this.app, this));

        // Dynamically generate commands for each configured prompt
        this.generateCommands();
    }

    private clearCommands() {
        for (const commandId of this.commandIds) {
            this.removeCommand(commandId);
        }
        this.commandIds = [];
    }

    private generateCommands() {
        this.clearCommands();

        for (const [promptKey, promptConfig] of Object.entries(
            this.settings.prompts,
        )) {
            const mainCommandId = `journal-${promptKey}`;
            const cursorCommandId = `journal-${promptKey}-cursor`;

            // Generate main command
            this.addCommand({
                id: mainCommandId,
                name: `Generate ${promptConfig.displayLabel}`,
                callback: async () => {
                    await this.generateContent(promptKey);
                },
            });

            // Generate cursor command
            this.addCommand({
                id: cursorCommandId,
                name: `Generate ${promptConfig.displayLabel} at cursor`,
                editorCallback: async (
                    editor: Editor,
                    ctx: MarkdownView | MarkdownFileInfo,
                ) => {
                    await this.generateContentAtCursor(editor, ctx, promptKey);
                },
            });

            this.commandIds.push(mainCommandId, cursorCommandId);
        }
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
        this.generateCommands();
    }

    async generateContent(promptKey: string) {
        const currentView =
            this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!currentView) {
            new Notice("No active markdown editor found.");
            return;
        }

        const docContent = currentView.editor.getValue();
        const systemPrompt = await this.resolvePrompt(currentView, promptKey);
        const content = await this.getGeneratedContent(
            docContent,
            systemPrompt,
            promptKey,
        );

        if (content) {
            this.insertContentAtEnd(currentView, content, promptKey);
        }
    }

    async generateContentAtCursor(
        editor: Editor,
        ctx: MarkdownView | MarkdownFileInfo,
        promptKey: string,
    ) {
        const docContent = editor.getValue();

        const file = ctx.file;
        if (!file) {
            new Notice("No file context available.");
            return;
        }

        const systemPrompt = await this.resolvePromptFromFile(file, promptKey);
        const content = await this.getGeneratedContent(
            docContent,
            systemPrompt,
            promptKey,
        );

        if (content) {
            this.insertContentAtCursor(editor, content, promptKey);
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
        promptKey: string,
    ): void {
        const formattedContent = this.formatAsBlockquote(content);
        const cursorPos = view.editor.getCursor();
        view.editor.setLine(
            cursorPos.line,
            `${view.editor.getLine(cursorPos.line)}\n\n${formattedContent}\n\n`,
        );
        const displayLabel =
            this.settings.prompts[promptKey]?.displayLabel || promptKey;
        new Notice(`Inserted ${displayLabel}`);
    }

    private insertContentAtCursor(
        editor: Editor,
        content: string,
        promptKey: string,
    ): void {
        const formattedContent = this.formatAsBlockquote(content);
        editor.replaceSelection(`${formattedContent}\n\n`);
        const displayLabel =
            this.settings.prompts[promptKey]?.displayLabel || promptKey;
        new Notice(`Inserted ${displayLabel} at cursor`);
    }

    private async resolvePrompt(
        view: MarkdownView,
        promptKey: string,
    ): Promise<string> {
        const file = view.file;
        if (!file) {
            return this.getDefaultPrompt(promptKey);
        }
        return this.resolvePromptFromFile(file, promptKey);
    }

    private async resolvePromptFromFile(
        file: TFile,
        promptKey: string,
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
                    const promptValue = frontmatter.prompt[promptKey];
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
                    const promptFile = frontmatter["prompt-file"][promptKey];
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
        return this.getDefaultPrompt(promptKey);
    }

    private async getDefaultPrompt(promptKey: string): Promise<string> {
        const promptConfig = this.settings.prompts[promptKey];
        if (!promptConfig) {
            throw new Error(`Unknown prompt key: ${promptKey}`);
        }

        // First, try to use the file specified in prompt config
        if (promptConfig.promptFile) {
            const fileContent = await this.readPromptFromFile(
                promptConfig.promptFile,
            );
            if (fileContent) {
                return fileContent;
            }
        }

        // Final fallback for legacy prompts
        return DEFAULT_PROMPT;
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
        promptKey: string,
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

        const displayLabel =
            this.settings.prompts[promptKey]?.displayLabel || promptKey;
        new Notice(`Generating ${displayLabel}...`);

        return await this.ollamaClient.generate(
            this.settings.modelName,
            systemPrompt,
            documentText,
        );
    }
}
