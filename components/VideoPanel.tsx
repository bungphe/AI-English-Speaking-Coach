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
  audioAnalyser
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<HTMLImageElement>(null);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  
  // Physics state refs to persist values between animation frames without re-renders
  const physicsRef = useRef({
    scaleX: 1,
    scaleY: 1,
    translateY: 0,
    rotate: 0,
    brightness: 1
  });

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Real-time Audio Visualization Loop
  useEffect(() => {
    if (!audioAnalyser || !avatarRef.current) {
        setLocalIsSpeaking(false);
        return;
    }

    let animationFrameId: number;
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const animate = () => {
        // Get frequency data (0-255)
        audioAnalyser.getByteFrequencyData(dataArray);

        // 1. Calculate General Energy (Volume) - approx index 1-30 covers human voice fundamental & lower harmonics
        let totalEnergy = 0;
        const voiceBinCount = 30; 
        for (let i = 1; i < voiceBinCount; i++) {
            totalEnergy += dataArray[i];
        }
        const avgVolume = totalEnergy / voiceBinCount; // 0-255
        const normalizedVol = Math.max(0, (avgVolume - 10)) / 100; // Threshold noise
        const intensity = Math.min(1.5, normalizedVol); // Cap intensity

        // 2. Frequency Analysis for Pseudo-Phonetics
        // Bass (Jaw Drop): ~100-300Hz -> bins 2-8
        let bassEnergy = 0;
        for (let i = 2; i < 8; i++) bassEnergy += dataArray[i];
        const bassFactor = bassEnergy / 6 / 255;

        // Treble (Mouth Width/Smile): ~500-2000Hz -> bins 10-40
        let trebleEnergy = 0;
        for (let i = 10; i < 40; i++) trebleEnergy += dataArray[i];
        const trebleFactor = trebleEnergy / 30 / 255;

        const isSpeakingNow = intensity > 0.05;
        setLocalIsSpeaking(isSpeakingNow);

        if (avatarRef.current) {
            // Target Transforms based on Audio
            let targetScaleY = 1;
            let targetScaleX = 1;
            let targetTranslateY = 0;
            let targetRotate = 0;

            if (intensity > 0.02) {
                // Jaw Logic: Louder + Bass = Drop Jaw more
                // We add 1.0 to base scale. 
                // Maximum jaw drop approx 1.2x
                targetScaleY = 1 + (intensity * 0.1) + (bassFactor * 0.25);

                // Width Logic: 
                // High Treble = Wider (Smile/Grimace) -> ScaleX > 1
                // High Bass/Low Treble = Narrower (O-shape) -> ScaleX < 1
                // We dampen ScaleX changes so the head doesn't squash too much
                targetScaleX = 1 + (trebleFactor * 0.15) - (bassFactor * 0.1);

                // Head Bounce: Moves down slightly on loud sounds (emphasis)
                targetTranslateY = intensity * 6;

                // Head Tilt: Subtle rotation based on Treble vs Bass differential to mimic expressiveness
                // More treble = slight tilt right, Bass = slight tilt left
                targetRotate = (trebleFactor - bassFactor) * 3; 
            }

            // Physics Smoothing (Lerp)
            // We interpolate current values towards target values.
            // 0.2 factor = responsive but smooth. 0.05 = lazy/heavy.
            const smoothFactor = 0.25;

            physicsRef.current.scaleX = lerp(physicsRef.current.scaleX, targetScaleX, smoothFactor);
            physicsRef.current.scaleY = lerp(physicsRef.current.scaleY, targetScaleY, smoothFactor);
            physicsRef.current.translateY = lerp(physicsRef.current.translateY, targetTranslateY, smoothFactor);
            physicsRef.current.rotate = lerp(physicsRef.current.rotate, targetRotate, smoothFactor * 0.5); // Slower rotation
            
            // Apply Transforms
            avatarRef.current.style.transform = `
                scale(${physicsRef.current.scaleX.toFixed(3)}, ${physicsRef.current.scaleY.toFixed(3)}) 
                translateY(${physicsRef.current.translateY.toFixed(2)}px)
                rotate(${physicsRef.current.rotate.toFixed(2)}deg)
            `;
            
            // Subtle brightness shift for liveliness
            const targetBrightness = 1 + (intensity * 0.1);
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
  }, [audioAnalyser]);

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
          <div className={`w-full h-full flex items-center justify-center transition-transform duration-100 ${!audioAnalyser && isSpeaking ? 'talking-container' : ''}`}>
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
        /* Fallback Animation if no Audio Analyser is present */
        @keyframes talking-rhythm {
          0% { transform: scale(1) translateY(0); filter: brightness(100%); }
          25% { transform: scaleY(1.05) scaleX(0.98) translateY(2px); filter: brightness(105%); }
          50% { transform: scale(1) translateY(0); filter: brightness(100%); }
          75% { transform: scaleY(1.02) scaleX(0.99) translateY(1px); filter: brightness(102%); }
          100% { transform: scale(1) translateY(0); filter: brightness(100%); }
        }
        
        .talking-container {
          animation: talking-rhythm 0.3s ease-in-out infinite;
          will-change: transform;
        }

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