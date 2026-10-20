<script lang="ts">
	import { onMount, tick } from "svelte";
	import { fly, slide } from "svelte/transition";
	import { convertFileSrc } from "@tauri-apps/api/core";
	import * as InputGroup from "$lib/components/ui/input-group/index.js";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Kbd } from "$lib/components/ui/kbd/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import Sparkles from "@lucide/svelte/icons/sparkles";
	import ArrowUp from "@lucide/svelte/icons/arrow-up";
	import Square from "@lucide/svelte/icons/square";
	import Paperclip from "@lucide/svelte/icons/paperclip";
	import AtSign from "@lucide/svelte/icons/at-sign";
	import X from "@lucide/svelte/icons/x";
	import FileText from "@lucide/svelte/icons/file-text";
	import FileIcon from "@lucide/svelte/icons/file";
	import PenLine from "@lucide/svelte/icons/pen-line";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
	import Play from "@lucide/svelte/icons/play";
	import ListPlus from "@lucide/svelte/icons/list-plus";
	import CornerDownLeft from "@lucide/svelte/icons/corner-down-left";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import { session, type Attachment, type Draft } from "./codex.svelte";
	import { db, getNote, noteByPath } from "$lib/store.svelte";
	import { saveAttachment } from "$lib/sync.svelte";

	let { scope, placeholder }: { scope: string; placeholder: string } = $props();
	const s = $derived(session(scope));
	const sidebar = useSidebar(); // center the dock over the content column, not the window

	let text = $state("");
	let attachments = $state<Attachment[]>([]);
	let mentions = $state<string[]>([]); // note ids picked with "@"
	let open = $state(false);
	let input = $state<HTMLTextAreaElement | null>(null);
	let picker: HTMLInputElement;
	let viewport = $state<HTMLElement | null>(null);
	let dragging = $state(false);

	onMount(() => (s.load(), s.warm()));

	// Open the transcript whenever Codex starts working or needs something.
	$effect(() => {
		if (s.busy || s.ask) open = true;
	});

	// Keep the newest message in view while streaming.
	$effect(() => {
		const last = s.entries.at(-1);
		void (last && "text" in last && last.text);
		void s.entries.length;
		void s.ask;
		void s.status;
		void s.queue.length;
		if (open) tick().then(() => viewport?.scrollTo({ top: viewport.scrollHeight }));
	});

	// Elapsed time while working, refreshed once a second only when busy.
	let now = $state(Date.now());
	$effect(() => {
		if (!s.busy) return;
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
	const elapsed = $derived.by(() => {
		const sec = Math.max(0, Math.round((now - s.startedAt) / 1000));
		return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
	});

	const STATUS = {
		idle: { label: "Ready", dot: "bg-emerald-500" },
		starting: { label: "Starting", dot: "bg-violet-500 animate-pulse" },
		working: { label: "Working", dot: "bg-violet-500 animate-pulse" },
		waiting: { label: "Needs you", dot: "bg-amber-500 animate-pulse" },
		paused: { label: "Paused", dot: "bg-muted-foreground" },
		error: { label: "Error", dot: "bg-destructive" },
	} as const;
	const status = $derived(STATUS[s.status]);

	// --- "@" note mentions ---
	let mention = $state<{ start: number; query: string } | null>(null);
	let mi = $state(0);
	const matches = $derived(
		mention
			? db.notes.filter((n) => n.id !== scope && (n.title || "Untitled").toLowerCase().includes(mention!.query.toLowerCase())).slice(0, 6)
			: [],
	);

	function detectMention() {
		const el = input!;
		const before = el.value.slice(0, el.selectionStart);
		const m = /(^|\s)@([^\s@]*)$/.exec(before);
		mention = m ? { start: before.length - m[2].length - 1, query: m[2] } : null;
		mi = 0;
	}

	function pickMention(id: string) {
		const n = getNote(id)!;
		const name = n.title || "Untitled";
		const end = input!.selectionStart;
		const caret = mention!.start + name.length + 2;
		text = `${text.slice(0, mention!.start)}@${name} ${text.slice(end)}`;
		if (!mentions.includes(id)) mentions.push(id);
		mention = null;
		tick().then(() => input?.setSelectionRange(caret, caret));
	}

	function startMention() {
		const pos = input?.selectionStart ?? text.length;
		const pad = pos && !/\s/.test(text[pos - 1]) ? " " : "";
		text = `${text.slice(0, pos)}${pad}@${text.slice(pos)}`;
		tick().then(() => {
			input?.focus();
			input?.setSelectionRange(pos + pad.length + 1, pos + pad.length + 1);
			detectMention();
		});
	}

	// --- attachments ---
	async function attach(files: File[]) {
		for (const f of files) {
			const path = await saveAttachment(f);
			attachments.push({ path, name: f.name || path.split("/").pop()!, image: f.type.startsWith("image/") });
		}
	}

	function onpaste(e: ClipboardEvent) {
		const files = [...(e.clipboardData?.files ?? [])];
		if (files.length) {
			e.preventDefault();
			attach(files);
		}
	}

	// --- sending ---
	function submit() {
		const t = text.trim();
		if (!t && !attachments.length) return;
		const d: Draft = {
			text: t || "See the attached files.",
			attachments,
			mentions: mentions.filter((id) => t.includes(`@${getNote(id)?.title || "Untitled"}`)),
		};
		text = "";
		attachments = [];
		mentions = [];
		mention = null;
		open = true;
		s.submit(d);
	}

	function onkeydown(e: KeyboardEvent) {
		if (mention && matches.length) {
			if (e.key === "ArrowDown") mi = (mi + 1) % matches.length;
			else if (e.key === "ArrowUp") mi = (mi - 1 + matches.length) % matches.length;
			else if (e.key === "Enter" || e.key === "Tab") pickMention(matches[mi].id);
			else if (e.key === "Escape") mention = null;
			else return;
			e.preventDefault();
			return;
		}
		if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			submit();
		} else if (e.key === "Escape") {
			if (s.busy) s.stop();
			else open = false;
		}
	}

	// --- questions from Codex ---
	let picks = $state<Record<string, string[]>>({});
	let others = $state<Record<string, string>>({});
	$effect(() => {
		void s.ask;
		picks = {};
		others = {};
	});
	function sendAnswers() {
		if (s.ask?.kind !== "questions") return;
		const out: Record<string, string[]> = {};
		for (const q of s.ask.questions) {
			const other = others[q.id]?.trim();
			out[q.id] = other ? [...(picks[q.id] ?? []), other] : (picks[q.id] ?? []);
		}
		s.answer(out);
	}
	const answered = $derived(s.ask?.kind === "questions" && s.ask.questions.every((q) => picks[q.id]?.length || others[q.id]?.trim()));

	// Agent text is markdown; show it readable without pulling in a renderer.
	const plain = (t: string) =>
		t
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/\*\*([^*]+)\*\*/g, "$1")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/==([^=]+)==/g, "$1");

	const noteFor = (p: string) => (p.endsWith(".md") ? noteByPath(p.slice(0, -3)) : undefined);
	const label = (p: string) => noteFor(p)?.title || p.split("/").pop()!;
	const thumb = (p: string) => convertFileSrc(`${db.vault}/${p}`);
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 transition-[left] duration-200 ease-linear"
	style:left={sidebar.open && !sidebar.isMobile ? "var(--sidebar-width)" : "0"}
	role="region"
	aria-label="Codex"
	ondragover={(e) => {
		if (e.dataTransfer?.types.includes("Files")) (e.preventDefault(), (dragging = true));
	}}
	ondragleave={() => (dragging = false)}
	ondrop={(e) => {
		e.preventDefault();
		dragging = false;
		attach([...(e.dataTransfer?.files ?? [])]);
	}}
>
	<div class="pointer-events-auto w-full max-w-2xl">
		<div
			class="bg-popover/95 supports-[backdrop-filter]:bg-popover/90 relative rounded-2xl border shadow-2xl shadow-black/50 ring-1 ring-black/[0.03] dark:ring-white/[0.04] backdrop-blur-xl transition-shadow
				{s.busy ? 'agent-glow' : ''} {dragging ? 'ring-ring ring-2' : ''}"
		>
			{#if open && (s.entries.length || s.ask || s.queue.length)}
				<div class="border-b" transition:slide={{ duration: 180 }}>
					<!-- header -->
					<div class="flex items-center gap-2 border-b px-3 py-2">
						<span class="relative flex size-2">
							<span class="size-2 rounded-full {status.dot}"></span>
						</span>
						<span class="text-sm font-medium">{status.label}</span>
						{#if s.busy}
							<span class="text-muted-foreground shimmer truncate text-sm" aria-live="polite">{s.status === "waiting" ? "Waiting for your answer" : s.activity || "Working"}…</span>
							<span class="text-muted-foreground ml-auto text-xs tabular-nums">{elapsed}</span>
						{:else}
							<span class="ml-auto"></span>
						{/if}
						{#if !s.busy}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="ghost" size="icon-sm" aria-label="New conversation" onclick={() => s.reset()}>
										<RotateCcw class="size-3.5" />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>New conversation</Tooltip.Content>
						</Tooltip.Root>
						{/if}
						<Button variant="ghost" size="icon-sm" aria-label="Hide conversation" onclick={() => (open = false)}>
							<ChevronDown class="size-4" />
						</Button>
					</div>

					<!-- transcript -->
					<div class="max-h-[min(20rem,40vh)] overflow-y-auto overscroll-contain [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,transparent,black_0.75rem)]" bind:this={viewport}>
						<div class="space-y-3 px-4 py-3 text-sm">
							{#each s.entries as e (e.id)}
								{#if e.kind === "user"}
									<div class="flex flex-col items-end gap-1" in:fly={{ y: 6, duration: 150 }}>
										{#if e.attachments.length}
											<div class="flex flex-wrap justify-end gap-1">
												{#each e.attachments as a (a.path)}
													<Badge variant="outline" class="font-normal"><Paperclip />{a.name}</Badge>
												{/each}
											</div>
										{/if}
										<p class="bg-secondary max-w-[85%] rounded-2xl rounded-br-md px-3 py-1.5 whitespace-pre-wrap">{e.text}</p>
									</div>
								{:else if e.kind === "agent"}
									{#if e.text}
									<p class="whitespace-pre-wrap {e.final ? 'leading-relaxed' : 'text-muted-foreground border-l-2 pl-3 text-[13px]'}" in:fly={{ y: 6, duration: 150 }}>
										{plain(e.text)}
									</p>{/if}
								{:else if e.kind === "edit"}
									<div class="flex flex-wrap items-center gap-1.5" in:fly={{ y: 6, duration: 150 }}>
										<span class="text-muted-foreground flex items-center gap-1 text-xs"><PenLine class="size-3" />Edited</span>
										{#each e.paths as p (p)}
											{@const n = noteFor(p)}
											<Badge variant="secondary" href={n ? `/notes/${n.id}` : undefined} class="font-normal">
												<FileText />{label(p)}
											</Badge>
										{/each}
									</div>
								{:else}
									<p class="text-destructive flex items-start gap-1.5 text-xs"><CircleAlert class="mt-0.5 size-3.5 shrink-0" />{e.text}</p>
								{/if}
							{/each}

							{#if s.ask?.kind === "questions"}
								<div class="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.03] p-3" in:fly={{ y: 8, duration: 180 }}>
									{#each s.ask.questions as q (q.id)}
										<div class="space-y-2">
											<div class="flex items-center gap-2">
												{#if q.header}<Badge variant="outline" class="border-amber-500/40 text-amber-700 dark:text-amber-300">{q.header}</Badge>{/if}
												<p class="font-medium">{q.question}</p>
											</div>
											{#if q.options.length}
												<div class="grid gap-1.5 sm:grid-cols-2">
													{#each q.options as o (o.label)}
														{@const on = picks[q.id]?.includes(o.label)}
														<button
															class="hover:bg-accent rounded-lg border px-3 py-2 text-left transition-colors {on ? 'border-primary bg-accent' : ''}"
															aria-pressed={on}
															onclick={() => (picks[q.id] = on ? [] : [o.label])}
														>
															<span class="block text-sm font-medium">{o.label}</span>
															{#if o.description}<span class="text-muted-foreground block text-xs">{o.description}</span>{/if}
														</button>
													{/each}
												</div>
											{/if}
											{#if q.other || !q.options.length}
												<input
													class="bg-transparent focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus-visible:ring-3"
													placeholder={q.options.length ? "Something else…" : "Your answer…"}
													bind:value={others[q.id]}
													onkeydown={(e) => e.key === "Enter" && answered && sendAnswers()}
												/>
											{/if}
										</div>
									{/each}
									<div class="flex justify-end">
										<Button size="sm" disabled={!answered} onclick={sendAnswers}>Answer<CornerDownLeft /></Button>
									</div>
								</div>
							{:else if s.ask?.kind === "approval"}
								<div class="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.03] p-3" in:fly={{ y: 8, duration: 180 }}>
									<p class="font-medium">{s.ask.title}</p>
									{#if s.ask.detail}<pre class="bg-muted overflow-x-auto rounded-md px-2 py-1.5 font-mono text-xs">{s.ask.detail}</pre>{/if}
									<div class="flex justify-end gap-2">
										<Button size="sm" variant="outline" onclick={() => s.approve(false)}>Deny</Button>
										<Button size="sm" onclick={() => s.approve(true)}>Allow</Button>
									</div>
								</div>
							{/if}

							{#if s.status === "paused"}
								<div class="bg-muted/50 flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
									<span class="text-muted-foreground text-xs">Paused. Pick up where Codex stopped, or ask for something else.</span>
									<Button size="sm" variant="secondary" onclick={() => s.submit({ text: "Continue where you left off.", attachments: [], mentions: [] })}>
										<Play />Resume
									</Button>
								</div>
							{/if}
						</div>
					</div>

					{#if s.queue.length}
						<div class="space-y-1 border-t px-3 py-2">
							<p class="text-muted-foreground text-xs font-medium">Up next</p>
							{#each s.queue as q, i (q)}
								<div class="group flex items-center gap-2 text-sm" transition:slide={{ duration: 150 }}>
									<ListPlus class="text-muted-foreground size-3.5 shrink-0" />
									<span class="flex-1 truncate">{q.text}</span>
									<Button variant="ghost" size="xs" class="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onclick={() => s.steer(i)}>Send now</Button>
									<Button variant="ghost" size="icon-xs" aria-label="Remove from queue" onclick={() => s.queue.splice(i, 1)}><X /></Button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if s.entries.length}
				<button
					class="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 border-b px-3 py-1.5 text-xs transition-colors"
					onclick={() => (open = true)}
				>
					<span class="size-1.5 rounded-full {status.dot}"></span>
					<span class="truncate">{s.busy ? `${s.activity || "Working"}…` : status.label === "Ready" ? "Show conversation" : status.label}</span>
				</button>
			{/if}

			<!-- composer -->
			<div class="relative">
				{#if mention && matches.length}
					<div class="bg-popover absolute bottom-full left-3 z-10 mb-2 w-72 rounded-lg border p-1 shadow-lg" transition:fly={{ y: 4, duration: 120 }}>
						<p class="text-muted-foreground px-2 py-1 text-xs font-medium">Reference a note</p>
						{#each matches as n, i (n.id)}
							<button
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm {i === mi ? 'bg-accent' : ''}"
								onmouseenter={() => (mi = i)}
								onmousedown={(e) => e.preventDefault()}
								onclick={() => pickMention(n.id)}
							>
								<FileText class="text-muted-foreground size-4 shrink-0" />
								<span class="truncate">{n.title || "Untitled"}</span>
							</button>
						{/each}
					</div>
				{/if}

				<InputGroup.Root class="rounded-none border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
					{#if attachments.length || mentions.length}
						<InputGroup.Addon align="block-start" class="flex-wrap gap-1.5">
							{#each mentions as id (id)}
								<Badge variant="secondary" class="font-normal"><AtSign />{getNote(id)?.title || "Untitled"}</Badge>
							{/each}
							{#each attachments as a, i (a.path)}
								<span class="bg-background group/att relative flex h-8 items-center gap-1.5 rounded-md border pr-1.5 text-xs">
									{#if a.image}
										<img src={thumb(a.path)} alt="" class="size-8 rounded-l-md object-cover" />
									{:else}
										<FileIcon class="ml-1.5 size-3.5" />
									{/if}
									<span class="max-w-32 truncate">{a.name}</span>
									<button aria-label="Remove {a.name}" class="text-muted-foreground hover:text-foreground" onclick={() => attachments.splice(i, 1)}>
										<X class="size-3" />
									</button>
								</span>
							{/each}
						</InputGroup.Addon>
					{/if}
					<InputGroup.Textarea
						bind:ref={input}
						bind:value={text}
						rows={1}
						class="max-h-40 min-h-11 px-4 pt-3 text-[15px]"
						placeholder={s.status === "waiting" ? "Answer above, or queue a follow-up…" : s.busy ? "Add a follow-up — it runs when Codex finishes…" : placeholder}
						aria-label={placeholder}
						oninput={detectMention}
						onclick={detectMention}
						{onkeydown}
						{onpaste}
						onfocus={() => s.warm()}
					/>
					<InputGroup.Addon align="block-end" class="gap-1 px-2">
						<InputGroup.Button size="icon-sm" aria-label="Attach files or screenshots" onclick={() => picker.click()}>
							<Paperclip />
						</InputGroup.Button>
						<InputGroup.Button size="icon-sm" aria-label="Reference a note" onclick={startMention}>
							<AtSign />
						</InputGroup.Button>
						<span class="text-muted-foreground ml-1 hidden items-center gap-1 text-xs sm:flex">
							<Sparkles class="size-3 {s.busy ? 'text-violet-500' : ''}" />Codex
						</span>
						<span class="ml-auto flex items-center gap-1.5">
							{#if !s.busy && text}
								<span class="text-muted-foreground hidden text-xs sm:inline"><Kbd>↵</Kbd> send · <Kbd>⇧↵</Kbd> newline</span>
							{/if}
							{#if s.busy}
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<Button {...props} size="icon-sm" variant="secondary" class="rounded-full" aria-label="Pause Codex" onclick={() => s.stop()}>
												<Square class="size-3 fill-current" />
											</Button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>Pause <Kbd>Esc</Kbd></Tooltip.Content>
								</Tooltip.Root>
							{/if}
							<Button
								size="icon-sm"
								class="rounded-full {s.busy && !text.trim() && !attachments.length ? 'hidden' : ''}"
								aria-label={s.busy ? "Queue follow-up" : "Send"}
								disabled={!text.trim() && !attachments.length}
								onclick={submit}
							>
								{#if s.busy}<ListPlus />{:else}<ArrowUp />{/if}
							</Button>
						</span>
					</InputGroup.Addon>
				</InputGroup.Root>
			</div>
		</div>
	</div>
</div>

<input
	bind:this={picker}
	type="file"
	multiple
	class="hidden"
	onchange={(e) => {
		attach([...(e.currentTarget.files ?? [])]);
		e.currentTarget.value = "";
	}}
/>

<style>
	/* Soft animated rim while Codex works */
	.agent-glow::before {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		background: conic-gradient(from var(--a), transparent 0 70%, var(--color-violet-500) 85%, var(--color-sky-400) 92%, transparent);
		mask:
			linear-gradient(#000 0 0) content-box exclude,
			linear-gradient(#000 0 0);
		animation: spin 2.4s linear infinite;
		pointer-events: none;
	}
	@property --a {
		syntax: "<angle>";
		inherits: false;
		initial-value: 0deg;
	}
	@keyframes spin {
		to {
			--a: 360deg;
		}
	}
	.shimmer {
		background: linear-gradient(90deg, currentColor 40%, var(--color-foreground) 50%, currentColor 60%) 0 0 / 200% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		animation: shimmer 1.8s linear infinite;
	}
	@keyframes shimmer {
		to {
			background-position: -200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.agent-glow::before,
		.shimmer {
			animation: none;
		}
	}
</style>
