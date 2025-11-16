import React from 'react';

interface VideoPanelProps {
  name: string;
  stream?: MediaStream | null;
  neutralAvatarUrl?: string;
  talkingAvatarUrl?: string;
  isSessionActive: boolean;
  isSpeaking?: boolean;
}

const VideoPanel: React.FC<VideoPanelProps> = ({ name, stream, neutralAvatarUrl, talkingAvatarUrl, isSessionActive, isSpeaking }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  
  const borderColor = isSessionActive ? (isSpeaking ? 'border-yellow-400' : 'border-green-500') : 'border-gray-600';
  const borderAnimation = isSessionActive && isSpeaking ? 'animate-pulse-border' : '';

  return (
    <div className={`relative flex-1 bg-black rounded-2xl overflow-hidden shadow-2xl border-4 ${borderColor} ${borderAnimation} transition-all duration-300`}>
      <div className="absolute top-4 left-4 bg-black bg-opacity-60 px-4 py-1 rounded-full z-10">
        <p className="text-white font-semibold">{name}</p>
      </div>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={name === 'You'}
          className="w-full h-full object-cover transform scale-x-[-1]"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800">
          <img 
            src={isSpeaking && talkingAvatarUrl ? talkingAvatarUrl : neutralAvatarUrl} 
            alt="AI Avatar" 
            className={`w-full h-full object-cover transition-all duration-200 ${isSpeaking ? 'talking-animation' : ''}`} 
          />
        </div>
      )}
       <style>{`
        @keyframes talking-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        .talking-animation {
          animation: talking-pulse 0.8s ease-in-out infinite;
        }

        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0px rgba(250, 204, 21, 0.5); }
          50% { box-shadow: 0 0 0 6px rgba(250, 204, 21, 0); }
        }
        .animate-pulse-border {
          animation: pulse-border 1.5s infinite;
        }
      `}</style>
    </div>
  );
};

export default VideoPanel;
