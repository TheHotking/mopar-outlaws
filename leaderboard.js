/* ==========================================================================
   MOPAR RETRO CRUISER - LEADERBOARD MODULE
   ========================================================================== */

const Leaderboard = {
    storageKey: 'mopar_outlaws_highscores',
    
    defaultScores: [],

    init() {
        // Build listeners
        const viewBtn = document.getElementById('view-leaderboard-btn');
        const closeBtn = document.getElementById('close-leaderboard-btn');
        const modal = document.getElementById('leaderboard-modal');
        const resetBtn = document.getElementById('reset-scores-btn');

        if (viewBtn && modal) {
            viewBtn.addEventListener('click', () => {
                this.populateTables();
                modal.classList.add('active');
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
            // Close if clicking overlay
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all high scores?')) {
                    this.clearScores();
                    this.populateTables();
                }
            });
        }

        // Initialize store if empty
        if (!localStorage.getItem(this.storageKey)) {
            this.setScores(this.defaultScores);
        }

        // Render initial UI lists
        this.populateTables();
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
    submitScore(driverName, carPresetName, level, score) {
        let scores = this.getScores();
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

        // Check if driver name already exists
        const existingIdx = scores.findIndex(s => s.name === cleanedName);
        
        let newRecord = false;
        
        if (existingIdx !== -1) {
            // Only update score if it's higher than previous
            if (score > scores[existingIdx].score) {
                scores[existingIdx].score = score;
                scores[existingIdx].level = Math.max(scores[existingIdx].level, level);
                scores[existingIdx].car = carName;
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
        this.setScores(scores);
        
        // Refresh UIs
        this.populateTables();
        
        return newRecord;
    },

    clearScores() {
        localStorage.removeItem(this.storageKey);
        this.setScores(this.defaultScores);
    },

    populateTables() {
        const scores = this.getScores();
        
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
