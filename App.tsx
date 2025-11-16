import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { getHistory, saveConversation, deleteConversation } from './services/historyService';
import VideoPanel from './components/VideoPanel';
import Controls from './components/Controls';
import TranscriptDisplay from './components/TranscriptDisplay';
import HistoryPanel from './components/HistoryPanel';
import VocabularyCard from './components/VocabularyCard';
import { TranscriptEntry, SavedConversation, VocabularyWord } from './types';

const API_KEY = process.env.API_KEY;

const AVATARS = [
    {
      name: 'Eva',
      neutral: 'https://storage.googleapis.com/aai-web-samples/speak-to-me/images/eva_neutral.png',
      talking: 'https://storage.googleapis.com/aai-web-samples/speak-to-me/images/eva_talking.png',
    },
    {
      name: 'Bot',
      neutral: 'https://storage.googleapis.com/aai-web-samples/speak-to-me/images/bot_neutral.png',
      talking: 'https://storage.googleapis.com/aai-web-samples/speak-to-me/images/bot_talking.png',
    }
  ];

const App: React.FC = () => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [statusText, setStatusText] = useState('Click start to begin');
  const [userStream, setUserStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentAvatar, setCurrentAvatar] = useState(AVATARS[0]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<SavedConversation | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [practiceMode, setPracticeMode] = useState<'conversation' | 'vocabulary'>('conversation');
  const [vocabularyWord, setVocabularyWord] = useState<VocabularyWord | null>(null);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionEndedRef = useRef(false);

  const ai = new GoogleGenAI({ apiKey: API_KEY });

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
        
        const conversationInstruction = `You are ${currentAvatar.name}, a friendly and patient AI English language coach. Your goal is to help me improve my conversational English and pronunciation. We will have a natural conversation. After I finish speaking, please provide brief, constructive feedback on my pronunciation or grammar, highlighting one or two key areas for improvement. Then, continue the conversation by asking a question or making a relevant comment. Keep your feedback encouraging and your responses natural.`
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
    const prompt = `Based on the following conversation transcript between an AI English Coach and a user, please provide a concise "Feedback Summary" for the user. Focus on 1-2 key grammar points and 1-2 pronunciation suggestions they can work on. Frame the feedback to be encouraging and constructive. Format the output in Markdown.\n\nTranscript:\n${finalTranscript.map(t => `${t.speaker}: ${t.text}`).join('\n')}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating feedback:", error);
        return "Could not generate feedback for this session.";
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
  
  useEffect(() => {
    let animationFrameId: number | null = null;
    
    const checkSpeaking = () => {
        if (!isSessionActive || !analyserRef.current) {
            setIsAiSpeaking(false);
            return;
        }

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
        const SPEAKING_THRESHOLD = 1.5;

        setIsAiSpeaking(rms > SPEAKING_THRESHOLD);

        animationFrameId = requestAnimationFrame(checkSpeaking);
    };

    if (isSessionActive) {
        checkSpeaking();
    } else {
        setIsAiSpeaking(false);
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
      <header className="text-center mb-4 relative">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
          AI English Speaking Coach
        </h1>
        <p className="text-gray-400 mt-2">Practice your conversational English with your personal AI tutor.</p>
        <div className="absolute top-0 right-0 flex items-center space-x-2">
            <span className="text-sm text-gray-400 hidden sm:inline">Change Coach:</span>
            {AVATARS.map(avatar => (
                <button
                    key={avatar.name}
                    onClick={() => setCurrentAvatar(avatar)}
                    disabled={isSessionActive || isGeneratingFeedback}
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border-2 transition-all ${currentAvatar.name === avatar.name ? 'border-green-500 scale-110' : 'border-transparent hover:border-gray-500'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={`Select ${avatar.name}`}
                >
                    <img src={avatar.neutral} alt={avatar.name} className="w-full h-full object-cover" />
                </button>
            ))}
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
          <VideoPanel name="You" stream={userStream} isSessionActive={isSessionActive} />
          <VideoPanel 
            name={`AI Coach ${currentAvatar.name}`} 
            neutralAvatarUrl={currentAvatar.neutral}
            talkingAvatarUrl={currentAvatar.talking}
            isSessionActive={isSessionActive}
            isSpeaking={isAiSpeaking}
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

export default App;
