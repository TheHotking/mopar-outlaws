/* ==========================================================================
   MOPAR RETRO CRUISER - PIXELATION ENGINE
   ========================================================================== */

const Pixelator = {
    // Configs
    targetWidth: 64,  // Game sprite width
    targetHeight: 32, // Game sprite height
    
    // Canvas elements
    previewCanvas: null,
    previewCtx: null,
    spriteCanvas: null, // Holds the final output sprite used by the game
    spriteCtx: null,
    
    // State
    uploadedImage: null,
    currentPreset: 'bloodline',
    pixelDetail: 64, // Detail resolution (64x32 default)
    primaryColor: '#b91c1c', // Default Bloodline Red
    flipCar: true, // Face forward (mirror) flag
    
    init() {
        this.previewCanvas = document.getElementById('sprite-preview-canvas');
        if (this.previewCanvas) {
            this.previewCtx = this.previewCanvas.getContext('2d');
        }
        
        // Create an offscreen canvas to hold the active game sprite
        this.spriteCanvas = document.createElement('canvas');
        this.spriteCanvas.width = this.targetWidth;
        this.spriteCanvas.height = this.targetHeight;
        this.spriteCtx = this.spriteCanvas.getContext('2d');
        
        // Listeners for UI
        const photoUpload = document.getElementById('photo-upload');
        const pixelSizeSelect = document.getElementById('pixel-size');
        const carPresetSelect = document.getElementById('car-preset');
        const flipCarCheckbox = document.getElementById('flip-car');
        
        if (photoUpload) {
            photoUpload.addEventListener('change', (e) => this.handlePhotoUpload(e));
        }
        
        if (pixelSizeSelect) {
            pixelSizeSelect.addEventListener('change', (e) => {
                this.pixelDetail = parseInt(e.target.value);
                this.generateSprite();
            });
        }
        
        if (carPresetSelect) {
            carPresetSelect.addEventListener('change', (e) => {
                this.currentPreset = e.target.value;
                if (e.target.value !== 'custom') {
                    this.uploadedImage = null; // Clear upload to use preset
                    // Reset file input label
                    const label = document.getElementById('upload-photo-btn-label');
                    if (label) label.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Upload Car Image
                    `;
                }
                this.generateSprite();
                this.renderGallery();
            });
        }

        if (flipCarCheckbox) {
            this.flipCar = flipCarCheckbox.checked;
            flipCarCheckbox.addEventListener('change', (e) => {
                this.flipCar = e.target.checked;
                this.updatePreview();
            });
        }
        
        // Load default custom car or empty state
        const customCars = this.getCustomCars();
        if (customCars.length > 0) {
            const lastSelectedId = localStorage.getItem('mopar_outlaws_selected_car_id');
            const carToSelect = customCars.find(c => c.id === lastSelectedId) || customCars[0];
            this.selectCar(carToSelect.id, 'custom');
        } else {
            this.currentPreset = '';
            this.uploadedImage = null;
            this.drawPlaceholderCar();
            const startBtn = document.getElementById('start-btn');
            if (startBtn) {
                startBtn.disabled = true;
                const subtext = startBtn.querySelector('.btn-subtext');
                if (subtext) subtext.textContent = 'Upload a car image above to start';
            }
        }
        this.renderGallery();
    },
    
    handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const label = document.getElementById('upload-photo-btn-label');
        if (label) {
            label.innerHTML = `✓ Uploaded: ${file.name.substring(0, 12)}...`;
        }

        // Dynamically select custom preset
        const carPresetSelect = document.getElementById('car-preset');
        if (carPresetSelect) {
            let customOption = carPresetSelect.querySelector('option[value="custom"]');
            if (!customOption) {
                customOption = document.createElement('option');
                customOption.value = 'custom';
                customOption.textContent = 'Custom Uploaded Car';
                carPresetSelect.appendChild(customOption);
            }
            carPresetSelect.value = 'custom';
            this.currentPreset = 'custom';
        }

        // Set default pixel detail to Toy Car Style (256x128) for uploaded images
        const pixelSizeSelect = document.getElementById('pixel-size');
        if (pixelSizeSelect) {
            pixelSizeSelect.value = '256';
            this.pixelDetail = 256;
        }
        
        this.isFreshUpload = true;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                this.uploadedImage = img;
                this.generateSprite();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    },
    
    generateSprite() {
        const w = this.pixelDetail;
        const h = Math.round(w / 2); // Keep 2:1 aspect ratio
        
        if (this.spriteCanvas) {
            this.spriteCanvas.width = w;
            this.spriteCanvas.height = h;
        }
        
        if (this.uploadedImage) {
            this.pixelateUploadedImage();
        } else {
            this.drawPreset(this.currentPreset);
        }
        this.applyCartoonEffect();
        this.updatePreview();

        if (this.uploadedImage && this.isFreshUpload) {
            this.isFreshUpload = false;
            setTimeout(() => {
                let carName = prompt("Name your custom Mopar build:", "Custom Outlaw");
                if (carName === null) return;
                carName = carName.trim().substring(0, 15) || "Custom Outlaw";
                this.saveCustomCar(carName);
            }, 100);
        }
    },    // Apply high contrast cel-shading and bold black outlines
    applyCartoonEffect() {
        const ctx = this.spriteCtx;
        const w = this.spriteCanvas.width;
        const h = this.spriteCanvas.height;
        
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        
        // Create a copy of the alpha values for boundary outline detection
        const alphas = new Uint8ClampedArray(w * h);
        for (let i = 0; i < data.length; i += 4) {
            alphas[i / 4] = data[i + 3];
        }
        
        const isToyCar = (w >= 256);
        
        if (isToyCar) {
            // Hot Wheels / RC Toy Car styling: Keep original high-resolution colors completely intact
            // We only apply a light contrast/vibrancy boost for high-fidelity look
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                
                let r = data[i];
                let g = data[i+1];
                let b = data[i+2];
                
                // Glossy toy finish: boost contrast & brightness slightly
                r = (r - 128) * 1.15 + 128;
                g = (g - 128) * 1.15 + 128;
                b = (b - 128) * 1.15 + 128;
                
                data[i] = Math.min(255, Math.max(0, r));
                data[i+1] = Math.min(255, Math.max(0, g));
                data[i+2] = Math.min(255, Math.max(0, b));
            }
            
            // Draw a Hot Wheels / RC die-cut sticker backing (white border) with a crisp black outline
            const borderW = w >= 512 ? 4 : 2;
            const strokeW = borderW + 1;
            
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const alpha = alphas[y * w + x];
                    
                    if (alpha === 0) {
                        let distToSolidSq = 999;
                        
                        for (let dy = -strokeW; dy <= strokeW; dy++) {
                            for (let dx = -strokeW; dx <= strokeW; dx++) {
                                const ny = y + dy;
                                const nx = x + dx;
                                if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                                    if (alphas[ny * w + nx] > 0) {
                                        const d2 = dx*dx + dy*dy;
                                        if (d2 < distToSolidSq) {
                                            distToSolidSq = d2;
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (distToSolidSq <= borderW * borderW) {
                            data[idx] = 255;     // R
                            data[idx + 1] = 255; // G
                            data[idx + 2] = 255; // B
                            data[idx + 3] = 255; // White sticker backing
                        } else if (distToSolidSq <= strokeW * strokeW) {
                            data[idx] = 0;       // R
                            data[idx + 1] = 0;   // G
                            data[idx + 2] = 0;   // B
                            data[idx + 3] = 255; // Outer black outline
                        }
                    }
                }
            }
        } else {
            // Retro / Cartoon styles: apply standard pixelated cel-shading and black outlines
            let bandStep = 32;
            if (w >= 128) bandStep = 20;
            
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                
                let r = data[i];
                let g = data[i+1];
                let b = data[i+2];
                
                const gray = (r + g + b) / 3;
                r = gray + (r - gray) * 1.8;
                g = gray + (r - gray) * 1.8;
                b = gray + (r - gray) * 1.8;
                
                r = (r - 128) * 1.4 + 128;
                g = (g - 128) * 1.4 + 128;
                b = (b - 128) * 1.4 + 128;
                
                r = Math.min(Math.max(Math.round(r / bandStep) * bandStep, 0), 255);
                g = Math.min(Math.max(Math.round(g / bandStep) * bandStep, 0), 255);
                b = Math.min(Math.max(Math.round(b / bandStep) * bandStep, 0), 255);
                
                data[i] = r;
                data[i+1] = g;
                data[i+2] = b;
            }
            
            let outlineWidth = 1;
            if (w >= 128) outlineWidth = 2;
            
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const alpha = alphas[y * w + x];
                    
                    if (alpha === 0) {
                        let hasSolidNeighbor = false;
                        for (let dy = -outlineWidth; dy <= outlineWidth; dy++) {
                            for (let dx = -outlineWidth; dx <= outlineWidth; dx++) {
                                if (dx*dx + dy*dy > outlineWidth*outlineWidth) continue;
                                const ny = y + dy;
                                const nx = x + dx;
                                if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                                    if (alphas[ny * w + nx] > 0) {
                                        hasSolidNeighbor = true;
                                        break;
                                    }
                                }
                            }
                            if (hasSolidNeighbor) break;
                        }
                        
                        if (hasSolidNeighbor) {
                            data[idx] = 0;       // R
                            data[idx + 1] = 0;   // G
                            data[idx + 2] = 0;   // B
                            data[idx + 3] = 255; // Solid Alpha for outline
                        }
                    }
                }
            }
        }
        
        ctx.putImageData(imgData, 0, 0);
    },
    
    // Draw a grey placeholder car silhouette when garage is empty
    drawPlaceholderCar() {
        const ctx = this.spriteCtx;
        const w = this.spriteCanvas.width;
        const h = this.spriteCanvas.height;
        ctx.clearRect(0, 0, w, h);
        
        ctx.fillStyle = '#4b5563'; // Neutral grey
        
        // Lower body slab
        ctx.fillRect(w * 0.1, h * 0.45, w * 0.8, h * 0.35);
        // Cabin
        ctx.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.25);
        
        // Wheels
        ctx.fillStyle = '#1f2937';
        
        // Front Wheel
        ctx.beginPath();
        ctx.arc(w * 0.28, h * 0.78, h * 0.16, 0, Math.PI * 2);
        ctx.fill();
        
        // Rear Wheel
        ctx.beginPath();
        ctx.arc(w * 0.72, h * 0.78, h * 0.16, 0, Math.PI * 2);
        ctx.fill();
        
        this.primaryColor = '#4b5563';
        this.updatePreview();
    },
    
    // Render the processed sprite to the menu screen preview canvas
    updatePreview() {
        if (!this.previewCtx) return;
        
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        this.previewCtx.save();
        
        // If flipCar is true, we flip the preview horizontally so they see it facing forward
        if (this.flipCar) {
            this.previewCtx.translate(this.previewCanvas.width, 0);
            this.previewCtx.scale(-1, 1);
        }
        
        this.previewCtx.imageSmoothingEnabled = false;
        this.previewCtx.drawImage(this.spriteCanvas, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
        this.previewCtx.restore();
    },
    
    // Pixelates the uploaded photo using downsampling and retro filters
    pixelateUploadedImage() {
        const w = this.pixelDetail;
        const h = Math.round(w / 2); // Keep 2:1 aspect ratio
        
        // --- STEP 1: HIGH-RES BACKGROUND ISOLATION ---
        const procW = 800;
        const procH = 400; // 2:1 aspect ratio matching the target sprite ratio
        
        const procCanvas = document.createElement('canvas');
        procCanvas.width = procW;
        procCanvas.height = procH;
        const procCtx = procCanvas.getContext('2d');
        
        // Draw the uploaded image onto the high-res processing canvas
        procCtx.drawImage(this.uploadedImage, 0, 0, procW, procH);
        
        let imgData = procCtx.getImageData(0, 0, procW, procH);
        let data = imgData.data;
        
        // Compute Grayscale & Sobel Edge Map
        const gray = new Uint8Array(procW * procH);
        const edge = new Uint8Array(procW * procH);
        
        for (let i = 0; i < data.length; i += 4) {
            gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
        }
        
        for (let y = 1; y < procH - 1; y++) {
            for (let x = 1; x < procW - 1; x++) {
                const idx = y * procW + x;
                const gx = 
                    (gray[idx - procW + 1] + 2 * gray[idx + 1] + gray[idx + procW + 1]) -
                    (gray[idx - procW - 1] + 2 * gray[idx - 1] + gray[idx + procW - 1]);
                const gy = 
                    (gray[idx + procW - 1] + 2 * gray[idx + procW] + gray[idx + procW + 1]) -
                    (gray[idx - procW - 1] + 2 * gray[idx - procW] + gray[idx - procW + 1]);
                edge[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy) / 4);
            }
        }
        
        let attempts = 0;
        const originalData = new Uint8ClampedArray(data);
        
        let localTolerance = 12;
        let maxTolerance = 55;
        let edgeThreshold = 18;
        
        let visited = new Uint8Array(procW * procH);
        
        while (attempts < 3) {
            data.set(originalData);
            visited.fill(0);
            
            const queue = new Int32Array(procW * procH);
            const seedR = new Uint8Array(procW * procH);
            const seedG = new Uint8Array(procW * procH);
            const seedB = new Uint8Array(procW * procH);
            
            let qHead = 0;
            let qTail = 0;
            
            // Seed from top margin (first 4% of rows)
            const topRows = Math.max(3, Math.round(procH * 0.04));
            for (let y = 0; y < topRows; y++) {
                for (let x = 0; x < procW; x++) {
                    const idx = y * procW + x;
                    if (!visited[idx]) {
                        visited[idx] = 1;
                        queue[qTail] = idx;
                        const dIdx = idx * 4;
                        seedR[qTail] = data[dIdx];
                        seedG[qTail] = data[dIdx+1];
                        seedB[qTail] = data[dIdx+2];
                        qTail++;
                    }
                }
            }
            
            // Seed from bottom margin (last 3% of rows)
            const bottomRows = Math.max(3, Math.round(procH * 0.03));
            for (let y = procH - bottomRows; y < procH; y++) {
                for (let x = 0; x < procW; x++) {
                    const idx = y * procW + x;
                    if (!visited[idx]) {
                        visited[idx] = 1;
                        queue[qTail] = idx;
                        const dIdx = idx * 4;
                        seedR[qTail] = data[dIdx];
                        seedG[qTail] = data[dIdx+1];
                        seedB[qTail] = data[dIdx+2];
                        qTail++;
                    }
                }
            }
            
            // Seed from left and right margins (outer 3% of columns)
            const sideCols = Math.max(3, Math.round(procW * 0.03));
            for (let y = 0; y < procH; y++) {
                for (let x = 0; x < sideCols; x++) {
                    const idx = y * procW + x;
                    if (!visited[idx]) {
                        visited[idx] = 1;
                        queue[qTail] = idx;
                        const dIdx = idx * 4;
                        seedR[qTail] = data[dIdx];
                        seedG[qTail] = data[dIdx+1];
                        seedB[qTail] = data[dIdx+2];
                        qTail++;
                    }
                }
                for (let x = procW - sideCols; x < procW; x++) {
                    const idx = y * procW + x;
                    if (!visited[idx]) {
                        visited[idx] = 1;
                        queue[qTail] = idx;
                        const dIdx = idx * 4;
                        seedR[qTail] = data[dIdx];
                        seedG[qTail] = data[dIdx+1];
                        seedB[qTail] = data[dIdx+2];
                        qTail++;
                    }
                }
            }
            
            // BFS loop
            while (qHead < qTail) {
                const idx = queue[qHead];
                const sR = seedR[qHead];
                const sG = seedG[qHead];
                const sB = seedB[qHead];
                qHead++;
                
                const cy = Math.floor(idx / procW);
                const cx = idx % procW;
                
                const pDIdx = idx * 4;
                const pR = data[pDIdx];
                const pG = data[pDIdx+1];
                const pB = data[pDIdx+2];
                
                // Check neighbors
                const neighbors = [];
                if (cx > 0) neighbors.push(idx - 1);
                if (cx < procW - 1) neighbors.push(idx + 1);
                if (cy > 0) neighbors.push(idx - procW);
                if (cy < procH - 1) neighbors.push(idx + procW);
                
                for (let i = 0; i < neighbors.length; i++) {
                    const nIdx = neighbors[i];
                    if (visited[nIdx]) continue;
                    
                    const nDIdx = nIdx * 4;
                    const nR = data[nDIdx];
                    const nG = data[nDIdx+1];
                    const nB = data[nDIdx+2];
                    
                    // Local gradient checks
                    const localDist = Math.sqrt((nR - pR)**2 + (nG - pG)**2 + (nB - pB)**2);
                    if (localDist > localTolerance) continue;
                    
                    // Global deviation check
                    const maxDist = Math.sqrt((nR - sR)**2 + (nG - sG)**2 + (nB - sB)**2);
                    if (maxDist > maxTolerance) continue;
                    
                    // Sobel boundary check
                    if (edge[nIdx] > edgeThreshold) continue;
                    
                    // Tyre & Shadow preservation check
                    const ny = Math.floor(nIdx / procW);
                    if (ny > procH * 0.72) {
                        const brightness = nR + nG + nB;
                        if (brightness < 120) continue;
                    }
                    
                    visited[nIdx] = 1;
                    queue[qTail] = nIdx;
                    seedR[qTail] = sR;
                    seedG[qTail] = sG;
                    seedB[qTail] = sB;
                    qTail++;
                }
            }
            
            // Set background to transparent
            for (let i = 0; i < visited.length; i++) {
                if (visited[i] === 1) {
                    data[i * 4 + 3] = 0;
                }
            }
            
            // Check remaining center density
            let centerPixels = 0;
            let centerTotal = 0;
            const startX = Math.round(procW * 0.25);
            const endX = Math.round(procW * 0.75);
            const startY = Math.round(procH * 0.25);
            const endY = Math.round(procH * 0.75);
            
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    centerTotal++;
                    if (data[(y * procW + x) * 4 + 3] > 0) {
                        centerPixels++;
                    }
                }
            }
            
            const centerRatio = centerPixels / centerTotal;
            if (centerRatio >= 0.18) {
                break; // Car looks preserved!
            } else {
                // We probably flooded the car body, adjust parameters to be stricter and retry
                localTolerance = Math.max(5, localTolerance - 3);
                maxTolerance = Math.max(25, maxTolerance - 10);
                edgeThreshold = Math.max(10, edgeThreshold - 3);
                attempts++;
            }
        }
        
        // --- STEP 2: SKY SWEEP FOR ISLANDS ---
        let skySumR = 0, skySumG = 0, skySumB = 0, skyCount = 0;
        const checkRows = Math.round(procH * 0.1);
        for (let y = 0; y < checkRows; y++) {
            for (let x = 0; x < procW; x++) {
                const idx = y * procW + x;
                if (visited[idx] === 1) {
                    const dIdx = idx * 4;
                    skySumR += originalData[dIdx];
                    skySumG += originalData[dIdx+1];
                    skySumB += originalData[dIdx+2];
                    skyCount++;
                }
            }
        }
        
        if (skyCount > 100) {
            const avgSkyR = skySumR / skyCount;
            const avgSkyG = skySumG / skyCount;
            const avgSkyB = skySumB / skyCount;
            
            const sweepHeight = Math.round(procH * 0.45);
            for (let y = 0; y < sweepHeight; y++) {
                for (let x = 0; x < procW; x++) {
                    const idx = (y * procW + x) * 4;
                    if (data[idx + 3] > 0) {
                        const r = data[idx];
                        const g = data[idx+1];
                        const b = data[idx+2];
                        const dist = Math.sqrt((r - avgSkyR)**2 + (g - avgSkyG)**2 + (b - avgSkyB)**2);
                        if (dist < 25) {
                            data[idx + 3] = 0;
                        }
                    }
                }
            }
        }
        
        // --- STEP 3: ROAD SWEEP FOR ISLANDS ---
        let roadSumR = 0, roadSumG = 0, roadSumB = 0, roadCount = 0;
        const roadCheckRows = Math.round(procH * 0.05);
        for (let y = procH - roadCheckRows; y < procH; y++) {
            for (let x = 0; x < procW; x++) {
                const idx = y * procW + x;
                if (visited[idx] === 1) {
                    const dIdx = idx * 4;
                    roadSumR += originalData[dIdx];
                    roadSumG += originalData[dIdx+1];
                    roadSumB += originalData[dIdx+2];
                    roadCount++;
                }
            }
        }
        
        if (roadCount > 100) {
            const avgRoadR = roadSumR / roadCount;
            const avgRoadG = roadSumG / roadCount;
            const avgRoadB = roadSumB / roadCount;
            
            const sweepStartY = Math.round(procH * 0.72);
            for (let y = sweepStartY; y < procH; y++) {
                for (let x = 0; x < procW; x++) {
                    const idx = (y * procW + x) * 4;
                    if (data[idx + 3] > 0) {
                        const r = data[idx];
                        const g = data[idx+1];
                        const b = data[idx+2];
                        const dist = Math.sqrt((r - avgRoadR)**2 + (g - avgRoadG)**2 + (b - avgRoadB)**2);
                        
                        const brightness = r + g + b;
                        if (dist < 20 && brightness > 120) {
                            data[idx + 3] = 0;
                        }
                    }
                }
            }
        }
        
        // Write the isolated pixel data back to the processing canvas
        procCtx.putImageData(imgData, 0, 0);
        
        // --- STEP 4: DOWNSAMPLE AND PIXELATE ---
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw the isolated high-res car onto the low-res temp canvas
        tempCtx.drawImage(procCanvas, 0, 0, w, h);
        
        const tempImgData = tempCtx.getImageData(0, 0, w, h);
        const tempData = tempImgData.data;
        
        let colorBuckets = {};
        for (let i = 0; i < tempData.length; i += 4) {
            if (tempData[i + 3] > 20) { // Solid threshold
                let r = tempData[i];
                let g = tempData[i+1];
                let b = tempData[i+2];
                
                if (w < 256) {
                    // Retro color quantization (only for low-res pixelated styles)
                    let qStep = w >= 128 ? 32 : 64;
                    r = Math.round(r / qStep) * qStep;
                    g = Math.round(g / qStep) * qStep;
                    b = Math.round(b / qStep) * qStep;
                }
                
                tempData[i] = Math.min(r, 255);
                tempData[i+1] = Math.min(g, 255);
                tempData[i+2] = Math.min(b, 255);
                tempData[i+3] = 255; // Keep completely solid in sprite
                
                const rgbKey = `${tempData[i]},${tempData[i+1]},${tempData[i+2]}`;
                const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(b - r));
                if (maxDiff > 30) {
                    colorBuckets[rgbKey] = (colorBuckets[rgbKey] || 0) + 1;
                }
            } else {
                tempData[i + 3] = 0; // Make completely transparent
            }
        }
        
        // Extract dominant paint color for smoke particles
        let maxCount = 0;
        let dominantColor = '#ff5722';
        for (const [colorStr, count] of Object.entries(colorBuckets)) {
            if (count > maxCount) {
                maxCount = count;
                const [r, g, b] = colorStr.split(',').map(Number);
                dominantColor = `rgb(${r},${g},${b})`;
            }
        }
        this.primaryColor = dominantColor;
        
        tempCtx.putImageData(tempImgData, 0, 0);
        
        // Copy the finished low-res sprite to the main sprite canvas
        this.spriteCtx.clearRect(0, 0, this.spriteCanvas.width, this.spriteCanvas.height);
        this.spriteCtx.imageSmoothingEnabled = false;
        this.spriteCtx.drawImage(tempCanvas, 0, 0, this.spriteCanvas.width, this.spriteCanvas.height);
    },
    
    // Draw built-in retro muscle car designs
    drawPreset(presetName) {
        this.spriteCtx.clearRect(0, 0, this.spriteCanvas.width, this.spriteCanvas.height);
        
        const ctx = this.spriteCtx;
        ctx.save();
        
        // Scale coordinate system from 64x32 base to current canvas dimensions
        const scaleX = this.spriteCanvas.width / 64;
        const scaleY = this.spriteCanvas.height / 32;
        ctx.scale(scaleX, scaleY);
        
        // Draw in 64x32 coordinates
        if (presetName === 'bloodline') {
            // "Bloodline" Challenger - Metallic Deep Cherry Red
            this.primaryColor = '#b91c1c';
            
            // Lower Body (Cherry Red)
            ctx.fillStyle = '#b91c1c';
            ctx.fillRect(8, 13, 48, 11);  // Lower body slab
            ctx.fillRect(18, 7, 24, 7);   // Challenger roof/cabin
            
            // Windows (Dark Tint)
            ctx.fillStyle = '#0a0f1d';
            ctx.fillRect(20, 8, 9, 5);
            ctx.fillRect(30, 8, 10, 5);
            
            // Decals: Double Fender Stripes & Side accent line (Matte Black)
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(14, 15, 3, 2);   // Fender slash stripe 1
            ctx.fillRect(18, 15, 2, 2);   // Fender slash stripe 2
            ctx.fillRect(20, 16, 26, 1);  // Horizontal side accent pinstripe
            
            // Chrome gas cap (Silver pixel at rear left - in 2D profile it is near rear wheel)
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(49, 13, 2, 2);
            
            // Front splitter (Black)
            ctx.fillStyle = '#111111';
            ctx.fillRect(8, 22, 4, 2);
            
            // Wheels (Black rims / stealth look matching photo)
            this.drawWheelBlack(17, 23);
            this.drawWheelBlack(43, 23);
            
        } else if (presetName === 'charger') {
            // Classic '69 Dodge Charger - Plum Crazy Purple
            this.primaryColor = '#7b1fa2';
            
            // Body outline & base (Purple)
            ctx.fillStyle = '#7b1fa2';
            ctx.fillRect(8, 14, 48, 10);  // Main lower body
            ctx.fillRect(16, 8, 26, 7);   // Cabin roof
            
            // Windows
            ctx.fillStyle = '#210e30';
            ctx.fillRect(18, 9, 10, 5);   // Side front window
            ctx.fillRect(29, 9, 10, 5);   // Side rear window
            
            // Charger details (Chrome trim/bumpers)
            ctx.fillStyle = '#dddddd';
            ctx.fillRect(7, 18, 2, 4);    // Front bumper
            ctx.fillRect(55, 19, 2, 3);   // Rear bumper
            
            // Orange indicator
            ctx.fillStyle = '#ff9800';
            ctx.fillRect(9, 15, 2, 2);    // Headlight edge
            
            // Charger signature white tail stripe
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(49, 14, 4, 10);
            
            // Wheels
            this.drawWheel(18, 23);
            this.drawWheel(44, 23);
            
        } else if (presetName === 'challenger') {
            // Challenger Hellcat - HEMI Orange
            this.primaryColor = '#ff5722';
            
            // Body (Orange)
            ctx.fillStyle = '#ff5722';
            ctx.fillRect(8, 13, 48, 11);  // Lower body
            ctx.fillRect(18, 7, 24, 7);   // Roof
            
            // Spoiler (Black)
            ctx.fillStyle = '#111111';
            ctx.fillRect(53, 11, 3, 3);   // Rear spoiler
            ctx.fillRect(8, 14, 4, 2);    // Front splitter
            
            // Windows (Sleek dark tint)
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(20, 8, 9, 5);
            ctx.fillRect(30, 8, 10, 5);
            
            // Hellcat badge detailing (Chrome accents)
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(15, 15, 2, 2);   // Badge accent
            ctx.fillRect(55, 17, 2, 2);   // Red tail light panel
            ctx.fillStyle = '#f43f5e';
            ctx.fillRect(55, 17, 2, 1);
            
            // Wheels (Black rims with metal centers)
            this.drawWheel(17, 23);
            this.drawWheel(43, 23);
            
        } else if (presetName === 'cuda') {
            // '70 Plymouth Cuda - Sublime Lime Green / Black Roof
            this.primaryColor = '#39ff14';
            
            // Lower Body (Green)
            ctx.fillStyle = '#39ff14';
            ctx.fillRect(6, 14, 50, 10);
            ctx.fillRect(18, 8, 24, 6);   // Cabin supports
            
            // Vinyl Top (Matte Black Roof)
            ctx.fillStyle = '#111111';
            ctx.fillRect(18, 7, 20, 2);   // Roof plate
            ctx.fillRect(36, 9, 7, 6);    // Rear pillar
            
            // Windows
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(20, 9, 8, 5);
            ctx.fillRect(29, 9, 7, 5);
            
            // Shaker Hood Scoop (Black)
            ctx.fillStyle = '#111111';
            ctx.fillRect(13, 12, 5, 2);
            
            // Bumper (Chrome)
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(5, 18, 2, 3);
            ctx.fillRect(55, 18, 2, 3);
            
            // Wheels
            this.drawWheel(16, 23);
            this.drawWheel(42, 23);
            
        } else if (presetName === 'viper') {
            // Dodge Viper GTS - GTS Blue with Racing Stripes
            this.primaryColor = '#0284c7';
            
            // Body base (Blue)
            ctx.fillStyle = '#0284c7';
            ctx.fillRect(6, 14, 52, 9);
            ctx.fillRect(20, 8, 20, 7);
            
            // White Double Racing Stripes
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(10, 14, 2, 9);   // Hood stripes
            ctx.fillRect(14, 14, 2, 9);
            ctx.fillRect(24, 8, 2, 15);   // Roof/rear stripes
            ctx.fillRect(28, 8, 2, 15);
            ctx.fillRect(50, 14, 2, 9);
            ctx.fillRect(54, 14, 2, 9);
            
            // Windows (Curve effect)
            ctx.fillStyle = '#0a0f1d';
            ctx.fillRect(21, 9, 18, 5);
            
            // Sleek rear wing
            ctx.fillStyle = '#0284c7';
            ctx.fillRect(54, 10, 3, 4);
            
            // Wheels (Detailed silver alloys)
            this.drawWheel(17, 22);
            this.drawWheel(44, 22);
        }
        ctx.restore();
    },
    
    // Helper to draw a retro pixel wheel
    drawWheel(x, y) {
        const ctx = this.spriteCtx;
        // Outer wheel (Black tyre)
        ctx.fillStyle = '#121214';
        ctx.fillRect(x, y, 8, 8);
        ctx.fillRect(x + 2, y - 1, 4, 1);
        ctx.fillRect(x + 2, y + 8, 4, 1);
        ctx.fillRect(x - 1, y + 2, 1, 4);
        ctx.fillRect(x + 8, y + 2, 1, 4);
        
        // Inner wheel (Chrome hubcap)
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(x + 2, y + 2, 4, 4);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(x + 3, y + 3, 2, 2);
    },
    
    // Helper to draw a stealth black wheel
    drawWheelBlack(x, y) {
        const ctx = this.spriteCtx;
        // Outer wheel (Black tyre)
        ctx.fillStyle = '#080808';
        ctx.fillRect(x, y, 8, 8);
        ctx.fillRect(x + 2, y - 1, 4, 1);
        ctx.fillRect(x + 2, y + 8, 4, 1);
        ctx.fillRect(x - 1, y + 2, 1, 4);
        ctx.fillRect(x + 8, y + 2, 1, 4);
        
        // Inner wheel (Stealth Black hubcap with chrome center badge)
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(x + 2, y + 2, 4, 4);
        ctx.fillStyle = '#cbd5e1'; // center cap badge
        ctx.fillRect(x + 3, y + 3, 2, 2);
    },
    
    // Outlaw Garage Gallery storage & rendering
    getCustomCars() {
        const data = localStorage.getItem('mopar_outlaws_custom_cars');
        return data ? JSON.parse(data) : [];
    },
    
    saveCustomCar(name) {
        const dataUrl = this.spriteCanvas.toDataURL();
        const customCar = {
            id: 'custom_' + Date.now(),
            name: name,
            spriteDataUrl: dataUrl,
            primaryColor: this.primaryColor,
            pixelDetail: this.pixelDetail
        };
        
        let customCars = this.getCustomCars();
        customCars.push(customCar);
        localStorage.setItem('mopar_outlaws_custom_cars', JSON.stringify(customCars));
        
        this.renderGallery();
        this.selectCar(customCar.id, 'custom');
    },
    
    deleteCustomCar(id, event) {
        event.stopPropagation();
        
        let customCars = this.getCustomCars();
        const carToDelete = customCars.find(c => c.id === id);
        const carName = carToDelete ? carToDelete.name : id;
        
        if (!confirm(`Delete "${carName}" from your garage?`)) return;
        
        customCars = customCars.filter(c => c.id !== id);
        localStorage.setItem('mopar_outlaws_custom_cars', JSON.stringify(customCars));
        
        const lastSelectedId = localStorage.getItem('mopar_outlaws_selected_car_id');
        if (lastSelectedId === id) {
            if (customCars.length > 0) {
                this.selectCar(customCars[0].id, 'custom');
            } else {
                localStorage.removeItem('mopar_outlaws_selected_car_id');
                this.currentPreset = '';
                this.uploadedImage = null;
                this.drawPlaceholderCar();
                
                const startBtn = document.getElementById('start-btn');
                if (startBtn) {
                    startBtn.disabled = true;
                    const subtext = startBtn.querySelector('.btn-subtext');
                    if (subtext) subtext.textContent = 'Upload a car image above to start';
                }
            }
        }
        
        this.renderGallery();
    },
    
    selectCar(id, type) {
        const cards = document.querySelectorAll('.car-card');
        cards.forEach(c => c.classList.remove('selected'));
        
        const selectedCard = document.getElementById('card_' + id);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
        
        const customCars = this.getCustomCars();
        const car = customCars.find(c => c.id === id);
        if (!car) return;
        
        this.currentPreset = 'custom';
        localStorage.setItem('mopar_outlaws_selected_car_id', id);
        
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.disabled = false;
            const subtext = startBtn.querySelector('.btn-subtext');
            if (subtext) subtext.textContent = 'Outrun the Police & Dodge roadblocks';
        }
        
        const carPresetSelect = document.getElementById('car-preset');
        if (carPresetSelect) {
            let customOption = carPresetSelect.querySelector('option[value="custom"]');
            if (!customOption) {
                customOption = document.createElement('option');
                customOption.value = 'custom';
                customOption.textContent = 'Custom Uploaded Car';
                carPresetSelect.appendChild(customOption);
            }
            carPresetSelect.value = 'custom';
        }
        
        const pixelSizeSelect = document.getElementById('pixel-size');
        if (pixelSizeSelect) {
            pixelSizeSelect.value = car.pixelDetail.toString();
            this.pixelDetail = car.pixelDetail;
        }
        
        this.primaryColor = car.primaryColor;
        
        const img = new Image();
        img.onload = () => {
            this.uploadedImage = img;
            const w = this.pixelDetail;
            const h = Math.round(w / 2);
            if (this.spriteCanvas) {
                this.spriteCanvas.width = w;
                this.spriteCanvas.height = h;
            }
            this.spriteCtx.clearRect(0, 0, w, h);
            this.spriteCtx.drawImage(img, 0, 0, w, h);
            this.updatePreview();
            
            if (window.Game) {
                window.Game.playerSpriteCanvas = this.spriteCanvas;
                window.Game.paintColor = this.primaryColor;
                if (typeof window.Game.updateHighScoreFromSelectedCar === 'function') {
                    window.Game.updateHighScoreFromSelectedCar();
                }
            }
        };
        img.src = car.spriteDataUrl;
    },
    
    renderGallery() {
        const grid = document.getElementById('car-gallery-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        const customCars = this.getCustomCars();
        if (customCars.length === 0) {
            grid.innerHTML = `<div class="garage-empty-msg">GARAGE IS EMPTY. UPLOAD A SIDE-VIEW PHOTO OF YOUR MOPAR CAR TO GET STARTED!</div>`;
            
            const startBtn = document.getElementById('start-btn');
            if (startBtn) {
                startBtn.disabled = true;
                const subtext = startBtn.querySelector('.btn-subtext');
                if (subtext) subtext.textContent = 'Upload a car image above to start';
            }
            this.drawPlaceholderCar();
            return;
        }
        
        const selectedId = localStorage.getItem('mopar_outlaws_selected_car_id');
        
        customCars.forEach(c => {
            const card = document.createElement('div');
            card.id = 'card_' + c.id;
            card.className = 'car-card';
            if (c.id === selectedId) {
                card.classList.add('selected');
            }
            
            const canvasWrapper = document.createElement('div');
            canvasWrapper.className = 'car-card-canvas-wrapper';
            const img = document.createElement('img');
            img.src = c.spriteDataUrl;
            img.style.width = '64px';
            img.style.height = '32px';
            img.style.imageRendering = 'pixelated';
            canvasWrapper.appendChild(img);
            
            const nameLabel = document.createElement('span');
            nameLabel.className = 'car-card-name';
            nameLabel.textContent = c.name;
            
            const scoreLabel = document.createElement('span');
            scoreLabel.className = 'car-card-score';
            scoreLabel.textContent = c.highScore ? `HI: ${c.highScore}` : 'HI: 0';
            
            const delBtn = document.createElement('button');
            delBtn.className = 'car-card-delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete Car';
            delBtn.addEventListener('click', (e) => this.deleteCustomCar(c.id, e));
            
            card.appendChild(delBtn);
            card.appendChild(canvasWrapper);
            card.appendChild(nameLabel);
            card.appendChild(scoreLabel);
            
            card.addEventListener('click', () => this.selectCar(c.id, 'custom'));
            grid.appendChild(card);
        });
    }
};

// Bind to window object so other scripts (like game.js) can read the state
window.Pixelator = Pixelator;

// Initialize after script load
window.addEventListener('DOMContentLoaded', () => {
    Pixelator.init();
});
