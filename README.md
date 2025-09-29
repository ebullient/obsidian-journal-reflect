# Journal Reflect Plugin

An Obsidian plugin that uses local AI (Ollama) to generate thoughtful reflection questions while journaling.

## Features

- **AI-Powered Reflections**: Uses your local Ollama instance to generate personalized reflection questions
- **Smart Insertion**: Add reflections at your cursor position with intelligent formatting
- **Privacy-First**: All processing happens locally using your own Ollama instance
- **Customizable**: Configure system prompts, model selection, and Ollama connection settings

## Requirements

- [Ollama](https://ollama.ai/) running locally
- A language model installed in Ollama (e.g., `llama3.1`, `mistral`)

## Plugin installation

1. Build the plugin
    ```console
    npm install
    npm run build
    ```

2. Create a plugin directory in your obsidian vault: `.obsidian/plugins/journal-reflect`
3. Copy the contents of the build directory to the plugin directory
4. In Obsidian, refresh the list of Community plugins, and enable Journal Reflect

## Setup

1. Install and start Ollama (instructions beyond scope of this project)
2. Pull a model: `ollama pull llama3.1`
3. [Configure](#configuration) the plugin settings in Obsidian
4. Test the connection in settings

## Configuration

Access settings through Obsidian's plugin settings:

- **Ollama URL**: Your local Ollama instance URL (default: `http://localhost:11434`)
- **Model Name**: The Ollama model to use (e.g., `llama3.1`)
- **System Prompt**: Default instructions for generating reflection questions

## Usage

Use the command palette to access:
- **Generate reflection question** - Adds a question at your cursor position

Responses appear as blockquotes (>) in your journal. Position your cursor where you want the reflection to appear.

### Frontmatter Override
You can override the system prompt on a per-document basis using frontmatter.

**Prompt Resolution Priority:**
1. `prompt` in frontmatter (highest priority)
2. `prompt-file` in frontmatter
3. Prompt defined in plugin configuration (fallback)

#### Option 1: Direct prompt in frontmatter
```yaml
---
prompt: "You are a creative writing coach. Generate questions that help explore character motivations and plot development."
---
```

#### Option 2: Reference a prompt file
```yaml
---
prompt-file: "prompts/creative-writing-coach.md"
---
```

## Privacy & Security

This plugin only communicates with your local Ollama instance. No data is sent to external services.

## Acknowledgements

This is based on [Build an LLM Journaling Reflection Plugin for Obsidian](https://thomaschang.me/blog/obsidian-reflect) by Thomas Chang, see his implementation [here](https://github.com/tchbw/obsidian-reflect/).
