
import { SavedConversation } from '../types';

const HISTORY_KEY = 'ai-english-coach-history';

export const getHistory = (): SavedConversation[] => {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error("Failed to load history from localStorage", error);
  }
  return [];
};

export const saveConversation = (conversation: SavedConversation) => {
  try {
    const history = getHistory();
    const updatedHistory = [conversation, ...history];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
  } catch (error) {
    console.error("Failed to save conversation to localStorage", error);
  }
};

export const deleteConversation = (id: string): SavedConversation[] => {
    try {
        const history = getHistory();
        const updatedHistory = history.filter(conv => conv.id !== id);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
        return updatedHistory;
    } catch (error) {
        console.error("Failed to delete conversation from localStorage", error);
        return getHistory();
    }
}
