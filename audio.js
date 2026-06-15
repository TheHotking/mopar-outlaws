/* ==========================================================================
   MOPAR OUTLAWS - WEB AUDIO RETRO SYNTHESIZER
   ========================================================================== */

const AudioEngine = {
    ctx: null,
    musicPlaying: false,
    soundEnabled: true,
    
    // Nodes
    masterGain: null,
    engineOsc: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    
    // Music Sequencer state
    musicIntervalId: null,
    currentStep: 0,
    tempo: 130, // BPM
    
    init() {
        // Create audio toggle button listener
        const soundBtn = document.createElement('button');
        soundBtn.id = 'sound-toggle-btn';
        soundBtn.className = 'btn-sound-toggle';
        soundBtn.innerHTML = `
            <svg class="sound-on" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            <svg class="sound-off hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            SFX/MUSIC: ON
        `;
        
        // Append sound button to header menu
        const header = document.querySelector('header');
        if (header) {
            header.appendChild(soundBtn);
        } else {
            document.body.appendChild(soundBtn);
        }
        
        soundBtn.addEventListener('click', () => this.toggleSound());
        
        // Setup user interactions to resume Audio Context (browser security requirement)
        const resumeAudio = () => {
            this.setupContext();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            if (window.Game && window.Game.state === 'menu') {
                this.startMusic(1);
            }
        };
        window.addEventListener('click', resumeAudio, { once: true });
        window.addEventListener('keydown', resumeAudio, { once: true });
    },
    
    setupContext() {
        if (this.ctx) return;
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.soundEnabled ? 0.35 : 0.0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        
        this.startEngineSound();
        this.stopEngineSound(); // Start muted initially on menu screen
    },
    
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        const btn = document.getElementById('sound-toggle-btn');
        if (btn) {
            const soundOnIcon = btn.querySelector('.sound-on');
            const soundOffIcon = btn.querySelector('.sound-off');
            if (this.soundEnabled) {
                soundOnIcon.classList.remove('hidden');
                soundOffIcon.classList.add('hidden');
                btn.classList.remove('muted');
                btn.lastChild.textContent = ' SFX/MUSIC: ON';
                if (this.masterGain && this.ctx) {
                    this.masterGain.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 0.1);
                }
            } else {
                soundOnIcon.classList.add('hidden');
                soundOffIcon.classList.remove('hidden');
                btn.classList.add('muted');
                btn.lastChild.textContent = ' SFX/MUSIC: OFF';
                if (this.masterGain && this.ctx) {
                    this.masterGain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.1);
                }
            }
        }
        
        if (this.soundEnabled) {
            this.setupContext();
            if (this.ctx.state === 'suspended') this.ctx.resume();
            this.startMusic();
        }
    },
    
    // --- SYNTHESIZED SOUND EFFECTS ---
    
    // Continuous Low hum of a Mopar V8 engine
    startEngineSound() {
        try {
            this.engineOsc = this.ctx.createOscillator();
            this.engineOsc.type = 'sawtooth';
            this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime); // 45Hz deep rumble
            
            // Filter to make V8 sound warm and throfty rather than buzzy
            this.engineFilter = this.ctx.createBiquadFilter();
            this.engineFilter.type = 'lowpass';
            this.engineFilter.frequency.setValueAtTime(160, this.ctx.currentTime);
            
            this.engineGain = this.ctx.createGain();
            this.engineGain.gain.setValueAtTime(0.18, this.ctx.currentTime); // keep engine background level
            
            this.engineOsc.connect(this.engineFilter);
            this.engineFilter.connect(this.engineGain);
            this.engineGain.connect(this.masterGain);
            
            this.engineOsc.start(0);
        } catch (e) {
            console.error("V8 engine synthesis failed:", e);
        }
    },
    
    stopEngineSound() {
        if (this.engineGain && this.ctx) {
            this.engineGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.05);
        }
    },
    
    resumeEngineSound() {
        if (!this.engineOsc) {
            this.startEngineSound();
        }
        if (this.engineGain && this.ctx) {
            const targetGain = this.soundEnabled ? 0.18 : 0.0;
            this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
        }
    },
    
    // Modulate V8 pitch based on speed
    updateEnginePitch(speed) {
        if (!this.engineOsc || !this.ctx) return;
        // Map speed to 45Hz - 110Hz range
        const freq = 45 + (speed * 4.5);
        this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
        this.engineFilter.frequency.setTargetAtTime(freq * 3.5, this.ctx.currentTime, 0.08);
    },
    
    // Synth police siren (Sweeping LFO)
    startSirenSound() {
        if (!this.ctx) this.setupContext();
        if (this.sirenOsc) return;
        
        try {
            this.sirenOsc = this.ctx.createOscillator();
            this.sirenOsc.type = 'triangle';
            this.sirenOsc.frequency.setValueAtTime(650, this.ctx.currentTime);
            
            this.sirenGain = this.ctx.createGain();
            this.sirenGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
            this.sirenGain.gain.linearRampToValueAtTime(0.02, this.ctx.currentTime + 0.5);
            
            // Siren pitch sweep modulator
            const sirenLFO = this.ctx.createOscillator();
            sirenLFO.type = 'sine';
            sirenLFO.frequency.setValueAtTime(1.8, this.ctx.currentTime); // LFO rate (1.8 sweeps per second)
            
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.setValueAtTime(180, this.ctx.currentTime); // Sweep range (siren shifts +/- 180Hz)
            
            sirenLFO.connect(lfoGain);
            lfoGain.connect(this.sirenOsc.frequency);
            
            this.sirenOsc.connect(this.sirenGain);
            this.sirenGain.connect(this.masterGain);
            
            sirenLFO.start(0);
            this.sirenOsc.start(0);
            this.sirenLFO = sirenLFO; // save reference to terminate
        } catch (e) {
            console.error("Siren synthesis failed:", e);
        }
    },
    
    stopSirenSound() {
        if (this.sirenGain && this.ctx) {
            const gain = this.sirenGain;
            const osc = this.sirenOsc;
            const lfo = this.sirenLFO;
            
            gain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.3);
            setTimeout(() => {
                try {
                    osc.stop();
                    lfo.stop();
                } catch(e) {}
            }, 350);
            
            this.sirenOsc = null;
            this.sirenGain = null;
            this.sirenLFO = null;
        }
    },
    
    // Quick chiptune pitch sweep when changing lanes
    playLaneShiftSound() {
        if (!this.ctx || !this.soundEnabled) return;
        
        try {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, this.ctx.currentTime);
            // Quick sweep up
            osc.frequency.exponentialRampToValueAtTime(700, this.ctx.currentTime + 0.15);
            
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(0);
            osc.stop(this.ctx.currentTime + 0.16);
        } catch (e) {}
    },
    
    // White noise explosion burst
    playCrashSound() {
        if (!this.ctx || !this.soundEnabled) return;
        
        try {
            // Stop music, sirens, and engine rumble on crash
            this.stopMusic();
            this.stopSirenSound();
            this.stopEngineSound();
            
            const bufferSize = this.ctx.sampleRate * 1.2; // 1.2 seconds crash
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            
            // Fill buffer with random white noise
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            
            // Filter to make crash heavy
            const lowpass = this.ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.setValueAtTime(600, this.ctx.currentTime);
            lowpass.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.8);
            
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.1);
            
            noise.connect(lowpass);
            lowpass.connect(gain);
            gain.connect(this.masterGain);
            
            // Add a sub-bass boom oscillator for impact
            const subOsc = this.ctx.createOscillator();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(100, this.ctx.currentTime);
            subOsc.frequency.linearRampToValueAtTime(10, this.ctx.currentTime + 0.5);
            
            const subGain = this.ctx.createGain();
            subGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
            subGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
            
            subOsc.connect(subGain);
            subGain.connect(this.masterGain);
            
            noise.start(0);
            subOsc.start(0);
            subOsc.stop(this.ctx.currentTime + 0.6);
            
            // Seamlessly resume menu music after the crash boom settles
            setTimeout(() => {
                if (this.ctx && !this.musicPlaying && window.Game && (window.Game.state === 'crashed' || window.Game.state === 'menu')) {
                    this.startMusic(1);
                }
            }, 1000);
        } catch (e) {}
    },
    
    // Checkpoint / Level clear fanfare arpeggio
    playVictorySound() {
        if (!this.ctx || !this.soundEnabled) return;
        
        try {
            const time = this.ctx.currentTime;
            // Play retro C major arpeggio chord (C4, E4, G4, C5)
            const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
            
            notes.forEach((freq, idx) => {
                const noteTime = time + (idx * 0.12);
                
                const osc = this.ctx.createOscillator();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, noteTime);
                
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.0, time);
                gain.gain.setValueAtTime(0.18, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.3);
                
                osc.connect(gain);
                gain.connect(this.masterGain);
                
                osc.start(noteTime);
                osc.stop(noteTime + 0.35);
            });
        } catch (e) {}
    },
    
    // --- CHIPTUNE SEQUENCING (8-bit Synthesized background loop) ---
    
    currentTrackIdx: 0,
    
    // 4 Distinct retro chiptune loops
    tracks: [
        {
            tempo: 130,
            bassType: 'sawtooth',
            leadType: 'triangle',
            // A minor progression
            bassFreqs: [
                55.00,  55.00,  55.00,  55.00,  // A2
                65.41,  65.41,  65.41,  65.41,  // C3
                73.42,  73.42,  73.42,  73.42,  // D3
                49.00,  49.00,  49.00,  49.00   // G2
            ],
            melodyPattern: [
                440.00,      0, 659.25,      0, // A4, _, E5, _
                783.99, 880.00,      0, 659.25, // G5, A5, _, E5
                523.25,      0, 783.99,      0, // C5, _, G5, _
                587.33, 659.25, 523.25, 493.88  // D5, E5, C5, B4
            ]
        },
        {
            tempo: 140,
            bassType: 'triangle',
            leadType: 'square',
            // E minor/Phrygian vibes (fast pace)
            bassFreqs: [
                41.20,  41.20,  41.20,  41.20,  // E2
                49.00,  49.00,  49.00,  49.00,  // G2
                55.00,  55.00,  55.00,  55.00,  // A2
                65.41,  65.41,  65.41,  65.41   // C3
            ],
            melodyPattern: [
                329.63,      0, 493.88,      0, // E4, _, B4, _
                587.33, 659.25,      0, 493.88, // D5, E5, _, B4
                392.00,      0, 587.33,      0, // G4, _, D5, _
                440.00, 493.88, 392.00, 349.23  // A4, B4, G4, F4
            ]
        },
        {
            tempo: 135,
            bassType: 'sawtooth',
            leadType: 'triangle',
            // D minor/Dorian groove
            bassFreqs: [
                73.42,  73.42,  73.42,  73.42,  // D3
                87.31,  87.31,  87.31,  87.31,  // F3
                98.00,  98.00,  98.00,  98.00,  // G3
                55.00,  55.00,  55.00,  55.00   // A2
            ],
            melodyPattern: [
                587.33,      0, 440.00,      0, // D5, _, A4, _
                523.25, 587.33,      0, 440.00, // C5, D5, _, A4
                349.23,      0, 523.25,      0, // F4, _, C5, _
                392.00, 440.00, 349.23, 329.63  // G4, A4, F4, E4
            ]
        },
        {
            tempo: 145,
            bassType: 'sawtooth',
            leadType: 'square',
            // G minor (driving tension)
            bassFreqs: [
                49.00,  49.00,  49.00,  49.00,  // G2
                58.27,  58.27,  58.27,  58.27,  // Bb2
                65.41,  65.41,  65.41,  65.41,  // C3
                73.42,  73.42,  73.42,  73.42   // D3
            ],
            melodyPattern: [
                392.00,      0, 587.33,      0, // G4, _, D5, _
                698.46, 783.99,      0, 587.33, // F5, G5, _, D5
                466.16,      0, 698.46,      0, // Bb4, _, F5, _
                523.25, 587.33, 466.16, 440.00  // C5, D5, Bb4, A4
            ]
        }
    ],
    
    startMusic(level) {
        const targetTrackIdx = ((level || 1) - 1) % this.tracks.length;
        
        // If music is already playing on a different track, restart it
        if (this.musicPlaying) {
            if (this.currentTrackIdx === targetTrackIdx) return;
            this.stopMusic();
        }
        
        this.setupContext();
        
        this.currentTrackIdx = targetTrackIdx;
        const currentTrack = this.tracks[this.currentTrackIdx];
        this.tempo = currentTrack.tempo;
        
        this.musicPlaying = true;
        this.currentStep = 0;
        
        const stepDuration = 60 / this.tempo / 4; // 16th notes
        let nextNoteTime = this.ctx.currentTime;
        
        const scheduleNextSteps = () => {
            while (nextNoteTime < this.ctx.currentTime + 0.15) {
                this.scheduleStep(this.currentStep, nextNoteTime);
                nextNoteTime += stepDuration;
                this.currentStep = (this.currentStep + 1) % 16;
            }
        };
        
        // Loop scheduler every 50ms
        this.musicIntervalId = setInterval(scheduleNextSteps, 50);
    },
    
    stopMusic() {
        if (this.musicIntervalId) {
            clearInterval(this.musicIntervalId);
            this.musicIntervalId = null;
        }
        this.musicPlaying = false;
    },
    
    // Sequences retro synthwave bassline and kick/snare percussion drums
    scheduleStep(step, time) {
        if (!this.soundEnabled || !this.ctx) return;
        
        const currentTrack = this.tracks[this.currentTrackIdx || 0];
        
        // 1. Synth Drum Loops (4/4 kick-snare patterns)
        if (step === 0 || step === 4 || step === 8 || step === 12) {
            // Kick drum: sine sweep
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(140, time);
            osc.frequency.exponentialRampToValueAtTime(45, time + 0.08);
            
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.35, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(time);
            osc.stop(time + 0.13);
        }
        
        if (step === 4 || step === 12) {
            // Retro Snare: white noise with highpass filter
            try {
                const bufferSize = this.ctx.sampleRate * 0.15;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;
                
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.setValueAtTime(1000, time);
                
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.12, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + 0.14);
                
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);
                
                noise.start(time);
                noise.stop(time + 0.15);
            } catch (e) {}
        }
        
        // 2. Chiptune Bassline (Retro Cyberpunk pattern from active track)
        const bassFreqs = currentTrack.bassFreqs;
        const bassNote = bassFreqs[step];
        const isOffbeat = (step % 2 === 1);
        
        // Play driving rhythm (all beats)
        const bassOsc = this.ctx.createOscillator();
        bassOsc.type = currentTrack.bassType;
        bassOsc.frequency.setValueAtTime(bassNote, time);
        
        const bassGain = this.ctx.createGain();
        // Give dynamic accents to offbeats
        const bassVolume = isOffbeat ? 0.08 : 0.05;
        bassGain.gain.setValueAtTime(bassVolume, time);
        bassGain.gain.exponentialRampToValueAtTime(0.005, time + 0.1);
        
        bassOsc.connect(bassGain);
        bassGain.connect(this.masterGain);
        bassOsc.start(time);
        bassOsc.stop(time + 0.11);
        
        // 3. Arpeggiated Retro Melody Lead (Plays on melody steps from active track)
        const melodyPattern = currentTrack.melodyPattern;
        const leadFreq = melodyPattern[step];
        if (leadFreq > 0) {
            const leadOsc = this.ctx.createOscillator();
            leadOsc.type = currentTrack.leadType;
            leadOsc.frequency.setValueAtTime(leadFreq, time);
            
            // Add slight vibrato
            const vibrato = this.ctx.createOscillator();
            vibrato.frequency.setValueAtTime(6, time); // 6Hz vibrato
            const vibGain = this.ctx.createGain();
            vibGain.gain.setValueAtTime(6, time); // vibrato depth +/- 6Hz
            vibrato.connect(vibGain);
            vibGain.connect(leadOsc.frequency);
            
            const leadGain = this.ctx.createGain();
            leadGain.gain.setValueAtTime(0.04, time); // keep melody background level
            leadGain.gain.exponentialRampToValueAtTime(0.002, time + 0.22);
            
            leadOsc.connect(leadGain);
            leadGain.connect(this.masterGain);
            
            vibrato.start(time);
            leadOsc.start(time);
            leadOsc.stop(time + 0.25);
            vibrato.stop(time + 0.25);
        }
    }
};

// Bind to window object
window.AudioEngine = AudioEngine;
window.addEventListener('DOMContentLoaded', () => {
    AudioEngine.init();
});
