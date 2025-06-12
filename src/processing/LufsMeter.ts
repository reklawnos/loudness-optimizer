import { IirFilter } from "./IirFilter";

export interface LufsMeterResult {
  integratedLufs: number;
  blockLoudness: Float32Array;
  relativeThreshold: number;
}

export class LufsMeter {
  private static readonly BLOCK_DURATION = 0.4; // 400 ms
  private static readonly OVERLAP = 0.75; // 75% overlap
  private static readonly MIN_BLOCKS = 1;
  private static readonly ABSOLUTE_GATE = -70.0; // LUFS

  constructor(private sampleRate: number) {}

  public measure(inputs: Float32Array[]): LufsMeterResult {
    // Step 1: K-weighting filter for each channel
    const filteredChannels = inputs.map((input) => this.applyKWeighting(input));

    // Step 2: Calculate block size and hop size
    const blockSize = Math.round(LufsMeter.BLOCK_DURATION * this.sampleRate);
    const hopSize = Math.round(blockSize * (1 - LufsMeter.OVERLAP));
    const length = Math.min(...filteredChannels.map((ch) => ch.length));
    const numBlocks = Math.max(
      LufsMeter.MIN_BLOCKS,
      Math.floor((length - blockSize) / hopSize) + 1
    );

    // Step 3: Calculate loudness for each block (combine channels at block level)
    const blockLoudness = new Float32Array(numBlocks);
    for (let i = 0; i < numBlocks; i++) {
      const start = i * hopSize;
      const end = start + blockSize;
      // For each channel, get the block, then average the mean square across channels
      let meanSquareSum = 0;
      for (let ch = 0; ch < filteredChannels.length; ch++) {
        const block = filteredChannels[ch].subarray(
          start,
          Math.min(end, length)
        );
        let sum = 0;
        for (let j = 0; j < block.length; j++) {
          sum += block[j] * block[j];
        }
        meanSquareSum += sum / block.length;
      }
      const meanSquare = meanSquareSum / filteredChannels.length;
      // LUFS = -0.691 + 10 * log10(meanSquare)
      blockLoudness[i] = -0.691 + 10 * Math.log10(meanSquare + Number.EPSILON);
    }

    // Step 4: Calculate relative threshold (gating)
    const mean = this.mean(blockLoudness);
    const relativeThreshold = Math.max(mean - 10.0, LufsMeter.ABSOLUTE_GATE);

    // Step 5: Apply gating
    const gatedBlocks = [];
    for (let i = 0; i < blockLoudness.length; i++) {
      if (blockLoudness[i] > relativeThreshold) {
        gatedBlocks.push(Math.pow(10, blockLoudness[i] / 10));
      }
    }

    // Step 6: Integrated loudness
    let integratedLufs = LufsMeter.ABSOLUTE_GATE;
    if (gatedBlocks.length > 0) {
      const gatedMean =
        gatedBlocks.reduce((a, b) => a + b, 0) / gatedBlocks.length;
      integratedLufs = 10 * Math.log10(gatedMean);
    }

    return {
      integratedLufs,
      blockLoudness,
      relativeThreshold,
    };
  }

  private applyKWeighting(input: Float32Array): Float32Array {
    // K-weighting: cascade of highpass and shelving filters
    const highShelf = new IirFilter(
      4,
      Math.SQRT1_2,
      1500,
      this.sampleRate,
      "HIGH_SHELF"
    );
    const highPass = new IirFilter(0, 0.5, 38, this.sampleRate, "HIGH_PASS");
    // const highpass = new IirFilter("HIGH_PASS", this.sampleRate, 40, 0.0, 1);
    const shelved = highShelf.process(input);
    const highpassed = highPass.process(shelved);

    return highpassed;
  }

  private blockLoudness(block: Float32Array): number {
    // Mean square
    let sum = 0;
    for (let i = 0; i < block.length; i++) {
      sum += block[i] * block[i];
    }
    const meanSquare = sum / block.length;
    // LUFS = -0.691 + 10 * log10(meanSquare)
    return -0.691 + 10 * Math.log10(meanSquare + Number.EPSILON);
  }

  private mean(arr: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
    }
    return sum / arr.length;
  }
}
