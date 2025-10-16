/**
 * Parses a link reference into path and subpath components.
 *
 * @param link - The link to parse (e.g., "file#heading" or "file")
 * @returns Object with path and optional subpath (heading/block reference)
 */
export function parseLinkReference(link: string): {
    path: string;
    subpath: string | null;
} {
    const anchorPos = link.indexOf("#");
    if (anchorPos < 0) {
        return { path: link, subpath: null };
    }
    return {
        path: link.substring(0, anchorPos),
        subpath: link.substring(anchorPos + 1),
    };
}

/**
 * Formats content as a blockquote with optional callout heading.
 *
 * @param content - The content to format
 * @param calloutHeading - Optional callout heading (e.g., "[!magic] Affirmation")
 * @returns The formatted blockquote string
 */
export function formatAsBlockquote(
    content: string,
    calloutHeading?: string,
): string {
    const lines = content.split("\n").map((line) => `> ${line}`);
    if (calloutHeading) {
        lines.unshift(`> ${calloutHeading}`);
    }
    return lines.join("\n");
}

/**
 * Formats embedded content as a nested blockquote callout.
 *
 * @param content - The content to format
 * @param linkTarget - The link target to display in the callout header
 * @param depth - The nesting depth (0 = single >, 1 = >>, etc.)
 * @returns The formatted blockquote string
 */
export function formatAsEmbedBlockquote(
    content: string,
    linkTarget: string,
    depth: number,
): string {
    const prefix = ">".repeat(depth + 1);
    const lines = content
        .split("\n")
        .map((line) => `${prefix} ${line}`)
        .join("\n");
    const calloutHeader = `${prefix} [!quote] ${linkTarget}`;
    return `${calloutHeader}\n${lines}`;
}

/**
 * Filters out callouts of specified types from content.
 * Handles nested callouts by tracking the exact quote prefix.
 *
 * @param content - The content to filter
 * @param calloutTypes - Newline-separated list of callout types to exclude
 * @returns The filtered content with specified callouts removed
 */
export function filterCallouts(content: string, calloutTypes: string): string {
    if (!calloutTypes.trim()) {
        return content;
    }

    const types = calloutTypes
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

    if (types.length === 0) {
        return content;
    }

    const lines = content.split("\n");
    const result: string[] = [];
    let skipPrefix = "";

    for (const line of lines) {
        // If we're skipping, check if we should continue
        if (skipPrefix) {
            const trimmedLine = line.trimStart();
            const trimmedPrefix = skipPrefix.trim();
            const depthMatch =
                skipPrefix.split(">").length === trimmedLine.split(">").length;

            // Continue skipping if line starts with prefix and isn't a new callout
            if (
                trimmedLine.startsWith(trimmedPrefix) &&
                !(trimmedLine.includes("[!") && depthMatch)
            ) {
                continue;
            }

            // Stop skipping - but don't push yet, fall through to check this line
            skipPrefix = "";
        }

        // Check if line starts a callout we should exclude
        const calloutMatch = line.match(/^((?:>\s*)+)\[!(\w+)\]/);
        if (calloutMatch) {
            const prefix = calloutMatch[1].trim();
            const calloutType = calloutMatch[2].toLowerCase();
            if (types.some((t) => t.toLowerCase() === calloutType)) {
                skipPrefix = prefix;
                continue;
            }
        }

        result.push(line);
    }

    return result.join("\n");
}
