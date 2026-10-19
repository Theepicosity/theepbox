// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { EnvelopeType, EnvelopeComputeIndex, LFOEnvelopeTypes, RandomEnvelopeTypes, Config, Envelope, getArpeggioPitchIndex, FilterType, AutomationTarget, Transition } from "./SynthConfig";
import { Synth, Tone } from "./synth";
import { Instrument } from "./Instrument";
import { InstrumentState } from "./InstrumentState";
import { FilterSettings } from "./Filter";
import { EnvelopeSettings } from "./Envelope";
import { NotePin } from "./Pattern";
import { xxHash32 } from "js-xxhash";

export class EnvelopeComputer {
    // "Unscaled" values do not increase with Envelope Speed's timescale factor. Thus they are "real" seconds since the start of the note.
    // Fade envelopes notably use unscaled values instead of being tied to Envelope Speed.
    public noteSecondsStart: number[] = [];
    public noteSecondsStartUnscaled: number = 0.0;
    public noteSecondsEnd: number[] = [];
    public noteSecondsEndUnscaled: number = 0.0;
    public noteTicksStart: number = 0.0;
    public noteTicksEnd: number = 0.0;
    public noteSizeStart: number = Config.noteSizeMax;
    public noteSizeEnd: number = Config.noteSizeMax;
    public prevNoteSize: number = Config.noteSizeMax;
    public nextNoteSize: number = Config.noteSizeMax;
    private _noteSizeFinal: number = Config.noteSizeMax;
    public prevNoteSecondsStart: number[] = [];
    public prevNoteSecondsStartUnscaled: number = 0.0;
    public prevNoteSecondsEnd: number[] = [];
    public prevNoteSecondsEndUnscaled: number = 0.0;
    public prevNoteTicksStart: number = 0.0;
    public prevNoteTicksEnd: number = 0.0;
    private _prevNoteSizeFinal: number = Config.noteSizeMax;
    public tickTimeEnd: number[] = [];

    public drumsetFilterEnvelopeStart: number = 0.0;
    public drumsetFilterEnvelopeEnd: number = 0.0;

    public prevSlideStart: boolean = false;
    public prevSlideEnd: boolean = false;
    public nextSlideStart: boolean = false;
    public nextSlideEnd: boolean = false;
    public prevSlideRatioStart: number = 0.0;
    public prevSlideRatioEnd: number = 0.0;
    public nextSlideRatioStart: number = 0.0;
    public nextSlideRatioEnd: number = 0.0;

    public startPinTickAbsolute: number | null = null;
    private startPinTickDefaultPitch: number | null = null;
    private startPinTickPitch: number | null = null;

    public readonly envelopeStarts: number[] = [];
    public readonly envelopeEnds: number[] = [];
    private readonly _modifiedEnvelopeIndices: number[] = [];
    private _modifiedEnvelopeCount: number = 0;
    public lowpassCutoffDecayVolumeCompensation: number = 1.0;

    constructor(/*private _perNote: boolean*/) {
        //const length: number = this._perNote ? EnvelopeComputeIndex.length : InstrumentAutomationIndex.length;
        const length: number = EnvelopeComputeIndex.length;
        for (let i: number = 0; i < length; i++) {
            this.envelopeStarts[i] = 1.0;
            this.envelopeEnds[i] = 1.0;
        }

        this.reset();
    }

    public reset(): void {
        for (let envelopeIndex: number = 0; envelopeIndex < Config.maxEnvelopeCount + 1; envelopeIndex++) {
            this.noteSecondsEnd[envelopeIndex] = 0.0;
            this.prevNoteSecondsEnd[envelopeIndex] = 0.0;
        }
        this.noteSecondsEndUnscaled = 0.0;
        this.noteTicksEnd = 0.0;
        this._noteSizeFinal = Config.noteSizeMax;
        this.prevNoteSecondsEndUnscaled = 0.0;
        this.prevNoteTicksEnd = 0.0;
        this._prevNoteSizeFinal = Config.noteSizeMax;
        this._modifiedEnvelopeCount = 0;
        this.drumsetFilterEnvelopeStart = 0.0;
        this.drumsetFilterEnvelopeEnd = 0.0;
        this.startPinTickAbsolute = null;
        this.startPinTickDefaultPitch = null;
        this.startPinTickPitch = null;
    }

    public computeEnvelopes(instrument: Instrument, currentPart: number, tickTimeStart: number[], tickTimeStartReal: number, secondsPerTick: number, tone: Tone | null, timeScale: number[], instrumentState: InstrumentState, synth: Synth, channelIndex: number, instrumentIndex: number): void {
        const secondsPerTickUnscaled: number = secondsPerTick;
        const transition: Transition = instrument.getTransition();
        if (tone != null && tone.atNoteStart && (!((transition.isSeamless && transition.continues) || instrument.clicklessTransition || tone.forceContinueAtStart) || tone.prevNote == null)) {
            this.reset();
        }
        if (tone != null) {
            if (tone.note != null) {
                this._noteSizeFinal = tone.note.pins[tone.note.pins.length - 1].size;
            } else {
                this._noteSizeFinal = Config.noteSizeMax;
            }
        }
        const tickTimeEnd: number[] = [];
        const tickTimeEndReal: number = tickTimeStartReal + 1.0;
        const noteSecondsStart: number[] = [];
        const noteSecondsStartUnscaled: number = this.noteSecondsEndUnscaled;
        const noteSecondsEnd: number[] = [];
        const noteSecondsEndUnscaled: number = noteSecondsStartUnscaled + secondsPerTickUnscaled;
        const noteTicksStart: number = this.noteTicksEnd;
        const noteTicksEnd: number = noteTicksStart + 1.0;
        const prevNoteSecondsStart: number[] = [];
        const prevNoteSecondsEnd: number[] = [];
        const prevNoteSecondsStartUnscaled: number = this.prevNoteSecondsEndUnscaled;
        const prevNoteSecondsEndUnscaled: number = prevNoteSecondsStartUnscaled + secondsPerTickUnscaled;
        const prevNoteTicksStart: number = this.prevNoteTicksEnd;
        const prevNoteTicksEnd: number = prevNoteTicksStart + 1.0;

        const beatsPerTick: number = 1.0 / (Config.ticksPerPart * Config.partsPerBeat);
        const beatTimeStart: number[] = [];
        const beatTimeEnd: number[] = [];

        let noteSizeStart: number = this._noteSizeFinal;
        let noteSizeEnd: number = this._noteSizeFinal;
        let prevNoteSize: number = this._prevNoteSizeFinal;
        let nextNoteSize: number = 0;
        let prevSlideStart: boolean = false;
        let prevSlideEnd: boolean = false;
        let nextSlideStart: boolean = false;
        let nextSlideEnd: boolean = false;
        let prevSlideRatioStart: number = 0.0;
        let prevSlideRatioEnd: number = 0.0;
        let nextSlideRatioStart: number = 0.0;
        let nextSlideRatioEnd: number = 0.0;
        if (tone == null) {
            this.startPinTickAbsolute = null;
            this.startPinTickDefaultPitch = null;
        }
        if (tone != null && tone.note != null && !tone.passedEndOfNote) {
            const endPinIndex: number = tone.note.getEndPinIndex(currentPart);
            const startPin: NotePin = tone.note.pins[endPinIndex - 1];
            const endPin: NotePin = tone.note.pins[endPinIndex];
            const startPinTick = (tone.note.start + startPin.time) * Config.ticksPerPart;
            if (this.startPinTickAbsolute == null || (!(transition.continues || transition.slides)) && tone.passedEndOfNote) this.startPinTickAbsolute = startPinTick + synth.computeTicksSinceStart(true); //for random per note
            if (this.startPinTickDefaultPitch == null ||/* (!(transition.continues || transition.slides)) &&*/ tone.passedEndOfNote) this.startPinTickDefaultPitch = this.getPitchValue(instrument, tone, instrumentState, false);
            if (!tone.passedEndOfNote) this.startPinTickPitch = this.getPitchValue(instrument, tone, instrumentState, true);
            const endPinTick: number = (tone.note.start + endPin.time) * Config.ticksPerPart;
            const ratioStart: number = (tickTimeStartReal - startPinTick) / (endPinTick - startPinTick);
            const ratioEnd: number = (tickTimeEndReal - startPinTick) / (endPinTick - startPinTick);
            noteSizeStart = startPin.size + (endPin.size - startPin.size) * ratioStart;
            noteSizeEnd = startPin.size + (endPin.size - startPin.size) * ratioEnd;

            if (transition.slides) {
                const noteStartTick: number = tone.noteStartPart * Config.ticksPerPart;
                const noteEndTick: number = tone.noteEndPart * Config.ticksPerPart;
                const noteLengthTicks: number = noteEndTick - noteStartTick;
                const maximumSlideTicks: number = noteLengthTicks * 0.5;
                const slideTicks: number = Math.min(maximumSlideTicks, transition.slideTicks);
                if (tone.prevNote != null && !tone.forceContinueAtStart) {
                    if (tickTimeStartReal - noteStartTick < slideTicks) {
                        prevSlideStart = true;
                        prevSlideRatioStart = 0.5 * (1.0 - (tickTimeStartReal - noteStartTick) / slideTicks);
                    }
                    if (tickTimeEndReal - noteStartTick < slideTicks) {
                        prevSlideEnd = true;
                        prevSlideRatioEnd = 0.5 * (1.0 - (tickTimeEndReal - noteStartTick) / slideTicks);
                    }
                }
                if (tone.nextNote != null && !tone.forceContinueAtEnd) {
                    nextNoteSize = tone.nextNote.pins[0].size
                    if (noteEndTick - tickTimeStartReal < slideTicks) {
                        nextSlideStart = true;
                        nextSlideRatioStart = 0.5 * (1.0 - (noteEndTick - tickTimeStartReal) / slideTicks);
                    }
                    if (noteEndTick - tickTimeEndReal < slideTicks) {
                        nextSlideEnd = true;
                        nextSlideRatioEnd = 0.5 * (1.0 - (noteEndTick - tickTimeEndReal) / slideTicks);
                    }
                }
            }
        }

        let lowpassCutoffDecayVolumeCompensation: number = 1.0;
        let usedNoteSize = false;
        for (let envelopeIndex: number = 0; envelopeIndex <= instrument.envelopeCount; envelopeIndex++) {
            let automationTarget: AutomationTarget;
            let targetIndex: number;
            let envelope: Envelope;

            let inverse: boolean = false;
            let isDiscrete: boolean = false;
            let perEnvelopeSpeed: number = 1;
            let globalEnvelopeSpeed: number = 1;
            let envelopeSpeed: number = perEnvelopeSpeed * globalEnvelopeSpeed;
            let perEnvelopeLowerBound: number = 0;
            let perEnvelopeUpperBound: number = 1;
            let timeSinceStart: number = 0;
            let steps: number = 2;
            let seed: number = 2;
            let waveform: number = LFOEnvelopeTypes.sine;
            let startPinTickAbsolute: number = this.startPinTickAbsolute || 0.0;
            let defaultPitch: number = this.startPinTickDefaultPitch || 0.0;
            if (envelopeIndex == instrument.envelopeCount) {
                if (usedNoteSize /*|| !this._perNote*/) break;
                // Special case: if no other envelopes used note size, default to applying it to note volume.
                automationTarget = Config.instrumentAutomationTargets.dictionary["noteVolume"];
                targetIndex = 0;
                envelope = Config.newEnvelopes.dictionary["note size"];
            } else {
                let envelopeSettings: EnvelopeSettings = instrument.envelopes[envelopeIndex];
                automationTarget = Config.instrumentAutomationTargets[envelopeSettings.target];
                targetIndex = envelopeSettings.index;
                envelope = Config.newEnvelopes[envelopeSettings.envelope];
                inverse = instrument.envelopes[envelopeIndex].inverse;
                isDiscrete = instrument.envelopes[envelopeIndex].discrete;
                perEnvelopeSpeed = instrument.envelopes[envelopeIndex].perEnvelopeSpeed;
                globalEnvelopeSpeed = Math.pow(instrument.envelopeSpeed, 2) / 144;
                envelopeSpeed = perEnvelopeSpeed * globalEnvelopeSpeed;

                perEnvelopeLowerBound = instrument.envelopes[envelopeIndex].perEnvelopeLowerBound;
                perEnvelopeUpperBound = instrument.envelopes[envelopeIndex].perEnvelopeUpperBound;
                if (synth.isModActive(Config.modulators.dictionary["individual envelope lower bound"].index, channelIndex, instrumentIndex) && instrument.envelopes[envelopeIndex].tempEnvelopeLowerBound != null) { //modulation
                    perEnvelopeLowerBound = instrument.envelopes[envelopeIndex].tempEnvelopeLowerBound!;
                }
                if (synth.isModActive(Config.modulators.dictionary["individual envelope upper bound"].index, channelIndex, instrumentIndex) && instrument.envelopes[envelopeIndex].tempEnvelopeUpperBound != null) { //modulation
                    perEnvelopeUpperBound = instrument.envelopes[envelopeIndex].tempEnvelopeUpperBound!;
                }
                if (!(perEnvelopeLowerBound <= perEnvelopeUpperBound)) { //reset bounds if incorrect
                    perEnvelopeLowerBound = 0;
                    perEnvelopeUpperBound = 1;
                }

                timeSinceStart = synth.computeTicksSinceStart();
                steps = instrument.envelopes[envelopeIndex].steps;
                seed = instrument.envelopes[envelopeIndex].seed;
                if (instrument.envelopes[envelopeIndex].waveform >= (envelope.name == "lfo" ? LFOEnvelopeTypes.length : RandomEnvelopeTypes.length)) {
                    instrument.envelopes[envelopeIndex].waveform = 0; //make sure that waveform is a proper index
                }
                waveform = instrument.envelopes[envelopeIndex].waveform;


                if (!timeScale[envelopeIndex]) timeScale[envelopeIndex] = 0;

                const secondsPerTickScaled: number = secondsPerTick * timeScale[envelopeIndex];
                if (!tickTimeStart[envelopeIndex]) tickTimeStart[envelopeIndex] = 0; //prevents tremolos from causing a NaN width error
                tickTimeEnd[envelopeIndex] = tickTimeStart[envelopeIndex] ? tickTimeStart[envelopeIndex] + timeScale[envelopeIndex] : timeScale[envelopeIndex];
                noteSecondsStart[envelopeIndex] = this.noteSecondsEnd[envelopeIndex] ? this.noteSecondsEnd[envelopeIndex] : 0;
                prevNoteSecondsStart[envelopeIndex] = this.prevNoteSecondsEnd[envelopeIndex] ? this.prevNoteSecondsEnd[envelopeIndex] : 0;
                noteSecondsEnd[envelopeIndex] = noteSecondsStart[envelopeIndex] ? noteSecondsStart[envelopeIndex] + secondsPerTickScaled : secondsPerTickScaled;
                prevNoteSecondsEnd[envelopeIndex] = prevNoteSecondsStart[envelopeIndex] ? prevNoteSecondsStart[envelopeIndex] + secondsPerTickScaled : secondsPerTickScaled;
                beatTimeStart[envelopeIndex] = tickTimeStart[envelopeIndex] ? beatsPerTick * tickTimeStart[envelopeIndex] : beatsPerTick;
                beatTimeEnd[envelopeIndex] = tickTimeEnd[envelopeIndex] ? beatsPerTick * tickTimeEnd[envelopeIndex] : beatsPerTick;

                if (envelope.type == EnvelopeType.noteSize) usedNoteSize = true;
            }
            //only calculate pitch if needed
            const pitch: number = (envelope.type == EnvelopeType.pitch) ? this.computePitchEnvelope(instrument, envelopeIndex, (this.startPinTickPitch || this.getPitchValue(instrument, tone, instrumentState, true))) : 0;

            //calculate envelope values if target isn't null
            if (automationTarget.computeIndex != null) {
                const computeIndex: number = automationTarget.computeIndex + targetIndex;
                let envelopeStart: number = EnvelopeComputer.computeEnvelope(envelope, envelopeSpeed, globalEnvelopeSpeed, noteSecondsStartUnscaled, noteSecondsStart[envelopeIndex], beatTimeStart[envelopeIndex], timeSinceStart, noteSizeStart, pitch, inverse, perEnvelopeLowerBound, perEnvelopeUpperBound, false, steps, seed, waveform, defaultPitch, startPinTickAbsolute);
                if (prevSlideStart) {
                    const other: number = EnvelopeComputer.computeEnvelope(envelope, envelopeSpeed, globalEnvelopeSpeed, prevNoteSecondsStartUnscaled, prevNoteSecondsStart[envelopeIndex], beatTimeStart[envelopeIndex], timeSinceStart, prevNoteSize, pitch, inverse, perEnvelopeLowerBound, perEnvelopeUpperBound, false, steps, seed, waveform, defaultPitch, startPinTickAbsolute);
                    envelopeStart += (other - envelopeStart) * prevSlideRatioStart;
                }
                if (nextSlideStart) {
                    const other: number = EnvelopeComputer.computeEnvelope(envelope, envelopeSpeed, globalEnvelopeSpeed, 0.0, 0.0, beatTimeStart[envelopeIndex], timeSinceStart, nextNoteSize, pitch, inverse, perEnvelopeLowerBound, perEnvelopeUpperBound, false, steps, seed, waveform, defaultPitch, startPinTickAbsolute);
                    envelopeStart += (other - envelopeStart) * nextSlideRatioStart;
                }
                let envelopeEnd: number = envelopeStart;
                if (isDiscrete == false) {
                    envelopeEnd = EnvelopeComputer.computeEnvelope(envelope, envelopeSpeed, globalEnvelopeSpeed, noteSecondsEndUnscaled, noteSecondsEnd[envelopeIndex], beatTimeEnd[envelopeIndex], timeSinceStart, noteSizeEnd, pitch, inverse, perEnvelopeLowerBound, perEnvelopeUpperBound, false, steps, seed, waveform, defaultPitch, startPinTickAbsolute);
                    if (prevSlideEnd) {
                        const other: number = EnvelopeComputer.computeEnvelope(envelope, envelopeSpeed, globalEnvelopeSpeed, prevNoteSecondsEndUnscaled, prevNoteSecondsEnd[envelopeIndex], beatTimeEnd[envelopeIndex], timeSinceStart, prevNoteSize, pitch, inverse, perEnvelopeLowerBound, perEnvelopeUpperBound, false, steps, seed, waveform, defaultPitch, startPinTickAbsolute);
                        envelopeEnd += (other - envelopeEnd) * prevSlideRatioEnd;
                    }
                    if (nextSlideEnd) {
                        const other: number = EnvelopeComputer.computeEnvelope(envelope, envelopeSpeed, globalEnvelopeSpeed, 0.0, 0.0, beatTimeEnd[envelopeIndex], timeSinceStart, nextNoteSize, pitch, inverse, perEnvelopeLowerBound, perEnvelopeUpperBound, false, steps, seed, waveform, defaultPitch, startPinTickAbsolute);
                        envelopeEnd += (other - envelopeEnd) * nextSlideRatioEnd;
                    }
                }

                this.envelopeStarts[computeIndex] *= envelopeStart;
                this.envelopeEnds[computeIndex] *= envelopeEnd;
                this._modifiedEnvelopeIndices[this._modifiedEnvelopeCount++] = computeIndex;

                if (automationTarget.isFilter) {
                    const filterSettings: FilterSettings = /*this._perNote ?*/ (instrument.tmpNoteFilterStart != null) ? instrument.tmpNoteFilterStart : instrument.noteFilter /*: instrument.eqFilter*/;
                    if (filterSettings.controlPointCount > targetIndex && filterSettings.controlPoints[targetIndex].type == FilterType.lowPass) {
                        lowpassCutoffDecayVolumeCompensation = Math.max(lowpassCutoffDecayVolumeCompensation, EnvelopeComputer.getLowpassCutoffDecayVolumeCompensation(envelope, perEnvelopeSpeed));
                    }
                }
            }
        }

        this.noteSecondsStartUnscaled = noteSecondsStartUnscaled;
        this.noteSecondsEndUnscaled = noteSecondsEndUnscaled;
        this.noteTicksStart = noteTicksStart;
        this.noteTicksEnd = noteTicksEnd;
        this.prevNoteSecondsStartUnscaled = prevNoteSecondsStartUnscaled;
        this.prevNoteSecondsEndUnscaled = prevNoteSecondsEndUnscaled;
        this.prevNoteTicksStart = prevNoteTicksStart;
        this.prevNoteTicksEnd = prevNoteTicksEnd;
        for (let envelopeIndex: number = 0; envelopeIndex < Config.maxEnvelopeCount + 1; envelopeIndex++) {
            this.noteSecondsStart[envelopeIndex] = noteSecondsStart[envelopeIndex];
            this.noteSecondsEnd[envelopeIndex] = noteSecondsEnd[envelopeIndex];
            this.prevNoteSecondsStart[envelopeIndex] = prevNoteSecondsStart[envelopeIndex];
            this.prevNoteSecondsEnd[envelopeIndex] = prevNoteSecondsEnd[envelopeIndex];
        }
        this.prevNoteSize = prevNoteSize;
        this.nextNoteSize = nextNoteSize;
        this.noteSizeStart = noteSizeStart;
        this.noteSizeEnd = noteSizeEnd;
        this.prevSlideStart = prevSlideStart;
        this.prevSlideEnd = prevSlideEnd;
        this.nextSlideStart = nextSlideStart;
        this.nextSlideEnd = nextSlideEnd;
        this.prevSlideRatioStart = prevSlideRatioStart;
        this.prevSlideRatioEnd = prevSlideRatioEnd;
        this.nextSlideRatioStart = nextSlideRatioStart;
        this.nextSlideRatioEnd = nextSlideRatioEnd;
        this.lowpassCutoffDecayVolumeCompensation = lowpassCutoffDecayVolumeCompensation;
    }

    public clearEnvelopes(): void {
        for (let envelopeIndex: number = 0; envelopeIndex < this._modifiedEnvelopeCount; envelopeIndex++) {
            const computeIndex: number = this._modifiedEnvelopeIndices[envelopeIndex];
            this.envelopeStarts[computeIndex] = 1.0;
            this.envelopeEnds[computeIndex] = 1.0;
        }
        this._modifiedEnvelopeCount = 0;
    }

    public static computeEnvelope(envelope: Envelope, perEnvelopeSpeed: number, globalEnvelopeSpeed: number, unspedTime: number, time: number, beats: number, timeSinceStart: number, noteSize: number, pitch: number, inverse: boolean, perEnvelopeLowerBound: number, perEnvelopeUpperBound: number, isDrumset: boolean = false, steps: number, seed: number, waveform: number, defaultPitch: number, notePinStart: number): number {
        const envelopeSpeed = isDrumset ? envelope.speed : 1;
        const boundAdjust = (perEnvelopeUpperBound - perEnvelopeLowerBound);
        switch (envelope.type) {
            case EnvelopeType.none: return perEnvelopeUpperBound;
            case EnvelopeType.noteSize:
                if (!inverse) {
                    return Synth.noteSizeToVolumeMult(noteSize) * (boundAdjust) + perEnvelopeLowerBound;
                } else {
                    return perEnvelopeUpperBound - Synth.noteSizeToVolumeMult(noteSize) * (boundAdjust);
                }
            case EnvelopeType.pitch:
                //inversion and bounds are handled in the pitch calculation that we did prior
                return pitch;
            case EnvelopeType.pseudorandom:
                //randomization is essentially just a complex hashing function which appears random to us, but is repeatable every time
                //we can use either the time passed from the beginning of our song or the pitch of the note for what we hash
                const hashMax: number = 0xffffffff;
                const step: number = steps;
                switch (waveform) {
                    case RandomEnvelopeTypes.time:
                        if (step <= 1) return 1;
                        const timeHash: number = xxHash32((perEnvelopeSpeed == 0 ? 0 : Math.floor((timeSinceStart * perEnvelopeSpeed) / (256))) + "", seed);
                        if (inverse) {
                            return perEnvelopeUpperBound - boundAdjust * (step / (step - 1)) * Math.floor(timeHash * step / (hashMax + 1)) / step;
                        } else {
                            return boundAdjust * (step / (step - 1)) * Math.floor(timeHash * (step) / (hashMax + 1)) / step + perEnvelopeLowerBound;
                        }
                    case RandomEnvelopeTypes.pitch:
                        const pitchHash: number = xxHash32(defaultPitch + "", seed);
                        if (inverse) {
                            return perEnvelopeUpperBound - boundAdjust * pitchHash / (hashMax + 1);
                        } else {
                            return boundAdjust * pitchHash / (hashMax + 1) + perEnvelopeLowerBound;
                        }
                    case RandomEnvelopeTypes.note:
                        if (step <= 1) return 1;
                        const noteHash: number = xxHash32(notePinStart + "", seed);
                        if (inverse) {
                            return perEnvelopeUpperBound - boundAdjust * (step / (step - 1)) * Math.floor(noteHash * step / (hashMax + 1)) / step;
                        } else {
                            return boundAdjust * (step / (step - 1)) * Math.floor(noteHash * (step) / (hashMax + 1)) / step + perEnvelopeLowerBound;
                        }
                    case RandomEnvelopeTypes.timeSmooth:
                        const timeHashA: number = xxHash32((perEnvelopeSpeed == 0 ? 0 : Math.floor((timeSinceStart * perEnvelopeSpeed) / (256))) + "", seed);
                        const timeHashB: number = xxHash32((perEnvelopeSpeed == 0 ? 0 : Math.floor((timeSinceStart * perEnvelopeSpeed + 256) / (256))) + "", seed);
                        const weightedAverage: number = timeHashA * (1 - ((timeSinceStart * perEnvelopeSpeed) / (256)) % 1) + timeHashB * (((timeSinceStart * perEnvelopeSpeed) / (256)) % 1);
                        if (inverse) {
                            return perEnvelopeUpperBound - boundAdjust * weightedAverage / (hashMax + 1);
                        } else {
                            return boundAdjust * weightedAverage / (hashMax + 1) + perEnvelopeLowerBound;
                        }
                    default: throw new Error("Unrecognized operator envelope waveform type: " + waveform);
                }
            case EnvelopeType.twang:
                if (inverse) {
                    return perEnvelopeUpperBound - boundAdjust * (1.0 / (1.0 + time * envelopeSpeed));
                } else {
                    return boundAdjust / (1.0 + time * envelopeSpeed) + perEnvelopeLowerBound;
                }
            case EnvelopeType.swell:
                if (inverse) {
                    return boundAdjust / (1.0 + time * envelopeSpeed) + perEnvelopeLowerBound; //swell is twang's inverse... I wonder if it would be worth it to just merge the two :/
                } else {
                    return perEnvelopeUpperBound - boundAdjust / (1.0 + time * envelopeSpeed);
                }
            case EnvelopeType.lfo:
                switch (waveform) {
                    case LFOEnvelopeTypes.sine:
                        if (inverse) {
                            return (perEnvelopeUpperBound / 2) + boundAdjust * Math.cos(beats * 2.0 * Math.PI * envelopeSpeed) * 0.5 + (perEnvelopeLowerBound / 2);
                        } else {
                            return (perEnvelopeUpperBound / 2) - boundAdjust * Math.cos(beats * 2.0 * Math.PI * envelopeSpeed) * 0.5 + (perEnvelopeLowerBound / 2);
                        }
                    case LFOEnvelopeTypes.square:
                        if (inverse) {
                            return (Math.cos(beats * 2.0 * Math.PI * envelopeSpeed + 3 * Math.PI / 2) < 0) ? perEnvelopeUpperBound : perEnvelopeLowerBound;
                        } else {
                            return (Math.cos(beats * 2.0 * Math.PI * envelopeSpeed + 3 * Math.PI / 2) < 0) ? perEnvelopeLowerBound : perEnvelopeUpperBound;
                        }
                    case LFOEnvelopeTypes.triangle:
                        if (inverse) {
                            return (perEnvelopeUpperBound / 2) - (boundAdjust / Math.PI) * Math.asin(Math.sin((Math.PI / 2) + beats * Math.PI * 2.0 * envelopeSpeed)) + (perEnvelopeLowerBound / 2);
                        } else {
                            return (perEnvelopeUpperBound / 2) + (boundAdjust / Math.PI) * Math.asin(Math.sin((Math.PI / 2) + beats * Math.PI * 2.0 * envelopeSpeed)) + (perEnvelopeLowerBound / 2);
                        }
                    case LFOEnvelopeTypes.sawtooth:
                        if (inverse) {
                            return perEnvelopeUpperBound - (beats * envelopeSpeed) % 1 * boundAdjust;
                        } else {
                            return (beats * envelopeSpeed) % 1 * boundAdjust + perEnvelopeLowerBound;
                        }
                    case LFOEnvelopeTypes.trapezoid:
                        let trap: number = 0;
                        if (inverse) {
                            trap = (perEnvelopeUpperBound / 2) - (boundAdjust * 2 / Math.PI) * Math.asin(Math.sin((Math.PI / 2) + beats * Math.PI * 2.0 * envelopeSpeed)) + (perEnvelopeLowerBound / 2);
                        } else {
                            trap = (perEnvelopeUpperBound / 2) + (boundAdjust * 2 / Math.PI) * Math.asin(Math.sin((Math.PI / 2) + beats * Math.PI * 2.0 * envelopeSpeed)) + (perEnvelopeLowerBound / 2);
                        }
                        return Math.max(perEnvelopeLowerBound, Math.min(perEnvelopeUpperBound, trap));
                    case LFOEnvelopeTypes.steppedSaw:
                        if (steps <= 1) return 1;
                        let saw: number = (beats * envelopeSpeed) % 1;
                        if (inverse) {
                            return perEnvelopeUpperBound - Math.floor(saw * steps) * boundAdjust / (steps - 1);
                        } else {
                            return Math.floor(saw * steps) * boundAdjust / (steps - 1) + perEnvelopeLowerBound;
                        }

                    case LFOEnvelopeTypes.steppedTri:
                        if (steps <= 1) return 1;
                        let tri: number = 0.5 + (inverse ? -1 : 1) * (1 / Math.PI) * Math.asin(Math.sin((Math.PI / 2) + beats * Math.PI * 2.0 * envelopeSpeed));
                        return Math.round(tri * (steps - 1)) * boundAdjust / (steps - 1) + perEnvelopeLowerBound;
                    default: throw new Error("Unrecognized operator envelope waveform type: " + waveform);
                }
            case EnvelopeType.tremolo2: //kept only for drumsets right now
                if (inverse) {
                    return (perEnvelopeUpperBound / 4) + boundAdjust * Math.cos(beats * 2.0 * Math.PI * envelopeSpeed) * 0.25 + (perEnvelopeLowerBound / 4); //inverse works strangely with tremolo2. If I ever update this I'll need to turn all current versions into tremolo with bounds
                } else {
                    return 0.5 + (perEnvelopeUpperBound / 4) - boundAdjust * Math.cos(beats * 2.0 * Math.PI * envelopeSpeed) * 0.25 - (perEnvelopeLowerBound / 4);
                }
            case EnvelopeType.punch:
                if (inverse) {
                    return Math.max(0, perEnvelopeUpperBound + 1.0 - Math.max(1.0 - perEnvelopeLowerBound, 1.0 - perEnvelopeUpperBound - unspedTime * globalEnvelopeSpeed * 10.0)); //punch special case: 2- instead of 1-
                } else {
                    return Math.max(1.0+perEnvelopeLowerBound, 1.0+perEnvelopeUpperBound - unspedTime * globalEnvelopeSpeed * 10.0); //punch only uses global envelope speed
                }
            case EnvelopeType.flare:
                const attack: number = 0.25 / Math.sqrt(envelopeSpeed * perEnvelopeSpeed); //flare and blip need to be handled a little differently with envelope speeds. I have to use the old system
                if (inverse) {
                    return perEnvelopeUpperBound - boundAdjust * (unspedTime < attack ? unspedTime / attack : 1.0 / (1.0 + (unspedTime - attack) * envelopeSpeed * perEnvelopeSpeed));
                } else {
                    return boundAdjust * (unspedTime < attack ? unspedTime / attack : 1.0 / (1.0 + (unspedTime - attack) * envelopeSpeed * perEnvelopeSpeed)) + perEnvelopeLowerBound;
                }
            case EnvelopeType.decay:
                if (inverse) {
                    return perEnvelopeUpperBound - boundAdjust * Math.pow(2, -envelopeSpeed * time);
                } else {
                    return boundAdjust * Math.pow(2, -envelopeSpeed * time) + perEnvelopeLowerBound;
                }
            case EnvelopeType.blip:
                if (inverse) {
                    return perEnvelopeUpperBound - boundAdjust * +(unspedTime < (0.25 / Math.sqrt(envelopeSpeed * perEnvelopeSpeed)));
                } else {
                    return boundAdjust * +(unspedTime < (0.25 / Math.sqrt(envelopeSpeed * perEnvelopeSpeed))) + perEnvelopeLowerBound;
                }
            case EnvelopeType.wibble:
                let temp = 0.5 - Math.cos(beats * envelopeSpeed) * 0.5;
                temp = 1.0 / (1.0 + time * (envelopeSpeed - (temp / (1.5 / envelopeSpeed))));
                temp = temp > 0.0 ? temp : 0.0;
                if (inverse) {
                    return perEnvelopeUpperBound - boundAdjust * temp;
                } else {
                    return boundAdjust * temp + perEnvelopeLowerBound;
                }
            case EnvelopeType.linear: {
                let lin = (1.0 - (time / (16 / envelopeSpeed)));
                lin = lin > 0.0 ? lin : 0.0;
                if (inverse) { //another case where linear's inverse is rise. Do I merge them?
                    return perEnvelopeUpperBound - boundAdjust * lin;
                } else {
                    return boundAdjust * lin + perEnvelopeLowerBound;
                }
            }
            case EnvelopeType.rise: {
                let lin = (time / (16 / envelopeSpeed));
                lin = lin < 1.0 ? lin : 1.0;
                if (inverse) {
                    return perEnvelopeUpperBound - boundAdjust * lin;
                } else {
                    return boundAdjust * lin + perEnvelopeLowerBound;
                }
            }
            case EnvelopeType.fall: {
                if (inverse) {
                    return Math.min(Math.max(perEnvelopeLowerBound, perEnvelopeUpperBound - boundAdjust * Math.sqrt(Math.max(1.0 - envelopeSpeed * time / 2, 0))), perEnvelopeUpperBound);
                } else {
                    return Math.max(perEnvelopeLowerBound, boundAdjust * Math.sqrt(Math.max(1.0 - envelopeSpeed * time / 2, 0)) + perEnvelopeLowerBound);
                }
            }
            default: throw new Error("Unrecognized operator envelope type.");
        }

    }

    public getPitchValue(instrument: Instrument, tone: Tone | null, instrumentState: InstrumentState, calculateBends: boolean = true): number {
        if (tone && tone.pitchCount >= 1) {
            const chord = instrument.getChord();
            const arpeggiates = chord.arpeggiates;
            const monophonic = chord.name == "monophonic"
            const arpeggio: number = Math.floor(instrumentState.arpTime / Config.ticksPerArpeggio); //calculate arpeggiation
            const tonePitch = tone.pitches[arpeggiates ? getArpeggioPitchIndex(tone.pitchCount, instrument.fastTwoNoteArp, arpeggio) : monophonic ? instrument.monoChordTone : 0]
            if (calculateBends) {
                return tone.lastInterval != tonePitch ? tonePitch + tone.lastInterval : tonePitch; //account for pitch bends
            } else {
                return tonePitch;
            }
        }
        return 0;
    }

    public computePitchEnvelope(instrument: Instrument, index: number, pitch: number = 0): number {
        let startNote: number = 0;
        let endNote: number = Config.maxPitch;
        let inverse: boolean = false;
        let envelopeLowerBound: number = 0;
        let envelopeUpperBound: number = 1;

        if (instrument.isNoiseInstrument) {
            endNote = Config.drumCount - 1;
        }


        if (index < instrument.envelopeCount && index !== -2) {
            startNote = instrument.envelopes[index].pitchEnvelopeStart;
            endNote = instrument.envelopes[index].pitchEnvelopeEnd;
            inverse = instrument.envelopes[index].inverse;
            envelopeLowerBound = instrument.envelopes[index].perEnvelopeLowerBound;
            envelopeUpperBound = instrument.envelopes[index].perEnvelopeUpperBound;
        }

        if (startNote > endNote) { //Reset if values are improper
            startNote = 0;
            endNote = instrument.isNoiseInstrument ? Config.drumCount - 1 : Config.maxPitch;
        }
        const range = endNote - startNote + 1;
        if (!inverse) {
            if (pitch <= startNote) {
                return envelopeLowerBound;
            } else if (pitch >= endNote) {
                return envelopeUpperBound;
            } else {
                return (pitch - startNote) * (envelopeUpperBound - envelopeLowerBound) / range + envelopeLowerBound;
            }
        } else {
            if (pitch <= startNote) {
                return envelopeUpperBound;
            } else if (pitch >= endNote) {
                return envelopeLowerBound;
            } else {
                return envelopeUpperBound - (pitch - startNote) * (envelopeUpperBound - envelopeLowerBound) / range;
            }
        }
    }

    public static getLowpassCutoffDecayVolumeCompensation(envelope: Envelope, perEnvelopeSpeed: number = 1): number {
        // This is a little hokey in the details, but I designed it a while ago and keep it
        // around for compatibility. This decides how much to increase the volume (or
        // expression) to compensate for a decaying lowpass cutoff to maintain perceived
        // volume overall.
        if (envelope.type == EnvelopeType.decay) return 1.25 + 0.025 * /*envelope.speed */ perEnvelopeSpeed;
        if (envelope.type == EnvelopeType.twang) return 1.0 + 0.02 * /*envelope.speed */ perEnvelopeSpeed;
        return 1.0;
    }

    public computeDrumsetEnvelopes(instrument: Instrument, drumsetFilterEnvelope: Envelope, beatsPerPart: number, partTimeStart: number, partTimeEnd: number) {

        const pitch = 1

        function computeDrumsetEnvelope(unspedTime: number, time: number, beats: number, noteSize: number):number {
            return EnvelopeComputer.computeEnvelope(drumsetFilterEnvelope, 1, 1, unspedTime, time, beats, 0, noteSize, pitch, false, 0, 1, true, 2, 2, LFOEnvelopeTypes.sine, pitch, 0);
        }

        // Drumset filters use the same envelope timing as the rest of the envelopes, but do not include support for slide transitions.
        let drumsetFilterEnvelopeStart: number = computeDrumsetEnvelope(this.noteSecondsStartUnscaled, this.noteSecondsStartUnscaled, beatsPerPart * partTimeStart, this.noteSizeStart); //doesn't have/need pitchStart, pitchEnd, pitchInvert, steps, seed, timeSinceBeginning, etc

        // Apply slide interpolation to drumset envelope.
        if (this.prevSlideStart) {
            const other: number = computeDrumsetEnvelope(this.prevNoteSecondsStartUnscaled, this.prevNoteSecondsStartUnscaled, beatsPerPart * partTimeStart, this.prevNoteSize);
            drumsetFilterEnvelopeStart += (other - drumsetFilterEnvelopeStart) * this.prevSlideRatioStart;
        }
        if (this.nextSlideStart) {
            const other: number = computeDrumsetEnvelope(0.0, 0.0, beatsPerPart * partTimeStart, this.nextNoteSize);
            drumsetFilterEnvelopeStart += (other - drumsetFilterEnvelopeStart) * this.nextSlideRatioStart;
        }

        let drumsetFilterEnvelopeEnd: number = drumsetFilterEnvelopeStart;


        //hmm, I guess making discrete per envelope leaves out drumsets....
        drumsetFilterEnvelopeEnd = computeDrumsetEnvelope(this.noteSecondsEndUnscaled, this.noteSecondsEndUnscaled, beatsPerPart * partTimeEnd, this.noteSizeEnd);

        if (this.prevSlideEnd) {
            const other: number = computeDrumsetEnvelope(this.prevNoteSecondsEndUnscaled, this.prevNoteSecondsEndUnscaled, beatsPerPart * partTimeEnd, this.prevNoteSize);
            drumsetFilterEnvelopeEnd += (other - drumsetFilterEnvelopeEnd) * this.prevSlideRatioEnd;
        }
        if (this.nextSlideEnd) {
            const other: number = computeDrumsetEnvelope(0.0, 0.0, beatsPerPart * partTimeEnd, this.nextNoteSize);
            drumsetFilterEnvelopeEnd += (other - drumsetFilterEnvelopeEnd) * this.nextSlideRatioEnd;
        }

        this.drumsetFilterEnvelopeStart = drumsetFilterEnvelopeStart;
        this.drumsetFilterEnvelopeEnd = drumsetFilterEnvelopeEnd;

    }

}
