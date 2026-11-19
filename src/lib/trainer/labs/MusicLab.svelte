<script lang="ts">
	import { onDestroy } from "svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import Play from "@lucide/svelte/icons/play";
	import Pause from "@lucide/svelte/icons/pause";
	import Drum from "@lucide/svelte/icons/drum";
	import Music from "@lucide/svelte/icons/music";
	import type { LabStep, MusicPayload } from "../lab";

	let { music, step }: { music: MusicPayload; step: LabStep } = $props();

	let bpm = $state(96);
	let drumsOn = $state(false);
	let drumVol = $state(42);
	let playing = $state(false);
	let activeBeat = $state(-1);
	let activeNote = $state<string | null>(null);

	$effect(() => {
		bpm = music.bpm ?? 96;
		drumsOn = Boolean(music.drums);
		drumVol = music.drumVolume ?? 42;
	});

	const NOTE_SEMITONE: Record<string, number> = {
		C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
		"F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
	};

	function normalizeNote(n: string) {
		const m = /^([A-Ga-g])([#b]?)(-?\d)?$/.exec(n.trim());
		if (!m) return { pitch: "C", octave: 4, label: n };
		const letter = m[1].toUpperCase();
		const acc = m[2] || "";
		const octave = m[3] ? Number(m[3]) : 4;
		return { pitch: `${letter}${acc}`, octave, label: `${letter}${acc}${octave}` };
	}

	function noteToFreq(n: string) {
		const { pitch, octave } = normalizeNote(n);
		const semi = NOTE_SEMITONE[pitch] ?? 0;
		const midi = (octave + 1) * 12 + semi;
		return 440 * Math.pow(2, (midi - 69) / 12);
	}

	let audioCtx: AudioContext | null = null;
	function ctx() {
		if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
		if (audioCtx.state === "suspended") audioCtx.resume();
		return audioCtx;
	}

	function playTone(note: string, dur = 0.45, gainAmt = 0.16) {
		const c = ctx();
		const now = c.currentTime;
		const osc = c.createOscillator();
		const osc2 = c.createOscillator();
		const g = c.createGain();
		const f = noteToFreq(note);
		osc.type = "triangle";
		osc2.type = "sine";
		osc.frequency.value = f;
		osc2.frequency.value = f * 2;
		g.gain.setValueAtTime(0.001, now);
		g.gain.exponentialRampToValueAtTime(gainAmt, now + 0.015);
		g.gain.exponentialRampToValueAtTime(0.001, now + dur);
		const g2 = c.createGain();
		g2.gain.value = 0.2;
		osc.connect(g);
		osc2.connect(g2);
		g2.connect(g);
		g.connect(c.destination);
		osc.start(now);
		osc2.start(now);
		osc.stop(now + dur + 0.02);
		osc2.stop(now + dur + 0.02);
		activeNote = normalizeNote(note).label;
		setTimeout(() => {
			if (activeNote === normalizeNote(note).label) activeNote = null;
		}, Math.min(400, dur * 1000));
	}

	function playDrumHit(type: "kick" | "snare" | "hat") {
		const c = ctx();
		const now = c.currentTime;
		const vol = Math.max(0.02, (drumVol / 100) * 0.35);
		if (type === "kick") {
			const osc = c.createOscillator();
			const g = c.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(140, now);
			osc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
			g.gain.setValueAtTime(vol, now);
			g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
			osc.connect(g);
			g.connect(c.destination);
			osc.start(now);
			osc.stop(now + 0.2);
		} else {
			const buf = c.createBuffer(1, c.sampleRate * 0.12, c.sampleRate);
			const data = buf.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
			const noise = c.createBufferSource();
			noise.buffer = buf;
			const filter = c.createBiquadFilter();
			filter.type = type === "hat" ? "highpass" : "bandpass";
			filter.frequency.value = type === "hat" ? 7000 : 1800;
			const g = c.createGain();
			g.gain.setValueAtTime(type === "hat" ? vol * 0.35 : vol * 0.65, now);
			g.gain.exponentialRampToValueAtTime(0.001, now + (type === "hat" ? 0.05 : 0.12));
			noise.connect(filter);
			filter.connect(g);
			g.connect(c.destination);
			noise.start(now);
		}
	}

	let timer: ReturnType<typeof setInterval> | null = null;
	function stopLoop() {
		if (timer) clearInterval(timer);
		timer = null;
		playing = false;
		activeBeat = -1;
	}

	function togglePlay() {
		if (playing) return stopLoop();
		playing = true;
		let tick = 0;
		const chords = music.chords ?? [];
		const scaleNotes = music.notes.length ? music.notes : ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

		const stepMs = music.mode === "progression" && chords.length ? (60_000 / bpm) / 2 : 60_000 / bpm;
		const runBeat = () => {
			if (!playing) return;
			if (music.mode === "progression" && chords.length) {
				const barSub = tick % 8; // 8 eighth-notes per chord
				const chordIdx = Math.floor(tick / 8) % chords.length;
				activeBeat = chordIdx;
				if (barSub === 0) {
					const ch = chords[chordIdx];
					ch.notes.forEach((n, idx) => setTimeout(() => playTone(n, (60 / bpm) * 3.5, 0.1), idx * 25));
				}
				if (drumsOn) {
					if (barSub === 0 || barSub === 5) playDrumHit("kick");
					if (barSub === 4) playDrumHit("snare");
					playDrumHit("hat");
				}
			} else {
				const idx = tick % scaleNotes.length;
				activeBeat = idx;
				playTone(scaleNotes[idx], (60 / bpm) * 0.9, 0.17);
				if (drumsOn) {
					if (idx % 2 === 0) playDrumHit("kick");
					else playDrumHit("hat");
				}
			}
			tick++;
		};
		runBeat();
		timer = setInterval(runBeat, stepMs);
	}

	onDestroy(stopLoop);

	// 2-octave keyboard layout C4..B5
	const WHITE_KEYS = ["C", "D", "E", "F", "G", "A", "B"];
	const BLACK_AFTER: Record<string, string> = { C: "C#", D: "D#", F: "F#", G: "G#", A: "A#" };
	const ENHARMONIC: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

	const whiteKeys = [4, 5].flatMap((oct) => WHITE_KEYS.map((w) => ({ note: `${w}${oct}`, pitch: w, oct })));

	function canonical(n: string) {
		const p = normalizeNote(n);
		return `${ENHARMONIC[p.pitch] ?? p.pitch}${p.octave}`;
	}

	const highlightedSet = $derived.by(() => {
		const s = new Set<string>();
		for (const h of step.highlight ?? []) s.add(canonical(h));
		if (music.mode === "progression" && music.chords?.length) {
			const idx = activeBeat >= 0 ? activeBeat : step.chordIndex ?? 0;
			for (const n of music.chords[idx]?.notes ?? []) s.add(canonical(n));
		}
		if (activeNote) s.add(canonical(activeNote));
		return s;
	});

	const scalePitchSet = $derived(new Set(music.notes.map((n) => ENHARMONIC[normalizeNote(n).pitch] ?? normalizeNote(n).pitch)));

	// Treble staff Y coordinate: E4 = 0, F4 = 1, ..., F5 = 8
	const DIATONIC_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
	function staffY(n: string) {
		const { pitch, octave } = normalizeNote(n);
		const stepFromC4 = (octave - 4) * 7 + (DIATONIC_INDEX[pitch[0]] ?? 0);
		// E4 is step 2 -> y = 78; step gap = 6px
		return 78 - (stepFromC4 - 2) * 6;
	}

	const FIFTHS_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
	const FIFTHS_MINOR = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];

	const activeRootNorm = $derived(music.root.replace(/m$/, ""));
</script>

<div class="space-y-4">
	<!-- Controls Bar -->
	<div class="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
		<Button size="sm" variant={playing ? "secondary" : "default"} onclick={togglePlay}>
			{#if playing}<Pause class="size-3.5" /> Pause{:else}<Play class="size-3.5" /> {music.mode === "progression" ? "Play groove" : "Play scale"}{/if}
		</Button>

		<div class="flex items-center gap-1.5 text-xs">
			<span class="text-muted-foreground">{bpm} BPM</span>
			<input type="range" min="60" max="150" bind:value={bpm} class="w-20 accent-current" aria-label="Tempo BPM" />
		</div>

		<Button size="sm" variant={drumsOn ? "secondary" : "ghost"} onclick={() => (drumsOn = !drumsOn)}>
			<Drum class="size-3.5" /> Drums {drumsOn ? "on" : "off"}
		</Button>

		{#if drumsOn}
			<div class="flex items-center gap-1.5 text-xs">
				<span class="text-muted-foreground">Vol {drumVol}%</span>
				<input type="range" min="10" max="100" bind:value={drumVol} class="w-16 accent-current" aria-label="Drum volume" />
			</div>
		{/if}

		{#if music.sharpsOrFlats}
			<span class="text-muted-foreground ml-auto text-xs">{music.sharpsOrFlats}</span>
		{/if}
	</div>

	<!-- Chords (when progression mode) -->
	{#if music.chords?.length}
		<div class="flex flex-wrap gap-2">
			{#each music.chords as ch, ci}
				{@const isCurrent = (playing ? activeBeat : step.chordIndex ?? 0) === ci}
				<button
					type="button"
					class="rounded-md border px-3 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] {isCurrent ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}"
					onclick={() => ch.notes.forEach((n, idx) => setTimeout(() => playTone(n, 0.7, 0.12), idx * 25))}
				>
					{ch.name}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Staff + Circle of Fifths -->
	<div class="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
		<div class="bg-card rounded-lg border p-3">
			<div class="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
				<Music class="size-3.5" /> {music.scaleName ?? `${music.root} Staff`}
			</div>
			<svg viewBox="0 0 360 110" class="w-full" aria-label="Musical staff">
				{#each [0, 1, 2, 3, 4] as line}
					<line x1="12" x2="348" y1={30 + line * 12} y2={30 + line * 12} class="stroke-border" stroke-width="1.2" />
				{/each}
				{#each music.notes.slice(0, 8) as n, ni}
					{@const x = 44 + ni * 38}
					{@const y = staffY(n)}
					{@const info = normalizeNote(n)}
					{@const active = highlightedSet.has(canonical(n)) || (playing && music.mode === "scale" && activeBeat === ni)}
					{#if y >= 88}
						<line x1={x - 10} x2={x + 10} y1={90} y2={90} class="stroke-muted-foreground/60" stroke-width="1.2" />
					{/if}
					{#if y <= 20}
						<line x1={x - 10} x2={x + 10} y1={18} y2={18} class="stroke-muted-foreground/60" stroke-width="1.2" />
					{/if}
					<g class="cursor-pointer" onclick={() => playTone(n)} role="button" tabindex="0" onkeydown={(e) => e.key === "Enter" && playTone(n)}>
						{#if info.pitch.includes("#") || info.pitch.includes("b")}
							<text x={x - 14} y={y + 4} class="fill-muted-foreground text-[11px] font-semibold">{info.pitch.slice(1)}</text>
						{/if}
						<g class="note-head" class:on={active} style="transform-origin: {x}px {y}px;">
							<ellipse
								cx={x}
								cy={y}
								rx="6.5"
								ry="4.8"
								transform="rotate(-15 {x} {y})"
								class={active ? "fill-primary stroke-primary" : "fill-foreground/85"}
							/>
						</g>
						<text x={x} y="104" text-anchor="middle" class="fill-muted-foreground text-[10px]">{info.pitch}</text>
					</g>
				{/each}
			</svg>
		</div>

		<!-- Circle of Fifths -->
		<div class="bg-card flex flex-col items-center justify-center rounded-lg border p-2">
			<div class="text-muted-foreground mb-1 text-[11px] font-medium">Circle of Fifths</div>
			<svg viewBox="-90 -90 180 180" class="h-36 w-36" aria-label="Circle of Fifths">
				<circle r="80" class="fill-none stroke-border" stroke-width="1" />
				<circle r="52" class="fill-none stroke-border" stroke-width="1" />
				{#each FIFTHS_MAJOR as maj, idx}
					{@const ang = ((idx * 30 - 90) * Math.PI) / 180}
					{@const mx = Math.cos(ang) * 66}
					{@const my = Math.sin(ang) * 66}
					{@const ix = Math.cos(ang) * 38}
					{@const iy = Math.sin(ang) * 38}
					{@const isMajHit = music.relativeMajor === maj || activeRootNorm === maj}
					{@const isMinHit = FIFTHS_MINOR[idx].toLowerCase() === `${activeRootNorm.toLowerCase()}m`}
					<circle cx={mx} cy={my} r="11" class={isMajHit ? "fill-primary" : "fill-transparent"} />
					<text x={mx} y={my + 3.5} text-anchor="middle" class="text-[9px] font-semibold {isMajHit ? 'fill-primary-foreground' : 'fill-foreground'}">{maj}</text>
					<circle cx={ix} cy={iy} r="10" class={isMinHit ? "fill-primary/80" : "fill-transparent"} />
					<text x={ix} y={iy + 3} text-anchor="middle" class="text-[8px] {isMinHit ? 'fill-primary-foreground font-semibold' : 'fill-muted-foreground'}">{FIFTHS_MINOR[idx]}</text>
				{/each}
			</svg>
		</div>
	</div>

	<!-- Playable 2-Octave Piano Keyboard -->
	<div class="lab-stage overflow-x-auto p-3">
		<div class="relative mx-auto h-32 min-w-[460px] select-none">
			<div class="flex h-full gap-0.5">
				{#each whiteKeys as wk}
					{@const isHighlight = highlightedSet.has(canonical(wk.note))}
					{@const inScale = scalePitchSet.has(wk.pitch)}
					<button
						type="button"
						class="piano-key relative flex flex-1 flex-col items-center justify-end rounded-b-md border pb-1.5 text-[10px] font-medium {isHighlight
							? 'pressed'
							: ''} {isHighlight
							? 'bg-primary text-primary-foreground border-primary'
							: inScale
								? 'bg-accent text-accent-foreground hover:bg-accent/80'
								: 'bg-background text-muted-foreground hover:bg-muted/60'}"
						onclick={() => playTone(wk.note)}
					>
						{#if inScale && !isHighlight}
							<span class="bg-primary/60 mb-1 size-1.5 rounded-full"></span>
						{/if}
						{wk.pitch}{wk.oct}
					</button>
				{/each}
			</div>

			<!-- Black Keys -->
			{#each whiteKeys as wk, wi}
				{@const sharp = BLACK_AFTER[wk.pitch]}
				{#if sharp}
					{@const note = `${sharp}${wk.oct}`}
					{@const isHighlight = highlightedSet.has(canonical(note))}
					{@const inScale = scalePitchSet.has(sharp)}
					<button
						type="button"
						style="left: calc({((wi + 1) / whiteKeys.length) * 100}% - 13px);"
						class="piano-key absolute top-0 z-10 flex h-20 w-6.5 flex-col items-center justify-end rounded-b-md border pb-1 text-[9px] font-semibold shadow-sm {isHighlight
							? 'pressed'
							: ''} {isHighlight
							? 'bg-primary text-primary-foreground border-primary'
							: inScale
								? 'bg-zinc-700 text-white ring-2 ring-primary/60'
								: 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}"
						onclick={() => playTone(note)}
					>
						{sharp}
					</button>
				{/if}
			{/each}
		</div>
	</div>
</div>

<style>
	/* Keys sink when pressed or highlighted; quick down, slightly slower release. */
	.piano-key {
		transform-origin: top;
		transition:
			background-color 150ms ease-out,
			color 150ms ease-out,
			transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
			box-shadow 220ms ease-out;
	}
	.piano-key.pressed,
	.piano-key:active {
		transform: scaleY(0.975) translateY(1px);
		box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.18);
		transition-duration: 90ms;
	}
	.note-head {
		transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	.note-head.on {
		transform: scale(1.3);
	}
</style>
