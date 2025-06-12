import { IirFilter } from "./IirFilter";

export interface LufsMeterResult {
  integratedLufs: number;
  blockLoudness: Float32Array;
  relativeThreshold: number;
  maxLoudness: number;
}

function sum(arr: number[]): number {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total += arr[i];
  }
  return total;
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
      Math.round((length - blockSize) / hopSize) + 1
    );

    // Step 3: Calculate loudness for each block (combine channels at block level)
    const blockLoudness = new Float32Array(numBlocks);
    const blockRms = inputs.map(() => new Float32Array(numBlocks));
    for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
      const start = blockIdx * hopSize;
      const end = start + blockSize;
      // For each channel, get the block, then average the mean square across channels
      blockRms.forEach((rmsResult, ch) => {
        const block = filteredChannels[ch].subarray(
          start,
          Math.min(end, length)
        );
        let sum = 0;
        for (let j = 0; j < block.length; j++) {
          sum += block[j] * block[j];
        }
        rmsResult[blockIdx] += sum / block.length;
      });
      // LUFS = -0.691 + 10 * log10(sum of mean square of each channel)
      blockLoudness[blockIdx] =
        -0.691 +
        10 *
          Math.log10(
            // Simple sum of each channel
            // TODO: update to have channel-specific gain
            blockRms.reduce((s, r) => s + r[blockIdx], 0) + Number.EPSILON
          );
    }
    // Step 4: Calculate relative threshold (gating)
    // Blocks with loudness above the absolute gate
    const initialGatedBlocks = blockLoudness
      .entries()
      .filter(([, l]) => l >= LufsMeter.ABSOLUTE_GATE)
      .map(([i]) => i)
      .toArray();

    const perChannelMeans = blockRms.map(
      (rms) =>
        initialGatedBlocks.reduce((sum, blockIdx) => {
          return sum + rms[blockIdx];
        }, 0) / initialGatedBlocks.length
    );

    // Simple sum of each channel
    // TODO: update to have channel-specific gain
    const sumOfMeans = sum(perChannelMeans);

    const relativeThreshold = -0.691 + 10 * Math.log10(sumOfMeans) - 10;

    // Apply gating to blocks
    const finalGatedBlocks = blockLoudness
      .entries()
      .filter(([, l]) => l > relativeThreshold && l > LufsMeter.ABSOLUTE_GATE)
      .map(([i]) => i)
      .toArray();

    const avergePerChannel = blockRms.map(
      (rmsBlocks) =>
        finalGatedBlocks.reduce((sum, blockIdx) => {
          return sum + rmsBlocks[blockIdx];
        }, 0) / finalGatedBlocks.length
    );

    // Step 6: Integrated loudness
    let integratedLufs = LufsMeter.ABSOLUTE_GATE;
    if (finalGatedBlocks.length > 0) {
      // Simple sum of each channel
      // TODO: update to have channel-specific gain
      const sumOfAverages = sum(avergePerChannel);
      integratedLufs = -0.691 + 10 * Math.log10(sumOfAverages);
    }

    return {
      integratedLufs,
      blockLoudness,
      relativeThreshold,
      maxLoudness: Math.max(...blockLoudness),
    };
  }

  private applyKWeighting(input: Float32Array): Float32Array {
    // K-weighting: cascade of highpass and shelving filters
    const highShelf = new IirFilter(
      [1.0, -1.69065929318241, 0.73248077421585],
      [1.53512485958697, -2.69169618940638, 1.19839281085285],
      this.sampleRate
    );
    const highPass = new IirFilter(
      [1.0, -1.99004745483398, 0.99007225036621],
      [1, -2, 1],
      this.sampleRate
    );
    const shelved = highShelf.process(input);
    const highpassed = highPass.process(shelved);

    return highpassed;
  }

  private mean(arr: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
    }
    return sum / arr.length;
  }
}
