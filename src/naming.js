// Naming helpers for the downloadable ZIP archive name.
// This module computes a user-friendly ZIP filename that includes the original
// file name(s) rather than a generic "resized" prefix.

import { sanitizeFilename } from './utils.js';

/**
 * Extract a base filename (without extension) and sanitize it for cross-platform safety.
 * @param {string} fileName
 * @returns {string}
 */
function getSafeBaseName(fileName) {
    const base = String(fileName || 'image').replace(/\.[^.]+$/, '');
    return sanitizeFilename(base);
}

/**
 * Find a common prefix across an array of strings.
 * Returns an empty string if there is no meaningful common prefix.
 * @param {string[]} values
 * @returns {string}
 */
function getCommonPrefix(values) {
    if (!values || values.length === 0) return '';
    if (values.length === 1) return values[0] || '';
    let prefix = values[0] || '';
    for (let i = 1; i < values.length; i++) {
        const val = values[i] || '';
        let j = 0;
        const max = Math.min(prefix.length, val.length);
        while (j < max && prefix[j] === val[j]) j++;
        prefix = prefix.slice(0, j);
        if (prefix.length === 0) break;
    }
    // Avoid cutting in the middle of a token; trim back to a separator if possible
    if (prefix.length > 0) {
        const SEP_RE = /[\s_.-]/g;
        let lastSep = -1;
        let match;
        while ((match = SEP_RE.exec(prefix)) !== null) lastSep = match.index;
        if (lastSep > 2) prefix = prefix.slice(0, lastSep); // keep at least 3 chars if trimming
    }
    // Discard very short prefixes
    if (prefix.trim().length < 3) return '';
    return prefix.trim();
}

/**
 * Compute a ZIP filename that includes the original file name(s).
 * - Single file: "<base>_<timestamp>.zip"
 * - Multiple files: "<commonPrefix|firstBase+N>_<timestamp>.zip"
 * @param {File[]} files
 * @returns {string}
 */
export function computeZipFilename(files) {
    const safeBases = (Array.isArray(files) ? files : [])
        .map(f => getSafeBaseName(f?.name));

    let base = 'images';
    if (safeBases.length === 1) {
        base = safeBases[0] || 'image';
    } else if (safeBases.length > 1) {
        const common = getCommonPrefix(safeBases);
        if (common) {
            base = common;
        } else {
            base = `${safeBases[0] || 'image'}+${safeBases.length - 1}`;
        }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = sanitizeFilename(`${base}_${timestamp}`);
    return `${name}.zip`;
}


