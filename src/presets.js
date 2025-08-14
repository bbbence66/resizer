// Preset manager component: creates and manages resize presets UI entries.

import { clamp } from './utils.js';

const DEFAULT_PRESET = {
	name: 'preset',
	width: undefined, // auto by default
	height: undefined, // auto by default
	fit: 'cover', // used when both width & height are set
	format: 'jpeg', // jpeg | png | webp | avif
	quality: 0.85, // 0..1 for lossy formats
	sharpen: 0, // 0..1 simple unsharp mask intensity
	background: '#ffffff', // optional override per preset
};

export function createPresetManager(container) {
	/** @type {Array<any>} */
	const presets = [];

	// localStorage-backed saved presets
	const STORAGE_KEY = 'batch-resizer:saved-presets:v1';
	function loadSavedPresets() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return [];
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch { return []; }
	}
	function saveSavedPresets(list) {
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
	}

	const savedListEl = document.getElementById('savedPresetsList');
	const selectedSavedIds = new Set();

	function generateId() { return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

	function refreshSavedList() {
		const saved = loadSavedPresets();
		let mutated = false;
		savedListEl.innerHTML = '';
		if (saved.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'muted';
			empty.textContent = 'No saved presets yet. Create one with "+ Add Preset".';
			savedListEl.appendChild(empty);
			window.dispatchEvent(new CustomEvent('presets-changed'));
			return;
		}
		saved.forEach((p) => {
			if (!p.id) { p.id = generateId(); mutated = true; }
			const row = document.createElement('div');
			row.className = 'saved-item';
			row.innerHTML = `
				<input type="checkbox" ${selectedSavedIds.has(p.id) ? 'checked' : ''} data-id="${p.id}" />
				<span>${p.name}</span>
				<span class="meta">${p.width || 'auto'}×${p.height || 'auto'} ${p.format}</span>
				<button title="Delete" class="btn" data-del aria-label="Delete preset">🗑️</button>
			`;
			const cb = row.querySelector('input[type="checkbox"]');
			cb.addEventListener('change', () => {
				if (cb.checked) selectedSavedIds.add(p.id); else selectedSavedIds.delete(p.id);
				window.dispatchEvent(new CustomEvent('presets-changed'));
			});
			row.querySelector('[data-del]').addEventListener('click', () => {
				const list = loadSavedPresets();
				const idx = list.findIndex(x => x.id === p.id);
				if (idx >= 0) list.splice(idx, 1);
				saveSavedPresets(list);
				selectedSavedIds.delete(p.id);
				refreshSavedList();
			});
			savedListEl.appendChild(row);
		});
		if (mutated) saveSavedPresets(saved);
		window.dispatchEvent(new CustomEvent('presets-changed'));
	}

	function addPreset(initial = {}) {
		const preset = { ...DEFAULT_PRESET, ...initial };
		presets.push(preset);
		render();
	}

	function removePreset(index) {
		presets.splice(index, 1);
		render();
	}

	function getActivePresets() {
		return presets.map(p => ({ ...p }));
	}

	function saveCurrentAsPreset(presetIndex) {
		const saved = loadSavedPresets();
		const item = { ...presets[presetIndex] };
		if (!item.id) item.id = generateId();
		saved.push(item);
		saveSavedPresets(saved);
		selectedSavedIds.add(item.id);
		refreshSavedList();
		// close editor after save
		presets.splice(presetIndex, 1);
		render();
	}

	function render() {
		container.innerHTML = '';
		presets.slice(0,1).forEach((preset, index) => {
			const el = document.createElement('div');
			el.className = 'preset';
			el.innerHTML = `
				<header>
					<input type="text" value="${preset.name}" aria-label="Preset name" title="Preset name" />
					<div style="display:flex; gap:6px;">
						<button class="btn" data-save>Save</button>
					</div>
				</header>
				<div class="row">
					<label>Width
						<input type="range" min="1" max="8000" step="1" value="${preset.width ?? 1200}" ${preset.width ? '' : 'disabled'}>
						<input type="number" min="0" max="8000" step="1" value="${preset.width ?? ''}" placeholder="auto">
						<div class="muted"><span data-w-val>${preset.width ?? 'auto'}</span> ${preset.width ? 'px' : ''}</div>
					</label>
					<label>Height
						<input type="range" min="1" max="8000" step="1" value="${preset.height ?? 1200}" ${preset.height ? '' : 'disabled'}>
						<input type="number" min="0" max="8000" step="1" value="${preset.height ?? ''}" placeholder="auto">
						<div class="muted"><span data-h-val>${preset.height ?? 'auto'}</span> ${preset.height ? 'px' : ''}</div>
					</label>
				</div>
				<div class="row">
					<label>Fit
						<select>
							<option ${preset.fit==='cover'?'selected':''} value="cover">cover</option>
							<option ${preset.fit==='contain'?'selected':''} value="contain">contain</option>
							<option ${preset.fit==='inside'?'selected':''} value="inside">inside</option>
							<option ${preset.fit==='outside'?'selected':''} value="outside">outside</option>
							<option ${preset.fit==='stretch'?'selected':''} value="stretch">stretch</option>
						</select>
					</label>
					<label>Format
						<select>
							<option ${preset.format==='jpeg'?'selected':''} value="jpeg">jpeg</option>
							<option ${preset.format==='png'?'selected':''} value="png">png</option>
							<option ${preset.format==='webp'?'selected':''} value="webp">webp</option>
							<option ${preset.format==='avif'?'selected':''} value="avif">avif</option>
						</select>
					</label>
				</div>
				<div class="row">
					<label>Quality
						<input type="range" min="0" max="1" step="0.01" value="${preset.quality}">
						<input type="number" min="0" max="1" step="0.01" value="${preset.quality}">
						<div class="muted"><span data-q-val>${preset.quality}</span></div>
					</label>
					<label>Sharpen
						<input type="range" min="0" max="1" step="0.05" value="${preset.sharpen}">
						<input type="number" min="0" max="1" step="0.05" value="${preset.sharpen}">
						<div class="muted"><span data-s-val>${preset.sharpen}</span></div>
					</label>
				</div>
				<div class="row">
					<label>Background<br/><input type="text" value="${preset.background}"></label>
					<div class="muted">Used when fit is contain and transparency is not preserved.</div>
				</div>
			`;
			const [nameEl] = el.querySelectorAll('header input');
			const [wRange, hRange] = el.querySelectorAll('.row:nth-of-type(1) input[type="range"]');
			const [wNum, hNum] = el.querySelectorAll('.row:nth-of-type(1) input[type="number"]');
			const [wVal, hVal] = el.querySelectorAll('[data-w-val], [data-h-val]');
			const [fitEl, fmtEl] = el.querySelectorAll('.row:nth-of-type(2) select');
			const [qRange, sRange] = el.querySelectorAll('.row:nth-of-type(3) input[type="range"]');
			const [qNum, sNum] = el.querySelectorAll('.row:nth-of-type(3) input[type="number"]');
			const [qVal, sVal] = el.querySelectorAll('[data-q-val], [data-s-val]');
			const [bgEl] = el.querySelectorAll('.row:nth-of-type(4) input[type="text"]');
			nameEl.addEventListener('input', () => preset.name = nameEl.value.trim() || 'preset');

			const applyAutoUI = () => {
				wRange.disabled = !(typeof preset.width === 'number' && preset.width > 0);
				hRange.disabled = !(typeof preset.height === 'number' && preset.height > 0);
			};

			const syncWidth = (value) => {
				const parsed = parseInt(value || '0', 10);
				if (!isFinite(parsed) || parsed <= 0) {
					preset.width = undefined;
					wNum.value = '';
					wVal.textContent = 'auto';
					wRange.disabled = true;
				} else {
					preset.width = clamp(parsed, 1, 8000);
					wRange.value = String(preset.width);
					wNum.value = String(preset.width);
					wVal.textContent = String(preset.width);
					wRange.disabled = false;
				}
				applyAutoUI();
			};
			const syncHeight = (value) => {
				const parsed = parseInt(value || '0', 10);
				if (!isFinite(parsed) || parsed <= 0) {
					preset.height = undefined;
					hNum.value = '';
					hVal.textContent = 'auto';
					hRange.disabled = true;
				} else {
					preset.height = clamp(parsed, 1, 8000);
					hRange.value = String(preset.height);
					hNum.value = String(preset.height);
					hVal.textContent = String(preset.height);
					hRange.disabled = false;
				}
				applyAutoUI();
			};
			wRange.addEventListener('input', () => syncWidth(wRange.value));
			wNum.addEventListener('input', () => syncWidth(wNum.value));
			hRange.addEventListener('input', () => syncHeight(hRange.value));
			hNum.addEventListener('input', () => syncHeight(hNum.value));
			fitEl.addEventListener('change', () => preset.fit = fitEl.value);
			fmtEl.addEventListener('change', () => preset.format = fmtEl.value);
			const syncQuality = (value) => {
				preset.quality = clamp(parseFloat(value || '0'), 0, 1);
				qRange.value = String(preset.quality);
				qNum.value = String(preset.quality);
				qVal.textContent = String(preset.quality);
			};
			const syncSharpen = (value) => {
				preset.sharpen = clamp(parseFloat(value || '0'), 0, 1);
				sRange.value = String(preset.sharpen);
				sNum.value = String(preset.sharpen);
				sVal.textContent = String(preset.sharpen);
			};
			qRange.addEventListener('input', () => syncQuality(qRange.value));
			qNum.addEventListener('input', () => syncQuality(qNum.value));
			sRange.addEventListener('input', () => syncSharpen(sRange.value));
			sNum.addEventListener('input', () => syncSharpen(sNum.value));
			bgEl.addEventListener('input', () => preset.background = bgEl.value || '#ffffff');
			const saveBtn = el.querySelector('[data-save]');
			if (saveBtn) saveBtn.addEventListener('click', () => saveCurrentAsPreset(index));
			container.appendChild(el);
		});
	}

	// initial render of saved list
	refreshSavedList();

	return {
		presets,
		addPreset,
		removePreset,
		getActivePresets,
		getSelectedSavedPresets: () => {
			const saved = loadSavedPresets();
			return saved.filter(p => selectedSavedIds.has(p.id));
		},
	};
}

