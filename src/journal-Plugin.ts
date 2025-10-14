import {
    type Editor,
    type MarkdownFileInfo,
    MarkdownView,
    Notice,
    Plugin,
    TFile,
} from "obsidian";
import type { JournalReflectSettings, ResolvedPrompt } from "./@types/settings";
import { DEFAULT_PROMPT, DEFAULT_SETTINGS } from "./journal-Constants";
import { OllamaClient } from "./journal-OllamaClient";
import { JournalReflectSettingsTab } from "./journal-SettingsTab";
import {
    filterCallouts,
    formatAsBlockquote,
    formatAsEmbedBlockquote,
    parseLinkReference,
} from "./journal-Utils";

export class JournalReflectPlugin extends Plugin {
    settings!: JournalReflectSettings;
    ollamaClient!: OllamaClient;
    private commandIds: string[] = [];
    private excludeLinkPatterns: RegExp[] = [];

    async onload() {
        console.log("Loading Journal Reflect Plugin");

        await this.loadSettings();

        this.addSettingTab(new JournalReflectSettingsTab(this.app, this));

        // Defer initialization until layout is ready
        this.app.workspace.onLayoutReady(() => {
            this.updateOllamaClient();
            this.generateCommands();
        });
    }

    private updateOllamaClient(): void {
        this.ollamaClient = new OllamaClient(this.settings.ollamaUrl);
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
            const commandId = `journal-${promptKey}`;

            this.addCommand({
                id: commandId,
                name: `Generate ${promptConfig.displayLabel}`,
                editorCallback: async (
                    editor: Editor,
                    ctx: MarkdownView | MarkdownFileInfo,
                ) => {
                    await this.generateContentWithEditor(
                        editor,
                        ctx,
                        promptKey,
                    );
                },
                callback: async () => {
                    await this.generateContent(promptKey);
                },
            });

            this.commandIds.push(commandId);
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
            this.updateOllamaClient();
        }
        this.compileExcludePatterns();
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateOllamaClient();
        this.compileExcludePatterns();
        this.generateCommands();
    }

    async generateContent(promptKey: string) {
        const currentView =
            this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!currentView) {
            new Notice("No active markdown editor found.");
            return;
        }

        await this.generateContentWithEditor(
            currentView.editor,
            currentView,
            promptKey,
        );
    }

    async generateContentWithEditor(
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

        const expandedDocContent = await this.expandLinkedFiles(
            file,
            docContent,
        );

        const promptConfig = this.settings.prompts[promptKey];
        const filteredDocContent = filterCallouts(
            expandedDocContent,
            promptConfig?.excludeCalloutTypes || "",
        );

        const resolved = await this.resolvePromptFromFile(file, promptKey);
        const content = await this.getGeneratedContent(
            filteredDocContent,
            resolved,
            promptKey,
        );

        if (content) {
            this.insertContent(editor, content, promptKey);
        }
    }

    private insertContent(
        editor: Editor,
        content: string,
        promptKey: string,
    ): void {
        const promptConfig = this.settings.prompts[promptKey];
        const calloutHeading = promptConfig?.calloutHeading;
        const formattedContent = formatAsBlockquote(content, calloutHeading);
        const cursor = editor.getCursor();
        const currentLine = editor.getLine(cursor.line);
        const isEmptyLine = currentLine.trim() === "";

        const insertText = isEmptyLine
            ? `${formattedContent}\n\n`
            : `\n\n${formattedContent}\n\n`;

        editor.replaceSelection(insertText);
        const displayLabel =
            this.settings.prompts[promptKey]?.displayLabel || promptKey;
        new Notice(`Inserted ${displayLabel}`);
    }

    private compileExcludePatterns(): void {
        this.excludeLinkPatterns = [];
        const patterns = this.settings.excludeLinkPatterns
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

        for (const pattern of patterns) {
            try {
                this.excludeLinkPatterns.push(new RegExp(pattern));
            } catch (error) {
                console.warn(`Invalid exclude link pattern: ${pattern}`, error);
            }
        }
    }

    private shouldExcludeLink(linkCache: {
        link: string;
        displayText?: string;
    }): boolean {
        const textToCheck = `[${linkCache.displayText}](${linkCache.link})`;
        console.log("ShouldIncludeLink", textToCheck, this.excludeLinkPatterns);
        return this.excludeLinkPatterns.some((pattern) =>
            pattern.test(textToCheck),
        );
    }

    private extractFrontmatterValue(
        frontmatter: Record<string, unknown> | undefined,
        key: string,
        promptKey: string,
    ): string | undefined {
        if (!frontmatter?.[key]) {
            return undefined;
        }

        const value = frontmatter[key];
        if (typeof value === "string") {
            return value;
        }
        if (typeof value === "object" && value !== null) {
            const promptValue = (value as Record<string, unknown>)[promptKey];
            if (typeof promptValue === "string") {
                return promptValue;
            }
        }
        return undefined;
    }

    private async resolvePromptFromFile(
        file: TFile,
        promptKey: string,
    ): Promise<ResolvedPrompt> {
        const frontmatter =
            this.app.metadataCache.getFileCache(file)?.frontmatter;

        // Check for direct prompt in frontmatter
        const promptValue = this.extractFrontmatterValue(
            frontmatter,
            "prompt",
            promptKey,
        );
        if (promptValue) {
            return { prompt: promptValue };
        }

        // Check for prompt-file in frontmatter
        const promptFile = this.extractFrontmatterValue(
            frontmatter,
            "prompt-file",
            promptKey,
        );
        if (promptFile) {
            const resolved = await this.readPromptFromFile(promptFile);
            if (resolved) {
                return resolved;
            }
        }

        // Fallback to global settings or built-in defaults
        return this.getDefaultPrompt(promptKey);
    }

    private async getDefaultPrompt(promptKey: string): Promise<ResolvedPrompt> {
        const promptConfig = this.settings.prompts[promptKey];
        if (!promptConfig) {
            throw new Error(`Unknown prompt key: ${promptKey}`);
        }

        // First, try to use the file specified in prompt config
        if (promptConfig.promptFile) {
            const resolved = await this.readPromptFromFile(
                promptConfig.promptFile,
            );
            console.log("Using file prompt", promptConfig.promptFile);
            if (resolved) {
                return resolved;
            }
        }

        // Final fallback for legacy prompts
        return { prompt: DEFAULT_PROMPT };
    }

    private async readPromptFromFile(
        promptFilePath: string,
    ): Promise<ResolvedPrompt | null> {
        const promptFile = this.app.vault.getAbstractFileByPath(promptFilePath);
        if (promptFile instanceof TFile) {
            try {
                const promptContent =
                    await this.app.vault.cachedRead(promptFile);
                const frontmatter =
                    this.app.metadataCache.getFileCache(
                        promptFile,
                    )?.frontmatter;
                const model =
                    typeof frontmatter?.model === "string"
                        ? frontmatter.model
                        : undefined;

                // Strip frontmatter from content
                const promptText = this.stripFrontmatter(promptContent);
                return { prompt: promptText, model };
            } catch (error) {
                new Notice(`Could not read prompt file: ${promptFilePath}`);
                console.error("Error reading prompt file:", error);
            }
        } else {
            new Notice(`Prompt file not found: ${promptFilePath}`);
            console.warn("Prompt file not found:", promptFilePath);
        }
        return null;
    }

    private stripFrontmatter(content: string): string {
        const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
        return content.replace(frontmatterRegex, "").trim();
    }

    private async expandLinkedFiles(
        sourceFile: TFile | null,
        content: string,
        depth = 0,
        processedFiles = new Set<string>(),
    ): Promise<string> {
        if (!sourceFile) {
            return content;
        }

        // Limit nesting to 2 levels
        if (depth >= 2) {
            return content;
        }

        // Mark this file as processed to prevent circular references
        processedFiles.add(sourceFile.path);

        let expandedContent = content;
        const fileCache = this.app.metadataCache.getFileCache(sourceFile);

        if (!fileCache) {
            return content;
        }

        const processedLinks = new Set<string>();

        // Process both links and embeds (fileCache already filters out external URLs)
        const allLinks = [
            ...(fileCache.links || []),
            ...(fileCache.embeds || []),
        ];

        for (const linkCache of allLinks) {
            // Skip if display text matches exclusion pattern
            if (this.shouldExcludeLink(linkCache)) {
                console.log(
                    `Skipping excluded link: ${linkCache.displayText || linkCache.link}`,
                );
                continue;
            }

            // Skip if we've already processed this link target
            if (processedLinks.has(linkCache.link)) {
                continue;
            }
            processedLinks.add(linkCache.link);

            // Parse link to extract path and subpath (heading/block reference)
            const { path, subpath } = parseLinkReference(linkCache.link);

            const targetFile = this.app.metadataCache.getFirstLinkpathDest(
                path,
                sourceFile.path,
            );

            if (targetFile) {
                // Skip if we've already processed this file (circular reference)
                if (processedFiles.has(targetFile.path)) {
                    console.log(
                        `Skipping circular reference: ${targetFile.path}`,
                    );
                    continue;
                }

                try {
                    const linkedContent =
                        await this.app.vault.cachedRead(targetFile);
                    const extractedContent = subpath
                        ? this.extractSubpathContent(
                              targetFile,
                              linkedContent,
                              subpath,
                          )
                        : linkedContent;

                    // Recursively expand links in the embedded content
                    const fullyExpandedContent = await this.expandLinkedFiles(
                        targetFile,
                        extractedContent,
                        depth + 1,
                        processedFiles,
                    );

                    // Format as blockquote callout
                    const linkDisplay = linkCache.link;
                    const quotedContent = formatAsEmbedBlockquote(
                        fullyExpandedContent,
                        linkDisplay,
                        depth,
                    );
                    expandedContent += `\n\n${quotedContent}`;
                } catch (error) {
                    console.warn(
                        `Could not read linked file: ${linkCache.link}`,
                        error,
                    );
                }
            }
        }

        return expandedContent;
    }

    private extractSubpathContent(
        file: TFile,
        fileContent: string,
        subpath: string,
    ): string {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) {
            return fileContent;
        }

        // Check for block reference (^block-id)
        if (subpath.startsWith("^")) {
            const blockId = subpath.substring(1);
            const block = cache.blocks?.[blockId];
            if (block) {
                const lines = fileContent.split("\n");
                return lines[block.position.start.line] || "";
            }
            return fileContent;
        }

        // Check for heading reference
        const targetHeading = subpath.replace(/%20/g, " ");
        const heading = cache.headings?.find(
            (h) => h.heading === targetHeading,
        );

        if (heading && cache.headings) {
            // Find the end of this section
            const start = heading.position.end.offset;
            let end = fileContent.length;

            // Find next heading at same or higher level
            const headingIndex = cache.headings.indexOf(heading);
            for (const h of cache.headings.slice(headingIndex + 1)) {
                if (h.level <= heading.level) {
                    end = h.position.start.offset;
                    break;
                }
            }

            return fileContent.substring(start, end).trim();
        }

        // If no matching subpath found, return full content
        return fileContent;
    }

    private async getGeneratedContent(
        documentText: string,
        resolvedPrompt: ResolvedPrompt,
        promptKey: string,
    ): Promise<string | null> {
        if (!documentText.trim()) {
            new Notice("Document is empty. Write something first!");
            return null;
        }

        const model = resolvedPrompt.model || this.settings.modelName;

        if (!this.settings.ollamaUrl || !model) {
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
        new Notice(`Generating ${displayLabel} using ${model}`);

        return await this.ollamaClient.generate(
            model,
            resolvedPrompt.prompt,
            documentText,
        );
    }
}
