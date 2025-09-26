// Mock implementation of obsidian for testing

export class Notice {
    constructor(public message: string) {
        // In tests, just log the notice instead of showing UI
        console.log(`[Notice] ${message}`);
    }
}

// Add other obsidian exports as needed for testing
export const App = {};
export const Plugin = {};
export const Setting = {};