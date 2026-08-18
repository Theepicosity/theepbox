// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { EffectType, Config } from "./SynthConfig";
import { FilterSettings } from "./Filter";

export class Effect {
	public type: EffectType = EffectType.reverb;
	//public wetDryMix: number = 0.5;
	//public send: number = 1;

	public eqFilter: FilterSettings = new FilterSettings();
	public eqFilterType: boolean = false;
	public eqFilterSimpleCut: number = Config.filterSimpleCutRange - 1;
	public eqFilterSimplePeak: number = 0;
	public eqSubFilters: (FilterSettings | null)[] = [];
	public tmpEqFilterStart: FilterSettings | null;
	public tmpEqFilterEnd: FilterSettings | null;
	//public envelopes: EnvelopeSettings[] = [];
	//public envelopeCount: number = 0;
	//public envelopeSpeed: number = 12;

	public gain: number = Config.volumeRange / 2;
	public pan: number = Config.panCenter;
	public panDelay: number = 0;
	public panMode: number = 0;
	public aliases: boolean = false;
	public distortion: number = 0;
	public clippingInGain: number = 0;
	public clippingThreshold: number = 0;
	public clippingType: number = 0;
	public bitcrusherFreq: number = 0;
	public bitcrusherQuantization: number = 0;
	public ringModulation: number = Math.floor(Config.ringModRange/2);
	public ringModulationHz: number = Math.floor(Config.ringModHzRange / 2);
	public ringModWaveformIndex: number = 0;
	public ringModPulseWidth: number = 0;
	public ringModHzOffset: number = 200;
	public granular: number = 4;
	public grainSize: number = (Config.grainSizeMax-Config.grainSizeMin)/Config.grainSizeStep;
	public grainAmounts: number = Config.grainAmountsMax;
	public grainRange: number = 40;
	public flanger: number = 0;
	public flangerSpeed: number = 0;
	public flangerDepth: number = 0;
	public flangerFeedback: number = 0;
	public chorus: number = 0;
	public reverb: number = 0;
	public reverbWetDryMix: number = Config.reverbWetDryMixRange / 2.0;
	public reverbSend: number = Config.reverbSendRange;
	public echoSustain: number = 0;
	public echoDelay: number = 11;
	public echoPingPong: number = Config.panCenter;

	constructor(type: EffectType) {
		this.type = type;
	}

	public toJsonObject(): Object {
		const effectObject: any = {
			"type": Config.effectNames[Config.effectOrder.indexOf(this.type)],
		};
		if(this.type == EffectType.eqFilter) {
			effectObject["eqFilter"] = this.eqFilter.toJsonObject();
			effectObject["eqFilterType"] = this.eqFilterType
			effectObject["eqFilterSimpleCut"] = this.eqFilterSimpleCut
			effectObject["eqFilterSimplePeak"] = this.eqFilterSimplePeak
			for (let i: number = 0; i < Config.filterMorphCount; i++) {
				if (this.eqSubFilters[i] != null)
					effectObject["eqSubFilters" + i] = this.eqSubFilters[i]!.toJsonObject();
			}
		} else if (this.type == EffectType.gain) {
			effectObject["gain"] = this.gain;
		} else if (this.type == EffectType.panning) {
			effectObject["pan"] = this.pan;
			effectObject["panDelay"] = this.panDelay;
			effectObject["panMode"] = this.panMode;
		} else if (this.type == EffectType.distortion) {
			effectObject["aliases"] = this.aliases;
			effectObject["distortion"] = this.distortion;
		} else if (this.type == EffectType.clipping) {
			effectObject["clippingInGain"] = this.clippingInGain;
			effectObject["clippingThreshold"] = this.clippingThreshold;
			effectObject["clippingType"] = this.clippingType;
		} else if (this.type == EffectType.bitcrusher) {
			effectObject["bitcrusherFreq"] = this.bitcrusherFreq;
			effectObject["bitcrusherQuantization"] = this.bitcrusherQuantization;
		} else if (this.type == EffectType.ringModulation) {
			effectObject["ringModulation"] = this.ringModulation;
			effectObject["ringModulationHz"] = this.ringModulationHz;
			effectObject["ringModWaveformIndex"] = this.ringModWaveformIndex;
			effectObject["ringModPulseWidth"] = this.ringModPulseWidth;
			effectObject["ringModHzOffset"] = this.ringModHzOffset;
		} else if (this.type == EffectType.granular) {
			effectObject["granular"] = this.granular;
			effectObject["grainSize"] = this.grainSize;
			effectObject["grainAmounts"] = this.grainAmounts;
			effectObject["grainRange"] = this.grainRange;
		} else if (this.type == EffectType.flanger) {
			effectObject["flanger"] = this.flanger;
			effectObject["flangerSpeed"] = this.flangerSpeed;
			effectObject["flangerDepth"] = this.flangerDepth;
			effectObject["flangerFeedback"] = this.flangerFeedback;
		} else if (this.type == EffectType.chorus) {
			effectObject["chorus"] = this.chorus;
		} else if (this.type == EffectType.reverb) {
			effectObject["reverb"] = this.reverb;
			effectObject["reverbWetDryMix"] = this.reverbWetDryMix;
			effectObject["reverbSend"] = this.reverbSend;
		} else if (this.type == EffectType.echo) {
			effectObject["echoSustain"] = this.echoSustain;
			effectObject["echoDelay"] = this.echoDelay;
			effectObject["echoPingPong"] = this.echoPingPong;
		}

		return effectObject
	}

	public fromJsonObject(effectObject: any): void {
		this.type = Config.effectOrder[Config.effectNames.indexOf(effectObject["type"])];

		//TODO: legacy filter settings...
		if (this.type == EffectType.eqFilter) {
			if (effectObject["eqFilterType"] != undefined) {
				this.eqFilterType = effectObject["eqFilterType"];
			}
			if (effectObject["eqSimpleCut"] != undefined) {
				this.eqFilterSimpleCut = effectObject["eqSimpleCut"];
			}
			if (effectObject["eqSimplePeak"] != undefined) {
				this.eqFilterSimplePeak = effectObject["eqSimplePeak"];
			}
			if (effectObject["eqFilter"] != undefined) {
				this.eqFilter.fromJsonObject(effectObject["eqFilter"]);
			} else {
				this.eqFilter.reset();
			}
			for (let i: number = 0; i < Config.filterMorphCount; i++) {
				if (Array.isArray(effectObject["eqSubFilters" + i])) {
					this.eqSubFilters[i] = new FilterSettings();
					this.eqSubFilters[i]!.fromJsonObject(effectObject["eqSubFilters" + i]);
				}
			}
		} else if (this.type == EffectType.gain) {
			this.gain = effectObject["gain"];
		} else if (this.type == EffectType.panning) {
			this.pan = effectObject["pan"];
			this.panDelay = effectObject["panDelay"];
			this.panMode = effectObject["panMode"];
		} else if (this.type == EffectType.distortion) {
			this.aliases = effectObject["aliases"];
			this.distortion = effectObject["distortion"];
		} else if (this.type == EffectType.clipping) {
			this.clippingInGain = effectObject["clippingInGain"];
			this.clippingThreshold = effectObject["clippingThreshold"];
			this.clippingType = effectObject["clippingType"];
		} else if (this.type == EffectType.bitcrusher) {
			this.bitcrusherFreq = effectObject["bitcrusherFreq"];
			this.bitcrusherQuantization = effectObject["bitcrusherQuantization"];
		} else if (this.type == EffectType.ringModulation) {
			this.ringModulation = effectObject["ringModulation"];
			this.ringModulationHz = effectObject["ringModulationHz"];
			this.ringModWaveformIndex = effectObject["ringModWaveformIndex"];
			this.ringModPulseWidth = effectObject["ringModPulseWidth"];
			this.ringModHzOffset = effectObject["ringModHzOffset"];
		} else if (this.type == EffectType.granular) {
			this.granular = effectObject["granular"];
			this.grainSize = effectObject["grainSize"];
			this.grainAmounts = effectObject["grainAmounts"];
			this.grainRange = effectObject["grainRange"];
		} else if (this.type == EffectType.flanger) {
			this.flanger = effectObject["flanger"];
			this.flangerSpeed = effectObject["flangerSpeed"];
			this.flangerDepth = effectObject["flangerDepth"];
			this.flangerFeedback = effectObject["flangerFeedback"];
		} else if (this.type == EffectType.chorus) {
			this.chorus = effectObject["chorus"];
		} else if (this.type == EffectType.reverb) {
			this.reverb = effectObject["reverb"];
			this.reverbWetDryMix = effectObject["reverbWetDryMix"];
			this.reverbSend = effectObject["reverbSend"];
		} else if (this.type == EffectType.echo) {
			this.echoSustain = effectObject["echoSustain"];
			this.echoDelay = effectObject["echoDelay"];
			this.echoPingPong = effectObject["echoPingPong"];
		}
	}
}
