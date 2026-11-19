<script lang="ts">
	import { onMount } from "svelte";
	import { wrapSketchHtml, type LabStep, type SketchPayload } from "../lab";

	let { sketch, stepIndex, step, stepCount }: { sketch: SketchPayload; stepIndex: number; step: LabStep; stepCount: number } = $props();

	let iframe = $state<HTMLIFrameElement>();
	let dark = $state(false);

	onMount(() => {
		const check = () => {
			dark = document.documentElement.classList.contains("dark");
		};
		check();
		const obs = new MutationObserver(check);
		obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
		return () => obs.disconnect();
	});

	const srcdoc = $derived(wrapSketchHtml(sketch.html, dark));

	function pushStep() {
		iframe?.contentWindow?.postMessage({ type: "lab:step", stepIndex, stepCount, step: JSON.parse(JSON.stringify(step)) }, "*");
	}

	$effect(() => {
		void stepIndex;
		void step;
		pushStep();
	});
</script>

<div class="lab-stage overflow-hidden">
	<iframe
		bind:this={iframe}
		title="Interactive visual sketch"
		sandbox="allow-scripts"
		{srcdoc}
		onload={pushStep}
		class="block aspect-[600/364] max-h-[480px] min-h-[260px] w-full border-0 bg-transparent"
	></iframe>
</div>
