// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { FilterType, EffectType, EnvelopeComputeIndex, Config, GranularEnvelopeType, calculateRingModHertz } from "./SynthConfig";
import { DynamicBiquadFilter } from "./filtering";
import { Instrument } from "./Instrument";
import { InstrumentState } from "./InstrumentState";
import { Effect } from "./Effect";
import { Synth, Tone } from "./synth";
import { FilterSettings, FilterControlPoint } from "./Filter";
import { fittingPowerOfTwo } from "./utils";

class Grain {
	public delayLinePosition: number; // Relative to latest sample

	public ageInSamples: number;
	public maxAgeInSamples: number;
	public delay: number;

	//parabolic envelope implementation
	public parabolicEnvelopeAmplitude: number;
	public parabolicEnvelopeSlope: number;
	public parabolicEnvelopeCurve: number;

	//raised cosine bell envelope implementation
	public rcbEnvelopeAmplitude: number;
	public rcbEnvelopeAttackIndex: number;
	public rcbEnvelopeReleaseIndex: number;
	public rcbEnvelopeSustain: number;

	constructor() {
		this.delayLinePosition = 0;

		this.ageInSamples = 0;
		this.maxAgeInSamples = 0;
		this.delay = 0;

		this.parabolicEnvelopeAmplitude = 0;
		this.parabolicEnvelopeSlope = 0;
		this.parabolicEnvelopeCurve = 0;

		this.rcbEnvelopeAmplitude = 0;
		this.rcbEnvelopeAttackIndex = 0;
		this.rcbEnvelopeReleaseIndex = 0;
		this.rcbEnvelopeSustain = 0;
	}

	public initializeParabolicEnvelope(durationInSamples: number, amplitude: number): void {
		this.parabolicEnvelopeAmplitude = 0;
		const invDuration: number = 1.0 / durationInSamples;
		const invDurationSquared: number = invDuration * invDuration;
		this.parabolicEnvelopeSlope = 4.0 * amplitude * (invDuration - invDurationSquared);
		this.parabolicEnvelopeCurve = -8.0 * amplitude * invDurationSquared;
	}

	public updateParabolicEnvelope(): void {
		this.parabolicEnvelopeAmplitude += this.parabolicEnvelopeSlope;
		this.parabolicEnvelopeSlope += this.parabolicEnvelopeCurve;
	}

	public initializeRCBEnvelope(durationInSamples: number, amplitude: number): void {
		// attack:
		this.rcbEnvelopeAttackIndex = Math.floor(durationInSamples / 6);
		// sustain:
		this.rcbEnvelopeSustain = amplitude;
		// release:
		this.rcbEnvelopeReleaseIndex = Math.floor(durationInSamples * 5 / 6);
	}

	public updateRCBEnvelope(): void {
		if (this.ageInSamples < this.rcbEnvelopeAttackIndex) { //attack
			this.rcbEnvelopeAmplitude = (1.0 + Math.cos(Math.PI + (Math.PI * (this.ageInSamples / this.rcbEnvelopeAttackIndex) * (this.rcbEnvelopeSustain / 2.0))));
		} else if (this.ageInSamples > this.rcbEnvelopeReleaseIndex) { //release
			this.rcbEnvelopeAmplitude = (1.0 + Math.cos(Math.PI * ((this.ageInSamples - this.rcbEnvelopeReleaseIndex) / this.rcbEnvelopeAttackIndex)) * (this.rcbEnvelopeSustain / 2.0));
		} //sustain covered by the end of attack
	}

	public addDelay(delay: number): void {
		this.delay = delay;
	}
}

export class EffectState {
	public type: EffectType = EffectType.reverb;

	public eqFilterVolume: number = 1.0;
	public eqFilterVolumeDelta: number = 0.0;

	public granularMix: number = 1.0;
	public granularMixDelta: number = 0.0;
	public granularDelayLineL: Float32Array | null = null;
	public granularDelayLineR: Float32Array | null = null;
	public granularDelayLineIndex: number = 0;
	public granularMaximumDelayTimeInSeconds: number = 1;
	public granularGrains: Grain[];
	public granularGrainsLength: number;
	public granularMaximumGrains: number;
	public usesRandomGrainLocation: boolean = true; //eventually I might use the granular code for sample pitch shifting, but we'll see
	public granularDelayLineDirty: boolean = false;
	public computeGrains: boolean = true;

	public ringModMix: number = 0;
	public ringModMixDelta: number = 0;
	public ringModPhase: number = 0;
	public ringModPhaseDelta: number = 0;
	public ringModPhaseDeltaScale: number = 1.0;
	public ringModWaveformIndex: number = 0.0;
	public ringModPulseWidth: number = 0.0;
	public ringModHzOffset: number = 0.0;
	public ringModMixFade: number = 1.0;
	public ringModMixFadeDelta: number = 0;

	public distortion: number = 0.0;
	public distortionDelta: number = 0.0;
	public distortionDrive: number = 0.0;
	public distortionDriveDelta: number = 0.0;
	public distortionFractionalInputL1: number = 0.0;
	public distortionFractionalInputL2: number = 0.0;
	public distortionFractionalInputL3: number = 0.0;
	public distortionFractionalInputR1: number = 0.0;
	public distortionFractionalInputR2: number = 0.0;
	public distortionFractionalInputR3: number = 0.0;
	public distortionPrevInputL: number = 0.0;
	public distortionPrevInputR: number = 0.0;
	public distortionNextOutputL: number = 0.0;
	public distortionNextOutputR: number = 0.0;

	public clippingType: number = 0;
	public clippingInGain: number = 0.0;
	public clippingInGainDelta: number = 0.0;
	public clippingThreshold: number = 0.0;
	public clippingThresholdDelta: number = 0.0;

	public bitcrusherPrevInputL: number = 0.0;
	public bitcrusherPrevInputR: number = 0.0;
	public bitcrusherCurrentOutputL: number = 0.0;
	public bitcrusherCurrentOutputR: number = 0.0;
	public bitcrusherPhase: number = 1.0;
	public bitcrusherPhaseDelta: number = 0.0;
	public bitcrusherPhaseDeltaScale: number = 1.0;
	public bitcrusherScale: number = 1.0;
	public bitcrusherScaleScale: number = 1.0;
	public bitcrusherFoldLevel: number = 1.0;
	public bitcrusherFoldLevelScale: number = 1.0;

	public readonly eqFiltersL: DynamicBiquadFilter[] = [];
	public readonly eqFiltersR: DynamicBiquadFilter[] = [];
	public eqFilterCount: number = 0;
	public initialEqFilterInputL1: number = 0.0;
	public initialEqFilterInputR1: number = 0.0;
	public initialEqFilterInputL2: number = 0.0;
	public initialEqFilterInputR2: number = 0.0;

	public gain: number = 1.0;
	public gainDelta: number = 0.0;

	public panningDelayLineL: Float32Array | null = null;
	public panningDelayLineR: Float32Array | null = null;
	public panningDelayPos: number = 0;
	public panningVolumeL: number = 0.0;
	public panningVolumeR: number = 0.0;
	public panningVolumeDeltaL: number = 0.0;
	public panningVolumeDeltaR: number = 0.0;
	public panningOffsetL: number = 0.0;
	public panningOffsetR: number = 0.0;
	public panningOffsetDeltaL: number = 0.0;
	public panningOffsetDeltaR: number = 0.0;
	public panningMode: number = 0;

	public flangerDelayLineL: Float32Array | null = null;
	public flangerDelayLineR: Float32Array | null = null;
	public flangerDelayLineDirty: boolean = false;
	public flangerDelayPos: number = 0;
	public flanger: number = 0;
	public flangerDelta: number = 0;
	public flangerSpeed: number = 0;
	public flangerSpeedDelta: number = 0;
	public flangerDepth: number = 0;
	public flangerDepthDelta: number = 0;
	public flangerFeedback: number = 0;
	public flangerFeedbackDelta: number = 0;
	public flangerPhase: number = 0;

	public chorusDelayLineL: Float32Array | null = null;
	public chorusDelayLineR: Float32Array | null = null;
	public chorusDelayLineDirty: boolean = false;
	public chorusDelayPos: number = 0;
	public chorusPhase: number = 0;
	public chorusVoiceMult: number = 0;
	public chorusVoiceMultDelta: number = 0;
	public chorusCombinedMult: number = 0;
	public chorusCombinedMultDelta: number = 0;

	public echoDelayLineL: Float32Array | null = null;
	public echoDelayLineR: Float32Array | null = null;
	public echoDelayLineDirty: boolean = false;
	public echoDelayPosL: number = 0;
	public echoDelayPosR: number = 0;
	public echoDelayOffsetStart: number = 0;
	public echoDelayOffsetEnd: number | null = null;
	public echoDelayOffsetRatio: number = 0.0;
	public echoDelayOffsetRatioDelta: number = 0.0;
	public echoMult: number = 0.0;
	public echoMultDelta: number = 0.0;
	public echoPingPong: number = 0.0;
	public echoShelfA1: number = 0.0;
	public echoShelfB0: number = 0.0;
	public echoShelfB1: number = 0.0;
	public echoShelfSampleL: number = 0.0;
	public echoShelfSampleR: number = 0.0;
	public echoShelfPrevInputL: number = 0.0;
	public echoShelfPrevInputR: number = 0.0;

	public reverbDelayLine: Float32Array | null = null;
	public reverbDelayLineDirty: boolean = false;
	public reverbDelayPos: number = 0;
	public reverbMult: number = 0.0;
	public reverbMultDelta: number = 0.0;
	public reverbShelfA1: number = 0.0;
	public reverbShelfB0: number = 0.0;
	public reverbShelfB1: number = 0.0;
	public reverbShelfSample0: number = 0.0;
	public reverbShelfSample1: number = 0.0;
	public reverbShelfSample2: number = 0.0;
	public reverbShelfSample3: number = 0.0;
	public reverbShelfPrevInput0: number = 0.0;
	public reverbShelfPrevInput1: number = 0.0;
	public reverbShelfPrevInput2: number = 0.0;
	public reverbShelfPrevInput3: number = 0.0;

	constructor(type: EffectType) {
		this.type = type;
		// Allocate all grains to be used ahead of time.
		// granularGrainsLength is what indicates how many grains actually "exist".
		this.granularGrains = [];
		this.granularMaximumGrains = 256;
		for (let i: number = 0; i < this.granularMaximumGrains; i++) {
			this.granularGrains.push(new Grain());
		}
		this.granularGrainsLength = 0;
	}

	public reset(): void {
		if (this.chorusDelayLineDirty) {
			for (let i: number = 0; i < this.chorusDelayLineL!.length; i++) this.chorusDelayLineL![i] = 0.0;
			for (let i: number = 0; i < this.chorusDelayLineR!.length; i++) this.chorusDelayLineR![i] = 0.0;
		}
		if (this.flangerDelayLineDirty) {
			for (let i: number = 0; i < this.flangerDelayLineL!.length; i++) this.flangerDelayLineL![i] = 0.0;
			for (let i: number = 0; i < this.flangerDelayLineR!.length; i++) this.flangerDelayLineR![i] = 0.0;
		}
		if (this.echoDelayLineDirty) {
			for (let i: number = 0; i < this.echoDelayLineL!.length; i++) this.echoDelayLineL![i] = 0.0;
			for (let i: number = 0; i < this.echoDelayLineR!.length; i++) this.echoDelayLineR![i] = 0.0;
		}
		if (this.reverbDelayLineDirty) {
			for (let i: number = 0; i < this.reverbDelayLine!.length; i++) this.reverbDelayLine![i] = 0.0;
		}
		if (this.granularDelayLineDirty) {
			for (let i: number = 0; i < this.granularDelayLineL!.length; i++) this.granularDelayLineL![i] = 0.0;
			for (let i: number = 0; i < this.granularDelayLineR!.length; i++) this.granularDelayLineR![i] = 0.0;
		}

		this.flangerPhase = 0.0;
		this.chorusPhase = 0.0;
		this.ringModPhase = 0.0;
		this.ringModMixFade = 1.0;
	}

	public allocateNecessaryBuffers(synth: Synth, instrument: Instrument, effect: Effect, samplesPerTick: number): void {
		if (effect.type == EffectType.panning) {
			if (this.panningDelayLineL == null || this.panningDelayLineR == null || this.panningDelayLineL.length < synth.panningDelayBufferSize || this.panningDelayLineR.length < synth.panningDelayBufferSize) {
				this.panningDelayLineL = new Float32Array(synth.panningDelayBufferSize);
				this.panningDelayLineR = new Float32Array(synth.panningDelayBufferSize);
			}
		}
		if (effect.type == EffectType.chorus) {
			if (this.chorusDelayLineL == null || this.chorusDelayLineL.length < synth.chorusDelayBufferSize) {
				this.chorusDelayLineL = new Float32Array(synth.chorusDelayBufferSize);
			}
			if (this.chorusDelayLineR == null || this.chorusDelayLineR.length < synth.chorusDelayBufferSize) {
				this.chorusDelayLineR = new Float32Array(synth.chorusDelayBufferSize);
			}
		}
		if (effect.type == EffectType.flanger) {
			if (this.flangerDelayLineL == null || this.flangerDelayLineL.length < synth.flangerDelayBufferSize) {
				this.flangerDelayLineL = new Float32Array(synth.flangerDelayBufferSize);
			}
			if (this.flangerDelayLineR == null || this.flangerDelayLineR.length < synth.flangerDelayBufferSize) {
				this.flangerDelayLineR = new Float32Array(synth.flangerDelayBufferSize);
			}
		}
		if (effect.type == EffectType.echo) {
			this.allocateEchoBuffers(samplesPerTick, effect.echoDelay);
		}
		if (effect.type == EffectType.reverb) {
			// TODO: Make reverb delay line sample rate agnostic. Maybe just double buffer size for 96KHz? Adjust attenuation and shelf cutoff appropriately?
			if (this.reverbDelayLine == null) {
				this.reverbDelayLine = new Float32Array(Config.reverbDelayBufferSize);
			}
		}
		if (effect.type == EffectType.granular) {
			const granularDelayLineSizeInMilliseconds: number = 2500;
			const granularDelayLineSizeInSeconds: number = granularDelayLineSizeInMilliseconds / 1000; // Maximum possible delay time
			this.granularMaximumDelayTimeInSeconds = granularDelayLineSizeInSeconds;
			const granularDelayLineSizeInSamples: number = fittingPowerOfTwo(Math.floor(granularDelayLineSizeInSeconds * synth.samplesPerSecond));
			if (this.granularDelayLineL == null || this.granularDelayLineR == null || this.granularDelayLineL.length != granularDelayLineSizeInSamples || this.granularDelayLineR.length != granularDelayLineSizeInSamples) {
				this.granularDelayLineL = new Float32Array(granularDelayLineSizeInSamples);
				this.granularDelayLineR = new Float32Array(granularDelayLineSizeInSamples);
				this.granularDelayLineIndex = 0;
			}
			const oldGrainsLength: number = this.granularGrains.length;
			if (this.granularMaximumGrains > oldGrainsLength) { //increase grain amount if it changes
				for (let i: number = oldGrainsLength; i < this.granularMaximumGrains+1; i++) {
					this.granularGrains.push(new Grain());
				}
			}
			if (this.granularMaximumGrains < this.granularGrainsLength) {
				this.granularGrainsLength = Math.round(this.granularMaximumGrains);
			}
		}
	}

	public allocateEchoBuffers(samplesPerTick: number, echoDelay: number) {
		// account for tempo and delay automation changing delay length during a tick?
		const safeEchoDelaySteps: number = Math.max(Config.echoDelayRange >> 1, (echoDelay + 1)); // The delay may be very short now, but if it increases later make sure we have enough sample history.
		const baseEchoDelayBufferSize: number = fittingPowerOfTwo(safeEchoDelaySteps * Config.echoDelayStepTicks * samplesPerTick);
		const safeEchoDelayBufferSize: number = baseEchoDelayBufferSize * 2; // If the tempo or delay changes and we suddenly need a longer delay, make sure that we have enough sample history to accomodate the longer delay.

		if (this.echoDelayLineL == null || this.echoDelayLineR == null) {
			this.echoDelayLineL = new Float32Array(safeEchoDelayBufferSize);
			this.echoDelayLineR = new Float32Array(safeEchoDelayBufferSize);
		} else if (this.echoDelayLineL.length < safeEchoDelayBufferSize || this.echoDelayLineR.length < safeEchoDelayBufferSize) {
			// The echo delay length may change while the song is playing if tempo changes,
			// so buffers may need to be reallocated, but we don't want to lose any echoes
			// so we need to copy the contents of the old buffer to the new one.
			const newDelayLineL: Float32Array = new Float32Array(safeEchoDelayBufferSize);
			const newDelayLineR: Float32Array = new Float32Array(safeEchoDelayBufferSize);
			const oldMask: number = this.echoDelayLineL.length - 1;

			for (let i = 0; i < this.echoDelayLineL.length; i++) {
				newDelayLineL[i] = this.echoDelayLineL[(this.echoDelayPosL + i) & oldMask];
				newDelayLineR[i] = this.echoDelayLineR[(this.echoDelayPosR + i) & oldMask];
			}

			this.echoDelayPosL = this.echoDelayLineL.length;
			this.echoDelayPosR = this.echoDelayLineR.length;
			this.echoDelayLineL = newDelayLineL;
			this.echoDelayLineR = newDelayLineR;
		}
	}

	public deactivate(): void {
		this.bitcrusherPrevInputL = 0.0;
		this.bitcrusherPrevInputR = 0.0;
		this.bitcrusherCurrentOutputL = 0.0;
		this.bitcrusherCurrentOutputR = 0.0;
		this.bitcrusherPhase = 1.0;
		for (let i: number = 0; i < this.eqFilterCount; i++) {
			this.eqFiltersL[i].resetOutput();
			this.eqFiltersR[i].resetOutput();
		}
		this.eqFilterCount = 0;
		this.initialEqFilterInputL1 = 0.0;
		this.initialEqFilterInputR1 = 0.0;
		this.initialEqFilterInputL2 = 0.0;
		this.initialEqFilterInputR2 = 0.0;
		this.distortionFractionalInputL1 = 0.0;
		this.distortionFractionalInputL2 = 0.0;
		this.distortionFractionalInputL3 = 0.0;
		this.distortionFractionalInputR1 = 0.0;
		this.distortionFractionalInputR2 = 0.0;
		this.distortionFractionalInputR3 = 0.0;
		this.distortionPrevInputL = 0.0;
		this.distortionPrevInputR = 0.0;
		this.distortionNextOutputL = 0.0;
		this.distortionNextOutputR = 0.0;
		this.flangerDelayPos = 0;
		this.panningDelayPos = 0;
		if (this.panningDelayLineL != null) for (let i: number = 0; i < this.panningDelayLineL.length; i++) this.panningDelayLineL[i] = 0.0;
		if (this.panningDelayLineR != null) for (let i: number = 0; i < this.panningDelayLineR.length; i++) this.panningDelayLineR[i] = 0.0;
		this.echoDelayOffsetEnd = null;
		this.echoShelfSampleL = 0.0;
		this.echoShelfSampleR = 0.0;
		this.echoShelfPrevInputL = 0.0;
		this.echoShelfPrevInputR = 0.0;
		this.reverbShelfSample0 = 0.0;
		this.reverbShelfSample1 = 0.0;
		this.reverbShelfSample2 = 0.0;
		this.reverbShelfSample3 = 0.0;
		this.reverbShelfPrevInput0 = 0.0;
		this.reverbShelfPrevInput1 = 0.0;
		this.reverbShelfPrevInput2 = 0.0;
		this.reverbShelfPrevInput3 = 0.0;
	}

	public compute(synth: Synth, instrument: Instrument, effect: Effect, instrumentState: InstrumentState, samplesPerTick: number, roundedSamplesPerTick: number, tone: Tone | null, channelIndex: number, instrumentIndex: number, envelopeStarts: number[], envelopeEnds: number[]): void {
		const samplesPerSecond: number = synth.samplesPerSecond;

		this.type = effect.type;

		const usesGranular: boolean = effect.type == EffectType.granular;
		const usesRingModulation: boolean = effect.type == EffectType.ringModulation;
		const usesDistortion: boolean = effect.type == EffectType.distortion;
		const usesClipping: boolean = effect.type == EffectType.clipping;
		const usesBitcrusher: boolean = effect.type == EffectType.bitcrusher;
		const usesGain: boolean = effect.type == EffectType.gain;
		const usesPanning: boolean = effect.type == EffectType.panning;
		const usesFlanger: boolean = effect.type == EffectType.flanger;
		const usesChorus: boolean = effect.type == EffectType.chorus;
		const usesEcho: boolean = effect.type == EffectType.echo;
		const usesReverb: boolean = effect.type == EffectType.reverb;
		const usesEQFilter: boolean = effect.type == EffectType.eqFilter;

		if (usesGranular) { //has to happen before buffer allocation
			this.granularMaximumGrains = Math.pow(2, effect.grainAmounts * envelopeStarts[EnvelopeComputeIndex.grainAmount]);
			if (synth.isModActive(Config.modulators.dictionary["grain freq"].index, channelIndex, instrumentIndex)) {
				this.granularMaximumGrains = Math.pow(2, synth.getModValue(Config.modulators.dictionary["grain freq"].index, channelIndex, instrumentIndex, false) * envelopeStarts[EnvelopeComputeIndex.grainAmount]);
			}
			this.granularMaximumGrains == Math.floor(this.granularMaximumGrains);
		}

		this.allocateNecessaryBuffers(synth, instrument, effect, samplesPerTick);

		if (usesGranular) {
			this.granularMix = effect.granular / Config.granularRange;
			this.computeGrains = true;
			let granularMixEnd = this.granularMix;
			if (synth.isModActive(Config.modulators.dictionary["granular"].index, channelIndex, instrumentIndex)) {
				this.granularMix = synth.getModValue(Config.modulators.dictionary["granular"].index, channelIndex, instrumentIndex, false) / Config.granularRange;
				granularMixEnd = synth.getModValue(Config.modulators.dictionary["granular"].index, channelIndex, instrumentIndex, true) / Config.granularRange;
			}
			this.granularMix *= envelopeStarts[EnvelopeComputeIndex.granular];
			granularMixEnd *= envelopeEnds[EnvelopeComputeIndex.granular];
			this.granularMixDelta = (granularMixEnd - this.granularMix) / roundedSamplesPerTick;
			for (let iterations: number = 0; iterations < Math.ceil(Math.random() * Math.random() * 10); iterations++) { //dirty weighting toward lower numbers
				//create a grain
				if (this.granularGrainsLength < this.granularMaximumGrains) {
					let granularMinGrainSizeInMilliseconds: number = effect.grainSize;
					if (synth.isModActive(Config.modulators.dictionary["grain size"].index, channelIndex, instrumentIndex)) {
						granularMinGrainSizeInMilliseconds = synth.getModValue(Config.modulators.dictionary["grain size"].index, channelIndex, instrumentIndex, false);
					}
					granularMinGrainSizeInMilliseconds *= envelopeStarts[EnvelopeComputeIndex.grainSize];
					let grainRange = effect.grainRange;
					if (synth.isModActive(Config.modulators.dictionary["grain range"].index, channelIndex, instrumentIndex)) {
						grainRange = synth.getModValue(Config.modulators.dictionary["grain range"].index, channelIndex, instrumentIndex, false);
					}
					grainRange *= envelopeStarts[EnvelopeComputeIndex.grainRange];
					const granularMaxGrainSizeInMilliseconds: number = granularMinGrainSizeInMilliseconds + grainRange;
					const granularGrainSizeInMilliseconds: number = granularMinGrainSizeInMilliseconds + (granularMaxGrainSizeInMilliseconds - granularMinGrainSizeInMilliseconds) * Math.random();
					const granularGrainSizeInSeconds: number = granularGrainSizeInMilliseconds / 1000.0;
					const granularGrainSizeInSamples: number = Math.floor(granularGrainSizeInSeconds * samplesPerSecond);
					const granularDelayLineLength: number = this.granularDelayLineL!.length;
					const grainIndex: number = this.granularGrainsLength;

					this.granularGrainsLength++;
					const grain: Grain = this.granularGrains[grainIndex];
					grain.ageInSamples = 0;
					grain.maxAgeInSamples = granularGrainSizeInSamples;
					// const minDelayTimeInMilliseconds: number = 2;
					// const minDelayTimeInSeconds: number = minDelayTimeInMilliseconds / 1000.0;
					const minDelayTimeInSeconds: number = 0.02;
					// const maxDelayTimeInSeconds: number = this.granularMaximumDelayTimeInSeconds;
					const maxDelayTimeInSeconds: number = 2.4;
					grain.delayLinePosition = this.usesRandomGrainLocation ? (minDelayTimeInSeconds + (maxDelayTimeInSeconds - minDelayTimeInSeconds) * Math.random() * Math.random() * samplesPerSecond) % (granularDelayLineLength - 1) : minDelayTimeInSeconds; //dirty weighting toward lower numbers ; The clamp was clumping everything at the end, so I decided to use a modulo instead
					if (Config.granularEnvelopeType == GranularEnvelopeType.parabolic) {
						grain.initializeParabolicEnvelope(grain.maxAgeInSamples, 1.0);
					} else if (Config.granularEnvelopeType == GranularEnvelopeType.raisedCosineBell) {
						grain.initializeRCBEnvelope(grain.maxAgeInSamples, 1.0);
					}
					// if (this.usesRandomGrainLocation) {
					grain.addDelay(Math.random() * samplesPerTick * 4); //offset when grains begin playing ; This is different from the above delay, which delays how far back in time the grain looks for samples
					// }
				}
			}
		}

		if (usesDistortion) {
			let useDistortionStart: number = effect.distortion;
			let useDistortionEnd: number = effect.distortion;

			// Check for distortion mods
			if (synth.isModActive(Config.modulators.dictionary["distortion"].index, channelIndex, instrumentIndex)) {
				useDistortionStart = synth.getModValue(Config.modulators.dictionary["distortion"].index, channelIndex, instrumentIndex, false);
				useDistortionEnd = synth.getModValue(Config.modulators.dictionary["distortion"].index, channelIndex, instrumentIndex, true);
			}

			const distortionSliderStart = Math.min(1.0, envelopeStarts[EnvelopeComputeIndex.distortion] * useDistortionStart / (Config.distortionRange - 1));
			const distortionSliderEnd = Math.min(1.0, envelopeEnds[EnvelopeComputeIndex.distortion] * useDistortionEnd / (Config.distortionRange - 1));
			const distortionStart: number = Math.pow(1.0 - 0.895 * (Math.pow(20.0, distortionSliderStart) - 1.0) / 19.0, 2.0); //1: 0.7, 0: 1.0
			const distortionEnd: number = Math.pow(1.0 - 0.895 * (Math.pow(20.0, distortionSliderEnd) - 1.0) / 19.0, 2.0);
			const distortionDriveStart: number = (1.0 + 2.0 * distortionSliderStart) / Config.distortionBaseVolume; //1.0 - 3.0
			const distortionDriveEnd: number = (1.0 + 2.0 * distortionSliderEnd) / Config.distortionBaseVolume;
			this.distortion = distortionStart;
			this.distortionDelta = (distortionEnd - distortionStart) / roundedSamplesPerTick;
			this.distortionDrive = distortionDriveStart;
			this.distortionDriveDelta = (distortionDriveEnd - distortionDriveStart) / roundedSamplesPerTick;
		}

		if (usesClipping) {
			let useClippingInGainStart: number = effect.clippingInGain;
			let useClippingInGainEnd: number = effect.clippingInGain;
			let useClippingThresholdStart: number = effect.clippingThreshold;
			let useClippingThresholdEnd: number = effect.clippingThreshold;

			if (synth.isModActive(Config.modulators.dictionary["clipping in-gain"].index, channelIndex, instrumentIndex)) {
				useClippingInGainStart = synth.getModValue(Config.modulators.dictionary["clipping in-gain"].index, channelIndex, instrumentIndex, false);
				useClippingInGainEnd = synth.getModValue(Config.modulators.dictionary["clipping in-gain"].index, channelIndex, instrumentIndex, true);
			}
			if (synth.isModActive(Config.modulators.dictionary["clipping threshold"].index, channelIndex, instrumentIndex)) {
				useClippingThresholdStart = synth.getModValue(Config.modulators.dictionary["clipping threshold"].index, channelIndex, instrumentIndex, false);
				useClippingThresholdEnd = synth.getModValue(Config.modulators.dictionary["clipping threshold"].index, channelIndex, instrumentIndex, true);
			}

			const clippingInGainStart: number = Math.pow(1 - (envelopeStarts[EnvelopeComputeIndex.clippingInGain] * useClippingInGainStart / Config.distortionRange), 2.0);
			const clippingInGainEnd: number = Math.pow(1 - (envelopeStarts[EnvelopeComputeIndex.clippingInGain] * useClippingInGainEnd / Config.distortionRange), 2.0);
			const clippingThresholdStart: number = Math.min(Config.gainRangeMult, envelopeStarts[EnvelopeComputeIndex.clippingThreshold] * useClippingThresholdStart / (Config.volumeRange + 1));
			const clippingThresholdEnd: number = Math.min(Config.gainRangeMult, envelopeStarts[EnvelopeComputeIndex.clippingThreshold] * useClippingThresholdEnd / (Config.volumeRange + 1));

			this.clippingInGain = clippingInGainStart;
			this.clippingInGainDelta = (clippingInGainEnd - clippingInGainStart) / roundedSamplesPerTick;
			this.clippingThreshold = clippingThresholdStart;
			this.clippingThresholdDelta = (clippingThresholdEnd - clippingThresholdStart) / roundedSamplesPerTick;
			this.clippingType = effect.clippingType;
		}

		if (usesBitcrusher) {
			let freqSettingStart: number = effect.bitcrusherFreq * Math.sqrt(envelopeStarts[EnvelopeComputeIndex.bitcrusherFrequency]);
			let freqSettingEnd: number = effect.bitcrusherFreq * Math.sqrt(envelopeEnds[EnvelopeComputeIndex.bitcrusherFrequency]);

			// Check for freq crush mods
			if (synth.isModActive(Config.modulators.dictionary["freq crush"].index, channelIndex, instrumentIndex)) {
				freqSettingStart = synth.getModValue(Config.modulators.dictionary["freq crush"].index, channelIndex, instrumentIndex, false) * Math.sqrt(envelopeStarts[EnvelopeComputeIndex.bitcrusherFrequency]);
				freqSettingEnd = synth.getModValue(Config.modulators.dictionary["freq crush"].index, channelIndex, instrumentIndex, true) * Math.sqrt(envelopeEnds[EnvelopeComputeIndex.bitcrusherFrequency]);
			}

			let quantizationSettingStart: number = effect.bitcrusherQuantization * Math.sqrt(envelopeStarts[EnvelopeComputeIndex.bitcrusherQuantization]);
			let quantizationSettingEnd: number = effect.bitcrusherQuantization * Math.sqrt(envelopeEnds[EnvelopeComputeIndex.bitcrusherQuantization]);

			// Check for bitcrush mods
			if (synth.isModActive(Config.modulators.dictionary["bit crush"].index, channelIndex, instrumentIndex)) {
				quantizationSettingStart = synth.getModValue(Config.modulators.dictionary["bit crush"].index, channelIndex, instrumentIndex, false) * Math.sqrt(envelopeStarts[EnvelopeComputeIndex.bitcrusherQuantization]);
				quantizationSettingEnd = synth.getModValue(Config.modulators.dictionary["bit crush"].index, channelIndex, instrumentIndex, true) * Math.sqrt(envelopeEnds[EnvelopeComputeIndex.bitcrusherQuantization]);
			}

			const basePitch: number = Config.keys[synth.song!.key].basePitch + (Config.pitchesPerOctave * synth.song!.octave); // TODO: What if there's a key change mid-song?
			const freqStart: number = Instrument.frequencyFromPitch(basePitch + 60) * Math.pow(2.0, (Config.bitcrusherFreqRange - 1 - freqSettingStart) * Config.bitcrusherOctaveStep);
			const freqEnd: number = Instrument.frequencyFromPitch(basePitch + 60) * Math.pow(2.0, (Config.bitcrusherFreqRange - 1 - freqSettingEnd) * Config.bitcrusherOctaveStep);
			const phaseDeltaStart: number = Math.min(1.0, freqStart / samplesPerSecond);
			const phaseDeltaEnd: number = Math.min(1.0, freqEnd / samplesPerSecond);
			this.bitcrusherPhaseDelta = phaseDeltaStart;
			this.bitcrusherPhaseDeltaScale = Math.pow(phaseDeltaEnd / phaseDeltaStart, 1.0 / roundedSamplesPerTick);

			const scaleStart: number = 2.0 * Config.bitcrusherBaseVolume * Math.pow(2.0, 1.0 - Math.pow(2.0, (Config.bitcrusherQuantizationRange - 1 - quantizationSettingStart) * 0.5));
			const scaleEnd: number = 2.0 * Config.bitcrusherBaseVolume * Math.pow(2.0, 1.0 - Math.pow(2.0, (Config.bitcrusherQuantizationRange - 1 - quantizationSettingEnd) * 0.5));
			this.bitcrusherScale = scaleStart;
			this.bitcrusherScaleScale = Math.pow(scaleEnd / scaleStart, 1.0 / roundedSamplesPerTick);

			const foldLevelStart: number = 2.0 * Config.bitcrusherBaseVolume * Math.pow(1.5, Config.bitcrusherQuantizationRange - 1 - quantizationSettingStart);
			const foldLevelEnd: number = 2.0 * Config.bitcrusherBaseVolume * Math.pow(1.5, Config.bitcrusherQuantizationRange - 1 - quantizationSettingEnd);
			this.bitcrusherFoldLevel = foldLevelStart;
			this.bitcrusherFoldLevelScale = Math.pow(foldLevelEnd / foldLevelStart, 1.0 / roundedSamplesPerTick);
		}

		if (usesEQFilter) {
			let eqFilterVolume: number = 1.0; //this.envelopeComputer.lowpassCutoffDecayVolumeCompensation;
			if (effect.eqFilterType) {
				// Simple EQ filter (old style). For analysis, using random filters from normal style since they are N/A in this context.
				const eqFilterSettingsStart: FilterSettings = effect.eqFilter;
				if (effect.eqSubFilters[1] == null)
					effect.eqSubFilters[1] = new FilterSettings();
				const eqFilterSettingsEnd: FilterSettings = effect.eqSubFilters[1];

				// Change location based on slider values
				let startSimpleFreq: number = effect.eqFilterSimpleCut;
				let startSimpleGain: number = effect.eqFilterSimplePeak;
				let endSimpleFreq: number = effect.eqFilterSimpleCut;
				let endSimpleGain: number = effect.eqFilterSimplePeak;

				let filterChanges: boolean = false;

				if (synth.isModActive(Config.modulators.dictionary["eq filt cut"].index, channelIndex, instrumentIndex)) {
					startSimpleFreq = synth.getModValue(Config.modulators.dictionary["eq filt cut"].index, channelIndex, instrumentIndex, false);
					endSimpleFreq = synth.getModValue(Config.modulators.dictionary["eq filt cut"].index, channelIndex, instrumentIndex, true);
					filterChanges = true;
				}
				if (synth.isModActive(Config.modulators.dictionary["eq filt peak"].index, channelIndex, instrumentIndex)) {
					startSimpleGain = synth.getModValue(Config.modulators.dictionary["eq filt peak"].index, channelIndex, instrumentIndex, false);
					endSimpleGain = synth.getModValue(Config.modulators.dictionary["eq filt peak"].index, channelIndex, instrumentIndex, true);
					filterChanges = true;
				}

				let startPoint: FilterControlPoint;

				if (filterChanges) {
					eqFilterSettingsStart.convertLegacySettingsForSynth(startSimpleFreq, startSimpleGain);
					eqFilterSettingsEnd.convertLegacySettingsForSynth(endSimpleFreq, endSimpleGain);

					startPoint = eqFilterSettingsStart.controlPoints[0];
					let endPoint: FilterControlPoint = eqFilterSettingsEnd.controlPoints[0];

					startPoint.toCoefficients(Synth.tempFilterStartCoefficients, samplesPerSecond, 1.0, 1.0);
					endPoint.toCoefficients(Synth.tempFilterEndCoefficients, samplesPerSecond, 1.0, 1.0);

					if (this.eqFiltersL.length < 1) this.eqFiltersL[0] = new DynamicBiquadFilter();
					if (this.eqFiltersR.length < 1) this.eqFiltersR[0] = new DynamicBiquadFilter();
					this.eqFiltersL[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
					this.eqFiltersR[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
				} else {
					eqFilterSettingsStart.convertLegacySettingsForSynth(startSimpleFreq, startSimpleGain, true);

					startPoint = eqFilterSettingsStart.controlPoints[0];

					startPoint.toCoefficients(Synth.tempFilterStartCoefficients, samplesPerSecond, 1.0, 1.0);

					if (this.eqFiltersL.length < 1) this.eqFiltersL[0] = new DynamicBiquadFilter();
					if (this.eqFiltersR.length < 1) this.eqFiltersR[0] = new DynamicBiquadFilter();
					this.eqFiltersL[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterStartCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
					this.eqFiltersR[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterStartCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
				}
				this.eqFilterCount = 1;

				eqFilterVolume *= startPoint.getVolumeCompensationMult();
			}
			else {
				const eqFilterSettings: FilterSettings = (effect.tmpEqFilterStart != null) ? effect.tmpEqFilterStart : effect.eqFilter;
				//const eqAllFreqsEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterAllFreqs];
				//const eqAllFreqsEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterAllFreqs];
				for (let i: number = 0; i < eqFilterSettings.controlPointCount; i++) {
					//const eqFreqEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterFreq0 + i];
					//const eqFreqEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterFreq0 + i];
					//const eqPeakEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterGain0 + i];
					//const eqPeakEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterGain0 + i];
					let startPoint: FilterControlPoint = eqFilterSettings.controlPoints[i];
					let endPoint: FilterControlPoint = (effect.tmpEqFilterEnd != null && effect.tmpEqFilterEnd.controlPoints[i] != null) ? effect.tmpEqFilterEnd.controlPoints[i] : eqFilterSettings.controlPoints[i];

					// If switching dot type, do it all at once and do not try to interpolate since no valid interpolation exists.
					if (startPoint.type != endPoint.type) {
						startPoint = endPoint;
					}

					startPoint.toCoefficients(Synth.tempFilterStartCoefficients, samplesPerSecond, /*eqAllFreqsEnvelopeStart * eqFreqEnvelopeStart*/ 1.0, /*eqPeakEnvelopeStart*/ 1.0);
					endPoint.toCoefficients(Synth.tempFilterEndCoefficients, samplesPerSecond, /*eqAllFreqsEnvelopeEnd   * eqFreqEnvelopeEnd*/   1.0, /*eqPeakEnvelopeEnd*/   1.0);
					if (this.eqFiltersL.length <= i) this.eqFiltersL[i] = new DynamicBiquadFilter();
					if (this.eqFiltersR.length <= i) this.eqFiltersR[i] = new DynamicBiquadFilter();
					this.eqFiltersL[i].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
					this.eqFiltersR[i].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
					eqFilterVolume *= startPoint.getVolumeCompensationMult();

				}
				this.eqFilterCount = eqFilterSettings.controlPointCount;
			}
			eqFilterVolume = Math.min(3.0, eqFilterVolume);

			let eqFilterVolumeStart: number = eqFilterVolume;
			let eqFilterVolumeEnd: number = eqFilterVolume;

			this.eqFilterVolume = eqFilterVolumeStart;
			this.eqFilterVolumeDelta = (eqFilterVolumeEnd - eqFilterVolumeStart) / roundedSamplesPerTick;
		}

		if (usesPanning) {
			this.panningMode = effect.panMode;

			const panEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.panning] * 2.0 - 1.0;
			const panEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.panning] * 2.0 - 1.0;

			let usePanStart: number = effect.pan;
			let usePanEnd: number = effect.pan;
			// Check for pan mods
			if (synth.isModActive(Config.modulators.dictionary["pan"].index, channelIndex, instrumentIndex)) {
				usePanStart = synth.getModValue(Config.modulators.dictionary["pan"].index, channelIndex, instrumentIndex, false);
				usePanEnd = synth.getModValue(Config.modulators.dictionary["pan"].index, channelIndex, instrumentIndex, true);
			}

			let panStart: number = Math.max(-1.0, Math.min(1.0, (usePanStart - Config.panCenter) / Config.panCenter * panEnvelopeStart));
			let panEnd: number = Math.max(-1.0, Math.min(1.0, (usePanEnd - Config.panCenter) / Config.panCenter * panEnvelopeEnd));

			const volumeStartL: number = Math.cos((1 + panStart) * Math.PI * 0.25) * 1.414;
			const volumeStartR: number = Math.cos((1 - panStart) * Math.PI * 0.25) * 1.414;
			const volumeEndL: number = Math.cos((1 + panEnd) * Math.PI * 0.25) * 1.414;
			const volumeEndR: number = Math.cos((1 - panEnd) * Math.PI * 0.25) * 1.414;
			const maxDelaySamples: number = samplesPerSecond * Config.panDelaySecondsMax;

			let usePanDelayStart: number = effect.panDelay;
			let usePanDelayEnd: number = effect.panDelay;
			// Check for pan delay mods
			if (synth.isModActive(Config.modulators.dictionary["pan delay"].index, channelIndex, instrumentIndex)) {
				usePanDelayStart = synth.getModValue(Config.modulators.dictionary["pan delay"].index, channelIndex, instrumentIndex, false);
				usePanDelayEnd = synth.getModValue(Config.modulators.dictionary["pan delay"].index, channelIndex, instrumentIndex, true);
			}

			const delayStart: number = panStart * usePanDelayStart * maxDelaySamples / 10;
			const delayEnd: number = panEnd * usePanDelayEnd * maxDelaySamples / 10;
			const delayStartL: number = Math.max(0.0, delayStart);
			const delayStartR: number = Math.max(0.0, -delayStart);
			const delayEndL: number = Math.max(0.0, delayEnd);
			const delayEndR: number = Math.max(0.0, -delayEnd);

			this.panningVolumeL = volumeStartL;
			this.panningVolumeR = volumeStartR;
			this.panningVolumeDeltaL = (volumeEndL - volumeStartL) / roundedSamplesPerTick;
			this.panningVolumeDeltaR = (volumeEndR - volumeStartR) / roundedSamplesPerTick;
			this.panningOffsetL = this.panningDelayPos - delayStartL + synth.panningDelayBufferSize;
			this.panningOffsetR = this.panningDelayPos - delayStartR + synth.panningDelayBufferSize;
			this.panningOffsetDeltaL = (delayEndL - delayStartL) / roundedSamplesPerTick;
			this.panningOffsetDeltaR = (delayEndR - delayStartR) / roundedSamplesPerTick;
		}

		if (usesGain) {
			const gainEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.gain];
			const gainEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.gain];

			let useGainStart: number = effect.gain;
			let useGainEnd: number = effect.gain;
			// Check for pan mods
			if (synth.isModActive(Config.modulators.dictionary["gain"].index, channelIndex, instrumentIndex)) {
				useGainStart = synth.getModValue(Config.modulators.dictionary["gain"].index, channelIndex, instrumentIndex, false);
				useGainEnd = synth.getModValue(Config.modulators.dictionary["gain"].index, channelIndex, instrumentIndex, true);
			}

			let gainStart: number = Math.min(Config.gainRangeMult, gainEnvelopeStart * useGainStart / (Config.volumeRange / 2 * Config.gainRangeMult)) * Config.gainRangeMult;
			let gainEnd: number = Math.min(Config.gainRangeMult, gainEnvelopeEnd * useGainEnd / (Config.volumeRange / 2 * Config.gainRangeMult)) * Config.gainRangeMult;

			this.gain = gainStart;
			this.gainDelta = (gainEnd - gainStart) / roundedSamplesPerTick;
		}

		if (usesChorus) {
			const chorusEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.chorus];
			const chorusEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.chorus];
			let useChorusStart: number = effect.chorus;
			let useChorusEnd: number = effect.chorus;
			// Check for chorus mods
			if (synth.isModActive(Config.modulators.dictionary["chorus"].index, channelIndex, instrumentIndex)) {
				useChorusStart = synth.getModValue(Config.modulators.dictionary["chorus"].index, channelIndex, instrumentIndex, false);
				useChorusEnd = synth.getModValue(Config.modulators.dictionary["chorus"].index, channelIndex, instrumentIndex, true);
			}

			let chorusStart: number = Math.min(1.0, chorusEnvelopeStart * useChorusStart / (Config.chorusRange - 1));
			let chorusEnd: number = Math.min(1.0, chorusEnvelopeEnd * useChorusEnd / (Config.chorusRange - 1));
			chorusStart = chorusStart * 0.6 + (Math.pow(chorusStart, 6.0)) * 0.4;
			chorusEnd = chorusEnd * 0.6 + (Math.pow(chorusEnd, 6.0)) * 0.4;
			const chorusCombinedMultStart = 1.0 / Math.sqrt(3.0 * chorusStart * chorusStart + 1.0);
			const chorusCombinedMultEnd = 1.0 / Math.sqrt(3.0 * chorusEnd * chorusEnd + 1.0);
			this.chorusVoiceMult = chorusStart;
			this.chorusVoiceMultDelta = (chorusEnd - chorusStart) / roundedSamplesPerTick;
			this.chorusCombinedMult = chorusCombinedMultStart;
			this.chorusCombinedMultDelta = (chorusCombinedMultEnd - chorusCombinedMultStart) / roundedSamplesPerTick;
		}

		if (usesFlanger) {
			const flangerEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.flanger];
			const flangerEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.flanger];
			let useFlangerStart: number = effect.flanger;
			let useFlangerEnd: number = effect.flanger;
			if (synth.isModActive(Config.modulators.dictionary["flanger"].index, channelIndex, instrumentIndex)) {
				useFlangerStart = synth.getModValue(Config.modulators.dictionary["flanger"].index, channelIndex, instrumentIndex, false);
				useFlangerEnd = synth.getModValue(Config.modulators.dictionary["flanger"].index, channelIndex, instrumentIndex, true);
			}
			let flangerStart: number = Math.min(1.0, flangerEnvelopeStart * useFlangerStart / (Config.flangerRange - 1));
			let flangerEnd: number = Math.min(1.0, flangerEnvelopeEnd * useFlangerEnd / (Config.flangerRange - 1));

			const flangerSpeedEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.flangerSpeed];
			const flangerSpeedEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.flangerSpeed];
			let useFlangerSpeedStart: number = effect.flangerSpeed;
			let useFlangerSpeedEnd: number = effect.flangerSpeed;
			if (synth.isModActive(Config.modulators.dictionary["flanger speed"].index, channelIndex, instrumentIndex)) {
				useFlangerSpeedStart = synth.getModValue(Config.modulators.dictionary["flanger speed"].index, channelIndex, instrumentIndex, false);
				useFlangerSpeedEnd = synth.getModValue(Config.modulators.dictionary["flanger speed"].index, channelIndex, instrumentIndex, true);
			}
			let flangerSpeedStart: number = flangerSpeedEnvelopeStart * useFlangerSpeedStart + 2;
			let flangerSpeedEnd: number = flangerSpeedEnvelopeEnd * useFlangerSpeedEnd + 2;

			const flangerDepthEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.flangerDepth];
			const flangerDepthEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.flangerDepth];
			let useFlangerDepthStart: number = effect.flangerDepth;
			let useFlangerDepthEnd: number = effect.flangerDepth;
			if (synth.isModActive(Config.modulators.dictionary["flanger depth"].index, channelIndex, instrumentIndex)) {
				useFlangerDepthStart = synth.getModValue(Config.modulators.dictionary["flanger depth"].index, channelIndex, instrumentIndex, false);
				useFlangerDepthEnd = synth.getModValue(Config.modulators.dictionary["flanger depth"].index, channelIndex, instrumentIndex, true);
			}
			let flangerDepthStart: number = flangerDepthEnvelopeStart * useFlangerDepthStart * 2 + 2;
			let flangerDepthEnd: number = flangerDepthEnvelopeEnd * useFlangerDepthEnd * 2 + 2;

			const flangerFeedbackEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.flangerFeedback];
			const flangerFeedbackEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.flangerFeedback];
			let useFlangerFeedbackStart: number = effect.flangerFeedback;
			let useFlangerFeedbackEnd: number = effect.flangerFeedback;
			if (synth.isModActive(Config.modulators.dictionary["flanger feedback"].index, channelIndex, instrumentIndex)) {
				useFlangerFeedbackStart = synth.getModValue(Config.modulators.dictionary["flanger feedback"].index, channelIndex, instrumentIndex, false);
				useFlangerFeedbackEnd = synth.getModValue(Config.modulators.dictionary["flanger feedback"].index, channelIndex, instrumentIndex, true);
			}
			let flangerFeedbackStart: number = flangerFeedbackEnvelopeStart * useFlangerFeedbackStart * 1.5;
			let flangerFeedbackEnd: number = flangerFeedbackEnvelopeEnd * useFlangerFeedbackEnd * 1.5;

			this.flanger = flangerStart;
			this.flangerDelta = (flangerEnd - flangerStart) / roundedSamplesPerTick;
			this.flangerSpeed = flangerSpeedStart;
			this.flangerSpeedDelta = (flangerSpeedEnd - flangerSpeedStart) / roundedSamplesPerTick;
			this.flangerDepth = flangerDepthStart;
			this.flangerDepthDelta = (flangerDepthEnd - flangerDepthStart) / roundedSamplesPerTick;
			this.flangerFeedback = (Math.sqrt(flangerFeedbackStart) / Math.sqrt(Config.flangerFeedbackRange));
			this.flangerFeedbackDelta = ((Math.sqrt(flangerFeedbackEnd) / Math.sqrt(Config.flangerFeedbackRange)) - (Math.sqrt(flangerFeedbackStart) / Math.sqrt(Config.flangerFeedbackRange))) / roundedSamplesPerTick;
		}

		if (usesRingModulation) {
			let useRingModStart: number = effect.ringModulation;
			let useRingModEnd: number = effect.ringModulation;

			let useRingModEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.ringModulation];
			let useRingModEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.ringModulation];

			let useRingModHzStart: number = Math.min(1.0, effect.ringModulationHz / (Config.ringModHzRange - 1));
			let useRingModHzEnd: number = Math.min(1.0, effect.ringModulationHz / (Config.ringModHzRange - 1));
			let useRingModHzEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.ringModulationHz];
			let useRingModHzEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.ringModulationHz];


			if (synth.isModActive(Config.modulators.dictionary["ring modulation"].index, channelIndex, instrumentIndex)) {
				useRingModStart = (synth.getModValue(Config.modulators.dictionary["ring modulation"].index, channelIndex, instrumentIndex, false));
				useRingModEnd = (synth.getModValue(Config.modulators.dictionary["ring modulation"].index, channelIndex, instrumentIndex, true));
			}
			if (synth.isModActive(Config.modulators.dictionary["ring mod hertz"].index, channelIndex, instrumentIndex)) {
				useRingModHzStart = Math.min(1.0, Math.max(0.0, (synth.getModValue(Config.modulators.dictionary["ring mod hertz"].index, channelIndex, instrumentIndex, false)) / (Config.ringModHzRange - 1)));
				useRingModHzEnd = Math.min(1.0, Math.max(0.0, (synth.getModValue(Config.modulators.dictionary["ring mod hertz"].index, channelIndex, instrumentIndex, false)) / (Config.ringModHzRange - 1)));
			}
			useRingModHzStart *= useRingModHzEnvelopeStart;
			useRingModHzEnd *= useRingModHzEnvelopeEnd;
			let ringModStart: number = Math.min(1.0, (useRingModStart * useRingModEnvelopeStart) / (Config.ringModRange - 1));
			let ringModEnd: number = Math.min(1.0, (useRingModEnd * useRingModEnvelopeEnd) / (Config.ringModRange - 1));

			this.ringModMix = ringModStart;
			this.ringModMixDelta = (ringModEnd - ringModStart) / roundedSamplesPerTick;

			this.ringModHzOffset = effect.ringModHzOffset;

			let ringModPhaseDeltaStart = (Math.max(0, calculateRingModHertz(useRingModHzStart))) / synth.samplesPerSecond;
			let ringModPhaseDeltaEnd = (Math.max(0, calculateRingModHertz(useRingModHzEnd))) / synth.samplesPerSecond;

			this.ringModMixFadeDelta = 0;
			if (this.ringModMixFade < 0) this.ringModMixFade = 0;
			if (ringModPhaseDeltaStart <= 0 && ringModPhaseDeltaEnd <= 0 && this.ringModMixFade != 0) {
				this.ringModMixFadeDelta = this.ringModMixFade / -10;
			} else if (ringModPhaseDeltaStart > 0 && ringModPhaseDeltaEnd > 0) {
				this.ringModMixFade = 1.0;
			}

			this.ringModPhaseDelta = ringModPhaseDeltaStart;
			this.ringModPhaseDeltaScale = ringModPhaseDeltaStart == 0 ? 1 : Math.pow(ringModPhaseDeltaEnd / ringModPhaseDeltaStart, 1.0 / roundedSamplesPerTick);

			this.ringModWaveformIndex = effect.ringModWaveformIndex;
			this.ringModPulseWidth = effect.ringModPulseWidth;

		}

		let maxEchoMult = 0.0;
		let averageEchoDelaySeconds: number = 0.0;

		if (usesEcho) {
			const echoSustainEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.echoSustain];
			const echoSustainEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.echoSustain];
			let useEchoSustainStart: number = effect.echoSustain;
			let useEchoSustainEnd: number = effect.echoSustain;
			// Check for echo mods
			if (synth.isModActive(Config.modulators.dictionary["echo"].index, channelIndex, instrumentIndex)) {
				useEchoSustainStart = Math.max(0.0, synth.getModValue(Config.modulators.dictionary["echo"].index, channelIndex, instrumentIndex, false));
				useEchoSustainEnd = Math.max(0.0, synth.getModValue(Config.modulators.dictionary["echo"].index, channelIndex, instrumentIndex, true));
			}
			const echoMultStart: number = Math.min(1.0, Math.pow(echoSustainEnvelopeStart * useEchoSustainStart / Config.echoSustainRange, 1.1)) * 0.9;
			const echoMultEnd: number = Math.min(1.0, Math.pow(echoSustainEnvelopeEnd * useEchoSustainEnd / Config.echoSustainRange, 1.1)) * 0.9;
			this.echoMult = echoMultStart;
			this.echoMultDelta = Math.max(0.0, (echoMultEnd - echoMultStart) / roundedSamplesPerTick);
			maxEchoMult = Math.max(echoMultStart, echoMultEnd);

			// TODO: After computing a tick's settings once for multiple run lengths (which is
			// good for audio worklet threads), compute the echo delay envelopes at tick (or
			// part) boundaries to interpolate between two delay taps.
			const echoDelayEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.echoDelay];
			const echoDelayEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.echoDelay];
			let useEchoDelayStart: number = effect.echoDelay * echoDelayEnvelopeStart;
			let useEchoDelayEnd: number = effect.echoDelay * echoDelayEnvelopeEnd;
			// let ignoreTicks: boolean = false;
			// Check for echo delay mods
			if (synth.isModActive(Config.modulators.dictionary["echo delay"].index, channelIndex, instrumentIndex)) {
				useEchoDelayStart = synth.getModValue(Config.modulators.dictionary["echo delay"].index, channelIndex, instrumentIndex, false) * echoDelayEnvelopeStart;
				useEchoDelayEnd = synth.getModValue(Config.modulators.dictionary["echo delay"].index, channelIndex, instrumentIndex, true) * echoDelayEnvelopeEnd;
				// ignoreTicks = true;
				// this.allocateEchoBuffers(samplesPerTick, Math.max(useEchoDelayStart,useEchoDelayEnd)); //update buffer size for modulation / envelopes
			}
			const tmpEchoDelayOffsetStart: number = /*ignoreTicks ? (useEchoDelayStart + 1) * Config.echoDelayStepTicks * samplesPerTick : */Math.round((useEchoDelayStart + 1) * Config.echoDelayStepTicks * samplesPerTick);
			const tmpEchoDelayOffsetEnd: number = /*ignoreTicks ? (useEchoDelayEnd + 1) * Config.echoDelayStepTicks * samplesPerTick : */Math.round((useEchoDelayEnd + 1) * Config.echoDelayStepTicks * samplesPerTick);
			if (this.echoDelayOffsetEnd != null/* && !ignoreTicks*/) {
				this.echoDelayOffsetStart = this.echoDelayOffsetEnd;
			} else {
				this.echoDelayOffsetStart = tmpEchoDelayOffsetStart;
			}

			this.echoDelayOffsetEnd = tmpEchoDelayOffsetEnd;
			averageEchoDelaySeconds = (this.echoDelayOffsetStart + this.echoDelayOffsetEnd) * 0.5 / samplesPerSecond;

			this.echoDelayOffsetRatio = 0.0;
			this.echoDelayOffsetRatioDelta = 1.0 / roundedSamplesPerTick;

			this.echoPingPong = ((effect.echoPingPong / Config.panMax) - 0.5) * 2;
			//const echoPingPongEnd

			const shelfRadians: number = 2.0 * Math.PI * Config.echoShelfHz / synth.samplesPerSecond;
			Synth.tempFilterStartCoefficients.highShelf1stOrder(shelfRadians, Config.echoShelfGain);
			this.echoShelfA1 = Synth.tempFilterStartCoefficients.a[1];
			this.echoShelfB0 = Synth.tempFilterStartCoefficients.b[0];
			this.echoShelfB1 = Synth.tempFilterStartCoefficients.b[1];
		}

		let maxReverbMult = 0.0;

		if (usesReverb) {
			const reverbEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.reverb];
			const reverbEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.reverb];

			let useReverbStart: number = effect.reverb;
			let useReverbEnd: number = effect.reverb;

			// Check for mod reverb, instrument level
			if (synth.isModActive(Config.modulators.dictionary["reverb"].index, channelIndex, instrumentIndex)) {
				useReverbStart = synth.getModValue(Config.modulators.dictionary["reverb"].index, channelIndex, instrumentIndex, false);
				useReverbEnd = synth.getModValue(Config.modulators.dictionary["reverb"].index, channelIndex, instrumentIndex, true);
			}
			// Check for mod reverb, song scalar
			if (synth.isModActive(Config.modulators.dictionary["song reverb"].index, channelIndex, instrumentIndex)) {
				useReverbStart *= (synth.getModValue(Config.modulators.dictionary["song reverb"].index, undefined, undefined, false) - Config.modulators.dictionary["song reverb"].convertRealFactor) / Config.reverbRange;
				useReverbEnd *= (synth.getModValue(Config.modulators.dictionary["song reverb"].index, undefined, undefined, true) - Config.modulators.dictionary["song reverb"].convertRealFactor) / Config.reverbRange;
			}

			const reverbStart: number = Math.min(1.0, Math.pow(reverbEnvelopeStart * useReverbStart / Config.reverbRange, 0.667)) * 0.425;
			const reverbEnd: number = Math.min(1.0, Math.pow(reverbEnvelopeEnd * useReverbEnd / Config.reverbRange, 0.667)) * 0.425;

			this.reverbMult = reverbStart;
			this.reverbMultDelta = (reverbEnd - reverbStart) / roundedSamplesPerTick;
			maxReverbMult = Math.max(reverbStart, reverbEnd);

			const shelfRadians: number = 2.0 * Math.PI * Config.reverbShelfHz / synth.samplesPerSecond;
			Synth.tempFilterStartCoefficients.highShelf1stOrder(shelfRadians, Config.reverbShelfGain);
			this.reverbShelfA1 = Synth.tempFilterStartCoefficients.a[1];
			this.reverbShelfB0 = Synth.tempFilterStartCoefficients.b[0];
			this.reverbShelfB1 = Synth.tempFilterStartCoefficients.b[1];
		}

		if (!instrumentState.tonesAddedInThisTick && !instrumentState.flushingDelayLines) {
			const attenuationThreshold: number = 1.0 / 256.0; // when the delay line signal has attenuated this much, it should be inaudible and should be flushed to zero.
			const halfLifeMult: number = -Math.log2(attenuationThreshold);

			if (usesChorus) {
				instrumentState.delayDuration += Config.chorusMaxDelay;
			}

			if (usesFlanger) {
				instrumentState.delayDuration += Config.flangerMaxDelay;
			}

			if (usesEcho) {
				const attenuationPerSecond: number = Math.pow(maxEchoMult, 1.0 / averageEchoDelaySeconds);
				const halfLife: number = -1.0 / Math.log2(attenuationPerSecond);
				const echoDuration: number = halfLife * halfLifeMult;
				instrumentState.delayDuration += echoDuration;
			}

			if (usesReverb) {
				const averageMult: number = maxReverbMult * 2.0;
				const averageReverbDelaySeconds: number = (Config.reverbDelayBufferSize / 4.0) / samplesPerSecond;
				const attenuationPerSecond: number = Math.pow(averageMult, 1.0 / averageReverbDelaySeconds);
				const halfLife: number = -1.0 / Math.log2(attenuationPerSecond);
				const reverbDuration: number = halfLife * halfLifeMult;
				instrumentState.delayDuration += reverbDuration;
			}

			if (usesGranular) {
				this.computeGrains = false;
			}
		} else {
			// Flushing delay lines to zero since the signal has mostly dissipated.
			//eqFilterVolumeStart = 0.0;
			//eqFilterVolumeEnd = 0.0;

			if (usesChorus) instrumentState.totalDelaySamples += synth.chorusDelayBufferSize;
			if (usesFlanger) instrumentState.totalDelaySamples += synth.flangerDelayBufferSize;
			if (usesEcho) instrumentState.totalDelaySamples += this.echoDelayLineL!.length;
			if (usesReverb) instrumentState.totalDelaySamples += Config.reverbDelayBufferSize;
			if (usesGranular) instrumentState.totalDelaySamples += this.granularMaximumDelayTimeInSeconds;
		}
	}
}
