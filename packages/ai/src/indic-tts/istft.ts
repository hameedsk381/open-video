/**
 * The vocoder returns a complex spectrogram (real and imaginary halves of an `n_fft`-point STFT), not audio. This
 * turns it back into a waveform the way `torch.istft(center=True, hann)` does in the model's Python: inverse real FFT
 * per frame, periodic Hann window, overlap-add, divide by the window energy, then trim the half-window the encoder
 * padded on each side.
 */
function inverseRealFft(real: Float64Array, imag: Float64Array, out: Float64Array): void {
  const n = real.length, re = Float64Array.from(real), im = Float64Array.from(imag);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (2 * Math.PI) / len, half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(angle * k), wi = Math.sin(angle * k);
        const a = i + k, b = a + half;
        const xr = re[b]! * wr - im[b]! * wi, xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr; im[b] = im[a]! - xi;
        re[a] = re[a]! + xr; im[a] = im[a]! + xi;
      }
    }
  }
  // The butterfly above runs e^{+iθ}, the inverse direction; the spectrum is Hermitian, so the real part is the audio.
  for (let i = 0; i < n; i++) out[i] = re[i]! / n;
}

export type IstftOptions = { frames: number; bins: number; nFft: number; hop: number; padding?: 'center' | 'same' };

/** `real`/`imag` are the flat [bins, frames] halves of the spectrum, row-major (bin * frames + frame). */
export function istft(real: Float32Array, imag: Float32Array, options: IstftOptions): Float32Array {
  const { frames, bins, nFft, hop } = options;
  const padding = options.padding ?? 'center';
  const total = nFft + hop * (frames - 1);
  const window = new Float64Array(nFft);
  for (let i = 0; i < nFft; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft);
  const y = new Float64Array(total), energy = new Float64Array(total);
  const specR = new Float64Array(bins), specI = new Float64Array(bins);
  const frameSamples = new Float64Array(nFft);
  for (let t = 0; t < frames; t++) {
    for (let k = 0; k < bins; k++) { specR[k] = real[k * frames + t]!; specI[k] = imag[k * frames + t]!; }
    const fullR = new Float64Array(nFft), fullI = new Float64Array(nFft);
    for (let k = 0; k < bins; k++) { fullR[k] = specR[k]!; fullI[k] = specI[k]!; }
    for (let k = bins; k < nFft; k++) { fullR[k] = specR[nFft - k]!; fullI[k] = -specI[nFft - k]!; }
    inverseRealFft(fullR, fullI, frameSamples);
    const base = t * hop;
    for (let i = 0; i < nFft; i++) {
      y[base + i] = y[base + i]! + frameSamples[i]! * window[i]!;
      energy[base + i] = energy[base + i]! + window[i]! * window[i]!;
    }
  }
  const pad = padding === 'center' ? nFft >> 1 : (nFft - hop) >> 1;
  const length = total - pad * 2;
  const out = new Float32Array(Math.max(0, length));
  for (let i = 0; i < out.length; i++) {
    const env = energy[pad + i]!;
    if (env < 1e-11) throw new Error('The vocoder produced a spectrum with no window overlap');
    out[i] = y[pad + i]! / env;
  }
  return out;
}
