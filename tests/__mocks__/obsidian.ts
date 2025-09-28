// Mock implementation of obsidian for testing

export class Notice {
    constructor(public message: string) {
        // In tests, just log the notice instead of showing UI
        console.log(`[Notice] ${message}`);
    }
}

// Mock requestUrl that uses Node.js fetch for testing
export async function requestUrl(options: {
    url: string;
    method?: string;
    contentType?: string;
    body?: string | ArrayBuffer;
    headers?: Record<string, string>;
    throw?: boolean;
}): Promise<{
    status: number;
    headers: Record<string, string>;
    arrayBuffer: ArrayBuffer;
    json: any;
    text: string;
}> {
    const { url, method = "GET", contentType, body, headers = {}, throw: shouldThrow = true } = options;

    // Set up fetch options
    const fetchOptions: RequestInit = {
        method,
        headers: {
            ...headers,
            ...(contentType && { "Content-Type": contentType }),
        },
        ...(body && { body }),
    };

    try {
        const response = await fetch(url, fetchOptions);

        if (!response.ok && shouldThrow) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const text = new TextDecoder().decode(arrayBuffer);

        // Parse JSON if possible, otherwise return null
        let json: any = null;
        try {
            json = JSON.parse(text);
        } catch {
            // Not JSON, that's fine
        }

        // Convert Headers to plain object
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        return {
            status: response.status,
            headers: responseHeaders,
            arrayBuffer,
            json,
            text,
        };
    } catch (error) {
        if (shouldThrow) {
            throw error;
        }
        // Return error response if not throwing
        const emptyBuffer = new ArrayBuffer(0);
        return {
            status: 0,
            headers: {},
            arrayBuffer: emptyBuffer,
            json: null,
            text: "",
        };
    }
}

// Add other obsidian exports as needed for testing
export const App = {};
export const Plugin = {};
export const Setting = {};