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
            const parsed = JSON.parse(decoded);
            if (parsed && parsed.scores && Array.isArray(parsed.scores)) {
                return parsed.scores;
            } else if (parsed && Array.isArray(parsed)) {
                return parsed;
            }
            return [];
        } catch (e) {
            console.error("Error fetching global scores:", e);
            return null;
        }
    },
    
    async saveGlobalScores(scores) {
        try {
            const payload = { scores: scores };
            const json = JSON.stringify(payload);
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

        const triggerHighScoreUpdate = () => {
            if (window.Game && typeof window.Game.updateHighScoreFromGlobal === 'function') {
                window.Game.updateHighScoreFromGlobal();
            }
        };

        if (viewBtn && modal) {
            const openModal = async (e) => {
                if (e) e.preventDefault();
                this.populateTables();
                modal.classList.add('active');
                
                // Fetch latest global scores when opening
                const globalScores = await DB.getGlobalScores();
                if (globalScores && globalScores.length > 0) {
                    this.setScores(globalScores);
                    this.populateTables(globalScores);
                    triggerHighScoreUpdate();
                }
            };
            viewBtn.addEventListener('click', openModal);
            viewBtn.addEventListener('touchstart', openModal, { passive: false });
        }

        if (closeBtn && modal) {
            const closeModal = (e) => {
                if (e) e.preventDefault();
                modal.classList.remove('active');
            };
            closeBtn.addEventListener('click', closeModal);
            closeBtn.addEventListener('touchstart', closeModal, { passive: false });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
            modal.addEventListener('touchstart', (e) => {
                if (e.target === modal) {
                    e.preventDefault();
                    modal.classList.remove('active');
                }
            }, { passive: false });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to reset all high scores?')) {
                    this.clearScores();
                    this.populateTables();
                    await DB.saveGlobalScores(this.defaultScores);
                    triggerHighScoreUpdate();
                }
            });
        }

        // Initialize store if empty
        if (!localStorage.getItem(this.storageKey)) {
            this.setScores(this.defaultScores);
        }

        // Render initial UI lists immediately from local storage
        this.populateTables();
        
        // Auto-open leaderboard modal on page load
        if (modal) {
            modal.classList.add('active');
        }

        // Load global scores immediately on page load
        try {
            const globalScores = await DB.getGlobalScores();
            if (globalScores && globalScores.length > 0) {
                this.setScores(globalScores);
                this.populateTables(globalScores);
                triggerHighScoreUpdate();
            }
        } catch (e) {
            console.warn("Could not sync global leaderboard on load:", e);
        }
        
        // Auto-refresh global leaderboard every 30 seconds
        setInterval(async () => {
            try {
                const globalScores = await DB.getGlobalScores();
                if (globalScores && globalScores.length > 0) {
                    this.setScores(globalScores);
                    this.populateTables(globalScores);
                    triggerHighScoreUpdate();
                }
            } catch (e) { /* silent fail on auto-refresh */ }
        }, 30000);
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
        if (window.Game && typeof window.Game.updateHighScoreFromGlobal === 'function') {
            window.Game.updateHighScoreFromGlobal();
        }
        
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
                        <td class="driver-col">${item.name || 'HEMI_DEMON'}</td>
                        <td class="car-col">${item.car || 'Charger Daytona'}</td>
                        <td class="level-col">${item.level !== undefined ? item.level : 1}</td>
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

window.Leaderboard = Leaderboard;

// Auto run on load
window.addEventListener('DOMContentLoaded', () => {
    Leaderboard.init();
});
