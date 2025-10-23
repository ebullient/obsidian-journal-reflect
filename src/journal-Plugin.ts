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

const CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CONTEXT_REAP_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

export class JournalReflectPlugin extends Plugin {
    settings!: JournalReflectSettings;
    ollamaClient!: OllamaClient;
    private commandIds: string[] = [];
    private excludePatterns: RegExp[] = [];
    private promptContexts = new Map<
        string,
        { context: number[]; timestamp: number }
    >();

    async onload() {
        console.log("Loading Journal Reflect Plugin");

        await this.loadSettings();

        this.addSettingTab(new JournalReflectSettingsTab(this.app, this));

        // Defer initialization until layout is ready
        this.app.workspace.onLayoutReady(() => {
            this.updateOllamaClient();
            this.generateCommands();
            this.registerContextReaper();
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
        this.excludePatterns = this.compileExcludePatterns(
            this.settings.excludePatterns || this.settings.excludeLinkPatterns,
        );
    }

    async saveSettings() {
        if (this.settings.excludeLinkPatterns) {
            this.settings.excludePatterns = this.settings.excludeLinkPatterns;
            delete this.settings.excludeLinkPatterns;
        }
        await this.saveData(this.settings);
        this.updateOllamaClient();
        this.excludePatterns = this.compileExcludePatterns(
            this.settings.excludePatterns,
        );
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

        const activeNote = ctx.file;
        if (!activeNote) {
            new Notice("No file context available.");
            return;
        }

        const resolved = await this.resolvePromptFromFile(
            activeNote,
            promptKey,
        );
        const expandedDocContent = await this.expandLinkedFiles(
            activeNote,
            docContent,
            resolved.includeLinks ?? false,
            resolved.excludePatterns,
        );

        const promptConfig = this.settings.prompts[promptKey];
        const filteredDocContent = filterCallouts(
            expandedDocContent,
            promptConfig?.excludeCalloutTypes || "",
        );
        const content = await this.getGeneratedContent(
            filteredDocContent,
            resolved,
            promptKey,
            activeNote,
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

    private compileExcludePatterns(
        excludePatternsRaw?: string | string[] | undefined,
    ): RegExp[] {
        if (!excludePatternsRaw) {
            return [];
        }
        const compiled: RegExp[] = [];

        let excludePatterns = excludePatternsRaw;
        if (!Array.isArray(excludePatternsRaw)) {
            excludePatterns = excludePatternsRaw
                .split("\n")
                .map((p) => p.trim())
                .filter((p) => p.length > 0);
        }
        for (const pattern of excludePatterns) {
            try {
                compiled.push(new RegExp(pattern));
            } catch (error) {
                console.warn(`Invalid exclude pattern: ${pattern}`, error);
            }
        }
        return compiled;
    }

    private shouldExcludeLink(
        linkCache: {
            link: string;
            displayText?: string;
        },
        additionalPatterns: RegExp[] = [],
    ): boolean {
        // Check global exclude patterns (match against display text format)
        const textToCheck = `[${linkCache.displayText}](${linkCache.link})`;
        const allPatterns = [
            ...this.excludePatterns,
            ...additionalPatterns,
        ].filter(Boolean);

        return allPatterns.some((pattern) => pattern.test(textToCheck));
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

    private getFrontmatterValue(
        frontmatter: Record<string, unknown> | undefined,
        keys: string[],
    ): unknown {
        if (!frontmatter) {
            return undefined;
        }
        for (const key of keys) {
            if (frontmatter[key] !== undefined) {
                return frontmatter[key];
            }
        }
        return undefined;
    }

    private parseFiniteNumber(value: unknown): number | undefined {
        if (value === null || value === undefined) {
            return undefined;
        }

        const parsed =
            typeof value === "number"
                ? value
                : Number.parseFloat(String(value).trim());

        if (Number.isFinite(parsed)) {
            return parsed;
        }
        return undefined;
    }

    private parsePositiveInteger(value: unknown): number | undefined {
        const parsed = this.parseFiniteNumber(value);

        if (parsed === undefined) {
            return undefined;
        }
        if (Number.isInteger(parsed) && parsed > 0) {
            return parsed;
        }
        return undefined;
    }

    private parseBoolean(value: unknown): boolean | undefined {
        if (value === null || value === undefined) {
            return undefined;
        }
        if (typeof value === "boolean") {
            return value;
        }
        if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (normalized === "true") {
                return true;
            }
            if (normalized === "false") {
                return false;
            }
        }
        return undefined;
    }

    private parseParameterWithConstraint(
        frontmatter: Record<string, unknown> | undefined,
        keys: string[],
        constraint: (val: number) => boolean,
    ): number | undefined {
        const candidate = this.parseFiniteNumber(
            this.getFrontmatterValue(frontmatter, keys),
        );
        return candidate !== undefined && constraint(candidate)
            ? candidate
            : undefined;
    }

    private buildContextKey(
        file: TFile,
        resolvedPrompt: ResolvedPrompt,
        promptKey: string,
    ): string | null {
        if (resolvedPrompt.isContinuous !== true) {
            return null;
        }
        const promptSource = resolvedPrompt.sourcePath || promptKey;
        return `${file.path}::${promptSource}`;
    }

    private getContextForKey(key: string | null): number[] | undefined {
        if (!key) {
            return undefined;
        }
        const entry = this.promptContexts.get(key);
        if (!entry) {
            return undefined;
        }
        if (Date.now() - entry.timestamp > CONTEXT_TTL_MS) {
            this.promptContexts.delete(key);
            return undefined;
        }
        return entry.context;
    }

    private storeContextForKey(key: string, context: number[]): void {
        if (context.length === 0) {
            this.promptContexts.delete(key);
            return;
        }
        this.promptContexts.set(key, { context, timestamp: Date.now() });
        this.cullExpiredContexts();
    }

    private cullExpiredContexts(): void {
        if (this.promptContexts.size === 0) {
            return;
        }
        const now = Date.now();
        for (const [key, value] of this.promptContexts.entries()) {
            if (now - value.timestamp > CONTEXT_TTL_MS) {
                this.promptContexts.delete(key);
            }
        }
    }

    private registerContextReaper(): void {
        this.registerInterval(
            window.setInterval(
                () => this.cullExpiredContexts(),
                CONTEXT_REAP_INTERVAL_MS,
            ),
        );
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
                const numCtx = this.parsePositiveInteger(frontmatter?.num_ctx);
                const temperature = this.parseParameterWithConstraint(
                    frontmatter,
                    ["temperature", "temp"],
                    (val) => val >= 0,
                );
                const topP = this.parseParameterWithConstraint(
                    frontmatter,
                    ["top_p", "topP", "top-p"],
                    (val) => val > 0,
                );
                const repeatPenalty = this.parseParameterWithConstraint(
                    frontmatter,
                    ["repeat_penalty", "repeatPenalty", "repeat-penalty"],
                    (val) => val > 0,
                );
                const rawContinuous =
                    frontmatter?.isContinuous ??
                    frontmatter?.is_continuous ??
                    frontmatter?.["is-continuous"] ??
                    frontmatter?.continuous;
                const isContinuous = this.parseBoolean(rawContinuous);
                const rawIncludeLinks =
                    frontmatter?.includeLinks ??
                    frontmatter?.include_links ??
                    frontmatter?.["include-links"];
                const includeLinks = this.parseBoolean(rawIncludeLinks);
                const excludePatternsRaw =
                    frontmatter?.excludePatterns ??
                    frontmatter?.exclude_patterns ??
                    frontmatter?.["exclude-patterns"];
                const excludePatterns =
                    this.compileExcludePatterns(excludePatternsRaw);

                // Strip frontmatter from content
                const promptText = this.stripFrontmatter(promptContent);
                return {
                    prompt: promptText,
                    model,
                    numCtx,
                    isContinuous,
                    includeLinks,
                    excludePatterns,
                    sourcePath: promptFilePath,
                    temperature,
                    topP,
                    repeatPenalty,
                };
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
        includeLinks = false,
        pathPatterns: RegExp[] = [],
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
        // Only include regular links if includeLinks is true; always include embeds
        const allLinks = [
            ...(includeLinks ? fileCache.links || [] : []),
            ...(fileCache.embeds || []),
        ].filter((link) => link);

        for (const cachedLink of allLinks) {
            // Skip if link matches exclusion patterns (global or prompt-specific)
            if (this.shouldExcludeLink(cachedLink, pathPatterns)) {
                console.log("Skipping excluded link:", cachedLink.link);
                continue;
            }
            console.log(sourceFile.path, cachedLink.link);

            // Skip if we've already processed this link target
            if (processedLinks.has(cachedLink.link)) {
                console.log("Skipping visited link:", cachedLink.link);
                continue;
            }
            processedLinks.add(cachedLink.link);

            // Parse link to extract path and subpath (heading/block reference)
            const { path, subpath } = parseLinkReference(cachedLink.link);

            const targetFile = this.app.metadataCache.getFirstLinkpathDest(
                path,
                sourceFile.path,
            );

            if (targetFile) {
                // Skip if we've already processed this file (circular reference)
                if (processedFiles.has(targetFile.path)) {
                    console.log("Skipping circular reference", targetFile.path);
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
                        includeLinks,
                        pathPatterns,
                        depth + 1,
                        processedFiles,
                    );

                    // Format as blockquote callout
                    const linkDisplay = cachedLink.link;
                    const quotedContent = formatAsEmbedBlockquote(
                        fullyExpandedContent,
                        linkDisplay,
                        depth,
                    );
                    expandedContent += `\n\n${quotedContent}`;
                } catch (error) {
                    console.warn(
                        "Could not read linked file:",
                        cachedLink.link,
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
        activeNote: TFile,
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

        const contextKey = this.buildContextKey(
            activeNote,
            resolvedPrompt,
            promptKey,
        );
        const context = this.getContextForKey(contextKey);

        const result = await this.ollamaClient.generate(
            model,
            resolvedPrompt.prompt,
            documentText,
            {
                numCtx: resolvedPrompt.numCtx,
                context,
                temperature: resolvedPrompt.temperature,
                topP: resolvedPrompt.topP,
                repeatPenalty: resolvedPrompt.repeatPenalty,
            },
        );

        if (contextKey !== null && result.context) {
            this.storeContextForKey(contextKey, result.context);
        }

        return result.response;
    }
}
