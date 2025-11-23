'use client';

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
        {transcript.map((entry, index) => {
          const isLive = !entry.isFinal;
          // Apply distinct styling for text currently being spoken/generated
          const textColorClass = isLive 
            ? (entry.speaker === 'You' ? 'text-green-300 font-medium shadow-green-900/50 drop-shadow-sm' : 'text-blue-300 font-medium shadow-blue-900/50 drop-shadow-sm')
            : 'text-white';

          return (
            <div key={index} className={`flex items-start gap-3 ${entry.speaker === 'You' ? 'justify-end' : 'justify-start'}`}>
              {entry.speaker === 'AI' && (
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg">
                  <img src={aiAvatarUrl} alt="AI icon" className="w-full h-full object-cover" />
                </div>
              )}
              <div className={`max-w-md p-3 rounded-xl transition-all duration-300 relative ${
                  entry.speaker === 'You' 
                    ? 'bg-blue-600/80 rounded-br-none' 
                    : 'bg-gray-700/80 rounded-bl-none'
                } ${isLive ? 'ring-2 ring-opacity-50 ' + (entry.speaker === 'You' ? 'ring-green-400' : 'ring-blue-400') : ''}`}>
                
                <p className={`${textColorClass} leading-relaxed whitespace-pre-wrap`}>
                  {entry.text}
                  {isLive && (
                    <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-current animate-blink rounded-full opacity-75"></span>
                  )}
                </p>
              </div>
              {entry.speaker === 'You' && (
                 <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <i className="fas fa-user text-white"></i>
                </div>
              )}
            </div>
          );
        })}
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
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 0.8s infinite;
        }
      `}</style>
    </div>
  );
};

export default TranscriptDisplay;