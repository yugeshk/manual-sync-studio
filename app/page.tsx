"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Play, Pause, Download, Upload, RefreshCw, Type, Undo2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Word = {
  id: number;
  text: string;
  time: number | null; // Start time
  endTime: number | null; // Explicit end time (optional)
};

export default function SyncStudio() {
  // --- State ---
  const [scriptText, setScriptText] = useState<string>(
    "बुल्लेह शाह एक सूफी संत और कवि थे, जिन्होंने प्रेम को पूजा और गुरु को खुदा माना।\nयह नाटक उनके जीवन की घटनाओं और पत्रों से प्रेरित एक काल्पनिक रचना है।\nकार्यक्रम के निर्माता पूर्ण ऐतिहासिक प्रामाणिकता का दावा नहीं करते।\nकुछ पात्रों, घटनाओं और संवादों को कहानी की नाटकीयता के लिए बदला गया है。"
  );
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [syncIndex, setSyncIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [isRendering, setIsRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"highlight" | "typing" | "smooth">("highlight");
  const [selectedFont, setSelectedFont] = useState<string>("DevanagariMT");

  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const wordPlayEndTime = useRef<number | null>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // --- Initialization Logic ---
  const initializeWords = useCallback(() => {
    const rawWords = scriptText.trim().split(/\s+/);
    const newWords = rawWords.map((w, i) => ({
      id: i,
      text: w,
      time: null,
      endTime: null,
    }));
    setWords(newWords);
    setSyncIndex(0);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [scriptText]);

  // Only initialize words on first mount
  useEffect(() => {
    if (!hasInitialized.current) {
      initializeWords();
      hasInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  // --- Event Handlers ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioSrc(url);
      setVideoUrl(null);
    }
  };

  const handleJSONUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsedData = JSON.parse(content);

          if (parsedData.text && parsedData.words) {
            setScriptText(parsedData.text);
            const newWords = parsedData.words.map((w: any, i: number) => ({
                id: i,
                // Support both 'word' (old format) and 'text' (new format)
                text: w.word || w.text,
                // Keep time as-is if it's a number (including 0), otherwise null
                time: typeof w.time === 'number' ? w.time : null,
                endTime: typeof w.endTime === 'number' ? w.endTime : null
            }));
            setWords(newWords);
            setSyncIndex(0);
            setCurrentTime(0);
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
            }
            alert("Timestamps loaded successfully!");
          } else {
            alert("Invalid JSON structure. Expected 'text' and 'words' properties.");
          }
        } catch (error) {
          console.error("Error parsing JSON: ", error);
          alert("Failed to load JSON file.");
        }
      };
      reader.readAsText(file);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      wordPlayEndTime.current = null;
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seekAudio = (delta: number) => {
    if (!audioRef.current) return;
    const newTime = Math.max(0, Math.min(audioRef.current.currentTime + delta, audioRef.current.duration || 0));
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    // Clear word play mode when manually seeking
    wordPlayEndTime.current = null;
  };

  const playWord = (wordIndex: number) => {
    if (!audioRef.current || wordIndex >= words.length) return;
    const word = words[wordIndex];
    if (word.time === null) return;

    // Calculate end time
    let endTime: number;
    if (word.endTime !== null) {
      endTime = word.endTime;
    } else if (wordIndex < words.length - 1 && words[wordIndex + 1].time !== null) {
      endTime = words[wordIndex + 1].time!;
    } else {
      endTime = word.time + 0.5; // Default 0.5s if no end time
    }

    // Set up word play mode
    wordPlayEndTime.current = endTime;
    audioRef.current.currentTime = word.time;
    audioRef.current.play();
    setIsPlaying(true);
    setSyncIndex(wordIndex);
  };

  const recordTimestamp = () => {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    
    setWords(prev => {
      const newWords = [...prev];
      if (syncIndex < newWords.length) {
        newWords[syncIndex].time = time;
      }
      return newWords;
    });
    
    setSyncIndex(prev => Math.min(prev + 1, words.length));
  };

  const undoLastTimestamp = () => {
    if (syncIndex > 0) {
      setWords(prev => {
        const newWords = [...prev];
        newWords[syncIndex - 1].time = null;
        return newWords;
      });
      setSyncIndex(prev => prev - 1);
      if (audioRef.current) {
          audioRef.current.currentTime = words[syncIndex - 2]?.time || 0;
      }
    } else if (syncIndex === 0 && words[0]?.time !== null) {
        setWords(prev => {
            const newWords = [...prev];
            newWords[0].time = null;
            return newWords;
        });
    }
  };

  // Global Keydown Listener for Spacebar Syncing and Arrow Key Seeking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Spacebar for syncing
      if (isSyncing && e.code === 'Space') {
        e.preventDefault();
        recordTimestamp();
      }

      // Arrow keys for seeking (when not typing in an input)
      if (!isSyncing && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        if (e.code === 'ArrowLeft') {
          e.preventDefault();
          if (e.shiftKey) {
            seekAudio(-1); // Shift+Left: 1s back
          } else {
            seekAudio(-0.1); // Left: 0.1s back
          }
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          if (e.shiftKey) {
            seekAudio(1); // Shift+Right: 1s forward
          } else {
            seekAudio(0.1); // Right: 0.1s forward
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSyncing, syncIndex, words]);


  const handleExportJSON = () => {
    if (!words.length) return;
    const data = {
        text: scriptText,
        words: words.map(w => ({
            word: w.text,
            time: w.time || 0,
            endTime: w.endTime || null
        }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timestamps.json';
    a.click();
    URL.revokeObjectURL(url);
  };


  // Sync update loop for current time display
  useEffect(() => {
    let raf: number;
    const updateTime = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      raf = requestAnimationFrame(updateTime);
    };
    updateTime();
    return () => cancelAnimationFrame(raf);
  }, []);

  // Word playback control - use timeupdate event for precise stopping
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (wordPlayEndTime.current !== null) {
        // Check if we've reached or passed the end time
        if (audio.currentTime >= wordPlayEndTime.current - 0.01) {
          audio.pause();
          setIsPlaying(false);
          wordPlayEndTime.current = null;
        }
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [audioSrc]); // Re-run when audio source changes


  // Helper function to calculate visible character count at a given time
  const getVisibleCharsAtTime = (time: number): number => {
    if (!words.length) return 0;

    let currentWordIndex = -1;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.time !== null && w.time <= time) {
        currentWordIndex = i;
      } else {
        break;
      }
    }

    if (currentWordIndex === -1) return 0;

    const currentWord = words[currentWordIndex];
    if (!currentWord) return 0;

    const startTime = currentWord.time || 0;
    let endTime = 0;

    if (currentWord.endTime !== null) {
      endTime = currentWord.endTime;
    } else if (currentWordIndex < words.length - 1 && words[currentWordIndex + 1].time !== null) {
      endTime = words[currentWordIndex + 1].time!;
    } else {
      endTime = startTime + 0.5;
    }

    endTime = Math.max(endTime, startTime + 0.05);
    const duration = Math.max(endTime - startTime, 0.01);
    const progress = Math.min(Math.max((time - startTime) / duration, 0), 1);

    const wordLen = currentWord.text.length;
    const charsRevealed = Math.floor(progress * wordLen);

    let total = 0;
    for (let i = 0; i < currentWordIndex; i++) {
      total += words[i].text.length + 1;
    }
    total += charsRevealed;

    return total;
  };

  // --- Generation Logic (Canvas-Based Recording) ---
  const handleGenerateVideo = async () => {
    if (!audioSrc || !words.length || !audioRef.current) {
      alert("Please upload audio and script first.");
      return;
    }
    const hasUntimedWords = words.some(w => w.time === null);
    if (hasUntimedWords && !confirm("Some words are not timed. Continue with generation? Untimed words will use interpolated timings.")) {
      return;
    }

    setIsRendering(true);
    setVideoUrl(null);
    recordedChunksRef.current = [];

    try {
      // Set up canvas dimensions based on aspect ratio
      let width = 1920, height = 1080;
      if (aspectRatio === "9:16") {
        width = 1080;
        height = 1920;
      } else if (aspectRatio === "1:1") {
        width = 1080;
        height = 1080;
      }

      // Create offscreen canvas for rendering
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      renderCanvasRef.current = canvas;

      // Get audio duration
      const audioDuration = audioRef.current.duration;
      const fps = 30;

      // Clone audio element to avoid "already connected" error
      const audioClone = new Audio(audioSrc);
      audioClone.load();
      await new Promise(resolve => audioClone.onloadedmetadata = resolve);

      // Set up audio stream
      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(audioClone);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.connect(audioContext.destination);

      // Capture canvas stream
      const canvasStream = canvas.captureStream(fps);

      // Combine streams
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ]);

      // Set up recorder
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 8000000
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        setIsRendering(false);

        // Download
        const a = document.createElement('a');
        a.href = url;
        a.download = `disclaimer-${Date.now()}.webm`;
        a.click();
      };

      // Start recording
      recorder.start(100);
      mediaRecorderRef.current = recorder;

      // Start both audio playbacks - original for preview, clone for recording
      audioRef.current.currentTime = 0;
      audioClone.currentTime = 0;

      // Play both in sync
      await Promise.all([
        audioRef.current.play(),
        audioClone.play()
      ]);
      setIsPlaying(true);

      // Render loop
      const fullText = words.map(w => w.text).join(" ");

      const render = () => {
        const audioTime = audioClone.currentTime;

        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Draw DISCLAIMER title
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${width * 0.06}px Avenir, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('DISCLAIMER', width / 2, height * 0.18);

        // Calculate visible characters
        const visibleChars = getVisibleCharsAtTime(audioTime);
        const visibleText = fullText.slice(0, visibleChars);

        ctx.font = `${width * 0.024}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Word wrap the FULL text to get correct layout
        const maxWidth = width * 0.8;
        const lineHeight = width * 0.035;
        const allWords = fullText.split(' ');
        let line = '';
        const allLines: string[] = [];

        for (let i = 0; i < allWords.length; i++) {
          const testLine = line + allWords[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            allLines.push(line);
            line = allWords[i] + ' ';
          } else {
            line = testLine;
          }
        }
        allLines.push(line);

        // Now figure out which lines and partial content to show
        let charCount = 0;
        const linesToRender: { text: string; visible: boolean; partialChars?: number }[] = [];

        for (const fullLine of allLines) {
          const lineLength = fullLine.length;

          if (charCount + lineLength <= visibleChars) {
            // Entire line is visible
            linesToRender.push({ text: fullLine, visible: true });
            charCount += lineLength;
          } else if (charCount < visibleChars) {
            // Partial line is visible
            const charsToShow = visibleChars - charCount;
            linesToRender.push({ text: fullLine, visible: true, partialChars: charsToShow });
            charCount += lineLength;
          } else {
            // Line is not visible yet - but we still track it for layout
            linesToRender.push({ text: fullLine, visible: false });
            charCount += lineLength;
          }
        }

        // Center vertically based on total lines
        let y = height / 2 - (allLines.length * lineHeight) / 2;

        // Render each line
        linesToRender.forEach((lineInfo, i) => {
          if (lineInfo.visible) {
            const textToRender = lineInfo.partialChars !== undefined
              ? lineInfo.text.slice(0, lineInfo.partialChars)
              : lineInfo.text;

            // Measure the FULL line to get proper centering
            const fullLineWidth = ctx.measureText(lineInfo.text.trim()).width;
            const xStart = (width - fullLineWidth) / 2;

            // Draw text left-aligned from the calculated start position
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(textToRender, xStart, y + i * lineHeight);
          }
        });

        // Continue rendering if audio is still playing
        if (audioTime < audioDuration) {
          requestAnimationFrame(render);
        }
      };

      render();

      // Stop recording when audio ends
      audioClone.onended = () => {
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            recorder.stop();
          }
          setIsPlaying(false);
          audioContext.close();

          // Also stop the original audio
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        }, 500);
      };

      // Also handle if original audio ends first
      audioRef.current.onended = () => {
        audioClone.pause();
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            recorder.stop();
          }
          setIsPlaying(false);
          audioContext.close();
        }, 500);
      };

    } catch (e: any) {
      console.error(e);
      alert('Failed to generate video: ' + (e.message || 'Unknown error'));
      setIsRendering(false);
    }
  };

  // Helper for preview sizing
  const getPreviewPadding = useCallback(() => {
      switch (aspectRatio) {
          case "16:9": return "pt-[56.25%]";
          case "9:16": return "pt-[177.78%]";
          case "1:1": return "pt-[100%]";
          default: return "pt-[56.25%]";
      }
  }, [aspectRatio]);

  // --- Preview Helper (visibleWordCount) ---
  const visibleWordCount = useMemo(() => {
    if (previewMode !== "highlight") return 0; 

    if (!words.length) return 0;
    
    let count = 0;
    for (const w of words) {
      if (w.time !== null && w.time <= currentTime) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }, [currentTime, words, previewMode]);

  // --- Preview Helper (visibleCharCount) ---
  const visibleCharCount = useMemo(() => {
    if (previewMode !== "typing" && previewMode !== "smooth") return 0;
    
    if (!words.length) return 0;
    
    let currentWordIndex = -1;
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (w.time !== null && w.time <= currentTime) {
            currentWordIndex = i;
        } else {
            break;
        }
    }
    
    if (currentWordIndex === -1) return 0;
    
    const currentWord = words[currentWordIndex];
    if (!currentWord) return 0; // Safety check
    
    const startTime = currentWord.time || 0;
    
    // Determine End Time: Explicit > Next Word > Fallback
    let endTime = 0;
    if (currentWord.endTime !== null) {
        endTime = currentWord.endTime;
    } else {
        if (currentWordIndex < words.length - 1) {
            endTime = words[currentWordIndex + 1].time || (startTime + 0.5);
        } else {
            endTime = Math.min(startTime + 0.5, audioRef.current?.duration || (startTime + 0.5));
        }
    }
    
    // If explicit end time is LESS than start time (user error), clamp it
    endTime = Math.max(endTime, startTime + 0.05);

    const duration = Math.max(endTime - startTime, 0.01);
    const progress = Math.min(Math.max((currentTime - startTime) / duration, 0), 1);
    
    const wordLen = currentWord.text.length;
    const charsRevealed = Math.floor(progress * wordLen);
    
    let total = 0;
    for (let i = 0; i < currentWordIndex; i++) {
        total += words[i].text.length + 1;
    }
    total += charsRevealed;
    
    return total;
  }, [currentTime, words, previewMode, audioRef]);


  return (
    <div className="h-screen bg-neutral-950 text-white font-sans p-4 flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
          <Type className="w-5 h-5 text-blue-500" />
          SyncStudio
        </h1>
        <div className="flex gap-2">
           <label className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-md flex items-center gap-2 text-xs transition-colors cursor-pointer">
              <Upload className="w-3 h-3" /> Upload JSON
              <input type="file" accept=".json" onChange={handleJSONUpload} className="hidden" />
           </label>
           <button
             onClick={handleExportJSON}
             className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-md flex items-center gap-2 text-xs transition-colors"
           >
             <Download className="w-3 h-3" /> Save JSON
           </button>
           <button
            onClick={handleGenerateVideo}
            disabled={isRendering || !audioSrc || !words.length}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-md flex items-center gap-2 text-xs transition-colors font-bold">
            {isRendering ? (
                <>
                    <RefreshCw className="w-3 h-3 animate-spin" /> Rendering...
                </>
            ) : (
                <>
                    <Type className="w-3 h-3" /> Generate Video
                </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden min-h-0">
        
        {/* Left Panel: Controls */}
        <div className="flex flex-col gap-3 lg:col-span-1 overflow-hidden min-h-0">

          {/* 1. Audio Upload */}
          <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800 space-y-2">
            <h2 className="font-semibold text-neutral-400 text-xs uppercase tracking-wider">1. Audio Source</h2>
            <label className="flex items-center gap-2 cursor-pointer bg-neutral-800 hover:bg-neutral-700 p-2 rounded border border-dashed border-neutral-600 transition-colors">
              <Upload className="w-4 h-4 text-neutral-400" />
              <span className="text-xs text-neutral-300">
                {audioSrc ? "Audio Loaded" : "Click to Upload Audio"}
              </span>
              <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
            </label>
            <audio ref={audioRef} src={audioSrc || undefined} onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
          </div>

          {/* 2. Script Input */}
          <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800 flex flex-col min-h-0" style={{height: '20vh'}}>
             <div className="flex justify-between items-center mb-2">
                <h2 className="font-semibold text-neutral-400 text-xs uppercase tracking-wider">2. Script</h2>
                <button onClick={initializeWords} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
             </div>
             <textarea
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-300 font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none resize-none min-h-0"
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="Paste your script here..."
             />
          </div>

          {/* Timestamps Editor */}
          <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800 flex flex-col overflow-hidden min-h-0 flex-1">
              <div className="flex justify-between items-center pb-2 border-b border-neutral-800 mb-2">
                <h2 className="font-semibold text-neutral-400 text-xs uppercase tracking-wider">Timestamps</h2>
                <div className="grid grid-cols-4 gap-2 text-[10px] text-neutral-500 uppercase font-bold w-[60%] text-center pr-8">
                    <span className="col-span-2">Start</span>
                    <span className="col-span-2">End</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 pr-2 min-h-0">
                  {words.map((w, i) => (
                      <div key={i} className={cn("grid grid-cols-6 gap-2 items-center text-xs p-1.5 rounded", i === syncIndex ? "bg-blue-900/30" : "hover:bg-neutral-800")}>
                          <span className="col-span-2 truncate text-neutral-300 text-[11px]" title={w.text}>{w.text}</span>

                          {/* Start Time */}
                          <input
                            type="text"
                            inputMode="decimal"
                            className="col-span-1 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-right outline-none focus:border-blue-500 text-[11px]"
                            defaultValue={typeof w.time === 'number' ? w.time.toString() : ""}
                            placeholder="Start"
                            onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val === '') {
                                    setWords(prev => {
                                        const next = [...prev];
                                        next[i].time = null;
                                        return next;
                                    });
                                    e.target.value = '';
                                } else {
                                    const parsed = parseFloat(val);
                                    if (!isNaN(parsed)) {
                                        setWords(prev => {
                                            const next = [...prev];
                                            next[i].time = parsed;
                                            return next;
                                        });
                                        e.target.value = parsed.toString();
                                    } else {
                                        // Reset to previous value if invalid
                                        e.target.value = typeof w.time === 'number' ? w.time.toString() : "";
                                    }
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                }
                            }}
                          />

                          {/* End Time */}
                          <input
                            type="text"
                            inputMode="decimal"
                            className="col-span-1 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-right outline-none focus:border-blue-500 text-neutral-400 focus:text-white text-[11px]"
                            defaultValue={typeof w.endTime === 'number' ? w.endTime.toString() : ""}
                            placeholder="Auto"
                            onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val === '') {
                                    setWords(prev => {
                                        const next = [...prev];
                                        next[i].endTime = null;
                                        return next;
                                    });
                                    e.target.value = '';
                                } else {
                                    const parsed = parseFloat(val);
                                    if (!isNaN(parsed)) {
                                        setWords(prev => {
                                            const next = [...prev];
                                            next[i].endTime = parsed;
                                            return next;
                                        });
                                        e.target.value = parsed.toString();
                                    } else {
                                        // Reset to previous value if invalid
                                        e.target.value = typeof w.endTime === 'number' ? w.endTime.toString() : "";
                                    }
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                }
                            }}
                          />

                          <div className="col-span-1 flex justify-end">
                             <button
                                onClick={() => playWord(i)}
                                disabled={w.time === null || !audioSrc}
                                className="p-1 bg-neutral-700 hover:bg-neutral-600 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Play Word"
                              >
                                <Play className="w-3 h-3 text-white" />
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          {/* 3. Sync & Format Controls */}
          <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800 space-y-3">
             {/* Format Controls */}
             <div className="flex justify-between items-center">
                 <h2 className="font-semibold text-neutral-400 text-xs uppercase tracking-wider">3. Format & Sync</h2>
                 <div className="flex gap-2">
                     <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as any)}
                        className="bg-neutral-800 text-white text-xs px-2 py-1 rounded border border-neutral-700 outline-none"
                     >
                         <option value="16:9">16:9</option>
                         <option value="9:16">9:16</option>
                         <option value="1:1">1:1</option>
                     </select>
                     <input
                        type="text"
                        value={selectedFont}
                        onChange={(e) => setSelectedFont(e.target.value)}
                        placeholder="Font (e.g. Avenir)"
                        className="bg-neutral-800 text-white text-xs px-2 py-1 rounded border border-neutral-700 outline-none w-28"
                     />
                 </div>
             </div>

             {/* Preview Mode Toggle */}
             <div className="flex gap-1 bg-neutral-800 p-1 rounded">
                <button
                    onClick={() => setPreviewMode("highlight")}
                    className={cn("flex-1 text-[10px] py-1 rounded transition-colors", previewMode === "highlight" ? "bg-neutral-600 text-white" : "text-neutral-400 hover:text-white")}
                >
                    Highlight
                </button>
                <button
                    onClick={() => setPreviewMode("typing")}
                    className={cn("flex-1 text-[10px] py-1 rounded transition-colors", previewMode === "typing" ? "bg-neutral-600 text-white" : "text-neutral-400 hover:text-white")}
                >
                    Typing
                </button>
                <button
                    onClick={() => setPreviewMode("smooth")}
                    className={cn("flex-1 text-[10px] py-1 rounded transition-colors", previewMode === "smooth" ? "bg-neutral-600 text-white" : "text-neutral-400 hover:text-white")}
                >
                    Smooth
                </button>
             </div>

             {/* Recording UI (Word Preview) - Moved to top */}
             {isSyncing && (
               <div className="text-center p-3 bg-neutral-950 rounded border border-neutral-800 animate-pulse">
                 <p className="text-xs text-neutral-400 mb-1">Press <span className="font-bold text-white bg-neutral-800 px-1 rounded">SPACEBAR</span> for next word</p>
                 <div className="text-2xl font-bold text-blue-500">
                   {words[syncIndex]?.text || "Done"}
                 </div>
                 <p className="text-[10px] text-neutral-500 mt-1">Next Word</p>
               </div>
             )}

             {/* Sync Buttons */}
             <div className="flex gap-2">
               <button
                 onClick={(e) => {
                   e.currentTarget.blur();
                   setIsSyncing(!isSyncing);
                   if (!isSyncing && audioRef.current) { // If starting sync
                       audioRef.current.currentTime = words[syncIndex]?.time || 0; // Rewind to current sync word
                       audioRef.current.play();
                   } else if (isSyncing && audioRef.current) { // If stopping sync
                       audioRef.current.pause();
                   }
                 }}
                 disabled={!audioSrc || !words.length}
                 className={cn(
                   "flex-1 py-2 rounded font-medium transition-all text-xs",
                   isSyncing ? "bg-red-500/20 text-red-400 border border-red-500/50" : "bg-blue-600 hover:bg-blue-500 text-white",
                   (!audioSrc || !words.length) && "opacity-50 cursor-not-allowed"
                 )}
               >
                 {isSyncing ? "STOP RECORDING" : "START RECORDING"}
               </button>
                <button
                    onClick={undoLastTimestamp}
                    disabled={syncIndex === 0 && words[0]?.time === null}
                    className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Undo2 className="w-4 h-4" />
                </button>
             </div>

             {/* Audio Playback Controls */}
             <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
                {/* Seek Controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => seekAudio(-1)}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
                    title="Seek -1s (Shift+Left)"
                  >
                    <ChevronsLeft className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => seekAudio(-0.1)}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
                    title="Seek -0.1s (Left)"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                </div>

                {/* Play/Pause */}
                <button onClick={togglePlay} className="p-2 bg-white text-black rounded-full hover:bg-neutral-200 transition-colors">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                {/* Seek Controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => seekAudio(0.1)}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
                    title="Seek +0.1s (Right)"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => seekAudio(1)}
                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
                    title="Seek +1s (Shift+Right)"
                  >
                    <ChevronsRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                   <input
                      type="range"
                      min={0}
                      max={audioRef.current?.duration || 100}
                      step="0.01"
                      value={currentTime}
                      onChange={(e) => {
                          const newTime = parseFloat(e.target.value);
                          setCurrentTime(newTime);
                          if (audioRef.current) {
                              audioRef.current.currentTime = newTime;
                          }
                          // Clear word play mode when manually seeking with slider
                          wordPlayEndTime.current = null;
                      }}
                      className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                    <span>{currentTime.toFixed(2)}s</span>
                    <span>{audioRef.current?.duration.toFixed(2) || "0.00"}s</span>
                  </div>
                  <div className="text-[9px] text-neutral-600 mt-0.5 text-center">
                    ←/→: 0.1s | Shift+←/→: 1s
                  </div>
                </div>
             </div>
          </div>

        </div>

        {/* Right Panel: Preview */}
        <div className="lg:col-span-2 flex flex-col gap-3 overflow-hidden min-h-0">
          <h2 className="font-semibold text-neutral-400 text-xs uppercase tracking-wider">Preview Canvas ({aspectRatio})</h2>

          <div className={cn("relative w-full bg-black rounded-lg border border-neutral-800 overflow-hidden shadow-2xl transition-all duration-500 flex-1", getPreviewPadding())}>
             {videoUrl ? (
                 <>
                    <video src={videoUrl} controls className="absolute inset-0 w-full h-full object-contain" />
                    <button 
                        onClick={() => setVideoUrl(null)}
                        className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 text-white px-3 py-1 rounded text-xs backdrop-blur-sm z-10">
                        Close Video
                    </button>
                 </>
             ) : (
                 <div ref={previewCanvasRef} className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                    {/* Title Layer */}
                    <div className="absolute top-[12%] text-white text-3xl md:text-5xl font-bold opacity-100" style={{fontFamily: 'Avenir, sans-serif'}}>
                      DISCLAIMER
                    </div>

                    {/* Text Layer */}
                    <div className="w-[80%] h-[60%] flex items-center justify-center">
                       <p className="text-lg md:text-2xl lg:text-3xl leading-relaxed font-serif transition-all duration-75">
                          {previewMode === "typing" ? (
                              // Typing Effect Render - full text with invisible unrevealed characters
                              <>
                                <span className="text-white">
                                    {words.map(w => w.text).join(" ").slice(0, visibleCharCount)}
                                </span>
                                <span className="opacity-0 invisible">
                                    {words.map(w => w.text).join(" ").slice(visibleCharCount)}
                                </span>
                              </>
                          ) : previewMode === "smooth" ? (
                              // Smooth Animation Mode - smooth character reveal
                              <>
                                {words.map(w => w.text).join(" ").split('').map((char, i) => (
                                  <motion.span
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{
                                      opacity: i < visibleCharCount ? 1 : 0,
                                      y: i < visibleCharCount ? 0 : 10
                                    }}
                                    transition={{
                                      duration: 0.3,
                                      ease: "easeOut"
                                    }}
                                    className={i >= visibleCharCount ? "invisible" : ""}
                                  >
                                    {char}
                                  </motion.span>
                                ))}
                              </>
                          ) : (
                              // Highlight Mode Render - full text with invisible unrevealed words
                              words.map((word, i) => (
                                <span
                                  key={i}
                                  className={i < visibleWordCount ? "text-white" : "opacity-0 invisible"}
                                >
                                  {word.text}{" "}
                                </span>
                              ))
                          )}
                       </p>
                    </div>
                    
                    {/* Progress Overlay */}
                    {isSyncing && (
                       <div className="absolute bottom-4 right-4 bg-red-600 text-white text-xs px-2 py-1 rounded animate-pulse">
                         RECORDING
                       </div>
                     )}
                 </div>
             )}
          </div>

          {/* Instructions */}
          <div className="bg-neutral-900/50 p-3 rounded text-xs text-neutral-400">
            <p className="font-semibold text-neutral-300 mb-1 text-xs">Quick Guide:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
              <li>Upload audio & paste script</li>
              <li>Click <strong>START RECORDING</strong> and tap <strong>SPACEBAR</strong> for each word</li>
              <li>Fine-tune timings: type values or use <strong>▶ button</strong> to preview each word</li>
              <li>Use arrow keys (←/→) or seek buttons for precise audio control</li>
              <li>Preview with <strong>Typing Effect</strong> mode</li>
              <li>Click <strong>Generate Video</strong></li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}