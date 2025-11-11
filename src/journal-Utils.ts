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
    calloutType = "embedded-note",
): string {
    const prefix = ">".repeat(depth + 1);
    const lines = content
        .split("\n")
        .map((line) => `${prefix} ${line}`)
        .join("\n");
    const calloutHeader = `${prefix} [!${calloutType}] ${linkTarget}`;
    return `${calloutHeader}\n${lines}`;
}

/**
 * Filters out callouts of specified types from content.
 * Handles nested callouts by tracking depth and parent exclusion state.
 * If a callout is excluded, all nested content (including other callouts)
 * is also excluded until we return to the parent level or shallower.
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
    let skipDepth = -1; // -1 means not skipping, >= 0 means skip at this depth
    let previousLineBlank = false;

    for (const line of lines) {
        const trimmed = line.trimStart();

        // Count '>' chars at start (handles both '>>' and '> >' style)
        const depth = (trimmed.match(/^(?:>\s*)*/)?.[0].match(/>/g) || [])
            .length;
        const isBlank = depth === 0 && line.trim().length === 0;
        const calloutMatch = line.match(/^((?:>\s*)+)\[!(\w+)\]/);

        // Currently skipping an excluded callout?
        if (skipDepth >= 0) {
            // Skip deeper or same-depth non-header content
            if (depth > skipDepth || (depth === skipDepth && !calloutMatch)) {
                previousLineBlank = isBlank;
                continue;
            }
            // Same-depth callout without blank line separator? Keep skipping
            if (depth === skipDepth && calloutMatch && !previousLineBlank) {
                previousLineBlank = isBlank;
                continue;
            }
            // Otherwise stop skipping (shallower depth or separated sibling)
            skipDepth = -1;
        }

        // Check if this callout should be excluded
        if (calloutMatch) {
            const calloutType = calloutMatch[2].toLowerCase();
            if (types.some((t) => t.toLowerCase() === calloutType)) {
                skipDepth = depth;
                previousLineBlank = isBlank;
                continue;
            }
        }

        result.push(line);
        previousLineBlank = isBlank;
    }

    return result.join("\n");
}
