
import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '../types';

interface TranscriptDisplayProps {
  transcript: TranscriptEntry[];
  aiAvatarUrl: string;
  containerClassName?: string;
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({ transcript, aiAvatarUrl, containerClassName }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  return (
    <div className={containerClassName || "flex-grow bg-gray-800 bg-opacity-50 rounded-2xl p-6 h-48 overflow-y-auto custom-scrollbar"}>
      <div className="flex flex-col space-y-4">
        {transcript.map((entry, index) => (
          <div key={index} className={`flex items-start gap-3 ${entry.speaker === 'You' ? 'justify-end' : 'justify-start'}`}>
            {entry.speaker === 'AI' && (
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src={aiAvatarUrl} alt="AI icon" className="w-full h-full object-cover" />
              </div>
            )}
            <div className={`max-w-md p-3 rounded-xl ${entry.speaker === 'You' ? 'bg-blue-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none'} ${!entry.isFinal ? 'opacity-70' : ''}`}>
              <p className="text-white">{entry.text}</p>
            </div>
            {entry.speaker === 'You' && (
               <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-user text-white"></i>
              </div>
            )}
          </div>
        ))}
        <div ref={endOfMessagesRef} />
      </div>
       <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(107, 114, 128, 0.5);
          border-radius: 20px;
          border: 3px solid transparent;
        }
      `}</style>
    </div>
  );
};

export default TranscriptDisplay;
