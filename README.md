# Journal Reflect Plugin

An Obsidian plugin that uses local AI (Ollama) to generate thoughtful reflection questions while journaling.

## Features

- **AI-Powered Reflections**: Uses your local Ollama instance to generate personalized reflection questions
- **Two Insertion Modes**: Add reflections at the document end or at your current cursor position
- **Privacy-First**: All processing happens locally using your own Ollama instance
- **Customizable**: Configure system prompts, model selection, and Ollama connection settings

## Requirements

- [Ollama](https://ollama.ai/) running locally
- A language model installed in Ollama (e.g., `llama3.1`, `mistral`)

## Setup

1. Install and start Ollama
2. Pull a model: `ollama pull llama3.1`
3. Configure the plugin settings in Obsidian
4. Test the connection in settings

## Usage

Use the command palette to access:
- **Generate reflection question** - Adds a question at the end of the document
- **Generate reflection at cursor** - Adds a question at the current cursor position

Reflection questions appear as blockquotes (>) in your journal.

## Configuration

### Plugin Settings
Access settings through Obsidian's plugin settings:
- **Ollama URL**: Your local Ollama instance URL (default: `http://localhost:11434`)
- **Model Name**: The Ollama model to use (e.g., `llama3.1`)
- **System Prompt**: Default instructions for generating reflection questions

### Frontmatter Override
You can override the system prompt on a per-document basis using frontmatter:

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

**Prompt Resolution Priority:**
1. `prompt` in frontmatter (highest priority)
2. `prompt-file` in frontmatter
3. Plugin settings system prompt (fallback)

## Privacy & Security

This plugin only communicates with your local Ollama instance. No data is sent to external services.