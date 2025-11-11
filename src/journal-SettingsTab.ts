import { PluginSettingTab, Setting } from "obsidian";
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

        this.containerEl.empty();

        new Setting(this.containerEl)
            .setName("Journal Reflect")
            .setHeading()
            .setDesc(
                "Configure your local Ollama instance for AI-powered journal reflections.",
            );

        new Setting(this.containerEl)
            .setName("Save settings")
            .setClass("journal-reflect-save-reset")
            .addButton((button) =>
                button
                    .setIcon("reset")
                    .setTooltip("Reset to previously saved values")
                    .onClick(() => {
                        this.reset();
                    }),
            )
            .addButton((button) => {
                button
                    .setIcon("save")
                    .setCta()
                    .setTooltip("Save all changes")
                    .onClick(async () => {
                        await this.save();
                    });
            });

        new Setting(this.containerEl)
            .setName("Ollama")
            .setDesc(
                "Configure your local Ollama instance for AI-powered journal reflections.",
            );

        const testConnection = async (): Promise<string> => {
            try {
                // Create temporary client with current form settings
                const tempClient = new OllamaClient(this.newSettings.ollamaUrl);
                const isConnected = await tempClient.checkConnection();

                if (isConnected) {
                    const models = await tempClient.listModels();
                    return models.length > 0
                        ? `✅ Connected to Ollama | Available models: ${models.join(", ")}`
                        : "✅ Connected to Ollama | no models found";
                } else {
                    return "❌ Cannot connect to Ollama";
                }
            } catch (error) {
                const errorMsg =
                    error instanceof Error ? error.message : String(error);
                this.plugin.logError("❌ Cannot connect to Ollama", error);
                return `❌ Cannot connect to Ollama: ${errorMsg}`;
            }
        };

        const connection = new Setting(this.containerEl)
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
            )
            .addButton((bc) =>
                bc
                    .setTooltip("Test Connection")
                    .setIcon("cable")
                    .onClick(async (_e) => {
                        bc.setTooltip("Testing...");
                        bc.setDisabled(true);

                        const message = await testConnection();
                        connection.setDesc(
                            `${this.newSettings.ollamaUrl} - ${message}`,
                        );

                        bc.setTooltip("Test Connection");
                        bc.setDisabled(false);
                    }),
            );

        new Setting(this.containerEl)
            .setName("Model Name")
            .setDesc(
                "Name of the default Ollama model to use (e.g., llama3.1, mistral)",
            )
            .addText((text) =>
                text
                    .setPlaceholder("llama3.1")
                    .setValue(this.newSettings.modelName)
                    .onChange((value) => {
                        this.newSettings.modelName = value.trim();
                    }),
            );

        new Setting(this.containerEl)
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

        new Setting(this.containerEl)
            .setName("Prompts")
            .setHeading()
            .setDesc(
                "For each configured prompt, a command is automatically created, Generate [prompt name]. When the command is run, it will send the prompt associated with the command, the current note, and (optionally) the contents of linked notes to the LLM. Generated content is inserted as blockquotes (>) at the current cursor position in the current note.",
            );

        this.displayPromptConfigs(this.containerEl);

        new Setting(this.containerEl)
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

        new Setting(this.containerEl).setName("Other").setHeading();

        new Setting(this.containerEl)
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

        new Setting(this.containerEl)
            .setName("Show LLM request payloads")
            .setDesc(
                "When enabled, logs the exact prompt and document text sent to Ollama. Turn off to keep journal content out of the console.",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.newSettings.showLlmRequests ?? false)
                    .onChange((value) => {
                        this.newSettings.showLlmRequests = value;
                    }),
            );

        new Setting(this.containerEl)
            .setName("Enable debug logging")
            .setDesc(
                "Writes verbose plugin events to the developer console. Useful when troubleshooting prompt resolution issues.",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.newSettings.debugLogging ?? false)
                    .onChange((value) => {
                        this.newSettings.debugLogging = value;
                    }),
            );
    }

    displayPromptConfigs(containerEl: HTMLElement): void {
        for (const [promptKey, promptConfig] of Object.entries(
            this.newSettings.prompts,
        )) {
            const promptSection = containerEl.createEl("div", {
                cls: "setting-item-group journal-reflect-prompt-config",
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

            const checkFile = async (
                inputEl: HTMLElement,
                filePath: string,
            ) => {
                (await this.app.vault.adapter.exists(filePath))
                    ? inputEl.addClass("fileFound")
                    : inputEl.removeClass("fileFound");
            };

            new Setting(promptSection)
                .setName("Prompt File")
                .setDesc(
                    "Path to file containing prompt (leave empty to use inline prompt)",
                )
                .addText((text) =>
                    text
                        .setPlaceholder("prompts/my-prompt.md")
                        .setValue(promptConfig.promptFile || "")
                        .onChange(async (value) => {
                            const path = value.trim();
                            this.newSettings.prompts[promptKey].promptFile =
                                path;
                            checkFile(text.inputEl, path);
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
