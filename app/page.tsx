import React from 'react';
import VoiceCoach from '../components/VoiceCoach';

export default function Home() {
  const apiKey = process.env.API_KEY || '';

  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-red-500">
        <p className="text-xl font-bold">Error: API_KEY environment variable is not set.</p>
      </div>
    );
  }

  return (
    <main>
      <VoiceCoach apiKey={apiKey} />
    </main>
  );
}