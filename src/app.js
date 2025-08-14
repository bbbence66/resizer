// Entry point: wires UI to image processing. All client-side.
// Structure:
// - UI management for files, presets, controls
// - Batch pipeline using OffscreenCanvas/Canvas for resize, format, quality
// - EXIF handling (read for orientation; optional DPI injection for JPEG)
// - ZIP assembly and download

import { createPresetManager } from './presets.js';
import { processBatch } from './pipeline.js';
import { formatBytes } from './utils.js';

// DOM elements
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const dpiInput = document.getElementById('dpi');
const dpiVal = document.getElementById('dpiVal');
const bgColorInput = document.getElementById('bgColor');
const preserveTransparencyInput = document.getElementById('preserveTransparency');
const namingPatternInput = document.getElementById('namingPattern');
const productNameInput = document.getElementById('productName');
const metaCommentInput = document.getElementById('metaComment');

// Presets init
const presetsContainer = document.getElementById('presets');
const addPresetBtn = document.getElementById('addPresetBtn');
const presetManager = createPresetManager(presetsContainer);
const presetModal = document.getElementById('presetModal');
const presetEditorContainer = document.getElementById('presetEditorContainer');

// State for files
/** @type {Array<{file: File, url: string, imageBitmap?: ImageBitmap, exif?: any}>} */
let selectedFiles = [];

// Update DPI label
function syncDpiLabel() {
	dpiVal.textContent = String(dpiInput.value);
}
syncDpiLabel();
dpiInput.addEventListener('input', syncDpiLabel);

// File handling helpers
function addFiles(files) {
	const arr = Array.from(files || []);
	if (arr.length === 0) return;

	// Create object URLs and populate UI
	for (const file of arr) {
		if (!file.type.startsWith('image/')) continue;
		const url = URL.createObjectURL(file);
		selectedFiles.push({ file, url });
	}
	renderFileList();
}

function clearFiles() {
	for (const f of selectedFiles) {
		try { URL.revokeObjectURL(f.url); } catch {}
	}
	selectedFiles = [];
	renderFileList();
}

function renderFileList() {
	fileList.innerHTML = '';
	fileCount.textContent = `${selectedFiles.length} files`;
	processBtn.disabled = selectedFiles.length === 0 || presetManager.presets.length === 0;
	for (const { file, url } of selectedFiles) {
		const li = document.createElement('li');
		li.className = 'file-item';
		const img = document.createElement('img');
		img.className = 'thumb';
		img.src = url;
		const meta = document.createElement('div');
		meta.className = 'meta';
		const name = document.createElement('div');
		name.className = 'name';
		name.textContent = file.name;
		const badge = document.createElement('div');
		badge.className = 'badge';
		badge.textContent = formatBytes(file.size);
		meta.appendChild(name);
		meta.appendChild(badge);
		li.appendChild(img);
		li.appendChild(meta);
		fileList.appendChild(li);
	}
}

// Drag & drop
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); });
dropzone.addEventListener('drop', (e) => {
	e.preventDefault();
	addFiles(e.dataTransfer?.files);
});
fileInput.addEventListener('change', () => addFiles(fileInput.files));

// Presets
addPresetBtn.addEventListener('click', () => {
    presetsContainer.hidden = false;
    presetEditorContainer.appendChild(presetsContainer);
    presetManager.addPreset();
    presetModal.hidden = false;
});

// modal close handlers
if (presetModal) {
    presetModal.addEventListener('click', (e) => {
        const target = e.target;
        if (target && (target.getAttribute('data-close') !== null || target.closest('[data-close]'))) {
            presetModal.hidden = true;
            document.querySelector('.controls .panel').appendChild(presetsContainer);
            presetsContainer.hidden = true;
        }
    });
}

// Clear
clearBtn.addEventListener('click', clearFiles);

// Process pipeline
processBtn.addEventListener('click', async () => {
	// Use selected saved presets; if none selected, use the inline editor (if present)
	let presets = presetManager.getSelectedSavedPresets();
	if (!presets || presets.length === 0) {
		presets = presetManager.getActivePresets();
	}
	if (selectedFiles.length === 0 || presets.length === 0) return;

	processBtn.disabled = true;
	progress.hidden = false;
	progressBar.style.width = '0%';
	progressText.textContent = '0%';

	const globalOptions = {
		jpegDpi: Number(dpiInput.value),
		backgroundColor: bgColorInput.value,
		preserveTransparency: preserveTransparencyInput.checked,
		namingPattern: namingPatternInput.value || '{name}_{preset}',
		productName: productNameInput.value || '',
		comment: metaCommentInput.value || '',
	};

	const onProgress = (completed, total) => {
		const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
		progressBar.style.width = `${pct}%`;
		progressText.textContent = `${pct}%`;
	};

	try {
		const zipBlob = await processBatch({ files: selectedFiles.map(f => f.file), presets, globalOptions, onProgress });
		const url = URL.createObjectURL(zipBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `resized_${new Date().toISOString().replace(/[:.]/g,'-')}.zip`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 2000);
	} catch (err) {
		console.error(err);
		alert('Error during processing. See console for details.');
	} finally {
		processBtn.disabled = false;
		progress.hidden = true;
	}
});

// Initial default preset for convenience
presetManager.addPreset({ name: 'web-800w', width: 800, height: 800, fit: 'contain', format: 'webp', quality: 0.8 });

