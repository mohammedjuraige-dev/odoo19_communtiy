/** @odoo-module **/

/**
 * Calculates a fuzzy match score for a search query against a target string.
 * Returns 0 if no match, or a positive score indicating match relevance.
 *
 * @param {string} query - Search query
 * @param {string} target - Target string to match against
 * @returns {number} Match score (0 = no match, higher = better match)
 */
export function fuzzyScore(query, target) {
    if (!query) return 1;
    if (!target) return 0;

    const q = query.toLowerCase().trim();
    const t = target.toLowerCase().trim();

    if (q.length === 0) return 1;
    if (t.length === 0) return 0;

    // 1. Exact match
    if (t === q) return 1000;

    // 2. Exact prefix match
    if (t.startsWith(q)) {
        return 900 - (t.length - q.length);
    }

    // 3. Exact substring match
    const subIdx = t.indexOf(q);
    if (subIdx !== -1) {
        const isWordStart = subIdx === 0 || /[\s/._-]/.test(t[subIdx - 1]);
        return (isWordStart ? 800 : 600) - subIdx * 5 - (t.length - q.length);
    }

    // 4. Word initials / acronym match (e.g. "po" -> "Purchase Orders", "crm" -> "Customer Relationship Management")
    const words = t.split(/[\s/._-]+/).filter(Boolean);
    const initials = words.map(w => w[0]).join('');
    if (initials.includes(q)) {
        return 500 - (initials.length - q.length);
    }

    // 5. Subsequence fuzzy match (all query characters appear in target in order)
    let qIdx = 0;
    let score = 0;
    let lastMatchIdx = -10;

    for (let i = 0; i < t.length && qIdx < q.length; i++) {
        if (t[i] === q[qIdx]) {
            let charScore = 10;
            // Consecutive matching characters bonus
            if (i === lastMatchIdx + 1) {
                charScore += 25;
            }
            // Word boundary match bonus
            if (i === 0 || /[\s/._-]/.test(t[i - 1])) {
                charScore += 35;
            }
            score += charScore;
            lastMatchIdx = i;
            qIdx++;
        }
    }

    // All characters of query matched in order
    if (qIdx === q.length) {
        const firstMatch = t.indexOf(q[0]);
        const span = Math.max(0, lastMatchIdx - (firstMatch >= 0 ? firstMatch : 0));
        return Math.max(1, score - span);
    }

    return 0;
}

/**
 * Splits text into segments of matched and non-matched text for UI highlighting.
 * Returns an array of objects: { text: string, match: boolean }
 *
 * @param {string} text
 * @param {string} query
 * @returns {Array<{text: string, match: boolean}>}
 */
export function highlightMatches(text, query) {
    if (!text) return [];
    if (!query || !query.trim()) {
        return [{ text, match: false }];
    }

    const q = query.trim().toLowerCase();
    const tLower = text.toLowerCase();

    // 1. Try exact substring match first for clean word highlighting
    const subIdx = tLower.indexOf(q);
    if (subIdx !== -1) {
        const segments = [];
        if (subIdx > 0) {
            segments.push({ text: text.slice(0, subIdx), match: false });
        }
        segments.push({ text: text.slice(subIdx, subIdx + q.length), match: true });
        if (subIdx + q.length < text.length) {
            segments.push({ text: text.slice(subIdx + q.length), match: false });
        }
        return segments;
    }

    // 2. Subsequence character matching fallback
    const segments = [];
    let qIdx = 0;
    let currentSegment = null;

    for (let i = 0; i < text.length; i++) {
        const isMatch = qIdx < q.length && tLower[i] === q[qIdx];
        if (isMatch) {
            qIdx++;
        }

        if (!currentSegment || currentSegment.match !== isMatch) {
            currentSegment = { text: text[i], match: isMatch };
            segments.push(currentSegment);
        } else {
            currentSegment.text += text[i];
        }
    }

    // If query was not fully matched as a subsequence, return un-highlighted text
    if (qIdx < q.length) {
        return [{ text, match: false }];
    }

    return segments;
}
