'use client';

import React from 'react';

interface VocabularyCardProps {
  word: string;
  definition: string;
}

const VocabularyCard: React.FC<VocabularyCardProps> = ({ word, definition }) => {
  return (
    <div className="bg-gray-800 border-l-4 border-blue-500 rounded-r-lg p-4 shadow-lg animate-fade-in">
      <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Current Word</h3>
      <p className="text-2xl font-bold text-white mt-1">{word}</p>
      <p className="text-gray-300 mt-2">{definition}</p>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default VocabularyCard;