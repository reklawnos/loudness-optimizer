import { useState, useCallback, useEffect } from "react";
import Head from "next/head";
import { LufsMeter, LufsMeterResult } from "@/processing/LufsMeter";
import WavesurferPlayer from "@wavesurfer/react";
import { ChartContainer } from "@mui/x-charts/ChartContainer";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { LinePlot, MarkPlot } from "@mui/x-charts/LineChart";
import { ChartsXAxis } from "@mui/x-charts/ChartsXAxis";
import { ChartsYAxis } from "@mui/x-charts/ChartsYAxis";
import { ChartsTooltip } from "@mui/x-charts/ChartsTooltip";
import { ChartsAxisHighlight } from "@mui/x-charts/ChartsAxisHighlight";
import { LineHighlightPlot } from "@mui/x-charts/LineChart";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
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
    async (e: React.DragEvent<Document>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("audio/")) return;

      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new window.AudioContext({ sampleRate: 48000 });
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

  const handleDragOver = useCallback((e: React.DragEvent<Document>) => {
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
function formatTimeStamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(0).padStart(2, "0");
  return `${m}:${s}`;
}
export default function Home() {
  const [playheadPos, setPlayheadPos] = useState(0);
  const [wavesurfer, setWavesurfer] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const onReady = (ws) => {
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

  const onAxisClick = (e, data) => {
    wavesurfer.seekTo(data.axisValue / wavesurfer.getDuration());
    wavesurfer.play();
    setIsPlaying(true);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        onPlayPause();
      }
    },
    [onPlayPause]
  );

  const onUploadClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.onchange = (e) => {
      handleDrop({
        dataTransfer: { files: e.target.files },
        preventDefault: () => {},
      } as React.DragEvent<Document>);
    };
    input.click();
  }, [handleDrop]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("drop", handleDrop);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("drop", handleDrop);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
    };
  });

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Head>
        <title>LUFS Gating Tool</title>
      </Head>
      <main className="p-10">
        <h1 className="font-bold text-xl mb-4">LUFS Gating Tool</h1>
        <div>
          <div style={{ display: "none" }}>
            <WavesurferPlayer
              height={100}
              waveColor="#4F4A85"
              progressColor="#383351"
              url="/loudness-optimizer/empty.wav"
              onReady={onReady}
              onError={(e) => console.error("Wavesurfer error:", e)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeupdate={(ws) => setPlayheadPos(ws.getCurrentTime())}
            />
          </div>
        </div>
        {!audioData && (
          <div className="flex flex-col items-center justify-center h-screen">
            <button
              className="border focus:outline-none focus:ring-4 font-medium rounded-full text-xl p-10 me-2 mb-2 bg-gray-800 text-white border-gray-600 hover:bg-gray-700 hover:border-gray-600 focus:ring-gray-700 min-w-24"
              onClick={onUploadClick}
            >
              Drop audio file here or click to choose file
            </button>
          </div>
        )}
        {audioData && (
          <>
            <div>
              <ChartContainer
                series={[
                  {
                    label: "Momentary loudness",
                    data: audioData.lufsData.blockLoudness,
                    showMark: false,
                    type: "line",
                    valueFormatter: (value) => `${value?.toFixed(2)} LUFS`,
                  },
                ]}
                sx={{
                  "& .MuiLineElement-series-RelativeThreshold": {
                    strokeDasharray: "10 5",
                    strokeWidth: 4,
                  },
                }}
                xAxis={[
                  {
                    data: Array.from(
                      audioData.lufsData.blockLoudness.map((_, i) => i * 0.1)
                    ),
                    valueFormatter: formatTimeStamp,
                  },
                ]}
                yAxis={[
                  {
                    min: -35,
                    max: 0,
                    colorMap: {
                      type: "piecewise",
                      colors: ["#444", "#444", "#4254FB"],
                      thresholds: [
                        -1000,
                        audioData.lufsData.relativeThreshold,
                        0,
                      ],
                    },
                  },
                ]}
                height={500}
                onAxisClick={onAxisClick}
              >
                <LinePlot />
                <ChartsAxisHighlight x="line" />
                <MarkPlot />
                <ChartsReferenceLine
                  y={audioData.lufsData.relativeThreshold}
                  lineStyle={{ strokeDasharray: "10 5", strokeWidth: 4 }}
                />
                <ChartsReferenceLine
                  x={playheadPos}
                  lineStyle={{ strokeWidth: 2, opacity: 0.5 }}
                />
                <ChartsXAxis />
                <ChartsYAxis />
                <ChartsTooltip />
                <LineHighlightPlot />
              </ChartContainer>
            </div>
            <div className="flex mt-4 gap-8 p-6 flex-wrap">
              <div className="text-xl font-medium text-white p-2.5 px-0">
                {formatTimeStamp(playheadPos)}
              </div>
              <button
                className="border focus:outline-none focus:ring-4 font-medium rounded-full text-sm px-5 py-2.5 me-2 mb-2 bg-gray-800 text-white border-gray-600 hover:bg-gray-700 hover:border-gray-600 focus:ring-gray-700 min-w-24"
                onClick={onPlayPause}
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                className="ml-auto justify-self-end border focus:outline-none focus:ring-4 font-medium rounded-full text-sm px-5 py-2.5 me-2 mb-2 bg-gray-800 text-white border-gray-600 hover:bg-gray-700 hover:border-gray-600 focus:ring-gray-700 min-w-24"
                onClick={onUploadClick}
              >
                Upload new file
              </button>
            </div>
            <div className="flex flex-wrap justify-start mt-4 items-start">
              <div className="flex max-w-sm items-center gap-x-4 p-6 min-w-80">
                <div>
                  <p className="text-gray-400">Integrated loudness</p>
                  <div className="text-xl font-medium text-white">
                    {audioData.lufsData.integratedLufs.toFixed(2)} LUFS
                  </div>
                  <p className="text-gray-400 mt-2 text-sm">
                    Loudness measurement used for normalizing audio on
                    streaming, as determined by a standardized algorithm. On
                    Spotify, this track will be adjusted by{" "}
                    <span className="text-white font-bold">
                      {(-14 - audioData.lufsData.integratedLufs).toFixed(2) +
                        " "}
                      dB
                    </span>{" "}
                    to reach the target loudness of -14 LUFS.
                  </p>
                </div>
              </div>
              <div className="flex max-w-sm items-center gap-x-4 p-6 min-w-80">
                <div>
                  <p className="text-gray-400">Relative gating threshold</p>
                  <div className="text-xl font-medium text-white">
                    {audioData.lufsData.relativeThreshold.toFixed(2)} LUFS
                  </div>
                  <p className="text-gray-400 mt-2 text-sm">
                    The threshold below which audio is igonored by the
                    integrated loudness algorithm. This threshold is dependent
                    on the average loudness of the overall track. The threshold
                    is higher for louder tracks.
                  </p>
                </div>
              </div>
              <div className="flex max-w-sm items-center gap-x-4 p-6 min-w-80">
                <div>
                  <p className="text-gray-400">Measurements above threshold</p>
                  <div className="text-xl font-medium text-white">
                    {(audioData.lufsData.portionAboveThreshold * 100).toFixed(
                      1
                    )}
                    %
                  </div>
                  <p className="text-gray-400 mt-2 text-sm">
                    The amount of time the track is above the gating threshold.
                    If parts of the track are below the threshold, raising their
                    volume just above the threshold can reduce the overall
                    loudness measurement.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
        <div
          style={{
            visibility: dragActive ? "visible" : "hidden",
            opacity: dragActive ? 1 : 0.5,
          }}
          className="dropzone"
        />
      </main>
    </ThemeProvider>
  );
}
