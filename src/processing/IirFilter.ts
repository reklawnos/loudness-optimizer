// Adapted from https://github.com/klangfreund/LUFSMeter
// License: MIT
// Original author: Markus Schmidt
function convertToSampleRate(
  a: number[],
  b: number[],
  rate: number
): [number[], number[]] {
  if (rate === 48000) {
    return [a, b];
  }
  const kOverQ = (2 - 2 * a[2]) / (a[2] - a[1] + 1);
  const k = Math.sqrt((a[1] + a[2] + 1) / (a[2] - a[1] + 1));
  const q = k / kOverQ;
  const arctanK = Math.atan(k);
  const vB = (b[0] - b[2]) / (1 - a[2]);
  const vH = (b[0] - b[1] + b[2]) / (a[2] - a[1] + 1);
  const vL = (b[0] + b[1] + b[2]) / (a[1] + a[2] + 1);

  const newK = Math.tan((arctanK * 48000) / rate);
  const commonFactor = 1 / (1 + newK / q + newK * newK);
  b[0] = (vH + (vB * newK) / q + vL * newK * newK) * commonFactor;
  b[1] = 2 * (vL * newK * newK - vH) * commonFactor;
  b[2] = (vH - (vB * newK) / q + vL * newK * newK) * commonFactor;
  a[0] = 1;
  a[1] = 2 * (1 - newK * newK) * commonFactor;
  a[2] = (1 - newK / q + newK * newK) * commonFactor;
  return [a, b];
}

export class IirFilter {
  private readonly a: number[];
  private readonly b: number[];
  private readonly x: number[];
  private readonly y: number[];

  /**
   * @param gain Gain in dB (for shelf), ignored for high-pass
   * @param q Quality factor (Q)
   * @param freq Frequency in Hz
   * @param rate Sample rate in Hz
   * @param type 'HIGH_PASS' or 'HIGH_SHELF'
   */
  constructor(a: number[], b: number[], rate: number) {
    [a, b] = convertToSampleRate(a, b, rate);

    this.a = a;
    this.b = b;
    this.x = [0, 0, 0];
    this.y = [0, 0, 0];
  }

  /**
   * Process an array of samples through the filter.
   * @param input The input samples to process.
   * @returns The filtered output samples.
   */
  process(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
      // Shift previous samples
      this.x[2] = this.x[1];
      this.x[1] = this.x[0];
      this.x[0] = input[i];

      // Calculate output sample
      this.y[2] = this.y[1];
      this.y[1] = this.y[0];
      this.y[0] =
        this.b[0] * this.x[0] +
        this.b[1] * this.x[1] +
        this.b[2] * this.x[2] -
        this.a[1] * this.y[1] -
        this.a[2] * this.y[2];

      output[i] = this.y[0];
    }

    return output;
  }
}
