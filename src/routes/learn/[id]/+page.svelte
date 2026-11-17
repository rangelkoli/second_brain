<script lang="ts">
	import { onMount, tick } from "svelte";
	import { page } from "$app/state";
	import Editor from "$lib/editor/editor.svelte";
	import Whiteboard from "$lib/trainer/whiteboard.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import ArrowUp from "@lucide/svelte/icons/arrow-up";
	import ScanSearch from "@lucide/svelte/icons/scan-search";
	import CircleHelp from "@lucide/svelte/icons/circle-help";
	import CalendarClock from "@lucide/svelte/icons/calendar-clock";
	import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
	import Mic from "@lucide/svelte/icons/mic";
	import Square from "@lucide/svelte/icons/square";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import Volume2 from "@lucide/svelte/icons/volume-2";
	import VolumeOff from "@lucide/svelte/icons/volume-off";
	import Play from "@lucide/svelte/icons/play";
	import { noteByPath, updateNote } from "$lib/store.svelte";
	import { ask, gemini, getSession, scheduleReviews, send, toHtml } from "$lib/trainer/trainer.svelte";
	import { voice, toggleVoice, speak, stopSpeaking, startRecording, stopRecording } from "$lib/trainer/voice.svelte";

	const id = $derived(page.params.id!);
	const s = $derived(getSession(id));
	const note = $derived(s && noteByPath(s.note));

	let tab = $state<"notes" | "board">("notes");
	let text = $state("");
	let busy = $state(false);
	let error = $state("");
	let board = $state<Whiteboard>();
	let viewport = $state<HTMLElement>();

	async function run() {
		if (!s || busy) return;
		busy = true;
		error = "";
		try {
			const i = await ask(s, note?.content ?? "", board?.snapshot() ?? null);
			if (voice.on) listen(i);
		} catch (e) {
			error = msg(e);
		} finally {
			busy = false;
		}
	}
	const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

	function listen(i: number) {
		if (voice.speaking === i || voice.loading === i) return stopSpeaking();
		speak(i, s!.messages[i].text).catch((e) =>
			// Browsers block sound until the page has been clicked; the Listen button is that click.
			(error = e?.name === "NotAllowedError" ? "Tap Listen to hear the reply." : `Couldn't play audio: ${msg(e)}`),
		);
	}

	// Push-to-talk: first tap starts the mic, second tap transcribes and sends.
	async function mic() {
		error = "";
		try {
			if (!voice.recording) return await startRecording();
			const heard = await stopRecording();
			if (heard) say(heard);
			else error = "Didn't catch that. Try again.";
		} catch (e) {
			error = e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access is blocked. Allow it in your browser settings." : msg(e);
		}
	}
	function say(msg: string) {
		if (!s || busy || !msg.trim()) return;
		send(s, msg.trim());
		run();
	}
	function submit(e: Event) {
		e.preventDefault();
		say(text);
		text = "";
	}
	const lastIsUser = $derived(s?.messages.at(-1)?.role === "user");

	// The kickoff message waits for its first answer.
	onMount(() => {
		if (lastIsUser) run();
		return () => (stopSpeaking(), voice.recording && stopRecording().catch(() => {}));
	});

	$effect(() => {
		void s?.messages.length;
		void busy;
		tick().then(() => viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" }));
	});
</script>

{#if !s}
	<p class="text-muted-foreground pt-10 text-center">Session not found. <a class="underline" href="/learn">Start one</a>.</p>
{:else}
	<div class="grid grid-cols-1 gap-4 lg:h-[calc(100svh-4.5rem)] lg:grid-cols-2">
		<!-- Lesson -->
		<section class="flex h-[80svh] min-h-0 min-w-0 flex-col rounded-xl border lg:h-auto">
			<header class="flex items-center gap-2 border-b px-4 py-2.5">
				<h1 class="flex-1 truncate font-semibold">{s.topic}</h1>
				<Button
					size="sm"
					variant={voice.on ? "secondary" : "ghost"}
					aria-pressed={voice.on}
					title={voice.on ? "Stop reading replies aloud" : "Read replies aloud"}
					onclick={toggleVoice}
				>
					{#if voice.on}<Volume2 /> Voice on{:else}<VolumeOff /> Voice off{/if}
				</Button>
				{#if s.reviews}
					<span class="text-muted-foreground shrink-0 text-xs" title="Review to-dos on {s.reviews.join(', ')}">Reviews scheduled</span>
				{:else}
					<Button size="sm" variant="ghost" onclick={() => scheduleReviews(s)} title="Adds review to-dos 1, 3, 7 and 21 days from now">
						<CalendarClock /> Schedule reviews
					</Button>
				{/if}
			</header>
			<div bind:this={viewport} class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
				{#each s.messages as m, i (i)}
					{#if m.role === "user"}
						<div class="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap">{m.text}</div>
					{:else}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- schema-filtered via generateHTML -->
						<div>
							<div class="prose-editor min-h-0! text-sm leading-6">{@html toHtml(m.text)}</div>
							<button
								class="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-xs"
								onclick={() => listen(i)}
							>
								{#if voice.loading === i}<LoaderCircle class="size-3.5 animate-spin" /> Loading voice…
								{:else if voice.speaking === i}<Square class="size-3.5" /> Stop
								{:else}<Play class="size-3.5" /> Listen{/if}
							</button>
						</div>
					{/if}
				{/each}
				{#if busy}
					<p class="text-muted-foreground animate-pulse text-sm">Trainer is thinking…</p>
				{:else if error}
					<div class="text-destructive flex items-center gap-2 text-sm">
						{error}
						{#if gemini.key && lastIsUser}<Button size="sm" variant="outline" onclick={run}><RotateCcw /> Retry</Button>{/if}
						{#if !gemini.key}<a class="underline" href="/learn">Add key</a>{/if}
					</div>
				{/if}
			</div>
			<div class="space-y-2 border-t p-3">
				<div class="flex flex-wrap gap-1.5">
					<Button size="sm" variant="outline" disabled={busy} onclick={() => say("Review my notes and whiteboard. What's right, what's wrong, what's missing?")}>
						<ScanSearch /> Review my notes & whiteboard
					</Button>
					<Button size="sm" variant="outline" disabled={busy} onclick={() => say("Quiz me on everything so far, one question at a time, mixing earlier material.")}>
						<CircleHelp /> Quiz me
					</Button>
				</div>
				<form class="flex items-end gap-2" onsubmit={submit}>
					<Textarea
						bind:value={text}
						rows={2}
						class="max-h-40 min-h-0 flex-1 resize-none"
						placeholder={voice.recording ? "Listening… tap Done when you're finished" : voice.transcribing ? "Transcribing…" : "Answer from memory, or ask a question…"}
						disabled={voice.recording || voice.transcribing}
						aria-label="Message the trainer"
						onkeydown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), say(text), (text = ""))}
					/>
					<Button
						type="button"
						size={voice.recording ? "default" : "icon"}
						variant={voice.recording ? "destructive" : "outline"}
						disabled={busy || voice.transcribing}
						aria-label={voice.recording ? "Stop and send" : "Answer by voice"}
						title={voice.recording ? "Stop and send" : "Answer by voice"}
						onclick={mic}
					>
						{#if voice.transcribing}<LoaderCircle class="animate-spin" />{:else if voice.recording}<span class="size-2 animate-pulse rounded-full bg-current"></span> Done{:else}<Mic />{/if}
					</Button>
					<Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send"><ArrowUp /></Button>
				</form>
			</div>
		</section>

		<!-- Learner's workspace: both stay mounted so switching tabs keeps the canvas. -->
		<section class="flex h-[80svh] min-h-0 min-w-0 flex-col rounded-xl border lg:h-auto">
			<div class="flex gap-1 border-b px-2 py-1.5" role="tablist">
				<Button size="sm" variant={tab === "notes" ? "secondary" : "ghost"} role="tab" aria-selected={tab === "notes"} onclick={() => (tab = "notes")}>Notes</Button>
				<Button size="sm" variant={tab === "board" ? "secondary" : "ghost"} role="tab" aria-selected={tab === "board"} onclick={() => (tab = "board")}>Whiteboard</Button>
				{#if note}<a href="/notes/{note.id}" class="text-muted-foreground hover:text-foreground ml-auto self-center px-2 text-xs underline">Open as note</a>{/if}
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto p-4" class:hidden={tab !== "notes"}>
				{#if note}
					{#key note.id}
						<Editor content={note.content} onchange={(content) => updateNote(note.id, { content })} />
					{/key}
				{:else}
					<p class="text-muted-foreground text-sm">This session's note was renamed or deleted.</p>
				{/if}
			</div>
			<div class="min-h-0 flex-1 p-4" class:hidden={tab !== "board"}>
				{#key id}<Whiteboard bind:this={board} {id} />{/key}
			</div>
		</section>
	</div>
{/if}
