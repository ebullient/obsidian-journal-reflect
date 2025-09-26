import { Plugin } from "obsidian";

export class JournalReflectPlugin extends Plugin {
    async onload() {
        console.log("Loading Journal Reflect Plugin");
    }

    onunload() {
        console.log("Unloading Journal Reflect Plugin");
    }
}
