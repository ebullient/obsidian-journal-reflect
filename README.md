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

Prompt files can include their own frontmatter to override model settings. Add
`model`, `num_ctx`, `temperature`, `top_p`, `repeat_penalty`, and `isContinuous`
to tailor Ollama requests for that prompt:

```markdown
---
model: llama3.1
num_ctx: 4096
temperature: 0.7
top_p: 0.9
repeat_penalty: 1.1
isContinuous: true
---
You are a reflective companion. Ask concise questions that help summarize the
day.
```

When `isContinuous` is `true`, the plugin keeps a private Ollama conversation
context for each prompt/note combination so follow-up questions build on the
previous exchange. Context is automatically refreshed after a short idle period.
Other frontmatter keys are ignored unless explicitly supported, which helps
avoid unintentionally pushing plugin-specific metadata to Ollama.

### Pre-Filter API

The plugin provides a global API for registering content filters that process
text before it is sent to Ollama. This allows external scripts (e.g., via
CustomJS or other plugins) to modify content programmatically.

#### Registering a Filter

Filters are registered via `window.journal.filters`, which is a plain object
mapping filter names to filter functions. The plugin creates this object if it
doesn't exist, so external scripts can register filters before or after the
plugin loads.

**Example registration:**

```javascript
// In a CustomJS script or another plugin
window.journal = window.journal || {};
window.journal.filters = window.journal.filters || {};

window.journal.filters.redactSecrets = (content) => {
    // Replace sensitive patterns
    return content.replace(/password:\s*\S+/gi, "password: ***");
};

window.journal.filters.removeEmojis = (content) => {
    // Strip emoji characters
    return content.replace(/[\u{1F600}-\u{1F64F}]/gu, "");
};
```

#### Using Filters in Prompt Files

Specify which filters to apply in the prompt file frontmatter using the
`filters` array. Filters are applied sequentially in the order specified.

```markdown
---
model: llama3.1
filters: ["redactSecrets", "removeEmojis"]
---
You are a thoughtful coach. Generate a reflection question.
```

#### Filter Function Signature

Filters must be synchronous functions that accept a string and return a string:

```typescript
type FilterFn = (content: string) => string;
```

#### Error Handling

- If a filter name is not found in `window.journal.filters`, a warning is
  logged to the console and processing continues
- If a filter throws an error, the error is logged and the original
  (unfiltered) content is used for that request
- Filters are only applied when specified in prompt file frontmatter

## Privacy & Security

This plugin only communicates with your local Ollama instance. No data is sent to external services.

## Acknowledgements

This is based on [Build an LLM Journaling Reflection Plugin for Obsidian](https://thomaschang.me/blog/obsidian-reflect) by Thomas Chang, see [his implementation](https://github.com/tchbw/obsidian-reflect/).
