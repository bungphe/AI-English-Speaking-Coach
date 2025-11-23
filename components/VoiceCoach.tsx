'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { decode, decodeAudioData, createPcmBlob } from '../services/audioUtils';
import { getHistory, saveConversation, deleteConversation } from '../services/historyService';
import VideoPanel from './VideoPanel';
import Controls from './Controls';
import TranscriptDisplay from './TranscriptDisplay';
import HistoryPanel from './HistoryPanel';
import VocabularyCard from './VocabularyCard';
import { TranscriptEntry, SavedConversation, VocabularyWord } from '../types';

// Updated to use "Notionists" (Infographic style) and "Bottts" in PNG format for better compatibility
const AVATARS = [
    {
      name: 'Eva',
      neutral: 'https://api.dicebear.com/9.x/notionists/png?seed=Eva&backgroundColor=e5e7eb',
      talking: 'https://api.dicebear.com/9.x/notionists/png?seed=Eva&backgroundColor=ffdfbf&mouth=smile',
    },
    {
      name: 'Bot',
      neutral: 'https://api.dicebear.com/9.x/bottts/png?seed=Bot&backgroundColor=e5e7eb',
      talking: 'https://api.dicebear.com/9.x/bottts/png?seed=Bot&backgroundColor=ffdfbf&mouth=smile',
    }
  ];

interface VoiceCoachProps {
  apiKey: string;
}

const VoiceCoach: React.FC<VoiceCoachProps> = ({ apiKey }) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [statusText, setStatusText] = useState('Click start to begin');
  const [userStream, setUserStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentAvatar, setCurrentAvatar] = useState(AVATARS[0]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<SavedConversation | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [practiceMode, setPracticeMode] = useState<'conversation' | 'vocabulary'>('conversation');
  const [vocabularyWord, setVocabularyWord] = useState<VocabularyWord | null>(null);
  const [avatarGesture, setAvatarGesture] = useState<'nod' | 'shake' | null>(null);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionEndedRef = useRef(false);
  const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize the AI client to prevent recreation on every render
  const ai = useMemo(() => new GoogleGenAI({ apiKey }), [apiKey]);

  useEffect(() => {
    setSavedConversations(getHistory());
  }, []);
  
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
    if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
    }
    if (inputAnalyserRef.current) {
        inputAnalyserRef.current.disconnect();
        inputAnalyserRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }
    
    audioSources.current.forEach(source => source.stop());
    audioSources.current.clear();
    nextStartTimeRef.current = 0;
    setAvatarGesture(null);

  }, [userStream]);


  const startSession = useCallback(async () => {
    setStatusText('Requesting permissions...');
    setTranscript([]);
    setVocabularyWord(null);

    try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setUserStream(videoStream);

        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioStream;

        setStatusText('Connecting to AI...');

        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        outputAudioContextRef.current = outputAudioContext;

        const analyser = outputAudioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        analyser.connect(outputAudioContext.destination);
        
        const conversationInstruction = `You are ${currentAvatar.name}, a friendly and patient AI English language coach. Your goal is to help me improve my conversational English and pronunciation. We will have a natural conversation. 
        
        **CRITICAL Pronunciation Guidance Rule:**
        When I speak, listen carefully to my pronunciation. If I mispronounce a word or phrase, you MUST gently correct me in your very next response by:
        1. Identifying the specific word.
        2. Showing the correct IPA pronunciation (e.g., /wɜːrd/).
        3. Providing a specific "Mouth Tip" on articulation (e.g., "Round your lips more", "Place your tongue behind your top teeth", or "Relax your jaw").
        
        After the brief correction, continue the conversation naturally by asking a question or making a relevant comment. Keep the flow natural.`;

        const vocabularyInstruction = `You are ${currentAvatar.name}, an AI vocabulary coach. Your task is to help me learn new English words. Start by introducing one new, interesting English word. You MUST format your response with the word and definition first, like this: **Word:** [The Word] **Definition:** [The Definition]. Then, provide an example sentence and ask me to use the word in a sentence of my own. After I respond, evaluate my sentence for correct usage, grammar, and pronunciation. Then, introduce the next word in the same format.`;
        
        const systemInstruction = practiceMode === 'conversation' ? conversationInstruction : vocabularyInstruction;

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                },
                systemInstruction: systemInstruction,
                outputAudioTranscription: {},
                inputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => {
                    setStatusText('Connected. Start speaking!');
                    const source = inputAudioContextRef.current!.createMediaStreamSource(localStreamRef.current!);
                    
                    // Setup User Voice Detection
                    const inputAnalyser = inputAudioContextRef.current!.createAnalyser();
                    inputAnalyser.fftSize = 256;
                    inputAnalyserRef.current = inputAnalyser;
                    source.connect(inputAnalyser);

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
                    
                    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    
                    if (audioData) {
                       const outputAudioContext = outputAudioContextRef.current!;
                       const nextStartTime = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                       nextStartTimeRef.current = nextStartTime;

                       const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
                       const source = outputAudioContext.createBufferSource();
                       source.buffer = audioBuffer;
                       source.connect(analyserRef.current!);
                       
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
                },
            },
        });
    } catch (error)
 {
        console.error("Failed to start session:", error);
        setStatusText("Could not access camera/mic. Check permissions.");
        setIsSessionActive(false);
    }
  }, [ai.live, stopSession, currentAvatar.name, practiceMode]);
  
  const detectSentimentGesture = (text: string) => {
    // Only analyze the beginning of the chunk (first 50 chars) to catch immediate reactions
    // and avoid false positives deep in a sentence.
    const snippet = text.substring(0, 50).toLowerCase();
    
    // Regex for whole-word matching to be more accurate
    // Positive / Agreement / Praise triggers
    const nodRegex = /\b(yes|yeah|yep|correct|exactly|right|good|great|awesome|perfect|definitely|sure|i agree|well done)\b/i;
    
    // Negative / Disagreement / Correction triggers
    const shakeRegex = /\b(no|nope|nah|not quite|actually|however|incorrect|wrong|try again|unfortunately|but)\b/i;

    const hasNod = nodRegex.test(snippet);
    const hasShake = shakeRegex.test(snippet);

    if (hasNod && !hasShake) {
        setAvatarGesture('nod');
        resetGestureTimer();
    } else if (hasShake && !hasNod) {
        setAvatarGesture('shake');
        resetGestureTimer();
    }
  };

  const resetGestureTimer = () => {
    if (gestureTimeoutRef.current) {
        clearTimeout(gestureTimeoutRef.current);
    }
    // Reduced duration to 1.5s for more subtle, short-lived gestures
    gestureTimeoutRef.current = setTimeout(() => {
        setAvatarGesture(null);
    }, 1500);
  };

  const handleTranscription = (message: LiveServerMessage) => {
    setTranscript(prev => {
        let newTranscript = [...prev];
        
        if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            const lastEntry = newTranscript[newTranscript.length - 1];

            if (lastEntry && lastEntry.speaker === 'You' && !lastEntry.isFinal) {
                lastEntry.text += text;
            } else {
                newTranscript.push({ speaker: 'You', text, isFinal: false });
            }
        } else if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            
            // Analyze text for gestures using nuanced regex logic
            detectSentimentGesture(text);

            const lastEntry = newTranscript[newTranscript.length - 1];

            let combinedText;
            if (lastEntry && lastEntry.speaker === 'AI' && !lastEntry.isFinal) {
                lastEntry.text += text;
                combinedText = lastEntry.text;
            } else {
                newTranscript.push({ speaker: 'AI', text, isFinal: false });
                combinedText = text;
            }
            
            if (practiceMode === 'vocabulary') {
                const match = combinedText.match(/\*\*Word:\*\*\s*(.*?)\s*\*\*Definition:\*\*\s*(.*)/);
                if (match && match[1] && match[2]) {
                    setVocabularyWord({ word: match[1].trim(), definition: match[2].trim() });
                }
            }
        }
        
        if (message.serverContent?.turnComplete) {
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

  const generateFeedback = async (finalTranscript: TranscriptEntry[]) => {
    const prompt = `
    You are an expert English Language Coach. Analyze the following conversation transcript.
    
    Generate a comprehensive feedback report in **HTML format**. 
    CRITICAL: Do not include markdown code blocks (like \`\`\`html) or quotes. Return ONLY the raw HTML string.
    
    The report must include these 4 sections, structured exactly as follows with the provided Tailwind classes:
    
    1.  <div class="mb-6">
            <h3 class="text-xl font-bold text-blue-400 mb-3 flex items-center"><i class="fas fa-chart-simple mr-2"></i> Performance Scorecard</h3>
            <div class="bg-gray-800 rounded-lg p-4 shadow-sm">
                <ul class="space-y-2 text-gray-300">
                   <li><span class="font-semibold text-white">Estimated Proficiency Level:</span> [CEFR A1-C2]</li>
                   <li><span class="font-semibold text-white">Vocabulary Range Score:</span> [1-10]</li>
                   <li><span class="font-semibold text-white">Grammar Accuracy Score:</span> [1-10]</li>
                   <li><span class="font-semibold text-white">Pronunciation Clarity Score:</span> [1-10]</li>
                </ul>
            </div>
        </div>
    
    2.  <div class="mb-6">
            <h3 class="text-xl font-bold text-yellow-400 mb-3 flex items-center"><i class="fas fa-microphone-lines mr-2"></i> Pronunciation Workshop</h3>
            <p class="text-sm text-gray-400 mb-3">Focus words from the session:</p>
            <div class="grid gap-4 md:grid-cols-2">
                <!-- Repeat this block for 2-3 difficult words from the transcript -->
                <div class="bg-gray-800 p-4 rounded-lg border-l-4 border-yellow-500">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-white text-lg">[Word]</span>
                        <span class="text-yellow-300 font-mono bg-gray-900 px-2 py-0.5 rounded text-sm">/[IPA]/</span>
                    </div>
                    <div class="text-sm text-gray-300 space-y-2">
                        <p class="flex items-start"><span class="mr-2 text-yellow-500">👂</span> <span><strong>Sound it out:</strong> [Phonetic spelling]</span></p>
                        <p class="flex items-start"><span class="mr-2 text-yellow-500">👄</span> <span><strong>Mouth Tip:</strong> [Specific tip, e.g. "Tongue behind teeth"]</span></p>
                    </div>
                </div>
            </div>
        </div>
    
    3.  <div class="mb-6">
            <h3 class="text-xl font-bold text-green-400 mb-3 flex items-center"><i class="fas fa-pen-to-square mr-2"></i> Grammar & Phrasing</h3>
            <div class="space-y-3">
                <!-- Repeat for 1-2 corrections -->
                <div class="bg-gray-800 p-4 rounded-lg">
                    <div class="flex flex-col sm:flex-row sm:items-center text-gray-300 mb-2 gap-2">
                        <span class="text-red-400 line-through bg-red-900/20 px-2 py-0.5 rounded">[Original]</span>
                        <i class="fas fa-arrow-right text-gray-500 hidden sm:block"></i>
                        <span class="text-green-400 font-bold bg-green-900/20 px-2 py-0.5 rounded">[Better Version]</span>
                    </div>
                    <p class="text-sm text-gray-400 italic border-t border-gray-700 pt-2 mt-2">💡 [Explanation]</p>
                </div>
            </div>
        </div>
    
    4.  <div>
            <h3 class="text-xl font-bold text-purple-400 mb-3 flex items-center"><i class="fas fa-bullseye mr-2"></i> Focus for Next Time</h3>
            <div class="bg-gradient-to-r from-purple-900/40 to-blue-900/40 p-4 rounded-lg border border-purple-500/30">
                <p class="text-gray-200 font-medium"><i class="fas fa-star text-yellow-500 mr-2"></i> [One concrete, actionable goal]</p>
            </div>
        </div>

    **Transcript:**
    ${finalTranscript.map(t => `${t.speaker}: ${t.text}`).join('\n')}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating feedback:", error);
        return "<p class='text-red-400'>Could not generate feedback for this session.</p>";
    }
  };
  
  useEffect(() => {
    if (isSessionActive) {
      sessionEndedRef.current = true;
    } else if (sessionEndedRef.current) {
      sessionEndedRef.current = false;
      if (transcript.length > 2) {
        const processAndSaveFolder = async () => {
            setIsGeneratingFeedback(true);
            setStatusText('Analyzing session and generating feedback...');
            
            const finalTranscript = transcript.map(t => ({ ...t, isFinal: true }));
            const feedbackText = await generateFeedback(finalTranscript);

            const newConversation: SavedConversation = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                transcript: finalTranscript,
                coach: {
                    name: currentAvatar.name,
                    avatarUrl: currentAvatar.neutral,
                },
                feedback: feedbackText,
            };
            saveConversation(newConversation);
            setSavedConversations(prev => [newConversation, ...prev]);
            
            setIsGeneratingFeedback(false);
            setStatusText('Session saved with feedback! Click start to begin again.');
        };
        processAndSaveFolder();
      }
    }
  }, [isSessionActive, transcript, currentAvatar, ai.models]);
  
  // This useEffect now just ensures the animation loop runs for volume monitoring to set general state,
  // but visualization is handled inside VideoPanel via audioAnalyser prop.
  useEffect(() => {
    let animationFrameId: number | null = null;
    
    const checkSpeaking = () => {
        if (!isSessionActive) {
            setIsAiSpeaking(false);
            setIsUserSpeaking(false);
            return;
        }

        const SPEAKING_THRESHOLD = 1.5;

        // Check AI Volume for general state (e.g. controls)
        if (analyserRef.current) {
            const analyser = analyserRef.current;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);

            let sumOfSquares = 0;
            for (let i = 0; i < bufferLength; i++) {
                const value = dataArray[i] - 128;
                sumOfSquares += value * value;
            }
            const rms = Math.sqrt(sumOfSquares / bufferLength);
            setIsAiSpeaking(rms > SPEAKING_THRESHOLD);
        } else {
             setIsAiSpeaking(false);
        }

        // Check User Volume for general state
        if (inputAnalyserRef.current) {
            const analyser = inputAnalyserRef.current;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);

            let sumOfSquares = 0;
            for (let i = 0; i < bufferLength; i++) {
                const value = dataArray[i] - 128;
                sumOfSquares += value * value;
            }
            const rms = Math.sqrt(sumOfSquares / bufferLength);
            setIsUserSpeaking(rms > SPEAKING_THRESHOLD);
        } else {
            setIsUserSpeaking(false);
        }

        animationFrameId = requestAnimationFrame(checkSpeaking);
    };

    if (isSessionActive) {
        checkSpeaking();
    } else {
        setIsAiSpeaking(false);
        setIsUserSpeaking(false);
    }

    return () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
    };
  }, [isSessionActive]);


  useEffect(() => {
    return () => {
        stopSession();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShowHistory = () => {
    setSelectedConversation(null);
    setIsHistoryOpen(true);
  };
  
  const handleCloseHistory = () => {
    setIsHistoryOpen(false);
  };
  
  const handleSelectConversation = (conversation: SavedConversation) => {
    setSelectedConversation(conversation);
  };
  
  const handleDeleteConversation = (id: string) => {
    const updatedHistory = deleteConversation(id);
    setSavedConversations(updatedHistory);
    if (selectedConversation?.id === id) {
      setSelectedConversation(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8 font-sans">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="text-center md:text-left">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
              AI English Speaking Coach
            </h1>
            <p className="text-gray-400 mt-2 text-sm sm:text-base">Practice your conversational English with your personal AI tutor.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-gray-800/50 px-4 py-2 rounded-full border border-gray-700/50 backdrop-blur-sm">
            <span className="text-sm text-gray-400 font-medium">Coach:</span>
            <div className="flex gap-2">
                {AVATARS.map(avatar => (
                    <button
                        key={avatar.name}
                        onClick={() => setCurrentAvatar(avatar)}
                        disabled={isSessionActive || isGeneratingFeedback}
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border-2 transition-all ${currentAvatar.name === avatar.name ? 'border-green-500 scale-110' : 'border-transparent hover:border-gray-500'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={`Select ${avatar.name}`}
                    >
                        <img src={avatar.neutral} alt={avatar.name} className="w-full h-full object-cover bg-gray-800" />
                    </button>
                ))}
            </div>
        </div>
      </header>
      
      <div className="mb-4 flex justify-center border-b border-gray-700">
        <button
            onClick={() => setPracticeMode('conversation')}
            disabled={isSessionActive || isGeneratingFeedback}
            className={`px-6 py-3 text-lg font-semibold border-b-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${practiceMode === 'conversation' ? 'border-green-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
            <i className="fas fa-comments mr-2"></i>Conversation
        </button>
        <button
            onClick={() => setPracticeMode('vocabulary')}
            disabled={isSessionActive || isGeneratingFeedback}
            className={`px-6 py-3 text-lg font-semibold border-b-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${practiceMode === 'vocabulary' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
            <i className="fas fa-book mr-2"></i>Vocabulary
        </button>
      </div>


      <main className="flex-grow flex flex-col gap-6">
        {practiceMode === 'vocabulary' && vocabularyWord && (
            <VocabularyCard word={vocabularyWord.word} definition={vocabularyWord.definition} />
        )}
        <div className="flex-grow flex flex-col md:flex-row gap-6">
          <VideoPanel 
            name="You" 
            stream={userStream} 
            isSessionActive={isSessionActive} 
            isSpeaking={isUserSpeaking}
            isProcessing={isSessionActive && !isUserSpeaking && !isAiSpeaking}
            audioAnalyser={inputAnalyserRef.current}
          />
          <VideoPanel 
            name={`AI Coach ${currentAvatar.name}`} 
            neutralAvatarUrl={currentAvatar.neutral}
            talkingAvatarUrl={currentAvatar.talking}
            isSessionActive={isSessionActive}
            isSpeaking={isAiSpeaking}
            audioAnalyser={analyserRef.current}
            gesture={avatarGesture}
            />
        </div>
        
        <div className="flex-shrink-0">
          <TranscriptDisplay transcript={transcript} aiAvatarUrl={currentAvatar.neutral} />
        </div>
      </main>

      <footer className="flex-shrink-0 mt-4">
        <Controls 
            isSessionActive={isSessionActive}
            isGeneratingFeedback={isGeneratingFeedback}
            onToggleSession={handleToggleSession} 
            statusText={statusText}
            onShowHistory={handleShowHistory}
        />
      </footer>

      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={handleCloseHistory}
        conversations={savedConversations}
        selectedConversation={selectedConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />
    </div>
  );
};

export default VoiceCoach;