'use client';

import React, { useRef, useEffect, useState } from 'react';

interface VideoPanelProps {
  name: string;
  stream?: MediaStream | null;
  neutralAvatarUrl?: string;
  talkingAvatarUrl?: string;
  isSessionActive: boolean;
  isSpeaking?: boolean; // Fallback if no analyser
  isProcessing?: boolean;
  audioAnalyser?: AnalyserNode | null; // New prop for direct audio analysis
  gesture?: 'nod' | 'shake' | null; // New prop for emotive gestures
}

// Linear interpolation helper for smooth animation physics
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

const VideoPanel: React.FC<VideoPanelProps> = ({ 
  name, 
  stream, 
  neutralAvatarUrl, 
  talkingAvatarUrl, 
  isSessionActive, 
  isSpeaking: isSpeakingProp,
  isProcessing,
  audioAnalyser,
  gesture
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<HTMLImageElement>(null);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  
  // Physics state refs to persist values between animation frames without re-renders
  const physicsRef = useRef({
    scaleX: 1,
    scaleY: 1,
    translateY: 0,
    translateX: 0,
    rotate: 0,
    brightness: 1
  });

  // Hysteresis ref to prevent flickering speaking state
  const lastSpokeTimeRef = useRef(0);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Blinking Logic: Randomize blinks every few seconds
  useEffect(() => {
    if (stream) return; // Don't blink if it's a video stream

    let timeoutId: NodeJS.Timeout;

    const triggerBlink = () => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 200); // Blink lasts 200ms
        
        // Schedule next blink between 2s and 6s
        const nextBlinkTime = Math.random() * 4000 + 2000;
        timeoutId = setTimeout(triggerBlink, nextBlinkTime);
    };

    timeoutId = setTimeout(triggerBlink, 3000);
    return () => clearTimeout(timeoutId);
  }, [stream]);

  // Real-time Audio Visualization & Animation Loop
  useEffect(() => {
    if (!audioAnalyser || !avatarRef.current) {
        setLocalIsSpeaking(false);
        return;
    }

    let animationFrameId: number;
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let time = 0;

    const animate = () => {
        time += 0.1; 
        
        // Get frequency data (0-255)
        audioAnalyser.getByteFrequencyData(dataArray);

        // --- 1. Audio Analysis ---
        
        // A. General Intensity (Volume) - approx bins 1-30
        let totalEnergy = 0;
        const voiceBinCount = 30; 
        for (let i = 1; i < voiceBinCount; i++) {
            totalEnergy += dataArray[i];
        }
        const avgVolume = totalEnergy / voiceBinCount; // 0-255
        const normalizedVol = Math.max(0, (avgVolume - 15)) / 240; // Threshold noise
        const intensity = Math.min(1.5, normalizedVol); // Cap intensity

        // B. Formant Analysis (Pseudo-Phonetics)
        // F1: Low/Bass (Jaw Drop / Open vowels like 'A', 'O', 'U') -> Bins 2-8 (~100Hz - 700Hz)
        let f1Energy = 0;
        for (let i = 2; i <= 8; i++) f1Energy += dataArray[i];
        const normF1 = Math.min(1, (f1Energy / 7) / 200);

        // F2: Mids (Lip Spread / Front vowels like 'E', 'I') -> Bins 10-25 (~900Hz - 2300Hz)
        let f2Energy = 0;
        for (let i = 10; i <= 25; i++) f2Energy += dataArray[i];
        const normF2 = Math.min(1, (f2Energy / 16) / 200);

        // F3: Highs (Consonants / Sibilants like 'S', 'T') -> Bins 40+ (~3700Hz+)
        let f3Energy = 0;
        for (let i = 40; i < Math.min(60, bufferLength); i++) f3Energy += dataArray[i];
        const normF3 = Math.min(1, (f3Energy / 20) / 150);

        // --- 2. State Logic (Hysteresis) ---
        const now = Date.now();
        const SPEAKING_THRESHOLD = 0.05;
        
        if (intensity > SPEAKING_THRESHOLD) {
            lastSpokeTimeRef.current = now;
            setLocalIsSpeaking(true);
        } else if (now - lastSpokeTimeRef.current > 200) {
            // Only stop speaking if silent for > 200ms
            setLocalIsSpeaking(false);
        }

        // --- 3. Animation Physics ---
        if (avatarRef.current) {
            let targetScaleY = 1;
            let targetScaleX = 1;
            let targetTranslateY = 0;
            let targetTranslateX = 0;
            let targetRotate = 0;

            // Only apply shape morphs if currently "speaking" (after hysteresis check)
            if (localIsSpeaking) {
                // Calculate Dynamic Visemes
                
                // Base Jaw Drop (Volume + F1)
                const jawOpen = (intensity * 0.15) + (normF1 * 0.3);
                
                // Mouth Width (Spread): Driven by F2, reduced by F1 (since O/U are narrow)
                const mouthSpread = (normF2 * 0.25) - (normF1 * 0.1); 

                targetScaleY = 1 + jawOpen; 
                targetScaleX = 1 + mouthSpread;

                // Emphasize "O" shape: High F1, Low F2 -> Tall and Narrow
                if (normF1 > 0.4 && normF2 < 0.3) {
                    targetScaleX *= 0.92;
                    targetScaleY *= 1.1; 
                }

                // Emphasize "E" shape: High F2 -> Wide and shorter
                if (normF2 > 0.4) {
                     targetScaleX *= 1.1;
                     targetScaleY *= 0.95;
                }

                // Consonant Jitter: High frequency noise vibrates the jaw slightly
                if (normF3 > 0.3) {
                    targetTranslateX += (Math.random() - 0.5) * 2;
                }

                // Head Bounce based on intensity
                targetTranslateY = intensity * 6;
                
                // Dynamic Tilt based on pitch (F2 vs F1 balance)
                targetRotate = (normF2 - normF1) * 4; 
            }

            // --- Apply Gesture Overrides ---
            if (gesture === 'nod') {
                // Sine wave for nodding up and down
                const nodSpeed = 0.5;
                targetTranslateY += Math.sin(time * nodSpeed) * 8; 
                targetRotate += Math.sin(time * nodSpeed) * 2; 
            } else if (gesture === 'shake') {
                // Sine wave for shaking left and right
                const shakeSpeed = 0.8;
                targetTranslateX += Math.sin(time * shakeSpeed) * 6; 
                targetRotate += Math.sin(time * shakeSpeed) * 3; 
            }
            
            // --- Apply Blink Override ---
            if (isBlinking) {
                targetScaleY *= 0.1; // Squash eyes (vertical scale)
            }

            // Physics Smoothing (Lerp)
            // Use faster smoothing for attack (opening), slower for release (closing)
            const attack = 0.4;
            const release = 0.2;
            const smoothX = targetScaleX > physicsRef.current.scaleX ? attack : release;
            const smoothY = targetScaleY > physicsRef.current.scaleY ? attack : release;

            physicsRef.current.scaleX = lerp(physicsRef.current.scaleX, targetScaleX, smoothX);
            physicsRef.current.scaleY = lerp(physicsRef.current.scaleY, targetScaleY, smoothY);
            physicsRef.current.translateY = lerp(physicsRef.current.translateY, targetTranslateY, 0.2);
            physicsRef.current.translateX = lerp(physicsRef.current.translateX, targetTranslateX, 0.2);
            physicsRef.current.rotate = lerp(physicsRef.current.rotate, targetRotate, 0.1); 
            
            // Apply Transforms
            avatarRef.current.style.transform = `
                scale(${physicsRef.current.scaleX.toFixed(3)}, ${physicsRef.current.scaleY.toFixed(3)}) 
                translate(${physicsRef.current.translateX.toFixed(2)}px, ${physicsRef.current.translateY.toFixed(2)}px)
                rotate(${physicsRef.current.rotate.toFixed(2)}deg)
            `;
            
            // Subtle brightness shift for liveliness + Blink dimming
            let targetBrightness = 1 + (intensity * 0.1);
            if (isBlinking) targetBrightness *= 0.9;
            physicsRef.current.brightness = lerp(physicsRef.current.brightness, targetBrightness, 0.1);
            avatarRef.current.style.filter = `brightness(${physicsRef.current.brightness.toFixed(3)})`;
        }

        animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
        cancelAnimationFrame(animationFrameId);
        if (avatarRef.current) {
            avatarRef.current.style.transform = 'none';
            avatarRef.current.style.filter = 'none';
        }
    };
  }, [audioAnalyser, isBlinking, gesture, localIsSpeaking]);

  // Determine active speaking state (prefer local analysis, fallback to prop)
  const isSpeaking = audioAnalyser ? localIsSpeaking : isSpeakingProp;

  // Determine border color
  let borderColor = 'border-gray-600';
  if (isSessionActive) {
    if (isSpeaking) {
      borderColor = 'border-green-500';
    } else if (isProcessing) {
      borderColor = 'border-blue-500';
    }
  }

  const borderAnimation = isSessionActive && (isSpeaking || isProcessing) ? 'animate-pulse-border' : '';

  return (
    <div className={`relative flex-1 bg-black rounded-2xl overflow-hidden shadow-2xl border-4 ${borderColor} ${borderAnimation} transition-all duration-300`}>
      <div className="absolute top-4 left-4 bg-black bg-opacity-60 px-4 py-1 rounded-full z-10">
        <p className="text-white font-semibold">{name}</p>
      </div>
      
      {isProcessing && (
        <div className="absolute top-4 right-4 bg-blue-600 bg-opacity-90 px-3 py-1 rounded-full z-10 flex items-center animate-pulse">
           <i className="fas fa-brain mr-2 text-white"></i>
           <span className="text-xs font-bold text-white uppercase tracking-wider">Thinking...</span>
        </div>
      )}

      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={name === 'You'}
          className="w-full h-full object-cover transform scale-x-[-1]"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center transition-transform duration-100">
             <img 
                ref={avatarRef}
                src={isSpeaking && talkingAvatarUrl ? talkingAvatarUrl : neutralAvatarUrl} 
                alt="AI Avatar" 
                className="w-full h-full object-cover origin-bottom will-change-transform" 
            />
          </div>
        </div>
      )}
       <style>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0px rgba(255, 255, 255, 0); }
          50% { box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.1); }
        }
        .animate-pulse-border {
          animation: pulse-border 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default VideoPanel;