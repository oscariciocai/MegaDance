import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Radio, Activity, AlertCircle, RefreshCw, Music, Zap, Download, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const MAIN_STREAM = 'https://streaming01.radiosenlinea.com.ar/9794/stream';
const BACKUP_STREAM = 'https://stream.zeno.fm/ntefh51vrzzuv';

type StreamSource = 'main' | 'backup';
type StreamStatus = 'online' | 'offline' | 'checking';

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStream, setActiveStream] = useState<StreamSource>('main');
  const [mainStatus, setMainStatus] = useState<StreamStatus>('checking');
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [songInfo, setSongInfo] = useState<string>('');
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const LOGO_URL = 'https://megadance.com.ar/img/Icono.png';

  // PWA Install Prompt Logic
  useEffect(() => {
    // Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // Detect Iframe
    setIsInIframe(window.self !== window.top);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('PWA: beforeinstallprompt event fired');
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      console.log('PWA: App was installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleShare = async () => {
    const text = songInfo ? `Escuchando: ${cleanSongInfo(songInfo)} en Mega Dance Radio` : 'Escuchando Mega Dance Radio - Transmisión en vivo';
    const url = window.location.origin;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mega Dance Radio',
          text: text,
          url: url,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(`${text} ${url}`);
      alert('Enlace de transmisión copiado al portapapeles');
    }
  };

  const cleanSongInfo = (text: string) => {
    if (!text) return '';
    // Remove everything in parentheses and brackets
    let cleaned = text.replace(/\s*[\(\[][^\]\)]*[\)\]]/g, '');
    // Split by dash and take artist - title only (first two segments)
    const segments = cleaned.split('-').map(s => s.trim());
    if (segments.length >= 2) {
      return `${segments[0]} - ${segments[1]}`;
    }
    return cleaned;
  };

  // iTunes Artwork Search
  const fetchiTunesArtwork = async (term: string) => {
    const searchTerms = cleanSongInfo(term);
    if (!searchTerms || searchTerms.toLowerCase().includes('megadance')) {
      setArtworkUrl(null);
      return;
    }
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerms)}&media=music&limit=1`);
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        // Change size to 600x600 for high quality
        setArtworkUrl(data.results[0].artworkUrl100.replace('100x100', '600x600'));
      } else {
        setArtworkUrl(null);
      }
    } catch (e) {
      setArtworkUrl(null);
    }
  };

  // Trigger artwork search when song changes
  useEffect(() => {
    if (songInfo) {
      fetchiTunesArtwork(songInfo);
    } else {
      setArtworkUrl(null);
    }
  }, [songInfo]);

  // Metadata Fetcher (Polling)
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        if (activeStream === 'main') {
          const res = await fetch('https://streaming01.radiosenlinea.com.ar/cp/get_info.php?p=9794');
          if (!res.ok) throw new Error('Network response was not ok');
          const data = await res.json();
          
          const newSong = data.title || data.now_playing?.song || '';
          if (newSong && newSong !== songInfo) {
            setSongInfo(newSong);
          }
        } else {
          setSongInfo('');
        }
      } catch (e) {
        console.error('Metadata fetch error:', e);
      }
    };

    fetchMetadata();
    const interval = setInterval(fetchMetadata, 15000);
    return () => clearInterval(interval);
  }, [activeStream, songInfo]);

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = 'anonymous';
    
    // Cleanup
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Main Stream Checker
  const checkMainStream = useCallback(async () => {
    try {
      // Streams often don't allow CORS HEAD, so we use a probe with an audio element
      return new Promise<boolean>((resolve) => {
        const tempTester = new Audio();
        tempTester.muted = true;
        
        const timeout = setTimeout(() => {
          cleanup();
          resolve(false);
        }, 10000);

        const cleanup = () => {
          clearTimeout(timeout);
          tempTester.removeEventListener('canplay', onCanPlay);
          tempTester.removeEventListener('error', onError);
          tempTester.pause();
          tempTester.src = '';
        };

        const onCanPlay = () => {
          cleanup();
          resolve(true);
        };

        const onError = () => {
          cleanup();
          resolve(false);
        };

        tempTester.addEventListener('canplay', onCanPlay);
        tempTester.addEventListener('error', onError);
        tempTester.src = MAIN_STREAM;
        tempTester.load();
      });
    } catch (e) {
      return false;
    }
  }, []);

  // Periodic status monitoring
  useEffect(() => {
    const monitor = async () => {
      const isOnline = await checkMainStream();
      setMainStatus(isOnline ? 'online' : 'offline');

      // Failover Logic: If main failed and we are trying to play main
      if (!isOnline && activeStream === 'main' && isPlaying) {
        console.log('Main stream failed, switching to backup...');
        setActiveStream('backup');
      }

      // Recovery Logic: If main back online and we are playing backup
      if (isOnline && activeStream === 'backup' && isPlaying) {
        console.log('Main stream back online, returning from backup...');
        setActiveStream('main');
      }
    };

    monitor();
    const interval = setInterval(monitor, 45000); // Check every 45s to avoid too much overhead
    return () => clearInterval(interval);
  }, [activeStream, isPlaying, checkMainStream]);

  // Manage Playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let isEffectActive = true;

    const handlePlayback = async () => {
      try {
        if (isPlaying) {
          const source = activeStream === 'main' ? MAIN_STREAM : BACKUP_STREAM;
          
          if (audio.src !== source) {
            audio.pause();
            audio.src = source;
            audio.load();
          }

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            await playPromise;
            // After resolving, if we've since paused, handle it
            if (!isEffectActive || !isPlaying) {
              audio.pause();
            }
          }
        } else {
          audio.pause();
        }
      } catch (error: any) {
        if (isEffectActive && error.name !== 'AbortError') {
          console.error("Playback error:", error);
          if (activeStream === 'main') {
            setActiveStream('backup');
          }
        }
      }
    };

    handlePlayback();

    return () => {
      isEffectActive = false;
    };
  }, [isPlaying, activeStream]);

  // Handle stream errors during playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleError = () => {
      console.log('Audio error detected');
      if (activeStream === 'main') {
        setMainStatus('offline');
        setActiveStream('backup');
      }
    };

    audio.addEventListener('error', handleError);
    return () => audio.removeEventListener('error', handleError);
  }, [activeStream]);

  const currentSongDisplay = cleanSongInfo(songInfo);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const toggleMute = () => setIsMuted(!isMuted);

  return (
    <div className="min-h-screen flex items-center justify-center bg-mega-black relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={artworkUrl || 'default-bg'}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 0.6, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <img 
              src={artworkUrl || LOGO_URL}
              alt="Dynamic Background"
              className={`w-full h-full object-cover transition-all duration-[2000ms] ${artworkUrl ? 'blur-[60px]' : 'blur-[40px]'}`}
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-mega-black/40 backdrop-brightness-90"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-mega-black/20 via-transparent to-mega-black/80"></div>
      </div>

      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-mega-pink/10 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[50vw] h-[50vw] bg-mega-purple/10 rounded-full blur-[150px] animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-screen flex flex-col relative z-10"
      >
        {/* Top Header */}
        <div className="p-6 flex justify-between items-center bg-white/5 backdrop-blur-md border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${mainStatus === 'online' ? 'bg-green-500 shadow-[0_0_12px_#22c55e]' : mainStatus === 'offline' ? 'bg-red-500 shadow-[0_0_12px_#ef4444]' : 'bg-yellow-500 animate-pulse'}`}></div>
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-white/70 font-display">
              {mainStatus === 'online' ? 'En Vivo - Señal Digital' : mainStatus === 'offline' ? 'Modo Respaldo Activo' : 'Sincronizando...'}
            </span>
          </div>
          
          <AnimatePresence>
            {deferredPrompt && (
              <motion.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onClick={handleInstallClick}
                className="flex items-center gap-2 px-3 py-1.5 bg-mega-pink/20 hover:bg-mega-pink/30 border border-mega-pink/30 rounded-full text-[10px] font-black uppercase tracking-widest text-white transition-all neon-glow"
              >
                <Download className="w-3.5 h-3.5" />
                Instalar Ahora
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="relative mb-12 w-full max-w-[320px] sm:max-w-[440px]">
            <div className="absolute -inset-10 bg-mega-pink/10 rounded-3xl blur-[80px] animate-pulse-slow"></div>
            <div className="relative aspect-square rounded-3xl border-2 border-white/10 overflow-hidden bg-black/40 backdrop-blur-md shadow-2xl flex items-center justify-center">
              <AnimatePresence mode="wait">
                {artworkUrl ? (
                  <motion.div
                    key={artworkUrl}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full h-full"
                  >
                    <img 
                      src={artworkUrl} 
                      alt="Cover Art" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="fallback-logo"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full h-full flex items-center justify-center p-16 sm:p-20 bg-mega-black/40"
                  >
                    <img 
                      src={LOGO_URL} 
                      alt="Mega Dance Logo" 
                      className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(255,0,255,0.5)]"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="text-center max-w-xl">
            <AnimatePresence mode="wait">
              {isPlaying && currentSongDisplay ? (
                <motion.div
                  key={currentSongDisplay}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center"
                >
                  <p className="text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-sm">
                    {currentSongDisplay}
                  </p>
                  <p className="text-xs uppercase tracking-[0.4em] text-mega-pink mt-2 font-black">Escuchando Ahora</p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center"
                >
                  <p className="text-lg sm:text-xl text-white/40 font-bold tracking-[0.2em] uppercase">
                    Mega Dance Radio
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="p-8 sm:p-12 bg-gradient-to-t from-black/60 to-transparent backdrop-blur-sm mt-auto">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 md:gap-16">
            
            {/* Play Button Container */}
            <div className="flex items-center gap-8">
              <button 
                onClick={() => {
                  setMainStatus('checking');
                  checkMainStream().then(isOnline => setMainStatus(isOnline ? 'online' : 'offline'));
                }}
                className="p-4 text-white/30 hover:text-white transition-colors hover:bg-white/5 rounded-full"
                title="Actualizar estado"
              >
                <RefreshCw className={`w-6 h-6 ${mainStatus === 'checking' ? 'animate-spin' : ''}`} />
              </button>
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={togglePlay}
                className={`size-24 sm:size-28 rounded-full flex items-center justify-center text-white neon-glow shadow-2xl transition-all duration-500 ${
                  isPlaying 
                    ? 'bg-mega-pink shadow-[0_0_50px_rgba(255,0,255,0.5)] scale-105' 
                    : 'bg-white/5 hover:bg-white/10 border-2 border-white/10'
                }`}
              >
                {isPlaying ? <Pause fill="white" className="w-10 h-10" /> : <Play fill="white" className="w-10 h-10 ml-2" />}
              </motion.button>

              <motion.button 
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.9 }}
                onClick={handleShare}
                className="p-4 text-white/30 hover:text-mega-cyan transition-colors rounded-full"
                title="Compartir"
              >
                <Share2 className="w-6 h-6" />
              </motion.button>
            </div>

            {/* Volume Panel Full Width on Mobile */}
            <div className="w-full md:w-80 flex items-center gap-6 bg-white/5 backdrop-blur-xl rounded-3xl p-5 border border-white/5">
              <button 
                onClick={toggleMute}
                className="text-white/60 hover:text-mega-cyan transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </button>
              <div className="flex-1 h-2 bg-white/10 rounded-full relative overflow-hidden group cursor-pointer">
                <div 
                  className="absolute inset-0 h-full bg-gradient-to-r from-mega-cyan to-mega-purple transition-all duration-300" 
                  style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                />
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                />
              </div>
              <span className="text-xs font-mono text-white/40 w-10 text-right font-bold">{Math.round(volume * 100)}%</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Static Visual Accents */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-mega-pink via-mega-cyan to-mega-purple opacity-30"></div>
      
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}
