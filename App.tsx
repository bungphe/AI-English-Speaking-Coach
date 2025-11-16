
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';
import VideoPanel from './components/VideoPanel';
import Controls from './components/Controls';
import TranscriptDisplay from './components/TranscriptDisplay';
import { TranscriptEntry } from './types';

// IMPORTANT: Do not expose this in client-side code in a real application.
// This is for demonstration purposes only.
const API_KEY = process.env.API_KEY;

const App: React.FC = () => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [statusText, setStatusText] = useState('Click start to begin');
  const [userStream, setUserStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSources = useRef<Set<AudioBufferSourceNode>>(new Set());

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  const stopSession = useCallback(() => {
    setStatusText('Session ended. Click start to begin again.');
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close());
      sessionPromiseRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    if (userStream) {
      userStream.getTracks().forEach(track => track.stop());
      setUserStream(null);
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }
    
    audioSources.current.forEach(source => source.stop());
    audioSources.current.clear();
    nextStartTimeRef.current = 0;

  }, [userStream]);


  const startSession = useCallback(async () => {
    setStatusText('Requesting permissions...');
    setTranscript([]);

    try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setUserStream(videoStream);

        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioStream;

        setStatusText('Connecting to AI...');

        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                },
                systemInstruction: "You are Eva, a friendly and patient AI English language coach. Your goal is to help me improve my conversational English and pronunciation. We will have a natural conversation. After I finish speaking, please provide brief, constructive feedback on my pronunciation or grammar, highlighting one or two key areas for improvement. Then, continue the conversation by asking a question or making a relevant comment. Keep your feedback encouraging and your responses natural.",
                outputAudioTranscription: {},
                inputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => {
                    setStatusText('Connected. Start speaking!');
                    const source = inputAudioContextRef.current!.createMediaStreamSource(localStreamRef.current!);
                    const processor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = processor;

                    processor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                          session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };

                    source.connect(processor);
                    processor.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    handleTranscription(message);
                    
                    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                    if (audioData) {
                       const outputAudioContext = outputAudioContextRef.current!;
                       const nextStartTime = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                       nextStartTimeRef.current = nextStartTime;

                       const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
                       const source = outputAudioContext.createBufferSource();
                       source.buffer = audioBuffer;
                       source.connect(outputAudioContext.destination);
                       
                       source.addEventListener('ended', () => {
                           audioSources.current.delete(source);
                       });

                       source.start(nextStartTime);
                       nextStartTimeRef.current += audioBuffer.duration;
                       audioSources.current.add(source);
                    }
                    if (message.serverContent?.interrupted) {
                        audioSources.current.forEach(source => source.stop());
                        audioSources.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Session error:', e);
                    setStatusText('An error occurred. Please restart.');
                    setIsSessionActive(false);
                    stopSession();
                },
                onclose: () => {
                    console.log('Session closed.');
                    // Don't change status here, as stopSession will handle it.
                },
            },
        });
    } catch (error) {
        console.error("Failed to start session:", error);
        setStatusText("Could not access camera/mic. Check permissions.");
        setIsSessionActive(false);
    }
  }, [ai.live, stopSession]);
  
  const handleTranscription = (message: LiveServerMessage) => {
    setTranscript(prev => {
        let newTranscript = [...prev];
        
        if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            const isFinal = message.serverContent.inputTranscription.isFinal;
            const lastEntry = newTranscript[newTranscript.length - 1];

            if (lastEntry && lastEntry.speaker === 'You' && !lastEntry.isFinal) {
                lastEntry.text += text;
                lastEntry.isFinal = isFinal;
            } else {
                newTranscript.push({ speaker: 'You', text, isFinal });
            }
        } else if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            const isFinal = message.serverContent.outputTranscription.isFinal;
            const lastEntry = newTranscript[newTranscript.length - 1];

            if (lastEntry && lastEntry.speaker === 'AI' && !lastEntry.isFinal) {
                lastEntry.text += text;
                lastEntry.isFinal = isFinal;
            } else {
                newTranscript.push({ speaker: 'AI', text, isFinal });
            }
        }
        
        if (message.serverContent?.turnComplete) {
            // Mark the last entries as final if they are not already.
            const lastUser = newTranscript.slice().reverse().find(e => e.speaker === 'You');
            if(lastUser) lastUser.isFinal = true;

            const lastAI = newTranscript.slice().reverse().find(e => e.speaker === 'AI');
            if(lastAI) lastAI.isFinal = true;
        }

        return newTranscript;
    });
};


  const handleToggleSession = useCallback(() => {
    if (isSessionActive) {
      setIsSessionActive(false);
      stopSession();
    } else {
      setIsSessionActive(true);
      startSession();
    }
  }, [isSessionActive, startSession, stopSession]);
  
  useEffect(() => {
    // Cleanup on unmount
    return () => {
        stopSession();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8 font-sans">
      <header className="text-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
          AI English Speaking Coach
        </h1>
        <p className="text-gray-400 mt-2">Practice your conversational English with Eva, your personal AI tutor.</p>
      </header>

      <main className="flex-grow flex flex-col gap-6">
        <div className="flex-grow flex flex-col md:flex-row gap-6">
          <VideoPanel name="You" stream={userStream} isSessionActive={isSessionActive} />
          <VideoPanel name="AI Coach Eva" avatarUrl="https://picsum.photos/seed/ai/800/600" isSessionActive={isSessionActive} />
        </div>
        
        <div className="flex-shrink-0">
          <TranscriptDisplay transcript={transcript} />
        </div>
      </main>

      <footer className="flex-shrink-0 mt-4">
        <Controls isSessionActive={isSessionActive} onToggleSession={handleToggleSession} statusText={statusText} />
      </footer>
    </div>
  );
};

export default App;
