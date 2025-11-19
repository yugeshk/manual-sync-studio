"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Play, Pause, Download, Upload, RefreshCw, Type, Undo2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  const [previewMode, setPreviewMode] = useState<"highlight" | "typing">("highlight");
  const [selectedFont, setSelectedFont] = useState<string>("DevanagariMT");

  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    initializeWords();
  }, [initializeWords]);

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
                text: w.word,
                time: w.time === 0 ? null : w.time,
                endTime: w.endTime || null
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
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
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

  // Global Keydown Listener for Spacebar Syncing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSyncing && e.code === 'Space') {
        e.preventDefault();
        recordTimestamp();
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


  // --- Generation Logic ---
  const handleGenerateVideo = async () => {
    if (!audioSrc || !words.length) {
      alert("Please upload audio and script first.");
      return;
    }
    const hasUntimedWords = words.some(w => w.time === null);
    if (hasUntimedWords && !confirm("Some words are not timed. Continue with generation? Untimed words will use interpolated timings.")) {
        return;
    }
    
    setIsRendering(true);
    setVideoUrl(null); 
    try {
        const response = await fetch(audioSrc);
        const audioBlob = await response.blob();
        
        const data = {
            text: scriptText,
            words: words.map(w => ({
                word: w.text,
                time: w.time || 0,
                endTime: w.endTime || null
            }))
        };

        let width = 1920;
        let height = 1080;
        if (aspectRatio === "9:16") {
            width = 1080;
            height = 1920;
        } else if (aspectRatio === "1:1") {
            width = 1080;
            height = 1080;
        }
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.m4a');
        formData.append('timestamps', JSON.stringify(data));
        formData.append('width', width.toString());
        formData.append('height', height.toString());
        formData.append('font', selectedFont); 
        
        const res = await fetch('/api/render', {
            method: 'POST',
            body: formData
        });
        
        const result = await res.json();
        
        if (result.success) {
            setVideoUrl(result.videoUrl);
        } else {
            alert('Error: ' + result.error);
        }
    } catch (e: any) {
        console.error(e);
        alert('Failed to generate video: ' + (e.message || 'Unknown error'));
    } finally {
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
    if (previewMode !== "typing") return 0;
    
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
    <div className="min-h-screen bg-neutral-950 text-white font-sans p-6 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-2">
          <Type className="w-6 h-6 text-blue-500" />
          SyncStudio
        </h1>
        <div className="flex gap-2">
           <label className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm transition-colors cursor-pointer">
              <Upload className="w-4 h-4" /> Upload JSON
              <input type="file" accept=".json" onChange={handleJSONUpload} className="hidden" />
           </label>
           <button 
             onClick={handleExportJSON}
             className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm transition-colors"
           >
             <Download className="w-4 h-4" /> Save JSON
           </button>
           <button 
            onClick={handleGenerateVideo}
            disabled={isRendering || !audioSrc || !words.length}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm transition-colors font-bold">
            {isRendering ? (
                <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Rendering...
                </>
            ) : (
                <>
                    <Type className="w-4 h-4" /> Generate Video
                </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Panel: Controls */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          
          {/* 1. Audio Upload */}
          <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 space-y-3">
            <h2 className="font-semibold text-neutral-400 text-sm uppercase tracking-wider">1. Audio Source</h2>
            <label className="flex items-center gap-3 cursor-pointer bg-neutral-800 hover:bg-neutral-700 p-3 rounded border border-dashed border-neutral-600 transition-colors">
              <Upload className="w-5 h-5 text-neutral-400" />
              <span className="text-sm text-neutral-300">
                {audioSrc ? "Audio Loaded" : "Click to Upload Audio"}
              </span>
              <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
            </label>
            <audio ref={audioRef} src={audioSrc} onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
          </div>

          {/* 2. Script Input */}
          <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 space-y-3 flex-1 flex flex-col max-h-[300px]">
             <div className="flex justify-between items-center">
                <h2 className="font-semibold text-neutral-400 text-sm uppercase tracking-wider">2. Script</h2>
                <button onClick={initializeWords} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
             </div>
             <textarea 
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded p-3 text-neutral-300 font-mono text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="Paste your script here..."
             />
          </div>
          
          {/* Timestamps Editor */}
          <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 space-y-3 flex-1 flex flex-col max-h-[300px] overflow-hidden">
              <div className="flex justify-between items-center pb-2 border-b border-neutral-800">
                <h2 className="font-semibold text-neutral-400 text-sm uppercase tracking-wider">Timestamps</h2>
                <div className="grid grid-cols-4 gap-2 text-[10px] text-neutral-500 uppercase font-bold w-[60%] text-center pr-8">
                    <span className="col-span-2">Start</span>
                    <span className="col-span-2">End</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                  {words.map((w, i) => (
                      <div key={i} className={cn("grid grid-cols-6 gap-2 items-center text-xs p-2 rounded", i === syncIndex ? "bg-blue-900/30" : "hover:bg-neutral-800")}>
                          <span className="col-span-2 truncate text-neutral-300" title={w.text}>{w.text}</span>
                          
                          {/* Start Time */}
                          <input 
                            type="number" 
                            step="0.01" 
                            className="col-span-1 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-right outline-none focus:border-blue-500"
                            value={typeof w.time === 'number' ? w.time.toFixed(2) : ""}
                            placeholder="Start"
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setWords(prev => {
                                    const next = [...prev];
                                    next[i].time = isNaN(val) ? null : val;
                                    return next;
                                });
                            }}
                          />

                          {/* End Time */}
                          <input 
                            type="number" 
                            step="0.01" 
                            className="col-span-1 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-right outline-none focus:border-blue-500 text-neutral-400 focus:text-white"
                            value={typeof w.endTime === 'number' ? w.endTime.toFixed(2) : ""}
                            placeholder="Auto"
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setWords(prev => {
                                    const next = [...prev];
                                    next[i].endTime = isNaN(val) ? null : val;
                                    return next;
                                });
                            }}
                          />

                          <div className="col-span-1 flex justify-end">
                             <button 
                                onClick={() => {
                                    if (audioRef.current && w.time !== null) {
                                        audioRef.current.currentTime = w.time;
                                        audioRef.current.play();
                                        setIsPlaying(true);
                                        setSyncIndex(i);
                                    }
                                }}
                                disabled={w.time === null || !audioSrc}
                                className="p-1.5 bg-neutral-700 hover:bg-neutral-600 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 space-y-4">
             {/* Format Controls */}
             <div className="flex justify-between items-center">
                 <h2 className="font-semibold text-neutral-400 text-sm uppercase tracking-wider">3. Format & Sync</h2>
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
                        className="bg-neutral-800 text-white text-xs px-2 py-1 rounded border border-neutral-700 outline-none w-32"
                     />
                 </div>
             </div>
             
             {/* Preview Mode Toggle */}
             <div className="flex gap-2 bg-neutral-800 p-1 rounded">
                <button 
                    onClick={() => setPreviewMode("highlight")}
                    className={cn("flex-1 text-xs py-1 rounded transition-colors", previewMode === "highlight" ? "bg-neutral-600 text-white" : "text-neutral-400 hover:text-white")}
                >
                    Highlight
                </button>
                <button 
                    onClick={() => setPreviewMode("typing")}
                    className={cn("flex-1 text-xs py-1 rounded transition-colors", previewMode === "typing" ? "bg-neutral-600 text-white" : "text-neutral-400 hover:text-white")}
                >
                    Typing Effect
                </button>
             </div>
             
             {/* Recording UI (Word Preview) - Moved to top */}
             {isSyncing && (
               <div className="text-center p-4 bg-neutral-950 rounded border border-neutral-800 animate-pulse">
                 <p className="text-sm text-neutral-400 mb-2">Press <span className="font-bold text-white bg-neutral-800 px-1 rounded">SPACEBAR</span> for next word</p>
                 <div className="text-4xl font-bold text-blue-500">
                   {words[syncIndex]?.text || "Done"}
                 </div>
                 <p className="text-xs text-neutral-500 mt-2">Next Word</p>
               </div>
             )}

             {/* Sync Buttons */}
             <div className="flex gap-3">
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
                   "flex-1 py-3 rounded font-medium transition-all",
                   isSyncing ? "bg-red-500/20 text-red-400 border border-red-500/50" : "bg-blue-600 hover:bg-blue-500 text-white",
                   (!audioSrc || !words.length) && "opacity-50 cursor-not-allowed"
                 )}
               >
                 {isSyncing ? "STOP RECORDING" : "START RECORDING"}
               </button>
                <button
                    onClick={undoLastTimestamp}
                    disabled={syncIndex === 0 && words[0]?.time === null}
                    className="p-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Undo2 className="w-5 h-5" />
                </button>
             </div>
             
             {/* Audio Playback Controls */}
             <div className="flex items-center gap-4 pt-2 border-t border-neutral-800">
                <button onClick={togglePlay} className="p-3 bg-white text-black rounded-full hover:bg-neutral-200 transition-colors">
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <div className="flex-1 flex flex-col justify-center">
                   <input
                      type="range"
                      min={0}
                      max={audioRef.current?.duration || 100}
                      step="0.1"
                      value={currentTime}
                      onChange={(e) => {
                          const newTime = parseFloat(e.target.value);
                          setCurrentTime(newTime);
                          if (audioRef.current) {
                              audioRef.current.currentTime = newTime;
                          }
                      }}
                      className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  <div className="flex justify-between text-xs text-neutral-500 mt-1">
                    <span>{currentTime.toFixed(1)}s</span>
                    <span>{audioRef.current?.duration.toFixed(1) || "0.0"}s</span>
                  </div>
                </div>
             </div>
          </div>

        </div>

        {/* Right Panel: Preview */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <h2 className="font-semibold text-neutral-400 text-sm uppercase tracking-wider">Preview Canvas ({aspectRatio})</h2>
          
          <div className={cn("relative w-full bg-black rounded-lg border border-neutral-800 overflow-hidden shadow-2xl transition-all duration-500", getPreviewPadding())}>
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
                 <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                    {/* Title Layer */}
                    <div className="absolute top-[12%] text-white text-4xl md:text-6xl font-bold opacity-100">
                      DISCLAIMER
                    </div>
    
                    {/* Text Layer */}
                    <div className="w-[80%] h-[60%] flex items-center justify-center">
                       <p className="text-xl md:text-3xl lg:text-4xl leading-relaxed font-serif text-neutral-800 transition-all duration-75">
                          {previewMode === "typing" ? (
                              // Typing Effect Render
                              <>
                                <span className="text-white">
                                    {words.map(w => w.text).join(" ").slice(0, visibleCharCount)}
                                </span>
                                <span className="opacity-0">
                                    {words.map(w => w.text).join(" ").slice(visibleCharCount)}
                                </span>
                              </>
                          ) : (
                              // Highlight Mode Render
                              words.map((word, i) => (
                                <span 
                                  key={i} 
                                  className={cn(
                                    "transition-colors duration-0", 
                                    i < visibleWordCount ? "text-white" : "text-neutral-900" 
                                  )}
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
          {/* ... */}
          <div className="bg-neutral-900/50 p-4 rounded text-sm text-neutral-400">
            <p className="font-semibold text-neutral-300 mb-1">How to use:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Upload your audio file.</li>
              <li>Paste your script.</li>
              <li>Select Aspect Ratio (e.g. 9:16 for Reels).</li>
              <li>Click <strong>START RECORDING</strong>. The audio will play.</li>
              <li>Tap <strong>SPACEBAR</strong> exactly when each word is spoken.</li>
              <li>Use the Timestamps editor to tweak precise timings.</li>
              <li>Switch to <strong>Typing Effect</strong> to preview the animation.</li>
              <li>When finished, click <strong>Generate Video</strong>.</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}