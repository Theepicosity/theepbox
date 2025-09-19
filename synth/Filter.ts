// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { EnvelopeType, FilterType, Config, Envelope } from "./SynthConfig";
import { FilterCoefficients, FrequencyResponse } from "./filtering";

export class FilterSettings {
    public readonly controlPoints: FilterControlPoint[] = [];
    public controlPointCount: number = 0;

    constructor() {
        this.reset();
    }

    reset(): void {
        this.controlPointCount = 0;
    }

    addPoint(type: FilterType, freqSetting: number, gainSetting: number, qSetting: number): void {
        let controlPoint: FilterControlPoint;
        if (this.controlPoints.length <= this.controlPointCount) {
            controlPoint = new FilterControlPoint();
            this.controlPoints[this.controlPointCount] = controlPoint;
        } else {
            controlPoint = this.controlPoints[this.controlPointCount];
        }
        this.controlPointCount++;
        controlPoint.type = type;
        controlPoint.set(freqSetting, gainSetting, qSetting);
    }

    public toJsonObject(): Object {
        const filterArray: any[] = [];
        for (let i: number = 0; i < this.controlPointCount; i++) {
            const point: FilterControlPoint = this.controlPoints[i];
            filterArray.push({
                "type": Config.filterTypeNames[point.type],
                "cutoffHz": Math.round(point.getHz() * 100) / 100,
                "linearGain": Math.round(point.getLinearGain() * 10000) / 10000,
                "Q": point.getQ(),
            });
        }
        return filterArray;
    }

    public fromJsonObject(filterObject: any): void {
        this.controlPoints.length = 0;
        if (filterObject) {
            for (const pointObject of filterObject) {
                const point: FilterControlPoint = new FilterControlPoint();
                point.type = Config.filterTypeNames.indexOf(pointObject["type"]);
                if (<any>point.type == -1) point.type = FilterType.peak;
                if (pointObject["cutoffHz"] != undefined) {
                    point.freq = FilterControlPoint.getRoundedSettingValueFromHz(pointObject["cutoffHz"]);
                } else {
                    point.freq = 0;
                }
                if (pointObject["linearGain"] != undefined) {
                    point.gain = FilterControlPoint.getRoundedSettingValueFromLinearGain(pointObject["linearGain"]);
                } else {
                    point.gain = Config.filterGainCenter;
                }
                if (pointObject["Q"] != undefined) {
                    point.q = FilterControlPoint.getSettingValueFromQ(pointObject["Q"]);
                } else {
                    point.q = 1.0;
                }
                this.controlPoints.push(point);
            }
        }
        this.controlPointCount = this.controlPoints.length;
    }

    // Returns true if all filter control points match in number and type (but not freq/gain)
    public static filtersCanMorph(filterA: FilterSettings, filterB: FilterSettings): boolean {
        if (filterA.controlPointCount != filterB.controlPointCount)
            return false;
        for (let i: number = 0; i < filterA.controlPointCount; i++) {
            if (filterA.controlPoints[i].type != filterB.controlPoints[i].type)
                return false;
        }
        return true;
    }

    // Interpolate two FilterSettings, where pos=0 is filterA and pos=1 is filterB
    public static lerpFilters(filterA: FilterSettings, filterB: FilterSettings, pos: number): FilterSettings {

        let lerpedFilter: FilterSettings = new FilterSettings();

        // One setting or another is null, return the other.
        if (filterA == null) {
            return filterA;
        }
        if (filterB == null) {
            return filterB;
        }

        pos = Math.max(0, Math.min(1, pos));

        // Filter control points match in number and type
        if (this.filtersCanMorph(filterA, filterB)) {
            for (let i: number = 0; i < filterA.controlPointCount; i++) {
                lerpedFilter.controlPoints[i] = new FilterControlPoint();
                lerpedFilter.controlPoints[i].type = filterA.controlPoints[i].type;
                lerpedFilter.controlPoints[i].freq = filterA.controlPoints[i].freq + (filterB.controlPoints[i].freq - filterA.controlPoints[i].freq) * pos;
                lerpedFilter.controlPoints[i].gain = filterA.controlPoints[i].gain + (filterB.controlPoints[i].gain - filterA.controlPoints[i].gain) * pos;
            }

            lerpedFilter.controlPointCount = filterA.controlPointCount;

            return lerpedFilter;
        }
        else {
            // Not allowing morph of unmatching filters for now. It's a hornet's nest of problems, and I had it implemented and mostly working and it didn't sound very interesting since the shape becomes "mushy" in between
            return (pos >= 1) ? filterB : filterA;
        }
    }

    public convertLegacySettings(legacyCutoffSetting: number, legacyResonanceSetting: number, legacyEnv: Envelope): void {
        this.reset();

        const legacyFilterCutoffMaxHz: number = 8000; // This was carefully calculated to correspond to no change in response when filtering at 48000 samples per second... when using the legacy simplified low-pass filter.
        const legacyFilterMax: number = 0.95;
        const legacyFilterMaxRadians: number = Math.asin(legacyFilterMax / 2.0) * 2.0;
        const legacyFilterMaxResonance: number = 0.95;
        const legacyFilterCutoffRange: number = 11;
        const legacyFilterResonanceRange: number = 8;

        const resonant: boolean = (legacyResonanceSetting > 1);
        const firstOrder: boolean = (legacyResonanceSetting == 0);
        const cutoffAtMax: boolean = (legacyCutoffSetting == legacyFilterCutoffRange - 1);
        const envDecays: boolean = (legacyEnv.type == EnvelopeType.flare || legacyEnv.type == EnvelopeType.twang || legacyEnv.type == EnvelopeType.decay || legacyEnv.type == EnvelopeType.noteSize);

        const standardSampleRate: number = 48000;
        const legacyHz: number = legacyFilterCutoffMaxHz * Math.pow(2.0, (legacyCutoffSetting - (legacyFilterCutoffRange - 1)) * 0.5);
        const legacyRadians: number = Math.min(legacyFilterMaxRadians, 2 * Math.PI * legacyHz / standardSampleRate);

        if (legacyEnv.type == EnvelopeType.none && !resonant && cutoffAtMax) {
            // The response is flat and there's no envelopes, so don't even bother adding any control points.
        } else if (firstOrder) {
            // In general, a 1st order lowpass can be approximated by a 2nd order lowpass
            // with a cutoff ~4 octaves higher (*16) and a gain of 1/16.
            // However, BeepBox's original lowpass filters behaved oddly as they
            // approach the nyquist frequency, so I've devised this curved conversion
            // to guess at a perceptually appropriate new cutoff frequency and gain.
            const extraOctaves: number = 3.5;
            const targetRadians: number = legacyRadians * Math.pow(2.0, extraOctaves);
            const curvedRadians: number = targetRadians / (1.0 + targetRadians / Math.PI);
            const curvedHz: number = standardSampleRate * curvedRadians / (2.0 * Math.PI)
            const freqSetting: number = FilterControlPoint.getRoundedSettingValueFromHz(curvedHz);
            const finalHz: number = FilterControlPoint.getHzFromSettingValue(freqSetting);
            const finalRadians: number = 2.0 * Math.PI * finalHz / standardSampleRate;

            const legacyFilter: FilterCoefficients = new FilterCoefficients();
            legacyFilter.lowPass1stOrderSimplified(legacyRadians);
            const response: FrequencyResponse = new FrequencyResponse();
            response.analyze(legacyFilter, finalRadians);
            const legacyFilterGainAtNewRadians: number = response.magnitude();

            let logGain: number = Math.log2(legacyFilterGainAtNewRadians);
            // Bias slightly toward 2^(-extraOctaves):
            logGain = -extraOctaves + (logGain + extraOctaves) * 0.82;
            // Decaying envelopes move the cutoff frequency back into an area where the best approximation of the first order slope requires a lower gain setting.
            if (envDecays) logGain = Math.min(logGain, -1.0);
            const convertedGain: number = Math.pow(2.0, logGain);
            const gainSetting: number = FilterControlPoint.getRoundedSettingValueFromLinearGain(convertedGain);

            this.addPoint(FilterType.lowPass, freqSetting, gainSetting, 1.0);
        } else {
            const intendedGain: number = 0.5 / (1.0 - legacyFilterMaxResonance * Math.sqrt(Math.max(0.0, legacyResonanceSetting - 1.0) / (legacyFilterResonanceRange - 2.0)));
            const invertedGain: number = 0.5 / intendedGain;
            const maxRadians: number = 2.0 * Math.PI * legacyFilterCutoffMaxHz / standardSampleRate;
            const freqRatio: number = legacyRadians / maxRadians;
            const targetRadians: number = legacyRadians * (freqRatio * Math.pow(invertedGain, 0.9) + 1.0);
            const curvedRadians: number = legacyRadians + (targetRadians - legacyRadians) * invertedGain;
            let curvedHz: number;
            if (envDecays) {
                curvedHz = standardSampleRate * Math.min(curvedRadians, legacyRadians * Math.pow(2, 0.25)) / (2.0 * Math.PI);
            } else {
                curvedHz = standardSampleRate * curvedRadians / (2.0 * Math.PI);
            }
            const freqSetting: number = FilterControlPoint.getRoundedSettingValueFromHz(curvedHz);

            let legacyFilterGain: number;
            if (envDecays) {
                legacyFilterGain = intendedGain;
            } else {
                const legacyFilter: FilterCoefficients = new FilterCoefficients();
                legacyFilter.lowPass2ndOrderSimplified(legacyRadians, intendedGain);
                const response: FrequencyResponse = new FrequencyResponse();
                response.analyze(legacyFilter, curvedRadians);
                legacyFilterGain = response.magnitude();
            }
            if (!resonant) legacyFilterGain = Math.min(legacyFilterGain, Math.sqrt(0.5));
            const gainSetting: number = FilterControlPoint.getRoundedSettingValueFromLinearGain(legacyFilterGain);

            this.addPoint(FilterType.lowPass, freqSetting, gainSetting, 1.0);
        }

        // Added for JummBox - making a 0 point filter does not truncate control points!
        this.controlPoints.length = this.controlPointCount;
    }

    // Similar to above, but purpose-fit for quick conversions in synth calls.
    public convertLegacySettingsForSynth(legacyCutoffSetting: number, legacyResonanceSetting: number, allowFirstOrder: boolean = false): void {
        this.reset();

        const legacyFilterCutoffMaxHz: number = 8000; // This was carefully calculated to correspond to no change in response when filtering at 48000 samples per second... when using the legacy simplified low-pass filter.
        const legacyFilterMax: number = 0.95;
        const legacyFilterMaxRadians: number = Math.asin(legacyFilterMax / 2.0) * 2.0;
        const legacyFilterMaxResonance: number = 0.95;
        const legacyFilterCutoffRange: number = 11;
        const legacyFilterResonanceRange: number = 8;

        const firstOrder: boolean = (legacyResonanceSetting == 0 && allowFirstOrder);
        const standardSampleRate: number = 48000;
        const legacyHz: number = legacyFilterCutoffMaxHz * Math.pow(2.0, (legacyCutoffSetting - (legacyFilterCutoffRange - 1)) * 0.5);
        const legacyRadians: number = Math.min(legacyFilterMaxRadians, 2 * Math.PI * legacyHz / standardSampleRate);

        if (firstOrder) {
            // In general, a 1st order lowpass can be approximated by a 2nd order lowpass
            // with a cutoff ~4 octaves higher (*16) and a gain of 1/16.
            // However, BeepBox's original lowpass filters behaved oddly as they
            // approach the nyquist frequency, so I've devised this curved conversion
            // to guess at a perceptually appropriate new cutoff frequency and gain.
            const extraOctaves: number = 3.5;
            const targetRadians: number = legacyRadians * Math.pow(2.0, extraOctaves);
            const curvedRadians: number = targetRadians / (1.0 + targetRadians / Math.PI);
            const curvedHz: number = standardSampleRate * curvedRadians / (2.0 * Math.PI)
            const freqSetting: number = FilterControlPoint.getRoundedSettingValueFromHz(curvedHz);
            const finalHz: number = FilterControlPoint.getHzFromSettingValue(freqSetting);
            const finalRadians: number = 2.0 * Math.PI * finalHz / standardSampleRate;

            const legacyFilter: FilterCoefficients = new FilterCoefficients();
            legacyFilter.lowPass1stOrderSimplified(legacyRadians);
            const response: FrequencyResponse = new FrequencyResponse();
            response.analyze(legacyFilter, finalRadians);
            const legacyFilterGainAtNewRadians: number = response.magnitude();

            let logGain: number = Math.log2(legacyFilterGainAtNewRadians);
            // Bias slightly toward 2^(-extraOctaves):
            logGain = -extraOctaves + (logGain + extraOctaves) * 0.82;
            const convertedGain: number = Math.pow(2.0, logGain);
            const gainSetting: number = FilterControlPoint.getRoundedSettingValueFromLinearGain(convertedGain);

            this.addPoint(FilterType.lowPass, freqSetting, gainSetting, 1.0);
        } else {
            const intendedGain: number = 0.5 / (1.0 - legacyFilterMaxResonance * Math.sqrt(Math.max(0.0, legacyResonanceSetting - 1.0) / (legacyFilterResonanceRange - 2.0)));
            const invertedGain: number = 0.5 / intendedGain;
            const maxRadians: number = 2.0 * Math.PI * legacyFilterCutoffMaxHz / standardSampleRate;
            const freqRatio: number = legacyRadians / maxRadians;
            const targetRadians: number = legacyRadians * (freqRatio * Math.pow(invertedGain, 0.9) + 1.0);
            const curvedRadians: number = legacyRadians + (targetRadians - legacyRadians) * invertedGain;
            let curvedHz: number;

            curvedHz = standardSampleRate * curvedRadians / (2.0 * Math.PI);
            const freqSetting: number = FilterControlPoint.getSettingValueFromHz(curvedHz);

            let legacyFilterGain: number;

            const legacyFilter: FilterCoefficients = new FilterCoefficients();
            legacyFilter.lowPass2ndOrderSimplified(legacyRadians, intendedGain);
            const response: FrequencyResponse = new FrequencyResponse();
            response.analyze(legacyFilter, curvedRadians);
            legacyFilterGain = response.magnitude();
            const gainSetting: number = FilterControlPoint.getRoundedSettingValueFromLinearGain(legacyFilterGain);

            this.addPoint(FilterType.lowPass, freqSetting, gainSetting, 1.0);
        }

    }
}

export class FilterControlPoint {
    public freq: number = 0;
    public gain: number = Config.filterGainCenter;
    public type: FilterType = FilterType.peak;
    public q: number = 1.0;

    public set(freqSetting: number, gainSetting: number, qSetting: number): void {
        this.freq = freqSetting;
        this.gain = gainSetting;
        this.q = qSetting;
    }

    public getHz(): number {
        return FilterControlPoint.getHzFromSettingValue(this.freq);
    }

    public static getHzFromSettingValue(value: number): number {
        return Config.filterFreqReferenceHz * Math.pow(2.0, (value - Config.filterFreqReferenceSetting) * Config.filterFreqStep);
    }
    public static getSettingValueFromHz(hz: number): number {
        return Math.log2(hz / Config.filterFreqReferenceHz) / Config.filterFreqStep + Config.filterFreqReferenceSetting;
    }
    public static getRoundedSettingValueFromHz(hz: number): number {
        return Math.max(0, Math.min(Config.filterFreqRange - 1, Math.round(FilterControlPoint.getSettingValueFromHz(hz))));
    }
    public static getSettingValueFromQ(q: number): number {
        return (q - Config.filterQStep) / Config.filterQStep;
    }

    public getQ(): number {
        return this.q * Config.filterQStep + Config.filterQStep;
    }
    public getLinearGain(peakMult: number = 1.0): number {
        const power: number = (this.gain - Config.filterGainCenter) * Config.filterGainStep;
        const neutral: number = (this.type == FilterType.peak) ? 0.0 : -0.5;
        const interpolatedPower: number = neutral + (power - neutral) * peakMult;
        return Math.pow(2.0, interpolatedPower);
    }
    public static getRoundedSettingValueFromLinearGain(linearGain: number): number {
        return Math.max(0, Math.min(Config.filterGainRange - 1, Math.round(Math.log2(linearGain) / Config.filterGainStep + Config.filterGainCenter)));
    }

    public toCoefficients(filter: FilterCoefficients, sampleRate: number, freqMult: number = 1.0, peakMult: number = 1.0): void {
        const cornerRadiansPerSample: number = 2.0 * Math.PI * Math.max(Config.filterFreqMinHz, Math.min(Config.filterFreqMaxHz, freqMult * this.getHz())) / sampleRate;
        const linearGain: number = this.getLinearGain(peakMult);
        const q: number = this.getQ();
        switch (this.type) {
            case FilterType.lowPass:
                filter.lowPass2ndOrderButterworth(cornerRadiansPerSample, linearGain);
                break;
            case FilterType.highPass:
                filter.highPass2ndOrderButterworth(cornerRadiansPerSample, linearGain);
                break;
            case FilterType.peak:
                filter.peak2ndOrder(cornerRadiansPerSample, linearGain, q);
                break;
            case FilterType.lowShelf:
                //filter.lowShelf2ndOrder(cornerRadiansPerSample, linearGain, q);
                break;
            case FilterType.highShelf:
                filter.highShelf2ndOrder(cornerRadiansPerSample, linearGain, q);
                break;
            default:
                throw new Error();
        }
    }

    public getVolumeCompensationMult(): number {
        const octave: number = (this.freq - Config.filterFreqReferenceSetting) * Config.filterFreqStep;
        const gainPow: number = (this.gain - Config.filterGainCenter) * Config.filterGainStep;
        switch (this.type) {
            case FilterType.lowPass:
                const freqRelativeTo8khz: number = Math.pow(2.0, octave) * Config.filterFreqReferenceHz / 8000.0;
                // Reverse the frequency warping from importing legacy simplified filters to imitate how the legacy filter cutoff setting affected volume.
                const warpedFreq: number = (Math.sqrt(1.0 + 4.0 * freqRelativeTo8khz) - 1.0) / 2.0;
                const warpedOctave: number = Math.log2(warpedFreq);
                return Math.pow(0.5, 0.2 * Math.max(0.0, gainPow + 1.0) + Math.min(0.0, Math.max(-3.0, 0.595 * warpedOctave + 0.35 * Math.min(0.0, gainPow + 1.0))));
            case FilterType.highPass:
                return Math.pow(0.5, 0.125 * Math.max(0.0, gainPow + 1.0) + Math.min(0.0, 0.3 * (-octave - Math.log2(Config.filterFreqReferenceHz / 125.0)) + 0.2 * Math.min(0.0, gainPow + 1.0)));
            case FilterType.peak:
                const distanceFromCenter: number = octave + Math.log2(Config.filterFreqReferenceHz / 2000.0);
                const freqLoudness: number = Math.pow(1.0 / (1.0 + Math.pow(distanceFromCenter / 3.0, 2.0)), 2.0);
                return Math.pow(0.5, 0.125 * Math.max(0.0, gainPow) + 0.1 * freqLoudness * Math.min(0.0, gainPow));
            default:
                throw new Error();
        }
    }
}
