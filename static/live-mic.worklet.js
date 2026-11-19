// Mic tap for Live voice (src/lib/trainer/live.svelte.ts): posts raw float frames at the context rate;
// the main thread downsamples to 16 kHz PCM. Batches ~2048 samples so the port isn't flooded.
class LiveMic extends AudioWorkletProcessor {
	buf = new Float32Array(2048);
	n = 0;
	process(inputs) {
		const ch = inputs[0]?.[0];
		if (ch) {
			for (let i = 0; i < ch.length; i++) {
				this.buf[this.n++] = ch[i];
				if (this.n === this.buf.length) {
					this.port.postMessage(this.buf.slice());
					this.n = 0;
				}
			}
		}
		return true;
	}
}
registerProcessor("live-mic", LiveMic);
