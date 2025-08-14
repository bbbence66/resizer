// Image processing pipeline using Canvas APIs only (client-side).
// - Resizes with different fit modes
// - Exif orientation handling on load
// - Optional simple sharpening
// - Exports JPEG/PNG/WebP/AVIF with quality
// - Injects DPI for JPEG via piexifjs if requested

import { hexToRgba, inferOutputName, sanitizeFilename, makeUniqueName } from './utils.js';

/**
 * @typedef {Object} Preset
 * @property {string} name
 * @property {number} width
 * @property {number} height
 * @property {('cover'|'contain'|'inside'|'outside'|'stretch')} fit
 * @property {('jpeg'|'png'|'webp'|'avif')} format
 * @property {number} quality
 * @property {number} sharpen
 * @property {string} background
 */

/**
 * Load an image file into ImageBitmap and read EXIF (orientation).
 */
async function loadImageWithMetadata(file) {
    const arrayBuffer = await file.arrayBuffer();
    let exif = {};
    try {
        // exifr is loaded via UMD on window
        exif = await window.exifr?.parse(new Blob([arrayBuffer])) || {};
    } catch {}
    let imageBitmap;
    try {
        // Try honoring orientation at decode time if supported
        // Some browsers ignore options, we will still correct below if needed
        imageBitmap = await createImageBitmap(new Blob([arrayBuffer]), { imageOrientation: 'from-image' });
    } catch {
        imageBitmap = await createImageBitmap(new Blob([arrayBuffer]));
    }
    return { imageBitmap, exif };
}

function getCanvasContext(width, height, useAlpha) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: useAlpha });
    if (!ctx) throw new Error('2D context not available');
    return { canvas, ctx };
}

function computeDrawRect(srcW, srcH, dstW, dstH, fit) {
    if (fit === 'stretch') return { x: 0, y: 0, w: dstW, h: dstH };
    const srcRatio = srcW / srcH;
    const dstRatio = dstW / dstH;
    let w = dstW, h = dstH;
    if (fit === 'cover') {
        if (srcRatio > dstRatio) {
            h = dstH;
            w = Math.round(h * srcRatio);
        } else {
            w = dstW;
            h = Math.round(w / srcRatio);
        }
    } else if (fit === 'contain' || fit === 'inside') {
        if (srcRatio > dstRatio) {
            w = dstW;
            h = Math.round(w / srcRatio);
        } else {
            h = dstH;
            w = Math.round(h * srcRatio);
        }
    } else if (fit === 'outside') {
        if (srcRatio > dstRatio) {
            h = dstH;
            w = Math.round(h * srcRatio);
        } else {
            w = dstW;
            h = Math.round(w / srcRatio);
        }
    }
    const x = Math.round((dstW - w) / 2);
    const y = Math.round((dstH - h) / 2);
    return { x, y, w, h };
}

function applySharpen(ctx, width, height, intensity) {
    if (!intensity || intensity <= 0) return;
    const weights = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0,
    ];
    const wSum = weights.reduce((a,b) => a + b, 0) || 1;
    const imageData = ctx.getImageData(0, 0, width, height);
    const src = imageData.data;
    const out = new Uint8ClampedArray(src.length);
    const get = (x, y, c) => src[(y * width + x) * 4 + c];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let acc = 0;
                let i = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        acc += get(x + kx, y + ky, c) * weights[i++];
                    }
                }
                const val = (1 - intensity) * get(x, y, c) + intensity * (acc / wSum);
                out[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, val));
            }
            out[(y * width + x) * 4 + 3] = get(x, y, 3);
        }
    }
    imageData.data.set(out);
    ctx.putImageData(imageData, 0, 0);
}

async function renderToBlob(canvas, format, quality) {
    const type = {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        avif: 'image/avif',
    }[format] || 'image/png';

    const supports = (await Promise.resolve().then(() => 'toBlob' in canvas)) && typeof canvas.toBlob === 'function';
    if (!supports) throw new Error('Canvas toBlob not available');
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), type, typeof quality === 'number' ? quality : undefined);
    });
    return blob;
}

function injectJpegDpiIfNeeded(blob, dpi) {
    if (!dpi || dpi <= 0) return blob;
    // piexifjs works on base64 Data URLs, so we need to convert
    return new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => {
            try {
                const dataUrl = fr.result;
                const zeroth = {};
                const xRes = dpi; const yRes = dpi;
                zeroth[window.piexif.ImageIFD.XResolution] = [xRes, 1];
                zeroth[window.piexif.ImageIFD.YResolution] = [yRes, 1];
                zeroth[window.piexif.ImageIFD.ResolutionUnit] = 2; // inches
                const exifObj = { '0th': zeroth };
                const exifBytes = window.piexif.dump(exifObj);
                const inserted = window.piexif.insert(exifBytes, dataUrl);
                // Convert data URL back to Blob
                const byteString = atob(inserted.split(',')[1]);
                const mimeString = inserted.split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                resolve(new Blob([ab], { type: mimeString }));
            } catch {
                resolve(blob);
            }
        };
        fr.readAsDataURL(blob);
    });
}

function correctOrientationToCanvas(imageBitmap, orientation) {
    // If no orientation or normal
    if (!orientation || orientation === 1) {
        const { canvas, ctx } = getCanvasContext(imageBitmap.width, imageBitmap.height, true);
        ctx.drawImage(imageBitmap, 0, 0);
        return canvas;
    }
    // Based on EXIF orientation codes
    const swap = orientation >= 5 && orientation <= 8;
    const width = swap ? imageBitmap.height : imageBitmap.width;
    const height = swap ? imageBitmap.width : imageBitmap.height;
    const { canvas, ctx } = getCanvasContext(width, height, true);
    switch (orientation) {
        case 2: // horizontal flip
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
            break;
        case 3: // 180
            ctx.translate(width, height);
            ctx.rotate(Math.PI);
            break;
        case 4: // vertical flip
            ctx.translate(0, height);
            ctx.scale(1, -1);
            break;
        case 5: // transpose
            ctx.rotate(0.5 * Math.PI);
            ctx.scale(1, -1);
            break;
        case 6: // rotate 90 CW
            ctx.rotate(0.5 * Math.PI);
            ctx.translate(0, -height);
            break;
        case 7: // transverse
            ctx.rotate(0.5 * Math.PI);
            ctx.translate(width, -height);
            ctx.scale(-1, 1);
            break;
        case 8: // rotate 270 CCW
            ctx.rotate(-0.5 * Math.PI);
            ctx.translate(-width, 0);
            break;
        default:
            break;
    }
    ctx.drawImage(imageBitmap, 0, 0);
    return canvas;
}

async function transformSingle(file, preset, globalOptions, index, total) {
    const { imageBitmap, exif } = await loadImageWithMetadata(file);
    const orientedCanvas = correctOrientationToCanvas(imageBitmap, exif?.Orientation);
    const srcW = orientedCanvas.width;
    const srcH = orientedCanvas.height;

    // Auto dimension handling: if preset requests locking one dimension by aspect ratio
    let targetW = preset.width;
    let targetH = preset.height;
    // If only one dimension is provided and keepAspect is true, compute the other
    if (preset.keepAspect !== false) {
        const aspect = srcW / srcH;
        if (targetW && !targetH) {
            targetH = Math.round(targetW / aspect);
        } else if (!targetW && targetH) {
            targetW = Math.round(targetH * aspect);
        }
    }

    const useAlpha = preset.format !== 'jpeg' && globalOptions.preserveTransparency !== false;

    const { canvas, ctx } = getCanvasContext(targetW, targetH, useAlpha);
    // Always start from a clear surface
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw according to mode
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    let rect = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    const singleDim = (preset.width && !preset.height) || (!preset.width && preset.height);
    if (!singleDim) {
        rect = computeDrawRect(srcW, srcH, canvas.width, canvas.height, preset.fit);
    }

    // Background fill policy: if format cannot keep alpha OR user disabled transparency and margins exist, paint background
    const leavesMargins = rect.x > 0 || rect.y > 0 || rect.w < canvas.width || rect.h < canvas.height;
    if (!useAlpha || (globalOptions.preserveTransparency === false && leavesMargins)) {
        const bg = preset.background || globalOptions.backgroundColor || '#ffffff';
        const [r,g,b,a] = hexToRgba(bg, 1);
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(orientedCanvas, rect.x, rect.y, rect.w, rect.h);

    if (preset.sharpen > 0) {
        applySharpen(ctx, canvas.width, canvas.height, Math.min(1, Math.max(0, preset.sharpen)));
    }

    let blob = await renderToBlob(canvas, preset.format, preset.quality);
    if (preset.format === 'jpeg') {
        if (globalOptions.jpegDpi) {
            blob = await injectJpegDpiIfNeeded(blob, globalOptions.jpegDpi);
        }
        if (globalOptions.productName || globalOptions.comment) {
            blob = await injectJpegComment(blob, globalOptions.productName, globalOptions.comment);
        }
    }

    const outputName = inferOutputName(
        file.name,
        index,
        { ...preset, width: canvas.width, height: canvas.height, namingPattern: globalOptions.namingPattern, productName: globalOptions.productName }
    );
    const ext = preset.format === 'jpeg' ? 'jpg' : preset.format;
    return { blob, outputName: `${outputName}.${ext}` };
}

export async function processBatch({ files, presets, globalOptions, onProgress }) {
    const total = files.length * presets.length;
    let completed = 0;
    const zip = new window.JSZip();
    // Track unique names per preset folder
    const folderUsedNames = new Map();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        for (let p = 0; p < presets.length; p++) {
            const preset = presets[p];
            const { blob, outputName } = await transformSingle(file, preset, globalOptions, i, files.length);
            const parts = outputName.split('.');
            const ext = parts.pop();
            const base = parts.join('.') || 'image';
            const safeBase = sanitizeFilename(base);
            const folderName = sanitizeFilename(preset.name || 'preset');
            const folder = zip.folder(folderName);
            let used = folderUsedNames.get(folderName);
            if (!used) { used = new Set(); folderUsedNames.set(folderName, used); }
            const uniqueBase = makeUniqueName(safeBase, used);
            const finalName = `${uniqueBase}.${ext}`;
            folder.file(finalName, blob);
            completed++;
            onProgress && onProgress(completed, total);
            // Yield occasionally to keep UI responsive
            if (completed % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }
    }

    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return content;
}

function injectJpegComment(blob, productName, comment) {
    return new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => {
            try {
                const dataUrl = fr.result;
                const zeroth = {};
                const desc = [productName, comment].filter(Boolean).join(' - ');
                if (desc) {
                    zeroth[window.piexif.ImageIFD.ImageDescription] = desc;
                }
                const exifObj = { '0th': zeroth };
                const exifBytes = window.piexif.dump(exifObj);
                const inserted = window.piexif.insert(exifBytes, dataUrl);
                const byteString = atob(inserted.split(',')[1]);
                const mimeString = inserted.split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                resolve(new Blob([ab], { type: mimeString }));
            } catch {
                resolve(blob);
            }
        };
        fr.readAsDataURL(blob);
    });
}

