// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Config } from "./SynthConfig";

export function clamp(min: number, max: number, val: number): number {
	max = max - 1;
	if (val <= max) {
		if (val >= min) return val;
		else return min;
	} else {
		return max;
	}
}

export function validateRange(min: number, max: number, val: number): number {
	if (min <= val && val <= max) return val;
	throw new Error(`Value ${val} not in range [${min}, ${max}]`);
}

export function parseFloatWithDefault<T>(s: string, defaultValue: T): number | T {
	let result: number | T = parseFloat(s);
	if (Number.isNaN(result)) result = defaultValue;
	return result;
}

export function parseIntWithDefault<T>(s: string, defaultValue: T): number | T {
	let result: number | T = parseInt(s);
	if (Number.isNaN(result)) result = defaultValue;
	return result;
}

export function fadeInSettingToSeconds(setting: number): number {
	return 0.0125 * (0.95 * setting + 0.05 * setting * setting);
}

export function secondsToFadeInSetting(seconds: number): number {
	return clamp(0, Config.fadeInRange, Math.round((-0.95 + Math.sqrt(0.9025 + 0.2 * seconds / 0.0125)) / 0.1));
}

export function fadeOutSettingToTicks(setting: number): number {
	return (1 - (setting % 1)) * Config.fadeOutTicks[Math.max(0, Math.floor(setting))] + (setting % 1) * Config.fadeOutTicks[Math.min(Config.fadeOutTicks.length - 1, Math.ceil(setting))]; // Config.fadeOutTicks[setting];
}

export function ticksToFadeOutSetting(ticks: number): number {
	let lower: number = Config.fadeOutTicks[0];
	if (ticks <= lower) return 0;
	for (let i: number = 1; i < Config.fadeOutTicks.length; i++) {
		let upper: number = Config.fadeOutTicks[i];
		if (ticks <= upper) return (ticks < (lower + upper) / 2) ? i - 1 : i;
		lower = upper;
	}
	return Config.fadeOutTicks.length - 1;
}

// public static lerp(t: number, a: number, b: number): number {
//     return a + (b - a) * t;
// }

// public static unlerp(x: number, a: number, b: number): number {
//     return (x - a) / (b - a);
// }

export function detuneToCents(detune: number): number {
	// BeepBox formula, for reference:
	// return detune * (Math.abs(detune) + 1) / 2;
	return detune - Config.detuneCenter;
}

export function centsToDetune(cents: number): number {
	// BeepBox formula, for reference:
	// return Math.sign(cents) * (Math.sqrt(1 + 8 * Math.abs(cents)) - 1) / 2.0;
	return cents + Config.detuneCenter;
}

export function fittingPowerOfTwo(x: number): number {
	return 1 << (32 - Math.clz32(Math.ceil(x) - 1));
}
