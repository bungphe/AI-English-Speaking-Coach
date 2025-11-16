export interface TranscriptEntry {
  speaker: 'You' | 'AI';
  text: string;
  isFinal: boolean;
}

export interface SavedConversation {
  id: string;
  timestamp: string;
  transcript: TranscriptEntry[];
  coach: {
    name: string;
    avatarUrl: string;
  };
  feedback: string;
}
