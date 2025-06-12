import { Geist, Geist_Mono } from "next/font/google";
import { useState, useCallback, useEffect } from "react";
import { LufsMeter } from "@/processing/LufsMeter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function useAudioDrop(
  onAudioDecoded: (result: {
    buffers: Float32Array[];
    sampleRate: number;
  }) => void
) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("audio/")) return;

      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new window.AudioContext();
      try {
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        // Use the first channel for simplicity
        const floatArrays = Array.from(
          { length: decoded.numberOfChannels },
          (_, i) => decoded.getChannelData(i)
        );
        onAudioDecoded({
          buffers: floatArrays,
          sampleRate: decoded.sampleRate,
        });
      } catch {
        // Handle decode error
      }
    },
    [onAudioDecoded]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragActive(false), []);

  return {
    dragActive,
    handleDrop,
    handleDragOver,
    handleDragLeave,
  };
}

export default function Home() {
  const [audioData, setAudioData] = useState<{
    buffers: Float32Array[];
    sampleRate: number;
  } | null>(null);
  const { dragActive, handleDrop, handleDragOver, handleDragLeave } =
    useAudioDrop(setAudioData);

  useEffect(() => {
    if (!audioData) {
      return;
    }

    const lufsMeter = new LufsMeter(audioData.sampleRate);
    console.log(lufsMeter.measure(audioData.buffers));
  });
  return (
    <div
      className={`${geistSans.className} ${geistMono.className} grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]`}
    >
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`w-80 h-40 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
            dragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-white"
          }`}
        >
          <span className="text-gray-500">
            {audioData ? "Audio loaded!" : "Drag and drop an audio file here"}
          </span>
        </div>
      </main>
    </div>
  );
}
