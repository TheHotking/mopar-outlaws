/* ==========================================================================
   MOPAR HIGHWAY SLALOM - GAME ENGINE
   ========================================================================== */

const Game = {
    // Virtual resolution for uniform physics
    V_WIDTH: 360,
    V_HEIGHT: 640,
    
    // Canvas components
    canvas: null,
    ctx: null,
    
    // Game loop state
    state: 'menu', // 'menu', 'countdown', 'playing', 'crashed', 'victory'
    animationFrameId: null,
    lastTime: 0,
    score: 0,
    highScore: 0,
    level: 1,
    isTransitioningLevel: false,
    gameSpeed: 4.5, // Base scrolling speed
    
    // Road/Lane layout specifications
    roadTop: 240,
    roadBottom: 580,
    roadHeight: 340, // 580 - 240
    numLanes: 3,
    
    // Player (Car) specs
    player: {
        x: 60,
        y: 392, // Starts in center lane
        width: 72,
        height: 36,
        currentLane: 1, // 0 = Top, 1 = Middle, 2 = Bottom
        angle: 0,
        targetY: 392,
        targetX: 60
    },
    
    // Police chaser specs
    police: {
        x: -90,
        y: 392,
        width: 72,
        height: 36,
        angle: 0,
        targetY: 392,
        lightTimer: 0,
        lightState: 0
    },
    
    // Game entities
    obstacles: [],
    particles: [],
    
    // Timers & configs
    obstacleSpawnTimer: 0,
    obstacleSpawnInterval: 1400, // ms between spawns
    
    // Pre-round countdown timer (ms)
    countdownTime: 3200, 
    
    // Round timer & finish line specs
    roundTime: 0,
    roundDuration: 75000, // 75 seconds per level (1 min 15 seconds)
    finishLineSpawned: false,
    victoryTimer: 0,
    
    // Parallax background scroll offsets
    skyScroll: 0,
    cityScroll: 0,
    highwayScroll: 0,
    
    // Blinking light state for construction barricades
    hazardBlinkTimer: 0,
    hazardBlinkOn: true,
    
    // Colors / Sprite references from Pixelator
    playerSpriteCanvas: null,
    paintColor: '#7b1fa2',

    // Mobile controls setup
    controlMode: 'tapping', // 'tapping' or 'sliding'
    touchStartY: 0,
    touchStartX: 0,
    isDragging: false,
    
    init() {
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        
        // Handle responsive canvas sizes
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // UI Action buttons
        const startBtn = document.getElementById('start-btn');
        const restartBtn = document.getElementById('restart-btn');
        const menuBtn = document.getElementById('menu-btn');
        
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startGame());
            startBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.startGame(); }, { passive: false });
        }
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.resetGame('playing'));
            restartBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.resetGame('playing'); }, { passive: false });
        }
        if (menuBtn) {
            menuBtn.addEventListener('click', () => this.resetGame('menu'));
            menuBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.resetGame('menu'); }, { passive: false });
        }
        
        // Control Mode Selector
        const controlModeSelect = document.getElementById('control-mode');
        if (controlModeSelect) {
            this.controlMode = localStorage.getItem('mopar_outlaws_control_mode') || 'tapping';
            controlModeSelect.value = this.controlMode;
            controlModeSelect.addEventListener('change', (e) => {
                this.controlMode = e.target.value;
                localStorage.setItem('mopar_outlaws_control_mode', this.controlMode);
            });
        }

        // Canvas touch/click and swipe controls
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            const getLaneTapFromEvent = (e) => {
                const touch = e.touches ? e.touches[0] : e;
                if (!touch) return null;
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.V_WIDTH / rect.width;
                const scaleY = this.V_HEIGHT / rect.height;
                const vx = (touch.clientX - rect.left) * scaleX;
                const vy = (touch.clientY - rect.top) * scaleY;
                if (vx > 80) return null; // not in button zone
                if (vy < this.V_HEIGHT / 3) return 0;
                if (vy < (this.V_HEIGHT * 2) / 3) return 1;
                return 2;
            };

            const getVirtualCoords = (clientX, clientY) => {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.V_WIDTH / rect.width;
                const scaleY = this.V_HEIGHT / rect.height;
                const vx = (clientX - rect.left) * scaleX;
                const vy = (clientY - rect.top) * scaleY;
                return { vx, vy };
            };

            const handleStart = (clientX, clientY) => {
                this.isDragging = true;
                handleMove(clientX, clientY);
            };

            const handleMove = (clientX, clientY) => {
                if (this.state !== 'playing' || !this.isDragging) return;
                
                if (this.controlMode === 'sliding') {
                    const { vx, vy } = getVirtualCoords(clientX, clientY);
                    
                    const minX = 10;
                    const maxX = this.V_WIDTH - this.player.width - 10;
                    const minY = this.roadTop;
                    const maxY = this.roadBottom - this.player.height;
                    
                    this.player.targetX = Math.max(minX, Math.min(maxX, vx - this.player.width / 2));
                    this.player.targetY = Math.max(minY, Math.min(maxY, vy - this.player.height / 2));
                }
            };

            const handleEnd = () => {
                this.isDragging = false;
            };

            canvasContainer.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                if (this.state === 'playing') {
                    if (this.controlMode === 'tapping') {
                        const lane = getLaneTapFromEvent(e);
                        if (lane !== null) {
                            e.preventDefault();
                            this.setLane(lane);
                            return;
                        }
                    } else if (this.controlMode === 'sliding') {
                        e.preventDefault();
                        handleStart(touch.clientX, touch.clientY);
                    }
                }
                this.handleTouchInput(e);
            }, { passive: false });

            canvasContainer.addEventListener('touchmove', (e) => {
                if (this.state === 'playing' && this.controlMode === 'sliding') {
                    e.preventDefault();
                    const touch = e.touches[0];
                    handleMove(touch.clientX, touch.clientY);
                }
            }, { passive: false });

            canvasContainer.addEventListener('touchend', (e) => {
                handleEnd();
            });

            canvasContainer.addEventListener('mousedown', (e) => {
                if (this.state === 'playing') {
                    if (this.controlMode === 'tapping') {
                        const lane = getLaneTapFromEvent(e);
                        if (lane !== null) {
                            e.preventDefault();
                            this.setLane(lane);
                            return;
                        }
                    } else if (this.controlMode === 'sliding') {
                        e.preventDefault();
                        handleStart(e.clientX, e.clientY);
                    }
                }
                this.handleTouchInput(e);
            });

            canvasContainer.addEventListener('mousemove', (e) => {
                if (e.buttons === 1 && this.state === 'playing' && this.controlMode === 'sliding') {
                    handleMove(e.clientX, e.clientY);
                }
            });

            canvasContainer.addEventListener('mouseup', () => {
                handleEnd();
            });

            canvasContainer.addEventListener('mouseleave', () => {
                handleEnd();
            });
        }

        // Fullscreen Toggle Button Listener
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            const toggleFS = (e) => {
                if (e) e.preventDefault();
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => {
                        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
                    });
                } else {
                    document.exitFullscreen();
                }
            };
            fullscreenBtn.addEventListener('click', toggleFS);
            fullscreenBtn.addEventListener('touchstart', toggleFS, { passive: false });
        }


        // Keyboard controls (Up/Down arrows, Spacebar)
        window.addEventListener('keydown', (e) => {
            if (this.state === 'playing') {
                if (e.code === 'ArrowUp') {
                    e.preventDefault();
                    this.changeLane(-1);
                } else if (e.code === 'ArrowDown') {
                    e.preventDefault();
                    this.changeLane(1);
                } else if (e.code === 'Space') {
                    e.preventDefault();
                    this.changeLane(1, true); 
                }
            } else if (this.state === 'crashed' || this.state === 'victory') {
                if (e.code === 'Space' || e.code === 'Enter') {
                    e.preventDefault();
                    if (this.state === 'crashed') this.resetGame('playing');
                }
            }
        });
        
        // Load high score from selected car
        this.updateHighScoreFromGlobal();
        
        // 3 Seconds Splash Screen Auto-Fade transition
        setTimeout(() => {
            const intro = document.getElementById('intro-screen');
            const menu = document.getElementById('menu-screen');
            if (intro && menu) {
                intro.style.transition = 'opacity 0.6s ease';
                intro.style.opacity = '0';
                setTimeout(() => {
                    intro.classList.remove('active');
                    menu.classList.add('active');
                    if (window.Pixelator && typeof window.Pixelator.renderGallery === 'function') {
                        window.Pixelator.renderGallery();
                    }
                }, 600);
            }
        }, 3000);
    },
    
    updateHighScoreFromGlobal() {
        let globalHighScore = 0;
        if (window.Leaderboard) {
            const scores = window.Leaderboard.getScores();
            if (scores && scores.length > 0) {
                globalHighScore = scores[0].score;
            }
        }
        
        let localCarHighScore = 0;
        if (window.Pixelator) {
            const customCars = window.Pixelator.getCustomCars();
            const lastSelectedId = localStorage.getItem('mopar_outlaws_selected_car_id');
            const activeCar = customCars.find(c => c.id === lastSelectedId);
            if (activeCar) {
                localCarHighScore = activeCar.highScore || 0;
            }
        }
        
        this.highScore = Math.max(globalHighScore, localCarHighScore);
        const hudHighScore = document.getElementById('hud-highscore-val');
        if (hudHighScore) hudHighScore.textContent = this.highScore;
    },
    
    
    
    addScore(amount) {
        this.score += amount;
        document.getElementById('hud-score-val').textContent = this.score;
        
        if (this.score > this.highScore) {
            this.highScore = this.score;
            const hudHighScore = document.getElementById('hud-highscore-val');
            if (hudHighScore) hudHighScore.textContent = this.highScore;
        }
    },
    
    resizeCanvas() {
        const isLandscape = window.innerWidth > window.innerHeight;
        
        if (isLandscape) {
            this.V_WIDTH = 640;
            this.V_HEIGHT = 360;
            this.roadTop = 150;
            this.roadBottom = 330;
            this.roadHeight = 180;
            this.player.width = 64;
            this.player.height = 32;
            this.police.width = 64;
            this.police.height = 32;
        } else {
            this.V_WIDTH = 360;
            this.V_HEIGHT = 640;
            this.roadTop = 240;
            this.roadBottom = 580;
            this.roadHeight = 340;
            this.player.width = 72;
            this.player.height = 36;
            this.police.width = 72;
            this.police.height = 36;
        }
        
        this.canvas.width = this.V_WIDTH;
        this.canvas.height = this.V_HEIGHT;
        
        // Update positions if initialized
        if (this.player) {
            this.player.targetY = this.getLaneCenterY(this.player.currentLane) - this.player.height / 2;
            if (this.state === 'menu' || this.state === 'countdown') {
                this.player.y = this.player.targetY;
                this.player.x = 60;
                this.player.targetX = 60;
            }
        }
        
        if (this.police) {
            this.police.targetY = this.player ? this.player.targetY : this.police.targetY;
            if (this.state === 'menu' || this.state === 'countdown') {
                this.police.y = this.police.targetY;
                this.police.x = -120;
            }
        }
        
        if (this.obstacles) {
            this.obstacles.forEach(obs => {
                if (obs.type !== 'startLine' && obs.type !== 'finishLine') {
                    obs.y = this.getLaneCenterY(obs.lane) - obs.height / 2;
                } else {
                    obs.y = this.roadTop;
                    obs.height = this.roadHeight;
                }
            });
        }
    },
    
    getLaneCenterY(laneIndex) {
        const laneWidth = this.roadHeight / this.numLanes;
        return this.roadTop + (laneIndex * laneWidth) + (laneWidth / 2);
    },
    
    changeLane(direction, wrap = false) {
        if (this.state !== 'playing') return;
        
        let nextLane = this.player.currentLane + direction;
        
        if (wrap) {
            if (nextLane >= this.numLanes) nextLane = 0;
            if (nextLane < 0) nextLane = this.numLanes - 1;
        } else {
            nextLane = Math.max(0, Math.min(this.numLanes - 1, nextLane));
        }
        
        this.setLane(nextLane);
    },
    
    setLane(laneIndex) {
        if (this.state !== 'playing') return;
        
        laneIndex = Math.max(0, Math.min(this.numLanes - 1, laneIndex));
        
        if (laneIndex !== this.player.currentLane) {
            this.player.currentLane = laneIndex;
            this.player.targetY = this.getLaneCenterY(laneIndex) - this.player.height / 2;
            this.createSkidParticles();
            
            // Play chiptune lane shift audio
            if (window.AudioEngine) {
                window.AudioEngine.playLaneShiftSound();
            }
            
            const hint = document.getElementById('tap-instruction');
            if (hint) hint.classList.add('fade-out');
        }
    },
    
    handleTouchInput(e) {
        // Tap canvas area to restart after a crash
        if (this.state === 'crashed') {
            const timeSinceCrash = performance.now() - this.crashTime;
            if (timeSinceCrash > 500) {
                this.resetGame('playing');
            }
        }
    },
    
    createSkidParticles() {
        const particleCount = 6;
        const wheelX = this.player.x + 8;
        const wheelY = this.player.y + this.player.height - 4;
        
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: wheelX,
                y: wheelY + (Math.random() * 4 - 2),
                vx: -this.gameSpeed * 0.5 - (Math.random() * 2),
                vy: (Math.random() * 2 - 1),
                size: Math.random() * 4 + 2,
                color: 'rgba(180, 180, 200, 0.4)',
                alpha: 0.8,
                decay: 0.04
            });
        }
    },
    
    createCrashParticles() {
        const particleCount = 45;
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: this.player.x + this.player.width / 2,
                y: this.player.y + this.player.height / 2,
                vx: (Math.random() * 10 - 5),
                vy: (Math.random() * 10 - 5),
                size: Math.random() * 10 + 4,
                color: i % 3 === 0 ? '#ff1744' : (i % 3 === 1 ? '#ffea00' : '#1e293b'),
                alpha: 1.0,
                decay: Math.random() * 0.03 + 0.01
            });
        }
    },
    
    spawnObstaclePattern() {
        // Stop spawning normal obstacles once the finish line is triggered
        if (this.finishLineSpawned) return;
        
        let doubleChance = 0;
        if (this.level === 1) {
            doubleChance = 0;
        } else if (this.level === 2) {
            doubleChance = 0.3;
        } else if (this.level === 3 || this.level === 4) {
            doubleChance = 0.5;
        } else { // Level 5+
            doubleChance = 1.0;
        }

        const isDouble = Math.random() < doubleChance;
        const singlePatterns = [[0], [1], [2]];
        const doublePatterns = [[0, 1], [1, 2], [0, 2]];
        
        const chosenPattern = isDouble 
            ? doublePatterns[Math.floor(Math.random() * doublePatterns.length)]
            : singlePatterns[Math.floor(Math.random() * singlePatterns.length)];
        const types = ['cone', 'barricade', 'pothole'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        chosenPattern.forEach(laneIdx => {
            const laneCenterY = this.getLaneCenterY(laneIdx);
            
            let w = 24;
            let h = 24;
            if (type === 'barricade') {
                w = 34;
                h = 28;
            } else if (type === 'pothole') {
                w = 36;
                h = 16;
            }
            
            this.obstacles.push({
                x: this.V_WIDTH + 40,
                y: laneCenterY - h / 2,
                width: w,
                height: h,
                lane: laneIdx,
                type: type,
                passed: false
            });
        });
    },
    
    spawnStartLine() {
        // Place checkered start line just ahead of the player at the start
        this.obstacles.push({
            x: 180,
            y: this.roadTop,
            width: 20,
            height: this.roadHeight,
            type: 'startLine',
            passed: true // Don't award points
        });
    },
    
    spawnFinishLine() {
        this.finishLineSpawned = true;
        this.obstacles.push({
            x: this.V_WIDTH + 60,
            y: this.roadTop,
            width: 20,
            height: this.roadHeight,
            type: 'finishLine',
            passed: false
        });
    },
    
    startGame() {
        const driverInput = document.getElementById('driver-name');
        const driverName = driverInput.value.trim().toUpperCase() || 'HEMI_DEMON';
        document.getElementById('hud-driver-name').textContent = driverName;
        
        document.getElementById('menu-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        
        this.playerSpriteCanvas = Pixelator.spriteCanvas;
        this.paintColor = Pixelator.primaryColor;
        
        this.updateHighScoreFromGlobal();
        this.resetGame('playing');
    },
    
    resetGame(targetState) {
        let isLevelTransition = false;
        if (this.isTransitioningLevel) {
            isLevelTransition = true;
            this.isTransitioningLevel = false;
        }

        // If starting, transition to countdown first
        if (targetState === 'playing') {
            this.state = 'countdown';
            this.countdownTime = 3200;
        } else {
            this.state = targetState;
        }
        
        if (targetState === 'menu') {
            this.score = 0;
            this.level = 1;
        } else if (targetState === 'playing') {
            if (!isLevelTransition) {
                this.score = 0;
                this.level = 1;
            }
        }
        
        // Progressive scaling variables based on level
        if (this.level < 5) {
            this.gameSpeed = 4.5 + (this.level - 1) * 0.35;
            this.obstacleSpawnInterval = 1400 - (this.level - 1) * 50;
        } else {
            this.gameSpeed = 5.9 + (this.level - 5) * 0.7;
            this.obstacleSpawnInterval = 1200 - (this.level - 5) * 100;
        }
        this.gameSpeed = Math.min(this.gameSpeed, 8.5);
        this.obstacleSpawnInterval = Math.max(this.obstacleSpawnInterval, 850);
        this.roundDuration = Math.min(30000 + (this.level - 1) * 5000, 50000);
        
        this.roundTime = 0;
        this.finishLineSpawned = false;
        this.victoryTimer = 0;
        
        this.player.currentLane = 1; // Start in middle lane
        this.player.targetY = this.getLaneCenterY(1) - this.player.height / 2;
        this.player.y = this.player.targetY;
        this.player.x = 60; // reset horizontal position
        this.player.targetX = 60;
        this.player.angle = 0;
        
        // Reset Police Cruiser
        this.police.x = -120;
        this.police.y = this.getLaneCenterY(1) - this.police.height / 2;
        this.police.targetY = this.police.y;
        this.police.angle = 0;
        this.police.lightTimer = 0;
        this.police.lightState = 0;
        
        this.obstacles = [];
        this.particles = [];
        this.obstacleSpawnTimer = 0;
        this.hazardBlinkTimer = 0;
        this.hazardBlinkOn = true;
        
        // Load high score from selected custom car (universal top score)
        this.updateHighScoreFromGlobal();
        
        // Audio synthesis control
        if (window.AudioEngine) {
            if (this.state === 'countdown' || targetState === 'playing') {
                window.AudioEngine.setupContext();
                window.AudioEngine.resumeEngineSound();
                window.AudioEngine.startMusic(this.level);
                window.AudioEngine.startSirenSound();
            } else if (targetState === 'menu') {
                window.AudioEngine.stopEngineSound();
                window.AudioEngine.stopSirenSound();
                window.AudioEngine.startMusic(1);
            }
        }
        
        // Spawn Start Line Checkers immediately for the takeoff
        if (this.state === 'countdown') {
            this.spawnStartLine();
        }
        
        // Reset HUD
        document.getElementById('hud-score-val').textContent = this.score;
        document.getElementById('hud-level-val').textContent = this.level;
        document.getElementById('hud-speed-val').textContent = `${Math.round(60 + this.gameSpeed * 10)} MPH`;
        

        // Reset Progress Bar
        const progFill = document.getElementById('race-progress-fill');
        const progMark = document.getElementById('race-progress-marker');
        if (progFill) progFill.style.width = '0%';
        if (progMark) progMark.style.left = '0%';
        
        document.getElementById('level-up-banner').classList.remove('visible');
        document.getElementById('new-record-badge').classList.add('hidden');
        
        const hint = document.getElementById('tap-instruction');
        if (hint) hint.classList.remove('fade-out');
        
        if (targetState === 'menu') {
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('game-over-screen').classList.remove('active');
            document.getElementById('menu-screen').classList.add('active');
            
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        } else {
            document.getElementById('game-over-screen').classList.remove('active');
            
            this.lastTime = performance.now();
            if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = requestAnimationFrame((timestamp) => this.loop(timestamp));
        }
    },
    
    async crash() {
        this.state = 'crashed';
        this.crashTime = performance.now();
        this.createCrashParticles();
        
        // Play chiptune crash audio
        if (window.AudioEngine) {
            window.AudioEngine.playCrashSound();
        }
        
        const driverName = document.getElementById('hud-driver-name').textContent;
        const carPreset = document.getElementById('car-preset').value;
        const isRecord = await Leaderboard.submitScore(driverName, carPreset, this.level, this.score);
        
        setTimeout(() => {
            document.getElementById('go-score-val').textContent = this.score;
            document.getElementById('go-level-val').textContent = this.level;
            
            const recordBadge = document.getElementById('new-record-badge');
            if (isRecord && this.score > 0) {
                recordBadge.classList.remove('hidden');
            } else {
                recordBadge.classList.add('hidden');
            }
            
            if (this.score > this.highScore) {
                this.highScore = this.score;
                document.getElementById('hud-highscore-val').textContent = this.highScore;
            }
            
            document.getElementById('game-over-screen').classList.add('active');
        }, 800);
    },
    
    victory() {
        this.state = 'victory';
        this.victoryTime = performance.now();
        
        // Play chiptune victory audio
        if (window.AudioEngine) {
            window.AudioEngine.playVictorySound();
            window.AudioEngine.stopSirenSound();
        }
        
        // Award finish line bonus points!
        const bonus = 200;
        this.addScore(bonus);
        
        // Trigger screen announcement
        const banner = document.getElementById('level-up-banner');
        document.getElementById('level-up-subtitle').textContent = `Round clear! +${bonus} PTS bonus!`;
        banner.classList.add('visible');
    },
    
    nextLevel() {
        this.level++;
        this.isTransitioningLevel = true;
        document.getElementById('level-up-banner').classList.remove('visible');
        
        // Start next level with countdown
        this.resetGame('playing');
    },
    
    loop(timestamp) {
        if (this.state === 'menu') return;
        
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        this.update(dt);
        this.draw();
        
        // Update engine pitch
        if (window.AudioEngine && this.state === 'playing') {
            window.AudioEngine.updateEnginePitch(this.gameSpeed);
        }
        
        this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
    },
    
    update(dt) {
        const isCountdown = (this.state === 'countdown');
        // During countdown, scroll background slowly
        const currentScrollSpeed = isCountdown ? this.gameSpeed * 0.2 : this.gameSpeed;
        
        // 1. Scroll backgrounds
        if (this.state === 'playing' || isCountdown || this.state === 'victory') {
            this.skyScroll = (this.skyScroll + currentScrollSpeed * 0.04) % this.V_WIDTH;
            this.cityScroll = (this.cityScroll + currentScrollSpeed * 0.12) % 390;
            this.highwayScroll = (this.highwayScroll + currentScrollSpeed * 1.0) % this.V_WIDTH;
            
            // Blinking timer
            this.hazardBlinkTimer += dt;
            if (this.hazardBlinkTimer >= 250) {
                this.hazardBlinkOn = !this.hazardBlinkOn;
                this.hazardBlinkTimer = 0;
            }
        }
        
        // 2. Countdown logic
        if (isCountdown) {
            this.countdownTime -= dt;
            if (this.countdownTime <= 0) {
                this.state = 'playing';
            }
        }
        
        // 3. Victory state logic: car drives off screen
        if (this.state === 'victory') {
            this.player.x += 5; // drive off to the right
            this.player.angle = 0;
            
            // Wait 3 seconds then go to next level
            const elapsed = performance.now() - this.victoryTime;
            if (elapsed > 3000) {
                this.nextLevel();
                return;
            }
        }
        
        // 4. Smoothly glide car coordinates (Y and X for 2D sliding)
        if (this.state === 'playing' || isCountdown || this.state === 'crashed' || this.state === 'victory') {
            const dy = this.player.targetY - this.player.y;
            const targetX = this.controlMode === 'sliding' ? (this.player.targetX ?? 60) : 60;
            const dx = targetX - this.player.x;
            
            if (this.state === 'playing' || isCountdown) {
                this.player.y += dy * 0.18;
                this.player.x += dx * 0.18;
                this.player.angle = dy * 0.04 * (Math.PI / 180);
                
                // Tail smoke particles
                if (Math.random() < (isCountdown ? 0.05 : 0.15)) {
                    this.particles.push({
                        x: this.player.x - 4,
                        y: this.player.y + this.player.height / 2 + (Math.random() * 4 - 2),
                        vx: -currentScrollSpeed * 0.6,
                        vy: (Math.random() * 0.8 - 0.4),
                        size: Math.random() * 3 + 1,
                        color: 'rgba(255, 255, 255, 0.15)',
                        alpha: 0.7,
                        decay: 0.03
                    });
                }
            } else if (this.state === 'crashed') {
                this.player.angle += 0.25;
                this.player.x -= this.gameSpeed * 0.4;
            }
        }
        
        // Police cruiser chase updates
        if (this.state === 'playing' || isCountdown) {
            // Flashing lights state timer
            this.police.lightTimer += dt;
            if (this.police.lightTimer >= 100) {
                this.police.lightState = (this.police.lightState + 1) % 2;
                this.police.lightTimer = 0;
            }
            
            // Follow player's lane movements
            this.police.targetY = this.player.targetY;
            this.police.y += (this.police.targetY - this.police.y) * 0.08;
            this.police.angle = (this.police.targetY - this.police.y) * 0.03 * (Math.PI / 180);
            
            // Slowly creep onto the screen to tail the player
            const targetPoliceX = -15; // partially visible on the left edge
            this.police.x += (targetPoliceX - this.police.x) * 0.05;
            
            // Sirens tail smoke / dust particles
            if (Math.random() < 0.1) {
                this.particles.push({
                    x: this.police.x + 8,
                    y: this.police.y + this.police.height - 4,
                    vx: -currentScrollSpeed * 0.6,
                    vy: (Math.random() * 0.8 - 0.4),
                    size: Math.random() * 3 + 1,
                    color: 'rgba(255, 255, 255, 0.1)',
                    alpha: 0.5,
                    decay: 0.03
                });
            }
        } else if (this.state === 'crashed') {
            // Pull up behind Busted player
            this.police.lightTimer += dt;
            if (this.police.lightTimer >= 100) {
                this.police.lightState = (this.police.lightState + 1) % 2;
                this.police.lightTimer = 0;
            }
            
            this.police.targetY = this.player.y;
            this.police.y += (this.police.targetY - this.police.y) * 0.1;
            this.police.x += (this.player.x - 70 - this.police.x) * 0.08;
            this.police.angle = 0;
        } else if (this.state === 'victory') {
            // Police car falls behind as outlaw escapes
            this.police.x -= this.gameSpeed * 0.5;
        }
        
        // 5. Update round progress and obstacles
        if (this.state === 'playing') {
            this.roundTime += dt;
            
            // Calculate progress percentage
            const progressPercent = Math.min(100, (this.roundTime / this.roundDuration) * 100);
            const progFill = document.getElementById('race-progress-fill');
            const progMark = document.getElementById('race-progress-marker');
            if (progFill) progFill.style.width = progressPercent + '%';
            if (progMark) progMark.style.left = progressPercent + '%';
            
            // Check if time is up, trigger finish line
            if (this.roundTime >= this.roundDuration && !this.finishLineSpawned) {
                this.spawnFinishLine();
            }
            
            // Hazard spawner
            this.obstacleSpawnTimer += dt;
            if (this.obstacleSpawnTimer >= this.obstacleSpawnInterval) {
                this.spawnObstaclePattern();
                this.obstacleSpawnTimer = 0;
            }
        }
        
        // Move obstacles
        if (this.state === 'playing' || isCountdown || this.state === 'victory') {
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obs = this.obstacles[i];
                obs.x -= currentScrollSpeed;
                
                // Point scoring for dodging cones
                if (this.state === 'playing' && !obs.passed && obs.x + obs.width < this.player.x) {
                    obs.passed = true;
                    
                    if (obs.type === 'finishLine') {
                        this.victory();
                        continue;
                    }
                    
                    // Award points for regular dodged obstacles
                    if (obs.type !== 'startLine') {
                        const matchesX = this.obstacles.filter(o => Math.abs(o.x - obs.x) < 5);
                        const firstUnpassed = matchesX.find(o => !o.passed);
                        
                        if (!firstUnpassed) {
                            this.addScore(10);
                        }
                    }
                }
                
                // Collision checks: skip checkered lines
                if (obs.type === 'startLine' || obs.type === 'finishLine') {
                    // Remove offscreen checkered lines
                    if (obs.x + obs.width < -30) {
                        this.obstacles.splice(i, 1);
                    }
                    continue;
                }
                
                // Bounding boxes check
                const carBox = {
                    left: this.player.x + 6,
                    right: this.player.x + this.player.width - 6,
                    top: this.player.y + 4,
                    bottom: this.player.y + this.player.height - 4
                };
                
                const obsBox = {
                    left: obs.x + 3,
                    right: obs.x + obs.width - 3,
                    top: obs.y + 2,
                    bottom: obs.y + obs.height - 2
                };
                
                if (obs.type === 'pothole') {
                    obsBox.top = obs.y + 4;
                    obsBox.bottom = obs.y + obs.height - 4;
                }
                
                const collides = (
                    carBox.left < obsBox.right &&
                    carBox.right > obsBox.left &&
                    carBox.top < obsBox.bottom &&
                    carBox.bottom > obsBox.top
                );
                
                if (collides && this.state === 'playing') {
                    let cause = "You clipped a traffic cone!";
                    if (obs.type === 'barricade') {
                        cause = "You slammed into a construction barricade!";
                    } else if (obs.type === 'pothole') {
                        cause = "You hit a major pothole and blew a tire!";
                    }
                    document.getElementById('crash-cause-text').textContent = cause;
                    this.crash();
                }
                
                // Clear offscreen obstacles
                if (obs.x + obs.width < -20) {
                    this.obstacles.splice(i, 1);
                }
            }
        }
        
        // 6. Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;
            
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }
        
        // 7. Level Up banner timeout check
        if (this.levelUpTimer > 0) {
            this.levelUpTimer -= dt;
            if (this.levelUpTimer <= 0) {
                document.getElementById('level-up-banner').classList.remove('visible');
            }
        }
    },
    
    // Core drawing logic
    draw() {
        this.ctx.clearRect(0, 0, this.V_WIDTH, this.V_HEIGHT);
        
        // 1. Draw Parallax Background (Sky and City)
        this.drawParallaxBackground();
        
        // 2. Draw Highway asphalt, lanes, dividers
        this.drawHighway();
        
        // 3. Draw Checkered lines and Obstacles
        this.drawObstacles();
        
        // 4. Draw Particles
        this.drawParticles();
        
        // 4.5 Draw Police Cruiser Chaser
        this.drawPolice();
        
        // 5. Draw Player Car
        this.drawPlayer();
        // 6. Draw Countdown overlay text
        if (this.state === 'countdown') {
            this.drawCountdownOverlay();
        }
        
        // 7. Draw lane control buttons on top of everything (always visible)
        if (this.state === 'playing' || this.state === 'countdown') {
            this.drawLaneButtons();
        }
    },

    drawLaneButtons() {
        if (this.controlMode !== 'tapping') return;
        const ctx = this.ctx;
        const W = this.V_WIDTH;
        const H = this.V_HEIGHT;
        const btnW = 68;
        const third = H / 3;

        const buttons = [
            { y: 0,         h: third,  lane: 0, arrow: 'UP',  color: '#ff5722', glow: 'rgba(255,87,34,0.6)' },
            { y: third,     h: third,  lane: 1, arrow: 'MID', color: '#39ff14', glow: 'rgba(57,255,20,0.6)'  },
            { y: third * 2, h: third,  lane: 2, arrow: 'DN',  color: '#ff5722', glow: 'rgba(255,87,34,0.6)' },
        ];

        buttons.forEach(btn => {
            const isActive = this.player.currentLane === btn.lane;
            const bx = 5;
            const by = btn.y + 10;
            const bw = btnW - 10;
            const bh = btn.h - 20;
            const cx = bx + bw / 2;
            const cy = by + bh / 2;

            // Button background
            ctx.save();
            ctx.globalAlpha = isActive ? 0.72 : 0.52;
            const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
            grad.addColorStop(0, btn.lane === 1 ? 'rgba(20,60,20,0.9)' : 'rgba(40,15,10,0.9)');
            grad.addColorStop(1, btn.lane === 1 ? 'rgba(10,30,10,0.6)' : 'rgba(20,8,5,0.6)');
            ctx.fillStyle = grad;
            ctx.strokeStyle = isActive ? btn.color : (btn.lane === 1 ? 'rgba(57,255,20,0.7)' : 'rgba(255,87,34,0.7)');
            ctx.lineWidth = isActive ? 2.5 : 1.5;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(bx, by, bw, bh, 10);
            } else {
                ctx.rect(bx, by, bw, bh);
            }
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // Glow on active
            if (isActive) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.shadowColor = btn.color;
                ctx.shadowBlur = 20;
                ctx.strokeStyle = btn.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 10);
                else ctx.rect(bx, by, bw, bh);
                ctx.stroke();
                ctx.restore();
            }

            // Arrow icon
            ctx.save();
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = isActive ? btn.color : '#ffffff';
            ctx.font = `bold ${Math.round(bh * 0.32)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const arrowChar = btn.lane === 0 ? '▲' : btn.lane === 2 ? '▼' : '◀';
            ctx.fillText(arrowChar, cx, cy - bh * 0.12);

            // Label
            ctx.font = `bold ${Math.round(bh * 0.18)}px Arial`;
            ctx.fillStyle = isActive ? btn.color : 'rgba(220,200,180,0.9)';
            ctx.fillText(btn.arrow, cx, cy + bh * 0.28);
            ctx.restore();
        });
    },

    
    drawParallaxBackground() {
        // Sky Layer (Synthwave Purple Grid Sky)
        this.ctx.fillStyle = '#090515';
        this.ctx.fillRect(0, 0, this.V_WIDTH, this.V_HEIGHT);
        
        // Radial Sunset Glow
        const gradient = this.ctx.createRadialGradient(
            this.V_WIDTH / 2, 160, 5,
            this.V_WIDTH / 2, 160, 150
        );
        gradient.addColorStop(0, '#f43f5e'); // Sunset red
        gradient.addColorStop(0.4, '#701a75'); // Magenta
        gradient.addColorStop(1, '#090515');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.V_WIDTH, this.roadTop);
        
        // Draw grid lines in sky
        this.ctx.strokeStyle = 'rgba(236, 72, 153, 0.08)';
        this.ctx.lineWidth = 1;
        const gridGap = 20;
        for (let i = 0; i < this.V_WIDTH; i += gridGap) {
            this.ctx.beginPath();
            this.ctx.moveTo(i, 0);
            this.ctx.lineTo(i, this.roadTop);
            this.ctx.stroke();
        }
        
        // Distant City Skyline Silhouettes
        this.ctx.fillStyle = '#0f0b21';
        const skylineHeight = [35, 65, 45, 90, 60, 75, 50, 105, 70, 85, 45, 60, 75];
        const buildingWidth = 30;
        const totalSkylineWidth = skylineHeight.length * buildingWidth; // 390
        
        const neededTiles = Math.ceil(this.V_WIDTH / totalSkylineWidth) + 1;
        
        for (let tile = 0; tile < neededTiles; tile++) {
            let offset = -this.cityScroll + (tile * totalSkylineWidth);
            skylineHeight.forEach((height, i) => {
                const x = offset + (i * buildingWidth);
                const y = this.roadTop - height;
                this.ctx.fillRect(x, y, buildingWidth, height);
                // Draw yellow retro pixel windows
                if (i % 3 === 0) {
                    this.ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
                    this.ctx.fillRect(x + 6, y + 15, 2, 2);
                    this.ctx.fillRect(x + 16, y + 30, 2, 2);
                    this.ctx.fillRect(x + 6, y + 45, 2, 2);
                    this.ctx.fillStyle = '#0f0b21';
                }
            });
        }
    },
    
    drawHighway() {
        this.ctx.fillStyle = '#141122';
        this.ctx.fillRect(0, this.roadTop, this.V_WIDTH, this.roadHeight);
        
        // Neon Pink shoulder linings
        this.ctx.fillStyle = '#ff1493';
        this.ctx.fillRect(0, this.roadTop - 3, this.V_WIDTH, 3);
        this.ctx.fillRect(0, this.roadBottom, this.V_WIDTH, 3);
        
        // Neon green shoulder glows
        this.ctx.fillStyle = '#39ff14';
        this.ctx.fillRect(0, this.roadTop - 1, this.V_WIDTH, 1);
        this.ctx.fillRect(0, this.roadBottom + 2, this.V_WIDTH, 1);
        
        // Lane dividers
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        const laneWidth = this.roadHeight / this.numLanes;
        
        const dashWidth = 24;
        const dashGap = 28;
        const totalDash = dashWidth + dashGap;
        
        for (let laneDiv = 1; laneDiv < this.numLanes; laneDiv++) {
            const divY = this.roadTop + (laneDiv * laneWidth) - 1;
            
            for (let x = -totalDash; x < this.V_WIDTH + totalDash; x += totalDash) {
                this.ctx.fillRect(x - this.highwayScroll, divY, dashWidth, 2);
            }
        }
        
        // Foreground shoulder
        this.ctx.fillStyle = '#07050f';
        this.ctx.fillRect(0, this.roadBottom + 3, this.V_WIDTH, this.V_HEIGHT - this.roadBottom - 3);
    },
    
    drawObstacles() {
        this.obstacles.forEach(obs => {
            const ctx = this.ctx;
            
            // --- CHECKERED START/FINISH LINES ---
            if (obs.type === 'startLine' || obs.type === 'finishLine') {
                const squareSize = 10;
                ctx.save();
                
                // Draw checkered pattern of black and white alternating squares
                for (let y = this.roadTop; y < this.roadBottom; y += squareSize) {
                    for (let xOffset = 0; xOffset < obs.width; xOffset += squareSize) {
                        const tileCol = (Math.floor(xOffset / squareSize) + Math.floor(y / squareSize)) % 2;
                        ctx.fillStyle = tileCol === 0 ? '#ffffff' : '#111111';
                        ctx.fillRect(obs.x + xOffset, y, squareSize, squareSize);
                    }
                }
                
                // Draw vertical side banners to outline checkers
                ctx.fillStyle = obs.type === 'startLine' ? '#39ff14' : '#ff1493'; // Green start, Pink finish
                ctx.fillRect(obs.x - 3, this.roadTop, 3, this.roadHeight);
                ctx.fillRect(obs.x + obs.width, this.roadTop, 3, this.roadHeight);
                
                // Label overlays drawn on road shoulders
                ctx.font = "bold 8px 'Press Start 2P', monospace";
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(obs.type === 'startLine' ? "START" : "FINISH", obs.x + obs.width / 2, this.roadTop - 8);
                ctx.fillText(obs.type === 'startLine' ? "START" : "FINISH", obs.x + obs.width / 2, this.roadBottom + 12);
                
                ctx.restore();
                return;
            }
            
            // --- REGULAR LANE HAZARDS ---
            if (obs.type === 'cone') {
                ctx.fillStyle = '#111';
                ctx.fillRect(obs.x, obs.y + obs.height - 3, obs.width, 3);
                
                ctx.fillStyle = '#ff6d00';
                ctx.beginPath();
                ctx.moveTo(obs.x + obs.width / 2, obs.y);
                ctx.lineTo(obs.x + obs.width - 2, obs.y + obs.height - 3);
                ctx.lineTo(obs.x + 2, obs.y + obs.height - 3);
                ctx.closePath();
                ctx.fill();
                
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(obs.x + obs.width / 2 - 3, obs.y + 8);
                ctx.lineTo(obs.x + obs.width / 2 + 3, obs.y + 8);
                ctx.lineTo(obs.x + obs.width / 2 + 5, obs.y + 14);
                ctx.lineTo(obs.x + obs.width / 2 - 5, obs.y + 14);
                ctx.closePath();
                ctx.fill();
                
                ctx.fillStyle = '#ff6d00';
                ctx.beginPath();
                ctx.moveTo(obs.x + obs.width / 2, obs.y);
                ctx.lineTo(obs.x + obs.width / 2 + 2, obs.y + 4);
                ctx.lineTo(obs.x + obs.width / 2 - 2, obs.y + 4);
                ctx.closePath();
                ctx.fill();
                
            } else if (obs.type === 'barricade') {
                ctx.fillStyle = '#4b5563';
                ctx.fillRect(obs.x + 6, obs.y + 8, 3, obs.height - 8);
                ctx.fillRect(obs.x + obs.width - 9, obs.y + 8, 3, obs.height - 8);
                
                ctx.fillStyle = '#fbbf24';
                ctx.fillRect(obs.x, obs.y + 6, obs.width, 10);
                
                ctx.fillStyle = '#111827';
                for (let offset = 2; offset < obs.width; offset += 10) {
                    ctx.beginPath();
                    ctx.moveTo(obs.x + offset, obs.y + 6);
                    ctx.lineTo(obs.x + offset + 5, obs.y + 16);
                    ctx.lineTo(obs.x + offset + 2, obs.y + 16);
                    ctx.lineTo(obs.x + offset - 3, obs.y + 6);
                    ctx.fill();
                }
                
                ctx.fillStyle = '#222';
                ctx.fillRect(obs.x + obs.width / 2 - 4, obs.y, 8, 6);
                
                if (this.hazardBlinkOn) {
                    ctx.fillStyle = '#ffea00';
                    ctx.shadowColor = '#ffea00';
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(obs.x + obs.width / 2, obs.y + 1, 3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                } else {
                    ctx.fillStyle = '#b45309';
                    ctx.beginPath();
                    ctx.arc(obs.x + obs.width / 2, obs.y + 1, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                
            } else if (obs.type === 'pothole') {
                // High-visibility neon/synthwave style potholes
                ctx.fillStyle = '#200b3b'; // deep purple center fill
                ctx.beginPath();
                ctx.ellipse(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2, obs.height / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.strokeStyle = '#d8b4fe'; // thick lavender outline
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2 - 1, obs.height / 2 - 1, 0, 0, Math.PI * 2);
                ctx.stroke();

                // Neon-pink cracked highlights (#f472b6)
                ctx.strokeStyle = '#f472b6';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                const cx = obs.x + obs.width / 2;
                const cy = obs.y + obs.height / 2;
                // Crack 1: from center towards top-left
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx - obs.width * 0.25, cy - obs.height * 0.2);
                ctx.lineTo(cx - obs.width * 0.35, cy - obs.height * 0.1);
                // Crack 2: from center towards bottom-right
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + obs.width * 0.2, cy + obs.height * 0.25);
                ctx.lineTo(cx + obs.width * 0.3, cy + obs.height * 0.15);
                // Crack 3: a small branch
                ctx.moveTo(cx - obs.width * 0.1, cy + obs.height * 0.1);
                ctx.lineTo(cx - obs.width * 0.2, cy + obs.height * 0.3);
                ctx.stroke();
            }
        });
    },
    
    drawParticles() {
        this.particles.forEach(p => {
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });
    },
    
    drawPlayer() {
        this.ctx.save();
        
        const centerX = this.player.x + this.player.width / 2;
        const centerY = this.player.y + this.player.height / 2;
        this.ctx.translate(centerX, centerY);
        
        this.ctx.rotate(this.player.angle);
        
        if (window.Pixelator && window.Pixelator.flipCar) {
            this.ctx.scale(-1, 1);
        }
        
        if (this.playerSpriteCanvas) {
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(
                this.playerSpriteCanvas,
                -this.player.width / 2,
                -this.player.height / 2,
                this.player.width,
                this.player.height
            );
        } else {
            this.ctx.fillStyle = this.paintColor;
            this.ctx.fillRect(
                -this.player.width / 2,
                -this.player.height / 2,
                this.player.width,
                this.player.height
            );
        }
        
        this.ctx.restore();
    },
    
    drawPolice() {
        if (this.state === 'menu') return;
        
        this.ctx.save();
        
        const centerX = this.police.x + this.police.width / 2;
        const centerY = this.police.y + this.police.height / 2;
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.police.angle);
        
        const w = this.police.width;
        const h = this.police.height;
        
        // Draw Police Cruiser vector elements (Retro Arcade style)
        // 1. Lower chassis (Black)
        this.ctx.fillStyle = '#09090b';
        this.ctx.fillRect(-w/2, -h/4, w, h/2);
        
        // 2. White Door / Cabin center panel (Classic black & white cop car)
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillRect(-w/6, -h/4, w/3, h/2);
        
        // 3. Cabin roof & pillars (Black)
        this.ctx.fillStyle = '#09090b';
        this.ctx.beginPath();
        this.ctx.moveTo(-w/4, -h/4);
        this.ctx.lineTo(-w/10, -h/2);
        this.ctx.lineTo(w/4, -h/2);
        this.ctx.lineTo(w/3, -h/4);
        this.ctx.closePath();
        this.ctx.fill();
        
        // 4. Windows (Dark Blue/Tint)
        this.ctx.fillStyle = '#1e3a8a';
        this.ctx.beginPath();
        this.ctx.moveTo(-w/8, -h/4 - 2);
        this.ctx.lineTo(-w/20, -h/2 + 2);
        this.ctx.lineTo(w/5, -h/2 + 2);
        this.ctx.lineTo(w/4, -h/4 - 2);
        this.ctx.closePath();
        this.ctx.fill();
        
        // 5. White divider line in windows
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillRect(w/15, -h/2 + 2, 2, h/4 - 1);
        
        // 6. Wheels (Pixelated style black hubs with chrome centers)
        this.ctx.fillStyle = '#18181b';
        this.ctx.fillRect(-w/3, h/4, 12, 6);
        this.ctx.fillRect(w/4, h/4, 12, 6);
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillRect(-w/3 + 4, h/4 + 2, 4, 2);
        this.ctx.fillRect(w/4 + 4, h/4 + 2, 4, 2);
        
        // 7. Headlights / Taillights (Yellow/Red)
        this.ctx.fillStyle = '#fbbf24'; // Yellow headlights
        this.ctx.fillRect(w/2 - 2, -h/8, 2, 4);
        this.ctx.fillStyle = '#ef4444'; // Red brake lights
        this.ctx.fillRect(-w/2, -h/8, 2, 4);
        
        // 8. Flashing Siren Lightbar on roof (Blinking red and blue)
        const redOn = (this.police.lightState === 0);
        
        this.ctx.fillStyle = '#374151'; // Siren bracket base
        this.ctx.fillRect(w/25 - 4, -h/2 - 2, 8, 2);
        
        if (redOn) {
            this.ctx.fillStyle = '#ef4444'; // Red light on
            this.ctx.fillRect(w/25 - 7, -h/2 - 6, 6, 4);
            this.ctx.fillStyle = '#1e3a8a'; // Blue light off
            this.ctx.fillRect(w/25 + 1, -h/2 - 6, 6, 4);
            
            // Draw red light flare glow
            this.ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
            this.ctx.beginPath();
            this.ctx.arc(w/25 - 4, -h/2 - 4, 22, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            this.ctx.fillStyle = '#1d4ed8'; // Blue light on
            this.ctx.fillRect(w/25 + 1, -h/2 - 6, 6, 4);
            this.ctx.fillStyle = '#7f1d1d'; // Red light off
            this.ctx.fillRect(w/25 - 7, -h/2 - 6, 6, 4);
            
            // Draw blue light flare glow
            this.ctx.fillStyle = 'rgba(29, 78, 216, 0.2)';
            this.ctx.beginPath();
            this.ctx.arc(w/25 + 4, -h/2 - 4, 22, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.restore();
        
        // 9. Ambient Red/Blue Flashing reflection on highway shoulders
        if (this.state === 'playing' || this.state === 'countdown' || this.state === 'crashed') {
            this.ctx.save();
            this.ctx.globalAlpha = 0.08;
            this.ctx.fillStyle = redOn ? '#ef4444' : '#1d4ed8';
            this.ctx.fillRect(0, this.roadTop - 3, this.V_WIDTH, 6);
            this.ctx.fillRect(0, this.roadBottom, this.V_WIDTH, 6);
            this.ctx.restore();
        }
    },
    
    drawCountdownOverlay() {
        // Overlay mask
        this.ctx.fillStyle = 'rgba(5, 3, 10, 0.45)';
        this.ctx.fillRect(0, 0, this.V_WIDTH, this.V_HEIGHT);
        
        // Countdown text
        let numberText = Math.ceil(this.countdownTime / 1000);
        let numberColor = '#ff5722'; // Orange 3-2-1
        
        if (this.countdownTime < 800) {
            numberText = 'GO!';
            numberColor = '#39ff14'; // Neon Green GO
        }
        
        this.ctx.save();
        this.ctx.font = "bold 60px 'Press Start 2P', monospace";
        this.ctx.fillStyle = numberColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Pulse size glow
        const pulseRatio = (this.countdownTime % 1000) / 1000;
        const pulseGlow = Math.max(0, 15 - pulseRatio * 15);
        this.ctx.shadowColor = numberColor;
        this.ctx.shadowBlur = pulseGlow;
        
        this.ctx.fillText(numberText, this.V_WIDTH / 2, this.V_HEIGHT / 2);
        this.ctx.restore();
    }
};

window.Game = Game;

// Start setup
window.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
