// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Config, EffectType, calculateRingModHertz } from "../synth/SynthConfig";
import { Instrument } from "../synth/Instrument";
import { Channel } from "../synth/Channel";
import { Effect } from "../synth/Effect";
import { SongDocument } from "./SongDocument";
import { ChangeChorus, ChangeReverb, ChangeFlanger, ChangeFlangerSpeed, ChangeFlangerDepth, ChangeFlangerFeedback, ChangeRingModChipWave, ChangeRingMod, ChangeRingModHz, ChangeGranular, ChangeGrainSize, ChangeGrainAmounts, ChangeGrainRange, ChangeEchoDelay, ChangeEchoSustain, ChangeEchoPingPong, ChangeGain, ChangePan, ChangePanMode, ChangePanDelay, ChangeDistortion, ChangeClippingType, ChangeClippingInGain, ChangeClippingThreshold, ChangeAliasing, ChangeBitcrusherQuantization, ChangeBitcrusherFreq, ChangeEQFilterType, ChangeEQFilterSimpleCut, ChangeEQFilterSimplePeak, ChangeRemoveEffects, ChangeReorderEffects } from "./changes";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { Change } from "./Change";
import { FilterEditor } from "./FilterEditor";
import { ColorConfig } from "./ColorConfig";
import { Slider } from "./HTMLWrapper";

function buildOptions(menu: HTMLSelectElement, items: ReadonlyArray<string | number>): HTMLSelectElement {
	for (let index: number = 0; index < items.length; index++) {
		menu.appendChild(HTML.option({ value: index }, items[index]));
	}
	return menu;
}

function setSelectedValue(menu: HTMLSelectElement, value: number, isSelect2: boolean = false): void {
	const stringValue = value.toString();
	if (menu.value != stringValue) {
		menu.value = stringValue;

		// Change select2 value, if this select is a member of that class.
		if (isSelect2) {
			$(menu).val(value).trigger('change.select2');
		}
	}
}

export class EffectEditor {
	public readonly container: HTMLElement = HTML.div({ class: "effectEditor" });

	private readonly _rows: HTMLDivElement[] = [];

	public readonly moveupButtons: HTMLButtonElement[] = [];
	public readonly movedownButtons: HTMLButtonElement[] = [];
	public readonly minimizeButtons: HTMLButtonElement[] = [];
	public readonly deleteButtons: HTMLButtonElement[] = [];

	public readonly renderEffectRows: boolean[] = [];

	public readonly chorusSliders: Slider[] = [];
	public readonly reverbSliders: Slider[] = [];
	public readonly flangerSliders: Slider[] = [];
	public readonly flangerSpeedSliders: Slider[] = [];
	public readonly flangerDepthSliders: Slider[] = [];
	public readonly flangerFeedbackSliders: Slider[] = [];
	public readonly ringModWaveSelects: HTMLSelectElement[] = [];
	public readonly ringModSliders: Slider[] = [];
	public readonly ringModHzSliders: Slider[] = [];
	public readonly granularSliders: Slider[] = [];
	public readonly grainSizeSliders: Slider[] = [];
	public readonly grainAmountsSliders: Slider[] = [];
	public readonly grainRangeSliders: Slider[] = [];
	public readonly echoSustainSliders: Slider[] = [];
	public readonly echoDelaySliders: Slider[] = [];
	public readonly echoPingPongSliders: Slider[] = [];
	public readonly gainSliders: Slider[] = [];
	public readonly gainSliderInputBoxes: HTMLInputElement[] = [];
	public readonly panSliders: Slider[] = [];
	public readonly panSliderInputBoxes: HTMLInputElement[] = [];
	public readonly panDelaySliders: Slider[] = [];
	public readonly panModeSelects: HTMLSelectElement[] = [];
	public readonly distortionSliders: Slider[] = [];
	public readonly clippingInGainSliders: Slider[] = [];
	public readonly clippingThresholdSliders: Slider[] = [];
	public readonly clippingTypeSelects: HTMLSelectElement[] = [];
	public readonly aliasingBoxes: HTMLInputElement[] = [];
	public readonly bitcrusherQuantizationSliders: Slider[] = [];
	public readonly bitcrusherFreqSliders: Slider[] = [];
	public readonly eqFilterSimpleButtons: HTMLButtonElement[] = [];
	public readonly eqFilterAdvancedButtons: HTMLButtonElement[] = [];
	public readonly eqFilterEditors: FilterEditor[] = [];
	public readonly eqFilterSimpleCutSliders: Slider[] = [];
	public readonly eqFilterSimplePeakSliders: Slider[] = [];

	public readonly ringModHzNums: HTMLParagraphElement[] = [];
	//public readonly grainRangeNums: HTMLParagraphElement[] = [];
	//public readonly grainSizeNums: HTMLParagraphElement[] = [];
	public readonly echoDelayNums: HTMLParagraphElement[] = [];

	private _lastChange: Change | null = null;
	private _viewedChannel: Channel | null = null;

	constructor(private _doc: SongDocument, private _openPrompt: Function) {
		this.container.addEventListener("change", this._onChange);
		this.container.addEventListener("click", this._onClick);
		this.container.addEventListener("input", this._onInput);
	}

	private _onChange = (event: Event): void => {
		const ringModWaveSelectIndex: number = this.ringModWaveSelects.indexOf(<any>event.target);
		const panModeSelectIndex: number = this.panModeSelects.indexOf(<any>event.target);
		const clippingTypeSelectIndex: number = this.clippingTypeSelects.indexOf(<any>event.target);
		const aliasingBoxIndex: number = this.aliasingBoxes.indexOf(<any>event.target);

		const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
		if (ringModWaveSelectIndex != -1) {
			let effect: Effect = <Effect>instrument.effects[ringModWaveSelectIndex];
			this._doc.record(new ChangeRingModChipWave(this._doc, effect, parseInt(this.ringModWaveSelects[ringModWaveSelectIndex].value)));
		} else if (panModeSelectIndex != -1) {
			let effect: Effect = <Effect>instrument.effects[panModeSelectIndex];
			this._doc.record(new ChangePanMode(this._doc, effect, parseInt(this.panModeSelects[panModeSelectIndex].value)));
		} else if (clippingTypeSelectIndex != -1) {
			let effect: Effect = <Effect>instrument.effects[clippingTypeSelectIndex];
			this._doc.record(new ChangeClippingType(this._doc, effect, parseInt(this.clippingTypeSelects[clippingTypeSelectIndex].value)));
		} else if (aliasingBoxIndex != -1) {
			let effect: Effect = <Effect>instrument.effects[aliasingBoxIndex];
			this._doc.record(new ChangeAliasing(this._doc, effect, this.aliasingBoxes[aliasingBoxIndex].checked));
		} else if (this._lastChange != null) {
			this._doc.record(this._lastChange);
			this._lastChange = null;
		}
	}

	private _onClick = (event: MouseEvent): void => {
		const moveupButtonIndex: number = this.moveupButtons.indexOf(<any>event.target);
		const movedownButtonIndex: number = this.movedownButtons.indexOf(<any>event.target);
		const minimizeButtonIndex: number = this.minimizeButtons.indexOf(<any>event.target);
		const deleteButtonIndex: number = this.deleteButtons.indexOf(<any>event.target);
		if (deleteButtonIndex != -1) {
			this._doc.record(new ChangeRemoveEffects(this._doc, deleteButtonIndex, null));
			this.render(true)
		}
		else if (moveupButtonIndex != -1) {
			this._doc.record(new ChangeReorderEffects(this._doc, moveupButtonIndex, true, null));
			this.render(true)
		}
		else if (movedownButtonIndex != -1) {
			this._doc.record(new ChangeReorderEffects(this._doc, movedownButtonIndex, false, null));
			this.render(true)
		}
		else if (minimizeButtonIndex != -1) {
			this.renderEffectRows[minimizeButtonIndex] = !this.renderEffectRows[minimizeButtonIndex]
			this.render(true)
		}
	}

	private _onInput = (event: Event): void => {
		const panSliderInputBoxIndex: number = this.panSliderInputBoxes.indexOf(<any>event.target);
		const gainSliderInputBoxIndex: number = this.gainSliderInputBoxes.indexOf(<any>event.target);

		const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];

		if (panSliderInputBoxIndex != -1) {
			let effect: Effect = <Effect>instrument.effects[panSliderInputBoxIndex];
			this._doc.record(new ChangePan(this._doc, effect, Math.min(100.0, Math.max(0.0, Math.round(+this.panSliderInputBoxes[panSliderInputBoxIndex].value)))));
			this.panSliders[panSliderInputBoxIndex].updateValue(effect.pan);
		}
		if (gainSliderInputBoxIndex != -1) {
			let effect: Effect = <Effect>instrument.effects[gainSliderInputBoxIndex];
			this._doc.record(new ChangeGain(this._doc, effect, Math.min(100.0, Math.max(0.0, Math.round(+this.gainSliderInputBoxes[gainSliderInputBoxIndex].value)))));
			this.gainSliders[gainSliderInputBoxIndex].updateValue(effect.gain);
		}

		// re-render non-input values
		for (let effectIndex: number = 0; effectIndex < instrument.effectCount; effectIndex++) {
			if (instrument.effects[effectIndex] == null) continue;
			const effect: Effect = instrument.effects[effectIndex] as Effect;

			this.panSliderInputBoxes[effectIndex].value = effect.pan + "";
			this.gainSliderInputBoxes[effectIndex].value = effect.gain + "";
			this.ringModHzNums[effectIndex].innerHTML = calculateRingModHertz(effect.ringModulationHz / (Config.ringModHzRange - 1)) + " Hz";
			//this.grainSizeNums[effectIndex].innerHTML = effect.grainSize * Config.grainSizeStep;
			//this.grainRangeNums[effectIndex].innerHTML = effect.grainRange * Config.grainSizeStep;
			this.echoDelayNums[effectIndex].innerHTML = (Math.round((effect.echoDelay + 1) * Config.echoDelayStepTicks / (Config.ticksPerPart * Config.partsPerBeat) * 1000) / 1000) + " beat(s)";
		}
		//this.render();
	}

	private _switchEQFilterType = (simpleFilter: boolean, effect: Effect): void => {
		const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
		this._doc.record(new ChangeEQFilterType(this._doc, effect, instrument, simpleFilter));
		this.render(true)
	}

	public render(forceRender: boolean = false): void {
		const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];

		if (instrument.effects.length != this.container.children.length || this._doc.song.channels[this._doc.channel] != this._viewedChannel || forceRender) {
			this.container.replaceChildren();
			for (let effectIndex: number = 0; effectIndex < instrument.effectCount; effectIndex++) {
				const effect: Effect = instrument.effects[effectIndex];

				const moveupButton: HTMLButtonElement = HTML.button({ type: "button", class: "moveup-effect", style: "width: 16px; height: 70%; font-size: small; flex: 1; margin-left:0.2em;" }, "🞁");
				const movedownButton: HTMLButtonElement = HTML.button({ type: "button", class: "movedown-effect", style: "width: 16px; height: 70%; font-size: small; flex: 1; margin-left:0.2em;" }, "🞃");
				const minimizeButton: HTMLButtonElement = HTML.button({ type: "button", class: "minimize-effect", style: "width: 16px; height: 70%; font-size: small; flex: 1; margin-left:0.2em;" }, "-");
				const deleteButton: HTMLButtonElement = HTML.button({ type: "button", class: "delete-effect", style: "width: 16px; height: 70%; font-size: small; flex: 1; margin-left:0.2em;" }, "x");

				const effectButtonsText: HTMLDivElement = HTML.div({ style: `width: 50%; color: ${ColorConfig.secondaryText};` }, Config.effectDisplayNames[effect.type]);

				const chorusSlider: Slider = new Slider(HTML.input({ value: effect.chorus, type: "range", min: 0, max: Config.chorusRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeChorus(this._doc, effect, newValue), false);
				const reverbSlider: Slider = new Slider(HTML.input({ value: effect.reverb, type: "range", min: 0, max: Config.reverbRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeReverb(this._doc, effect, newValue), false);
				const flangerSlider: Slider = new Slider(HTML.input({ value: effect.flanger, type: "range", min: 0, max: Config.flangerRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeFlanger(this._doc, effect, newValue), false);
				const flangerSpeedSlider: Slider = new Slider(HTML.input({ value: effect.flangerSpeed, type: "range", min: 0, max: Config.flangerSpeedRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeFlangerSpeed(this._doc, effect, newValue), false);
				const flangerDepthSlider: Slider = new Slider(HTML.input({ value: effect.flangerDepth, type: "range", min: 0, max: Config.flangerDepthRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeFlangerDepth(this._doc, effect, newValue), false);
				const flangerFeedbackSlider: Slider = new Slider(HTML.input({ value: effect.flangerFeedback, type: "range", min: 0, max: Config.flangerFeedbackRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeFlangerFeedback(this._doc, effect, newValue), false);
				const ringModWaveSelect: HTMLSelectElement = buildOptions(HTML.select(), Config.operatorWaves.map(wave => wave.name));
				const ringModSlider: Slider = new Slider(HTML.input({ value: effect.ringModulation, type: "range", min: 0, max: Config.ringModRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeRingMod(this._doc, effect, newValue), false);
				const ringModHzSlider: Slider = new Slider(HTML.input({ value: effect.ringModulationHz, type: "range", min: 0, max: Config.ringModHzRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeRingModHz(this._doc, effect, newValue), false);
				const granularSlider: Slider = new Slider(HTML.input({ value: effect.granular, type: "range", min: 0, max: Config.granularRange, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeGranular(this._doc, effect, newValue), false);
				const grainSizeSlider: Slider = new Slider(HTML.input({ value: effect.grainSize, type: "range", min: Config.grainSizeMin / Config.grainSizeStep, max: Config.grainSizeMax / Config.grainSizeStep, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeGrainSize(this._doc, effect, newValue), false);
				const grainAmountsSlider: Slider = new Slider(HTML.input({ value: effect.grainAmounts, type: "range", min: "0", max: Config.grainAmountsMax, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeGrainAmounts(this._doc, effect, newValue), false);
				const grainRangeSlider: Slider = new Slider(HTML.input({ value: effect.grainRange, type: "range", min: "0", max: Config.grainRangeMax, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeGrainRange(this._doc, effect, newValue), false);
				const echoSustainSlider: Slider = new Slider(HTML.input({ value: effect.echoSustain, type: "range", min: 0, max: Config.echoSustainRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeEchoSustain(this._doc, effect, newValue), false);
				const echoDelaySlider: Slider = new Slider(HTML.input({ value: effect.echoDelay, type: "range", min: 0, max: Config.echoDelayRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeEchoDelay(this._doc, effect, newValue), false);
				const echoPingPongSlider: Slider = new Slider(HTML.input({ value: effect.echoPingPong, type: "range", min: 0, max: Config.panMax, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeEchoPingPong(this._doc, effect, newValue), true);
				const gainSlider: Slider = new Slider(HTML.input({ value: effect.gain, type: "range", min: 0, max: Config.volumeRange / 2 * Config.gainRangeMult, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeGain(this._doc, effect, newValue), true);
				const gainSliderInputBox: HTMLInputElement = HTML.input({ style: "width: 4em; font-size: 80%; ", id: "gainSliderInputBox", type: "number", step: "1", min: "0", max:  Config.volumeRange * Config.gainRangeMult + "", value: effect.gain.toString() });
				const panSlider: Slider = new Slider(HTML.input({ value: effect.pan, type: "range", min: 0, max: Config.panMax, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangePan(this._doc, effect, newValue), true);
				const panSliderInputBox: HTMLInputElement = HTML.input({ style: "width: 4em; font-size: 80%; ", id: "panSliderInputBox", type: "number", step: "1", min: "0", max: "100", value: effect.pan.toString() });
				const panDelaySlider: Slider = new Slider(HTML.input({ value: effect.panDelay, type: "range", min: 0, max: Config.modulators.dictionary["pan delay"].maxRawVol, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangePanDelay(this._doc, effect, newValue), false);
				const panModeSelect: HTMLSelectElement = buildOptions(HTML.select(), ["stereo", "split stereo", "mono"]); //TODO: put this in SynthConfig.ts
				const clippingTypeSelect: HTMLSelectElement = buildOptions(HTML.select(), ["soft", "hard", "wave folding", "wave wrapping"]); //TODO: also put this in SynthConfig.ts
				const clippingInGainSlider: Slider = new Slider(HTML.input({ value: effect.clippingInGain, type: "range", min: 0, max: Config.distortionRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeClippingInGain(this._doc, effect, newValue), false);
				const clippingThresholdSlider: Slider = new Slider(HTML.input({ value: effect.clippingThreshold, type: "range", min: 0, max: Config.volumeRange / 2 * Config.gainRangeMult, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeClippingThreshold(this._doc, effect, newValue), false);
				const distortionSlider: Slider = new Slider(HTML.input({ value: effect.distortion, type: "range", min: 0, max: Config.distortionRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeDistortion(this._doc, effect, newValue), false);
				const aliasingBox: HTMLInputElement = HTML.input({ type: "checkbox", style: "width: 1em; padding: 0; margin-right: 4em;" });
				const bitcrusherQuantizationSlider: Slider = new Slider(HTML.input({ value: effect.bitcrusherQuantization, type: "range", min: 0, max: Config.bitcrusherQuantizationRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeBitcrusherQuantization(this._doc, effect, newValue), false);
				const bitcrusherFreqSlider: Slider = new Slider(HTML.input({ value: effect.bitcrusherFreq, type: "range", min: 0, max: Config.bitcrusherFreqRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeBitcrusherFreq(this._doc, effect, newValue), false);
				const eqFilterSimpleButton: HTMLButtonElement = HTML.button({ style: "font-size: x-small; width: 50%; height: 40%", class: "no-underline", onclick: () => this._switchEQFilterType(true, effect) }, "simple");
				const eqFilterAdvancedButton: HTMLButtonElement = HTML.button({ style: "font-size: x-small; width: 50%; height: 40%", class: "last-button no-underline", onclick: () => this._switchEQFilterType(false, effect) }, "advanced");
				const eqFilterEditor: FilterEditor = new FilterEditor(this._doc, false, false, false, effectIndex);
				const eqFilterSimpleCutSlider: Slider = new Slider(HTML.input({ value: effect.eqFilterSimpleCut, type: "range", min: 0, max: Config.filterSimpleCutRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeEQFilterSimpleCut(this._doc, effect, newValue), false);
				const eqFilterSimplePeakSlider: Slider = new Slider(HTML.input({ value: effect.eqFilterSimplePeak, type: "range", min: 0, max: Config.filterSimplePeakRange - 1, step: 1, style: "margin: 0;" }), this._doc, (oldValue: number, newValue: number) => new ChangeEQFilterSimplePeak(this._doc, effect, newValue), false);
				const eqFilterZoom: HTMLButtonElement = HTML.button({ style: "margin-left:0em; padding-left:0.2em; height:1.5em; max-width: 12px; text-align: center; font-size: smaller;", onclick: () => this._openPrompt("customEQFilterSettings", effectIndex) }, "+");

				setSelectedValue(ringModWaveSelect, effect.ringModWaveformIndex);
				setSelectedValue(panModeSelect, effect.panMode);
				setSelectedValue(clippingTypeSelect, effect.clippingType);
				panSliderInputBox.value = effect.pan + "";
				gainSliderInputBox.value = effect.gain + "";
				aliasingBox.checked = instrument.aliases ? true : false;

				// i've left the grain range and size display commented out for now because i don't really get what the numbers mean ~ theepie

				const ringModHzNum: HTMLParagraphElement = HTML.div({ style: "font-size: 80%; ", id: "ringModHzNum" });
				const echoDelayNum: HTMLParagraphElement = HTML.div({ style: "font-size: 80%; ", id: "echoDelayNum" });
				//const grainSizeNum: HTMLParagraphElement = HTML.div({ style: "font-size: 80%; ", id: "grainSizeNum" });
				//const grainRangeNum: HTMLParagraphElement = HTML.div({ style: "font-size: 80%; ", id: "grainRangeNum" });

				ringModHzNum.innerHTML = calculateRingModHertz(effect.ringModulationHz / (Config.ringModHzRange - 1)) + " Hz";
				echoDelayNum.innerHTML = (Math.round((effect.echoDelay + 1) * Config.echoDelayStepTicks / (Config.ticksPerPart * Config.partsPerBeat) * 1000) / 1000) + " beat(s)";
				//grainSizeNum.innerHTML = effect.grainSize * Config.grainSizeStep;
				//grainRangeNum.innerHTML = effect.grainRange * Config.grainSizeStep;

				const effectButtonsRow: HTMLDivElement = HTML.div({ class: "selectRow", style: `padding-left: 12.5%; max-width: 75%; height: 80%; padding-top: 0.2em;` }, effectButtonsText, moveupButton, movedownButton, minimizeButton, deleteButton);
				const chorusRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("chorus") }, "Chorus:"), chorusSlider.container);
				const reverbRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("reverb") }, "Reverb:"), reverbSlider.container);
				const flangerRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("flanger") }, "Flanger:"), flangerSlider.container);
				const flangerSpeedRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("flangerSpeed") }, "Speed:"), flangerSpeedSlider.container);
				const flangerDepthRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("flangerDepth") }, "Depth:"), flangerDepthSlider.container);
				const flangerFeedbackRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("flangerFeedback") }, "Feedback:"), flangerFeedbackSlider.container);
				const ringModWaveRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("ringModHz") }, "Wave:"), HTML.div({ class: "selectContainer" }, ringModWaveSelect));
				const ringModRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("ringMod") }, "Ring Mod:"), ringModSlider.container);
				const ringModHzRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("ringModHz") }, "Hertz:"), HTML.div({ style: `color: ${ColorConfig.secondaryText}; ` }, ringModHzNum), ringModHzSlider.container);
				const granularRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("granular") }, "Granular:"), granularSlider.container);
				const grainSizeRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("grainSize") }, "Grain Size:"), /*HTML.div({ style: `color: ${ColorConfig.secondaryText}; ` }, grainSizeNum),*/ grainSizeSlider.container);
				const grainAmountsRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("grainAmounts") }, "Grain Amount:"), grainAmountsSlider.container);
				const grainRangeRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("grainRange") }, "Grain Range:"), /*HTML.div({ style: `color: ${ColorConfig.secondaryText}; ` }, grainRangeNum),*/ grainRangeSlider.container);
				const echoSustainRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("echo") }, "Echo:"), echoSustainSlider.container);
				const echoDelayRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("echoDelay") }, "Echo Delay:"), HTML.div({ style: `color: ${ColorConfig.secondaryText}; ` }, echoDelayNum), echoDelaySlider.container);
				const echoPingPongRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("echoDelay") }, "Ping Pong:"), echoPingPongSlider.container);
				const gainRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.div({}, HTML.span({ class: "tip", tabindex: "0", style: "height:1em; font-size: smaller;", onclick: () => this._openPrompt("gain") }, "Gain: "), HTML.div({ style: "color: " + ColorConfig.secondaryText + "; margin-top: -3px;" }, gainSliderInputBox)), gainSlider.container);
				const panRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.div({}, HTML.span({ class: "tip", tabindex: "0", style: "height:1em; font-size: smaller;", onclick: () => this._openPrompt("pan") }, "Pan: "), HTML.div({ style: "color: " + ColorConfig.secondaryText + "; margin-top: -3px;" }, panSliderInputBox)), panSlider.container);
				const panDelayRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("panDelay") }, "Pan Delay:"), panDelaySlider.container);
				const panModeRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("panMode") }, "Pan Mode:"), HTML.div({ class: "selectContainer" }, panModeSelect));
				const distortionRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("distortion") }, "Distortion:"), distortionSlider.container);
				const clippingInGainRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("clippingInGain") }, "In-Gain:"), clippingInGainSlider.container);
				const clippingThresholdRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("clippingThreshold") }, "Threshold:"), clippingThresholdSlider.container);
				const clippingTypeRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("clippingType") }, "Type:"), HTML.div({ class: "selectContainer" }, clippingTypeSelect));
				const aliasingRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("aliasing") }, "Aliasing:"), aliasingBox);
				const bitcrusherQuantizationRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("bitcrusherQuantization") }, "Bit Crush:"), bitcrusherQuantizationSlider.container);
				const bitcrusherFreqRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("bitcrusherFreq") }, "Freq Crush:"), bitcrusherFreqSlider.container);
				const eqFilterButtonsRow: HTMLElement = HTML.div({ class: "selectRow", style: "display: none; padding-top: 4px; margin-bottom: 0px;" }, HTML.span({ style: "font-size: x-small;", class: "tip", onclick: () => this._openPrompt("filterType") }, "Post EQ Type:"), HTML.div({ class: "instrument-bar" }, eqFilterSimpleButton, eqFilterAdvancedButton));
				const eqFilterEditorRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("eqFilter") }, "Post EQ:"), eqFilterZoom,  eqFilterEditor.container);
				const eqFilterSimpleCutRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("filterCutoff") }, "Filter Cut:"), eqFilterSimpleCutSlider.container);
				const eqFilterSimplePeakRow: HTMLDivElement = HTML.div({ class: "selectRow", style: "display: none;" }, HTML.span({ class: "tip", onclick: () => this._openPrompt("filterPeak") }, "Filter Peak:"), eqFilterSimplePeakSlider.container);

				if (this.renderEffectRows[effectIndex] == null) this.renderEffectRows[effectIndex] = true

				if (this.renderEffectRows[effectIndex]) {
					if (effect.type == EffectType.reverb) {
						reverbRow.style.display = "";
					} else if (effect.type == EffectType.chorus) {
						chorusRow.style.display = "";
					} else if (effect.type == EffectType.flanger) {
						flangerRow.style.display = "";
						flangerSpeedRow.style.display = "";
						flangerDepthRow.style.display = "";
						flangerFeedbackRow.style.display = "";
					} else if (effect.type == EffectType.ringModulation) {
						ringModRow.style.display = "";
						ringModHzRow.style.display = "";
						ringModWaveRow.style.display = "";
					} else if (effect.type == EffectType.granular) {
						granularRow.style.display = "";
						grainSizeRow.style.display = "";
						grainAmountsRow.style.display = "";
						grainRangeRow.style.display = "";
					} else if (effect.type == EffectType.echo) {
						echoSustainRow.style.display = "";
						echoDelayRow.style.display = "";
						echoPingPongRow.style.display = "";
					} else if (effect.type == EffectType.gain) {
						gainRow.style.display = "";
					} else if (effect.type == EffectType.panning) {
						panRow.style.display = "";
						panDelayRow.style.display = "";
						panModeRow.style.display = "";
					} else if (effect.type == EffectType.distortion) {
						distortionRow.style.display = "";
						aliasingRow.style.display = "";
					} else if (effect.type == EffectType.clipping) {
						clippingTypeRow.style.display = "";
						clippingInGainRow.style.display = "";
						clippingThresholdRow.style.display = "";
					} else if (effect.type == EffectType.bitcrusher) {
						bitcrusherQuantizationRow.style.display = "";
						bitcrusherFreqRow.style.display = "";
					} else if (effect.type == EffectType.eqFilter) {
						eqFilterButtonsRow.style.display = "";
						if (effect.eqFilterType) {
							eqFilterSimpleButton.classList.remove("deactivated");
							eqFilterAdvancedButton.classList.add("deactivated");
							eqFilterEditorRow.style.display = "none";
							eqFilterSimpleCutRow.style.display = "";
							eqFilterSimplePeakRow.style.display = "";
						} else {
							eqFilterSimpleButton.classList.add("deactivated");
							eqFilterAdvancedButton.classList.remove("deactivated");
							eqFilterEditorRow.style.display = "";
							eqFilterEditor.render();
							eqFilterSimpleCutRow.style.display = "none";
							eqFilterSimplePeakRow.style.display = "none";
						}
					}
				}

				const row: HTMLDivElement = HTML.div({ class: "effect-row" },
					effectButtonsRow,
					chorusRow,
					reverbRow,
					flangerRow,
					flangerSpeedRow,
					flangerDepthRow,
					flangerFeedbackRow,
					ringModRow,
					ringModHzRow,
					ringModWaveRow,
					granularRow,
					grainSizeRow,
					grainAmountsRow,
					grainRangeRow,
					echoSustainRow,
					echoDelayRow,
					echoPingPongRow,
					gainRow,
					panRow,
					panDelayRow,
					panModeRow,
					distortionRow,
					clippingTypeRow,
					clippingInGainRow,
					clippingThresholdRow,
					aliasingRow,
					bitcrusherQuantizationRow,
					bitcrusherFreqRow,
					eqFilterButtonsRow,
					eqFilterEditorRow,
					eqFilterSimpleCutRow,
					eqFilterSimplePeakRow,
				);

				this.container.appendChild(row);

				this._rows[effectIndex] = row;

				this.moveupButtons[effectIndex] = moveupButton;
				this.movedownButtons[effectIndex] = movedownButton;
				this.minimizeButtons[effectIndex] = minimizeButton;
				this.deleteButtons[effectIndex] = deleteButton;

				this.chorusSliders[effectIndex] = chorusSlider;
				this.reverbSliders[effectIndex] = reverbSlider;
				this.flangerSliders[effectIndex] = flangerSlider;
				this.flangerSpeedSliders[effectIndex] = flangerSpeedSlider;
				this.flangerDepthSliders[effectIndex] = flangerDepthSlider;
				this.flangerFeedbackSliders[effectIndex] = flangerFeedbackSlider;
				this.ringModWaveSelects[effectIndex] = ringModWaveSelect;
				this.ringModSliders[effectIndex] = ringModSlider;
				this.ringModHzSliders[effectIndex] = ringModHzSlider;
				this.granularSliders[effectIndex] = granularSlider;
				this.grainSizeSliders[effectIndex] = grainSizeSlider;
				this.grainAmountsSliders[effectIndex] = grainAmountsSlider;
				this.grainRangeSliders[effectIndex] = grainRangeSlider;
				this.echoSustainSliders[effectIndex] = echoSustainSlider;
				this.echoDelaySliders[effectIndex] = echoDelaySlider;
				this.echoPingPongSliders[effectIndex] = echoPingPongSlider;
				this.gainSliders[effectIndex] = gainSlider;
				this.gainSliderInputBoxes[effectIndex] = gainSliderInputBox;
				this.panSliders[effectIndex] = panSlider;
				this.panSliderInputBoxes[effectIndex] = panSliderInputBox;
				this.panDelaySliders[effectIndex] = panDelaySlider;
				this.panModeSelects[effectIndex] = panModeSelect;
				this.distortionSliders[effectIndex] = distortionSlider;
				this.aliasingBoxes[effectIndex] = aliasingBox;
				this.clippingTypeSelects[effectIndex] = clippingTypeSelect;
				this.clippingInGainSliders[effectIndex] = clippingInGainSlider;
				this.clippingThresholdSliders[effectIndex] = clippingThresholdSlider;
				this.bitcrusherQuantizationSliders[effectIndex] = bitcrusherQuantizationSlider;
				this.bitcrusherFreqSliders[effectIndex] = bitcrusherFreqSlider;
				this.eqFilterSimpleButtons[effectIndex] = eqFilterSimpleButton;
				this.eqFilterAdvancedButtons[effectIndex] = eqFilterAdvancedButton;
				this.eqFilterEditors[effectIndex] = eqFilterEditor;
				this.eqFilterSimpleCutSliders[effectIndex] = eqFilterSimpleCutSlider;
				this.eqFilterSimplePeakSliders[effectIndex] = eqFilterSimplePeakSlider;

				this.ringModHzNums[effectIndex] = ringModHzNum;
				this.echoDelayNums[effectIndex] = echoDelayNum;
				//this.grainRangeNums[effectIndex] = grainRangeNum;
				//this.grainSizeNums[effectIndex] = grainSizeNum;

				this._viewedChannel = this._doc.song.channels[this._doc.channel];
			}
		}

		for (let effectIndex: number = 0; effectIndex < instrument.effects.length; effectIndex++) {
			const effect: Effect = instrument.effects[effectIndex];

			this.chorusSliders[effectIndex].updateValue(effect.chorus);
			this.reverbSliders[effectIndex].updateValue(effect.reverb);
			this.flangerSliders[effectIndex].updateValue(effect.flanger);
			this.flangerSpeedSliders[effectIndex].updateValue(effect.flangerSpeed);
			this.flangerDepthSliders[effectIndex].updateValue(effect.flangerDepth);
			this.flangerFeedbackSliders[effectIndex].updateValue(effect.flangerFeedback);
			this.ringModSliders[effectIndex].updateValue(effect.ringModulation);
			this.ringModHzSliders[effectIndex].updateValue(effect.ringModulationHz);
			this.granularSliders[effectIndex].updateValue(effect.granular);
			this.grainSizeSliders[effectIndex].updateValue(effect.grainSize);
			this.grainAmountsSliders[effectIndex].updateValue(effect.grainAmounts);
			this.grainRangeSliders[effectIndex].updateValue(effect.grainRange);
			this.echoSustainSliders[effectIndex].updateValue(effect.echoSustain);
			this.echoDelaySliders[effectIndex].updateValue(effect.echoDelay);
			this.echoPingPongSliders[effectIndex].updateValue(effect.echoPingPong);
			this.gainSliders[effectIndex].updateValue(effect.gain);
			this.panSliders[effectIndex].updateValue(effect.pan);
			this.panDelaySliders[effectIndex].updateValue(effect.panDelay);
			this.distortionSliders[effectIndex].updateValue(effect.distortion);
			this.clippingInGainSliders[effectIndex].updateValue(effect.clippingInGain);
			this.clippingThresholdSliders[effectIndex].updateValue(effect.clippingThreshold);
			this.bitcrusherQuantizationSliders[effectIndex].updateValue(effect.bitcrusherQuantization);
			this.bitcrusherFreqSliders[effectIndex].updateValue(effect.bitcrusherFreq);
			this.eqFilterSimpleCutSliders[effectIndex].updateValue(effect.eqFilterSimpleCut);
			this.eqFilterSimplePeakSliders[effectIndex].updateValue(effect.eqFilterSimplePeak);

			if (effect.eqFilterType) {
				this.eqFilterSimpleButtons[effectIndex].classList.remove("deactivated");
				this.eqFilterAdvancedButtons[effectIndex].classList.add("deactivated");
			} else {
				this.eqFilterSimpleButtons[effectIndex].classList.add("deactivated");
				this.eqFilterAdvancedButtons[effectIndex].classList.remove("deactivated");
			}
			setSelectedValue(this.ringModWaveSelects[effectIndex], effect.ringModWaveformIndex);
			setSelectedValue(this.panModeSelects[effectIndex], effect.panMode);
			setSelectedValue(this.clippingTypeSelects[effectIndex], effect.clippingType);
			this.panSliderInputBoxes[effectIndex].value = effect.pan + "";
			this.gainSliderInputBoxes[effectIndex].value = effect.gain + "";
			this.aliasingBoxes[effectIndex].checked = instrument.aliases ? true : false;
			this.ringModHzNums[effectIndex].innerHTML = calculateRingModHertz(effect.ringModulationHz / (Config.ringModHzRange - 1)) + " Hz";
			this.echoDelayNums[effectIndex].innerHTML = (Math.round((effect.echoDelay + 1) * Config.echoDelayStepTicks / (Config.ticksPerPart * Config.partsPerBeat) * 1000) / 1000) + " beat(s)";
		}
	}
}
