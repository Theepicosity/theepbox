// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { EffectType, Config } from "./SynthConfig";
import { FilterSettings } from "./Filter";

export class Effect {
	public type: EffectType = EffectType.reverb;
	public wetDryMix: number = 0.5;
	public send: number = 1;

	public audioBusIndex: number = 0;
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
	public echoSustain: number = 0;
	public echoDelay: number = 0;
	public echoPingPong: number = Config.panCenter;

	constructor(type: EffectType) {
		this.type = type;
	}
}
