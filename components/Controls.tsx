'use client';

import React from 'react';

interface ControlsProps {
  isSessionActive: boolean;
  isGeneratingFeedback: boolean;
  onToggleSession: () => void;
  onShowHistory: () => void;
  statusText: string;
}

const Controls: React.FC<ControlsProps> = ({ isSessionActive, isGeneratingFeedback, onToggleSession, onShowHistory, statusText }) => {
  const isBusy = isSessionActive || isGeneratingFeedback;
  
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="flex items-center space-x-8">
        <button
          onClick={onShowHistory}
          disabled={isBusy}
          className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-600 text-white font-bold text-lg shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 hover:bg-gray-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          title="View History"
        >
          <i className="fas fa-history"></i>
        </button>
        <button
          onClick={onToggleSession}
          disabled={isGeneratingFeedback}
          className={`relative flex items-center justify-center w-20 h-20 rounded-full text-white font-bold text-lg shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none ${
            isSessionActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isGeneratingFeedback ? (
            <i className="fas fa-spinner fa-spin"></i>
          ) : (
            <i className={`fas ${isSessionActive ? 'fa-stop' : 'fa-play'}`}></i>
          )}
          <span className={`absolute w-full h-full rounded-full ${isSessionActive ? 'animate-ping bg-red-500 opacity-75' : ''}`}></span>
        </button>
        <div className="w-16 h-16"></div>
      </div>
      <p className="mt-4 text-gray-400 text-sm tracking-wide">{statusText}</p>
    </div>
  );
};

export default Controls;