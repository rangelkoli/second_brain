<script lang="ts">
	import { onMount, tick } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import Editor from "$lib/editor/editor.svelte";
	import Whiteboard from "$lib/trainer/whiteboard.svelte";
	import LabPlayer from "$lib/trainer/labs/LabPlayer.svelte";
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
	import Sparkles from "@lucide/svelte/icons/sparkles";
	import Music from "@lucide/svelte/icons/music";
	import Code2 from "@lucide/svelte/icons/code-2";
	import Triangle from "@lucide/svelte/icons/triangle";
	import Atom from "@lucide/svelte/icons/atom";
	import Cpu from "@lucide/svelte/icons/cpu";
	import Languages from "@lucide/svelte/icons/languages";
	import Compass from "@lucide/svelte/icons/compass";
	import GitFork from "@lucide/svelte/icons/git-fork";
	import Globe from "@lucide/svelte/icons/globe";
	import Lightbulb from "@lucide/svelte/icons/lightbulb";
	import { noteByPath, updateNote } from "$lib/store.svelte";
	import { auth } from "$lib/sync.svelte";
	import { effectiveVerdict, inferSubjectTheme, type Lab } from "$lib/trainer/lab";
	import {
		ask,
		errors,
		getSession,
		grade,
		latestLab,
		notice,
		pending,
		priorTries,
		recordGrade,
		scheduleReviews,
		send,
		startSession,
		synced,
		toggleOverride,
		toHtml,
		type Session,
	} from "$lib/trainer/trainer.svelte";
	import { voice, toggleVoice, speak, stopSpeaking, startRecording, stopRecording } from "$lib/trainer/voice.svelte";

	const id = $derived(page.params.id!);
	const s = $derived(getSession(id));
	const note = $derived(s && noteByPath(s.note));
	let checking = $state<string | null>(null); // session id whose answer is being graded
	const busy = $derived(Boolean(pending[id]) || checking === id);
	const theme = $derived(s ? inferSubjectTheme(s.topic) : "general");

	let tab = $state<"lab" | "notes" | "board">("notes");
	let text = $state("");
	let localErr = $state("");
	let board = $state<Whiteboard>();
	let viewport = $state<HTMLElement>();
	let selectedLab = $state<Lab | null>(null);
	let unseenLab = $state(false);
	let grounding = $state(false); // Google Search grounding for the tutor, off by default
	let input = $state<HTMLTextAreaElement | null>(null);
	const REVIEW = "Review my notes and whiteboard. What's right, what's wrong, what's missing?";

	const error = $derived(localErr || errors[id] || "");
	const activeLab = $derived(selectedLab ?? (s ? latestLab(s) : undefined));

	// Reset selected lab when switching sessions; show Lab tab first if a session already has a lab and no notes.
	let prevSessionId = "";
	$effect(() => {
		if (id !== prevSessionId) {
			prevSessionId = id;
			selectedLab = null;
			unseenLab = false;
			localErr = "";
			confidence?.resolve(undefined); // leaving mid-prompt counts as skipped
			const hasLab = s ? Boolean(latestLab(s)) : false;
			tab = hasLab ? "lab" : "notes";
		}
	});

	async function run(targetSession: Session | undefined = s) {
		if (!targetSession || pending[targetSession.id]) return;
		localErr = "";
		const targetId = targetSession.id;
		const here = id === targetId; // notes, board and open lab only belong to the session on screen
		try {
			const i = await ask(targetSession, {
				notes: here ? (note?.content ?? "") : (noteByPath(targetSession.note)?.content ?? ""),
				board: here ? (board?.snapshot() ?? null) : null,
				lab: here ? activeLab : latestLab(targetSession),
				forceBoard: targetSession.messages.at(-1)?.text === REVIEW,
				grounding,
			});
			if (i < 0) return;
			const newLab = targetSession.messages[i]?.lab;
			if (newLab && id === targetId) {
				selectedLab = newLab;
				if (tab === "notes" || tab === "board") {
					// Switch to Lab automatically on the kickoff turn or when user isn't mid-note; otherwise notify gently.
					if (targetSession.messages.length <= 2) tab = "lab";
					else unseenLab = true;
				}
			}
			if (voice.on && id === targetId) listen(i);
		} catch (e) {
			if (id === targetId) localErr = msg(e);
		}
	}
	const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

	function listen(i: number) {
		if (voice.speaking === i || voice.loading === i) return stopSpeaking();
		speak(i, s!.messages[i].text).catch((e) =>
			// Browsers block sound until the page has been clicked; the Listen button is that click.
			(localErr = e?.name === "NotAllowedError" ? "Tap Listen to hear the reply." : `Couldn't play audio: ${msg(e)}`),
		);
	}

	// Push-to-talk: first tap starts the mic, second tap transcribes into the box to confirm or edit before sending.
	async function mic() {
		localErr = "";
		try {
			if (!voice.recording) return await startRecording();
			const heard = await stopRecording();
			if (heard) {
				text = text.trim() ? `${text.trim()} ${heard}` : heard;
				tick().then(() => input?.focus());
			} else localErr = "Didn't catch that. Try again.";
		} catch (e) {
			localErr = e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access is blocked. Allow it in your browser settings." : msg(e);
		}
	}

	function say(content: string) {
		if (!s || busy || !content.trim()) return;
		send(s, content.trim());
		run();
	}

	// The tutor's question still waiting for an answer: the last turn, if it asked one.
	const openCheck = $derived.by(() => {
		const m = s?.messages.at(-1);
		return m?.role === "model" ? m.check && { ...m.check, concepts: m.concepts ?? [] } : undefined;
	});

	// One-tap 1-4 confidence, collected before the verdict is shown.
	let confidence = $state<{ sid: string; i: number; resolve: (v: number | undefined) => void } | null>(null);
	const askConfidence = (sid: string, i: number) =>
		new Promise<number | undefined>((ok) => (confidence = { sid, i, resolve: (v) => ((confidence = null), ok(v)) }));
	const CONFIDENCE = ["Guessing", "Unsure", "Fairly sure", "Certain"];

	// A typed or spoken answer to an open question is graded by a separate call before the tutor replies.
	async function answer(content: string) {
		const target = s;
		const check = openCheck;
		if (!target || busy || !content.trim()) return;
		if (!check) return say(content);
		const i = send(target, content.trim());
		checking = target.id;
		const sure = askConfidence(target.id, i);
		try {
			const { attempted, ...g } = await grade(check.question, check.keyPoints, content.trim());
			if (!attempted) {
				confidence?.resolve(undefined);
				return;
			}
			const conf = await sure;
			recordGrade(target, i, { ...check, ...g, confidence: conf, hints: priorTries(target, check.question) });
		} catch (e) {
			confidence?.resolve(undefined);
			console.error("grader:", e); // the tutor still judges the answer itself
		} finally {
			checking = null;
			run(target);
		}
	}

	// "Show me": reveal the full worked answer; logged as a hint so the question earns no credit.
	function showMe() {
		const check = openCheck;
		if (!s || busy || !check) return;
		const hints = priorTries(s, check.question) + 1;
		const i = send(s, "Show me the full worked answer.");
		recordGrade(s, i, { ...check, covered: [], missed: check.keyPoints, verdict: "wrong", hints, shown: true });
		run();
	}

	const VERDICT = {
		correct: { label: "Correct", cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
		partial: { label: "Partly right", cls: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
		wrong: { label: "Not quite", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
	};

	// A lab check finished while the tutor is still replying: hold it and send once the reply lands.
	let queuedCheck = $state<{ id: string; summary: string } | null>(null);
	function reportCheck(summary: string) {
		if (!s) return false;
		if (busy) queuedCheck = { id, summary };
		else say(summary);
		return true;
	}
	$effect(() => {
		if (!busy && queuedCheck?.id === id) {
			const { summary } = queuedCheck;
			queuedCheck = null;
			say(summary);
		}
	});

	function submit(e: Event) {
		e.preventDefault();
		answer(text);
		text = "";
	}

	function openLab(lab: Lab) {
		selectedLab = lab;
		tab = "lab";
		unseenLab = false;
	}

	function spawnTopicSession(suggested: string) {
		const newId = startSession(suggested, "");
		goto(`/learn/${newId}`);
	}

	const lastIsUser = $derived(s?.messages.at(-1)?.role === "user");

	const THINKING_LABEL: Record<string, string> = {
		music: "Composing interactive audio & notation…",
		code: "Tracing steps & building code lab…",
		math: "Sketching geometry & math visual…",
		physics: "Simulating motion & vectors…",
		electronics: "Wiring interactive circuit sketch…",
		language: "Preparing pronunciation & practice…",
		art: "Finding reference visual & callouts…",
		general: "Trainer is sketching your lesson…",
	};

	// The kickoff message waits for its first answer.
	onMount(() => {
		if (lastIsUser && !busy) run();
		return () => (stopSpeaking(), voice.recording && stopRecording().catch(() => {}));
	});

	$effect(() => {
		void s?.messages.length;
		void busy;
		void confidence;
		tick().then(() => viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" }));
	});
</script>

{#if !s}
	{#if auth.valid && !synced.pulled}
		<p class="text-muted-foreground pt-10 text-center">Loading session…</p>
	{:else}
		<p class="text-muted-foreground pt-10 text-center">Session not found. <a class="underline" href="/learn">Start one</a>.</p>
	{/if}
{:else}
	<div class="grid grid-cols-1 gap-4 lg:h-[calc(100svh-4.5rem)] lg:grid-cols-2">
		<!-- Lesson -->
		<section class="flex h-[80svh] min-h-0 min-w-0 flex-col rounded-xl border lg:h-auto">
			<header class="flex items-center gap-2 border-b px-4 py-2.5">
				<h1 class="flex-1 truncate font-semibold">{s.topic}</h1>
				<Button
					size="sm"
					variant={grounding ? "secondary" : "ghost"}
					aria-pressed={grounding}
					title={grounding ? "Stop checking replies against Google Search" : "Check replies against Google Search (shows sources)"}
					onclick={() => (grounding = !grounding)}
				>
					<Globe /> Search {grounding ? "on" : "off"}
				</Button>
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
			{#if notice.text}
				<div role="status" class="text-destructive flex items-center gap-2 border-b px-4 py-1.5 text-xs">
					<span class="flex-1">{notice.text}</span>
					<button class="underline" onclick={() => (notice.text = "")}>Dismiss</button>
				</div>
			{/if}
			<div bind:this={viewport} class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
				{#each s.messages as m, i (i)}
					{#if m.role === "user"}
						<div class="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap">{m.text}</div>
						{#if confidence?.sid === id && confidence.i === i}
							<div class="ml-auto flex w-fit flex-wrap items-center justify-end gap-1.5 text-xs" role="group" aria-label="How sure are you?">
								<span class="text-muted-foreground">How sure are you?</span>
								{#each CONFIDENCE as label, c (c)}
									<Button size="sm" variant="outline" class="h-7 px-2 text-xs" onclick={() => confidence?.resolve(c + 1)}>{c + 1} · {label}</Button>
								{/each}
								<Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={() => confidence?.resolve(undefined)}>Skip</Button>
							</div>
						{:else if m.grade?.shown}
							<div class="text-muted-foreground -mt-2 ml-auto w-fit text-xs">Answer shown · no credit</div>
						{:else if m.grade}
							{@const v = effectiveVerdict(m.grade)}
							<div class="-mt-2 ml-auto flex w-fit items-center gap-2 text-xs">
								<span class="rounded-full border px-2.5 py-0.5 font-medium {VERDICT[v].cls}">
									{VERDICT[v].label}{m.grade.override ? " (your call)" : ""}
								</span>
								<button class="text-muted-foreground hover:text-foreground underline" onclick={() => toggleOverride(s, i)}>
									{m.grade.override ? "Undo" : m.grade.verdict === "correct" ? "I was wrong" : "I was right"}
								</button>
							</div>
						{/if}
					{:else}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- schema-filtered via generateHTML -->
						<div>
							<div class="prose-editor min-h-0! text-sm leading-6">{@html toHtml(m.text)}</div>
							<div class="mt-1.5 flex flex-wrap items-center gap-2">
								<button
									class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
									onclick={() => listen(i)}
								>
									{#if voice.loading === i}<LoaderCircle class="size-3.5 animate-spin" /> Loading voice…
									{:else if voice.speaking === i}<Square class="size-3.5" /> Stop
									{:else}<Play class="size-3.5" /> Listen{/if}
								</button>

								{#if m.lab}
									<button
										type="button"
										class="bg-muted/60 hover:bg-accent inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
										onclick={() => openLab(m.lab!)}
									>
										<Sparkles class="size-3" /> {m.lab.title}
									</button>
								{/if}

								{#if m.sources}
									<span class="text-muted-foreground inline-flex flex-wrap items-center gap-x-2 text-xs">
										Sources:
										{#each m.sources as src, n (src.uri)}
											<a class="hover:text-foreground underline" href={src.uri} target="_blank" rel="noopener noreferrer">[{n + 1}] {src.title}</a>
										{/each}
									</span>
								{/if}

								{#if m.topicSuggestion}
									<button
										type="button"
										class="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
										onclick={() => spawnTopicSession(m.topicSuggestion!)}
									>
										<GitFork class="size-3" /> Start separate session: {m.topicSuggestion}
									</button>
								{/if}
							</div>
							{#if m.searchWidget}
								<!-- Google's required Search Suggestions, isolated: no scripts, links open in a new tab. -->
								<iframe
									title="Google Search suggestions"
									class="mt-1.5 h-14 w-full rounded-lg"
									sandbox="allow-popups allow-popups-to-escape-sandbox"
									srcdoc={`<base target="_blank"><style>body{margin:0}</style>${m.searchWidget}`}
								></iframe>
							{/if}
						</div>
					{/if}
				{/each}
				{#if busy}
					<div class="bg-muted/40 text-muted-foreground inline-flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs">
						{#if theme === "music"}
							<Music class="text-primary size-4 animate-bounce" />
						{:else if theme === "code"}
							<Code2 class="text-primary size-4 animate-pulse" />
						{:else if theme === "math"}
							<Triangle class="text-primary size-4 animate-spin" />
						{:else if theme === "physics"}
							<Atom class="text-primary size-4 animate-spin" />
						{:else if theme === "electronics"}
							<Cpu class="text-primary size-4 animate-pulse" />
						{:else if theme === "language"}
							<Languages class="text-primary size-4 animate-pulse" />
						{:else}
							<Compass class="text-primary size-4 animate-spin" />
						{/if}
						<span>{checking === id ? "Checking your answer…" : (THINKING_LABEL[theme] ?? THINKING_LABEL.general)}</span>
					</div>
				{:else if error}
					<div class="text-destructive flex items-center gap-2 text-sm">
						{error}
						{#if auth.valid && lastIsUser}<Button size="sm" variant="outline" onclick={() => run()}><RotateCcw /> Retry</Button>{/if}
						{#if !auth.valid}<a class="underline" href="/login">Sign in</a>{/if}
					</div>
				{/if}
			</div>
			<div class="space-y-2 border-t p-3">
				<div class="flex flex-wrap gap-1.5">
					{#if openCheck}
						<Button size="sm" variant="outline" disabled={busy} onclick={showMe} title="See the full worked answer (this question then earns no credit)">
							<Lightbulb /> Show me
						</Button>
					{/if}
					<Button size="sm" variant="outline" disabled={busy} onclick={() => say(REVIEW)}>
						<ScanSearch /> Review my notes & whiteboard
					</Button>
					<Button size="sm" variant="outline" disabled={busy} onclick={() => say("Quiz me on everything so far, one question at a time, mixing earlier material.")}>
						<CircleHelp /> Quiz me
					</Button>
				</div>
				<form class="flex items-end gap-2" onsubmit={submit}>
					<Textarea
						bind:ref={input}
						bind:value={text}
						rows={2}
						class="max-h-40 min-h-0 flex-1 resize-none"
						placeholder={voice.recording ? "Listening… tap Done when you're finished" : voice.transcribing ? "Transcribing…" : "Answer from memory, or ask a question…"}
						disabled={voice.recording || voice.transcribing}
						aria-label="Message the trainer"
						onkeydown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), answer(text), (text = ""))}
					/>
					<Button
						type="button"
						size={voice.recording ? "default" : "icon"}
						variant={voice.recording ? "destructive" : "outline"}
						disabled={busy || voice.transcribing}
						aria-label={voice.recording ? "Stop recording" : "Answer by voice"}
						title={voice.recording ? "Stop and put what you said in the box" : "Answer by voice"}
						onclick={mic}
					>
						{#if voice.transcribing}<LoaderCircle class="animate-spin" />{:else if voice.recording}<span class="size-2 animate-pulse rounded-full bg-current"></span> Done{:else}<Mic />{/if}
					</Button>
					<Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send"><ArrowUp /></Button>
				</form>
			</div>
		</section>

		<!-- Learner's workspace: Lab + Notes + Whiteboard stay mounted so switching tabs keeps state. -->
		<section class="flex h-[80svh] min-h-0 min-w-0 flex-col rounded-xl border lg:h-auto">
			<div class="flex items-center gap-1 border-b px-2 py-1.5" role="tablist">
				<Button
					size="sm"
					variant={tab === "lab" ? "secondary" : "ghost"}
					role="tab"
					aria-selected={tab === "lab"}
					onclick={() => {
						tab = "lab";
						unseenLab = false;
					}}
				>
					<Sparkles class="size-3.5" /> Lab
					{#if unseenLab && tab !== "lab"}
						<span class="bg-primary size-1.5 rounded-full"></span>
					{/if}
				</Button>
				<Button size="sm" variant={tab === "notes" ? "secondary" : "ghost"} role="tab" aria-selected={tab === "notes"} onclick={() => (tab = "notes")}>Notes</Button>
				<Button size="sm" variant={tab === "board" ? "secondary" : "ghost"} role="tab" aria-selected={tab === "board"} onclick={() => (tab = "board")}>Whiteboard</Button>
				{#if note}<a href="/notes/{note.id}" class="text-muted-foreground hover:text-foreground ml-auto self-center px-2 text-xs underline">Open as note</a>{/if}
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-4" class:hidden={tab !== "lab"}>
				{#if activeLab}
					<LabPlayer lab={activeLab} onCheckComplete={reportCheck} />
				{:else}
					<div class="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
						<Sparkles class="size-6 opacity-40" />
						<p>Interactive visuals, audio instruments, and step-by-step demos appear here as your trainer explains concepts.</p>
					</div>
				{/if}
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
