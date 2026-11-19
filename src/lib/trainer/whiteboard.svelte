<script lang="ts">
	import { onMount } from "svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import Eraser from "@lucide/svelte/icons/eraser";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import Undo2 from "@lucide/svelte/icons/undo-2";
	import { loadBoard, saveBoard } from "./trainer.svelte";

	let { id }: { id: string } = $props();

	// Fixed drawing resolution, scaled to fit by CSS, so strokes survive layout changes.
	const W = 1600, H = 1000;
	const COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a"];
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let color = $state(COLORS[0]);
	let erasing = $state(false);
	let blank = $state(true);
	let drawing = false;
	const history: ImageData[] = []; // ponytail: last 20 states in memory only; undo doesn't survive reload

	// Downscaled JPEG: 768px wide for the AI (enough to read a sketch), 1200px for the local copy.
	function jpeg(w: number) {
		const c = document.createElement("canvas");
		c.width = w;
		c.height = Math.round((w * H) / W);
		c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
		return c.toDataURL("image/jpeg", 0.8);
	}
	/** JPEG snapshot for the AI, or null when nothing is drawn. */
	export const snapshot = () => (blank ? null : jpeg(768));

	function reset() {
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, W, H);
	}

	onMount(() => {
		ctx = canvas.getContext("2d")!;
		reset();
		const saved = loadBoard(id);
		if (saved) {
			const img = new Image();
			img.onload = () => ctx.drawImage(img, 0, 0, W, H);
			img.src = saved;
			blank = false;
		}
	});

	const point = (e: PointerEvent) => {
		const r = canvas.getBoundingClientRect();
		return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
	};

	function down(e: PointerEvent) {
		canvas.setPointerCapture(e.pointerId);
		history.push(ctx.getImageData(0, 0, W, H));
		if (history.length > 20) history.shift();
		drawing = true;
		ctx.strokeStyle = erasing ? "#fff" : color;
		ctx.lineWidth = erasing ? 36 : 4;
		ctx.lineCap = ctx.lineJoin = "round";
		ctx.beginPath();
		ctx.moveTo(...point(e));
		ctx.lineTo(...point(e));
		ctx.stroke();
	}
	function move(e: PointerEvent) {
		if (!drawing) return;
		ctx.lineTo(...point(e));
		ctx.stroke();
	}
	function up() {
		if (!drawing) return;
		drawing = false;
		blank = false;
		persist();
	}
	const persist = () => saveBoard(id, blank ? null : jpeg(1200));

	function undo() {
		const prev = history.pop();
		if (prev) ctx.putImageData(prev, 0, 0), persist();
	}
	function clear() {
		history.push(ctx.getImageData(0, 0, W, H));
		reset();
		blank = true;
		persist();
	}
</script>

<div class="flex h-full flex-col gap-2">
	<div class="flex items-center gap-1.5">
		{#each COLORS as c}
			<button
				class="size-6 rounded-full border-2 {!erasing && color === c ? 'ring-ring ring-2 ring-offset-2' : 'border-transparent'}"
				style="background:{c}"
				aria-label="Pen color {c}"
				aria-pressed={!erasing && color === c}
				onclick={() => ((color = c), (erasing = false))}
			></button>
		{/each}
		<Button size="icon-sm" variant={erasing ? "secondary" : "ghost"} aria-label="Eraser" aria-pressed={erasing} onclick={() => (erasing = !erasing)}>
			<Eraser />
		</Button>
		<div class="flex-1"></div>
		<Button size="sm" variant="ghost" onclick={undo}><Undo2 /> Undo</Button>
		<Button size="sm" variant="ghost" onclick={clear}><Trash2 /> Clear</Button>
	</div>
	<canvas
		bind:this={canvas}
		width={W}
		height={H}
		class="w-full touch-none rounded-lg border bg-white {erasing ? 'cursor-cell' : 'cursor-crosshair'}"
		style="aspect-ratio:{W}/{H}"
		aria-label="Whiteboard"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
	></canvas>
</div>
