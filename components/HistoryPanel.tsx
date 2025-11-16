import React from 'react';
import { SavedConversation } from '../types';
import TranscriptDisplay from './TranscriptDisplay';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: SavedConversation[];
  selectedConversation: SavedConversation | null;
  onSelectConversation: (conversation: SavedConversation) => void;
  onDeleteConversation: (id: string) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose, conversations, selectedConversation, onSelectConversation, onDeleteConversation }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl h-full max-h-[80vh] flex flex-col md:flex-row overflow-hidden">
        <div className="w-full md:w-1/3 border-r border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
             <h2 className="text-xl font-bold">History</h2>
             <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <i className="fas fa-times"></i>
             </button>
          </div>
          <div className="flex-grow overflow-y-auto custom-scrollbar">
            {conversations.length === 0 ? (
              <p className="p-4 text-gray-500">No saved conversations.</p>
            ) : (
              <ul>
                {conversations.map((conv) => (
                  <li
                    key={conv.id}
                    onClick={() => onSelectConversation(conv)}
                    className={`p-4 cursor-pointer border-b border-gray-700 hover:bg-gray-700 transition-colors ${selectedConversation?.id === conv.id ? 'bg-green-600/20' : ''}`}
                  >
                    <p className="font-semibold text-white">{new Date(conv.timestamp).toLocaleString()}</p>
                    <p className="text-sm text-gray-400">Coach: {conv.coach.name}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="w-full md:w-2/3 flex flex-col">
          {selectedConversation ? (
            <>
              <div className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                  <div>
                    <h3 className="text-lg font-bold">Conversation Details</h3>
                    <p className="text-sm text-gray-400">{new Date(selectedConversation.timestamp).toLocaleString()}</p>
                  </div>
                  <button onClick={() => onDeleteConversation(selectedConversation.id)} className="text-red-500 hover:text-red-400 transition-colors px-3 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20" title="Delete Conversation">
                      <i className="fas fa-trash"></i> Delete
                  </button>
              </div>
              <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col">
                <div className="p-6">
                    <h4 className="text-lg font-semibold mb-2 text-green-400">Feedback Summary</h4>
                    <div
                        className="prose prose-invert prose-sm bg-gray-900/50 rounded-lg p-4"
                        dangerouslySetInnerHTML={{ __html: selectedConversation.feedback.replace(/\n/g, '<br />') }}
                    />
                </div>
                <div className="p-6 border-t border-gray-700">
                    <h4 className="text-lg font-semibold mb-2 text-blue-400">Full Transcript</h4>
                    <TranscriptDisplay 
                        transcript={selectedConversation.transcript} 
                        aiAvatarUrl={selectedConversation.coach.avatarUrl} 
                        containerClassName="h-auto"
                    />
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">Select a conversation to view.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;
