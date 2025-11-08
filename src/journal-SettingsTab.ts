import { type App, PluginSettingTab, Setting } from "obsidian";
import type { JournalReflectSettings, PromptConfig } from "./@types/settings";
import { OllamaClient } from "./journal-OllamaClient";
import type { JournalReflectPlugin } from "./journal-Plugin";

export class JournalReflectSettingsTab extends PluginSettingTab {
    plugin: JournalReflectPlugin;
    newSettings!: JournalReflectSettings;

    constructor(app: App, plugin: JournalReflectPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async save() {
        this.plugin.settings = this.newSettings;
        await this.plugin.saveSettings();
    }

    private cloneSettings(): JournalReflectSettings {
        return JSON.parse(JSON.stringify(this.plugin.settings));
    }

    async reset() {
        this.newSettings = this.cloneSettings();
        this.display();
    }

    display(): void {
        if (!this.newSettings) {
            this.newSettings = this.cloneSettings();
        }

        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Journal Reflect Settings" });

        new Setting(containerEl)
            .setName("Save Settings")
            .setClass("journal-reflect-save-reset")
            .addButton((button) =>
                button
                    .setButtonText("Reset")
                    .setTooltip("Reset to current saved settings")
                    .onClick(() => {
                        this.reset();
                    }),
            )
            .addButton((button) =>
                button
                    .setButtonText("Save")
                    .setCta()
                    .setTooltip("Save all changes")
                    .onClick(async () => {
                        await this.save();
                    }),
            );

        containerEl.createEl("p", {
            text: "Configure your local Ollama instance for AI-powered journal reflections.",
        });

        new Setting(containerEl)
            .setName("Ollama URL")
            .setDesc(
                "URL of your Ollama instance (default: http://localhost:11434)",
            )
            .addText((text) =>
                text
                    .setPlaceholder("http://localhost:11434")
                    .setValue(this.newSettings.ollamaUrl)
                    .onChange((value) => {
                        const trimmed = value.trim();
                        if (trimmed && !trimmed.startsWith("http")) {
                            // Auto-prepend http:// if user forgets protocol
                            this.newSettings.ollamaUrl = `http://${trimmed}`;
                        } else {
                            this.newSettings.ollamaUrl = trimmed;
                        }
                    }),
            );

        new Setting(containerEl)
            .setName("Model Name")
            .setDesc(
                "Name of the Ollama model to use (e.g., llama3.1, mistral)",
            )
            .addText((text) =>
                text
                    .setPlaceholder("llama3.1")
                    .setValue(this.newSettings.modelName)
                    .onChange((value) => {
                        this.newSettings.modelName = value.trim();
                    }),
            );

        new Setting(containerEl)
            .setName("Keep Alive")
            .setDesc(
                "How long to keep model loaded in memory (e.g., '10m', '1h', '-1' for always). Speeds up subsequent requests.",
            )
            .addText((text) =>
                text
                    .setPlaceholder("10m")
                    .setValue(this.newSettings.keepAlive)
                    .onChange((value) => {
                        this.newSettings.keepAlive = value.trim();
                    }),
            );

        new Setting(containerEl)
            .setName("Exclude Link Patterns")
            .setDesc(
                "Skip links whose that matches these patterns (regex, one pattern per line). Links will be matched in markdown format, e.g. [displayText](linkTarget).",
            )
            .addTextArea((text) =>
                text
                    .setPlaceholder("^Reflect on\nTODO:\n\\[template\\]")
                    .setValue(this.newSettings.excludePatterns)
                    .onChange((value) => {
                        this.newSettings.excludePatterns = value;
                    }),
            )
            .then((setting) => {
                setting.controlEl
                    .querySelector("textarea")
                    ?.setAttribute("rows", "4");
            });

        containerEl.createEl("h3", { text: "Prompt Configurations" });
        containerEl.createEl("p", {
            text: "Configure different types of prompts. Each prompt creates a command that adds content at your cursor position.",
        });

        this.displayPromptConfigs(containerEl);

        new Setting(containerEl)
            .setName("Add New Prompt")
            .setDesc("Add a new prompt configuration")
            .addButton((button) =>
                button
                    .setButtonText("Add Prompt")
                    .setCta()
                    .onClick(() => {
                        this.addNewPrompt();
                    }),
            );

        const connectionStatus = containerEl.createEl("div", {
            cls: "setting-item",
        });
        const connectionInfo = connectionStatus.createEl("div", {
            cls: "setting-item-info",
        });
        connectionInfo.createEl("div", {
            cls: "setting-item-name",
            text: "Connection Status",
        });
        const connectionDesc = connectionInfo.createEl("div", {
            cls: "setting-item-description",
        });

        const connectionControl = connectionStatus.createEl("div", {
            cls: "setting-item-control",
        });
        const testButton = connectionControl.createEl("button", {
            text: "Test Connection",
            cls: "mod-cta",
        });

        testButton.addEventListener("click", async () => {
            testButton.textContent = "Testing...";
            testButton.disabled = true;

            try {
                // Create temporary client with current form settings
                const tempClient = new OllamaClient(this.newSettings.ollamaUrl);
                const isConnected = await tempClient.checkConnection();

                if (isConnected) {
                    connectionDesc.textContent = "✅ Connected to Ollama";
                    connectionDesc.style.color = "var(--text-success)";

                    const models = await tempClient.listModels();
                    if (models.length > 0) {
                        connectionDesc.textContent += ` | Available models: ${models.join(", ")}`;
                    }
                } else {
                    connectionDesc.textContent = "❌ Cannot connect to Ollama";
                    connectionDesc.style.color = "var(--text-error)";
                }
            } catch (error) {
                const errorMsg =
                    error instanceof Error ? error.message : String(error);
                connectionDesc.textContent = `❌ Connection error: ${errorMsg}`;
                connectionDesc.style.color = "var(--text-error)";
            }

            testButton.textContent = "Test Connection";
            testButton.disabled = false;
        });

        containerEl.createEl("h3", { text: "Usage" });
        const usage = containerEl.createEl("div");
        usage.createEl("p", {
            text: "For each configured prompt, a command is automatically created:",
        });
        const list = usage.createEl("ul");
        list.createEl("li", {
            text: "Generate [prompt name] - Adds content at your cursor position",
        });
        usage.createEl("p", {
            text: "Generated content appears as blockquotes (>) in your journal. Position your cursor where you want the content to appear.",
        });
    }

    displayPromptConfigs(containerEl: HTMLElement): void {
        for (const [promptKey, promptConfig] of Object.entries(
            this.newSettings.prompts,
        )) {
            const promptSection = containerEl.createEl("div", {
                cls: "setting-item-group journal-reflect-prompt-config",
            });

            promptSection.createEl("h4", {
                text: `${promptConfig.displayLabel} Configuration`,
            });

            new Setting(promptSection)
                .setName("Display Label")
                .setDesc("Label shown in commands and notifications")
                .addText((text) =>
                    text
                        .setValue(promptConfig.displayLabel)
                        .onChange((value) => {
                            this.newSettings.prompts[promptKey].displayLabel =
                                value.trim();
                        }),
                );

            new Setting(promptSection)
                .setName("Prompt File")
                .setDesc(
                    "Path to file containing prompt (leave empty to use inline prompt)",
                )
                .addText((text) =>
                    text
                        .setPlaceholder("prompts/my-prompt.md")
                        .setValue(promptConfig.promptFile || "")
                        .onChange((value) => {
                            this.newSettings.prompts[promptKey].promptFile =
                                value.trim();
                        }),
                );

            new Setting(promptSection)
                .setName("Callout Heading")
                .setDesc(
                    "Optional callout heading (e.g., '[!magic] Affirmation'). If set, this will be prepended to blockquotes.",
                )
                .addText((text) =>
                    text
                        .setPlaceholder("[!magic] Affirmation")
                        .setValue(promptConfig.calloutHeading || "")
                        .onChange((value) => {
                            const trimmed = value?.trim();
                            this.newSettings.prompts[promptKey].calloutHeading =
                                trimmed || undefined;
                        }),
                );

            new Setting(promptSection)
                .setName("Exclude Callout Types")
                .setDesc(
                    "Callout types to skip (one per line, e.g., 'ai', 'magic'). Prevents sending AI text back to the model.",
                )
                .addTextArea((text) =>
                    text
                        .setPlaceholder("ai\nmagic")
                        .setValue(promptConfig.excludeCalloutTypes || "")
                        .onChange((value) => {
                            this.newSettings.prompts[
                                promptKey
                            ].excludeCalloutTypes = value;
                        }),
                )
                .then((setting) => {
                    setting.controlEl
                        .querySelector("textarea")
                        ?.setAttribute("rows", "4");
                });

            if (promptKey !== "reflection") {
                new Setting(promptSection)
                    .setName("Remove Prompt")
                    .setDesc("Delete this prompt configuration")
                    .addButton((button) =>
                        button
                            .setButtonText("Remove")
                            .setWarning()
                            .onClick(() => {
                                this.removePrompt(promptKey);
                            }),
                    );
            }
        }
    }

    private generatePromptKey(): string {
        return `custom-${Date.now()}`;
    }

    addNewPrompt(): void {
        const promptKey = this.generatePromptKey();
        const newPrompt: PromptConfig = {
            displayLabel: "Custom Prompt",
        };

        this.newSettings.prompts[promptKey] = newPrompt;
        this.display(); // Refresh the settings view
    }

    removePrompt(promptKey: string): void {
        delete this.newSettings.prompts[promptKey];
        this.display(); // Refresh the settings view
    }

    /** Save on exit */
    hide(): void {
        this.save();
    }
}
