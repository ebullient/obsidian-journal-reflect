import { type App, PluginSettingTab, Setting } from "obsidian";
import type { PromptConfig } from "./@types/settings";
import type { JournalReflectPlugin } from "./journal-Plugin";

export class JournalReflectSettingsTab extends PluginSettingTab {
    plugin: JournalReflectPlugin;

    constructor(app: App, plugin: JournalReflectPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Journal Reflect Settings" });

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
                    .setValue(this.plugin.settings.ollamaUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.ollamaUrl = value.trim();
                        await this.plugin.saveSettings();
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
                    .setValue(this.plugin.settings.modelName)
                    .onChange(async (value) => {
                        this.plugin.settings.modelName = value.trim();
                        await this.plugin.saveSettings();
                    }),
            );

        containerEl.createEl("h3", { text: "Prompt Configurations" });
        containerEl.createEl("p", {
            text: "Configure different types of prompts. Each prompt creates two commands: one that adds content at the end of the document, and one that adds at the cursor position.",
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
                const isConnected =
                    await this.plugin.ollamaClient.checkConnection();
                if (isConnected) {
                    connectionDesc.textContent = "✅ Connected to Ollama";
                    connectionDesc.style.color = "var(--text-success)";

                    const models = await this.plugin.ollamaClient.listModels();
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
            text: "For each configured prompt, two commands are automatically created:",
        });
        const list = usage.createEl("ul");
        list.createEl("li", {
            text: "Generate [prompt name] - Adds content at the end of the document",
        });
        list.createEl("li", {
            text: "Generate [prompt name] at cursor - Adds content at the current cursor position",
        });
        usage.createEl("p", {
            text: "Generated content appears as blockquotes (>) in your journal.",
        });
    }

    displayPromptConfigs(containerEl: HTMLElement): void {
        for (const [promptKey, promptConfig] of Object.entries(
            this.plugin.settings.prompts,
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
                        .onChange(async (value) => {
                            this.plugin.settings.prompts[
                                promptKey
                            ].displayLabel = value.trim();
                            await this.plugin.saveSettings();
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
                        .setValue(promptConfig.promptFile)
                        .onChange(async (value) => {
                            this.plugin.settings.prompts[promptKey].promptFile =
                                value.trim();
                            await this.plugin.saveSettings();
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

    async addNewPrompt(): Promise<void> {
        const promptKey = `custom-${Date.now()}`;
        const newPrompt: PromptConfig = {
            name: promptKey,
            displayLabel: "Custom Prompt",
            promptFile: "",
        };

        this.plugin.settings.prompts[promptKey] = newPrompt;
        await this.plugin.saveSettings();
        this.display(); // Refresh the settings view
    }

    async removePrompt(promptKey: string): Promise<void> {
        delete this.plugin.settings.prompts[promptKey];
        await this.plugin.saveSettings();
        this.display(); // Refresh the settings view
    }
}
