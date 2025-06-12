import { Geist, Geist_Mono } from "next/font/google";
import { useState, useCallback, useEffect } from "react";
import { LufsMeter, LufsMeterResult } from "@/processing/LufsMeter";
import WavesurferPlayer from "@wavesurfer/react";
import { LineChart } from "@mui/x-charts/LineChart";

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
    blob: Blob;
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
      const reader = new FileReader();
      reader.readAsDataURL(file);
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
          blob: file,
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
  const [wavesurfer, setWavesurfer] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const onReady = (ws) => {
    console.log("ready!");
    setWavesurfer(ws);
    setIsPlaying(false);
  };

  const onPlayPause = () => {
    if (wavesurfer) {
      wavesurfer.playPause();
    }
  };

  const [audioData, setAudioData] = useState<{
    buffers: Float32Array[];
    lufsData: LufsMeterResult;
    sampleRate: number;
    blob: Blob;
  } | null>(null);
  const { dragActive, handleDrop, handleDragOver, handleDragLeave } =
    useAudioDrop((audioData) => {
      setAudioData({
        ...audioData,
        lufsData: new LufsMeter(audioData.sampleRate).measure(
          audioData.buffers
        ),
      });

      wavesurfer.loadBlob(audioData?.blob);
    });

  useEffect(() => {
    console.log(audioData);
  });
  return (
    <div
      className={`${geistSans.className} ${geistMono.className} grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]`}
    >
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <div style={{ width: 500 }}>
          <WavesurferPlayer
            height={100}
            waveColor="#4F4A85"
            progressColor="#383351"
            url="/empty.wav"
            onReady={onReady}
            onError={(e) => console.error("Wavesurfer error:", e)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        </div>

        <button onClick={onPlayPause}>{isPlaying ? "Pause" : "Play"}</button>
        {audioData && (
          <>
            <LineChart
              series={[
                {
                  label: "Momentary loudness",
                  data: audioData.lufsData.blockLoudness,
                  showMark: false,
                },
                {
                  label: "Relative gate threshold",
                  data: audioData.lufsData.blockLoudness.map(
                    () => audioData.lufsData.relativeThreshold
                  ),
                  showMark: false,
                },
              ]}
              xAxis={[
                {
                  data: Array.from(
                    audioData.lufsData.blockLoudness.map((_, i) => i * 0.1)
                  ),
                  valueFormatter: (v: number) => {
                    const minutes = Math.floor(v / 60);
                    const seconds = (v % 60).toFixed(0).padStart(2, "0");
                    return `${minutes}:${seconds}`;
                  },
                  // scaleType: "time",
                },
              ]}
              yAxis={[
                {
                  min: -35,
                  max: 0,
                  colorMap: {
                    type: "piecewise",
                    colors: ["#444", "#444 ", "#4254FB"],
                    thresholds: [
                      -1000,
                      audioData.lufsData.relativeThreshold,
                      0,
                    ],
                  },
                },
              ]}
              height={500}
              width={500}
            />
          </>
        )}
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
