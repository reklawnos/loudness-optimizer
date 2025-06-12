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
  constructor(
    gain: number,
    q: number,
    freq: number,
    rate: number,
    type: "HIGH_PASS" | "HIGH_SHELF"
  ) {
    let a: number[] = [1, 0, 0];
    let b: number[] = [1, 0, 0];

    const w0 = (2 * Math.PI * freq) / rate;
    const cos_w0 = Math.cos(w0);
    const sin_w0 = Math.sin(w0);

    if (type === "HIGH_PASS") {
      const alpha = sin_w0 / (2 * q);

      b[0] = (1 + cos_w0) / 2;
      b[1] = -(1 + cos_w0);
      b[2] = (1 + cos_w0) / 2;
      a[0] = 1 + alpha;
      a[1] = -2 * cos_w0;
      a[2] = 1 - alpha;

      // Normalize coefficients so that a[0] = 1
      b = b.map((coef) => coef / a[0]);
      a = a.map((coef) => coef / a[0]);
      a[0] = 1;
    } else if (type === "HIGH_SHELF") {
      const A = Math.pow(10, gain / 40);
      const alpha = (sin_w0 / 2) * Math.sqrt((A + 1 / A) * (1 / q - 1) + 2);

      const sqrtA = Math.sqrt(A);

      b[0] = A * (A + 1 + (A - 1) * cos_w0 + 2 * sqrtA * alpha);
      b[1] = -2 * A * (A - 1 + (A + 1) * cos_w0);
      b[2] = A * (A + 1 + (A - 1) * cos_w0 - 2 * sqrtA * alpha);
      a[0] = A + 1 - (A - 1) * cos_w0 + 2 * sqrtA * alpha;
      a[1] = 2 * (A - 1 - (A + 1) * cos_w0);
      a[2] = A + 1 - (A - 1) * cos_w0 - 2 * sqrtA * alpha;

      // Normalize coefficients so that a[0] = 1
      b = b.map((coef) => coef / a[0]);
      a = a.map((coef) => coef / a[0]);
      a[0] = 1;
    } else {
      throw new Error("Unsupported filter type");
    }

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
