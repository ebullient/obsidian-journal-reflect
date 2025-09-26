import { type App, PluginSettingTab, Setting } from "obsidian";
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

        new Setting(containerEl)
            .setName("System Prompt")
            .setDesc(
                "Instructions for the AI on how to generate reflection questions",
            )
            .addTextArea((text) =>
                text
                    .setPlaceholder("Enter system prompt...")
                    .setValue(this.plugin.settings.systemPrompt)
                    .onChange(async (value) => {
                        this.plugin.settings.systemPrompt = value;
                        await this.plugin.saveSettings();
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
        usage.createEl("p", { text: "Two commands are available:" });
        const list = usage.createEl("ul");
        list.createEl("li", {
            text: "Generate reflection question - Adds a question at the end of the document",
        });
        list.createEl("li", {
            text: "Generate reflection at cursor - Adds a question at the current cursor position",
        });
        usage.createEl("p", {
            text: "Reflection questions appear as blockquotes (>) in your journal.",
        });
    }
}
