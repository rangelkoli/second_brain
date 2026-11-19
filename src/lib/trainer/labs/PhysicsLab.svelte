<script lang="ts">
	import { onDestroy, untrack } from "svelte";
	import { prefersReducedMotion } from "svelte/motion";
	import { Button } from "$lib/components/ui/button/index.js";
	import Play from "@lucide/svelte/icons/play";
	import Pause from "@lucide/svelte/icons/pause";
	import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
	import type { LabStep, PhysicsPayload } from "../lab";

	let { physics, step }: { physics: PhysicsPayload; step: LabStep } = $props();

	let angle = $state(30);
	let speed = $state(20);
	let progress = $state(0.5); // 0..1 of flight time
	let animating = $state(false);
	let ghost = $state<{ angle: number; speed: number } | null>(null);

	const g = $derived(physics.gravity ?? 9.81);

	// A new step flies the ball from where it is to the step's t (from launch if the shot itself changed).
	let arrived = false;
	$effect(() => {
		const st = step;
		untrack(() => {
			const nextAngle = st.angle ?? physics.angle;
			const nextSpeed = st.speed ?? physics.speed;
			const newShot = !arrived || nextAngle !== angle || nextSpeed !== speed;
			angle = nextAngle;
			speed = nextSpeed;
			stopAnim();
			const target = typeof st.t === "number" ? st.t : 0.5;
			if (prefersReducedMotion.current) {
				progress = target;
				arrived = true;
				return;
			}
			flyTo(newShot ? 0 : progress, target);
			arrived = true;
		});
	});

	function metrics(angDeg: number, v0: number) {
		const rad = (angDeg * Math.PI) / 180;
		const vx = v0 * Math.cos(rad);
		const vy0 = v0 * Math.sin(rad);
		const flightTime = (2 * vy0) / g;
		const maxHeight = (vy0 * vy0) / (2 * g);
		const range = vx * flightTime;
		return { vx, vy0, flightTime, maxHeight, range };
	}

	const cur = $derived(metrics(angle, speed));
	const ghostMetrics = $derived(ghost ? metrics(ghost.angle, ghost.speed) : null);

	// Fit both current & ghost trajectories in SVG viewBox (460x240)
	const arena = $derived.by(() => {
		const maxR = Math.max(cur.range, ghostMetrics?.range ?? 0, 20);
		const maxH = Math.max(cur.maxHeight, ghostMetrics?.maxHeight ?? 0, 8);
		const padL = 36;
		const padR = 24;
		const padT = 28;
		const groundY = 205;
		const usableW = 460 - padL - padR;
		const usableH = groundY - padT;
		const scale = Math.min(usableW / maxR, usableH / maxH);
		const toX = (xm: number) => padL + xm * scale;
		const toY = (ym: number) => groundY - ym * scale;

		const buildPath = (angDeg: number, v0: number, upTo = 1) => {
			const m = metrics(angDeg, v0);
			const pts: string[] = [];
			const steps = 40;
			for (let i = 0; i <= steps; i++) {
				const frac = (i / steps) * upTo;
				const t = frac * m.flightTime;
				const x = m.vx * t;
				const y = m.vy0 * t - 0.5 * g * t * t;
				pts.push(`${i === 0 ? "M" : "L"}${toX(x).toFixed(1)},${toY(Math.max(0, y)).toFixed(1)}`);
			}
			return pts.join(" ");
		};

		const tNow = progress * cur.flightTime;
		const xNow = cur.vx * tNow;
		const yNow = Math.max(0, cur.vy0 * tNow - 0.5 * g * tNow * tNow);
		const vyNow = cur.vy0 - g * tNow;

		const posAt = (p: number) => {
			const t = Math.max(0, p) * cur.flightTime;
			return { x: toX(cur.vx * t), y: toY(Math.max(0, cur.vy0 * t - 0.5 * g * t * t)) };
		};
		const trail = animating ? [1, 2, 3, 4, 5, 6].map((k) => ({ ...posAt(progress - k * 0.022 * flightDir), o: 0.42 - k * 0.06, r: 5.5 - k * 0.55 })) : [];

		return {
			trail,
			groundY,
			toX,
			toY,
			fullPath: buildPath(angle, speed, 1),
			traveledPath: buildPath(angle, speed, progress),
			ghostPath: ghost ? buildPath(ghost.angle, ghost.speed, 1) : "",
			ballX: toX(xNow),
			ballY: toY(yNow),
			peakX: toX(cur.range / 2),
			peakY: toY(cur.maxHeight),
			endX: toX(cur.range),
			vx: cur.vx,
			vyNow,
			tNow,
			xNow,
			yNow,
		};
	});

	let raf: number | null = null;
	let flightDir = $state(1);
	let vectors = $state<SVGGElement>();
	function stopAnim() {
		if (raf !== null) cancelAnimationFrame(raf);
		raf = null;
		animating = false;
	}

	// Real time for a full flight, squeezed into a watchable 1.1–3.2 s.
	const fullFlightMs = () => Math.max(1100, Math.min(3200, cur.flightTime * 550));

	function growVectors() {
		if (!vectors || prefersReducedMotion.current) return;
		vectors.style.transformOrigin = `${arena.ballX}px ${arena.ballY}px`;
		vectors.animate([{ scale: "0", opacity: 0 }, { scale: "1", opacity: 1 }], { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
	}

	function flyTo(from: number, to: number) {
		if (Math.abs(to - from) < 0.001) {
			progress = to;
			growVectors();
			return;
		}
		flightDir = to >= from ? 1 : -1;
		animating = true;
		progress = from;
		// Rewinding is quicker than flying forward.
		const durMs = Math.max(260, Math.abs(to - from) * fullFlightMs() * (flightDir > 0 ? 1 : 0.5));
		const start = performance.now();
		const frame = (now: number) => {
			const k = Math.min(1, (now - start) / durMs);
			progress = from + (to - from) * k; // linear: the ball keeps physical time
			if (k < 1 && animating) raf = requestAnimationFrame(frame);
			else {
				animating = false;
				raf = null;
				growVectors();
			}
		};
		raf = requestAnimationFrame(frame);
	}

	function launch() {
		if (animating) return stopAnim();
		flightDir = 1;
		animating = true;
		progress = 0;
		const start = performance.now();
		const durMs = fullFlightMs();
		const frame = (now: number) => {
			const p = Math.min(1, (now - start) / durMs);
			progress = p;
			if (p < 1 && animating) raf = requestAnimationFrame(frame);
			else {
				animating = false;
				raf = null;
				growVectors();
			}
		};
		raf = requestAnimationFrame(frame);
	}

	function updateAngle(next: number) {
		if (!ghost || ghost.angle !== angle || ghost.speed !== speed) {
			ghost = { angle, speed };
		}
		angle = next;
	}

	onDestroy(stopAnim);
</script>

<div class="space-y-4">
	<!-- Controls -->
	<div class="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-xs">
		<Button size="sm" variant={animating ? "secondary" : "default"} class="h-7 px-3" onclick={launch}>
			{#if animating}<Pause class="size-3.5" /> Pause{:else}<Play class="size-3.5" /> Launch{/if}
		</Button>
		<label class="flex items-center gap-2">
			<span class="font-medium">Angle: {angle}°</span>
			<input
				type="range"
				min="5"
				max="85"
				value={angle}
				oninput={(e) => updateAngle(Number((e.currentTarget as HTMLInputElement).value))}
				class="w-24 accent-current"
			/>
		</label>
		<label class="flex items-center gap-2">
			<span class="font-medium">Speed: {speed} m/s</span>
			<input type="range" min="5" max="45" bind:value={speed} class="w-24 accent-current" />
		</label>
		<Button
			size="sm"
			variant="ghost"
			class="ml-auto h-7 px-2 text-xs"
			onclick={() => {
				ghost = null;
				angle = physics.angle;
				speed = physics.speed;
				progress = 0.5;
			}}
		>
			<RotateCcw class="size-3" /> Reset
		</Button>
	</div>

	<!-- Trajectory Arena -->
	<div class="lab-stage overflow-hidden p-2">
		<svg viewBox="0 0 460 240" class="w-full" aria-label="Projectile motion simulation">
			<!-- Ground -->
			<line x1="20" y1={arena.groundY} x2="445" y2={arena.groundY} class="stroke-border" stroke-width="2" />

			<!-- Ghost comparison path -->
			{#if arena.ghostPath}
				<path d={arena.ghostPath} class="fill-none stroke-muted-foreground/40" stroke-width="1.8" stroke-dasharray="4 4" />
			{/if}

			<!-- Predicted arc -->
			<path d={arena.fullPath} class="fill-none stroke-primary/30" stroke-width="1.8" stroke-dasharray="3 3" />

			<!-- Traveled arc -->
			<path d={arena.traveledPath} class="fill-none stroke-primary" stroke-width="2.5" />

			<!-- Peak marker -->
			<circle cx={arena.peakX} cy={arena.peakY} r="3" class="fill-amber-500" />
			<text x={arena.peakX} y={arena.peakY - 7} text-anchor="middle" class="fill-amber-600 text-[10px] font-medium dark:fill-amber-400">
				Peak {cur.maxHeight.toFixed(1)}m
			</text>

			<!-- Range marker -->
			<text x={arena.endX} y={arena.groundY + 15} text-anchor="middle" class="fill-muted-foreground text-[10px]">
				{cur.range.toFixed(1)}m
			</text>

			<!-- Motion trail (only while flying) -->
			{#each arena.trail as dot}
				<circle cx={dot.x} cy={dot.y} r={Math.max(1.5, dot.r)} class="fill-primary" opacity={Math.max(0, dot.o)} />
			{/each}

			<!-- Velocity vectors -->
			<defs>
				<marker id="vec-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
					<path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
				</marker>
			</defs>
			{#if physics.showVectors !== false}
				{@const vxLen = Math.max(14, (arena.vx / Math.max(speed, 1)) * 42)}
				{@const vyLen = (arena.vyNow / Math.max(speed, 1)) * 42}
				<g bind:this={vectors}>
				<!-- Vx arrow (horizontal) -->
				<line x1={arena.ballX} y1={arena.ballY} x2={arena.ballX + vxLen} y2={arena.ballY} class="stroke-blue-500" stroke-width="2" stroke-linecap="round" marker-end="url(#vec-head)" />
				<text x={arena.ballX + vxLen + 3} y={arena.ballY + 3} class="fill-blue-600 text-[9px] font-semibold dark:fill-blue-400">Vx</text>

				<!-- Vy arrow (vertical) -->
				{#if Math.abs(vyLen) > 3}
					<line x1={arena.ballX} y1={arena.ballY} x2={arena.ballX} y2={arena.ballY - vyLen} class="stroke-rose-500" stroke-width="2" stroke-linecap="round" marker-end="url(#vec-head)" />
					<text x={arena.ballX - 16} y={arena.ballY - vyLen} class="fill-rose-600 text-[9px] font-semibold dark:fill-rose-400">Vy</text>
				{/if}
				</g>
			{/if}

			<!-- Projectile ball -->
			<circle cx={arena.ballX} cy={arena.ballY} r="6.5" class="fill-primary stroke-background" stroke-width="1.5" />
		</svg>
	</div>

	<!-- Scrub slider + Telemetry -->
	<div class="bg-card space-y-2 rounded-lg border p-3 text-xs">
		<label class="flex items-center gap-3">
			<span class="text-muted-foreground w-20 shrink-0 tabular-nums">t = {arena.tNow.toFixed(2)}s</span>
			<input type="range" min="0" max="1" step="0.01" bind:value={progress} class="flex-1 accent-current" aria-label="Time scrub" />
		</label>
		<div class="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
			<div class="bg-muted/40 rounded px-2.5 py-1.5">
				<div class="text-muted-foreground text-[10px]">Horizontal Vx</div>
				<div class="font-semibold tabular-nums text-blue-600 dark:text-blue-400">{arena.vx.toFixed(1)} m/s</div>
			</div>
			<div class="bg-muted/40 rounded px-2.5 py-1.5">
				<div class="text-muted-foreground text-[10px]">Vertical Vy(t)</div>
				<div class="font-semibold tabular-nums text-rose-600 dark:text-rose-400">{arena.vyNow.toFixed(1)} m/s</div>
			</div>
			<div class="bg-muted/40 rounded px-2.5 py-1.5">
				<div class="text-muted-foreground text-[10px]">Peak Height</div>
				<div class="font-semibold tabular-nums">{cur.maxHeight.toFixed(1)} m</div>
			</div>
			<div class="bg-muted/40 rounded px-2.5 py-1.5">
				<div class="text-muted-foreground text-[10px]">Total Range</div>
				<div class="font-semibold tabular-nums">{cur.range.toFixed(1)} m</div>
			</div>
		</div>
	</div>
</div>
