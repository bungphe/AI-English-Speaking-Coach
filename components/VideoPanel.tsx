
import React from 'react';

interface VideoPanelProps {
  name: string;
  stream?: MediaStream | null;
  avatarUrl?: string;
  isSessionActive: boolean;
}

const VideoPanel: React.FC<VideoPanelProps> = ({ name, stream, avatarUrl, isSessionActive }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  
  const borderColor = isSessionActive ? 'border-green-500' : 'border-gray-600';

  return (
    <div className={`relative flex-1 bg-black rounded-2xl overflow-hidden shadow-2xl border-2 ${borderColor} transition-all duration-500`}>
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
          <img src={avatarUrl} alt="AI Avatar" className="w-full h-full object-cover" />
          <div className={`absolute w-32 h-32 rounded-full ${isSessionActive ? 'bg-green-500/50 animate-pulse' : 'bg-gray-500/30'}`}></div>
        </div>
      )}
    </div>
  );
};

export default VideoPanel;
