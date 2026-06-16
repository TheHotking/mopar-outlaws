/* ==========================================================================
   MOPAR RETRO CRUISER - LEADERBOARD MODULE
   ========================================================================== */

const DB = {
    appKey: 'ikcamxt8',
    key: 'leaderboard',
    
    base64UrlEncode(str) {
        const bytes = new TextEncoder().encode(str);
        const binString = String.fromCodePoint(...bytes);
        const base64 = btoa(binString);
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    },
    
    base64UrlDecode(base64url) {
        let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        const binString = atob(base64);
        const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
        return new TextDecoder().decode(bytes);
    },
    
    async getGlobalScores() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout
            
            const response = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/${this.appKey}/${this.key}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) return null;
            const text = await response.text();
            if (!text || text.includes("null") || text.includes("Error")) return [];
            
            const decoded = this.base64UrlDecode(text.trim().replace(/^"|"$/g, ''));
            return JSON.parse(decoded);
        } catch (e) {
            console.error("Error fetching global scores:", e);
            return null;
        }
    },
    
    async saveGlobalScores(scores) {
        try {
            const json = JSON.stringify(scores);
            const encoded = this.base64UrlEncode(json);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            
            const response = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${this.appKey}/${this.key}/${encoded}`, {
                method: 'POST',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch (e) {
            console.error("Error saving global scores:", e);
            return false;
        }
    }
};

const Leaderboard = {
    storageKey: 'mopar_outlaws_highscores',
    
    defaultScores: [
        { name: 'HEMI_DEMON', car: 'Charger Daytona', level: 4, score: 550, isDefault: true },
        { name: 'CUDACRUISER', car: 'Plymouth Cuda', level: 3, score: 320, isDefault: true },
        { name: 'ROADRUNNER', car: 'Superbird', level: 2, score: 180, isDefault: true }
    ],

    async init() {
        // Build listeners
        const viewBtn = document.getElementById('view-leaderboard-btn');
        const closeBtn = document.getElementById('close-leaderboard-btn');
        const modal = document.getElementById('leaderboard-modal');
        const resetBtn = document.getElementById('reset-scores-btn');

        if (viewBtn && modal) {
            viewBtn.addEventListener('click', async () => {
                this.populateTables();
                modal.classList.add('active');
                
                // Fetch latest global scores when opening
                const globalScores = await DB.getGlobalScores();
                if (globalScores && globalScores.length > 0) {
                    this.setScores(globalScores);
                    this.populateTables(globalScores);
                }
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to reset all high scores?')) {
                    this.clearScores();
                    this.populateTables();
                    await DB.saveGlobalScores(this.defaultScores);
                }
            });
        }

        // Initialize store if empty
        if (!localStorage.getItem(this.storageKey)) {
            this.setScores(this.defaultScores);
        }

        // Render initial UI lists immediately from local storage
        this.populateTables();
        
        // Then load global scores in background
        try {
            const globalScores = await DB.getGlobalScores();
            if (globalScores && globalScores.length > 0) {
                this.setScores(globalScores);
                this.populateTables(globalScores);
            }
        } catch (e) {
            console.warn("Could not sync global leaderboard on load:", e);
        }
    },

    getScores() {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) return this.defaultScores;
        try {
            return JSON.parse(stored).sort((a, b) => b.score - a.score);
        } catch (e) {
            console.error('Error loading scores:', e);
            return this.defaultScores;
        }
    },

    setScores(scores) {
        localStorage.setItem(this.storageKey, JSON.stringify(scores));
    },

    // Save score. If name matches, only update if the new score is higher.
    async submitScore(driverName, carPresetName, level, score) {
        if (score <= 0) return false;
        
        const cleanedName = driverName.trim().toUpperCase() || 'HEMI_DEMON';
        
        let carName = 'Custom Car';
        // Check active car in garage
        if (window.Pixelator) {
            const customCars = window.Pixelator.getCustomCars();
            const lastSelectedId = localStorage.getItem('mopar_outlaws_selected_car_id');
            const activeCar = customCars.find(c => c.id === lastSelectedId);
            if (activeCar) {
                carName = activeCar.name;
                // Save custom car specific high score!
                if (score > (activeCar.highScore || 0)) {
                    activeCar.highScore = score;
                    localStorage.setItem('mopar_outlaws_custom_cars', JSON.stringify(customCars));
                    window.Pixelator.renderGallery();
                }
            }
        }

        // 1. Fetch latest global scores to sync with other players
        let scores = await DB.getGlobalScores();
        if (!scores || scores.length === 0) {
            scores = this.getScores();
        }

        // Remove default flags for the matched user if they are playing
        const existingIdx = scores.findIndex(s => s.name === cleanedName);
        let newRecord = false;
        
        if (existingIdx !== -1) {
            // Only update score if it's higher than previous
            if (score > scores[existingIdx].score) {
                scores[existingIdx].score = score;
                scores[existingIdx].level = Math.max(scores[existingIdx].level, level);
                scores[existingIdx].car = carName;
                scores[existingIdx].isDefault = false;
                newRecord = true;
            }
        } else {
            // New driver entry
            scores.push({
                name: cleanedName,
                car: carName,
                level: level,
                score: score,
                isDefault: false
            });
            newRecord = true;
        }

        // Sort and limit to top 15 records
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, 15);
        
        // 2. Save locally and globally
        this.setScores(scores);
        await DB.saveGlobalScores(scores);
        
        // Refresh UI
        this.populateTables(scores);
        
        return newRecord;
    },

    clearScores() {
        localStorage.removeItem(this.storageKey);
        this.setScores(this.defaultScores);
    },

    populateTables(scoresArray) {
        const scores = scoresArray || this.getScores();
        
        // 1. Populate Mini Table (Top 3 on Start Screen)
        const miniList = document.getElementById('mini-leaderboard-list');
        if (miniList) {
            miniList.innerHTML = '';
            if (scores.length === 0) {
                const li = document.createElement('li');
                li.style.justifyContent = 'center';
                li.style.color = 'var(--text-muted)';
                li.textContent = 'NO OUTLAW STANDINGS';
                miniList.appendChild(li);
            } else {
                // Display top 3
                scores.slice(0, 3).forEach((item, index) => {
                    const li = document.createElement('li');
                    if (index === 0) li.classList.add('top-rank');
                    
                    li.innerHTML = `
                        <span class="rank">#${index + 1}</span>
                        <span class="name">${item.name}</span>
                        <span class="score">${item.score} PTS</span>
                    `;
                    miniList.appendChild(li);
                });
            }
        }

        // 2. Populate Full Modal Table
        const rowsContainer = document.getElementById('leaderboard-rows');
        if (rowsContainer) {
            rowsContainer.innerHTML = '';
            if (scores.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px 8px;">
                        NO OUTLAW STANDINGS YET. ESCAPE THE LAW TO LOG YOUR STANDING!
                    </td>
                `;
                rowsContainer.appendChild(tr);
            } else {
                scores.forEach((item, index) => {
                    const tr = document.createElement('tr');
                    if (!item.isDefault) {
                        tr.classList.add('user-row');
                    }
                    
                    tr.innerHTML = `
                        <td class="rank-col">#${index + 1}</td>
                        <td class="driver-col">${item.name}</td>
                        <td class="car-col">${item.car}</td>
                        <td class="level-col">${item.level}</td>
                        <td class="score-col">${item.score}</td>
                    `;
                    rowsContainer.appendChild(tr);
                });
            }
        }
    },
    
    // Check if score breaks the top high score record
    isNewClubRecord(score) {
        const scores = this.getScores();
        if (scores.length === 0) return true;
        return score > scores[0].score;
    }
};

// Auto run on load
window.addEventListener('DOMContentLoaded', () => {
    Leaderboard.init();
});
