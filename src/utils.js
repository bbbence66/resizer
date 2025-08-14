// Small utilities shared across modules

export function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

export function formatBytes(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function hexToRgba(hex, alpha = 1) {
	const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!res) return [255, 255, 255, alpha];
	return [
		parseInt(res[1], 16),
		parseInt(res[2], 16),
		parseInt(res[3], 16),
		alpha,
	];
}

// Naming helper with placeholders: {name}, {index}, {preset}, {width}, {height}, {format}
export function inferOutputName(inputName, index, preset) {
	const base = (inputName || 'image').replace(/\.[^.]+$/, '');
	const pattern = preset.namingPattern || '{name}_{preset}';
	return pattern
		.replaceAll('{name}', base)
		.replaceAll('{index}', String(index))
		.replaceAll('{preset}', preset.name || 'preset')
		.replaceAll('{width}', String(preset.width))
		.replaceAll('{height}', String(preset.height))
		.replaceAll('{format}', preset.format)
		.replaceAll('{product}', preset.productName || '');
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Sanitize a filename for cross-platform safety (especially Windows/ZIP extractors)
// - Replaces invalid characters \ / : * ? " < > | with '-'
// - Collapses whitespace, trims dots/spaces at ends, limits length
// - Avoid reserved device names by appending underscore
export function sanitizeFilename(name, maxLength = 120) {
	let safe = String(name ?? '').replace(/[\\/:*?"<>|]/g, '-');
	safe = safe.replace(/\s+/g, ' ').trim();
	// Remove leading/trailing dots and spaces
	safe = safe.replace(/^[\s.]+|[\s.]+$/g, '');
	if (safe.length === 0) safe = 'image';
	// Reserved names on Windows
	const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
	if (reserved.test(safe)) safe = `${safe}_`;
	if (safe.length > maxLength) safe = safe.slice(0, maxLength);
	return safe;
}

export function makeUniqueName(baseName, usedNames) {
	let candidate = baseName;
	let counter = 2;
	while (usedNames.has(candidate)) {
		candidate = `${baseName}-${counter++}`;
	}
	usedNames.add(candidate);
	return candidate;
}

