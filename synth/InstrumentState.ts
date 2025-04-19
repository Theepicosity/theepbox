// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { FilterType, SustainType,  InstrumentType, EffectType, EnvelopeComputeIndex, Unison, Chord, Config, getDrumWave, drawNoiseSpectrum, performIntegralOld,  effectsIncludeEQFilter, effectsIncludeDistortion, effectsIncludeBitcrusher, effectsIncludePanning, effectsIncludeChorus, effectsIncludeEcho, effectsIncludeReverb, effectsIncludeRingModulation, effectsIncludeGranular, GranularEnvelopeType, calculateRingModHertz } from "./SynthConfig";
import { scaleElementsByFactor, inverseRealFourierTransform} from "./FFT";
import { Deque } from "./Deque";
import { DynamicBiquadFilter, warpInfinityToNyquist } from "./filtering";
import { SpectrumWave, HarmonicsWave, Instrument } from "./Instrument";
import { Synth, Tone } from "./synth";
import { EnvelopeComputer } from "./EnvelopeComputer";
import { FilterSettings, FilterControlPoint } from "./Filter";
import { fittingPowerOfTwo } from "./utils";

export class SpectrumWaveState {
    public wave: Float32Array | null = null;
    private _hash: number = -1;

    public getCustomWave(settings: SpectrumWave, lowestOctave: number): Float32Array {
        if (this._hash == settings.hash) return this.wave!;
        this._hash = settings.hash;

        const waveLength: number = Config.spectrumNoiseLength;
        if (this.wave == null || this.wave.length != waveLength + 1) {
            this.wave = new Float32Array(waveLength + 1);
        }
        const wave: Float32Array = this.wave;

        for (let i: number = 0; i < waveLength; i++) {
            wave[i] = 0;
        }

        const highestOctave: number = 14;
        const falloffRatio: number = 0.25;
        // Nudge the 2/7 and 4/7 control points so that they form harmonic intervals.
        const pitchTweak: number[] = [0, 1 / 7, Math.log2(5 / 4), 3 / 7, Math.log2(3 / 2), 5 / 7, 6 / 7];
        function controlPointToOctave(point: number): number {
            return lowestOctave + Math.floor(point / Config.spectrumControlPointsPerOctave) + pitchTweak[(point + Config.spectrumControlPointsPerOctave) % Config.spectrumControlPointsPerOctave];
        }

        let combinedAmplitude: number = 1;
        for (let i: number = 0; i < Config.spectrumControlPoints + 1; i++) {
            const value1: number = (i <= 0) ? 0 : settings.spectrum[i - 1];
            const value2: number = (i >= Config.spectrumControlPoints) ? settings.spectrum[Config.spectrumControlPoints - 1] : settings.spectrum[i];
            const octave1: number = controlPointToOctave(i - 1);
            let octave2: number = controlPointToOctave(i);
            if (i >= Config.spectrumControlPoints) octave2 = highestOctave + (octave2 - highestOctave) * falloffRatio;
            if (value1 == 0 && value2 == 0) continue;

            combinedAmplitude += 0.02 * drawNoiseSpectrum(wave, waveLength, octave1, octave2, value1 / Config.spectrumMax, value2 / Config.spectrumMax, -0.5);
        }
        if (settings.spectrum[Config.spectrumControlPoints - 1] > 0) {
            combinedAmplitude += 0.02 * drawNoiseSpectrum(wave, waveLength, highestOctave + (controlPointToOctave(Config.spectrumControlPoints) - highestOctave) * falloffRatio, highestOctave, settings.spectrum[Config.spectrumControlPoints - 1] / Config.spectrumMax, 0, -0.5);
        }

        inverseRealFourierTransform(wave, waveLength);
        scaleElementsByFactor(wave, 5.0 / (Math.sqrt(waveLength) * Math.pow(combinedAmplitude, 0.75)));

        // Duplicate the first sample at the end for easier wrap-around interpolation.
        wave[waveLength] = wave[0];

        return wave;
    }
}

export class HarmonicsWaveState {
    public wave: Float32Array | null = null;
    private _hash: number = -1;
    private _generatedForType: InstrumentType;

    public getCustomWave(settings: HarmonicsWave, instrumentType: InstrumentType): Float32Array {
        if (this._hash == settings.hash && this._generatedForType == instrumentType) return this.wave!;
        this._hash = settings.hash;
        this._generatedForType = instrumentType;

        const harmonicsRendered: number = (instrumentType == InstrumentType.pickedString) ? Config.harmonicsRenderedForPickedString : Config.harmonicsRendered;

        const waveLength: number = Config.harmonicsWavelength;
        const retroWave: Float32Array = getDrumWave(0, null, null);

        if (this.wave == null || this.wave.length != waveLength + 1) {
            this.wave = new Float32Array(waveLength + 1);
        }
        const wave: Float32Array = this.wave;

        for (let i: number = 0; i < waveLength; i++) {
            wave[i] = 0;
        }

        const overallSlope: number = -0.25;
        let combinedControlPointAmplitude: number = 1;

        for (let harmonicIndex: number = 0; harmonicIndex < harmonicsRendered; harmonicIndex++) {
            const harmonicFreq: number = harmonicIndex + 1;
            let controlValue: number = harmonicIndex < Config.harmonicsControlPoints ? settings.harmonics[harmonicIndex] : settings.harmonics[Config.harmonicsControlPoints - 1];
            if (harmonicIndex >= Config.harmonicsControlPoints) {
                controlValue *= 1 - (harmonicIndex - Config.harmonicsControlPoints) / (harmonicsRendered - Config.harmonicsControlPoints);
            }
            const normalizedValue: number = controlValue / Config.harmonicsMax;
            let amplitude: number = Math.pow(2, controlValue - Config.harmonicsMax + 1) * Math.sqrt(normalizedValue);
            if (harmonicIndex < Config.harmonicsControlPoints) {
                combinedControlPointAmplitude += amplitude;
            }
            amplitude *= Math.pow(harmonicFreq, overallSlope);

            // Multiply all the sine wave amplitudes by 1 or -1 based on the LFSR
            // retro wave (effectively random) to avoid egregiously tall spikes.
            amplitude *= retroWave[harmonicIndex + 589];

            wave[waveLength - harmonicFreq] = amplitude;
        }

        inverseRealFourierTransform(wave, waveLength);

        // Limit the maximum wave amplitude.
        const mult: number = 1 / Math.pow(combinedControlPointAmplitude, 0.7);
        for (let i: number = 0; i < wave.length; i++) wave[i] *= mult;

        performIntegralOld(wave);

        // The first sample should be zero, and we'll duplicate it at the end for easier interpolation.
        wave[waveLength] = wave[0];

        return wave;
    }
}

export class PickedString {
    public delayLine: Float32Array | null = null;
    public delayIndex: number;
    public allPassSample: number;
    public allPassPrevInput: number;
    public sustainFilterSample: number;
    public sustainFilterPrevOutput2: number;
    public sustainFilterPrevInput1: number;
    public sustainFilterPrevInput2: number;
    public fractionalDelaySample: number;
    public prevDelayLength: number;
    public delayLengthDelta: number;
    public delayResetOffset: number;

    public allPassG: number = 0.0;
    public allPassGDelta: number = 0.0;
    public sustainFilterA1: number = 0.0;
    public sustainFilterA1Delta: number = 0.0;
    public sustainFilterA2: number = 0.0;
    public sustainFilterA2Delta: number = 0.0;
    public sustainFilterB0: number = 0.0;
    public sustainFilterB0Delta: number = 0.0;
    public sustainFilterB1: number = 0.0;
    public sustainFilterB1Delta: number = 0.0;
    public sustainFilterB2: number = 0.0;
    public sustainFilterB2Delta: number = 0.0;

    constructor() {
        this.reset();
    }

    public reset(): void {
        this.delayIndex = -1;
        this.allPassSample = 0.0;
        this.allPassPrevInput = 0.0;
        this.sustainFilterSample = 0.0;
        this.sustainFilterPrevOutput2 = 0.0;
        this.sustainFilterPrevInput1 = 0.0;
        this.sustainFilterPrevInput2 = 0.0;
        this.fractionalDelaySample = 0.0;
        this.prevDelayLength = -1.0;
        this.delayResetOffset = 0;
    }

    public update(synth: Synth, instrumentState: InstrumentState, tone: Tone, stringIndex: number, roundedSamplesPerTick: number, stringDecayStart: number, stringDecayEnd: number, sustainType: SustainType): void {
        const allPassCenter: number = 2.0 * Math.PI * Config.pickedStringDispersionCenterFreq / synth.samplesPerSecond;

        const prevDelayLength: number = this.prevDelayLength;

        const phaseDeltaStart: number = tone.phaseDeltas[stringIndex];
        const phaseDeltaScale: number = tone.phaseDeltaScales[stringIndex];
        const phaseDeltaEnd: number = phaseDeltaStart * Math.pow(phaseDeltaScale, roundedSamplesPerTick);

        const radiansPerSampleStart: number = Math.PI * 2.0 * phaseDeltaStart;
        const radiansPerSampleEnd: number = Math.PI * 2.0 * phaseDeltaEnd;

        const centerHarmonicStart: number = radiansPerSampleStart * 2.0;
        const centerHarmonicEnd: number = radiansPerSampleEnd * 2.0;

        const allPassRadiansStart: number = Math.min(Math.PI, radiansPerSampleStart * Config.pickedStringDispersionFreqMult * Math.pow(allPassCenter / radiansPerSampleStart, Config.pickedStringDispersionFreqScale));
        const allPassRadiansEnd: number = Math.min(Math.PI, radiansPerSampleEnd * Config.pickedStringDispersionFreqMult * Math.pow(allPassCenter / radiansPerSampleEnd, Config.pickedStringDispersionFreqScale));
        const shelfRadians: number = 2.0 * Math.PI * Config.pickedStringShelfHz / synth.samplesPerSecond;
        const decayCurveStart: number = (Math.pow(100.0, stringDecayStart) - 1.0) / 99.0;
        const decayCurveEnd: number   = (Math.pow(100.0, stringDecayEnd  ) - 1.0) / 99.0;
        const register: number = sustainType == SustainType.acoustic ? 0.25 : 0.0;
        const registerShelfCenter: number = 15.6;
        const registerLowpassCenter: number = 3.0 * synth.samplesPerSecond / 48000;
        //const decayRateStart: number = Math.pow(0.5, decayCurveStart * shelfRadians / radiansPerSampleStart);
        //const decayRateEnd: number   = Math.pow(0.5, decayCurveEnd   * shelfRadians / radiansPerSampleEnd);
        const decayRateStart: number = Math.pow(0.5, decayCurveStart * Math.pow(shelfRadians / (radiansPerSampleStart * registerShelfCenter), (1.0 + 2.0 * register)) * registerShelfCenter);
        const decayRateEnd:   number = Math.pow(0.5, decayCurveEnd   * Math.pow(shelfRadians / (radiansPerSampleEnd   * registerShelfCenter), (1.0 + 2.0 * register)) * registerShelfCenter);

        const expressionDecayStart: number = Math.pow(decayRateStart, 0.002);
        const expressionDecayEnd: number = Math.pow(decayRateEnd, 0.002);

        Synth.tempFilterStartCoefficients.allPass1stOrderInvertPhaseAbove(allPassRadiansStart);
        synth.tempFrequencyResponse.analyze(Synth.tempFilterStartCoefficients, centerHarmonicStart);
        const allPassGStart: number = Synth.tempFilterStartCoefficients.b[0]; /* same as a[1] */
        const allPassPhaseDelayStart: number = -synth.tempFrequencyResponse.angle() / centerHarmonicStart;

        Synth.tempFilterEndCoefficients.allPass1stOrderInvertPhaseAbove(allPassRadiansEnd);
        synth.tempFrequencyResponse.analyze(Synth.tempFilterEndCoefficients, centerHarmonicEnd);
        const allPassGEnd: number = Synth.tempFilterEndCoefficients.b[0]; /* same as a[1] */
        const allPassPhaseDelayEnd: number = -synth.tempFrequencyResponse.angle() / centerHarmonicEnd;

        // 1st order shelf filters and 2nd order lowpass filters have differently shaped frequency
        // responses, as well as adjustable shapes. I originally picked a 1st order shelf filter,
        // but I kinda prefer 2nd order lowpass filters now and I designed a couple settings:
        const enum PickedStringBrightnessType {
            bright, // 1st order shelf
            normal, // 2nd order lowpass, rounded corner
            resonant, // 3rd order lowpass, harder corner
        }
        const brightnessType: PickedStringBrightnessType = <any> sustainType == SustainType.bright ? PickedStringBrightnessType.bright : PickedStringBrightnessType.normal;
        if (brightnessType == PickedStringBrightnessType.bright) {
            const shelfGainStart: number = Math.pow(decayRateStart, Config.stringDecayRate);
            const shelfGainEnd: number   = Math.pow(decayRateEnd,   Config.stringDecayRate);
            Synth.tempFilterStartCoefficients.highShelf2ndOrder(shelfRadians, shelfGainStart, 0.5);
            Synth.tempFilterEndCoefficients.highShelf2ndOrder(shelfRadians, shelfGainEnd, 0.5);
        } else {
            const cornerHardness: number = Math.pow(brightnessType == PickedStringBrightnessType.normal ? 0.0 : 1.0, 0.25);
            const lowpass1stOrderCutoffRadiansStart: number = Math.pow(registerLowpassCenter * registerLowpassCenter * radiansPerSampleStart * 3.3 * 48000 / synth.samplesPerSecond, 0.5 + register) / registerLowpassCenter / Math.pow(decayCurveStart, .5);
            const lowpass1stOrderCutoffRadiansEnd:   number = Math.pow(registerLowpassCenter * registerLowpassCenter * radiansPerSampleEnd   * 3.3 * 48000 / synth.samplesPerSecond, 0.5 + register) / registerLowpassCenter / Math.pow(decayCurveEnd,   .5);
            const lowpass2ndOrderCutoffRadiansStart: number = lowpass1stOrderCutoffRadiansStart * Math.pow(2.0, 0.5 - 1.75 * (1.0 - Math.pow(1.0 - cornerHardness, 0.85)));
            const lowpass2ndOrderCutoffRadiansEnd:   number = lowpass1stOrderCutoffRadiansEnd   * Math.pow(2.0, 0.5 - 1.75 * (1.0 - Math.pow(1.0 - cornerHardness, 0.85)));
            const lowpass2ndOrderGainStart: number = Math.pow(2.0, -Math.pow(2.0, -Math.pow(cornerHardness, 0.9)));
            const lowpass2ndOrderGainEnd:   number = Math.pow(2.0, -Math.pow(2.0, -Math.pow(cornerHardness, 0.9)));
            Synth.tempFilterStartCoefficients.lowPass2ndOrderButterworth(warpInfinityToNyquist(lowpass2ndOrderCutoffRadiansStart), lowpass2ndOrderGainStart);
            Synth.tempFilterEndCoefficients  .lowPass2ndOrderButterworth(warpInfinityToNyquist(lowpass2ndOrderCutoffRadiansEnd),   lowpass2ndOrderGainEnd);
        }

        synth.tempFrequencyResponse.analyze(Synth.tempFilterStartCoefficients, centerHarmonicStart);
        const sustainFilterA1Start: number = Synth.tempFilterStartCoefficients.a[1];
        const sustainFilterA2Start: number = Synth.tempFilterStartCoefficients.a[2];
        const sustainFilterB0Start: number = Synth.tempFilterStartCoefficients.b[0] * expressionDecayStart;
        const sustainFilterB1Start: number = Synth.tempFilterStartCoefficients.b[1] * expressionDecayStart;
        const sustainFilterB2Start: number = Synth.tempFilterStartCoefficients.b[2] * expressionDecayStart;
        const sustainFilterPhaseDelayStart: number = -synth.tempFrequencyResponse.angle() / centerHarmonicStart;

        synth.tempFrequencyResponse.analyze(Synth.tempFilterEndCoefficients, centerHarmonicEnd);
        const sustainFilterA1End: number = Synth.tempFilterEndCoefficients.a[1];
        const sustainFilterA2End: number = Synth.tempFilterEndCoefficients.a[2];
        const sustainFilterB0End: number = Synth.tempFilterEndCoefficients.b[0] * expressionDecayEnd;
        const sustainFilterB1End: number = Synth.tempFilterEndCoefficients.b[1] * expressionDecayEnd;
        const sustainFilterB2End: number = Synth.tempFilterEndCoefficients.b[2] * expressionDecayEnd;
        const sustainFilterPhaseDelayEnd: number = -synth.tempFrequencyResponse.angle() / centerHarmonicEnd;

        const periodLengthStart: number = 1.0 / phaseDeltaStart;
        const periodLengthEnd: number = 1.0 / phaseDeltaEnd;
        const minBufferLength: number = Math.ceil(Math.max(periodLengthStart, periodLengthEnd) * 2);
        const delayLength: number = periodLengthStart - allPassPhaseDelayStart - sustainFilterPhaseDelayStart;
        const delayLengthEnd: number = periodLengthEnd - allPassPhaseDelayEnd - sustainFilterPhaseDelayEnd;

        this.prevDelayLength = delayLength;
        this.delayLengthDelta = (delayLengthEnd - delayLength) / roundedSamplesPerTick;
        this.allPassG = allPassGStart;
        this.sustainFilterA1 = sustainFilterA1Start;
        this.sustainFilterA2 = sustainFilterA2Start;
        this.sustainFilterB0 = sustainFilterB0Start;
        this.sustainFilterB1 = sustainFilterB1Start;
        this.sustainFilterB2 = sustainFilterB2Start;
        this.allPassGDelta = (allPassGEnd - allPassGStart) / roundedSamplesPerTick;
        this.sustainFilterA1Delta = (sustainFilterA1End - sustainFilterA1Start) / roundedSamplesPerTick;
        this.sustainFilterA2Delta = (sustainFilterA2End - sustainFilterA2Start) / roundedSamplesPerTick;
        this.sustainFilterB0Delta = (sustainFilterB0End - sustainFilterB0Start) / roundedSamplesPerTick;
        this.sustainFilterB1Delta = (sustainFilterB1End - sustainFilterB1Start) / roundedSamplesPerTick;
        this.sustainFilterB2Delta = (sustainFilterB2End - sustainFilterB2Start) / roundedSamplesPerTick;

        const pitchChanged: boolean = Math.abs(Math.log2(delayLength / prevDelayLength)) > 0.01;

        const reinitializeImpulse: boolean = (this.delayIndex == -1 || pitchChanged);
        if (this.delayLine == null || this.delayLine.length <= minBufferLength) {
            // The delay line buffer will get reused for other tones so might as well
            // start off with a buffer size that is big enough for most notes.
            const likelyMaximumLength: number = Math.ceil(2 * synth.samplesPerSecond / Instrument.frequencyFromPitch(12));
            const newDelayLine: Float32Array = new Float32Array(fittingPowerOfTwo(Math.max(likelyMaximumLength, minBufferLength)));
            if (!reinitializeImpulse && this.delayLine != null) {
                // If the tone has already started but the buffer needs to be reallocated,
                // transfer the old data to the new buffer.
                const oldDelayBufferMask: number = (this.delayLine.length - 1) >> 0;
                const startCopyingFromIndex: number = this.delayIndex + this.delayResetOffset;
                this.delayIndex = this.delayLine.length - this.delayResetOffset;
                for (let i: number = 0; i < this.delayLine.length; i++) {
                    newDelayLine[i] = this.delayLine[(startCopyingFromIndex + i) & oldDelayBufferMask];
                }
            }
            this.delayLine = newDelayLine;
        }
        const delayLine: Float32Array = this.delayLine;
        const delayBufferMask: number = (delayLine.length - 1) >> 0;

        if (reinitializeImpulse) {
            // -1 delay index means the tone was reset.
            // Also, if the pitch changed suddenly (e.g. from seamless or arpeggio) then reset the wave.

            this.delayIndex = 0;
            this.allPassSample = 0.0;
            this.allPassPrevInput = 0.0;
            this.sustainFilterSample = 0.0;
            this.sustainFilterPrevOutput2 = 0.0;
            this.sustainFilterPrevInput1 = 0.0;
            this.sustainFilterPrevInput2 = 0.0;
            this.fractionalDelaySample = 0.0;

            // Clear away a region of the delay buffer for the new impulse.
            const startImpulseFrom: number = -delayLength;
            const startZerosFrom: number = Math.floor(startImpulseFrom - periodLengthStart / 2);
            const stopZerosAt: number = Math.ceil(startZerosFrom + periodLengthStart * 2);
            this.delayResetOffset = stopZerosAt; // And continue clearing the area in front of the delay line.
            for (let i: number = startZerosFrom; i <= stopZerosAt; i++) {
                delayLine[i & delayBufferMask] = 0.0;
            }

            const impulseWave: Float32Array = instrumentState.waveL!;
            const impulseWaveLength: number = impulseWave.length - 1; // The first sample is duplicated at the end, don't double-count it.
            const impulsePhaseDelta: number = impulseWaveLength / periodLengthStart;

            const fadeDuration: number = Math.min(periodLengthStart * 0.2, synth.samplesPerSecond * 0.003);
            const startImpulseFromSample: number = Math.ceil(startImpulseFrom);
            const stopImpulseAt: number = startImpulseFrom + periodLengthStart + fadeDuration;
            const stopImpulseAtSample: number = stopImpulseAt;
            let impulsePhase: number = (startImpulseFromSample - startImpulseFrom) * impulsePhaseDelta;
            let prevWaveIntegral: number = 0.0;
            for (let i: number = startImpulseFromSample; i <= stopImpulseAtSample; i++) {
                const impulsePhaseInt: number = impulsePhase | 0;
                const index: number = impulsePhaseInt % impulseWaveLength;
                let nextWaveIntegral: number = impulseWave[index];
                const phaseRatio: number = impulsePhase - impulsePhaseInt;
                nextWaveIntegral += (impulseWave[index + 1] - nextWaveIntegral) * phaseRatio;
                const sample: number = (nextWaveIntegral - prevWaveIntegral) / impulsePhaseDelta;
                const fadeIn: number = Math.min(1.0, (i - startImpulseFrom) / fadeDuration);
                const fadeOut: number = Math.min(1.0, (stopImpulseAt - i) / fadeDuration);
                const combinedFade: number = fadeIn * fadeOut;
                const curvedFade: number = combinedFade * combinedFade * (3.0 - 2.0 * combinedFade); // A cubic sigmoid from 0 to 1.
                delayLine[i & delayBufferMask] += sample * curvedFade;
                prevWaveIntegral = nextWaveIntegral;
                impulsePhase += impulsePhaseDelta;
            }
        }
    }
}

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

export class InstrumentState {
    public awake: boolean = false; // Whether the instrument's effects-processing loop should continue.
    public computed: boolean = false; // Whether the effects-processing parameters are up-to-date for the current synth run.
    public tonesAddedInThisTick: boolean = false; // Whether any instrument tones are currently active.
    public flushingDelayLines: boolean = false; // If no tones were active recently, enter a mode where the delay lines are filled with zeros to reset them for later use.
    public deactivateAfterThisTick: boolean = false; // Whether the instrument is ready to be deactivated because the delay lines, if any, are fully zeroed.
    public attentuationProgress: number = 0.0; // How long since an active tone introduced an input signal to the delay lines, normalized from 0 to 1 based on how long to wait until the delay lines signal will have audibly dissapated.
    public flushedSamples: number = 0; // How many delay line samples have been flushed to zero.
    public readonly activeTones: Deque<Tone> = new Deque<Tone>();
    public readonly activeModTones: Deque<Tone> = new Deque<Tone>();
    public readonly releasedTones: Deque<Tone> = new Deque<Tone>(); // Tones that are in the process of fading out after the corresponding notes ended.
    public readonly liveInputTones: Deque<Tone> = new Deque<Tone>(); // Tones that are initiated by a source external to the loaded song data.

    public type: InstrumentType = InstrumentType.chip;
    public synthesizer: Function | null = null;
    public waveL: Float32Array | null = null;
    public waveR: Float32Array | null = null;
    public isStereo: boolean = false; //this refers to whether or not the synth should be processed through the effect chain in mono or stereo...
    // advloop addition
    public isUsingAdvancedLoopControls = false;
    public chipWaveLoopStart = 0;
    public chipWaveLoopEnd = 0;
    public chipWaveLoopMode = 0;
    public chipWavePlayBackwards = false;
    public chipWaveStartOffset = 0;
    // advloop addition
    public chipWaveInStereo = false; //...and this refers to whether or not the stereo checkmark is active.
    public noisePitchFilterMult: number = 1.0;
    public unison: Unison | null = null;
    public unisonVoices: number = 1;
    public unisonSpread: number = 0.0;
    public unisonOffset: number = 0.0;
    public unisonExpression: number = 1.4;
    public unisonSign: number = 1.0;
    public chord: Chord | null = null;
    public effects: number = 0;
    public effectOrder: Array<EffectType> = [EffectType.panning, EffectType.transition, EffectType.chord, EffectType.pitchShift, EffectType.detune, EffectType.vibrato, EffectType.eqFilter, EffectType.noteRange, EffectType.granular, EffectType.distortion, EffectType.bitcrusher, EffectType.chorus, EffectType.echo, EffectType.reverb, EffectType.ringModulation];

    public volumeScale: number = 0;
    public aliases: boolean = false;
    public arpTime: number = 0;
    public vibratoTime: number = 0;
    public nextVibratoTime: number = 0;
    public envelopeTime: number[] = [];

    public eqFilterVolume: number = 1.0;
    public eqFilterVolumeDelta: number = 0.0;
    public mixVolume: number = 1.0;
    public mixVolumeDelta: number = 0.0;
    public delayInputMult: number = 0.0;
    public delayInputMultDelta: number = 0.0;

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
    public echoDelayPos: number = 0;
    public echoDelayOffsetStart: number = 0;
    public echoDelayOffsetEnd: number | null = null;
    public echoDelayOffsetRatio: number = 0.0;
    public echoDelayOffsetRatioDelta: number = 0.0;
    public echoMult: number = 0.0;
    public echoMultDelta: number = 0.0;
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

    public readonly spectrumWave: SpectrumWaveState = new SpectrumWaveState();
    public readonly harmonicsWave: HarmonicsWaveState = new HarmonicsWaveState();
    public readonly drumsetSpectrumWaves: SpectrumWaveState[] = [];

    constructor() {
        for (let i: number = 0; i < Config.drumCount; i++) {
            this.drumsetSpectrumWaves[i] = new SpectrumWaveState();
        }
        // Allocate all grains to be used ahead of time.
        // granularGrainsLength is what indicates how many grains actually "exist".
        this.granularGrains = [];
        this.granularMaximumGrains = 256;
        for (let i: number = 0; i < this.granularMaximumGrains; i++) {
            this.granularGrains.push(new Grain());
        }
        this.granularGrainsLength = 0;
    }

    public readonly envelopeComputer: EnvelopeComputer = new EnvelopeComputer();

    public allocateNecessaryBuffers(synth: Synth, instrument: Instrument, samplesPerTick: number): void {
        if (effectsIncludePanning(instrument.effects)) {
            if (this.panningDelayLineL == null || this.panningDelayLineR == null || this.panningDelayLineL.length < synth.panningDelayBufferSize || this.panningDelayLineR.length < synth.panningDelayBufferSize) {
                this.panningDelayLineL = new Float32Array(synth.panningDelayBufferSize);
                this.panningDelayLineR = new Float32Array(synth.panningDelayBufferSize);
            }
        }
        if (effectsIncludeChorus(instrument.effects)) {
            if (this.chorusDelayLineL == null || this.chorusDelayLineL.length < synth.chorusDelayBufferSize) {
                this.chorusDelayLineL = new Float32Array(synth.chorusDelayBufferSize);
            }
            if (this.chorusDelayLineR == null || this.chorusDelayLineR.length < synth.chorusDelayBufferSize) {
                this.chorusDelayLineR = new Float32Array(synth.chorusDelayBufferSize);
            }
        }
        if (effectsIncludeEcho(instrument.effects)) {
            this.allocateEchoBuffers(samplesPerTick, instrument.echoDelay);
        }
        if (effectsIncludeReverb(instrument.effects)) {
            // TODO: Make reverb delay line sample rate agnostic. Maybe just double buffer size for 96KHz? Adjust attenuation and shelf cutoff appropriately?
            if (this.reverbDelayLine == null) {
                this.reverbDelayLine = new Float32Array(Config.reverbDelayBufferSize);
            }
        }
        if (effectsIncludeGranular(instrument.effects)) {
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
                newDelayLineL[i] = this.echoDelayLineL[(this.echoDelayPos + i) & oldMask];
                newDelayLineR[i] = this.echoDelayLineL[(this.echoDelayPos + i) & oldMask];
            }

            this.echoDelayPos = this.echoDelayLineL.length;
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

        this.volumeScale = 1.0;
        this.aliases = false;

        this.awake = false;
        this.flushingDelayLines = false;
        this.deactivateAfterThisTick = false;
        this.attentuationProgress = 0.0;
        this.flushedSamples = 0;
    }

    public resetAllEffects(): void {
        this.deactivate();
        // LFOs are reset here rather than in deactivate() for periodic oscillation that stays "on the beat". Resetting in deactivate() will cause it to reset with each note.
        this.vibratoTime = 0;
        this.nextVibratoTime = 0;
        this.arpTime = 0;
        for (let envelopeIndex: number = 0; envelopeIndex < Config.maxEnvelopeCount + 1; envelopeIndex++) this.envelopeTime[envelopeIndex] = 0;
        this.envelopeComputer.reset();

        if (this.chorusDelayLineDirty) {
            for (let i: number = 0; i < this.chorusDelayLineL!.length; i++) this.chorusDelayLineL![i] = 0.0;
            for (let i: number = 0; i < this.chorusDelayLineR!.length; i++) this.chorusDelayLineR![i] = 0.0;
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

        this.chorusPhase = 0.0;
        this.ringModPhase = 0.0;
        this.ringModMixFade = 1.0;
    }

    public compute(synth: Synth, instrument: Instrument, samplesPerTick: number, roundedSamplesPerTick: number, tone: Tone | null, channelIndex: number, instrumentIndex: number): void {
        this.computed = true;

        this.type = instrument.type;
        this.synthesizer = Synth.getInstrumentSynthFunction(instrument);
        this.unison = Config.unisons[instrument.unison];
        this.chord = instrument.getChord();
        this.noisePitchFilterMult = Config.chipNoises[instrument.chipNoise].pitchFilterMult;
        this.effects = instrument.effects;
        this.effectOrder = instrument.effectOrder;

        this.aliases = instrument.aliases;
        this.volumeScale = 1.0;
        this.panningMode = instrument.panMode;

        this.allocateNecessaryBuffers(synth, instrument, samplesPerTick);

        const samplesPerSecond: number = synth.samplesPerSecond;
        this.updateWaves(instrument, samplesPerSecond);

        const ticksIntoBar: number = synth.getTicksIntoBar();
        const tickTimeStart: number = ticksIntoBar;
        const secondsPerTick: number = samplesPerTick / synth.samplesPerSecond;
        const currentPart: number = synth.getCurrentPart();
        const envelopeSpeeds: number[] = [];
        for (let i: number = 0; i < Config.maxEnvelopeCount; i++) {
            envelopeSpeeds[i] = 0;
        }
        let useEnvelopeSpeed: number = Config.arpSpeedScale[instrument.envelopeSpeed];
        if (synth.isModActive(Config.modulators.dictionary["envelope speed"].index, channelIndex, instrumentIndex)) {
            useEnvelopeSpeed = Math.max(0, Math.min(Config.arpSpeedScale.length - 1, synth.getModValue(Config.modulators.dictionary["envelope speed"].index, channelIndex, instrumentIndex, false)));
            if (Number.isInteger(useEnvelopeSpeed)) {
                useEnvelopeSpeed = Config.arpSpeedScale[useEnvelopeSpeed];
            } else {
                // Linear interpolate envelope values
                useEnvelopeSpeed = ((1 - (useEnvelopeSpeed % 1)) * Config.arpSpeedScale[Math.floor(useEnvelopeSpeed)] + (useEnvelopeSpeed % 1) * Config.arpSpeedScale[Math.ceil(useEnvelopeSpeed)]);
            }
        }
        for (let envelopeIndex: number = 0; envelopeIndex < instrument.envelopeCount; envelopeIndex++) {
            let perEnvelopeSpeed: number = instrument.envelopes[envelopeIndex].perEnvelopeSpeed;
            if (synth.isModActive(Config.modulators.dictionary["individual envelope speed"].index, channelIndex, instrumentIndex) && instrument.envelopes[envelopeIndex].tempEnvelopeSpeed != null) {
                perEnvelopeSpeed = instrument.envelopes[envelopeIndex].tempEnvelopeSpeed!;
            }
            envelopeSpeeds[envelopeIndex] = useEnvelopeSpeed * perEnvelopeSpeed;
        }
        this.envelopeComputer.computeEnvelopes(instrument, currentPart, this.envelopeTime, tickTimeStart, secondsPerTick, tone, envelopeSpeeds, this, synth, channelIndex, instrumentIndex);
        const envelopeStarts: number[] = this.envelopeComputer.envelopeStarts;
        const envelopeEnds: number[] = this.envelopeComputer.envelopeEnds;

        const usesGranular: boolean = effectsIncludeGranular(this.effects);
        const usesRingModulation: boolean = effectsIncludeRingModulation(this.effects);
        const usesDistortion: boolean = effectsIncludeDistortion(this.effects);
        const usesBitcrusher: boolean = effectsIncludeBitcrusher(this.effects);
        const usesPanning: boolean = effectsIncludePanning(this.effects);
        const usesChorus: boolean = effectsIncludeChorus(this.effects);
        const usesEcho: boolean = effectsIncludeEcho(this.effects);
        const usesReverb: boolean = effectsIncludeReverb(this.effects);
        const usesEQFilter: boolean = effectsIncludeEQFilter(this.effects);

        if (usesGranular) { //has to happen before buffer allocation
            this.granularMaximumGrains = Math.pow(2, instrument.grainAmounts * envelopeStarts[EnvelopeComputeIndex.grainAmount]);
            if (synth.isModActive(Config.modulators.dictionary["grain freq"].index, channelIndex, instrumentIndex)) {
                this.granularMaximumGrains = Math.pow(2, synth.getModValue(Config.modulators.dictionary["grain freq"].index, channelIndex, instrumentIndex, false) * envelopeStarts[EnvelopeComputeIndex.grainAmount]);
            }
            this.granularMaximumGrains == Math.floor(this.granularMaximumGrains);
        }

        this.allocateNecessaryBuffers(synth, instrument, samplesPerTick);


        if (usesGranular) {
            this.granularMix = instrument.granular / Config.granularRange;
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
                    let granularMinGrainSizeInMilliseconds: number = instrument.grainSize;
                    if (synth.isModActive(Config.modulators.dictionary["grain size"].index, channelIndex, instrumentIndex)) {
                        granularMinGrainSizeInMilliseconds = synth.getModValue(Config.modulators.dictionary["grain size"].index, channelIndex, instrumentIndex, false);
                    }
                    granularMinGrainSizeInMilliseconds *= envelopeStarts[EnvelopeComputeIndex.grainSize];
                    let grainRange = instrument.grainRange;
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
            let useDistortionStart: number = instrument.distortion;
            let useDistortionEnd: number = instrument.distortion;

            // Check for distortion mods
            if (synth.isModActive(Config.modulators.dictionary["distortion"].index, channelIndex, instrumentIndex)) {
                useDistortionStart = synth.getModValue(Config.modulators.dictionary["distortion"].index, channelIndex, instrumentIndex, false);
                useDistortionEnd = synth.getModValue(Config.modulators.dictionary["distortion"].index, channelIndex, instrumentIndex, true);
            }

            const distortionSliderStart = Math.min(1.0, envelopeStarts[EnvelopeComputeIndex.distortion] * useDistortionStart / (Config.distortionRange - 1));
            const distortionSliderEnd = Math.min(1.0, envelopeEnds[EnvelopeComputeIndex.distortion] * useDistortionEnd / (Config.distortionRange - 1));
            const distortionStart: number = Math.pow(1.0 - 0.895 * (Math.pow(20.0, distortionSliderStart) - 1.0) / 19.0, 2.0);
            const distortionEnd: number = Math.pow(1.0 - 0.895 * (Math.pow(20.0, distortionSliderEnd) - 1.0) / 19.0, 2.0);
            const distortionDriveStart: number = (1.0 + 2.0 * distortionSliderStart) / Config.distortionBaseVolume;
            const distortionDriveEnd: number = (1.0 + 2.0 * distortionSliderEnd) / Config.distortionBaseVolume;
            this.distortion = distortionStart;
            this.distortionDelta = (distortionEnd - distortionStart) / roundedSamplesPerTick;
            this.distortionDrive = distortionDriveStart;
            this.distortionDriveDelta = (distortionDriveEnd - distortionDriveStart) / roundedSamplesPerTick;
        }

        if (usesBitcrusher) {
            let freqSettingStart: number = instrument.bitcrusherFreq * Math.sqrt(envelopeStarts[EnvelopeComputeIndex.bitcrusherFrequency]);
            let freqSettingEnd: number = instrument.bitcrusherFreq * Math.sqrt(envelopeEnds[EnvelopeComputeIndex.bitcrusherFrequency]);

            // Check for freq crush mods
            if (synth.isModActive(Config.modulators.dictionary["freq crush"].index, channelIndex, instrumentIndex)) {
                freqSettingStart = synth.getModValue(Config.modulators.dictionary["freq crush"].index, channelIndex, instrumentIndex, false) * Math.sqrt(envelopeStarts[EnvelopeComputeIndex.bitcrusherFrequency]);
                freqSettingEnd = synth.getModValue(Config.modulators.dictionary["freq crush"].index, channelIndex, instrumentIndex, true) * Math.sqrt(envelopeEnds[EnvelopeComputeIndex.bitcrusherFrequency]);
            }

            let quantizationSettingStart: number = instrument.bitcrusherQuantization * Math.sqrt(envelopeStarts[EnvelopeComputeIndex.bitcrusherQuantization]);
            let quantizationSettingEnd: number = instrument.bitcrusherQuantization * Math.sqrt(envelopeEnds[EnvelopeComputeIndex.bitcrusherQuantization]);

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

        let eqFilterVolume: number = 1.0; //this.envelopeComputer.lowpassCutoffDecayVolumeCompensation;
        if (instrument.eqFilterType && usesEQFilter) {
            // Simple EQ filter (old style). For analysis, using random filters from normal style since they are N/A in this context.
            const eqFilterSettingsStart: FilterSettings = instrument.eqFilter;
            if (instrument.eqSubFilters[1] == null)
                instrument.eqSubFilters[1] = new FilterSettings();
            const eqFilterSettingsEnd: FilterSettings = instrument.eqSubFilters[1];

            // Change location based on slider values
            let startSimpleFreq: number = instrument.eqFilterSimpleCut;
            let startSimpleGain: number = instrument.eqFilterSimplePeak;
            let endSimpleFreq: number = instrument.eqFilterSimpleCut;
            let endSimpleGain: number = instrument.eqFilterSimplePeak;

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

            eqFilterVolume *= startPoint.getVolumeCompensationMult();

            this.eqFilterCount = 1;
            eqFilterVolume = Math.min(3.0, eqFilterVolume);
        }
        else {
            const eqFilterSettings: FilterSettings = (instrument.tmpEqFilterStart != null) ? instrument.tmpEqFilterStart : instrument.eqFilter;
            //const eqAllFreqsEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterAllFreqs];
            //const eqAllFreqsEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterAllFreqs];
            for (let i: number = 0; i < eqFilterSettings.controlPointCount; i++) {
                //const eqFreqEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterFreq0 + i];
                //const eqFreqEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterFreq0 + i];
                //const eqPeakEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterGain0 + i];
                //const eqPeakEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterGain0 + i];
                let startPoint: FilterControlPoint = eqFilterSettings.controlPoints[i];
                let endPoint: FilterControlPoint = (instrument.tmpEqFilterEnd != null && instrument.tmpEqFilterEnd.controlPoints[i] != null) ? instrument.tmpEqFilterEnd.controlPoints[i] : eqFilterSettings.controlPoints[i];

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
            eqFilterVolume = Math.min(3.0, eqFilterVolume);
        }

        const mainInstrumentVolume: number = Synth.instrumentVolumeToVolumeMult(instrument.volume);
        this.mixVolume = mainInstrumentVolume /** envelopeStarts[InstrumentAutomationIndex.mixVolume]*/;
        let mixVolumeEnd: number = mainInstrumentVolume /** envelopeEnds[  InstrumentAutomationIndex.mixVolume]*/;

        // Check for mod-related volume delta
        if (synth.isModActive(Config.modulators.dictionary["post volume"].index, channelIndex, instrumentIndex)) {
            // Linear falloff below 0, normal volume formula above 0. Seems to work best for scaling since the normal volume mult formula has a big gap from -25 to -24.
            const startVal: number = synth.getModValue(Config.modulators.dictionary["post volume"].index, channelIndex, instrumentIndex, false);
            const endVal: number = synth.getModValue(Config.modulators.dictionary["post volume"].index, channelIndex, instrumentIndex, true);
            this.mixVolume *= ((startVal <= 0) ? ((startVal + Config.volumeRange / 2) / (Config.volumeRange / 2)) : Synth.instrumentVolumeToVolumeMult(startVal));
            mixVolumeEnd *= ((endVal <= 0) ? ((endVal + Config.volumeRange / 2) / (Config.volumeRange / 2)) : Synth.instrumentVolumeToVolumeMult(endVal));
        }

        // Check for SONG mod-related volume delta
        if (synth.isModActive(Config.modulators.dictionary["song volume"].index)) {
            this.mixVolume *= (synth.getModValue(Config.modulators.dictionary["song volume"].index, undefined, undefined, false)) / 100.0;
            mixVolumeEnd *= (synth.getModValue(Config.modulators.dictionary["song volume"].index, undefined, undefined, true)) / 100.0;
        }

        this.mixVolumeDelta = (mixVolumeEnd - this.mixVolume) / roundedSamplesPerTick;

        let eqFilterVolumeStart: number = eqFilterVolume;
        let eqFilterVolumeEnd: number = eqFilterVolume;
        let delayInputMultStart: number = 1.0;
        let delayInputMultEnd: number = 1.0;

        if (usesPanning) {
            const panEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.panning] * 2.0 - 1.0;
            const panEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.panning] * 2.0 - 1.0;

            let usePanStart: number = instrument.pan;
            let usePanEnd: number = instrument.pan;
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

            let usePanDelayStart: number = instrument.panDelay;
            let usePanDelayEnd: number = instrument.panDelay;
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

        if (usesChorus) {
            const chorusEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.chorus];
            const chorusEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.chorus];
            let useChorusStart: number = instrument.chorus;
            let useChorusEnd: number = instrument.chorus;
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

        if (usesRingModulation) {
            let useRingModStart: number = instrument.ringModulation;
            let useRingModEnd: number = instrument.ringModulation;

            let useRingModEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.ringModulation];
            let useRingModEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.ringModulation];

            let useRingModHzStart: number = Math.min(1.0, instrument.ringModulationHz / (Config.ringModHzRange - 1));
            let useRingModHzEnd: number = Math.min(1.0, instrument.ringModulationHz / (Config.ringModHzRange - 1));
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

            this.ringModHzOffset = instrument.ringModHzOffset;

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

            this.ringModWaveformIndex = instrument.ringModWaveformIndex;
            this.ringModPulseWidth = instrument.ringModPulseWidth;

        }

        let maxEchoMult = 0.0;
        let averageEchoDelaySeconds: number = 0.0;
        if (usesEcho) {

            const echoSustainEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.echoSustain];
            const echoSustainEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.echoSustain];
            let useEchoSustainStart: number = instrument.echoSustain;
            let useEchoSustainEnd: number = instrument.echoSustain;
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
            let useEchoDelayStart: number = instrument.echoDelay * echoDelayEnvelopeStart;
            let useEchoDelayEnd: number = instrument.echoDelay * echoDelayEnvelopeEnd;
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

            let useReverbStart: number = instrument.reverb;
            let useReverbEnd: number = instrument.reverb;

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

        if (this.tonesAddedInThisTick) {
            this.attentuationProgress = 0.0;
            this.flushedSamples = 0;
            this.flushingDelayLines = false;
        } else if (!this.flushingDelayLines) {
            // If this instrument isn't playing tones anymore, the volume can fade out by the
            // end of the first tick. It's possible for filters and the panning delay line to
            // continue past the end of the tone but they should have mostly dissipated by the
            // end of the tick anyway.
            if (this.attentuationProgress == 0.0) {
                eqFilterVolumeEnd = 0.0;
            } else {
                eqFilterVolumeStart = 0.0;
                eqFilterVolumeEnd = 0.0;
            }

            const attenuationThreshold: number = 1.0 / 256.0; // when the delay line signal has attenuated this much, it should be inaudible and should be flushed to zero.
            const halfLifeMult: number = -Math.log2(attenuationThreshold);
            let delayDuration: number = 0.0;

            if (usesChorus) {
                delayDuration += Config.chorusMaxDelay;
            }

            if (usesEcho) {
                const attenuationPerSecond: number = Math.pow(maxEchoMult, 1.0 / averageEchoDelaySeconds);
                const halfLife: number = -1.0 / Math.log2(attenuationPerSecond);
                const echoDuration: number = halfLife * halfLifeMult;
                delayDuration += echoDuration;
            }

            if (usesReverb) {
                const averageMult: number = maxReverbMult * 2.0;
                const averageReverbDelaySeconds: number = (Config.reverbDelayBufferSize / 4.0) / samplesPerSecond;
                const attenuationPerSecond: number = Math.pow(averageMult, 1.0 / averageReverbDelaySeconds);
                const halfLife: number = -1.0 / Math.log2(attenuationPerSecond);
                const reverbDuration: number = halfLife * halfLifeMult;
                delayDuration += reverbDuration;
            }

            if (usesGranular) {
                this.computeGrains = false;
            }

            const secondsInTick: number = samplesPerTick / samplesPerSecond;
            const progressInTick: number = secondsInTick / delayDuration;
            const progressAtEndOfTick: number = this.attentuationProgress + progressInTick;
            if (progressAtEndOfTick >= 1.0) {
                delayInputMultEnd = 0.0;
            }

            this.attentuationProgress = progressAtEndOfTick;
            if (this.attentuationProgress >= 1.0) {
                this.flushingDelayLines = true;
            }
        } else {
            // Flushing delay lines to zero since the signal has mostly dissipated.
            eqFilterVolumeStart = 0.0;
            eqFilterVolumeEnd = 0.0;
            delayInputMultStart = 0.0;
            delayInputMultEnd = 0.0;

            let totalDelaySamples: number = 0;
            if (usesChorus) totalDelaySamples += synth.chorusDelayBufferSize;
            if (usesEcho) totalDelaySamples += this.echoDelayLineL!.length;
            if (usesReverb) totalDelaySamples += Config.reverbDelayBufferSize;
            if (usesGranular) totalDelaySamples += this.granularMaximumDelayTimeInSeconds;

            this.flushedSamples += roundedSamplesPerTick;
            if (this.flushedSamples >= totalDelaySamples) {
                this.deactivateAfterThisTick = true;
            }
        }

        this.eqFilterVolume = eqFilterVolumeStart;
        this.eqFilterVolumeDelta = (eqFilterVolumeEnd - eqFilterVolumeStart) / roundedSamplesPerTick;
        this.delayInputMult = delayInputMultStart;
        this.delayInputMultDelta = (delayInputMultEnd - delayInputMultStart) / roundedSamplesPerTick;

        this.envelopeComputer.clearEnvelopes();
    }

    public updateWaves(instrument: Instrument, samplesPerSecond: number): void {
        this.volumeScale = 1.0;
        if (instrument.type == InstrumentType.chip) {
            this.waveL = (this.aliases) ? Config.rawChipWaves[instrument.chipWave].samples : Config.chipWaves[instrument.chipWave].samples;
            this.waveR = (this.aliases) ? Config.rawChipWaves[instrument.chipWave].samplesR || Config.rawChipWaves[instrument.chipWave].samples : Config.chipWaves[instrument.chipWave].samplesR || Config.chipWaves[instrument.chipWave].samples;
            // advloop addition
            this.isUsingAdvancedLoopControls = instrument.isUsingAdvancedLoopControls;
            this.chipWaveLoopStart = instrument.chipWaveLoopStart;
            this.chipWaveLoopEnd = instrument.chipWaveLoopEnd;
            this.chipWaveLoopMode = instrument.chipWaveLoopMode;
            this.chipWavePlayBackwards = instrument.chipWavePlayBackwards;
            this.chipWaveStartOffset = instrument.chipWaveStartOffset;
            // advloop addition

            this.chipWaveInStereo = instrument.chipWaveInStereo;
            this.unisonVoices = instrument.unisonVoices;
            this.unisonSpread = instrument.unisonSpread;
            this.unisonOffset = instrument.unisonOffset;
            this.unisonExpression = instrument.unisonExpression;
            this.unisonSign = instrument.unisonSign;
        } else if (instrument.type == InstrumentType.pwm) {
            this.unisonVoices = instrument.unisonVoices;
            this.unisonSpread = instrument.unisonSpread;
            this.unisonOffset = instrument.unisonOffset;
            this.unisonExpression = instrument.unisonExpression;
            this.unisonSign = instrument.unisonSign;
        } else if (instrument.type == InstrumentType.customChipWave) {
            this.waveL = (this.aliases) ? instrument.customChipWave! : instrument.customChipWaveIntegral!;
            this.waveR = (this.aliases) ? instrument.customChipWave! : instrument.customChipWaveIntegral!;
            this.volumeScale = 0.05;
            this.unisonVoices = instrument.unisonVoices;
            this.unisonSpread = instrument.unisonSpread;
            this.unisonOffset = instrument.unisonOffset;
            this.unisonExpression = instrument.unisonExpression;
            this.unisonSign = instrument.unisonSign;
        } else if (instrument.type == InstrumentType.noise) {
            this.waveL = getDrumWave(instrument.chipNoise, inverseRealFourierTransform, scaleElementsByFactor);
            this.unisonVoices = instrument.unisonVoices;
            this.unisonSpread = instrument.unisonSpread;
            this.unisonOffset = instrument.unisonOffset;
            this.unisonExpression = instrument.unisonExpression;
            this.unisonSign = instrument.unisonSign;
        } else if (instrument.type == InstrumentType.harmonics) {
            this.waveL = this.harmonicsWave.getCustomWave(instrument.harmonicsWave, instrument.type);
            this.unisonVoices = instrument.unisonVoices;
            this.unisonSpread = instrument.unisonSpread;
            this.unisonOffset = instrument.unisonOffset;
            this.unisonExpression = instrument.unisonExpression;
            this.unisonSign = instrument.unisonSign;
        } else if (instrument.type == InstrumentType.pickedString) {
            this.waveL = this.harmonicsWave.getCustomWave(instrument.harmonicsWave, instrument.type);
            this.unisonVoices = instrument.unisonVoices;
            this.unisonSpread = instrument.unisonSpread;
            this.unisonOffset = instrument.unisonOffset;
            this.unisonExpression = instrument.unisonExpression;
            this.unisonSign = instrument.unisonSign;
        } else if (instrument.type == InstrumentType.spectrum) {
            this.waveL = this.spectrumWave.getCustomWave(instrument.spectrumWave, 8);
            this.unisonVoices = instrument.unisonVoices;
            this.unisonSpread = instrument.unisonSpread;
            this.unisonOffset = instrument.unisonOffset;
            this.unisonExpression = instrument.unisonExpression;
            this.unisonSign = instrument.unisonSign;
        } else if (instrument.type == InstrumentType.drumset) {
            for (let i: number = 0; i < Config.drumCount; i++) {
                this.drumsetSpectrumWaves[i].getCustomWave(instrument.drumsetSpectrumWaves[i], InstrumentState._drumsetIndexToSpectrumOctave(i));
            }
            this.waveL = null;
            this.unisonVoices = instrument.unisonVoices;
            this.unisonSpread = instrument.unisonSpread;
            this.unisonOffset = instrument.unisonOffset;
            this.unisonExpression = instrument.unisonExpression;
            this.unisonSign = instrument.unisonSign;
        } else {
            this.waveL = null;
        }
    }

    public getDrumsetWave(pitch: number): Float32Array {
        if (this.type == InstrumentType.drumset) {
            return this.drumsetSpectrumWaves[pitch].wave!;
        } else {
            throw new Error("Unhandled instrument type in getDrumsetWave");
        }
    }

    public static drumsetIndexReferenceDelta(index: number): number {
        return Instrument.frequencyFromPitch(Config.spectrumBasePitch + index * 6) / 44100;
    }

    private static _drumsetIndexToSpectrumOctave(index: number): number {
        return 15 + Math.log2(InstrumentState.drumsetIndexReferenceDelta(index));
    }
}
