// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Dictionary, DictionaryArray, FilterType, EnvelopeType, InstrumentType, MDEffectType, EffectType, EnvelopeComputeIndex, Transition, Chord, Envelope, Config, getArpeggioPitchIndex, getPulseWidthRatio, effectsIncludePitchShift, effectsIncludeDetune, effectsIncludeVibrato, OperatorWave, GranularEnvelopeType } from "./SynthConfig";
import { Deque } from "./Deque";
import { Song, HeldMod } from "./Song";
import { Channel } from "./Channel";
import { ChannelState } from "./ChannelState";
import { Instrument } from "./Instrument";
import { Effect } from "./Effect";
import { EffectState } from "./EffectState";
import { PickedString, InstrumentState } from "./InstrumentState";
import { Note, NotePin, Pattern } from "./Pattern";
import { EnvelopeComputer } from "./EnvelopeComputer";
import { FilterSettings, FilterControlPoint } from "./Filter";
import { events } from "../global/Events";
import { FilterCoefficients, FrequencyResponse, DynamicBiquadFilter } from "./filtering";
import { clamp, detuneToCents, fittingPowerOfTwo } from "./utils";

declare global {
    interface Window {
        AudioContext: any;
        webkitAudioContext: any;
    }
}

const epsilon: number = (1.0e-24); // For detecting and avoiding float denormals, which have poor performance.

// For performance debugging:
//let samplesAccumulated: number = 0;
//let samplePerformance: number = 0;

export class Tone {
    public instrumentIndex: number;
    public readonly pitches: number[] = Array(Config.maxChordSize + 2).fill(0);
    public pitchCount: number = 0;
    public chordSize: number = 0;
    public drumsetPitch: number | null = null;
    public note: Note | null = null;
    public prevNote: Note | null = null;
    public nextNote: Note | null = null;
    public prevNotePitchIndex: number = 0;
    public nextNotePitchIndex: number = 0;
    public freshlyAllocated: boolean = true;
    public atNoteStart: boolean = false;
    public isOnLastTick: boolean = false; // Whether the tone is finished fading out and ready to be freed.
    public passedEndOfNote: boolean = false;
    public forceContinueAtStart: boolean = false;
    public forceContinueAtEnd: boolean = false;
    public noteStartPart: number = 0;
    public noteEndPart: number = 0;
    public ticksSinceReleased: number = 0;
    public liveInputSamplesHeld: number = 0;
    public lastInterval: number = 0;
    public chipWaveStartOffset: number = 0;
    public noiseSample: number = 0.0;
    public noiseSampleA: number = 0.0;
    public noiseSampleB: number = 0.0;
    public stringSustainStart: number = 0;
    public stringSustainEnd: number = 0;
    public readonly noiseSamples: number[] = [];
    public readonly phases: number[] = [];
    public readonly operatorWaves: OperatorWave[] = [];
    public readonly phaseDeltas: number[] = [];
			// advloop addition
        public directions: number[] = [];
        public chipWaveCompletions: number[] = [];
        public chipWavePrevWavesL: number[] = [];
        public chipWavePrevWavesR: number[] = [];
        public chipWaveCompletionsLastWaveL: number[] = [];
        public chipWaveCompletionsLastWaveR: number[] = [];
           // advloop addition
    public readonly phaseDeltaScales: number[] = [];
    public expression: number = 0.0;
    public expressionDelta: number = 0.0;
    public readonly operatorExpressions: number[] = [];
    public readonly operatorExpressionDeltas: number[] = [];
    public readonly prevPitchExpressions: Array<number | null> = Array(Config.maxPitchOrOperatorCount).fill(null);
    public prevVibrato: number | null = null;
    public prevStringDecay: number | null = null;
    public pulseWidth: number = 0.0;
    public pulseWidthDelta: number = 0.0;
    public decimalOffset: number = 0.0;
    public supersawDynamism: number = 0.0;
    public supersawDynamismDelta: number = 0.0;
    public supersawUnisonDetunes: number[] = []; // These can change over time, but slowly enough that I'm not including corresponding delta values within a tick run.
    public supersawShape: number = 0.0;
    public supersawShapeDelta: number = 0.0;
    public supersawDelayLength: number = 0.0;
    public supersawDelayLengthDelta: number = 0.0;
    public supersawDelayLine: Float32Array | null = null;
    public supersawDelayIndex: number = -1;
    public supersawPrevPhaseDelta: number | null = null;
    public readonly pickedStrings: PickedString[] = [];

    public readonly noteFiltersL: DynamicBiquadFilter[] = [];
    public readonly noteFiltersR: DynamicBiquadFilter[] = [];
    public noteFilterCount: number = 0;
    public initialNoteFilterInputL1: number = 0.0;
    public initialNoteFilterInputR1: number = 0.0;
    public initialNoteFilterInputL2: number = 0.0;
    public initialNoteFilterInputR2: number = 0.0;

    public specialIntervalExpressionMult: number = 1.0;
    public readonly feedbackOutputs: number[] = [];
    public feedbackMult: number = 0.0;
    public feedbackDelta: number = 0.0;
    public stereoVolumeLStart: number = 0.0;
    public stereoVolumeRStart: number = 0.0;
    public stereoVolumeLDelta: number = 0.0;
    public stereoVolumeRDelta: number = 0.0;
    public stereoDelayStart: number = 0.0;
    public stereoDelayEnd: number = 0.0;
    public stereoDelayDelta: number = 0.0;
    public customVolumeStart: number = 0.0;
    public customVolumeEnd: number = 0.0;
    public filterResonanceStart: number = 0.0;
    public filterResonanceDelta: number = 0.0;
    public isFirstOrder: boolean = false;

    public readonly envelopeComputer: EnvelopeComputer = new EnvelopeComputer(/*true*/);

    constructor() {
        this.reset();
    }

    public reset(): void {
        // this.noiseSample = 0.0;
        for (let i: number = 0; i < Config.unisonVoicesMax; i++) {
            this.noiseSamples[i] = 0.0;
        }
        for (let i: number = 0; i < Config.maxPitchOrOperatorCount; i++) {
            this.phases[i] = 0.0;
				// advloop addition
                this.directions[i] = 1;
                this.chipWaveCompletions[i] = 0;
                this.chipWavePrevWavesL[i] = 0;
                this.chipWavePrevWavesR[i] = 0;
                this.chipWaveCompletionsLastWaveL[i] = 0;
                this.chipWaveCompletionsLastWaveR[i] = 0;
                // advloop addition
            this.operatorWaves[i] = Config.operatorWaves[0];
            this.feedbackOutputs[i] = 0.0;
            this.prevPitchExpressions[i] = null;
        }
        for (let i: number = 0; i < this.noteFilterCount; i++) {
            this.noteFiltersL[i].resetOutput();
            this.noteFiltersR[i].resetOutput();
        }
        this.noteFilterCount = 0;
        this.initialNoteFilterInputL1 = 0.0;
        this.initialNoteFilterInputR1 = 0.0;
        this.initialNoteFilterInputL2 = 0.0;
        this.initialNoteFilterInputR2 = 0.0;
        this.liveInputSamplesHeld = 0;
        this.supersawDelayIndex = -1;
        for (const pickedString of this.pickedStrings) {
            pickedString.reset();
        }
        this.envelopeComputer.reset();
        this.prevVibrato = null;
        this.prevStringDecay = null;
        this.supersawPrevPhaseDelta = null;
        this.drumsetPitch = null;
    }
}

export class Synth {

    private syncSongState(): void {
        const channelCount: number = this.song!.getChannelCount();
        for (let i: number = this.channels.length; i < channelCount; i++) {
            this.channels[i] = new ChannelState();
        }
        this.channels.length = channelCount;
        for (let i: number = 0; i < channelCount; i++) {
            const channel: Channel = this.song!.channels[i];
            const channelState: ChannelState = this.channels[i];
            for (let j: number = channelState.instruments.length; j < channel.instruments.length; j++) {
                channelState.instruments[j] = new InstrumentState();
            }
            channelState.instruments.length = channel.instruments.length;

            if (channelState.muted != channel.muted) {
                channelState.muted = channel.muted;
                if (channelState.muted) {
                    for (const instrumentState of channelState.instruments) {
                        instrumentState.resetAllEffects();
                    }
                }
            }
        }
    }

    public initModFilters(song: Song | null): void {
        if (song != null) {
            song.tmpEqFilterStart = song.eqFilter;
            song.tmpEqFilterEnd = null;
            for (let channelIndex: number = 0; channelIndex < song.getChannelCount(); channelIndex++) {
                for (let instrumentIndex: number = 0; instrumentIndex < song.channels[channelIndex].instruments.length; instrumentIndex++) {
                    const instrument: Instrument = song.channels[channelIndex].instruments[instrumentIndex];
                    for (let effectIndex: number = 0; effectIndex < song.channels[channelIndex].instruments[instrumentIndex].effects.length; effectIndex++) {
                        const effect: Effect = song.channels[channelIndex].instruments[instrumentIndex].effects[effectIndex] as Effect;
                        effect.tmpEqFilterStart = effect.eqFilter;
                        effect.tmpEqFilterEnd = null;
                    }
                    instrument.tmpNoteFilterStart = instrument.noteFilter;
                    instrument.tmpNoteFilterEnd = null;
                }
            }
        }
    }
    public warmUpSynthesizer(song: Song | null): void {
        // Don't bother to generate the drum waves unless the song actually
        // uses them, since they may require a lot of computation.
        if (song != null) {
            this.syncSongState();
            const samplesPerTick: number = this.getSamplesPerTick();
            for (let channelIndex: number = 0; channelIndex < song.getChannelCount(); channelIndex++) {
                for (let instrumentIndex: number = 0; instrumentIndex < song.channels[channelIndex].instruments.length; instrumentIndex++) {
                    const instrument: Instrument = song.channels[channelIndex].instruments[instrumentIndex];
                    const instrumentState: InstrumentState = this.channels[channelIndex].instruments[instrumentIndex];
                    Synth.getInstrumentSynthFunction(instrument);
                    instrumentState.vibratoTime = 0;
                    instrumentState.nextVibratoTime = 0;
                    for (let envelopeIndex: number = 0; envelopeIndex < Config.maxEnvelopeCount + 1; envelopeIndex++) instrumentState.envelopeTime[envelopeIndex] = 0;
                    instrumentState.arpTime = 0;
                    instrumentState.updateWaves(instrument, this.samplesPerSecond);
                    instrumentState.allocateNecessaryBuffers(this, instrument, samplesPerTick);
                }

            }
        }
        // JummBox needs to run synth functions for at least one sample (for JIT purposes)
        // before starting audio callbacks to avoid skipping the initial output.
        var dummyArray = new Float32Array(1);
        this.isPlayingSong = true;
        this.synthesize(dummyArray, dummyArray, 1, true);
        this.isPlayingSong = false;
    }


    public computeLatestModValues(): void {

        if (this.song != null && this.song.modChannelCount > 0) {

            // Clear all mod values, and set up temp variables for the time a mod would be set at.
            let latestModTimes: (number | null)[] = [];
            let latestModInsTimes: (number | null)[][][] = [];
            this.modValues = [];
            this.nextModValues = [];
            this.modInsValues = [];
            this.nextModInsValues = [];
            this.heldMods = [];
            for (let channel: number = 0; channel < this.song.pitchChannelCount + this.song.noiseChannelCount; channel++) {
                latestModInsTimes[channel] = [];
                this.modInsValues[channel] = [];
                this.nextModInsValues[channel] = [];

                for (let instrument: number = 0; instrument < this.song.channels[channel].instruments.length; instrument++) {
                    this.modInsValues[channel][instrument] = [];
                    this.nextModInsValues[channel][instrument] = [];
                    latestModInsTimes[channel][instrument] = [];
                }
            }

            // Find out where we're at in the fraction of the current bar.
            let currentPart: number = this.beat * Config.partsPerBeat + this.part;

            // For mod channels, calculate last set value for each mod
            for (let channelIndex: number = this.song.pitchChannelCount + this.song.noiseChannelCount; channelIndex < this.song.getChannelCount(); channelIndex++) {
                if (!(this.song.channels[channelIndex].muted)) {

                    let pattern: Pattern | null;

                    for (let currentBar: number = this.bar; currentBar >= 0; currentBar--) {
                        pattern = this.song.getPattern(channelIndex, currentBar);

                        if (pattern != null) {
                            let instrumentIdx: number = pattern.instruments[0];
                            let instrument: Instrument = this.song.channels[channelIndex].instruments[instrumentIdx];
                            let latestPinParts: number[] = [];
                            let latestPinValues: number[] = [];

                            let partsInBar: number = (currentBar == this.bar)
                                ? currentPart
                                : this.findPartsInBar(currentBar);

                            for (const note of pattern.notes) {
                                if (note.start <= partsInBar && (latestPinParts[Config.modCount - 1 - note.pitches[0]] == null || note.end > latestPinParts[Config.modCount - 1 - note.pitches[0]])) {
                                    if (note.start == partsInBar) { // This can happen with next bar mods, and the value of the aligned note's start pin will be used.
                                        latestPinParts[Config.modCount - 1 - note.pitches[0]] = note.start;
                                        latestPinValues[Config.modCount - 1 - note.pitches[0]] = note.pins[0].size;
                                    }
                                    if (note.end <= partsInBar) {
                                        latestPinParts[Config.modCount - 1 - note.pitches[0]] = note.end;
                                        latestPinValues[Config.modCount - 1 - note.pitches[0]] = note.pins[note.pins.length - 1].size;
                                    }
                                    else {
                                        latestPinParts[Config.modCount - 1 - note.pitches[0]] = partsInBar;
                                        // Find the pin where bar change happens, and compute where pin volume would be at that time
                                        for (let pinIdx = 0; pinIdx < note.pins.length; pinIdx++) {
                                            if (note.pins[pinIdx].time + note.start > partsInBar) {
                                                const transitionLength: number = note.pins[pinIdx].time - note.pins[pinIdx - 1].time;
                                                const toNextBarLength: number = partsInBar - note.start - note.pins[pinIdx - 1].time;
                                                const deltaVolume: number = note.pins[pinIdx].size - note.pins[pinIdx - 1].size;

                                                latestPinValues[Config.modCount - 1 - note.pitches[0]] = Math.round(note.pins[pinIdx - 1].size + deltaVolume * toNextBarLength / transitionLength);
                                                pinIdx = note.pins.length;
                                            }
                                        }
                                    }
                                }
                            }

                            // Set modulator value, if it wasn't set in another pattern already scanned
                            for (let mod: number = 0; mod < Config.modCount; mod++) {
                                if (latestPinParts[mod] != null) {
                                    if (Config.modulators[instrument.modulators[mod]].forSong) {
                                        const songFilterParam: boolean = instrument.modulators[mod] == Config.modulators.dictionary["song eq"].index;
                                        if (latestModTimes[instrument.modulators[mod]] == null || currentBar * Config.partsPerBeat * this.song.beatsPerBar + latestPinParts[mod] > (latestModTimes[instrument.modulators[mod]] as number)) {
                                            if (songFilterParam) {
                                                let tgtSong: Song = this.song
                                                if (instrument.modFilterTypes[mod] == 0) {
                                                    tgtSong.tmpEqFilterStart = tgtSong.eqSubFilters[latestPinValues[mod]];
                                                } else {
                                                    for (let i: number = 0; i < Config.filterMorphCount; i++) {
                                                        if (tgtSong.tmpEqFilterStart != null && tgtSong.tmpEqFilterStart == tgtSong.eqSubFilters[i]) {
                                                            tgtSong.tmpEqFilterStart = new FilterSettings();
                                                            tgtSong.tmpEqFilterStart.fromJsonObject(tgtSong.eqSubFilters[i]!.toJsonObject());
                                                            i = Config.filterMorphCount;
                                                        }
                                                    }
                                                    if (tgtSong.tmpEqFilterStart != null && Math.floor((instrument.modFilterTypes[mod] - 1) / 2) < tgtSong.tmpEqFilterStart.controlPointCount) {
                                                        if (instrument.modFilterTypes[mod] % 2)
                                                            tgtSong.tmpEqFilterStart.controlPoints[Math.floor((instrument.modFilterTypes[mod] - 1) / 2)].freq = latestPinValues[mod];
                                                        else
                                                            tgtSong.tmpEqFilterStart.controlPoints[Math.floor((instrument.modFilterTypes[mod] - 1) / 2)].gain = latestPinValues[mod];
                                                    }
                                                }
                                                tgtSong.tmpEqFilterEnd = tgtSong.tmpEqFilterStart;
                                            }
                                            for (let i: number = 0; i < instrument.modChannels[mod].length; i++) this.setModValue(latestPinValues[mod], latestPinValues[mod], instrument.modChannels[mod][i], instrument.modInstruments[mod][i], instrument.modulators[mod]);
                                            latestModTimes[instrument.modulators[mod]] = currentBar * Config.partsPerBeat * this.song.beatsPerBar + latestPinParts[mod];
                                        }
                                    } else {
                                        // Generate list of used channels + instruments
                                        let usedChannels: number[] = [];
                                        let usedInstruments: number[] = [];
                                        // All
                                        if (instrument.modInstruments[mod][0] == this.song.channels[instrument.modChannels[mod][0]].instruments.length) {
                                            for (let i: number = 0; i < this.song.channels[instrument.modChannels[mod][0]].instruments.length; i++) {
                                                usedChannels.push(instrument.modChannels[mod][0]);
                                                usedInstruments.push(i);
                                            }
                                        } // Active
                                        else if (instrument.modInstruments[mod][0] > this.song.channels[instrument.modChannels[mod][0]].instruments.length) {
                                            const tgtPattern: Pattern | null = this.song.getPattern(instrument.modChannels[mod][0], currentBar);
                                            if (tgtPattern != null) {
                                                usedChannels.push(instrument.modChannels[mod][0]);
                                                usedInstruments = tgtPattern.instruments;
                                            }
                                        } else {
                                            for (let i: number = 0; i < instrument.modChannels[mod].length; i++) {
                                                usedChannels.push(instrument.modChannels[mod][i]);
                                                usedInstruments.push(instrument.modInstruments[mod][i]);
                                            }
                                        }
                                        for (let instrumentIndex: number = 0; instrumentIndex < usedInstruments.length; instrumentIndex++) {
                                            // Iterate through all used instruments by this modulator
                                            // Special indices for mod filter targets, since they control multiple things.
                                            const eqFilterParam: boolean = instrument.modulators[mod] == Config.modulators.dictionary["post eq"].index;
                                            const noteFilterParam: boolean = instrument.modulators[mod] == Config.modulators.dictionary["pre eq"].index;
                                            let modulatorAdjust: number = instrument.modulators[mod];
                                            if (eqFilterParam) {
                                                modulatorAdjust = Config.modulators.length + (instrument.modFilterTypes[mod] | 0);
                                            } else if (noteFilterParam) {
                                                // Skip all possible indices for eq filter
                                                modulatorAdjust = Config.modulators.length + 1 + (2 * Config.filterMaxPoints) + (instrument.modFilterTypes[mod] | 0);
                                            }

                                            if (latestModInsTimes[instrument.modChannels[mod][instrumentIndex]][usedInstruments[instrumentIndex]][modulatorAdjust] == null
                                                || currentBar * Config.partsPerBeat * this.song.beatsPerBar + latestPinParts[mod] > latestModInsTimes[instrument.modChannels[mod][instrumentIndex]][usedInstruments[instrumentIndex]][modulatorAdjust]!) {

                                                if (eqFilterParam) {
                                                    let tgtInstrument: Instrument = this.song.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];
                                                    for (let effectIndex: number = 0; effectIndex < tgtInstrument.effects.length; effectIndex++) {
                                                        let tgtEffect: Effect = tgtInstrument.effects[effectIndex] as Effect;
                                                        if (instrument.modFilterTypes[mod] == 0) {
                                                            tgtEffect.tmpEqFilterStart = tgtEffect.eqSubFilters[latestPinValues[mod]];
                                                        } else {
                                                            for (let i: number = 0; i < Config.filterMorphCount; i++) {
                                                                if (tgtEffect.tmpEqFilterStart != null && tgtEffect.tmpEqFilterStart == tgtEffect.eqSubFilters[i]) {
                                                                    tgtEffect.tmpEqFilterStart = new FilterSettings();
                                                                    tgtEffect.tmpEqFilterStart.fromJsonObject(tgtEffect.eqSubFilters[i]!.toJsonObject());
                                                                    i = Config.filterMorphCount;
                                                                }
                                                            }
                                                            if (tgtEffect.tmpEqFilterStart != null && Math.floor((instrument.modFilterTypes[mod] - 1) / 2) < tgtEffect.tmpEqFilterStart.controlPointCount) {
                                                                if (instrument.modFilterTypes[mod] % 2)
                                                                    tgtEffect.tmpEqFilterStart.controlPoints[Math.floor((instrument.modFilterTypes[mod] - 1) / 2)].freq = latestPinValues[mod];
                                                                else
                                                                    tgtEffect.tmpEqFilterStart.controlPoints[Math.floor((instrument.modFilterTypes[mod] - 1) / 2)].gain = latestPinValues[mod];
                                                            }
                                                        }
                                                        tgtEffect.tmpEqFilterEnd = tgtEffect.tmpEqFilterStart;
                                                    }
                                                } else if (noteFilterParam) {
                                                    let tgtInstrument: Instrument = this.song.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];
                                                    if (instrument.modFilterTypes[mod] == 0) {
                                                        tgtInstrument.tmpNoteFilterStart = tgtInstrument.noteSubFilters[latestPinValues[mod]];
                                                    } else {
                                                        for (let i: number = 0; i < Config.filterMorphCount; i++) {
                                                            if (tgtInstrument.tmpNoteFilterStart != null && tgtInstrument.tmpNoteFilterStart == tgtInstrument.noteSubFilters[i]) {
                                                                tgtInstrument.tmpNoteFilterStart = new FilterSettings();
                                                                tgtInstrument.tmpNoteFilterStart.fromJsonObject(tgtInstrument.noteSubFilters[i]!.toJsonObject());
                                                                i = Config.filterMorphCount;
                                                            }
                                                        }
                                                        if (tgtInstrument.tmpNoteFilterStart != null && Math.floor((instrument.modFilterTypes[mod] - 1) / 2) < tgtInstrument.tmpNoteFilterStart.controlPointCount) {
                                                            if (instrument.modFilterTypes[mod] % 2)
                                                                tgtInstrument.tmpNoteFilterStart.controlPoints[Math.floor((instrument.modFilterTypes[mod] - 1) / 2)].freq = latestPinValues[mod];
                                                            else
                                                                tgtInstrument.tmpNoteFilterStart.controlPoints[Math.floor((instrument.modFilterTypes[mod] - 1) / 2)].gain = latestPinValues[mod];
                                                        }
                                                    }
                                                    tgtInstrument.tmpNoteFilterEnd = tgtInstrument.tmpNoteFilterStart;
                                                }
                                                else this.setModValue(latestPinValues[mod], latestPinValues[mod], instrument.modChannels[mod][instrumentIndex], usedInstruments[instrumentIndex], modulatorAdjust);

                                                latestModInsTimes[instrument.modChannels[mod][instrumentIndex]][usedInstruments[instrumentIndex]][modulatorAdjust] = currentBar * Config.partsPerBeat * this.song.beatsPerBar + latestPinParts[mod];
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Detects if a modulator is set, but not valid for the current effects/instrument type/filter type
    // Note, setting 'none' or the intermediary steps when clicking to add a mod, like an unset channel/unset instrument, counts as valid.
    // TODO: This kind of check is mirrored in SongEditor.ts' whenUpdated. Creates a lot of redundancy for adding new mods. Can be moved into new properties for mods, to avoid this later.
    public determineInvalidModulators(instrument: Instrument): void {
        if (this.song == null)
            return;
        for (let mod: number = 0; mod < Config.modCount; mod++) {
            instrument.invalidModulators[mod] = true;
            // For song modulator, valid if any setting used
            if (instrument.modChannels[mod][0] == -1) {
                if (instrument.modulators[mod] != 0)
                    instrument.invalidModulators[mod] = false;
                continue;
            }
            for (let channelIndex: number = 0; channelIndex < instrument.modChannels[mod].length; channelIndex++) {
                const channel: Channel | null = this.song.channels[instrument.modChannels[mod][channelIndex]];
                if (channel == null) continue;
                let tgtInstrumentList: Instrument[] = [];
                if (instrument.modInstruments[mod][channelIndex] >= channel.instruments.length) { // All or active
                    tgtInstrumentList = channel.instruments;
                } else {
                    tgtInstrumentList = [channel.instruments[instrument.modInstruments[mod][channelIndex]]];
                }
                for (let i: number = 0; i < tgtInstrumentList.length; i++) {
                    const tgtInstrument: Instrument | null = tgtInstrumentList[i];
                    const tgtEffect: Effect = tgtInstrument.effects[0] as Effect;
                    if (tgtInstrument == null) continue;
                    const str: string = Config.modulators[instrument.modulators[mod]].name;
                    // Check effects
                    if (!(Config.modulators[instrument.modulators[mod]].associatedEffect != EffectType.length && !(tgtInstrument.effectsIncludeType(Config.modulators[instrument.modulators[mod]].associatedEffect))) && !(Config.modulators[instrument.modulators[mod]].associatedMDEffect != MDEffectType.length && !(tgtInstrument.mdeffects & (1 << Config.modulators[instrument.modulators[mod]].associatedMDEffect)))
                        // Instrument type specific
                        || ((tgtInstrument.type != InstrumentType.fm && tgtInstrument.type != InstrumentType.fm6op) && (str == "fm slider 1" || str == "fm slider 2" || str == "fm slider 3" || str == "fm slider 4" || str == "fm feedback"))
                        || tgtInstrument.type != InstrumentType.fm6op && (str == "fm slider 5" || str == "fm slider 6")
                        || ((tgtInstrument.type != InstrumentType.pwm && tgtInstrument.type != InstrumentType.supersaw) && (str == "pulse width" || str == "decimal offset"))
                        || ((tgtInstrument.type != InstrumentType.supersaw) && (str == "dynamism" || str == "spread" || str == "saw shape"))
                        // Arp check
                        || (!tgtInstrument.getChord().arpeggiates && (str == "arp speed" || str == "reset arp"))
                        // EQ Filter check
                        || (tgtEffect.eqFilterType && str == "post eq")
                        || (!tgtEffect.eqFilterType && (str == "post eq cut" || str == "post eq peak"))
                        || (str == "post eq" && Math.floor((instrument.modFilterTypes[mod] + 1) / 2) > tgtInstrument.getLargestControlPointCount(false))
                        // Note Filter check
                        || (tgtInstrument!.noteFilterType && str == "pre eq")
                        || (!tgtInstrument!.noteFilterType && (str == "pre eq cut" || str == "pre eq peak"))
                        || (str == "pre eq" && Math.floor((instrument.modFilterTypes[mod] + 1) / 2) > tgtInstrument.getLargestControlPointCount(true))) {

                        instrument.invalidModulators[mod] = false;
                        i = tgtInstrumentList.length;
                    }
                }
            }
        }
    }

    private static operatorAmplitudeCurve(amplitude: number): number {
        return (Math.pow(16.0, amplitude / 15.0) - 1.0) / 15.0;
    }

    public samplesPerSecond: number = 44100;
    public panningDelayBufferSize: number;
    public panningDelayBufferMask: number;
    public flangerDelayBufferSize: number;
    public flangerDelayBufferMask: number;
    public chorusDelayBufferSize: number;
    public chorusDelayBufferMask: number;
    // TODO: reverb

    public song: Song | null = null;
    public preferLowerLatency: boolean = false; // enable when recording performances from keyboard or MIDI. Takes effect next time you activate audio.
    public anticipatePoorPerformance: boolean = false; // enable on mobile devices to reduce audio stutter glitches. Takes effect next time you activate audio.
    public liveInputDuration: number = 0;
    public liveBassInputDuration: number = 0;
    public liveInputStarted: boolean = false;
    public liveBassInputStarted: boolean = false;
    public liveInputPitches: number[] = [];
    public liveBassInputPitches: number[] = [];
    public liveInputChannel: number = 0;
    public liveBassInputChannel: number = 0;
    public liveInputInstruments: number[] = [];
    public liveBassInputInstruments: number[] = [];
    public loopRepeatCount: number = -1;
    public volume: number = 1.0;
    public oscRefreshEventTimer: number = 0;
    public oscEnabled: boolean = true;
    public enableMetronome: boolean = false;
    public countInMetronome: boolean = false;
    public renderingSong: boolean = false;
    public heldMods: HeldMod[] = [];
    private wantToSkip: boolean = false;
    private playheadInternal: number = 0.0;
    private bar: number = 0;
    private prevBar: number | null = null;
    private nextBar: number | null = null;
    private beat: number = 0;
    private part: number = 0;
    private tick: number = 0;
    public isAtStartOfTick: boolean = true;
    public isAtEndOfTick: boolean = true;
    public tickSampleCountdown: number = 0;
    private modValues: (number | null)[] = [];
    public modInsValues: (number | null)[][][] = [];
    private nextModValues: (number | null)[] = [];
    public nextModInsValues: (number | null)[][][] = [];
    private isPlayingSong: boolean = false;
    private isRecording: boolean = false;
    private liveInputEndTime: number = 0.0;
    private browserAutomaticallyClearsAudioBuffer: boolean = true; // Assume true until proven otherwise. Older Chrome does not clear the buffer so it needs to be cleared manually.

    public static readonly tempFilterStartCoefficients: FilterCoefficients = new FilterCoefficients();
    public static readonly tempFilterEndCoefficients: FilterCoefficients = new FilterCoefficients();
    private tempDrumSetControlPoint: FilterControlPoint = new FilterControlPoint();
    public tempFrequencyResponse: FrequencyResponse = new FrequencyResponse();
    public loopBarStart: number = -1;
    public loopBarEnd: number = -1;

    private static readonly fmSynthFunctionCache: Dictionary<Function> = {};
    private static readonly fm6SynthFunctionCache: Dictionary<Function> = {};
    private static readonly effectsFunctionCache: { [signature: string]: Function } = {};
    private static readonly pickedStringFunctionCache: Function[] = Array(3).fill(undefined); // keep in sync with the number of unison voices.
	// TODO: re-implement slarmoo's changes to the instrument synths, but in stereo!
    //private static readonly spectrumFunctionCache: Function[] = [];
	//private static readonly noiseFunctionCache: Function[] = [];
    //private static readonly drumFunctionCache: Function[] = [];
    //private static readonly chipFunctionCache: Function[] = [];
    //private static readonly pulseFunctionCache: Function[] = [];
    //private static readonly harmonicsFunctionCache: Function[] = [];
    //private static readonly loopableChipFunctionCache: Function[][] = Array(Config.unisonVoicesMax + 1).fill([]); //For loopable chips, we have a matrix where the rows represent voices and the columns represent loop types

    public readonly channels: ChannelState[] = [];
    private readonly tonePool: Deque<Tone> = new Deque<Tone>();
    private readonly tempMatchedPitchTones: Array<Tone | null> = Array(Config.maxChordSize).fill(null);

    private startedMetronome: boolean = false;
    private metronomeSamplesRemaining: number = -1;
    private metronomeAmplitude: number = 0.0;
    private metronomePrevAmplitude: number = 0.0;
    private metronomeFilter: number = 0.0;
    private limit: number = 0.0;

    public songEqFilterVolume: number = 1.0;
    public songEqFilterVolumeDelta: number = 0.0;
    public readonly songEqFiltersL: DynamicBiquadFilter[] = [];
    public readonly songEqFiltersR: DynamicBiquadFilter[] = [];
    public songEqFilterCount: number = 0;
    public initialSongEqFilterInput1L: number = 0.0;
    public initialSongEqFilterInput2L: number = 0.0;
    public initialSongEqFilterInput1R: number = 0.0;
    public initialSongEqFilterInput2R: number = 0.0;

    private tempInstrumentSampleBufferL: Float32Array | null = null;
    private tempInstrumentSampleBufferR: Float32Array | null = null;

    private audioCtx: any | null = null;
    private scriptNode: any | null = null;

    public get playing(): boolean {
        return this.isPlayingSong;
    }

    public get recording(): boolean {
        return this.isRecording;
    }

    public get playhead(): number {
        return this.playheadInternal;
    }

    public set playhead(value: number) {
        if (this.song != null) {
            this.playheadInternal = Math.max(0, Math.min(this.song.barCount, value));
            let remainder: number = this.playheadInternal;
            this.bar = Math.floor(remainder);
            remainder = this.song.beatsPerBar * (remainder - this.bar);
            this.beat = Math.floor(remainder);
            remainder = Config.partsPerBeat * (remainder - this.beat);
            this.part = Math.floor(remainder);
            remainder = Config.ticksPerPart * (remainder - this.part);
            this.tick = Math.floor(remainder);
            this.tickSampleCountdown = 0;
            this.isAtStartOfTick = true;
            this.prevBar = null;
        }
    }

    public getSamplesPerBar(): number {
        if (this.song == null) throw new Error();
        return this.getSamplesPerTick() * Config.ticksPerPart * Config.partsPerBeat * this.song.beatsPerBar;
    }

    public getTicksIntoBar(): number {
        return (this.beat * Config.partsPerBeat + this.part) * Config.ticksPerPart + this.tick;
    }
    public getCurrentPart(): number {
        return (this.beat * Config.partsPerBeat + this.part);
    }

    private findPartsInBar(bar: number): number {
        if (this.song == null) return 0;
        let partsInBar: number = Config.partsPerBeat * this.song.beatsPerBar;
        for (let channel: number = this.song.pitchChannelCount + this.song.noiseChannelCount; channel < this.song.getChannelCount(); channel++) {
            let pattern: Pattern | null = this.song.getPattern(channel, bar);
            if (pattern != null) {
                let instrument: Instrument = this.song.channels[channel].instruments[pattern.instruments[0]];
                for (let mod: number = 0; mod < Config.modCount; mod++) {
                    if (instrument.modulators[mod] == Config.modulators.dictionary["next bar"].index) {
                        for (const note of pattern.notes) {
                            if (note.pitches[0] == (Config.modCount - 1 - mod)) {
                                // Find the earliest next bar note.
                                if (partsInBar > note.start)
                                    partsInBar = note.start;
                            }
                        }
                    }
                }
            }
        }
        return partsInBar;
    }

    // Returns the total samples in the song
    public getTotalSamples(enableIntro: boolean, enableOutro: boolean, loop: number): number {
        if (this.song == null)
            return -1;

        // Compute the window to be checked (start bar to end bar)
        let startBar: number = enableIntro ? 0 : this.song.loopStart;
        let endBar: number = enableOutro ? this.song.barCount : (this.song.loopStart + this.song.loopLength);
        let hasTempoMods: boolean = false;
        let hasNextBarMods: boolean = false;
        let prevTempo: number = this.song.tempo;

        // Determine if any tempo or next bar mods happen anywhere in the window
        for (let channel: number = this.song.getChannelCount() - 1; channel >= this.song.pitchChannelCount + this.song.noiseChannelCount; channel--) {
            for (let bar: number = startBar; bar < endBar; bar++) {
                let pattern: Pattern | null = this.song.getPattern(channel, bar);
                if (pattern != null) {
                    let instrument: Instrument = this.song.channels[channel].instruments[pattern.instruments[0]];
                    for (let mod: number = 0; mod < Config.modCount; mod++) {
                        if (instrument.modulators[mod] == Config.modulators.dictionary["tempo"].index) {
                            hasTempoMods = true;
                        }
                        if (instrument.modulators[mod] == Config.modulators.dictionary["next bar"].index) {
                            hasNextBarMods = true;
                        }
                    }
                }
            }
        }

        // If intro is not zero length, determine what the "entry" tempo is going into the start part, by looking at mods that came before...
        if (startBar > 0) {
            let latestTempoPin: number | null = null;
            let latestTempoValue: number = 0;

            for (let bar: number = startBar - 1; bar >= 0; bar--) {
                for (let channel: number = this.song.getChannelCount() - 1; channel >= this.song.pitchChannelCount + this.song.noiseChannelCount; channel--) {
                    let pattern = this.song.getPattern(channel, bar);

                    if (pattern != null) {
                        let instrumentIdx: number = pattern.instruments[0];
                        let instrument: Instrument = this.song.channels[channel].instruments[instrumentIdx];

                        let partsInBar: number = this.findPartsInBar(bar);

                        for (const note of pattern.notes) {
                            if (instrument.modulators[Config.modCount - 1 - note.pitches[0]] == Config.modulators.dictionary["tempo"].index) {
                                if (note.start < partsInBar && (latestTempoPin == null || note.end > latestTempoPin)) {
                                    if (note.end <= partsInBar) {
                                        latestTempoPin = note.end;
                                        latestTempoValue = note.pins[note.pins.length - 1].size;
                                    }
                                    else {
                                        latestTempoPin = partsInBar;
                                        // Find the pin where bar change happens, and compute where pin volume would be at that time
                                        for (let pinIdx = 0; pinIdx < note.pins.length; pinIdx++) {
                                            if (note.pins[pinIdx].time + note.start > partsInBar) {
                                                const transitionLength: number = note.pins[pinIdx].time - note.pins[pinIdx - 1].time;
                                                const toNextBarLength: number = partsInBar - note.start - note.pins[pinIdx - 1].time;
                                                const deltaVolume: number = note.pins[pinIdx].size - note.pins[pinIdx - 1].size;

                                                latestTempoValue = Math.round(note.pins[pinIdx - 1].size + deltaVolume * toNextBarLength / transitionLength);
                                                pinIdx = note.pins.length;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Done once you process a pattern where tempo mods happened, since the search happens backward
                if (latestTempoPin != null) {
                    prevTempo = latestTempoValue + Config.modulators.dictionary["tempo"].convertRealFactor;
                    bar = -1;
                }
            }
        }

        if (hasTempoMods || hasNextBarMods) {
            // Run from start bar to end bar and observe looping, computing average tempo across each bar
            let bar: number = startBar;
            let ended: boolean = false;
            let totalSamples: number = 0;

            while (!ended) {
                // Compute the subsection of the pattern that will play
                let partsInBar: number = Config.partsPerBeat * this.song.beatsPerBar;
                let currentPart: number = 0;

                if (hasNextBarMods) {
                    partsInBar = this.findPartsInBar(bar);
                }

                // Compute average tempo in this tick window, or use last tempo if nothing happened
                if (hasTempoMods) {
                    let foundMod: boolean = false;
                    for (let channel: number = this.song.getChannelCount() - 1; channel >= this.song.pitchChannelCount + this.song.noiseChannelCount; channel--) {
                        if (foundMod == false) {
                            let pattern: Pattern | null = this.song.getPattern(channel, bar);
                            if (pattern != null) {
                                let instrument: Instrument = this.song.channels[channel].instruments[pattern.instruments[0]];
                                for (let mod: number = 0; mod < Config.modCount; mod++) {
                                    if (foundMod == false && instrument.modulators[mod] == Config.modulators.dictionary["tempo"].index
                                        && pattern.notes.find(n => n.pitches[0] == (Config.modCount - 1 - mod))) {
                                        // Only the first tempo mod instrument for this bar will be checked (well, the first with a note in this bar).
                                        foundMod = true;
                                        // Need to re-sort the notes by start time to make the next part much less painful.
                                        pattern.notes.sort(function (a, b) { return (a.start == b.start) ? a.pitches[0] - b.pitches[0] : a.start - b.start; });
                                        for (const note of pattern.notes) {
                                            if (note.pitches[0] == (Config.modCount - 1 - mod)) {
                                                // Compute samples up to this note
                                                totalSamples += (Math.min(partsInBar - currentPart, note.start - currentPart)) * Config.ticksPerPart * this.getSamplesPerTickSpecificBPM(prevTempo);

                                                if (note.start < partsInBar) {
                                                    for (let pinIdx: number = 1; pinIdx < note.pins.length; pinIdx++) {
                                                        // Compute samples up to this pin
                                                        if (note.pins[pinIdx - 1].time + note.start <= partsInBar) {
                                                            const tickLength: number = Config.ticksPerPart * Math.min(partsInBar - (note.start + note.pins[pinIdx - 1].time), note.pins[pinIdx].time - note.pins[pinIdx - 1].time);
                                                            const prevPinTempo: number = note.pins[pinIdx - 1].size + Config.modulators.dictionary["tempo"].convertRealFactor;
                                                            let currPinTempo: number = note.pins[pinIdx].size + Config.modulators.dictionary["tempo"].convertRealFactor;
                                                            if (note.pins[pinIdx].time + note.start > partsInBar) {
                                                                // Compute an intermediary tempo since bar changed over mid-pin. Maybe I'm deep in "what if" territory now!
                                                                currPinTempo = note.pins[pinIdx - 1].size + (note.pins[pinIdx].size - note.pins[pinIdx - 1].size) * (partsInBar - (note.start + note.pins[pinIdx - 1].time)) / (note.pins[pinIdx].time - note.pins[pinIdx - 1].time) + Config.modulators.dictionary["tempo"].convertRealFactor;
                                                            }
                                                            let bpmScalar: number = Config.partsPerBeat * Config.ticksPerPart / 60;

                                                            if (currPinTempo != prevPinTempo) {

                                                                // Definite integral of SamplesPerTick w/r/t beats to find total samples from start point to end point for a variable tempo
                                                                // The starting formula is
                                                                // SamplesPerTick = SamplesPerSec / ((PartsPerBeat * TicksPerPart) / SecPerMin) * BeatsPerMin )
                                                                //
                                                                // This is an expression of samples per tick "instantaneously", and it can be multiplied by a number of ticks to get a sample count.
                                                                // But this isn't the full story. BeatsPerMin, e.g. tempo, changes throughout the interval so it has to be expressed in terms of ticks, "t"
                                                                // ( Also from now on PartsPerBeat, TicksPerPart, and SecPerMin are combined into one scalar, called "BPMScalar" )
                                                                // Substituting BPM for a step variable that moves with respect to the current tick, we get
                                                                // SamplesPerTick = SamplesPerSec / (BPMScalar * ( (EndTempo - StartTempo / TickLength) * t + StartTempo ) )
                                                                //
                                                                // When this equation is integrated from 0 to TickLength with respect to t, we get the following expression:
                                                                //   Samples = - SamplesPerSec * TickLength * ( log( BPMScalar * EndTempo * TickLength ) - log( BPMScalar * StartTempo * TickLength ) ) / BPMScalar * ( StartTempo - EndTempo )

                                                                totalSamples += - this.samplesPerSecond * tickLength * (Math.log(bpmScalar * currPinTempo * tickLength) - Math.log(bpmScalar * prevPinTempo * tickLength)) / (bpmScalar * (prevPinTempo - currPinTempo));

                                                            }
                                                            else {

                                                                // No tempo change between the two pins.
                                                                totalSamples += tickLength * this.getSamplesPerTickSpecificBPM(currPinTempo);

                                                            }
                                                            prevTempo = currPinTempo;
                                                        }
                                                        currentPart = Math.min(note.start + note.pins[pinIdx].time, partsInBar);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Compute samples for the rest of the bar
                totalSamples += (partsInBar - currentPart) * Config.ticksPerPart * this.getSamplesPerTickSpecificBPM(prevTempo);

                bar++;
                if (loop != 0 && bar == this.song.loopStart + this.song.loopLength) {
                    bar = this.song.loopStart;
                    if (loop > 0) loop--;
                }
                if (bar >= endBar) {
                    ended = true;
                }

            }

            return Math.ceil(totalSamples);
        }
        else {
            // No tempo or next bar mods... phew! Just calculate normally.
            return this.getSamplesPerBar() * this.getTotalBars(enableIntro, enableOutro, loop);
        }
    }

    public getTotalBars(enableIntro: boolean, enableOutro: boolean, useLoopCount: number = this.loopRepeatCount): number {
        if (this.song == null) throw new Error();
        let bars: number = this.song.loopLength * (useLoopCount + 1);
        if (enableIntro) bars += this.song.loopStart;
        if (enableOutro) bars += this.song.barCount - (this.song.loopStart + this.song.loopLength);
        return bars;
    }

    constructor(song: Song | string | null = null) {
        this.computeDelayBufferSizes();
        if (song != null) this.setSong(song);
    }

    public setSong(song: Song | string): void {
        if (typeof (song) == "string") {
            this.song = new Song(song);
        } else if (song instanceof Song) {
            this.song = song;
        }
        this.prevBar = null;
    }

    private computeDelayBufferSizes(): void {
        this.panningDelayBufferSize = fittingPowerOfTwo(this.samplesPerSecond * Config.panDelaySecondsMax);
        this.panningDelayBufferMask = this.panningDelayBufferSize - 1;
        this.flangerDelayBufferSize = fittingPowerOfTwo(this.samplesPerSecond * Config.flangerMaxDelay);
        this.flangerDelayBufferMask = this.flangerDelayBufferSize - 1;
        this.chorusDelayBufferSize = fittingPowerOfTwo(this.samplesPerSecond * Config.chorusMaxDelay);
        this.chorusDelayBufferMask = this.chorusDelayBufferSize - 1;
    }

    private activateAudio(): void {
        const bufferSize: number = this.anticipatePoorPerformance ? (this.preferLowerLatency ? 2048 : 4096) : (this.preferLowerLatency ? 512 : 2048);
        if (this.audioCtx == null || this.scriptNode == null || this.scriptNode.bufferSize != bufferSize) {
            if (this.scriptNode != null) this.deactivateAudio();
            const latencyHint: string = this.anticipatePoorPerformance ? (this.preferLowerLatency ? "balanced" : "playback") : (this.preferLowerLatency ? "interactive" : "balanced");
            this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: latencyHint });
            this.samplesPerSecond = this.audioCtx.sampleRate;
            this.scriptNode = this.audioCtx.createScriptProcessor ? this.audioCtx.createScriptProcessor(bufferSize, 0, 2) : this.audioCtx.createJavaScriptNode(bufferSize, 0, 2); // bufferSize samples per callback buffer, 0 input channels, 2 output channels (left/right)
            this.scriptNode.onaudioprocess = this.audioProcessCallback;
            this.scriptNode.channelCountMode = 'explicit';
            this.scriptNode.channelInterpretation = 'speakers';
            this.scriptNode.connect(this.audioCtx.destination);

            this.computeDelayBufferSizes();
        }
        this.audioCtx.resume();
    }

    private deactivateAudio(): void {
        if (this.audioCtx != null && this.scriptNode != null) {
            this.scriptNode.disconnect(this.audioCtx.destination);
            this.scriptNode = null;
            if (this.audioCtx.close) this.audioCtx.close(); // firefox is missing this function?
            this.audioCtx = null;
        }
    }

    public maintainLiveInput(): void {
        this.activateAudio();
        this.liveInputEndTime = performance.now() + 10000.0;
    }

    public play(): void {
        if (this.isPlayingSong) return;
        this.initModFilters(this.song);
        this.computeLatestModValues();
        this.activateAudio();
        this.warmUpSynthesizer(this.song);
        this.isPlayingSong = true;
    }

    public pause(): void {
        if (!this.isPlayingSong) return;
        this.isPlayingSong = false;
        this.isRecording = false;
        this.preferLowerLatency = false;
        this.modValues = [];
        this.nextModValues = [];
        this.heldMods = [];
        if (this.song != null) {
            this.song.inVolumeCap = 0.0;
            this.song.outVolumeCap = 0.0;
            this.song.outVolumeCapL = 0.0;
            this.song.outVolumeCapR = 0.0;
            this.song.tmpEqFilterStart = null;
            this.song.tmpEqFilterEnd = null;
            for (let channelIndex: number = 0; channelIndex < this.song.pitchChannelCount + this.song.noiseChannelCount; channelIndex++) {
                this.modInsValues[channelIndex] = [];
                this.nextModInsValues[channelIndex] = [];
            }
        }
    }

    public startRecording(): void {
        this.preferLowerLatency = true;
        this.isRecording = true;
        this.play();
    }

    public resetEffects(): void {
        this.limit = 0.0;
        this.freeAllTones();
        if (this.song != null) {
            for (const channelState of this.channels) {
                for (const instrumentState of channelState.instruments) {
                    instrumentState.resetAllEffects();
                }
            }
        }
    }

    public setModValue(volumeStart: number, volumeEnd: number, channelIndex: number, instrumentIndex: number, setting: number): number {
        let val: number = volumeStart + Config.modulators[setting].convertRealFactor;
        let nextVal: number = volumeEnd + Config.modulators[setting].convertRealFactor;
        if (Config.modulators[setting].forSong) {
            if (this.modValues[setting] == null || this.modValues[setting] != val || this.nextModValues[setting] != nextVal) {
                this.modValues[setting] = val;
                this.nextModValues[setting] = nextVal;
            }
        } else {
            if (this.modInsValues[channelIndex][instrumentIndex][setting] == null
                || this.modInsValues[channelIndex][instrumentIndex][setting] != val
                || this.nextModInsValues[channelIndex][instrumentIndex][setting] != nextVal) {
                this.modInsValues[channelIndex][instrumentIndex][setting] = val;
                this.nextModInsValues[channelIndex][instrumentIndex][setting] = nextVal;
            }
        }

        return val;
    }

    public getModValue(setting: number, channel?: number | null, instrument?: number | null, nextVal?: boolean): number {
        const forSong: boolean = Config.modulators[setting].forSong;
        if (forSong) {
            if (this.modValues[setting] != null && this.nextModValues[setting] != null) {
                return nextVal ? this.nextModValues[setting]! : this.modValues[setting]!;
            }
        } else if (channel != undefined && instrument != undefined) {
            if (this.modInsValues[channel][instrument][setting] != null && this.nextModInsValues[channel][instrument][setting] != null) {
                return nextVal ? this.nextModInsValues[channel][instrument][setting]! : this.modInsValues[channel][instrument][setting]!;
            }
        }
        return -1;
    }

    // Checks if any mod is active for the given channel/instrument OR if any mod is active for the song scope. Could split the logic if needed later.
    public isAnyModActive(channel: number, instrument: number): boolean {
        for (let setting: number = 0; setting < Config.modulators.length; setting++) {
            if ((this.modValues != undefined && this.modValues[setting] != null)
                || (this.modInsValues != undefined && this.modInsValues[channel] != undefined && this.modInsValues[channel][instrument] != undefined && this.modInsValues[channel][instrument][setting] != null)) {
                return true;
            }
        }
        return false;
    }

    public unsetMod(setting: number, channel?: number, instrument?: number) {
        if (this.isModActive(setting) || (channel != undefined && instrument != undefined && this.isModActive(setting, channel, instrument))) {
            this.modValues[setting] = null;
            this.nextModValues[setting] = null;
            for (let i: number = 0; i < this.heldMods.length; i++) {
                if (channel != undefined && instrument != undefined) {
                    if (this.heldMods[i].channelIndex == channel && this.heldMods[i].instrumentIndex == instrument && this.heldMods[i].setting == setting)
                        this.heldMods.splice(i, 1);
                } else {
                    if (this.heldMods[i].setting == setting)
                        this.heldMods.splice(i, 1);
                }
            }
            if (channel != undefined && instrument != undefined) {
                this.modInsValues[channel][instrument][setting] = null;
                this.nextModInsValues[channel][instrument][setting] = null;
            }
        }
    }

    public isFilterModActive(forNoteFilter: boolean, channelIdx: number, instrumentIdx: number, forSong?: boolean) {
        const instrument: Instrument = this.song!.channels[channelIdx].instruments[instrumentIdx];

        if (forNoteFilter) {
            if (instrument.noteFilterType)
                return false;
            if (instrument.tmpNoteFilterEnd != null)
                return true;
        }
        else {
            if (forSong) {
                if (this?.song?.tmpEqFilterEnd != null)
                    return true;
            } else {
                for (let i: number = 0; i < instrument.effects.length; i++) {
                    let effect: Effect = instrument.effects[i] as Effect
                    if (effect.eqFilterType)
                        return false;
                    if (effect.tmpEqFilterEnd != null)
                        return true;
                }
            }
        }  
            
        return false
    }

    public isModActive(setting: number, channel?: number, instrument?: number): boolean {
        const forSong: boolean = Config.modulators[setting].forSong;
        if (forSong) {
            return (this.modValues != undefined && this.modValues[setting] != null);
        } else if (channel != undefined && instrument != undefined && this.modInsValues != undefined && this.modInsValues[channel] != null && this.modInsValues[channel][instrument] != null) {
            return (this.modInsValues[channel][instrument][setting] != null);
        }
        return false;
    }

    // Force a modulator to be held at the given volumeStart for a brief duration.
    public forceHoldMods(volumeStart: number, channelIndex: number, instrumentIndex: number, setting: number): void {
        let found: boolean = false;
        for (let i: number = 0; i < this.heldMods.length; i++) {
            if (this.heldMods[i].channelIndex == channelIndex && this.heldMods[i].instrumentIndex == instrumentIndex && this.heldMods[i].setting == setting) {
                this.heldMods[i].volume = volumeStart;
                this.heldMods[i].holdFor = 24;
                found = true;
            }
        }
        // Default: hold for 24 ticks / 12 parts (half a beat).
        if (!found)
            this.heldMods.push({ volume: volumeStart, channelIndex: channelIndex, instrumentIndex: instrumentIndex, setting: setting, holdFor: 24 });
    }

    public snapToStart(): void {
        this.bar = 0;
        this.resetEffects();
        this.snapToBar();
    }

    public goToBar(bar: number): void {
        this.bar = bar;
        this.resetEffects();
        this.playheadInternal = this.bar;
    }

    public snapToBar(): void {
        this.playheadInternal = this.bar;
        this.beat = 0;
        this.part = 0;
        this.tick = 0;
        this.tickSampleCountdown = 0;
    }

    public jumpIntoLoop(): void {
        if (!this.song) return;
        if (this.bar < this.song.loopStart || this.bar >= this.song.loopStart + this.song.loopLength) {
            const oldBar: number = this.bar;
            this.bar = this.song.loopStart;
            this.playheadInternal += this.bar - oldBar;

            if (this.playing)
                this.computeLatestModValues();
        }
    }

    public goToNextBar(): void {
        if (!this.song) return;
        this.prevBar = this.bar;
        const oldBar: number = this.bar;
        this.bar++;
        if (this.bar >= this.song.barCount) {
            this.bar = 0;
        }
        this.playheadInternal += this.bar - oldBar;

        if (this.playing)
            this.computeLatestModValues();
    }

    public goToPrevBar(): void {
        if (!this.song) return;
        this.prevBar = null;
        const oldBar: number = this.bar;
        this.bar--;
        if (this.bar < 0 || this.bar >= this.song.barCount) {
            this.bar = this.song.barCount - 1;
        }
        this.playheadInternal += this.bar - oldBar;

        if (this.playing)
            this.computeLatestModValues();
    }

    private getNextBar(): number {
        let nextBar: number = this.bar + 1;
        if (this.isRecording) {
            if (nextBar >= this.song!.barCount) {
                nextBar = this.song!.barCount - 1;
            }
        } else if (this.bar == this.loopBarEnd && !this.renderingSong) {
            nextBar = this.loopBarStart;
        }
        else if (this.loopRepeatCount != 0 && nextBar == Math.max(this.loopBarEnd + 1, this.song!.loopStart + this.song!.loopLength)) {
            nextBar = this.song!.loopStart;
        }
        return nextBar;
    }

    public skipBar(): void {
        if (!this.song) return;
        const samplesPerTick: number = this.getSamplesPerTick();
        this.prevBar = this.bar; // Bugfix by LeoV
        if (this.loopBarEnd != this.bar)
            this.bar++;
        else {
            this.bar = this.loopBarStart;
        }
        this.beat = 0;
        this.part = 0;
        this.tick = 0;
        this.tickSampleCountdown = samplesPerTick;
        this.isAtStartOfTick = true;

        if (this.loopRepeatCount != 0 && this.bar == Math.max(this.song.loopStart + this.song.loopLength, this.loopBarEnd)) {
            this.bar = this.song.loopStart;
            if (this.loopBarStart != -1)
                this.bar = this.loopBarStart;
            if (this.loopRepeatCount > 0) this.loopRepeatCount--;
        }

    }

    private audioProcessCallback = (audioProcessingEvent: any): void => {
        const outputBuffer = audioProcessingEvent.outputBuffer;
        const outputDataL: Float32Array = outputBuffer.getChannelData(0);
        const outputDataR: Float32Array = outputBuffer.getChannelData(1);

        if (this.browserAutomaticallyClearsAudioBuffer && (outputDataL[0] != 0.0 || outputDataR[0] != 0.0 || outputDataL[outputBuffer.length - 1] != 0.0 || outputDataR[outputBuffer.length - 1] != 0.0)) {
            // If the buffer is ever initially nonzero, then this must be an older browser that doesn't automatically clear the audio buffer.
            this.browserAutomaticallyClearsAudioBuffer = false;
        }
        if (!this.browserAutomaticallyClearsAudioBuffer) {
            // If this browser does not clear the buffer automatically, do so manually before continuing.
            const length: number = outputBuffer.length;
            for (let i: number = 0; i < length; i++) {
                outputDataL[i] = 0.0;
                outputDataR[i] = 0.0;
            }
        }

        if (!this.isPlayingSong && performance.now() >= this.liveInputEndTime) {
            this.deactivateAudio();
        } else {
            this.synthesize(outputDataL, outputDataR, outputBuffer.length, this.isPlayingSong);

            if (this.oscEnabled) {
                if (this.oscRefreshEventTimer <= 0) {
                    events.raise("oscilloscopeUpdate", outputDataL, outputDataR);
                    this.oscRefreshEventTimer = 2;
                } else {
                    this.oscRefreshEventTimer--;
                }
            }
        }
    }

    private computeSongState(samplesPerTick: number): void {
                if (this.song == null) return;
        
                    const roundedSamplesPerTick: number = Math.ceil(samplesPerTick);
                const samplesPerSecond: number = this.samplesPerSecond;
        
                    let eqFilterVolume: number = 1.0; //this.envelopeComputer.lowpassCutoffDecayVolumeCompensation;
                if (this.song.eqFilterType) {
                        // Simple EQ filter (old style). For analysis, using random filters from normal style since they are N/A in this context.
                            const eqFilterSettingsStart: FilterSettings = this.song.eqFilter;
                        if (this.song.eqSubFilters[1] == null)
                                this.song.eqSubFilters[1] = new FilterSettings();
                        const eqFilterSettingsEnd: FilterSettings = this.song.eqSubFilters[1];
            
                            // Change location based on slider values
                            let startSimpleFreq: number = this.song.eqFilterSimpleCut;
                        let startSimpleGain: number = this.song.eqFilterSimplePeak;
                        let endSimpleFreq: number = this.song.eqFilterSimpleCut;
                        let endSimpleGain: number = this.song.eqFilterSimplePeak;
            
                            let filterChanges: boolean = false;
            
                            // if (synth.isModActive(Config.modulators.dictionary["eq filt cut"].index, channelIndex, instrumentIndex)) {
                            //     startSimpleFreq = synth.getModValue(Config.modulators.dictionary["eq filt cut"].index, channelIndex, instrumentIndex, false);
                            //     endSimpleFreq = synth.getModValue(Config.modulators.dictionary["eq filt cut"].index, channelIndex, instrumentIndex, true);
                            //     filterChanges = true;
                            // }
                            // if (synth.isModActive(Config.modulators.dictionary["eq filt peak"].index, channelIndex, instrumentIndex)) {
                            //     startSimpleGain = synth.getModValue(Config.modulators.dictionary["eq filt peak"].index, channelIndex, instrumentIndex, false);
                            //     endSimpleGain = synth.getModValue(Config.modulators.dictionary["eq filt peak"].index, channelIndex, instrumentIndex, true);
                            //     filterChanges = true;
                            // }
                
                            let startPoint: FilterControlPoint;
            
                            if (filterChanges) {
                                    eqFilterSettingsStart.convertLegacySettingsForSynth(startSimpleFreq, startSimpleGain);
                                    eqFilterSettingsEnd.convertLegacySettingsForSynth(endSimpleFreq, endSimpleGain);
                    
                                        startPoint = eqFilterSettingsStart.controlPoints[0];
                                    let endPoint: FilterControlPoint = eqFilterSettingsEnd.controlPoints[0];
                    
                                        startPoint.toCoefficients(Synth.tempFilterStartCoefficients, samplesPerSecond, 1.0, 1.0);
                                    endPoint.toCoefficients(Synth.tempFilterEndCoefficients, samplesPerSecond, 1.0, 1.0);
                    
                                        if (this.songEqFiltersL.length < 1) this.songEqFiltersL[0] = new DynamicBiquadFilter();
                                    this.songEqFiltersL[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
                                    if (this.songEqFiltersR.length < 1) this.songEqFiltersR[0] = new DynamicBiquadFilter();
                                    this.songEqFiltersR[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
                    
                                    } else {
                                eqFilterSettingsStart.convertLegacySettingsForSynth(startSimpleFreq, startSimpleGain, true);
                
                                    startPoint = eqFilterSettingsStart.controlPoints[0];
                
                                    startPoint.toCoefficients(Synth.tempFilterStartCoefficients, samplesPerSecond, 1.0, 1.0);
                
                                    if (this.songEqFiltersL.length < 1) this.songEqFiltersL[0] = new DynamicBiquadFilter();
                                this.songEqFiltersL[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterStartCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
                                if (this.songEqFiltersR.length < 1) this.songEqFiltersR[0] = new DynamicBiquadFilter();
                                this.songEqFiltersR[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterStartCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
                
                                }
            
                            eqFilterVolume *= startPoint.getVolumeCompensationMult();
            
                            this.songEqFilterCount = 1;
                        eqFilterVolume = Math.min(3.0, eqFilterVolume);
                    } else {
                        const eqFilterSettings: FilterSettings = (this.song.tmpEqFilterStart != null) ? this.song.tmpEqFilterStart : this.song.eqFilter;
                        //const eqAllFreqsEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterAllFreqs];
                            //const eqAllFreqsEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterAllFreqs];
                            for (let i: number = 0; i < eqFilterSettings.controlPointCount; i++) {
                                    //const eqFreqEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterFreq0 + i];
                                        //const eqFreqEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterFreq0 + i];
                                        //const eqPeakEnvelopeStart: number = envelopeStarts[InstrumentAutomationIndex.eqFilterGain0 + i];
                                        //const eqPeakEnvelopeEnd:   number = envelopeEnds[  InstrumentAutomationIndex.eqFilterGain0 + i];
                                        let startPoint: FilterControlPoint = eqFilterSettings.controlPoints[i];
                                    let endPoint: FilterControlPoint = (this.song.tmpEqFilterEnd != null && this.song.tmpEqFilterEnd.controlPoints[i] != null) ? this.song.tmpEqFilterEnd.controlPoints[i] : eqFilterSettings.controlPoints[i];
                    
                                        // If switching dot type, do it all at once and do not try to interpolate since no valid interpolation exists.
                                        if (startPoint.type != endPoint.type) {
                                                startPoint = endPoint;
                                            }
                    
                                        startPoint.toCoefficients(Synth.tempFilterStartCoefficients, samplesPerSecond, /*eqAllFreqsEnvelopeStart * eqFreqEnvelopeStart*/ 1.0, /*eqPeakEnvelopeStart*/ 1.0);
                                    endPoint.toCoefficients(Synth.tempFilterEndCoefficients, samplesPerSecond, /*eqAllFreqsEnvelopeEnd   * eqFreqEnvelopeEnd*/   1.0, /*eqPeakEnvelopeEnd*/   1.0);
                                    if (this.songEqFiltersL.length <= i) this.songEqFiltersL[i] = new DynamicBiquadFilter();
                                    this.songEqFiltersL[i].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
                                    if (this.songEqFiltersR.length <= i) this.songEqFiltersR[i] = new DynamicBiquadFilter();
                                    this.songEqFiltersR[i].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
                                    eqFilterVolume *= startPoint.getVolumeCompensationMult();
                    
                                    }
                        this.songEqFilterCount = eqFilterSettings.controlPointCount;
                        eqFilterVolume = Math.min(3.0, eqFilterVolume);
                    }
        
                    let eqFilterVolumeStart: number = eqFilterVolume;
                let eqFilterVolumeEnd: number = eqFilterVolume;
        
                    this.songEqFilterVolume = eqFilterVolumeStart;
                this.songEqFilterVolumeDelta = (eqFilterVolumeEnd - eqFilterVolumeStart) / roundedSamplesPerTick;
            }

    public synthesize(outputDataL: Float32Array, outputDataR: Float32Array, outputBufferLength: number, playSong: boolean = true): void {
        if (this.song == null) {
            for (let i: number = 0; i < outputBufferLength; i++) {
                outputDataL[i] = 0.0;
                outputDataR[i] = 0.0;
            }
            this.deactivateAudio();
            return;
        }

        const song: Song = this.song;
        this.song.inVolumeCap = 0.0 // Reset volume cap for this run
        this.song.outVolumeCap = 0.0;
        this.song.outVolumeCapL = 0.0;
        this.song.outVolumeCapR = 0.0;

        let samplesPerTick: number = this.getSamplesPerTick();
        let ended: boolean = false;

        // Check the bounds of the playhead:
        if (this.tickSampleCountdown <= 0 || this.tickSampleCountdown > samplesPerTick) {
            this.tickSampleCountdown = samplesPerTick;
            this.isAtStartOfTick = true;
        }
        if (playSong) {
            if (this.beat >= song.beatsPerBar) {
                this.beat = 0;
                this.part = 0;
                this.tick = 0;
                this.tickSampleCountdown = samplesPerTick;
                this.isAtStartOfTick = true;

                this.prevBar = this.bar;
                this.bar = this.getNextBar();
                if (this.bar <= this.prevBar && this.loopRepeatCount > 0) this.loopRepeatCount--;

            }
            if (this.bar >= song.barCount) {
                this.bar = 0;
                if (this.loopRepeatCount != -1) {
                    ended = true;
                    this.pause();
                }
            }
        }

        //const synthStartTime: number = performance.now();

        this.syncSongState();

        if (this.tempInstrumentSampleBufferL == null || this.tempInstrumentSampleBufferL.length < outputBufferLength || this.tempInstrumentSampleBufferR == null || this.tempInstrumentSampleBufferR.length < outputBufferLength) {
            this.tempInstrumentSampleBufferL = new Float32Array(outputBufferLength);
            this.tempInstrumentSampleBufferR = new Float32Array(outputBufferLength);
        }

        // Post processing parameters:
        const volume: number = +this.volume;
        const limitDecay: number = 1.0 - Math.pow(0.5, this.song.limitDecay / this.samplesPerSecond);
        const limitRise: number = 1.0 - Math.pow(0.5, this.song.limitRise / this.samplesPerSecond);
        let limit: number = +this.limit;
        let skippedBars = [];
        let firstSkippedBufferIndex = -1;

        let bufferIndex: number = 0;
        while (bufferIndex < outputBufferLength && !ended) {

            this.nextBar = this.getNextBar();
            if (this.nextBar >= song.barCount) this.nextBar = null;

            const samplesLeftInBuffer: number = outputBufferLength - bufferIndex;
            const samplesLeftInTick: number = Math.ceil(this.tickSampleCountdown);
            const runLength: number = Math.min(samplesLeftInTick, samplesLeftInBuffer);
            const runEnd: number = bufferIndex + runLength;

            // Handle mod synth
            if (this.isPlayingSong || this.renderingSong) {

                // First modulation pass. Determines active tones.
                // Runs everything but Dot X/Y mods, to let them always come after morph.
                for (let channelIndex: number = song.pitchChannelCount + song.noiseChannelCount; channelIndex < song.getChannelCount(); channelIndex++) {
                    const channel: Channel = song.channels[channelIndex];
                    const channelState: ChannelState = this.channels[channelIndex];

                    this.determineCurrentActiveTones(song, channelIndex, samplesPerTick, playSong);
                    for (let instrumentIndex: number = 0; instrumentIndex < channel.instruments.length; instrumentIndex++) {
                        const instrumentState: InstrumentState = channelState.instruments[instrumentIndex];
                        for (let i: number = 0; i < instrumentState.activeModTones.count(); i++) {
                            const tone: Tone = instrumentState.activeModTones.get(i);
                            const channel: Channel = song.channels[channelIndex];
                            const instrument: Instrument = channel.instruments[tone.instrumentIndex];
                            let mod: number = Config.modCount - 1 - tone.pitches[0];

                            if ((instrument.modulators[mod] == Config.modulators.dictionary["pre eq"].index
                                || instrument.modulators[mod] == Config.modulators.dictionary["post eq"].index
                                || instrument.modulators[mod] == Config.modulators.dictionary["song eq"].index)
                                && instrument.modFilterTypes[mod] != null && instrument.modFilterTypes[mod] > 0) {
                                continue;
                            }
                            this.playModTone(song, channelIndex, samplesPerTick, bufferIndex, runLength, tone, false, false);
                        }
                    }
                }

                // Second modulation pass.
                // Only for Dot X/Y mods.
                for (let channelIndex: number = song.pitchChannelCount + song.noiseChannelCount; channelIndex < song.getChannelCount(); channelIndex++) {
                    const channel: Channel = song.channels[channelIndex];
                    const channelState: ChannelState = this.channels[channelIndex];

                    for (let instrumentIndex: number = 0; instrumentIndex < channel.instruments.length; instrumentIndex++) {
                        const instrumentState: InstrumentState = channelState.instruments[instrumentIndex];
                        for (let i: number = 0; i < instrumentState.activeModTones.count(); i++) {
                            const tone: Tone = instrumentState.activeModTones.get(i);
                            const channel: Channel = song.channels[channelIndex];
                            const instrument: Instrument = channel.instruments[tone.instrumentIndex];
                            let mod: number = Config.modCount - 1 - tone.pitches[0];

                            if ((instrument.modulators[mod] == Config.modulators.dictionary["pre eq"].index
                                || instrument.modulators[mod] == Config.modulators.dictionary["post eq"].index
                                || instrument.modulators[mod] == Config.modulators.dictionary["song eq"].index)
                                && instrument.modFilterTypes[mod] != null && instrument.modFilterTypes[mod] > 0) {

                                this.playModTone(song, channelIndex, samplesPerTick, bufferIndex, runLength, tone, false, false);
                            }

                        }
                    }
                }
            }

            // Handle next bar mods if they were set
            if (this.wantToSkip) {
                // Unable to continue, as we have skipped back to a previously visited bar without generating new samples, which means we are infinitely skipping.
                // In this case processing will return before the designated number of samples are processed. In other words, silence will be generated.
                let barVisited = skippedBars.includes(this.bar);
                if (barVisited && bufferIndex == firstSkippedBufferIndex) {
                    this.resetEffects();
                    this.pause();
                    return;
                }
                if (firstSkippedBufferIndex == -1) {
                    firstSkippedBufferIndex = bufferIndex;
                }
                if (!barVisited)
                    skippedBars.push(this.bar);
                this.wantToSkip = false;
                this.skipBar();
                continue;
            }

            this.computeSongState(samplesPerTick);

            for (let channelIndex: number = 0; channelIndex < song.pitchChannelCount + song.noiseChannelCount; channelIndex++) {
                const channel: Channel = song.channels[channelIndex];
                const channelState: ChannelState = this.channels[channelIndex];

                if (this.isAtStartOfTick) {
                    this.determineCurrentActiveTones(song, channelIndex, samplesPerTick, playSong && !this.countInMetronome);
                    this.determineLiveInputTones(song, channelIndex, samplesPerTick);
                }
                for (let instrumentIndex: number = 0; instrumentIndex < channel.instruments.length; instrumentIndex++) {
                    const instrument: Instrument = channel.instruments[instrumentIndex];
                    const instrumentState: InstrumentState = channelState.instruments[instrumentIndex];

                    if (this.isAtStartOfTick) {
                        let tonesPlayedInThisInstrument: number = instrumentState.activeTones.count() + instrumentState.liveInputTones.count();

                        for (let i: number = 0; i < instrumentState.releasedTones.count(); i++) {
                            const tone: Tone = instrumentState.releasedTones.get(i);
                            if (tone.ticksSinceReleased >= Math.abs(instrument.getFadeOutTicks())) {
                                this.freeReleasedTone(instrumentState, i);
                                i--;
                                continue;
                            }
                            const shouldFadeOutFast: boolean = (tonesPlayedInThisInstrument >= Config.maximumTonesPerChannel);
                            this.computeTone(song, channelIndex, samplesPerTick, tone, true, shouldFadeOutFast);
                            tonesPlayedInThisInstrument++;
                        }

                        if (instrumentState.awake) {
                            if (!instrumentState.computed) {
                                instrumentState.compute(this, instrument, samplesPerTick, Math.ceil(samplesPerTick), null, channelIndex, instrumentIndex);
                            }

                            instrumentState.computed = false;
                            instrumentState.envelopeComputer.clearEnvelopes();
                        }
                    }

                    for (let i: number = 0; i < instrumentState.activeTones.count(); i++) {
                        const tone: Tone = instrumentState.activeTones.get(i);
                        this.playTone(channelIndex, bufferIndex, runLength, tone);
                    }

                    for (let i: number = 0; i < instrumentState.liveInputTones.count(); i++) {
                        const tone: Tone = instrumentState.liveInputTones.get(i);
                        this.playTone(channelIndex, bufferIndex, runLength, tone);
                    }

                    for (let i: number = 0; i < instrumentState.releasedTones.count(); i++) {
                        const tone: Tone = instrumentState.releasedTones.get(i);
                        this.playTone(channelIndex, bufferIndex, runLength, tone);
                    }

                    if (instrumentState.awake) {
                        Synth.effectsSynth(this, outputDataL, outputDataR, bufferIndex, runLength, instrumentState);
                    }

                    // Update LFO time for instruments (used to be deterministic based on bar position but now vibrato/arp speed messes that up!)

                    const tickSampleCountdown: number = this.tickSampleCountdown;
                    const startRatio: number = 1.0 - (tickSampleCountdown) / samplesPerTick;
                    const endRatio: number = 1.0 - (tickSampleCountdown - runLength) / samplesPerTick;
                    const ticksIntoBar: number = (this.beat * Config.partsPerBeat + this.part) * Config.ticksPerPart + this.tick;
                    const partTimeTickStart: number = (ticksIntoBar) / Config.ticksPerPart;
                    const partTimeTickEnd: number = (ticksIntoBar + 1) / Config.ticksPerPart;
                    const partTimeStart: number = partTimeTickStart + (partTimeTickEnd - partTimeTickStart) * startRatio;
                    const partTimeEnd: number = partTimeTickStart + (partTimeTickEnd - partTimeTickStart) * endRatio;
                    let useVibratoSpeed: number = instrument.vibratoSpeed;

                    instrumentState.vibratoTime = instrumentState.nextVibratoTime;

                    //envelopeable vibrato speed?

                    if (this.isModActive(Config.modulators.dictionary["vibrato speed"].index, channelIndex, instrumentIndex)) {
                        useVibratoSpeed = this.getModValue(Config.modulators.dictionary["vibrato speed"].index, channelIndex, instrumentIndex);
                    }

                    if (useVibratoSpeed == 0) {
                        instrumentState.vibratoTime = 0;
                        instrumentState.nextVibratoTime = 0;
                    }
                    else {
                        instrumentState.nextVibratoTime += useVibratoSpeed * 0.1 * (partTimeEnd - partTimeStart);
                    }
                }
            }

            if (this.enableMetronome || this.countInMetronome) {
                if (this.part == 0) {
                    if (!this.startedMetronome) {
                        const midBeat: boolean = (song.beatsPerBar > 4 && (song.beatsPerBar % 2 == 0) && this.beat == song.beatsPerBar / 2);
                        const periods: number = (this.beat == 0) ? 8 : midBeat ? 6 : 4;
                        const hz: number = (this.beat == 0) ? 1600 : midBeat ? 1200 : 800;
                        const amplitude: number = (this.beat == 0) ? 0.06 : midBeat ? 0.05 : 0.04;
                        const samplesPerPeriod: number = this.samplesPerSecond / hz;
                        const radiansPerSample: number = Math.PI * 2.0 / samplesPerPeriod;
                        this.metronomeSamplesRemaining = Math.floor(samplesPerPeriod * periods);
                        this.metronomeFilter = 2.0 * Math.cos(radiansPerSample);
                        this.metronomeAmplitude = amplitude * Math.sin(radiansPerSample);
                        this.metronomePrevAmplitude = 0.0;

                        this.startedMetronome = true;
                    }
                    if (this.metronomeSamplesRemaining > 0) {
                        const stopIndex: number = Math.min(runEnd, bufferIndex + this.metronomeSamplesRemaining);
                        this.metronomeSamplesRemaining -= stopIndex - bufferIndex;
                        for (let i: number = bufferIndex; i < stopIndex; i++) {
                            outputDataL[i] += this.metronomeAmplitude;
                            outputDataR[i] += this.metronomeAmplitude;
                            const tempAmplitude: number = this.metronomeFilter * this.metronomeAmplitude - this.metronomePrevAmplitude;
                            this.metronomePrevAmplitude = this.metronomeAmplitude;
                            this.metronomeAmplitude = tempAmplitude;
                        }
                    }
                } else {
                    this.startedMetronome = false;
                }
            }

            // Post processing:
            for (let i: number = bufferIndex; i < runEnd; i++) {
                //Song EQ
                {
                    let filtersL = this.songEqFiltersL;
                    let filtersR = this.songEqFiltersR;
                    const filterCount = this.songEqFilterCount | 0;
                    let initialFilterInput1L = +this.initialSongEqFilterInput1L;
                    let initialFilterInput2L = +this.initialSongEqFilterInput2L;
                    let initialFilterInput1R = +this.initialSongEqFilterInput1R;
                    let initialFilterInput2R = +this.initialSongEqFilterInput2R;
                    const applyFilters = Synth.applyFilters;
                    let eqFilterVolume = +this.songEqFilterVolume;
                    const eqFilterVolumeDelta = +this.songEqFilterVolumeDelta;
                    const inputSampleL = outputDataL[i];
                    let sampleL = inputSampleL;
                    sampleL = applyFilters(sampleL, initialFilterInput1L, initialFilterInput2L, filterCount, filtersL);
                    initialFilterInput2L = initialFilterInput1L;
                    initialFilterInput1L = inputSampleL;
                    sampleL *= eqFilterVolume;
                    outputDataL[i] = sampleL;
                    const inputSampleR = outputDataR[i];
                    let sampleR = inputSampleR;
                    sampleR = applyFilters(sampleR, initialFilterInput1R, initialFilterInput2R, filterCount, filtersR);
                    initialFilterInput2R = initialFilterInput1R;
                    initialFilterInput1R = inputSampleR;
                    sampleR *= eqFilterVolume;
                    outputDataR[i] = sampleR;
                    eqFilterVolume += eqFilterVolumeDelta;
                    this.sanitizeFilters(filtersL);
                    // The filter input here is downstream from another filter so we
                        // better make sure it's safe too.
                        if (!(initialFilterInput1L < 100) || !(initialFilterInput2L < 100)) {
                                initialFilterInput1L = 0.0;
                                initialFilterInput2L = 0.0;
                            }
                    if (Math.abs(initialFilterInput1L) < epsilon) initialFilterInput1L = 0.0;
                    if (Math.abs(initialFilterInput2L) < epsilon) initialFilterInput2L = 0.0;
                    this.initialSongEqFilterInput1L = initialFilterInput1L;
                    this.initialSongEqFilterInput2L = initialFilterInput2L;
                    this.sanitizeFilters(filtersR);
                    if (!(initialFilterInput1R < 100) || !(initialFilterInput2R < 100)) {
                            initialFilterInput1R = 0.0;
                            initialFilterInput2R = 0.0;
                        }
                    if (Math.abs(initialFilterInput1R) < epsilon) initialFilterInput1R = 0.0;
                    if (Math.abs(initialFilterInput2R) < epsilon) initialFilterInput2R = 0.0;
                    this.initialSongEqFilterInput1R = initialFilterInput1R;
                    this.initialSongEqFilterInput2R = initialFilterInput2R;
                }

                // A compressor/limiter.
                const sampleL = outputDataL[i] * song.masterGain * song.masterGain;
                const sampleR = outputDataR[i] * song.masterGain * song.masterGain;
                const absL: number = sampleL < 0.0 ? -sampleL : sampleL;
                const absR: number = sampleR < 0.0 ? -sampleR : sampleR;
                const abs: number = absL > absR ? absL : absR;
                this.song.inVolumeCap = (this.song.inVolumeCap > abs ? this.song.inVolumeCap : abs); // Analytics, spit out raw input volume
                // Determines which formula to use. 0 when volume is between [0, compressionThreshold], 1 when between (compressionThreshold, limitThreshold], 2 above
                const limitRange: number = (+(abs > song.compressionThreshold)) + (+(abs > song.limitThreshold));
                // Determine the target amplification based on the range of the curve
                const limitTarget: number =
                    (+(limitRange == 0)) * (((abs + 1 - song.compressionThreshold) * 0.8 + 0.25) * song.compressionRatio + 1.05 * (1 - song.compressionRatio))
                    + (+(limitRange == 1)) * (1.05)
                    + (+(limitRange == 2)) * (1.05 * ((abs + 1 - song.limitThreshold) * song.limitRatio + (1 - song.limitThreshold)));
                // Move the limit towards the target
                limit += ((limitTarget - limit) * (limit < limitTarget ? limitRise : limitDecay));
                const limitedVolume = volume / (limit >= 1 ? limit * 1.05 : limit * 0.8 + 0.25);
                outputDataL[i] = sampleL * limitedVolume;
                outputDataR[i] = sampleR * limitedVolume;

                this.song.outVolumeCap = (this.song.outVolumeCap > abs * limitedVolume ? this.song.outVolumeCap : abs * limitedVolume); // Analytics, spit out limited output volume
                this.song.outVolumeCapL = (this.song.outVolumeCapL > absL * limitedVolume ? this.song.outVolumeCapL : absL * limitedVolume);
                this.song.outVolumeCapR = (this.song.outVolumeCapR > absR * limitedVolume ? this.song.outVolumeCapR : absR * limitedVolume);
            }

            bufferIndex += runLength;

            this.isAtStartOfTick = false;
            this.tickSampleCountdown -= runLength;
            if (this.tickSampleCountdown <= 0) {
                this.isAtStartOfTick = true;

                // Track how long tones have been released, and free them if there are too many.
                // Also reset awake InstrumentStates that didn't have any Tones during this tick.
                for (const channelState of this.channels) {
                    for (const instrumentState of channelState.instruments) {
                        for (let i: number = 0; i < instrumentState.releasedTones.count(); i++) {
                            const tone: Tone = instrumentState.releasedTones.get(i);
                            if (tone.isOnLastTick) {
                                this.freeReleasedTone(instrumentState, i);
                                i--;
                            } else {
                                tone.ticksSinceReleased++;
                            }
                        }
                        if (instrumentState.deactivateAfterThisTick) {
                            instrumentState.deactivate();
                        }
                        instrumentState.tonesAddedInThisTick = false;
                    }
                }
                const ticksIntoBar: number = this.getTicksIntoBar();
                const tickTimeStart: number = ticksIntoBar;
                const secondsPerTick: number = samplesPerTick / this.samplesPerSecond;
                const currentPart: number = this.getCurrentPart();
                for (let channel: number = 0; channel < this.song.pitchChannelCount + this.song.noiseChannelCount; channel++) {
                    for (let instrumentIdx: number = 0; instrumentIdx < this.song.channels[channel].instruments.length; instrumentIdx++) {
                        let instrument: Instrument = this.song.channels[channel].instruments[instrumentIdx];
                        let instrumentState: InstrumentState = this.channels[channel].instruments[instrumentIdx];

                        // Update envelope time, which is used to calculate (all envelopes') position
                        const envelopeComputer: EnvelopeComputer = instrumentState.envelopeComputer;
                        const envelopeSpeeds: number[] = [];
                        for (let i: number = 0; i < Config.maxEnvelopeCount; i++) {
                            envelopeSpeeds[i] = 0;
                        }
                        for (let envelopeIndex: number = 0; envelopeIndex < instrument.envelopeCount; envelopeIndex++) {
                            let useEnvelopeSpeed: number = instrument.envelopeSpeed;
                            let perEnvelopeSpeed: number = instrument.envelopes[envelopeIndex].perEnvelopeSpeed;
                            if (this.isModActive(Config.modulators.dictionary["individual envelope speed"].index, channel, instrumentIdx) && instrument.envelopes[envelopeIndex].tempEnvelopeSpeed != null) {
                                perEnvelopeSpeed = instrument.envelopes[envelopeIndex].tempEnvelopeSpeed!;
                            }
                            if (this.isModActive(Config.modulators.dictionary["envelope speed"].index, channel, instrumentIdx)) {
                                useEnvelopeSpeed = Math.max(0, Math.min(Config.arpSpeedScale.length - 1, this.getModValue(Config.modulators.dictionary["envelope speed"].index, channel, instrumentIdx, false)));
                                if (Number.isInteger(useEnvelopeSpeed)) {
                                    instrumentState.envelopeTime[envelopeIndex] += Config.arpSpeedScale[useEnvelopeSpeed] * perEnvelopeSpeed;
                                } else {
                                    // Linear interpolate envelope values
                                    instrumentState.envelopeTime[envelopeIndex] += ((1 - (useEnvelopeSpeed % 1)) * Config.arpSpeedScale[Math.floor(useEnvelopeSpeed)] + (useEnvelopeSpeed % 1) * Config.arpSpeedScale[Math.ceil(useEnvelopeSpeed)]) * perEnvelopeSpeed;
                                }
                            }
                            else {
                                instrumentState.envelopeTime[envelopeIndex] += Config.arpSpeedScale[useEnvelopeSpeed] * perEnvelopeSpeed;
                            }
                        }

                        if (instrumentState.activeTones.count() > 0) {
                            const tone: Tone = instrumentState.activeTones.get(0);
                            envelopeComputer.computeEnvelopes(instrument, currentPart, instrumentState.envelopeTime, tickTimeStart, secondsPerTick, tone, envelopeSpeeds, instrumentState, this, channel, instrumentIdx);
                        }
                        const envelopeStarts: number[] = envelopeComputer.envelopeStarts;
                        //const envelopeEnds: number[] = envelopeComputer.envelopeEnds;

                        // Update arpeggio time, which is used to calculate arpeggio position
                        const arpEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.arpeggioSpeed]; //only discrete for now
                        //const arpEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.arpeggioSpeed];
                        let useArpeggioSpeed: number = instrument.arpeggioSpeed;
                        if (this.isModActive(Config.modulators.dictionary["arp speed"].index, channel, instrumentIdx)) {
                            useArpeggioSpeed = clamp(0, Config.arpSpeedScale.length, arpEnvelopeStart * this.getModValue(Config.modulators.dictionary["arp speed"].index, channel, instrumentIdx, false));
                            if (Number.isInteger(useArpeggioSpeed)) {
                                instrumentState.arpTime += Config.arpSpeedScale[useArpeggioSpeed];
                            } else {
                                // Linear interpolate arpeggio values
                                instrumentState.arpTime += (1 - (useArpeggioSpeed % 1)) * Config.arpSpeedScale[Math.floor(useArpeggioSpeed)] + (useArpeggioSpeed % 1) * Config.arpSpeedScale[Math.ceil(useArpeggioSpeed)];
                            }
                        }
                        else {
                            useArpeggioSpeed = clamp(0, Config.arpSpeedScale.length, arpEnvelopeStart * useArpeggioSpeed);
                            if (Number.isInteger(useArpeggioSpeed)) {
                                instrumentState.arpTime += Config.arpSpeedScale[useArpeggioSpeed];
                            } else {
                                // Linear interpolate arpeggio values
                                instrumentState.arpTime += (1 - (useArpeggioSpeed % 1)) * Config.arpSpeedScale[Math.floor(useArpeggioSpeed)] + (useArpeggioSpeed % 1) * Config.arpSpeedScale[Math.ceil(useArpeggioSpeed)];
                            }
                        }
                        envelopeComputer.clearEnvelopes();

                    }
                }

                // Update next-used filters after each run
                for (let channel: number = 0; channel < this.song.pitchChannelCount + this.song.noiseChannelCount; channel++) {
                    for (let instrumentIdx: number = 0; instrumentIdx < this.song.channels[channel].instruments.length; instrumentIdx++) {
                        let instrument: Instrument = this.song.channels[channel].instruments[instrumentIdx];
                        for (let effectIdx: number = 0; effectIdx < instrument.effects.length; effectIdx++) {
                            let effect: Effect = instrument.effects[effectIdx] as Effect;
                            if (effect.tmpEqFilterEnd != null) {
                                effect.tmpEqFilterStart = effect.tmpEqFilterEnd;
                            } else {
                                effect.tmpEqFilterStart = effect.eqFilter;
                            }
                        }
                        if (instrument.tmpNoteFilterEnd != null) {
                            instrument.tmpNoteFilterStart = instrument.tmpNoteFilterEnd;
                        } else {
                            instrument.tmpNoteFilterStart = instrument.noteFilter;
                        }
                    }
                }
                if (song.tmpEqFilterEnd != null) {
                    song.tmpEqFilterStart = song.tmpEqFilterEnd;
                } else {
                    song.tmpEqFilterStart = song.eqFilter;
                }

                this.tick++;
                this.tickSampleCountdown += samplesPerTick;
                if (this.tick == Config.ticksPerPart) {
                    this.tick = 0;
                    this.part++;
                    this.liveInputDuration--;
                    this.liveBassInputDuration--;
                    // Decrement held modulator counters after each run
                    for (let i: number = 0; i < this.heldMods.length; i++) {
                        this.heldMods[i].holdFor--;
                        if (this.heldMods[i].holdFor <= 0) {
                            this.heldMods.splice(i, 1);
                        }
                    }

                    if (this.part == Config.partsPerBeat) {
                        this.part = 0;

                        if (playSong) {
                            this.beat++;
                            if (this.beat == song.beatsPerBar) {
                                // bar changed, reset for next bar:
                                this.beat = 0;

                                if (this.countInMetronome) {
                                    this.countInMetronome = false;
                                } else {
                                    this.prevBar = this.bar;
                                    this.bar = this.getNextBar();
                                    if (this.bar <= this.prevBar && this.loopRepeatCount > 0) this.loopRepeatCount--;

                                    if (this.bar >= song.barCount) {
                                        this.bar = 0;
                                        if (this.loopRepeatCount != -1) {
                                            ended = true;
                                            this.resetEffects();
                                            this.pause();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Update mod values so that next values copy to current values
            for (let setting: number = 0; setting < Config.modulators.length; setting++) {
                if (this.nextModValues != null && this.nextModValues[setting] != null)
                    this.modValues[setting] = this.nextModValues[setting];
            }

            // Set samples per tick if song tempo mods changed it
            if (this.isModActive(Config.modulators.dictionary["tempo"].index)) {
                samplesPerTick = this.getSamplesPerTick();
                this.tickSampleCountdown = Math.min(this.tickSampleCountdown, samplesPerTick);
            }

            // Bound LFO times to be within their period (to keep values from getting large)
            // I figured this modulo math probably doesn't have to happen every LFO tick.
            for (let channelIndex: number = 0; channelIndex < this.song.pitchChannelCount + this.song.noiseChannelCount; channelIndex++) {
                for (let instrumentIndex = 0; instrumentIndex < this.channels[channelIndex].instruments.length; instrumentIndex++) {
                    const instrumentState: InstrumentState = this.channels[channelIndex].instruments[instrumentIndex];
                    const instrument: Instrument = this.song.channels[channelIndex].instruments[instrumentIndex];
                    instrumentState.nextVibratoTime = (instrumentState.nextVibratoTime % (Config.vibratoTypes[instrument.vibratoType].period / (Config.ticksPerPart * samplesPerTick / this.samplesPerSecond)));
                    instrumentState.arpTime = (instrumentState.arpTime % (2520 * Config.ticksPerArpeggio)); // 2520 = LCM of 4, 5, 6, 7, 8, 9 (arp sizes)
                    for (let envelopeIndex: number = 0; envelopeIndex < instrument.envelopeCount; envelopeIndex++) {
                        instrumentState.envelopeTime[envelopeIndex] = (instrumentState.envelopeTime[envelopeIndex] % (Config.partsPerBeat * Config.ticksPerPart * this.song.beatsPerBar));
                    }
                }
            }

            const maxInstrumentsPerChannel = this.song.getMaxInstrumentsPerChannel();
            for (let setting: number = 0; setting < Config.modulators.length; setting++) {
                for (let channel: number = 0; channel < this.song.pitchChannelCount + this.song.noiseChannelCount; channel++) {
                    for (let instrument: number = 0; instrument < maxInstrumentsPerChannel; instrument++) {
                        if (this.nextModInsValues != null && this.nextModInsValues[channel] != null && this.nextModInsValues[channel][instrument] != null && this.nextModInsValues[channel][instrument][setting] != null) {
                            this.modInsValues[channel][instrument][setting] = this.nextModInsValues[channel][instrument][setting];
                        }
                    }
                }
            }
        }

        // Optimization: Avoid persistent reverb values in the float denormal range.
        if (!Number.isFinite(limit) || Math.abs(limit) < epsilon) limit = 0.0;
        this.limit = limit;

        if (playSong && !this.countInMetronome) {
            this.playheadInternal = (((this.tick + 1.0 - this.tickSampleCountdown / samplesPerTick) / 2.0 + this.part) / Config.partsPerBeat + this.beat) / song.beatsPerBar + this.bar;
        }

        /*
        const synthDuration: number = performance.now() - synthStartTime;
        // Performance measurements:
        samplesAccumulated += outputBufferLength;
        samplePerformance += synthDuration;
    	
        if (samplesAccumulated >= 44100 * 4) {
            const secondsGenerated = samplesAccumulated / 44100;
            const secondsRequired = samplePerformance / 1000;
            const ratio = secondsRequired / secondsGenerated;
            console.log(ratio);
            samplePerformance = 0;
            samplesAccumulated = 0;
        }
        */
    }

    private freeTone(tone: Tone): void {
        this.tonePool.pushBack(tone);
    }

    private newTone(): Tone {
        if (this.tonePool.count() > 0) {
            const tone: Tone = this.tonePool.popBack();
            tone.freshlyAllocated = true;
            return tone;
        }
        return new Tone();
    }

    private releaseTone(instrumentState: InstrumentState, tone: Tone): void {
        instrumentState.releasedTones.pushFront(tone);
        tone.atNoteStart = false;
        tone.passedEndOfNote = true;
    }

    private freeReleasedTone(instrumentState: InstrumentState, toneIndex: number): void {
        this.freeTone(instrumentState.releasedTones.get(toneIndex));
        instrumentState.releasedTones.remove(toneIndex);
    }

    public freeAllTones(): void {
        for (const channelState of this.channels) {
            for (const instrumentState of channelState.instruments) {
                while (instrumentState.activeTones.count() > 0) this.freeTone(instrumentState.activeTones.popBack());
                while (instrumentState.activeModTones.count() > 0) this.freeTone(instrumentState.activeModTones.popBack());
                while (instrumentState.releasedTones.count() > 0) this.freeTone(instrumentState.releasedTones.popBack());
                while (instrumentState.liveInputTones.count() > 0) this.freeTone(instrumentState.liveInputTones.popBack());
            }
        }
    }

    private determineLiveInputTones(song: Song, channelIndex: number, samplesPerTick: number): void {
        const channel: Channel = song.channels[channelIndex];
        const channelState: ChannelState = this.channels[channelIndex];
        const pitches: number[] = this.liveInputPitches;
        const bassPitches: number[] = this.liveBassInputPitches;

        if (this.liveInputPitches.length > 0 || this.liveBassInputPitches.length > 0) {
            this.computeLatestModValues();
        }

        for (let instrumentIndex: number = 0; instrumentIndex < channel.instruments.length; instrumentIndex++) {
            const instrumentState: InstrumentState = channelState.instruments[instrumentIndex];
            const toneList: Deque<Tone> = instrumentState.liveInputTones;
            let toneCount: number = 0;
            if (this.liveInputDuration > 0 && (channelIndex == this.liveInputChannel) && pitches.length > 0 && this.liveInputInstruments.indexOf(instrumentIndex) != -1) {
                const instrument: Instrument = channel.instruments[instrumentIndex];

                if (instrument.getChord().singleTone) {
                    let tone: Tone;
                    if (toneList.count() <= toneCount) {
                        tone = this.newTone();
                        toneList.pushBack(tone);
                    } else if (!instrument.getTransition().isSeamless && this.liveInputStarted) {
                        this.releaseTone(instrumentState, toneList.get(toneCount));
                        tone = this.newTone();
                        toneList.set(toneCount, tone);
                    } else {
                        tone = toneList.get(toneCount);
                    }
                    toneCount++;

                    for (let i: number = 0; i < pitches.length; i++) {
                        tone.pitches[i] = pitches[i];
                    }
                    tone.pitchCount = pitches.length;
                    tone.chordSize = 1;
                    tone.instrumentIndex = instrumentIndex;
                    tone.note = tone.prevNote = tone.nextNote = null;
                    tone.atNoteStart = this.liveInputStarted;
                    tone.forceContinueAtStart = false;
                    tone.forceContinueAtEnd = false;
                    this.computeTone(song, channelIndex, samplesPerTick, tone, false, false);
                } else {
                    //const transition: Transition = instrument.getTransition();

                    this.moveTonesIntoOrderedTempMatchedList(toneList, pitches);

                    for (let i: number = 0; i < pitches.length; i++) {
                        //const strumOffsetParts: number = i * instrument.getChord().strumParts;

                        let tone: Tone;
                        if (this.tempMatchedPitchTones[toneCount] != null) {
                            tone = this.tempMatchedPitchTones[toneCount]!;
                            this.tempMatchedPitchTones[toneCount] = null;
                            if (tone.pitchCount != 1 || tone.pitches[0] != pitches[i]) {
                                this.releaseTone(instrumentState, tone);
                                tone = this.newTone();
                            }
                            toneList.pushBack(tone);
                        } else {
                            tone = this.newTone();
                            toneList.pushBack(tone);
                        }
                        toneCount++;

                        tone.pitches[0] = pitches[i];
                        tone.pitchCount = 1;
                        tone.chordSize = pitches.length;
                        tone.instrumentIndex = instrumentIndex;
                        tone.note = tone.prevNote = tone.nextNote = null;
                        tone.atNoteStart = this.liveInputStarted;
                        tone.forceContinueAtStart = false;
                        tone.forceContinueAtEnd = false;
                        this.computeTone(song, channelIndex, samplesPerTick, tone, false, false);
                    }
                }
            }

            if (this.liveBassInputDuration > 0 && (channelIndex == this.liveBassInputChannel) && bassPitches.length > 0 && this.liveBassInputInstruments.indexOf(instrumentIndex) != -1) {
                const instrument: Instrument = channel.instruments[instrumentIndex];

                if (instrument.getChord().singleTone) {
                    let tone: Tone;
                    if (toneList.count() <= toneCount) {
                        tone = this.newTone();
                        toneList.pushBack(tone);
                    } else if (!instrument.getTransition().isSeamless && this.liveInputStarted) {
                        this.releaseTone(instrumentState, toneList.get(toneCount));
                        tone = this.newTone();
                        toneList.set(toneCount, tone);
                    } else {
                        tone = toneList.get(toneCount);
                    }
                    toneCount++;

                    for (let i: number = 0; i < bassPitches.length; i++) {
                        tone.pitches[i] = bassPitches[i];
                    }
                    tone.pitchCount = bassPitches.length;
                    tone.chordSize = 1;
                    tone.instrumentIndex = instrumentIndex;
                    tone.note = tone.prevNote = tone.nextNote = null;
                    tone.atNoteStart = this.liveBassInputStarted;
                    tone.forceContinueAtStart = false;
                    tone.forceContinueAtEnd = false;
                    this.computeTone(song, channelIndex, samplesPerTick, tone, false, false);
                } else {
                    //const transition: Transition = instrument.getTransition();

                    this.moveTonesIntoOrderedTempMatchedList(toneList, bassPitches);

                    for (let i: number = 0; i < bassPitches.length; i++) {
                        //const strumOffsetParts: number = i * instrument.getChord().strumParts;

                        let tone: Tone;
                        if (this.tempMatchedPitchTones[toneCount] != null) {
                            tone = this.tempMatchedPitchTones[toneCount]!;
                            this.tempMatchedPitchTones[toneCount] = null;
                            if (tone.pitchCount != 1 || tone.pitches[0] != bassPitches[i]) {
                                this.releaseTone(instrumentState, tone);
                                tone = this.newTone();
                            }
                            toneList.pushBack(tone);
                        } else {
                            tone = this.newTone();
                            toneList.pushBack(tone);
                        }
                        toneCount++;

                        tone.pitches[0] = bassPitches[i];
                        tone.pitchCount = 1;
                        tone.chordSize = bassPitches.length;
                        tone.instrumentIndex = instrumentIndex;
                        tone.note = tone.prevNote = tone.nextNote = null;
                        tone.atNoteStart = this.liveBassInputStarted;
                        tone.forceContinueAtStart = false;
                        tone.forceContinueAtEnd = false;
                        this.computeTone(song, channelIndex, samplesPerTick, tone, false, false);
                    }
                }
            }

            while (toneList.count() > toneCount) {
                this.releaseTone(instrumentState, toneList.popBack());
            }

            this.clearTempMatchedPitchTones(toneCount, instrumentState);
        }

        this.liveInputStarted = false;
        this.liveBassInputStarted = false;
    }

    // Returns the chord type of the instrument in the adjacent pattern if it is compatible for a
    // seamless transition across patterns, otherwise returns null.
    private adjacentPatternHasCompatibleInstrumentTransition(song: Song, channel: Channel, pattern: Pattern, otherPattern: Pattern, instrumentIndex: number, transition: Transition, chord: Chord, note: Note, otherNote: Note, forceContinue: boolean): Chord | null {
        if (song.patternInstruments && otherPattern.instruments.indexOf(instrumentIndex) == -1) {
            // The adjacent pattern does not contain the same instrument as the current pattern.

            if (pattern.instruments.length > 1 || otherPattern.instruments.length > 1) {
                // The current or adjacent pattern contains more than one instrument, don't bother
                // trying to connect them.
                return null;
            }
            // Otherwise, the two patterns each contain one instrument, but not the same instrument.
            // Try to connect them.
            const otherInstrument: Instrument = channel.instruments[otherPattern.instruments[0]];

            if (forceContinue) {
                // Even non-seamless instruments can be connected across patterns if forced.
                return otherInstrument.getChord();
            }

            // Otherwise, check that both instruments are seamless across patterns.
            const otherTransition: Transition = otherInstrument.getTransition();
            if (transition.includeAdjacentPatterns && otherTransition.includeAdjacentPatterns && otherTransition.slides == transition.slides) {
                return otherInstrument.getChord();
            } else {
                return null;
            }
        } else {
            // If both patterns contain the same instrument, check that it is seamless across patterns.
            return (forceContinue || transition.includeAdjacentPatterns) ? chord : null;
        }
    }

    public static adjacentNotesHaveMatchingPitches(firstNote: Note, secondNote: Note): boolean {
        if (firstNote.pitches.length != secondNote.pitches.length) return false;
        const firstNoteInterval: number = firstNote.pins[firstNote.pins.length - 1].interval;
        for (const pitch of firstNote.pitches) {
            if (secondNote.pitches.indexOf(pitch + firstNoteInterval) == -1) return false;
        }
        return true;
    }

    private moveTonesIntoOrderedTempMatchedList(toneList: Deque<Tone>, notePitches: number[]): void {
        // The tones are about to seamlessly transition to a new note. The pitches
        // from the old note may or may not match any of the pitches in the new
        // note, and not necessarily in order, but if any do match, they'll sound
        // better if those tones continue to have the same pitch. Attempt to find
        // the right spot for each old tone in the new chord if possible.

        for (let i: number = 0; i < toneList.count(); i++) {
            const tone: Tone = toneList.get(i);
            const pitch: number = tone.pitches[0] + tone.lastInterval;
            for (let j: number = 0; j < notePitches.length; j++) {
                if (notePitches[j] == pitch) {
                    this.tempMatchedPitchTones[j] = tone;
                    toneList.remove(i);
                    i--;
                    break;
                }
            }
        }

        // Any tones that didn't get matched should just fill in the gaps.
        while (toneList.count() > 0) {
            const tone: Tone = toneList.popFront();
            for (let j: number = 0; j < this.tempMatchedPitchTones.length; j++) {
                if (this.tempMatchedPitchTones[j] == null) {
                    this.tempMatchedPitchTones[j] = tone;
                    break;
                }
            }
        }
    }

    private determineCurrentActiveTones(song: Song, channelIndex: number, samplesPerTick: number, playSong: boolean): void {
        const channel: Channel = song.channels[channelIndex];
        const channelState: ChannelState = this.channels[channelIndex];
        const pattern: Pattern | null = song.getPattern(channelIndex, this.bar);
        const currentPart: number = this.getCurrentPart();
        const currentTick: number = this.tick + Config.ticksPerPart * currentPart;

        if (playSong && song.getChannelIsMod(channelIndex)) {

            // For mod channels, notes aren't strictly arranged chronologically. Also, each pitch value could play or not play at a given time. So... a bit more computation involved!
            // The same transition logic should apply though, even though it isn't really used by mod channels.
            let notes: (Note | null)[] = [];
            let prevNotes: (Note | null)[] = [];
            let nextNotes: (Note | null)[] = [];
            let fillCount: number = Config.modCount;
            while (fillCount--) {
                notes.push(null);
                prevNotes.push(null);
                nextNotes.push(null);
            }

            if (pattern != null && !channel.muted) {
                for (let i: number = 0; i < pattern.notes.length; i++) {
                    if (pattern.notes[i].end <= currentPart) {
                        // Actually need to check which note starts closer to the start of this note.
                        if (prevNotes[pattern.notes[i].pitches[0]] == null || pattern.notes[i].end > (prevNotes[pattern.notes[i].pitches[0]] as Note).start) {
                            prevNotes[pattern.notes[i].pitches[0]] = pattern.notes[i];
                        }
                    }
                    else if (pattern.notes[i].start <= currentPart && pattern.notes[i].end > currentPart) {
                        notes[pattern.notes[i].pitches[0]] = pattern.notes[i];
                    }
                    else if (pattern.notes[i].start > currentPart) {
                        // Actually need to check which note starts closer to the end of this note.
                        if (nextNotes[pattern.notes[i].pitches[0]] == null || pattern.notes[i].start < (nextNotes[pattern.notes[i].pitches[0]] as Note).start) {
                            nextNotes[pattern.notes[i].pitches[0]] = pattern.notes[i];
                        }
                    }
                }
            }

            let modToneCount: number = 0;
            const newInstrumentIndex: number = (song.patternInstruments && (pattern != null)) ? pattern!.instruments[0] : 0;
            const instrumentState: InstrumentState = channelState.instruments[newInstrumentIndex];
            const toneList: Deque<Tone> = instrumentState.activeModTones;
            for (let mod: number = 0; mod < Config.modCount; mod++) {
                if (notes[mod] != null) {
                    if (prevNotes[mod] != null && (prevNotes[mod] as Note).end != (notes[mod] as Note).start) prevNotes[mod] = null;
                    if (nextNotes[mod] != null && (nextNotes[mod] as Note).start != (notes[mod] as Note).end) nextNotes[mod] = null;

                }

                if (channelState.singleSeamlessInstrument != null && channelState.singleSeamlessInstrument != newInstrumentIndex && channelState.singleSeamlessInstrument < channelState.instruments.length) {
                    const sourceInstrumentState: InstrumentState = channelState.instruments[channelState.singleSeamlessInstrument];
                    const destInstrumentState: InstrumentState = channelState.instruments[newInstrumentIndex];
                    while (sourceInstrumentState.activeModTones.count() > 0) {
                        destInstrumentState.activeModTones.pushFront(sourceInstrumentState.activeModTones.popBack());
                    }
                }
                channelState.singleSeamlessInstrument = newInstrumentIndex;

                if (notes[mod] != null) {
                    let prevNoteForThisInstrument: Note | null = prevNotes[mod];
                    let nextNoteForThisInstrument: Note | null = nextNotes[mod];

                    let forceContinueAtStart: boolean = false;
                    let forceContinueAtEnd: boolean = false;
                    const atNoteStart: boolean = (Config.ticksPerPart * notes[mod]!.start == currentTick) && this.isAtStartOfTick;
                    let tone: Tone;
                    if (toneList.count() <= modToneCount) {
                        tone = this.newTone();
                        toneList.pushBack(tone);
                    } else if (atNoteStart && (prevNoteForThisInstrument == null)) {
                        const oldTone: Tone = toneList.get(modToneCount);
                        if (oldTone.isOnLastTick) {
                            this.freeTone(oldTone);
                        } else {
                            this.releaseTone(instrumentState, oldTone);
                        }
                        tone = this.newTone();
                        toneList.set(modToneCount, tone);
                    } else {
                        tone = toneList.get(modToneCount);
                    }
                    modToneCount++;

                    for (let i: number = 0; i < notes[mod]!.pitches.length; i++) {
                        tone.pitches[i] = notes[mod]!.pitches[i];
                    }
                    tone.pitchCount = notes[mod]!.pitches.length;
                    tone.chordSize = 1;
                    tone.instrumentIndex = newInstrumentIndex;
                    tone.note = notes[mod];
                    tone.noteStartPart = notes[mod]!.start;
                    tone.noteEndPart = notes[mod]!.end;
                    tone.prevNote = prevNoteForThisInstrument;
                    tone.nextNote = nextNoteForThisInstrument;
                    tone.prevNotePitchIndex = 0;
                    tone.nextNotePitchIndex = 0;
                    tone.atNoteStart = atNoteStart;
                    tone.passedEndOfNote = false;
                    tone.forceContinueAtStart = forceContinueAtStart;
                    tone.forceContinueAtEnd = forceContinueAtEnd;
                }
            }
            // Automatically free or release seamless tones if there's no new note to take over.
            while (toneList.count() > modToneCount) {
                const tone: Tone = toneList.popBack();
                const channel: Channel = song.channels[channelIndex];
                if (tone.instrumentIndex < channel.instruments.length && !tone.isOnLastTick) {
                    const instrumentState: InstrumentState = this.channels[channelIndex].instruments[tone.instrumentIndex];
                    this.releaseTone(instrumentState, tone);
                } else {
                    this.freeTone(tone);
                }
            }

        }
        else if (!song.getChannelIsMod(channelIndex)) {

            let note: Note | null = null;
            let prevNote: Note | null = null;
            let nextNote: Note | null = null;

            if (playSong && pattern != null && !channel.muted && (!this.isRecording || this.liveInputChannel != channelIndex)) {
                for (let i: number = 0; i < pattern.notes.length; i++) {
                    if (pattern.notes[i].end <= currentPart) {
                        prevNote = pattern.notes[i];
                    } else if (pattern.notes[i].start <= currentPart && pattern.notes[i].end > currentPart) {
                        note = pattern.notes[i];
                    } else if (pattern.notes[i].start > currentPart) {
                        nextNote = pattern.notes[i];
                        break;
                    }
                }

                if (note != null) {
                    if (prevNote != null && prevNote.end != note.start) prevNote = null;
                    if (nextNote != null && nextNote.start != note.end) nextNote = null;
                }
            }

            // Seamless tones from a pattern with a single instrument can be transferred to a different single seamless instrument in the next pattern.
            if (pattern != null && (!song.layeredInstruments || channel.instruments.length == 1 || (song.patternInstruments && pattern.instruments.length == 1))) {
                const newInstrumentIndex: number = song.patternInstruments ? pattern.instruments[0] : 0;
                if (channelState.singleSeamlessInstrument != null && channelState.singleSeamlessInstrument != newInstrumentIndex && channelState.singleSeamlessInstrument < channelState.instruments.length) {
                    const sourceInstrumentState: InstrumentState = channelState.instruments[channelState.singleSeamlessInstrument];
                    const destInstrumentState: InstrumentState = channelState.instruments[newInstrumentIndex];
                    while (sourceInstrumentState.activeTones.count() > 0) {
                        destInstrumentState.activeTones.pushFront(sourceInstrumentState.activeTones.popBack());
                    }
                }
                channelState.singleSeamlessInstrument = newInstrumentIndex;
            } else {
                channelState.singleSeamlessInstrument = null;
            }

            for (let instrumentIndex: number = 0; instrumentIndex < channel.instruments.length; instrumentIndex++) {
                const instrumentState: InstrumentState = channelState.instruments[instrumentIndex];
                const toneList: Deque<Tone> = instrumentState.activeTones;
                let toneCount: number = 0;
                if ((note != null) && (!song.patternInstruments || (pattern!.instruments.indexOf(instrumentIndex) != -1))) {
                    const instrument: Instrument = channel.instruments[instrumentIndex];
                    let prevNoteForThisInstrument: Note | null = prevNote;
                    let nextNoteForThisInstrument: Note | null = nextNote;

                    const partsPerBar: Number = Config.partsPerBeat * song.beatsPerBar;
                    const transition: Transition = instrument.getTransition();
                    const chord: Chord = instrument.getChord();
                    let forceContinueAtStart: boolean = false;
                    let forceContinueAtEnd: boolean = false;
                    let tonesInPrevNote: number = 0;
                    let tonesInNextNote: number = 0;
                    if (note.start == 0) {
                        // If the beginning of the note coincides with the beginning of the pattern,
                        let prevPattern: Pattern | null = (this.prevBar == null) ? null : song.getPattern(channelIndex, this.prevBar);
                        if (prevPattern != null) {
                            const lastNote: Note | null = (prevPattern.notes.length <= 0) ? null : prevPattern.notes[prevPattern.notes.length - 1];
                            if (lastNote != null && lastNote.end == partsPerBar) {
                                const patternForcesContinueAtStart: boolean = note.continuesLastPattern && Synth.adjacentNotesHaveMatchingPitches(lastNote, note);
                                const chordOfCompatibleInstrument: Chord | null = this.adjacentPatternHasCompatibleInstrumentTransition(song, channel, pattern!, prevPattern, instrumentIndex, transition, chord, note, lastNote, patternForcesContinueAtStart);
                                if (chordOfCompatibleInstrument != null) {
                                    prevNoteForThisInstrument = lastNote;
                                    tonesInPrevNote = chordOfCompatibleInstrument.singleTone ? 1 : prevNoteForThisInstrument.pitches.length
                                    forceContinueAtStart = patternForcesContinueAtStart;
                                }
                            }
                        }
                    } else if (prevNoteForThisInstrument != null) {
                        tonesInPrevNote = chord.singleTone ? 1 : prevNoteForThisInstrument.pitches.length
                    }
                    if (note.end == partsPerBar) {
                        // If the end of the note coincides with the end of the pattern, look for an
                        // adjacent note at the beginning of the next pattern.
                        let nextPattern: Pattern | null = (this.nextBar == null) ? null : song.getPattern(channelIndex, this.nextBar);
                        if (nextPattern != null) {
                            const firstNote: Note | null = (nextPattern.notes.length <= 0) ? null : nextPattern.notes[0];
                            if (firstNote != null && firstNote.start == 0) {
                                const nextPatternForcesContinueAtStart: boolean = firstNote.continuesLastPattern && Synth.adjacentNotesHaveMatchingPitches(note, firstNote);
                                const chordOfCompatibleInstrument: Chord | null = this.adjacentPatternHasCompatibleInstrumentTransition(song, channel, pattern!, nextPattern, instrumentIndex, transition, chord, note, firstNote, nextPatternForcesContinueAtStart);
                                if (chordOfCompatibleInstrument != null) {
                                    nextNoteForThisInstrument = firstNote;
                                    tonesInNextNote = chordOfCompatibleInstrument.singleTone ? 1 : nextNoteForThisInstrument.pitches.length
                                    forceContinueAtEnd = nextPatternForcesContinueAtStart;
                                }
                            }
                        }
                    } else if (nextNoteForThisInstrument != null) {
                        tonesInNextNote = chord.singleTone ? 1 : nextNoteForThisInstrument.pitches.length
                    }

                    if (chord.singleTone) {
                        const atNoteStart: boolean = (Config.ticksPerPart * note.start == currentTick);
                        let tone: Tone;
                        if (toneList.count() <= toneCount) {
                            tone = this.newTone();
                            toneList.pushBack(tone);
                        } else if (atNoteStart && ((!(transition.isSeamless || instrument.clicklessTransition) && !forceContinueAtStart) || prevNoteForThisInstrument == null)) {
                            const oldTone: Tone = toneList.get(toneCount);
                            if (oldTone.isOnLastTick) {
                                this.freeTone(oldTone);
                            } else {
                                this.releaseTone(instrumentState, oldTone);
                            }
                            tone = this.newTone();
                            toneList.set(toneCount, tone);
                        } else {
                            tone = toneList.get(toneCount);
                        }
                        toneCount++;

                        for (let i: number = 0; i < note.pitches.length; i++) {
                            tone.pitches[i] = note.pitches[i];
                        }
                        tone.pitchCount = note.pitches.length;
                        tone.chordSize = 1;
                        tone.instrumentIndex = instrumentIndex;
                        tone.note = note;
                        tone.noteStartPart = note.start;
                        tone.noteEndPart = note.end;
                        tone.prevNote = prevNoteForThisInstrument;
                        tone.nextNote = nextNoteForThisInstrument;
                        tone.prevNotePitchIndex = 0;
                        tone.nextNotePitchIndex = 0;
                        tone.atNoteStart = atNoteStart;
                        tone.passedEndOfNote = false;
                        tone.forceContinueAtStart = forceContinueAtStart;
                        tone.forceContinueAtEnd = forceContinueAtEnd;
                        this.computeTone(song, channelIndex, samplesPerTick, tone, false, false);
                    } else {
                        const transition: Transition = instrument.getTransition();

                        if (((transition.isSeamless && !transition.slides && chord.strumParts == 0) || forceContinueAtStart) && (Config.ticksPerPart * note.start == currentTick) && prevNoteForThisInstrument != null) {
                            this.moveTonesIntoOrderedTempMatchedList(toneList, note.pitches);
                        }

                        let strumOffsetParts: number = 0;
                        for (let i: number = 0; i < note.pitches.length; i++) {

                            let prevNoteForThisTone: Note | null = (tonesInPrevNote > i) ? prevNoteForThisInstrument : null;
                            let noteForThisTone: Note = note;
                            let nextNoteForThisTone: Note | null = (tonesInNextNote > i) ? nextNoteForThisInstrument : null;
                            let noteStartPart: number = noteForThisTone.start + strumOffsetParts;
                            let passedEndOfNote: boolean = false;

                            // Strumming may mean that a note's actual start time may be after the
                            // note's displayed start time. If the note start hasn't been reached yet,
                            // carry over the previous tone if available and seamless, otherwise skip
                            // the new tone until it is ready to start.
                            if (noteStartPart > currentPart) {
                                if (toneList.count() > i && (transition.isSeamless || forceContinueAtStart) && prevNoteForThisTone != null) {
                                    // Continue the previous note's chord until the current one takes over.
                                    nextNoteForThisTone = noteForThisTone;
                                    noteForThisTone = prevNoteForThisTone;
                                    prevNoteForThisTone = null;
                                    noteStartPart = noteForThisTone.start + strumOffsetParts;
                                    passedEndOfNote = true;
                                } else {
                                    // This and the rest of the tones in the chord shouldn't start yet.
                                    break;
                                }
                            }

                            let noteEndPart: number = noteForThisTone.end;
                            if ((transition.isSeamless || forceContinueAtStart) && nextNoteForThisTone != null) {
                                noteEndPart = Math.min(Config.partsPerBeat * this.song!.beatsPerBar, noteEndPart + strumOffsetParts);
                            }
                            if ((!transition.continues && !forceContinueAtStart) || prevNoteForThisTone == null) {
                                strumOffsetParts += chord.strumParts;
                            }

                            const atNoteStart: boolean = (Config.ticksPerPart * noteStartPart == currentTick);
                            let tone: Tone;
                            if (this.tempMatchedPitchTones[toneCount] != null) {
                                tone = this.tempMatchedPitchTones[toneCount]!;
                                this.tempMatchedPitchTones[toneCount] = null;
                                toneList.pushBack(tone);
                            } else if (toneList.count() <= toneCount) {
                                tone = this.newTone();
                                toneList.pushBack(tone);
                            } else if (atNoteStart && ((!transition.isSeamless && !forceContinueAtStart) || prevNoteForThisTone == null)) {
                                const oldTone: Tone = toneList.get(toneCount);
                                if (oldTone.isOnLastTick) {
                                    this.freeTone(oldTone);
                                } else {
                                    this.releaseTone(instrumentState, oldTone);
                                }
                                tone = this.newTone();
                                toneList.set(toneCount, tone);
                            } else {
                                tone = toneList.get(toneCount);
                            }
                            toneCount++;

                            tone.pitches[0] = noteForThisTone.pitches[i];
                            tone.pitchCount = 1;
                            tone.chordSize = noteForThisTone.pitches.length;
                            tone.instrumentIndex = instrumentIndex;
                            tone.note = noteForThisTone;
                            tone.noteStartPart = noteStartPart;
                            tone.noteEndPart = noteEndPart;
                            tone.prevNote = prevNoteForThisTone;
                            tone.nextNote = nextNoteForThisTone;
                            tone.prevNotePitchIndex = i;
                            tone.nextNotePitchIndex = i;
                            tone.atNoteStart = atNoteStart;
                            tone.passedEndOfNote = passedEndOfNote;
                            tone.forceContinueAtStart = forceContinueAtStart && prevNoteForThisTone != null;
                            tone.forceContinueAtEnd = forceContinueAtEnd && nextNoteForThisTone != null;
                            this.computeTone(song, channelIndex, samplesPerTick, tone, false, false);
                        }
                    }
                    if (transition.continues && (toneList.count() <= 0) || (note.pitches.length <= 0)) instrumentState.envelopeComputer.reset(); //stop computing effects envelopes
                }
                // Automatically free or release seamless tones if there's no new note to take over.
                while (toneList.count() > toneCount) {
                    const tone: Tone = toneList.popBack();
                    const channel: Channel = song.channels[channelIndex];
                    if (tone.instrumentIndex < channel.instruments.length && !tone.isOnLastTick) {
                        const instrumentState: InstrumentState = channelState.instruments[tone.instrumentIndex];
                        this.releaseTone(instrumentState, tone);
                    } else {
                        this.freeTone(tone);
                    }
                }

                this.clearTempMatchedPitchTones(toneCount, instrumentState);
            }
        }
    }

    private clearTempMatchedPitchTones(toneCount: number, instrumentState: InstrumentState): void {
        for (let i: number = toneCount; i < this.tempMatchedPitchTones.length; i++) {
            const oldTone: Tone | null = this.tempMatchedPitchTones[i];
            if (oldTone != null) {
                if (oldTone.isOnLastTick) {
                    this.freeTone(oldTone);
                } else {
                    this.releaseTone(instrumentState, oldTone);
                }
                this.tempMatchedPitchTones[i] = null;
            }
        }
    }


    private playTone(channelIndex: number, bufferIndex: number, runLength: number, tone: Tone): void {
        const channelState: ChannelState = this.channels[channelIndex];
        const instrumentState: InstrumentState = channelState.instruments[tone.instrumentIndex];

        if (instrumentState.synthesizer != null) instrumentState.synthesizer!(this, bufferIndex, runLength, tone, instrumentState);
        tone.envelopeComputer.clearEnvelopes();
        instrumentState.envelopeComputer.clearEnvelopes();
    }

    // Computes mod note position at the start and end of the window and "plays" the mod tone, setting appropriate mod data.
    private playModTone(song: Song, channelIndex: number, samplesPerTick: number, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, released: boolean, shouldFadeOutFast: boolean): void {
        const channel: Channel = song.channels[channelIndex];
        const instrument: Instrument = channel.instruments[tone.instrumentIndex];

        if (tone.note != null) {
            const ticksIntoBar: number = this.getTicksIntoBar();
            const partTimeTickStart: number = (ticksIntoBar) / Config.ticksPerPart;
            const partTimeTickEnd: number = (ticksIntoBar + 1) / Config.ticksPerPart;
            const tickSampleCountdown: number = this.tickSampleCountdown;
            const startRatio: number = 1.0 - (tickSampleCountdown) / samplesPerTick;
            const endRatio: number = 1.0 - (tickSampleCountdown - roundedSamplesPerTick) / samplesPerTick;
            const partTimeStart: number = partTimeTickStart + (partTimeTickEnd - partTimeTickStart) * startRatio;
            const partTimeEnd: number = partTimeTickStart + (partTimeTickEnd - partTimeTickStart) * endRatio;
            const tickTimeStart: number = Config.ticksPerPart * partTimeStart;
            const tickTimeEnd: number = Config.ticksPerPart * partTimeEnd;
            const endPinIndex: number = tone.note.getEndPinIndex(this.getCurrentPart());
            const startPin: NotePin = tone.note.pins[endPinIndex - 1];
            const endPin: NotePin = tone.note.pins[endPinIndex];
            const startPinTick: number = (tone.note.start + startPin.time) * Config.ticksPerPart;
            const endPinTick: number = (tone.note.start + endPin.time) * Config.ticksPerPart;
            const ratioStart: number = (tickTimeStart - startPinTick) / (endPinTick - startPinTick);
            const ratioEnd: number = (tickTimeEnd - startPinTick) / (endPinTick - startPinTick);
            tone.expression = startPin.size + (endPin.size - startPin.size) * ratioStart;
            tone.expressionDelta = (startPin.size + (endPin.size - startPin.size) * ratioEnd) - tone.expression;

            Synth.modSynth(this, bufferIndex, roundedSamplesPerTick, tone, instrument);
        }
    }

    private static computeChordExpression(chordSize: number): number {
        return 1.0 / ((chordSize - 1) * 0.25 + 1.0);
    }

    private computeTone(song: Song, channelIndex: number, samplesPerTick: number, tone: Tone, released: boolean, shouldFadeOutFast: boolean): void {
        const roundedSamplesPerTick: number = Math.ceil(samplesPerTick);
        const channel: Channel = song.channels[channelIndex];
        const channelState: ChannelState = this.channels[channelIndex];
        const instrument: Instrument = channel.instruments[tone.instrumentIndex];
        const instrumentState: InstrumentState = channelState.instruments[tone.instrumentIndex];
        instrumentState.awake = true;
        instrumentState.tonesAddedInThisTick = true;
        if (!instrumentState.computed) {
            instrumentState.compute(this, instrument, samplesPerTick, roundedSamplesPerTick, tone, channelIndex, tone.instrumentIndex);
        }
        const transition: Transition = instrument.getTransition();
        const chord: Chord = instrument.getChord();
        const chordExpression: number = chord.singleTone ? 1.0 : Synth.computeChordExpression(tone.chordSize);
        const isNoiseChannel: boolean = song.getChannelIsNoise(channelIndex);
        const intervalScale: number = isNoiseChannel ? Config.noiseInterval : 1;
        const secondsPerPart: number = Config.ticksPerPart * samplesPerTick / this.samplesPerSecond;
        const sampleTime: number = 1.0 / this.samplesPerSecond;
        const beatsPerPart: number = 1.0 / Config.partsPerBeat;
        const ticksIntoBar: number = this.getTicksIntoBar();
        const partTimeStart: number = (ticksIntoBar) / Config.ticksPerPart;
        const partTimeEnd: number = (ticksIntoBar + 1.0) / Config.ticksPerPart;
        const currentPart: number = this.getCurrentPart();

        let specialIntervalMult: number = 1.0;
        tone.specialIntervalExpressionMult = 1.0;

        //if (synth.isModActive(ModSetting.mstPan, channelIndex, tone.instrumentIndex)) {
        //    startPan = synth.getModValue(ModSetting.mstPan, false, channel, instrumentIdx, false);
        //    endPan = synth.getModValue(ModSetting.mstPan, false, channel, instrumentIdx, true);
        //}

        let toneIsOnLastTick: boolean = shouldFadeOutFast;
        let intervalStart: number = 0.0;
        let intervalEnd: number = 0.0;
        let fadeExpressionStart: number = 1.0;
        let fadeExpressionEnd: number = 1.0;
        let chordExpressionStart: number = chordExpression;
        let chordExpressionEnd: number = chordExpression;

        let expressionReferencePitch: number = 16; // A low "E" as a MIDI pitch.
        let basePitch: number = Config.keys[song.key].basePitch + (Config.pitchesPerOctave * song.octave);
        let baseExpression: number = 1.0;
        let pitchDamping: number = 48;
        if (instrument.type == InstrumentType.spectrum) {
            baseExpression = Config.spectrumBaseExpression;
            if (isNoiseChannel) {
                basePitch = Config.spectrumBasePitch;
                baseExpression *= 2.0; // Note: spectrum is louder for drum channels than pitch channels!
            }
            expressionReferencePitch = Config.spectrumBasePitch;
            pitchDamping = 28;
        } else if (instrument.type == InstrumentType.drumset) {
            basePitch = Config.spectrumBasePitch;
            baseExpression = Config.drumsetBaseExpression;
            expressionReferencePitch = basePitch;
        } else if (instrument.type == InstrumentType.noise) {
            // dogebox2 code, makes basic noise affected by keys in pitch channels
            basePitch = isNoiseChannel ? Config.chipNoises[instrument.chipNoise].basePitch : basePitch + Config.chipNoises[instrument.chipNoise].basePitch - 12;
            // maybe also lower expression in pitch channels?
            baseExpression = Config.noiseBaseExpression;
            expressionReferencePitch = basePitch;
            pitchDamping = Config.chipNoises[instrument.chipNoise].isSoft ? 24.0 : 60.0;
        } else if (instrument.type == InstrumentType.fm || instrument.type == InstrumentType.fm6op) {
            baseExpression = Config.fmBaseExpression;
        } else if (instrument.type == InstrumentType.chip) {
            baseExpression = Config.chipBaseExpression;
            if (Config.chipWaves[instrument.chipWave].isCustomSampled) {
                if (Config.chipWaves[instrument.chipWave].isPercussion != 0) {
                    basePitch = -84.37 + Math.log2(Config.chipWaves[instrument.chipWave].samples.length / Config.chipWaves[instrument.chipWave].sampleRate!) * -12 - (-60 + Config.chipWaves[instrument.chipWave].rootKey!);
                } else {
                    basePitch += -96.37 + Math.log2(Config.chipWaves[instrument.chipWave].samples.length / Config.chipWaves[instrument.chipWave].sampleRate!) * -12 - (-60 + Config.chipWaves[instrument.chipWave].rootKey!);
                }
            } else {
                if (Config.chipWaves[instrument.chipWave].isSampled && Config.chipWaves[instrument.chipWave].isPercussion == 0) {
                    basePitch = basePitch - 63 + Config.chipWaves[instrument.chipWave].extraSampleDetune!
                } else if (Config.chipWaves[instrument.chipWave].isSampled && Config.chipWaves[instrument.chipWave].isPercussion != 0) {
                    basePitch = -51 + Config.chipWaves[instrument.chipWave].extraSampleDetune!;
                }
            }
        } else if (instrument.type == InstrumentType.customChipWave) {
            baseExpression = Config.chipBaseExpression;
        } else if (instrument.type == InstrumentType.harmonics) {
            baseExpression = Config.harmonicsBaseExpression;
        } else if (instrument.type == InstrumentType.pwm) {
            baseExpression = Config.pwmBaseExpression;
        } else if (instrument.type == InstrumentType.supersaw) {
            baseExpression = Config.supersawBaseExpression;
        } else if (instrument.type == InstrumentType.pickedString) {
            baseExpression = Config.pickedStringBaseExpression;
        } else if (instrument.type == InstrumentType.mod) {
            baseExpression = 1.0;
            expressionReferencePitch = 0;
            pitchDamping = 1.0;
            basePitch = 0;
        } else {
            throw new Error("Unknown instrument type in computeTone.");
        }

        if ((tone.atNoteStart && !transition.isSeamless && !tone.forceContinueAtStart) || tone.freshlyAllocated) {
            tone.reset();
            if (tone.note != null) tone.chipWaveStartOffset = tone.note.chipWaveStartOffset;
            instrumentState.envelopeComputer.reset();
            // advloop addition
            if (instrument.type == InstrumentType.chip && instrument.isUsingAdvancedLoopControls) {
                const chipWaveLength = Config.rawRawChipWaves[instrument.chipWave].samples.length - 1;
                const firstOffset = (tone.chipWaveStartOffset + instrument.chipWaveStartOffset) / chipWaveLength;
                // const lastOffset = (chipWaveLength - 0.01) / chipWaveLength;
                // @TODO: This is silly and I should actually figure out how to
                // properly keep lastOffset as 1.0 and not get it wrapped back
                // to 0 once it's in `Synth.loopableChipSynth`.
                const lastOffset = 0.999999999999999;
                for (let i = 0; i < Config.maxPitchOrOperatorCount; i++) {
                    tone.phases[i] = instrument.chipWavePlayBackwards ? Math.max(0, Math.min(lastOffset, firstOffset)) : Math.max(0, firstOffset);
                    tone.directions[i] = instrument.chipWavePlayBackwards ? -1 : 1;
                    tone.chipWaveCompletions[i] = 0;
                    tone.chipWavePrevWavesL[i] = 0;
                    tone.chipWavePrevWavesR[i] = 0;
                    tone.chipWaveCompletionsLastWaveL[i] = 0;
                    tone.chipWaveCompletionsLastWaveR[i] = 0;
                }
            }
            // advloop addition
        }
        tone.freshlyAllocated = false;

        for (let i: number = 0; i < Config.maxPitchOrOperatorCount; i++) {
            tone.phaseDeltas[i] = 0.0;
            tone.phaseDeltaScales[i] = 0.0;
            tone.operatorExpressions[i] = 0.0;
            tone.operatorExpressionDeltas[i] = 0.0;
        }
        tone.expression = 0.0;
        tone.expressionDelta = 0.0;
        for (let i: number = 0; i < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); i++) {
            tone.operatorWaves[i] = Synth.getOperatorWave(instrument.operators[i].waveform, instrument.operators[i].pulseWidth);
        }

        if (released) {
            const startTicksSinceReleased: number = tone.ticksSinceReleased;
            const endTicksSinceReleased: number = tone.ticksSinceReleased + 1.0;
            intervalStart = intervalEnd = tone.lastInterval;
            const fadeOutTicks: number = Math.abs(instrument.getFadeOutTicks());
            fadeExpressionStart = Synth.noteSizeToVolumeMult((1.0 - startTicksSinceReleased / fadeOutTicks) * Config.noteSizeMax);
            fadeExpressionEnd = Synth.noteSizeToVolumeMult((1.0 - endTicksSinceReleased / fadeOutTicks) * Config.noteSizeMax);

            if (shouldFadeOutFast) {
                fadeExpressionEnd = 0.0;
            }

            if (tone.ticksSinceReleased + 1 >= fadeOutTicks) toneIsOnLastTick = true;
        } else if (tone.note == null) {
            fadeExpressionStart = fadeExpressionEnd = 1.0;
            tone.lastInterval = 0;
            tone.ticksSinceReleased = 0;
            tone.liveInputSamplesHeld += roundedSamplesPerTick;
        } else {
            const note: Note = tone.note;
            const nextNote: Note | null = tone.nextNote;

            const noteStartPart: number = tone.noteStartPart;
            const noteEndPart: number = tone.noteEndPart;


            const endPinIndex: number = note.getEndPinIndex(currentPart);
            const startPin: NotePin = note.pins[endPinIndex - 1];
            const endPin: NotePin = note.pins[endPinIndex];
            const noteStartTick: number = noteStartPart * Config.ticksPerPart;
            const noteEndTick: number = noteEndPart * Config.ticksPerPart;
            const pinStart: number = (note.start + startPin.time) * Config.ticksPerPart;
            const pinEnd: number = (note.start + endPin.time) * Config.ticksPerPart;

            tone.ticksSinceReleased = 0;

            const tickTimeStart: number = currentPart * Config.ticksPerPart + this.tick;
            const tickTimeEnd: number = tickTimeStart + 1.0;
            const noteTicksPassedTickStart: number = tickTimeStart - noteStartTick;
            const noteTicksPassedTickEnd: number = tickTimeEnd - noteStartTick;
            const pinRatioStart: number = Math.min(1.0, (tickTimeStart - pinStart) / (pinEnd - pinStart));
            const pinRatioEnd: number = Math.min(1.0, (tickTimeEnd - pinStart) / (pinEnd - pinStart));
            fadeExpressionStart = 1.0;
            fadeExpressionEnd = 1.0;
            intervalStart = startPin.interval + (endPin.interval - startPin.interval) * pinRatioStart;
            intervalEnd = startPin.interval + (endPin.interval - startPin.interval) * pinRatioEnd;
            tone.lastInterval = intervalEnd;

            if ((!transition.isSeamless && !tone.forceContinueAtEnd) || nextNote == null) {
                const fadeOutTicks: number = -instrument.getFadeOutTicks();
                if (fadeOutTicks > 0.0) {
                    // If the tone should fade out before the end of the note, do so here.
                    const noteLengthTicks: number = noteEndTick - noteStartTick;
                    fadeExpressionStart *= Math.min(1.0, (noteLengthTicks - noteTicksPassedTickStart) / fadeOutTicks);
                    fadeExpressionEnd *= Math.min(1.0, (noteLengthTicks - noteTicksPassedTickEnd) / fadeOutTicks);
                    if (tickTimeEnd >= noteStartTick + noteLengthTicks) toneIsOnLastTick = true;
                }
            }

        }

        tone.isOnLastTick = toneIsOnLastTick;

        let tmpNoteFilter: FilterSettings = instrument.noteFilter;
        let startPoint: FilterControlPoint;
        let endPoint: FilterControlPoint;

        if (instrument.noteFilterType) {
            // Simple EQ filter (old style). For analysis, using random filters from normal style since they are N/A in this context.
            const noteFilterSettingsStart: FilterSettings = instrument.noteFilter;
            if (instrument.noteSubFilters[1] == null)
                instrument.noteSubFilters[1] = new FilterSettings();
            const noteFilterSettingsEnd: FilterSettings = instrument.noteSubFilters[1];

            // Change location based on slider values
            let startSimpleFreq: number = instrument.noteFilterSimpleCut;
            let startSimpleGain: number = instrument.noteFilterSimplePeak;
            let endSimpleFreq: number = instrument.noteFilterSimpleCut;
            let endSimpleGain: number = instrument.noteFilterSimplePeak;
            let filterChanges: boolean = false;

            if (this.isModActive(Config.modulators.dictionary["note filt cut"].index, channelIndex, tone.instrumentIndex)) {
                startSimpleFreq = this.getModValue(Config.modulators.dictionary["note filt cut"].index, channelIndex, tone.instrumentIndex, false);
                endSimpleFreq = this.getModValue(Config.modulators.dictionary["note filt cut"].index, channelIndex, tone.instrumentIndex, true);
                filterChanges = true;
            }
            if (this.isModActive(Config.modulators.dictionary["note filt peak"].index, channelIndex, tone.instrumentIndex)) {
                startSimpleGain = this.getModValue(Config.modulators.dictionary["note filt peak"].index, channelIndex, tone.instrumentIndex, false);
                endSimpleGain = this.getModValue(Config.modulators.dictionary["note filt peak"].index, channelIndex, tone.instrumentIndex, true);
                filterChanges = true;
            }

            noteFilterSettingsStart.convertLegacySettingsForSynth(startSimpleFreq, startSimpleGain, !filterChanges);
            noteFilterSettingsEnd.convertLegacySettingsForSynth(endSimpleFreq, endSimpleGain, !filterChanges);

            startPoint = noteFilterSettingsStart.controlPoints[0];
            endPoint = noteFilterSettingsEnd.controlPoints[0];

            // Temporarily override so that envelope computer uses appropriate computed note filter
            instrument.noteFilter = noteFilterSettingsStart;
            instrument.tmpNoteFilterStart = noteFilterSettingsStart;
        }

        // Compute envelopes *after* resetting the tone, otherwise the envelope computer gets reset too!
        const envelopeComputer: EnvelopeComputer = tone.envelopeComputer;
        const envelopeSpeeds: number[] = [];
        for (let i: number = 0; i < Config.maxEnvelopeCount; i++) {
            envelopeSpeeds[i] = 0;
        }
        for (let envelopeIndex: number = 0; envelopeIndex < instrument.envelopeCount; envelopeIndex++) {
            let perEnvelopeSpeed: number = instrument.envelopes[envelopeIndex].perEnvelopeSpeed;
            if (this.isModActive(Config.modulators.dictionary["individual envelope speed"].index, channelIndex, tone.instrumentIndex) && instrument.envelopes[envelopeIndex].tempEnvelopeSpeed != null) {
                perEnvelopeSpeed = instrument.envelopes[envelopeIndex].tempEnvelopeSpeed!;
            }
            let useEnvelopeSpeed: number = Config.arpSpeedScale[instrument.envelopeSpeed] * perEnvelopeSpeed;
            if (this.isModActive(Config.modulators.dictionary["envelope speed"].index, channelIndex, tone.instrumentIndex)) {
                useEnvelopeSpeed = Math.max(0, Math.min(Config.arpSpeedScale.length - 1, this.getModValue(Config.modulators.dictionary["envelope speed"].index, channelIndex, tone.instrumentIndex, false)));
                if (Number.isInteger(useEnvelopeSpeed)) {
                    useEnvelopeSpeed = Config.arpSpeedScale[useEnvelopeSpeed] * perEnvelopeSpeed;
                } else {
                    // Linear interpolate envelope values
                    useEnvelopeSpeed = (1 - (useEnvelopeSpeed % 1)) * Config.arpSpeedScale[Math.floor(useEnvelopeSpeed)] + (useEnvelopeSpeed % 1) * Config.arpSpeedScale[Math.ceil(useEnvelopeSpeed)] * perEnvelopeSpeed;
                }
            }
            envelopeSpeeds[envelopeIndex] = useEnvelopeSpeed;
        }
        envelopeComputer.computeEnvelopes(instrument, currentPart, instrumentState.envelopeTime, Config.ticksPerPart * partTimeStart, samplesPerTick / this.samplesPerSecond, tone, envelopeSpeeds, instrumentState, this, channelIndex, tone.instrumentIndex);
        const envelopeStarts: number[] = tone.envelopeComputer.envelopeStarts;
        const envelopeEnds: number[] = tone.envelopeComputer.envelopeEnds;
        instrument.noteFilter = tmpNoteFilter;
        if (transition.continues && (tone.prevNote == null || tone.note == null)) {
            instrumentState.envelopeComputer.reset();
        }

        if (tone.note != null && transition.slides) {
            // Slide interval and chordExpression at the start and/or end of the note if necessary.
            const prevNote: Note | null = tone.prevNote;
            const nextNote: Note | null = tone.nextNote;
            if (prevNote != null) {
                const intervalDiff: number = prevNote.pitches[tone.prevNotePitchIndex] + prevNote.pins[prevNote.pins.length - 1].interval - tone.pitches[0];
                if (envelopeComputer.prevSlideStart) intervalStart += intervalDiff * envelopeComputer.prevSlideRatioStart;
                if (envelopeComputer.prevSlideEnd) intervalEnd += intervalDiff * envelopeComputer.prevSlideRatioEnd;
                if (!chord.singleTone) {
                    const chordSizeDiff: number = prevNote.pitches.length - tone.chordSize;
                    if (envelopeComputer.prevSlideStart) chordExpressionStart = Synth.computeChordExpression(tone.chordSize + chordSizeDiff * envelopeComputer.prevSlideRatioStart);
                    if (envelopeComputer.prevSlideEnd) chordExpressionEnd = Synth.computeChordExpression(tone.chordSize + chordSizeDiff * envelopeComputer.prevSlideRatioEnd);
                }
            }
            if (nextNote != null) {
                const intervalDiff: number = nextNote.pitches[tone.nextNotePitchIndex] - (tone.pitches[0] + tone.note.pins[tone.note.pins.length - 1].interval);
                if (envelopeComputer.nextSlideStart) intervalStart += intervalDiff * envelopeComputer.nextSlideRatioStart;
                if (envelopeComputer.nextSlideEnd) intervalEnd += intervalDiff * envelopeComputer.nextSlideRatioEnd;
                if (!chord.singleTone) {
                    const chordSizeDiff: number = nextNote.pitches.length - tone.chordSize;
                    if (envelopeComputer.nextSlideStart) chordExpressionStart = Synth.computeChordExpression(tone.chordSize + chordSizeDiff * envelopeComputer.nextSlideRatioStart);
                    if (envelopeComputer.nextSlideEnd) chordExpressionEnd = Synth.computeChordExpression(tone.chordSize + chordSizeDiff * envelopeComputer.nextSlideRatioEnd);
                }
            }
        }

        if (effectsIncludePitchShift(instrument.mdeffects)) {
            let pitchShift: number = Config.justIntonationSemitones[instrument.pitchShift] / intervalScale;
            let pitchShiftScalarStart: number = 1.0;
            let pitchShiftScalarEnd: number = 1.0;
            if (this.isModActive(Config.modulators.dictionary["pitch shift"].index, channelIndex, tone.instrumentIndex)) {
                pitchShift = Config.justIntonationSemitones[Config.justIntonationSemitones.length - 1];
                pitchShiftScalarStart = (this.getModValue(Config.modulators.dictionary["pitch shift"].index, channelIndex, tone.instrumentIndex, false)) / (Config.pitchShiftCenter);
                pitchShiftScalarEnd = (this.getModValue(Config.modulators.dictionary["pitch shift"].index, channelIndex, tone.instrumentIndex, true)) / (Config.pitchShiftCenter);
            }
            const envelopeStart: number = envelopeStarts[EnvelopeComputeIndex.pitchShift];
            const envelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.pitchShift];
            intervalStart += pitchShift * envelopeStart * pitchShiftScalarStart;
            intervalEnd += pitchShift * envelopeEnd * pitchShiftScalarEnd;
        }
        if (effectsIncludeDetune(instrument.mdeffects) || this.isModActive(Config.modulators.dictionary["song detune"].index, channelIndex, tone.instrumentIndex)) {
            const envelopeStart: number = envelopeStarts[EnvelopeComputeIndex.detune];
            const envelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.detune];
            let modDetuneStart: number = instrument.detune;
            let modDetuneEnd: number = instrument.detune;
            if (this.isModActive(Config.modulators.dictionary["detune"].index, channelIndex, tone.instrumentIndex)) {
                modDetuneStart = this.getModValue(Config.modulators.dictionary["detune"].index, channelIndex, tone.instrumentIndex, false) + Config.detuneCenter;
                modDetuneEnd = this.getModValue(Config.modulators.dictionary["detune"].index, channelIndex, tone.instrumentIndex, true) + Config.detuneCenter;
            }

            if (!Config.chipWaves[instrument.chipWave].isCustomSampled || Config.chipWaves[instrument.chipWave].isPercussion != 1) {
                if (this.isModActive(Config.modulators.dictionary["song detune"].index, channelIndex, tone.instrumentIndex)) {
                    modDetuneStart += 4 * this.getModValue(Config.modulators.dictionary["song detune"].index, channelIndex, tone.instrumentIndex, false);
                    modDetuneEnd += 4 * this.getModValue(Config.modulators.dictionary["song detune"].index, channelIndex, tone.instrumentIndex, true);
                }
            }
            intervalStart += detuneToCents(modDetuneStart) * envelopeStart * Config.pitchesPerOctave / (12.0 * 100.0);
            intervalEnd += detuneToCents(modDetuneEnd) * envelopeEnd * Config.pitchesPerOctave / (12.0 * 100.0);
        }

        if (effectsIncludeVibrato(instrument.mdeffects)) {
            let delayTicks: number;
            let vibratoAmplitudeStart: number;
            let vibratoAmplitudeEnd: number;
            // Custom vibrato
            if (instrument.vibrato == Config.vibratos.length) {
                delayTicks = instrument.vibratoDelay * 2; // Delay was changed from parts to ticks in BB v9
                // Special case: if vibrato delay is max, NEVER vibrato.
                if (instrument.vibratoDelay == Config.modulators.dictionary["vibrato delay"].maxRawVol)
                    delayTicks = Number.POSITIVE_INFINITY;
                vibratoAmplitudeStart = instrument.vibratoDepth;
                vibratoAmplitudeEnd = vibratoAmplitudeStart;
            } else {
                delayTicks = Config.vibratos[instrument.vibrato].delayTicks;
                vibratoAmplitudeStart = Config.vibratos[instrument.vibrato].amplitude;
                vibratoAmplitudeEnd = vibratoAmplitudeStart;
            }

            if (this.isModActive(Config.modulators.dictionary["vibrato delay"].index, channelIndex, tone.instrumentIndex)) {
                delayTicks = this.getModValue(Config.modulators.dictionary["vibrato delay"].index, channelIndex, tone.instrumentIndex, false) * 2; // Delay was changed from parts to ticks in BB v9
                if (delayTicks == Config.modulators.dictionary["vibrato delay"].maxRawVol * 2)
                    delayTicks = Number.POSITIVE_INFINITY;

            }

            if (this.isModActive(Config.modulators.dictionary["vibrato depth"].index, channelIndex, tone.instrumentIndex)) {
                vibratoAmplitudeStart = this.getModValue(Config.modulators.dictionary["vibrato depth"].index, channelIndex, tone.instrumentIndex, false) / 25;
                vibratoAmplitudeEnd = this.getModValue(Config.modulators.dictionary["vibrato depth"].index, channelIndex, tone.instrumentIndex, true) / 25;
            }


            // To maintain pitch continuity, (mostly for picked string which retriggers impulse
            // otherwise) remember the vibrato at the end of this run and reuse it at the start
            // of the next run if available.
            let vibratoStart: number;
            if (tone.prevVibrato != null) {
                vibratoStart = tone.prevVibrato;
            } else {
                let vibratoLfoStart: number = Synth.getLFOAmplitude(instrument, secondsPerPart * instrumentState.vibratoTime);
                const vibratoDepthEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.vibratoDepth];
                vibratoStart = vibratoAmplitudeStart * vibratoLfoStart * vibratoDepthEnvelopeStart;
                if (delayTicks > 0.0) {
                    const ticksUntilVibratoStart: number = delayTicks - envelopeComputer.noteTicksStart;
                    vibratoStart *= Math.max(0.0, Math.min(1.0, 1.0 - ticksUntilVibratoStart / 2.0));
                }
            }

            let vibratoLfoEnd: number = Synth.getLFOAmplitude(instrument, secondsPerPart * instrumentState.nextVibratoTime);
            const vibratoDepthEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.vibratoDepth];
            if (instrument.type != InstrumentType.mod) {
                let vibratoEnd: number = vibratoAmplitudeEnd * vibratoLfoEnd * vibratoDepthEnvelopeEnd;
                if (delayTicks > 0.0) {
                    const ticksUntilVibratoEnd: number = delayTicks - envelopeComputer.noteTicksEnd;
                    vibratoEnd *= Math.max(0.0, Math.min(1.0, 1.0 - ticksUntilVibratoEnd / 2.0));
                }

                tone.prevVibrato = vibratoEnd;

                intervalStart += vibratoStart;
                intervalEnd += vibratoEnd;
            }
        }

        if ((!transition.isSeamless && !tone.forceContinueAtStart) || tone.prevNote == null) {
            // Fade in the beginning of the note.
            const fadeInSeconds: number = instrument.getFadeInSeconds();
            if (fadeInSeconds > 0.0) {
                fadeExpressionStart *= Math.min(1.0, envelopeComputer.noteSecondsStartUnscaled / fadeInSeconds);
                fadeExpressionEnd *= Math.min(1.0, envelopeComputer.noteSecondsEndUnscaled / fadeInSeconds);
            }
        }


        if (instrument.type == InstrumentType.drumset && tone.drumsetPitch == null) {
            // It's possible that the note will change while the user is editing it,
            // but the tone's pitches don't get updated because the tone has already
            // ended and is fading out. To avoid an array index out of bounds error, clamp the pitch.
            tone.drumsetPitch = tone.pitches[0];
            if (tone.note != null) tone.drumsetPitch += tone.note.pickMainInterval();
            tone.drumsetPitch = Math.max(0, Math.min(Config.drumCount - 1, tone.drumsetPitch));
        }

        let noteFilterExpression: number = envelopeComputer.lowpassCutoffDecayVolumeCompensation;

        const noteAllFreqsEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.noteFilterAllFreqs];
        const noteAllFreqsEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.noteFilterAllFreqs];

        // Simple note filter
        if (instrument.noteFilterType) {
            const noteFreqEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.noteFilterFreq0];
            const noteFreqEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.noteFilterFreq0];
            const notePeakEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.noteFilterGain0];
            const notePeakEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.noteFilterGain0];

            startPoint!.toCoefficients(Synth.tempFilterStartCoefficients, this.samplesPerSecond, noteAllFreqsEnvelopeStart * noteFreqEnvelopeStart, notePeakEnvelopeStart);
            endPoint!.toCoefficients(Synth.tempFilterEndCoefficients, this.samplesPerSecond, noteAllFreqsEnvelopeEnd * noteFreqEnvelopeEnd, notePeakEnvelopeEnd);

            if (tone.noteFiltersL.length < 1) tone.noteFiltersL[0] = new DynamicBiquadFilter();
            if (tone.noteFiltersR.length < 1) tone.noteFiltersR[0] = new DynamicBiquadFilter();
            tone.noteFiltersL[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint!.type == FilterType.lowPass);
            tone.noteFiltersR[0].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint!.type == FilterType.lowPass);
            noteFilterExpression *= startPoint!.getVolumeCompensationMult();

            tone.noteFilterCount = 1;
        } else {
            const noteFilterSettings: FilterSettings = (instrument.tmpNoteFilterStart != null) ? instrument.tmpNoteFilterStart : instrument.noteFilter;

            for (let i: number = 0; i < noteFilterSettings.controlPointCount; i++) {
                const noteFreqEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.noteFilterFreq0 + i];
                const noteFreqEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.noteFilterFreq0 + i];
                const notePeakEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.noteFilterGain0 + i];
                const notePeakEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.noteFilterGain0 + i];
                let startPoint: FilterControlPoint = noteFilterSettings.controlPoints[i];
                const endPoint: FilterControlPoint = (instrument.tmpNoteFilterEnd != null && instrument.tmpNoteFilterEnd.controlPoints[i] != null) ? instrument.tmpNoteFilterEnd.controlPoints[i] : noteFilterSettings.controlPoints[i];

                // If switching dot type, do it all at once and do not try to interpolate since no valid interpolation exists.
                if (startPoint.type != endPoint.type) {
                    startPoint = endPoint;
                }

                startPoint.toCoefficients(Synth.tempFilterStartCoefficients, this.samplesPerSecond, noteAllFreqsEnvelopeStart * noteFreqEnvelopeStart, notePeakEnvelopeStart);
                endPoint.toCoefficients(Synth.tempFilterEndCoefficients, this.samplesPerSecond, noteAllFreqsEnvelopeEnd * noteFreqEnvelopeEnd, notePeakEnvelopeEnd);
                if (tone.noteFiltersL.length <= i) tone.noteFiltersL[i] = new DynamicBiquadFilter();
                if (tone.noteFiltersR.length <= i) tone.noteFiltersR[i] = new DynamicBiquadFilter();
                tone.noteFiltersL[i].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
                tone.noteFiltersR[i].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, startPoint.type == FilterType.lowPass);
                noteFilterExpression *= startPoint.getVolumeCompensationMult();
            }
            tone.noteFilterCount = noteFilterSettings.controlPointCount;
        }

        if (instrument.type == InstrumentType.drumset) {
            const drumsetEnvelopeComputer: EnvelopeComputer = tone.envelopeComputer;

            const drumsetFilterEnvelope: Envelope = instrument.getDrumsetEnvelope(tone.drumsetPitch!);

            // If the drumset lowpass cutoff decays, compensate by increasing expression.
            noteFilterExpression *= EnvelopeComputer.getLowpassCutoffDecayVolumeCompensation(drumsetFilterEnvelope);

            drumsetEnvelopeComputer.computeDrumsetEnvelopes(instrument, drumsetFilterEnvelope, beatsPerPart, partTimeStart, partTimeEnd);

            const drumsetFilterEnvelopeStart = drumsetEnvelopeComputer.drumsetFilterEnvelopeStart;
            const drumsetFilterEnvelopeEnd = drumsetEnvelopeComputer.drumsetFilterEnvelopeEnd;

            const point: FilterControlPoint = this.tempDrumSetControlPoint;
            point.type = FilterType.lowPass;
            point.gain = FilterControlPoint.getRoundedSettingValueFromLinearGain(0.50);
            point.freq = FilterControlPoint.getRoundedSettingValueFromHz(8000.0);
            // Drumset envelopes are warped to better imitate the legacy simplified 2nd order lowpass at ~48000Hz that I used to use.
            point.toCoefficients(Synth.tempFilterStartCoefficients, this.samplesPerSecond, drumsetFilterEnvelopeStart * (1.0 + drumsetFilterEnvelopeStart), 1.0);
            point.toCoefficients(Synth.tempFilterEndCoefficients, this.samplesPerSecond, drumsetFilterEnvelopeEnd * (1.0 + drumsetFilterEnvelopeEnd), 1.0);
            if (tone.noteFiltersL.length == tone.noteFilterCount) tone.noteFiltersL[tone.noteFilterCount] = new DynamicBiquadFilter();
            if (tone.noteFiltersR.length == tone.noteFilterCount) tone.noteFiltersR[tone.noteFilterCount] = new DynamicBiquadFilter();
            tone.noteFiltersL[tone.noteFilterCount].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, true);
            tone.noteFiltersR[tone.noteFilterCount].loadCoefficientsWithGradient(Synth.tempFilterStartCoefficients, Synth.tempFilterEndCoefficients, 1.0 / roundedSamplesPerTick, true);
            tone.noteFilterCount++;
        }

        noteFilterExpression = Math.min(3.0, noteFilterExpression);

        if (instrument.type == InstrumentType.fm || instrument.type == InstrumentType.fm6op) {
            // phase modulation!

            let sineExpressionBoost: number = 1.0;
            let totalCarrierExpression: number = 0.0;

            let arpeggioInterval: number = 0;
            const arpeggiates: boolean = chord.arpeggiates;
            const isMono: boolean = chord.name == "monophonic";
            if (tone.pitchCount > 1 && arpeggiates) {
                const arpeggio: number = Math.floor(instrumentState.arpTime / Config.ticksPerArpeggio);
                arpeggioInterval = tone.pitches[getArpeggioPitchIndex(tone.pitchCount, instrument.fastTwoNoteArp, arpeggio)] - tone.pitches[0];
            }


            const carrierCount: number = (instrument.type == InstrumentType.fm6op ? instrument.customAlgorithm.carrierCount : Config.algorithms[instrument.algorithm].carrierCount);
            for (let i: number = 0; i < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); i++) {

                const associatedCarrierIndex: number = (instrument.type == InstrumentType.fm6op ? instrument.customAlgorithm.associatedCarrier[i] - 1 : Config.algorithms[instrument.algorithm].associatedCarrier[i] - 1);
                const pitch: number = tone.pitches[arpeggiates ? 0 : isMono ? instrument.monoChordTone : ((i < tone.pitchCount) ? i : ((associatedCarrierIndex < tone.pitchCount) ? associatedCarrierIndex : 0))];
                const freqMult = Config.operatorFrequencies[instrument.operators[i].frequency].mult;
                const interval = Config.operatorCarrierInterval[associatedCarrierIndex] + arpeggioInterval;
                const pitchStart: number = basePitch + (pitch + intervalStart) * intervalScale + interval;
                const pitchEnd: number = basePitch + (pitch + intervalEnd) * intervalScale + interval;
                const baseFreqStart: number = Instrument.frequencyFromPitch(pitchStart);
                const baseFreqEnd: number = Instrument.frequencyFromPitch(pitchEnd);
                const hzOffset: number = Config.operatorFrequencies[instrument.operators[i].frequency].hzOffset;
                const targetFreqStart: number = freqMult * baseFreqStart + hzOffset;
                const targetFreqEnd: number = freqMult * baseFreqEnd + hzOffset;


                const freqEnvelopeStart: number = envelopeStarts[EnvelopeComputeIndex.operatorFrequency0 + i];
                const freqEnvelopeEnd: number = envelopeEnds[EnvelopeComputeIndex.operatorFrequency0 + i];
                let freqStart: number;
                let freqEnd: number;
                if (freqEnvelopeStart != 1.0 || freqEnvelopeEnd != 1.0) {
                    freqStart = Math.pow(2.0, Math.log2(targetFreqStart / baseFreqStart) * freqEnvelopeStart) * baseFreqStart;
                    freqEnd = Math.pow(2.0, Math.log2(targetFreqEnd / baseFreqEnd) * freqEnvelopeEnd) * baseFreqEnd;
                } else {
                    freqStart = targetFreqStart;
                    freqEnd = targetFreqEnd;
                }
                tone.phaseDeltas[i] = freqStart * sampleTime;
                tone.phaseDeltaScales[i] = Math.pow(freqEnd / freqStart, 1.0 / roundedSamplesPerTick);

                let amplitudeStart: number = instrument.operators[i].amplitude;
                let amplitudeEnd: number = instrument.operators[i].amplitude;
                if (i < 4) {
                    if (this.isModActive(Config.modulators.dictionary["fm slider 1"].index + i, channelIndex, tone.instrumentIndex)) {
                        amplitudeStart *= this.getModValue(Config.modulators.dictionary["fm slider 1"].index + i, channelIndex, tone.instrumentIndex, false) / 15.0;
                        amplitudeEnd *= this.getModValue(Config.modulators.dictionary["fm slider 1"].index + i, channelIndex, tone.instrumentIndex, true) / 15.0;
                    }
                } else {
                    if (this.isModActive(Config.modulators.dictionary["fm slider 5"].index + i - 4, channelIndex, tone.instrumentIndex)) {
                        amplitudeStart *= this.getModValue(Config.modulators.dictionary["fm slider 5"].index + i - 4, channelIndex, tone.instrumentIndex, false) / 15.0;
                        amplitudeEnd *= this.getModValue(Config.modulators.dictionary["fm slider 5"].index + i - 4, channelIndex, tone.instrumentIndex, true) / 15.0;
                    }
                }

                const amplitudeCurveStart: number = Synth.operatorAmplitudeCurve(amplitudeStart);
                const amplitudeCurveEnd: number = Synth.operatorAmplitudeCurve(amplitudeEnd);
                const amplitudeMultStart: number = amplitudeCurveStart * Config.operatorFrequencies[instrument.operators[i].frequency].amplitudeSign;
                const amplitudeMultEnd: number = amplitudeCurveEnd * Config.operatorFrequencies[instrument.operators[i].frequency].amplitudeSign;

                let expressionStart: number = amplitudeMultStart;
                let expressionEnd: number = amplitudeMultEnd;


                if (i < carrierCount) {
                    // carrier
                    let pitchExpressionStart: number;
                    if (tone.prevPitchExpressions[i] != null) {
                        pitchExpressionStart = tone.prevPitchExpressions[i]!;
                    } else {
                        pitchExpressionStart = Math.pow(2.0, -(pitchStart - expressionReferencePitch) / pitchDamping);
                    }
                    const pitchExpressionEnd: number = Math.pow(2.0, -(pitchEnd - expressionReferencePitch) / pitchDamping);
                    tone.prevPitchExpressions[i] = pitchExpressionEnd;
                    expressionStart *= pitchExpressionStart;
                    expressionEnd *= pitchExpressionEnd;

                    totalCarrierExpression += amplitudeCurveEnd;
                } else {
                    // modulator
                    expressionStart *= Config.sineWaveLength * 1.5;
                    expressionEnd *= Config.sineWaveLength * 1.5;

                    sineExpressionBoost *= 1.0 - Math.min(1.0, instrument.operators[i].amplitude / 15);
                }

                expressionStart *= envelopeStarts[EnvelopeComputeIndex.operatorAmplitude0 + i];
                expressionEnd *= envelopeEnds[EnvelopeComputeIndex.operatorAmplitude0 + i];

                // Check for mod-related volume delta
                // @jummbus - This amplification is also applied to modulator FM operators which distorts the sound.
                // The fix is to apply this only to carriers, but as this is a legacy bug and it can cause some interesting sounds, it's left in.
                // You can use the post volume modulator instead to avoid this effect.

                if (this.isModActive(Config.modulators.dictionary["pre volume"].index, channelIndex, tone.instrumentIndex)) {
                    // Linear falloff below 0, normal volume formula above 0. Seems to work best for scaling since the normal volume mult formula has a big gap from -25 to -24.
                    const startVal: number = this.getModValue(Config.modulators.dictionary["pre volume"].index, channelIndex, tone.instrumentIndex, false);
                    const endVal: number = this.getModValue(Config.modulators.dictionary["pre volume"].index, channelIndex, tone.instrumentIndex, true);
                    expressionStart *= ((startVal <= 0) ? ((startVal + Config.volumeRange / 2) / (Config.volumeRange / 2)) : Synth.instrumentVolumeToVolumeMult(startVal));
                    expressionEnd *= ((endVal <= 0) ? ((endVal + Config.volumeRange / 2) / (Config.volumeRange / 2)) : Synth.instrumentVolumeToVolumeMult(endVal));
                }

                tone.operatorExpressions[i] = expressionStart;
                tone.operatorExpressionDeltas[i] = (expressionEnd - expressionStart) / roundedSamplesPerTick;

            }

            sineExpressionBoost *= (Math.pow(2.0, (2.0 - 1.4 * instrument.feedbackAmplitude / 15.0)) - 1.0) / 3.0;
            sineExpressionBoost *= 1.0 - Math.min(1.0, Math.max(0.0, totalCarrierExpression - 1) / 2.0);
            sineExpressionBoost = 1.0 + sineExpressionBoost * 3.0;
            let expressionStart: number = baseExpression * sineExpressionBoost * noteFilterExpression * fadeExpressionStart * chordExpressionStart * envelopeStarts[EnvelopeComputeIndex.noteVolume];
            let expressionEnd: number = baseExpression * sineExpressionBoost * noteFilterExpression * fadeExpressionEnd * chordExpressionEnd * envelopeEnds[EnvelopeComputeIndex.noteVolume];
            if (isMono && tone.pitchCount <= instrument.monoChordTone) { //silence if tone doesn't exist
                expressionStart = 0;
                expressionEnd = 0;
            }
            tone.expression = expressionStart;
            tone.expressionDelta = (expressionEnd - expressionStart) / roundedSamplesPerTick;
            


            let useFeedbackAmplitudeStart: number = instrument.feedbackAmplitude;
            let useFeedbackAmplitudeEnd: number = instrument.feedbackAmplitude;
            if (this.isModActive(Config.modulators.dictionary["fm feedback"].index, channelIndex, tone.instrumentIndex)) {
                useFeedbackAmplitudeStart *= this.getModValue(Config.modulators.dictionary["fm feedback"].index, channelIndex, tone.instrumentIndex, false) / 15.0;
                useFeedbackAmplitudeEnd *= this.getModValue(Config.modulators.dictionary["fm feedback"].index, channelIndex, tone.instrumentIndex, true) / 15.0;
            }

            let feedbackAmplitudeStart: number = Config.sineWaveLength * 0.3 * useFeedbackAmplitudeStart / 15.0;
            const feedbackAmplitudeEnd: number = Config.sineWaveLength * 0.3 * useFeedbackAmplitudeEnd / 15.0;

            let feedbackStart: number = feedbackAmplitudeStart * envelopeStarts[EnvelopeComputeIndex.feedbackAmplitude];
            let feedbackEnd: number = feedbackAmplitudeEnd * envelopeEnds[EnvelopeComputeIndex.feedbackAmplitude];
            tone.feedbackMult = feedbackStart;
            tone.feedbackDelta = (feedbackEnd - feedbackStart) / roundedSamplesPerTick;


        } else {
            const freqEndRatio: number = Math.pow(2.0, (intervalEnd - intervalStart) * intervalScale / 12.0);
            const basePhaseDeltaScale: number = Math.pow(freqEndRatio, 1.0 / roundedSamplesPerTick);
            const isMono: boolean = chord.name == "monophonic";


            let pitch: number = tone.pitches[0];
            if (tone.pitchCount > 1 && (chord.arpeggiates || chord.customInterval || isMono)) {
                const arpeggio: number = Math.floor(instrumentState.arpTime / Config.ticksPerArpeggio);
                if (chord.customInterval) {
                    const intervalOffset: number = tone.pitches[1 + getArpeggioPitchIndex(tone.pitchCount - 1, instrument.fastTwoNoteArp, arpeggio)] - tone.pitches[0];
                    specialIntervalMult = Math.pow(2.0, intervalOffset / 12.0);
                    tone.specialIntervalExpressionMult = Math.pow(2.0, -intervalOffset / pitchDamping);
                } else if(chord.arpeggiates) {
                    pitch = tone.pitches[getArpeggioPitchIndex(tone.pitchCount, instrument.fastTwoNoteArp, arpeggio)];
                } else {
                    pitch = tone.pitches[instrument.monoChordTone];
                }
            }

            const startPitch: number = basePitch + (pitch + intervalStart) * intervalScale;
            const endPitch: number = basePitch + (pitch + intervalEnd) * intervalScale;
            let pitchExpressionStart: number;
            // TODO: use the second element of prevPitchExpressions for the unison voice, compute a separate expression delta for it.
            if (tone.prevPitchExpressions[0] != null) {
                pitchExpressionStart = tone.prevPitchExpressions[0]!;
            } else {
                pitchExpressionStart = Math.pow(2.0, -(startPitch - expressionReferencePitch) / pitchDamping);
            }
            const pitchExpressionEnd: number = Math.pow(2.0, -(endPitch - expressionReferencePitch) / pitchDamping);
            tone.prevPitchExpressions[0] = pitchExpressionEnd;
            let settingsExpressionMult: number = baseExpression * noteFilterExpression;

            if (instrument.type == InstrumentType.noise) {
                settingsExpressionMult *= Config.chipNoises[instrument.chipNoise].expression;
            }
            if (instrument.type == InstrumentType.chip) {
                settingsExpressionMult *= Config.chipWaves[instrument.chipWave].expression;
            }
            if (instrument.type == InstrumentType.pwm) {
                const basePulseWidth: number = getPulseWidthRatio(instrument.pulseWidth);

                // Check for PWM mods to this instrument
                let pulseWidthModStart: number = basePulseWidth;
                let pulseWidthModEnd: number = basePulseWidth;
                if (this.isModActive(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex)) {
                    pulseWidthModStart = (this.getModValue(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex, false)) / (Config.pulseWidthRange * 2);
                    pulseWidthModEnd = (this.getModValue(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex, true)) / (Config.pulseWidthRange * 2);
                }

                const pulseWidthStart: number = pulseWidthModStart * envelopeStarts[EnvelopeComputeIndex.pulseWidth];
                const pulseWidthEnd: number = pulseWidthModEnd * envelopeEnds[EnvelopeComputeIndex.pulseWidth];
                tone.pulseWidth = pulseWidthStart;
                tone.pulseWidthDelta = (pulseWidthEnd - pulseWidthStart) / roundedSamplesPerTick;

                //decimal offset mods
                let decimalOffsetModStart: number = instrument.decimalOffset;
                if (this.isModActive(Config.modulators.dictionary["decimal offset"].index, channelIndex, tone.instrumentIndex)) {
                    decimalOffsetModStart = this.getModValue(Config.modulators.dictionary["decimal offset"].index, channelIndex, tone.instrumentIndex, false);
                }

                const decimalOffsetStart: number = decimalOffsetModStart * envelopeStarts[EnvelopeComputeIndex.decimalOffset];
                tone.decimalOffset = decimalOffsetStart;

                tone.pulseWidth -= (tone.decimalOffset) / 10000;
            }
            if (instrument.type == InstrumentType.pickedString) {
                // Check for sustain mods
                let useSustainStart: number = instrument.stringSustain;
                let useSustainEnd: number = instrument.stringSustain;
                if (this.isModActive(Config.modulators.dictionary["sustain"].index, channelIndex, tone.instrumentIndex)) {
                    useSustainStart = this.getModValue(Config.modulators.dictionary["sustain"].index, channelIndex, tone.instrumentIndex, false);
                    useSustainEnd = this.getModValue(Config.modulators.dictionary["sustain"].index, channelIndex, tone.instrumentIndex, true);
                }

                tone.stringSustainStart = useSustainStart;
                tone.stringSustainEnd = useSustainEnd;

                // Increase expression to compensate for string decay.
                settingsExpressionMult *= Math.pow(2.0, 0.7 * (1.0 - useSustainStart / (Config.stringSustainRange - 1)));

            }

            const startFreq: number = Instrument.frequencyFromPitch(startPitch);
            if (instrument.type == InstrumentType.chip || instrument.type == InstrumentType.customChipWave || instrument.type == InstrumentType.harmonics || instrument.type == InstrumentType.pickedString || instrument.type == InstrumentType.spectrum || instrument.type == InstrumentType.pwm || instrument.type == InstrumentType.noise || instrument.type == InstrumentType.drumset) {
                const unisonVoices: number = instrument.unisonVoices;
                const unisonSpread: number = instrument.unisonSpread;
                const unisonOffset: number = instrument.unisonOffset;
                const unisonExpression: number = instrument.unisonExpression;
                const voiceCountExpression: number = (instrument.type == InstrumentType.pickedString) ? 1 : unisonVoices / 2.0;
                settingsExpressionMult *= unisonExpression * voiceCountExpression;
                const unisonEnvelopeStart = envelopeStarts[EnvelopeComputeIndex.unison];
                const unisonEnvelopeEnd = envelopeEnds[EnvelopeComputeIndex.unison];
                const unisonStartA: number = Math.pow(2.0, (unisonOffset + unisonSpread) * unisonEnvelopeStart / 12.0);
                const unisonEndA: number = Math.pow(2.0, (unisonOffset + unisonSpread) * unisonEnvelopeEnd / 12.0);
                tone.phaseDeltas[0] = startFreq * sampleTime * unisonStartA;
                tone.phaseDeltaScales[0] = basePhaseDeltaScale * Math.pow(unisonEndA / unisonStartA, 1.0 / roundedSamplesPerTick);
                const divisor = (unisonVoices == 1) ? 1 : (unisonVoices - 1);
                for (let i: number = 1; i < unisonVoices; i++) {
                    const unisonStart: number = Math.pow(2.0, (unisonOffset + unisonSpread - (2 * i * unisonSpread / divisor)) * unisonEnvelopeStart / 12.0) * (specialIntervalMult);
                    const unisonEnd: number = Math.pow(2.0, (unisonOffset + unisonSpread - (2 * i * unisonSpread / divisor)) * unisonEnvelopeEnd / 12.0) * (specialIntervalMult);
                    tone.phaseDeltas[i] = startFreq * sampleTime * unisonStart;
                    tone.phaseDeltaScales[i] = basePhaseDeltaScale * Math.pow(unisonEnd / unisonStart, 1.0 / roundedSamplesPerTick);
                }
                for (let i: number = unisonVoices; i < Config.unisonVoicesMax; i++) {
                    tone.phaseDeltas[i] = tone.phaseDeltas[0];
                    tone.phaseDeltaScales[i] = tone.phaseDeltaScales[0];
                }
                
            } else {
                tone.phaseDeltas[0] = startFreq * sampleTime;
                tone.phaseDeltaScales[0] = basePhaseDeltaScale;
            }

            // TODO: make expressionStart and expressionEnd variables earlier and modify those
            // instead of these supersawExpression variables.
            let supersawExpressionStart: number = 1.0;
            let supersawExpressionEnd: number = 1.0;
            if (instrument.type == InstrumentType.supersaw) {
                const minFirstVoiceAmplitude: number = 1.0 / Math.sqrt(Config.supersawVoiceCount);

                // Dynamism mods
                let useDynamismStart: number = instrument.supersawDynamism / Config.supersawDynamismMax;
                let useDynamismEnd: number = instrument.supersawDynamism / Config.supersawDynamismMax;
                if (this.isModActive(Config.modulators.dictionary["dynamism"].index, channelIndex, tone.instrumentIndex)) {
                    useDynamismStart = (this.getModValue(Config.modulators.dictionary["dynamism"].index, channelIndex, tone.instrumentIndex, false)) / Config.supersawDynamismMax;
                    useDynamismEnd = (this.getModValue(Config.modulators.dictionary["dynamism"].index, channelIndex, tone.instrumentIndex, true)) / Config.supersawDynamismMax;
                }

                const curvedDynamismStart: number = 1.0 - Math.pow(Math.max(0.0, 1.0 - useDynamismStart * envelopeStarts[EnvelopeComputeIndex.supersawDynamism]), 0.2);
                const curvedDynamismEnd: number = 1.0 - Math.pow(Math.max(0.0, 1.0 - useDynamismEnd * envelopeEnds[EnvelopeComputeIndex.supersawDynamism]), 0.2);
                const firstVoiceAmplitudeStart: number = Math.pow(2.0, Math.log2(minFirstVoiceAmplitude) * curvedDynamismStart);
                const firstVoiceAmplitudeEnd: number = Math.pow(2.0, Math.log2(minFirstVoiceAmplitude) * curvedDynamismEnd);

                const dynamismStart: number = Math.sqrt((1.0 / Math.pow(firstVoiceAmplitudeStart, 2.0) - 1.0) / (Config.supersawVoiceCount - 1.0));
                const dynamismEnd: number = Math.sqrt((1.0 / Math.pow(firstVoiceAmplitudeEnd, 2.0) - 1.0) / (Config.supersawVoiceCount - 1.0));
                tone.supersawDynamism = dynamismStart;
                tone.supersawDynamismDelta = (dynamismEnd - dynamismStart) / roundedSamplesPerTick;

                const initializeSupersaw: boolean = (tone.supersawDelayIndex == -1);
                if (initializeSupersaw) {
                    // Goal: generate sawtooth phases such that the combined initial amplitude
                    // cancel out to minimize pop. Algorithm: generate sorted phases, iterate over
                    // their sawtooth drop points to find a combined zero crossing, then offset the
                    // phases so they start there.

                    // Generate random phases in ascending order by adding positive randomly
                    // sized gaps between adjacent phases. For a proper distribution of random
                    // events, the gaps sizes should be an "exponential distribution", which is
                    // just: -Math.log(Math.random()). At the end, normalize the phases to a 0-1
                    // range by dividing by the final value of the accumulator.
                    let accumulator: number = 0.0;
                    for (let i: number = 0; i < Config.supersawVoiceCount; i++) {
                        tone.phases[i] = accumulator;
                        accumulator += -Math.log(Math.random());
                    }

                    const amplitudeSum: number = 1.0 + (Config.supersawVoiceCount - 1.0) * dynamismStart;
                    const slope: number = amplitudeSum;

                    // Find the initial amplitude of the sum of sawtooths with the normalized
                    // set of phases.
                    let sample: number = 0.0;
                    for (let i: number = 0; i < Config.supersawVoiceCount; i++) {
                        const amplitude: number = (i == 0) ? 1.0 : dynamismStart;
                        const normalizedPhase: number = tone.phases[i] / accumulator;
                        tone.phases[i] = normalizedPhase;
                        sample += (normalizedPhase - 0.5) * amplitude;
                    }

                    // Find the phase of the zero crossing of the sum of the sawtooths. You can
                    // use a constant slope and the distance between sawtooth drops to determine if
                    // the zero crossing occurs between them. Note that a small phase means that
                    // the corresponding drop for that wave is far away, and a big phase means the
                    // drop is nearby, so to iterate forward through the drops we iterate backward
                    // through the phases.
                    let zeroCrossingPhase: number = 1.0;
                    let prevDrop: number = 0.0;
                    for (let i: number = Config.supersawVoiceCount - 1; i >= 0; i--) {
                        const nextDrop: number = 1.0 - tone.phases[i];
                        const phaseDelta: number = nextDrop - prevDrop;
                        if (sample < 0.0) {
                            const distanceToZeroCrossing: number = -sample / slope;
                            if (distanceToZeroCrossing < phaseDelta) {
                                zeroCrossingPhase = prevDrop + distanceToZeroCrossing;
                                break;
                            }
                        }
                        const amplitude: number = (i == 0) ? 1.0 : dynamismStart;
                        sample += phaseDelta * slope - amplitude;
                        prevDrop = nextDrop;
                    }
                    for (let i: number = 0; i < Config.supersawVoiceCount; i++) {
                        tone.phases[i] += zeroCrossingPhase;
                    }

                    // Randomize the (initially sorted) order of the phases (aside from the
                    // first one) so that they don't correlate to the detunes that are also
                    // based on index.
                    for (let i: number = 1; i < Config.supersawVoiceCount - 1; i++) {
                        const swappedIndex: number = i + Math.floor(Math.random() * (Config.supersawVoiceCount - i));
                        const temp: number = tone.phases[i];
                        tone.phases[i] = tone.phases[swappedIndex];
                        tone.phases[swappedIndex] = temp;
                    }
                }

                const baseSpreadSlider: number = instrument.supersawSpread / Config.supersawSpreadMax;
                // Spread mods
                let useSpreadStart: number = baseSpreadSlider;
                let useSpreadEnd: number = baseSpreadSlider;
                if (this.isModActive(Config.modulators.dictionary["spread"].index, channelIndex, tone.instrumentIndex)) {
                    useSpreadStart = (this.getModValue(Config.modulators.dictionary["spread"].index, channelIndex, tone.instrumentIndex, false)) / Config.supersawSpreadMax;
                    useSpreadEnd = (this.getModValue(Config.modulators.dictionary["spread"].index, channelIndex, tone.instrumentIndex, true)) / Config.supersawSpreadMax;
                }

                const spreadSliderStart: number = useSpreadStart * envelopeStarts[EnvelopeComputeIndex.supersawSpread];
                const spreadSliderEnd: number = useSpreadEnd * envelopeEnds[EnvelopeComputeIndex.supersawSpread];
                // Just use the average detune for the current tick in the below loop.
                const averageSpreadSlider: number = (spreadSliderStart + spreadSliderEnd) * 0.5;
                const curvedSpread: number = Math.pow(1.0 - Math.sqrt(Math.max(0.0, 1.0 - averageSpreadSlider)), 1.75);
                for (let i = 0; i < Config.supersawVoiceCount; i++) {
                    // Spread out the detunes around the center;
                    const offset: number = (i == 0) ? 0.0 : Math.pow((((i + 1) >> 1) - 0.5 + 0.025 * ((i & 2) - 1)) / (Config.supersawVoiceCount >> 1), 1.1) * ((i & 1) * 2 - 1);
                    tone.supersawUnisonDetunes[i] = Math.pow(2.0, curvedSpread * offset / 12.0);
                }

                const baseShape: number = instrument.supersawShape / Config.supersawShapeMax;
                // Saw shape mods
                let useShapeStart: number = baseShape * envelopeStarts[EnvelopeComputeIndex.supersawShape];
                let useShapeEnd: number = baseShape * envelopeEnds[EnvelopeComputeIndex.supersawShape];
                if (this.isModActive(Config.modulators.dictionary["saw shape"].index, channelIndex, tone.instrumentIndex)) {
                    useShapeStart = (this.getModValue(Config.modulators.dictionary["saw shape"].index, channelIndex, tone.instrumentIndex, false)) / Config.supersawShapeMax;
                    useShapeEnd = (this.getModValue(Config.modulators.dictionary["saw shape"].index, channelIndex, tone.instrumentIndex, true)) / Config.supersawShapeMax;
                }

                const shapeStart: number = useShapeStart * envelopeStarts[EnvelopeComputeIndex.supersawShape];
                const shapeEnd: number = useShapeEnd * envelopeEnds[EnvelopeComputeIndex.supersawShape];
                tone.supersawShape = shapeStart;
                tone.supersawShapeDelta = (shapeEnd - shapeStart) / roundedSamplesPerTick;

                //decimal offset mods
                let decimalOffsetModStart: number = instrument.decimalOffset;
                if (this.isModActive(Config.modulators.dictionary["decimal offset"].index, channelIndex, tone.instrumentIndex)) {
                    decimalOffsetModStart = this.getModValue(Config.modulators.dictionary["decimal offset"].index, channelIndex, tone.instrumentIndex, false);
                }

                const decimalOffsetStart: number = decimalOffsetModStart * envelopeStarts[EnvelopeComputeIndex.decimalOffset];
                // ...is including tone.decimalOffset still necessary?
                tone.decimalOffset = decimalOffsetStart;

                const basePulseWidth: number = getPulseWidthRatio(instrument.pulseWidth);

                // Check for PWM mods to this instrument
                let pulseWidthModStart: number = basePulseWidth;
                let pulseWidthModEnd: number = basePulseWidth;
                if (this.isModActive(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex)) {
                    pulseWidthModStart = (this.getModValue(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex, false)) / (Config.pulseWidthRange * 2);
                    pulseWidthModEnd = (this.getModValue(Config.modulators.dictionary["pulse width"].index, channelIndex, tone.instrumentIndex, true)) / (Config.pulseWidthRange * 2);
                }

                let pulseWidthStart: number = pulseWidthModStart * envelopeStarts[EnvelopeComputeIndex.pulseWidth];
                let pulseWidthEnd: number = pulseWidthModEnd * envelopeEnds[EnvelopeComputeIndex.pulseWidth];
                pulseWidthStart -= decimalOffsetStart / 10000;
                pulseWidthEnd -= decimalOffsetStart / 10000;
                const phaseDeltaStart: number = (tone.supersawPrevPhaseDelta != null) ? tone.supersawPrevPhaseDelta : startFreq * sampleTime;
                const phaseDeltaEnd: number = startFreq * sampleTime * freqEndRatio;
                tone.supersawPrevPhaseDelta = phaseDeltaEnd;
                const delayLengthStart = pulseWidthStart / phaseDeltaStart;
                const delayLengthEnd = pulseWidthEnd / phaseDeltaEnd;
                tone.supersawDelayLength = delayLengthStart;
                tone.supersawDelayLengthDelta = (delayLengthEnd - delayLengthStart) / roundedSamplesPerTick;
                const minBufferLength: number = Math.ceil(Math.max(delayLengthStart, delayLengthEnd)) + 2;

                if (tone.supersawDelayLine == null || tone.supersawDelayLine.length <= minBufferLength) {
                    // The delay line buffer will get reused for other tones so might as well
                    // start off with a buffer size that is big enough for most notes.
                    const likelyMaximumLength: number = Math.ceil(0.5 * this.samplesPerSecond / Instrument.frequencyFromPitch(24));
                    const newDelayLine: Float32Array = new Float32Array(fittingPowerOfTwo(Math.max(likelyMaximumLength, minBufferLength)));
                    if (!initializeSupersaw && tone.supersawDelayLine != null) {
                        // If the tone has already started but the buffer needs to be reallocated,
                        // transfer the old data to the new buffer.
                        const oldDelayBufferMask: number = (tone.supersawDelayLine.length - 1) >> 0;
                        const startCopyingFromIndex: number = tone.supersawDelayIndex;
                        for (let i: number = 0; i < tone.supersawDelayLine.length; i++) {
                            newDelayLine[i] = tone.supersawDelayLine[(startCopyingFromIndex + i) & oldDelayBufferMask];
                        }
                    }
                    tone.supersawDelayLine = newDelayLine;
                    tone.supersawDelayIndex = tone.supersawDelayLine.length;
                } else if (initializeSupersaw) {
                    tone.supersawDelayLine.fill(0.0);
                    tone.supersawDelayIndex = tone.supersawDelayLine.length;
                }

                const pulseExpressionRatio: number = Config.pwmBaseExpression / Config.supersawBaseExpression;
                supersawExpressionStart *= (1.0 + (pulseExpressionRatio - 1.0) * shapeStart) / Math.sqrt(1.0 + (Config.supersawVoiceCount - 1.0) * dynamismStart * dynamismStart);
                supersawExpressionEnd *= (1.0 + (pulseExpressionRatio - 1.0) * shapeEnd) / Math.sqrt(1.0 + (Config.supersawVoiceCount - 1.0) * dynamismEnd * dynamismEnd);
            }

            let expressionStart: number = settingsExpressionMult * fadeExpressionStart * chordExpressionStart * pitchExpressionStart * envelopeStarts[EnvelopeComputeIndex.noteVolume] * supersawExpressionStart;
            let expressionEnd: number = settingsExpressionMult * fadeExpressionEnd * chordExpressionEnd * pitchExpressionEnd * envelopeEnds[EnvelopeComputeIndex.noteVolume] * supersawExpressionEnd;

            // Check for mod-related volume delta
            if (this.isModActive(Config.modulators.dictionary["pre volume"].index, channelIndex, tone.instrumentIndex)) {
                // Linear falloff below 0, normal volume formula above 0. Seems to work best for scaling since the normal volume mult formula has a big gap from -25 to -24.
                const startVal: number = this.getModValue(Config.modulators.dictionary["pre volume"].index, channelIndex, tone.instrumentIndex, false);
                const endVal: number = this.getModValue(Config.modulators.dictionary["pre volume"].index, channelIndex, tone.instrumentIndex, true)
                expressionStart *= ((startVal <= 0) ? ((startVal + Config.volumeRange / 2) / (Config.volumeRange / 2)) : Synth.instrumentVolumeToVolumeMult(startVal));
                expressionEnd *= ((endVal <= 0) ? ((endVal + Config.volumeRange / 2) / (Config.volumeRange / 2)) : Synth.instrumentVolumeToVolumeMult(endVal));
            }
            if (isMono && tone.pitchCount <= instrument.monoChordTone) { //silence if tone doesn't exist
                expressionStart = 0;
                expressionEnd = 0;
                instrumentState.awake = false;
            }

            tone.expression = expressionStart;
            tone.expressionDelta = (expressionEnd - expressionStart) / roundedSamplesPerTick;


            if (instrument.type == InstrumentType.pickedString) {
                let stringDecayStart: number;
                if (tone.prevStringDecay != null) {
                    stringDecayStart = tone.prevStringDecay;
                } else {
                    const sustainEnvelopeStart: number = tone.envelopeComputer.envelopeStarts[EnvelopeComputeIndex.stringSustain];
                    stringDecayStart = 1.0 - Math.min(1.0, sustainEnvelopeStart * tone.stringSustainStart / (Config.stringSustainRange - 1));
                }
                const sustainEnvelopeEnd: number = tone.envelopeComputer.envelopeEnds[EnvelopeComputeIndex.stringSustain];
                let stringDecayEnd: number = 1.0 - Math.min(1.0, sustainEnvelopeEnd * tone.stringSustainEnd / (Config.stringSustainRange - 1));
                tone.prevStringDecay = stringDecayEnd;

                //const unison: Unison = Config.unisons[instrument.unison];
                const unisonVoices: number = instrument.unisonVoices;
                for (let i: number = tone.pickedStrings.length; i < unisonVoices; i++) {
                    tone.pickedStrings[i] = new PickedString();
                }

                if (tone.atNoteStart && !transition.continues && !tone.forceContinueAtStart) {
                    for (const pickedString of tone.pickedStrings) {
                        // Force the picked string to retrigger the attack impulse at the start of the note.
                        pickedString.delayIndex = -1;
                    }
                }

                for (let i: number = 0; i < unisonVoices; i++) {
                    tone.pickedStrings[i].update(this, instrumentState, tone, i, roundedSamplesPerTick, stringDecayStart, stringDecayEnd, instrument.stringSustainType);
                }
            }
        }
    }

    public static getLFOAmplitude(instrument: Instrument, secondsIntoBar: number): number {
        let effect: number = 0.0;
        for (const vibratoPeriodSeconds of Config.vibratoTypes[instrument.vibratoType].periodsSeconds) {
            effect += Math.sin(Math.PI * 2.0 * secondsIntoBar / vibratoPeriodSeconds);
        }
        return effect;
    }


    public static getInstrumentSynthFunction(instrument: Instrument): Function {
        if (instrument.type == InstrumentType.fm) {
            const fingerprint: string = instrument.algorithm + "_" + instrument.feedbackType;
            if (Synth.fmSynthFunctionCache[fingerprint] == undefined) {
                const synthSource: string[] = [];

                for (const line of Synth.fmSourceTemplate) {
                    if (line.indexOf("// CARRIER OUTPUTS") != -1) {
                        const outputs: string[] = [];
                        for (let j: number = 0; j < Config.algorithms[instrument.algorithm].carrierCount; j++) {
                            outputs.push("operator" + j + "Scaled");
                        }
                        synthSource.push(line.replace("/*operator#Scaled*/", outputs.join(" + ")));
                    } else if (line.indexOf("// INSERT OPERATOR COMPUTATION HERE") != -1) {
                        for (let j: number = Config.operatorCount - 1; j >= 0; j--) {
                            for (const operatorLine of Synth.operatorSourceTemplate) {
                                if (operatorLine.indexOf("/* + operator@Scaled*/") != -1) {
                                    let modulators = "";
                                    for (const modulatorNumber of Config.algorithms[instrument.algorithm].modulatedBy[j]) {
                                        modulators += " + operator" + (modulatorNumber - 1) + "Scaled";
                                    }

                                    const feedbackIndices: ReadonlyArray<number> = Config.feedbacks[instrument.feedbackType].indices[j];
                                    if (feedbackIndices.length > 0) {
                                        modulators += " + feedbackMult * (";
                                        const feedbacks: string[] = [];
                                        for (const modulatorNumber of feedbackIndices) {
                                            feedbacks.push("operator" + (modulatorNumber - 1) + "Output");
                                        }
                                        modulators += feedbacks.join(" + ") + ")";
                                    }
                                    synthSource.push(operatorLine.replace(/\#/g, j + "").replace("/* + operator@Scaled*/", modulators));
                                } else {
                                    synthSource.push(operatorLine.replace(/\#/g, j + ""));
                                }
                            }
                        }
                    } else if (line.indexOf("#") != -1) {
                        for (let j: number = 0; j < Config.operatorCount; j++) {
                            synthSource.push(line.replace(/\#/g, j + ""));
                        }
                    } else {
                        synthSource.push(line);
                    }
                }

                //console.log(synthSource.join("\n"));

                const wrappedFmSynth: string = "return (synth, bufferIndex, roundedSamplesPerTick, tone, instrument) => {" + synthSource.join("\n") + "}";

                Synth.fmSynthFunctionCache[fingerprint] = new Function("Config", "Synth", wrappedFmSynth)(Config, Synth);

            }
            return Synth.fmSynthFunctionCache[fingerprint];
        } else if (instrument.type == InstrumentType.chip) {
            // advloop addition
            if (instrument.isUsingAdvancedLoopControls) {
                return Synth.loopableChipSynth;
            }
            // advloop addition
            return Synth.chipSynth;
        } else if (instrument.type == InstrumentType.customChipWave) {
            return Synth.chipSynth;
        } else if (instrument.type == InstrumentType.harmonics) {
            return Synth.harmonicsSynth;
        } else if (instrument.type == InstrumentType.pwm) {
            return Synth.pulseWidthSynth;
        } else if (instrument.type == InstrumentType.supersaw) {
            return Synth.supersawSynth;
        } else if (instrument.type == InstrumentType.pickedString) {
            return Synth.pickedStringSynth;
        } else if (instrument.type == InstrumentType.noise) {
            return Synth.noiseSynth;
        } else if (instrument.type == InstrumentType.spectrum) {
            return Synth.spectrumSynth;
        } else if (instrument.type == InstrumentType.drumset) {
            return Synth.drumsetSynth;
        } else if (instrument.type == InstrumentType.mod) {
            return Synth.modSynth;
        } else if (instrument.type == InstrumentType.fm6op) {
            const fingerprint: string = instrument.customAlgorithm.name + "_" + instrument.customFeedbackType.name;
            if (Synth.fm6SynthFunctionCache[fingerprint] == undefined) {
                const synthSource: string[] = [];

                for (const line of Synth.fmSourceTemplate) {
                    if (line.indexOf("// CARRIER OUTPUTS") != -1) {
                        const outputs: string[] = [];
                        for (let j: number = 0; j < instrument.customAlgorithm.carrierCount; j++) {
                            outputs.push("operator" + j + "Scaled");
                        }
                        synthSource.push(line.replace("/*operator#Scaled*/", outputs.join(" + ")));
                    } else if (line.indexOf("// INSERT OPERATOR COMPUTATION HERE") != -1) {
                        for (let j: number = Config.operatorCount + 2 - 1; j >= 0; j--) {
                            for (const operatorLine of Synth.operatorSourceTemplate) {
                                if (operatorLine.indexOf("/* + operator@Scaled*/") != -1) {
                                    let modulators = "";
                                    for (const modulatorNumber of instrument.customAlgorithm.modulatedBy[j]) {
                                        modulators += " + operator" + (modulatorNumber - 1) + "Scaled";
                                    }

                                    const feedbackIndices: ReadonlyArray<number> = instrument.customFeedbackType.indices[j];
                                    if (feedbackIndices.length > 0) {
                                        modulators += " + feedbackMult * (";
                                        const feedbacks: string[] = [];
                                        for (const modulatorNumber of feedbackIndices) {
                                            feedbacks.push("operator" + (modulatorNumber - 1) + "Output");
                                        }
                                        modulators += feedbacks.join(" + ") + ")";
                                    }
                                    synthSource.push(operatorLine.replace(/\#/g, j + "").replace("/* + operator@Scaled*/", modulators));
                                } else {
                                    synthSource.push(operatorLine.replace(/\#/g, j + ""));
                                }
                            }
                        }
                    } else if (line.indexOf("#") != -1) {
                        for (let j = 0; j < Config.operatorCount + 2; j++) {
                            synthSource.push(line.replace(/\#/g, j + ""));
                        }
                    } else {
                        synthSource.push(line);
                    }
                }

                //console.log(synthSource.join("\n"));

                const wrappedFm6Synth: string = "return (synth, bufferIndex, roundedSamplesPerTick, tone, instrument) => {" + synthSource.join("\n") + "}";

                Synth.fm6SynthFunctionCache[fingerprint] = new Function("Config", "Synth", wrappedFm6Synth)(Config, Synth);
            }
            return Synth.fm6SynthFunctionCache[fingerprint];
        } else {
            throw new Error("Unrecognized instrument type: " + instrument.type);
        }
    }
    // advloop addition
    static wrap(x: number, b: number): number {
        return (x % b + b) % b;
    }
	static loopableChipSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrumentState: InstrumentState): void {
		// @TODO:
		// - Longer declicking? This is more difficult than I thought.
		//   When determining this automatically is difficult (or the input
		//   samples are expected to vary too much), this is left up to the
		//   user.
		const aliases: boolean = (instrumentState.effectsIncludeType(EffectType.distortion) && instrumentState.aliases);
        // const aliases = false;
        const stereoChannels: number = instrumentState.stereoChannels;
        let dataL: Float32Array = synth.tempInstrumentSampleBufferL!;
        let dataR: Float32Array = synth.tempInstrumentSampleBufferR!;
        let waveL: Float32Array = instrumentState.waveL!;
        let waveR: Float32Array = instrumentState.waveR!;

        //TODO: it makes sense to avoid doing stereo calculations if both channels are the same
        if (stereoChannels == 0) {
            dataL = synth.tempInstrumentSampleBufferL!;
            dataR = synth.tempInstrumentSampleBufferL!;
            waveL = instrumentState.waveL!;
            waveR = instrumentState.waveL!;
        }
        else if (stereoChannels == 1) {
            dataL = synth.tempInstrumentSampleBufferR!;
            dataR = synth.tempInstrumentSampleBufferR!;
            waveL = instrumentState.waveR!;
            waveR = instrumentState.waveR!;
        }

		const volumeScale: number = instrumentState.volumeScale;
		const waveLength: number = (aliases && instrumentState.type == 8) ? waveL.length : waveL.length - 1;
		let chipWaveLoopEnd: number = Math.max(0, Math.min(waveLength, instrumentState.chipWaveLoopEnd));
		let chipWaveLoopStart: number = Math.max(0, Math.min(chipWaveLoopEnd - 1, instrumentState.chipWaveLoopStart));
		// @TODO: This is where to set things up for the release loop mode.
		// const ticksSinceReleased = tone.ticksSinceReleased;
		// if (ticksSinceReleased > 0) {
		//     chipWaveLoopStart = 0;
		//     chipWaveLoopEnd = waveLength - 1;
		// }
		let chipWaveLoopLength: number = chipWaveLoopEnd - chipWaveLoopStart;
		if (chipWaveLoopLength < 2) {
			chipWaveLoopStart = 0;
			chipWaveLoopEnd = waveLength;
			chipWaveLoopLength = waveLength;
		}
		const chipWaveLoopMode: number = instrumentState.chipWaveLoopMode;
        const chipWavePlayBackwards: boolean = instrumentState.chipWavePlayBackwards;
		const unisonSign: number = tone.specialIntervalExpressionMult * instrumentState.unisonSign;
		if (instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval)
			tone.phases[1] = tone.phases[0];
		let phaseDeltaA: number = tone.phaseDeltas[0] * waveLength;
		let phaseDeltaB: number = tone.phaseDeltas[1] * waveLength;
		let directionA: number = tone.directions[0];
		let directionB: number = tone.directions[1];
		let chipWaveCompletionA: number = tone.chipWaveCompletions[0];
		let chipWaveCompletionB: number = tone.chipWaveCompletions[1];
		if (chipWaveLoopMode === 3 || chipWaveLoopMode === 2 || chipWaveLoopMode === 0) {
			// If playing once or looping, we force the correct direction,
			// since it shouldn't really change. This is mostly so that if
			// the mode is changed midway through playback, it won't get
			// stuck on the wrong direction.
			if (!chipWavePlayBackwards) {
				directionA = 1;
				directionB = 1;
			} else {
				directionA = -1;
				directionB = -1;
			}
		}
		if (chipWaveLoopMode === 0 || chipWaveLoopMode === 1) {
			// If looping or ping-ponging, we clear the completion status,
			// as it's not relevant anymore. This is mostly so that if the
			// mode is changed midway through playback, it won't get stuck
			// on zero volume.
			chipWaveCompletionA = 0;
			chipWaveCompletionB = 0;
		}
		let lastWaveLA: number = tone.chipWaveCompletionsLastWaveL[0];
		let lastWaveLB: number = tone.chipWaveCompletionsLastWaveL[1];
		let lastWaveRA: number = tone.chipWaveCompletionsLastWaveR[0];
		let lastWaveRB: number = tone.chipWaveCompletionsLastWaveR[1];
		const chipWaveCompletionFadeLength: number = 1000;
		const phaseDeltaScaleA: number = +tone.phaseDeltaScales[0];
		const phaseDeltaScaleB: number = +tone.phaseDeltaScales[1];
		let expression: number = +tone.expression;
		const expressionDelta: number = +tone.expressionDelta;
		let phaseA: number = Synth.wrap(tone.phases[0], 1) * waveLength;
		let phaseB: number = Synth.wrap(tone.phases[1], 1) * waveLength;
		let prevWaveIntegralLA: number = 0;
		let prevWaveIntegralLB: number = 0;
		let prevWaveIntegralRA: number = 0;
		let prevWaveIntegralRB: number = 0;
		if (!aliases) {
			const phaseAInt = Math.floor(phaseA);
			const phaseBInt = Math.floor(phaseB);
			const indexA = Synth.wrap(phaseAInt, waveLength);
			const indexB = Synth.wrap(phaseBInt, waveLength);
			const phaseRatioA = phaseA - phaseAInt;
			const phaseRatioB = phaseB - phaseBInt;
			prevWaveIntegralLA = +waveL[indexA];
			prevWaveIntegralLB = +waveL[indexB];
			prevWaveIntegralRA = +waveR[indexA];
			prevWaveIntegralRB = +waveR[indexB];
			prevWaveIntegralLA += (waveL[Synth.wrap(indexA + 1, waveLength)] - prevWaveIntegralLA) * phaseRatioA;
			prevWaveIntegralLB += (waveL[Synth.wrap(indexB + 1, waveLength)] - prevWaveIntegralLB) * phaseRatioB;
			prevWaveIntegralRA += (waveR[Synth.wrap(indexA + 1, waveLength)] - prevWaveIntegralRA) * phaseRatioA;
			prevWaveIntegralRB += (waveR[Synth.wrap(indexB + 1, waveLength)] - prevWaveIntegralRB) * phaseRatioB;
		}
		const filtersL = tone.noteFiltersL;
		const filtersR = tone.noteFiltersR;
		const filterCount: number = tone.noteFilterCount | 0;
		let initialFilterInputL1: number = +tone.initialNoteFilterInputL1;
		let initialFilterInputR1: number = +tone.initialNoteFilterInputR1;
		let initialFilterInputL2: number = +tone.initialNoteFilterInputL2;
		let initialFilterInputR2: number = +tone.initialNoteFilterInputR2;
		const applyFilters: Function = Synth.applyFilters;
		const stopIndex: number = bufferIndex + roundedSamplesPerTick;
		let prevWaveLA: number = tone.chipWavePrevWavesL[0];
		let prevWaveLB: number = tone.chipWavePrevWavesL[1];
		let prevWaveRA: number = tone.chipWavePrevWavesR[0];
		let prevWaveRB: number = tone.chipWavePrevWavesR[1];
		for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
			if (chipWaveCompletionA > 0 && chipWaveCompletionA < chipWaveCompletionFadeLength) {
				chipWaveCompletionA++;
			}
			if (chipWaveCompletionB > 0 && chipWaveCompletionB < chipWaveCompletionFadeLength) {
				chipWaveCompletionB++;
			}
			let wrapped: number = 0;
			phaseA += phaseDeltaA * directionA;
			phaseB += phaseDeltaB * directionB;
			if (chipWaveLoopMode === 2) {
				// once
				if (directionA === 1) {
					if (phaseA > waveLength) {
						if (chipWaveCompletionA <= 0) {
							lastWaveLA = prevWaveLA;
							lastWaveRA = prevWaveRA;
							chipWaveCompletionA++;
						}
						wrapped = 1;
					}
				} else if (directionA === -1) {
					if (phaseA < 0) {
						if (chipWaveCompletionA <= 0) {
							lastWaveLA = prevWaveLA;
							lastWaveRA = prevWaveRA;
							chipWaveCompletionA++;
						}
						wrapped = 1;
					}
				}
				if (directionB === 1) {
					if (phaseB > waveLength) {
						if (chipWaveCompletionB <= 0) {
							lastWaveLB = prevWaveLB;
							lastWaveRB = prevWaveRB;
							chipWaveCompletionB++;
						}
						wrapped = 1;
					}
				} else if (directionA === -1) {
					if (phaseB < 0) {
						if (chipWaveCompletionB <= 0) {
							lastWaveLB = prevWaveLB;
							lastWaveRB = prevWaveRB;
							chipWaveCompletionB++;
						}
						wrapped = 1;
					}
				}
			} else if (chipWaveLoopMode === 3) {
				// loop once
				if (directionA === 1) {
					if (phaseA > chipWaveLoopEnd) {
						if (chipWaveCompletionA <= 0) {
							lastWaveLA = prevWaveLA;
							lastWaveRA = prevWaveRA;
							chipWaveCompletionA++;
						}
						wrapped = 1;
					}
				} else if (directionA === -1) {
					if (phaseA < chipWaveLoopStart) {
						if (chipWaveCompletionA <= 0) {
							lastWaveLA = prevWaveLA;
							lastWaveRA = prevWaveRA;
							chipWaveCompletionA++;
						}
						wrapped = 1;
					}
				}
				if (directionB === 1) {
					if (phaseB > chipWaveLoopEnd) {
						if (chipWaveCompletionB <= 0) {
							lastWaveLB = prevWaveLB;
							lastWaveRB = prevWaveRB;
							chipWaveCompletionB++;
						}
						wrapped = 1;
					}
				} else if (directionA === -1) {
					if (phaseB < chipWaveLoopStart) {
						if (chipWaveCompletionB <= 0) {
							lastWaveLB = prevWaveLB;
							lastWaveRB = prevWaveRB;
							chipWaveCompletionB++;
						}
						wrapped = 1;
					}
				}
			} else if (chipWaveLoopMode === 0) {
				// loop
				if (directionA === 1) {
					if (phaseA > chipWaveLoopEnd) {
						phaseA = chipWaveLoopStart + Synth.wrap(phaseA - chipWaveLoopEnd, chipWaveLoopLength);
						// phaseA = chipWaveLoopStart;
						wrapped = 1;
					}
				} else if (directionA === -1) {
					if (phaseA < chipWaveLoopStart) {
						phaseA = chipWaveLoopEnd - Synth.wrap(chipWaveLoopStart - phaseA, chipWaveLoopLength);
						// phaseA = chipWaveLoopEnd;
						wrapped = 1;
					}
				}
				if (directionB === 1) {
					if (phaseB > chipWaveLoopEnd) {
						phaseB = chipWaveLoopStart + Synth.wrap(phaseB - chipWaveLoopEnd, chipWaveLoopLength);
						// phaseB = chipWaveLoopStart;
						wrapped = 1;
					}
				} else if (directionB === -1) {
					if (phaseB < chipWaveLoopStart) {
						phaseB = chipWaveLoopEnd - Synth.wrap(chipWaveLoopStart - phaseB, chipWaveLoopLength);
						// phaseB = chipWaveLoopEnd;
						wrapped = 1;
					}
				}
			} else if (chipWaveLoopMode === 1) {
				// ping-pong
				if (directionA === 1) {
					if (phaseA > chipWaveLoopEnd) {
						phaseA = chipWaveLoopEnd - Synth.wrap(phaseA - chipWaveLoopEnd, chipWaveLoopLength);
						// phaseA = chipWaveLoopEnd;
						directionA = -1;
						wrapped = 1;
					}
				} else if (directionA === -1) {
					if (phaseA < chipWaveLoopStart) {
						phaseA = chipWaveLoopStart + Synth.wrap(chipWaveLoopStart - phaseA, chipWaveLoopLength);
						// phaseA = chipWaveLoopStart;
						directionA = 1;
						wrapped = 1;
					}
				}
				if (directionB === 1) {
					if (phaseB > chipWaveLoopEnd) {
						phaseB = chipWaveLoopEnd - Synth.wrap(phaseB - chipWaveLoopEnd, chipWaveLoopLength);
						// phaseB = chipWaveLoopEnd;
						directionB = -1;
						wrapped = 1;
					}
				} else if (directionB === -1) {
					if (phaseB < chipWaveLoopStart) {
						phaseB = chipWaveLoopStart + Synth.wrap(chipWaveLoopStart - phaseB, chipWaveLoopLength);
						// phaseB = chipWaveLoopStart;
						directionB = 1;
						wrapped = 1;
					}
				}
			}
			let waveLA = 0;
			let waveLB = 0;
			let waveRA = 0;
			let waveRB = 0;
			let inputSampleL = 0;
			let inputSampleR = 0;
			if (aliases) {
				waveLA = waveL[Synth.wrap(Math.floor(phaseA), waveLength)];
				waveLB = waveL[Synth.wrap(Math.floor(phaseB), waveLength)];
				waveRA = waveR[Synth.wrap(Math.floor(phaseA), waveLength)];
				waveRB = waveR[Synth.wrap(Math.floor(phaseB), waveLength)];
				prevWaveLA = waveLA;
				prevWaveLB = waveLB;
				prevWaveRA = waveRA;
				prevWaveRB = waveRB;
				const completionFadeA: number = chipWaveCompletionA > 0 ? ((chipWaveCompletionFadeLength - Math.min(chipWaveCompletionA, chipWaveCompletionFadeLength)) / chipWaveCompletionFadeLength) : 1;
				const completionFadeB: number = chipWaveCompletionB > 0 ? ((chipWaveCompletionFadeLength - Math.min(chipWaveCompletionB, chipWaveCompletionFadeLength)) / chipWaveCompletionFadeLength) : 1;
				inputSampleL = 0;
				if (chipWaveCompletionA > 0) {
					inputSampleL += lastWaveLA * completionFadeA;
					inputSampleR += lastWaveLA * completionFadeA;
				} else {
					inputSampleL += waveLA;
					inputSampleR += waveRA;
				}
				if (chipWaveCompletionB > 0) {
					inputSampleL += lastWaveLB * completionFadeB;
					inputSampleR += lastWaveRB * completionFadeB;
				} else {
					inputSampleL += waveLB;
					inputSampleR += waveRB;
				}
			}
			else {
				const phaseAInt = Math.floor(phaseA);
				const phaseBInt = Math.floor(phaseB);
				const indexA = Synth.wrap(phaseAInt, waveLength);
				const indexB = Synth.wrap(phaseBInt, waveLength);
				let nextWaveIntegralLA = waveL[indexA];
				let nextWaveIntegralLB = waveL[indexB];
				let nextWaveIntegralRA = waveR[indexA];
				let nextWaveIntegralRB = waveR[indexB];
				const phaseRatioA = phaseA - phaseAInt;
				const phaseRatioB = phaseB - phaseBInt;
				nextWaveIntegralLA += (waveL[Synth.wrap(indexA + 1, waveLength)] - nextWaveIntegralLA) * phaseRatioA;
				nextWaveIntegralLB += (waveL[Synth.wrap(indexB + 1, waveLength)] - nextWaveIntegralLB) * phaseRatioB;
				nextWaveIntegralRA += (waveR[Synth.wrap(indexA + 1, waveLength)] - nextWaveIntegralRA) * phaseRatioA;
				nextWaveIntegralRB += (waveR[Synth.wrap(indexB + 1, waveLength)] - nextWaveIntegralRB) * phaseRatioB;
				if (!(chipWaveLoopMode === 0 && chipWaveLoopStart === 0 && chipWaveLoopEnd === waveLength) && wrapped !== 0) {
					let pwila = 0;
					let pwilb = 0;
					let pwira = 0;
					let pwirb = 0;
					const phaseA_ = Math.max(0, phaseA - phaseDeltaA * directionA);
					const phaseB_ = Math.max(0, phaseB - phaseDeltaB * directionB);
					const phaseAInt = Math.floor(phaseA_);
					const phaseBInt = Math.floor(phaseB_);
					const indexA = Synth.wrap(phaseAInt, waveLength);
					const indexB = Synth.wrap(phaseBInt, waveLength);
					pwila = waveL[indexA];
					pwilb = waveL[indexB];
					pwira = waveR[indexA];
					pwirb = waveR[indexB];
					pwila += (waveL[Synth.wrap(indexA + 1, waveLength)] - pwila) * (phaseA_ - phaseAInt) * directionA;
					pwilb += (waveL[Synth.wrap(indexB + 1, waveLength)] - pwilb) * (phaseB_ - phaseBInt) * directionB;
					pwira += (waveR[Synth.wrap(indexA + 1, waveLength)] - pwira) * (phaseA_ - phaseAInt) * directionA;
					pwirb += (waveR[Synth.wrap(indexB + 1, waveLength)] - pwirb) * (phaseB_ - phaseBInt) * directionB;
					prevWaveIntegralLA = pwila;
					prevWaveIntegralLB = pwilb;
					prevWaveIntegralRA = pwira;
					prevWaveIntegralRB = pwirb;
				}
				if (chipWaveLoopMode === 1 && wrapped !== 0) {
					waveLA = prevWaveLA;
					waveLB = prevWaveLB;
					waveRA = prevWaveRA;
					waveRB = prevWaveRB;
				} else {
					waveLA = (nextWaveIntegralLA - prevWaveIntegralLA) / (phaseDeltaA * directionA);
					waveLB = (nextWaveIntegralLB - prevWaveIntegralLB) / (phaseDeltaB * directionB);
					waveRA = (nextWaveIntegralRA - prevWaveIntegralRA) / (phaseDeltaA * directionA);
					waveRB = (nextWaveIntegralRB - prevWaveIntegralRB) / (phaseDeltaB * directionB);
				}
				prevWaveLA = waveLA;
				prevWaveLB = waveLB;
				prevWaveRA = waveRA;
				prevWaveRB = waveRB;
				prevWaveIntegralLA = nextWaveIntegralLA;
				prevWaveIntegralLB = nextWaveIntegralLB;
				prevWaveIntegralRA = nextWaveIntegralRA;
				prevWaveIntegralRB = nextWaveIntegralRB;
				const completionFadeA = chipWaveCompletionA > 0 ? ((chipWaveCompletionFadeLength - Math.min(chipWaveCompletionA, chipWaveCompletionFadeLength)) / chipWaveCompletionFadeLength) : 1;
				const completionFadeB = chipWaveCompletionB > 0 ? ((chipWaveCompletionFadeLength - Math.min(chipWaveCompletionB, chipWaveCompletionFadeLength)) / chipWaveCompletionFadeLength) : 1;
				if (chipWaveCompletionA > 0) {
					inputSampleL += lastWaveLA * completionFadeA;
					inputSampleR += lastWaveRA * completionFadeA;
				} else {
					inputSampleL += waveLA;
					inputSampleR += waveRA;
				}
				if (chipWaveCompletionB > 0) {
					inputSampleL += lastWaveLB * completionFadeB;
					inputSampleR += lastWaveRB * completionFadeB;
				} else {
					inputSampleL += waveLB * unisonSign;
					inputSampleR += waveRB * unisonSign;
				}
			}
			const sampleL = applyFilters(inputSampleL * volumeScale, initialFilterInputL1, initialFilterInputL2, filterCount, filtersL);
			const sampleR = applyFilters(inputSampleR * volumeScale, initialFilterInputR1, initialFilterInputR2, filterCount, filtersR);
			initialFilterInputL2 = initialFilterInputL1;
			initialFilterInputR2 = initialFilterInputR1;
			initialFilterInputL1 = inputSampleL * volumeScale;
			initialFilterInputR1 = inputSampleR * volumeScale;
			phaseDeltaA *= phaseDeltaScaleA;
			phaseDeltaB *= phaseDeltaScaleB;
			const outputL = sampleL * expression;
			const outputR = sampleR * expression;
			expression += expressionDelta;
			dataL[sampleIndex] += outputL;
			dataR[sampleIndex] += outputR;
		}
		tone.phases[0] = phaseA / waveLength;
		tone.phases[1] = phaseB / waveLength;
		tone.phaseDeltas[0] = phaseDeltaA / waveLength;
		tone.phaseDeltas[1] = phaseDeltaB / waveLength;
		tone.directions[0] = directionA;
		tone.directions[1] = directionB;
		tone.chipWaveCompletions[0] = chipWaveCompletionA;
		tone.chipWaveCompletions[1] = chipWaveCompletionB;
		tone.chipWavePrevWavesL[0] = prevWaveLA;
		tone.chipWavePrevWavesL[1] = prevWaveLB;
		tone.chipWavePrevWavesR[0] = prevWaveRA;
		tone.chipWavePrevWavesR[1] = prevWaveRB;
		tone.chipWaveCompletionsLastWaveL[0] = lastWaveLA;
		tone.chipWaveCompletionsLastWaveL[1] = lastWaveLB;
		tone.chipWaveCompletionsLastWaveR[0] = lastWaveRA;
		tone.chipWaveCompletionsLastWaveR[1] = lastWaveRB;
		tone.expression = expression;
		synth.sanitizeFilters(filtersL);
		synth.sanitizeFilters(filtersR);
		tone.initialNoteFilterInputL1 = initialFilterInputL1;
		tone.initialNoteFilterInputR1 = initialFilterInputR1;
		tone.initialNoteFilterInputL2 = initialFilterInputL2;
		tone.initialNoteFilterInputR2 = initialFilterInputR2;
	}
    private static chipSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrumentState: InstrumentState): void {
        const aliases: boolean = (instrumentState.effectsIncludeType(EffectType.eqFilter) && instrumentState.aliases);
        const stereoChannels: number = instrumentState.stereoChannels;
        let dataL: Float32Array = synth.tempInstrumentSampleBufferL!;
        let dataR: Float32Array = synth.tempInstrumentSampleBufferR!;
        let waveL: Float32Array = instrumentState.waveL!;
        let waveR: Float32Array = instrumentState.waveR!;

        //TODO: it makes sense to avoid doing stereo calculations if both channels are the same
        if (stereoChannels == 0) {
            dataL = synth.tempInstrumentSampleBufferL!;
            dataR = synth.tempInstrumentSampleBufferL!;
            waveL = instrumentState.waveL!;
            waveR = instrumentState.waveL!;
        }
        else if (stereoChannels == 1) {
            dataL = synth.tempInstrumentSampleBufferR!;
            dataR = synth.tempInstrumentSampleBufferR!;
            waveL = instrumentState.waveR!;
            waveR = instrumentState.waveR!;
        }
        const volumeScale = instrumentState.volumeScale;

        const waveLength = (aliases && instrumentState.type == 8) ? waveL.length : waveL.length - 1;

        const unisonSign: number = tone.specialIntervalExpressionMult * instrumentState.unisonSign;
        if (instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval) tone.phases[1] = tone.phases[0];
        let phaseDeltaA: number = tone.phaseDeltas[0] * waveLength;
        let phaseDeltaB: number = tone.phaseDeltas[1] * waveLength;
        const phaseDeltaScaleA: number = +tone.phaseDeltaScales[0];
        const phaseDeltaScaleB: number = +tone.phaseDeltaScales[1];
        let expression: number = +tone.expression;
        const expressionDelta: number = +tone.expressionDelta;
        let phaseA: number = (tone.phases[0] % 1) * waveLength;
        let phaseB: number = (tone.phases[1] % 1) * waveLength;

        const filtersL: DynamicBiquadFilter[] = tone.noteFiltersL;
        const filtersR: DynamicBiquadFilter[] = tone.noteFiltersR;
        const filterCount: number = tone.noteFilterCount | 0;
        let initialFilterInputL1: number = +tone.initialNoteFilterInputL1;
        let initialFilterInputR1: number = +tone.initialNoteFilterInputR1;
        let initialFilterInputL2: number = +tone.initialNoteFilterInputL2;
        let initialFilterInputR2: number = +tone.initialNoteFilterInputR2;
        const applyFilters: Function = Synth.applyFilters;
        let prevWaveIntegralLA: number = 0;
        let prevWaveIntegralLB: number = 0;
        let prevWaveIntegralRA: number = 0;
        let prevWaveIntegralRB: number = 0;

        if (!aliases) {
            const phaseAInt: number = phaseA | 0;
            const phaseBInt: number = phaseB | 0;
            const indexA: number = phaseAInt % waveLength;
            const indexB: number = phaseBInt % waveLength;
            const phaseRatioA: number = phaseA - phaseAInt;
            const phaseRatioB: number = phaseB - phaseBInt;
            prevWaveIntegralLA = +waveL[indexA];
            prevWaveIntegralLB = +waveL[indexB];
            prevWaveIntegralRA = +waveR[indexA];
            prevWaveIntegralRB = +waveR[indexB];
            prevWaveIntegralLA += (waveL[indexA + 1] - prevWaveIntegralLA) * phaseRatioA;
            prevWaveIntegralLB += (waveL[indexB + 1] - prevWaveIntegralLB) * phaseRatioB;
            prevWaveIntegralRA += (waveR[indexA + 1] - prevWaveIntegralRA) * phaseRatioA;
            prevWaveIntegralRB += (waveR[indexB + 1] - prevWaveIntegralRB) * phaseRatioB;
        }

        const stopIndex: number = bufferIndex + roundedSamplesPerTick;
        for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {

            phaseA += phaseDeltaA;
            phaseB += phaseDeltaB;

            let waveLA: number;
            let waveLB: number;
            let waveRA: number;
            let waveRB: number;
            let inputSampleL: number;
            let inputSampleR: number;

            if (aliases) {
                waveLA = waveL[(0 | phaseA) % waveLength];
                waveLB = waveL[(0 | phaseB) % waveLength];
                waveRA = waveR[(0 | phaseA) % waveLength];
                waveRB = waveR[(0 | phaseB) % waveLength];
                inputSampleL = waveLA + waveLB;
                inputSampleR = waveRA + waveRB;
            } else {
                const phaseAInt: number = phaseA | 0;
                const phaseBInt: number = phaseB | 0;
                const indexA: number = phaseAInt % waveLength;
                const indexB: number = phaseBInt % waveLength;
                let nextWaveIntegralLA: number = waveL[indexA];
                let nextWaveIntegralLB: number = waveL[indexB];
                let nextWaveIntegralRA: number = waveR[indexA];
                let nextWaveIntegralRB: number = waveR[indexB];
                const phaseRatioA: number = phaseA - phaseAInt;
                const phaseRatioB: number = phaseB - phaseBInt;
                nextWaveIntegralLA += (waveL[indexA + 1] - nextWaveIntegralLA) * phaseRatioA;
                nextWaveIntegralLB += (waveL[indexB + 1] - nextWaveIntegralLB) * phaseRatioB;
                nextWaveIntegralRA += (waveR[indexA + 1] - nextWaveIntegralRA) * phaseRatioA;
                nextWaveIntegralRB += (waveR[indexB + 1] - nextWaveIntegralRB) * phaseRatioB;
                waveLA = (nextWaveIntegralLA - prevWaveIntegralLA) / phaseDeltaA;
                waveLB = (nextWaveIntegralLB - prevWaveIntegralLB) / phaseDeltaB;
                waveRA = (nextWaveIntegralRA - prevWaveIntegralRA) / phaseDeltaA;
                waveRB = (nextWaveIntegralRB - prevWaveIntegralRB) / phaseDeltaB;
                prevWaveIntegralLA = nextWaveIntegralLA;
                prevWaveIntegralLB = nextWaveIntegralLB;
                prevWaveIntegralRA = nextWaveIntegralRA;
                prevWaveIntegralRB = nextWaveIntegralRB;
                inputSampleL = waveLA + waveLB * unisonSign;
                inputSampleR = waveRA + waveRB * unisonSign;
            }

            const sampleL: number = applyFilters(inputSampleL * volumeScale, initialFilterInputL1, initialFilterInputL2, filterCount, filtersL);
            const sampleR: number = applyFilters(inputSampleR * volumeScale, initialFilterInputR1, initialFilterInputR2, filterCount, filtersR);
            initialFilterInputL2 = initialFilterInputL1;
            initialFilterInputR2 = initialFilterInputR1;
            initialFilterInputL1 = inputSampleL * volumeScale;
            initialFilterInputR1 = inputSampleR * volumeScale;

            phaseDeltaA *= phaseDeltaScaleA;
            phaseDeltaB *= phaseDeltaScaleB;

            const outputL: number = sampleL * expression;
            const outputR: number = sampleR * expression;
            expression += expressionDelta;

            dataL[sampleIndex] += outputL;
            dataR[sampleIndex] += outputR;
        }

        tone.phases[0] = phaseA / waveLength;
        tone.phases[1] = phaseB / waveLength;
        tone.phaseDeltas[0] = phaseDeltaA / waveLength;
        tone.phaseDeltas[1] = phaseDeltaB / waveLength;
        tone.expression = expression;

        synth.sanitizeFilters(filtersL);
        synth.sanitizeFilters(filtersR);
        tone.initialNoteFilterInputL1 = initialFilterInputL1;
        tone.initialNoteFilterInputR1 = initialFilterInputR1;
        tone.initialNoteFilterInputL2 = initialFilterInputL2;
        tone.initialNoteFilterInputR2 = initialFilterInputR2;
	}
	private static harmonicsSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrumentState: InstrumentState): void {
		const data: Float32Array = synth.tempInstrumentSampleBufferL!;
		const wave: Float32Array = instrumentState.waveL!;
		const waveLength: number = wave.length - 1; // The first sample is duplicated at the end, don't double-count it.

		const unisonSign: number = tone.specialIntervalExpressionMult * instrumentState.unisonSign;
		if (instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval) tone.phases[1] = tone.phases[0];
		let phaseDeltaA: number = tone.phaseDeltas[0] * waveLength;
		let phaseDeltaB: number = tone.phaseDeltas[1] * waveLength;
		const phaseDeltaScaleA: number = +tone.phaseDeltaScales[0];
		const phaseDeltaScaleB: number = +tone.phaseDeltaScales[1];
		let expression: number = +tone.expression;
		const expressionDelta: number = +tone.expressionDelta;
		let phaseA: number = (tone.phases[0] % 1) * waveLength;
		let phaseB: number = (tone.phases[1] % 1) * waveLength;

		const filters: DynamicBiquadFilter[] = tone.noteFiltersL;
		const filterCount: number = tone.noteFilterCount | 0;
		let initialFilterInput1: number = +tone.initialNoteFilterInputL1;
		let initialFilterInput2: number = +tone.initialNoteFilterInputL2;
		const applyFilters: Function = Synth.applyFilters;

		const phaseAInt: number = phaseA | 0;
		const phaseBInt: number = phaseB | 0;
		const indexA: number = phaseAInt % waveLength;
		const indexB: number = phaseBInt % waveLength;
		const phaseRatioA: number = phaseA - phaseAInt;
		const phaseRatioB: number = phaseB - phaseBInt;
		let prevWaveIntegralA: number = +wave[indexA];
		let prevWaveIntegralB: number = +wave[indexB];
		prevWaveIntegralA += (wave[indexA + 1] - prevWaveIntegralA) * phaseRatioA;
		prevWaveIntegralB += (wave[indexB + 1] - prevWaveIntegralB) * phaseRatioB;

		const stopIndex: number = bufferIndex + roundedSamplesPerTick;
		for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {

			phaseA += phaseDeltaA;
			phaseB += phaseDeltaB;

			const phaseAInt: number = phaseA | 0;
			const phaseBInt: number = phaseB | 0;
			const indexA: number = phaseAInt % waveLength;
			const indexB: number = phaseBInt % waveLength;
			let nextWaveIntegralA: number = wave[indexA];
			let nextWaveIntegralB: number = wave[indexB];
			const phaseRatioA: number = phaseA - phaseAInt;
			const phaseRatioB: number = phaseB - phaseBInt;
			nextWaveIntegralA += (wave[indexA + 1] - nextWaveIntegralA) * phaseRatioA;
			nextWaveIntegralB += (wave[indexB + 1] - nextWaveIntegralB) * phaseRatioB;
			const waveA: number = (nextWaveIntegralA - prevWaveIntegralA) / phaseDeltaA;
			const waveB: number = (nextWaveIntegralB - prevWaveIntegralB) / phaseDeltaB;
			prevWaveIntegralA = nextWaveIntegralA;
			prevWaveIntegralB = nextWaveIntegralB;

			const inputSample: number = waveA + waveB * unisonSign;
			const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
			initialFilterInput2 = initialFilterInput1;
			initialFilterInput1 = inputSample;

			phaseDeltaA *= phaseDeltaScaleA;
			phaseDeltaB *= phaseDeltaScaleB;

			const output: number = sample * expression;
			expression += expressionDelta;

			data[sampleIndex] += output;
		}

		tone.phases[0] = phaseA / waveLength;
		tone.phases[1] = phaseB / waveLength;
		tone.phaseDeltas[0] = phaseDeltaA / waveLength;
		tone.phaseDeltas[1] = phaseDeltaB / waveLength;
		tone.expression = expression;

		synth.sanitizeFilters(filters);
		tone.initialNoteFilterInputL1 = initialFilterInput1;
		tone.initialNoteFilterInputL2 = initialFilterInput2;
	}

    private static pickedStringSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrumentState: InstrumentState): void {
        // This algorithm is similar to the Karpluss-Strong algorithm in principle, but with an
        // all-pass filter for dispersion and with more control over the impulse harmonics.
        // The source code is processed as a string before being compiled, in order to
        // handle the unison feature. If unison is disabled or set to none, then only one
        // string voice is required, otherwise two string voices are required. We only want
        // to compute the minimum possible number of string voices, so omit the code for
        // processing extra ones if possible. Any line containing a "#" is duplicated for
        // each required voice, replacing the "#" with the voice index.

        const voiceCount: number = instrumentState.unisonVoices;
        let pickedStringFunction: Function = Synth.pickedStringFunctionCache[voiceCount];
        if (pickedStringFunction == undefined) {
            let pickedStringSource: string = "return (synth, bufferIndex, runLength, tone, instrumentState) => {";


            pickedStringSource += `
				const Config = beepbox.Config;
				const Synth = beepbox.Synth;
                const data = synth.tempInstrumentSampleBufferL;
				
				let pickedString# = tone.pickedStrings[#];
				let allPassSample# = +pickedString#.allPassSample;
				let allPassPrevInput# = +pickedString#.allPassPrevInput;
				let sustainFilterSample# = +pickedString#.sustainFilterSample;
				let sustainFilterPrevOutput2# = +pickedString#.sustainFilterPrevOutput2;
				let sustainFilterPrevInput1# = +pickedString#.sustainFilterPrevInput1;
				let sustainFilterPrevInput2# = +pickedString#.sustainFilterPrevInput2;
				let fractionalDelaySample# = +pickedString#.fractionalDelaySample;
				const delayLine# = pickedString#.delayLine;
				const delayBufferMask# = (delayLine#.length - 1) >> 0;
				let delayIndex# = pickedString#.delayIndex|0;
				delayIndex# = (delayIndex# & delayBufferMask#) + delayLine#.length;
				let delayLength# = +pickedString#.prevDelayLength;
				const delayLengthDelta# = +pickedString#.delayLengthDelta;
				let allPassG# = +pickedString#.allPassG;
				let sustainFilterA1# = +pickedString#.sustainFilterA1;
				let sustainFilterA2# = +pickedString#.sustainFilterA2;
				let sustainFilterB0# = +pickedString#.sustainFilterB0;
				let sustainFilterB1# = +pickedString#.sustainFilterB1;
				let sustainFilterB2# = +pickedString#.sustainFilterB2;
				const allPassGDelta# = +pickedString#.allPassGDelta;
				const sustainFilterA1Delta# = +pickedString#.sustainFilterA1Delta;
				const sustainFilterA2Delta# = +pickedString#.sustainFilterA2Delta;
				const sustainFilterB0Delta# = +pickedString#.sustainFilterB0Delta;
				const sustainFilterB1Delta# = +pickedString#.sustainFilterB1Delta;
				const sustainFilterB2Delta# = +pickedString#.sustainFilterB2Delta;
				
				let expression = +tone.expression;
				const expressionDelta = +tone.expressionDelta;
				
				const unisonSign = tone.specialIntervalExpressionMult * instrumentState.unisonSign;
				const delayResetOffset# = pickedString#.delayResetOffset|0;
				
				const filters = tone.noteFiltersL;
				const filterCount = tone.noteFilterCount|0;
				let initialFilterInput1 = +tone.initialNoteFilterInputL1;
				let initialFilterInput2 = +tone.initialNoteFilterInputL2;
				const applyFilters = Synth.applyFilters;
				
				const stopIndex = bufferIndex + runLength;
				for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
					const targetSampleTime# = delayIndex# - delayLength#;
					const lowerIndex# = (targetSampleTime# + 0.125) | 0; // Offset to improve stability of all-pass filter.
					const upperIndex# = lowerIndex# + 1;
					const fractionalDelay# = upperIndex# - targetSampleTime#;
					const fractionalDelayG# = (1.0 - fractionalDelay#) / (1.0 + fractionalDelay#); // Inlined version of FilterCoefficients.prototype.allPass1stOrderFractionalDelay
					const prevInput# = delayLine#[lowerIndex# & delayBufferMask#];
					const input# = delayLine#[upperIndex# & delayBufferMask#];
					fractionalDelaySample# = fractionalDelayG# * input# + prevInput# - fractionalDelayG# * fractionalDelaySample#;
					
					allPassSample# = fractionalDelaySample# * allPassG# + allPassPrevInput# - allPassG# * allPassSample#;
					allPassPrevInput# = fractionalDelaySample#;
					
					const sustainFilterPrevOutput1# = sustainFilterSample#;
					sustainFilterSample# = sustainFilterB0# * allPassSample# + sustainFilterB1# * sustainFilterPrevInput1# + sustainFilterB2# * sustainFilterPrevInput2# - sustainFilterA1# * sustainFilterSample# - sustainFilterA2# * sustainFilterPrevOutput2#;
					sustainFilterPrevOutput2# = sustainFilterPrevOutput1#;
					sustainFilterPrevInput2# = sustainFilterPrevInput1#;
					sustainFilterPrevInput1# = allPassSample#;
					
					delayLine#[delayIndex# & delayBufferMask#] += sustainFilterSample#;
					delayLine#[(delayIndex# + delayResetOffset#) & delayBufferMask#] = 0.0;
					delayIndex#++;
					
					const inputSample = (`

            const sampleList: string[] = [];
            for (let voice: number = 0; voice < voiceCount; voice++) {
                sampleList.push("fractionalDelaySample" + voice + (voice != 0 ? " * unisonSign" : ""));
            }

            pickedStringSource += sampleList.join(" + ");

            pickedStringSource += `) * expression;
					const sample = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
					initialFilterInput2 = initialFilterInput1;
					initialFilterInput1 = inputSample;
                    data[sampleIndex] += sample;
					
					expression += expressionDelta;
					delayLength# += delayLengthDelta#;
					allPassG# += allPassGDelta#;
					sustainFilterA1# += sustainFilterA1Delta#;
					sustainFilterA2# += sustainFilterA2Delta#;
					sustainFilterB0# += sustainFilterB0Delta#;
					sustainFilterB1# += sustainFilterB1Delta#;
					sustainFilterB2# += sustainFilterB2Delta#;
				}
				
				// Avoid persistent denormal or NaN values in the delay buffers and filter history.
				const epsilon = (1.0e-24);
				if (!Number.isFinite(allPassSample#) || Math.abs(allPassSample#) < epsilon) allPassSample# = 0.0;
				if (!Number.isFinite(allPassPrevInput#) || Math.abs(allPassPrevInput#) < epsilon) allPassPrevInput# = 0.0;
				if (!Number.isFinite(sustainFilterSample#) || Math.abs(sustainFilterSample#) < epsilon) sustainFilterSample# = 0.0;
				if (!Number.isFinite(sustainFilterPrevOutput2#) || Math.abs(sustainFilterPrevOutput2#) < epsilon) sustainFilterPrevOutput2# = 0.0;
				if (!Number.isFinite(sustainFilterPrevInput1#) || Math.abs(sustainFilterPrevInput1#) < epsilon) sustainFilterPrevInput1# = 0.0;
				if (!Number.isFinite(sustainFilterPrevInput2#) || Math.abs(sustainFilterPrevInput2#) < epsilon) sustainFilterPrevInput2# = 0.0;
				if (!Number.isFinite(fractionalDelaySample#) || Math.abs(fractionalDelaySample#) < epsilon) fractionalDelaySample# = 0.0;
				pickedString#.allPassSample = allPassSample#;
				pickedString#.allPassPrevInput = allPassPrevInput#;
				pickedString#.sustainFilterSample = sustainFilterSample#;
				pickedString#.sustainFilterPrevOutput2 = sustainFilterPrevOutput2#;
				pickedString#.sustainFilterPrevInput1 = sustainFilterPrevInput1#;
				pickedString#.sustainFilterPrevInput2 = sustainFilterPrevInput2#;
				pickedString#.fractionalDelaySample = fractionalDelaySample#;
				pickedString#.delayIndex = delayIndex#;
				pickedString#.prevDelayLength = delayLength#;
				pickedString#.allPassG = allPassG#;
				pickedString#.sustainFilterA1 = sustainFilterA1#;
				pickedString#.sustainFilterA2 = sustainFilterA2#;
				pickedString#.sustainFilterB0 = sustainFilterB0#;
				pickedString#.sustainFilterB1 = sustainFilterB1#;
				pickedString#.sustainFilterB2 = sustainFilterB2#;
				
				tone.expression = expression;
				
				synth.sanitizeFilters(filters);
				tone.initialNoteFilterInputL1 = initialFilterInput1;
				tone.initialNoteFilterInputL2 = initialFilterInput2;
			}`

            // Duplicate lines containing "#" for each voice and replace the "#" with the voice index.
            pickedStringSource = pickedStringSource.replace(/^.*\#.*$/mg, line => {
                const lines = [];
                for (let voice: number = 0; voice < voiceCount; voice++) {
                    lines.push(line.replace(/\#/g, String(voice)));
                }
                return lines.join("\n");
            });

            //console.log(pickedStringSource);
            pickedStringFunction = new Function("Config", "Synth", pickedStringSource)(Config, Synth);
            Synth.pickedStringFunctionCache[voiceCount] = pickedStringFunction;
        }

        pickedStringFunction(synth, bufferIndex, roundedSamplesPerTick, tone, instrumentState);
    }

    private static effectsSynth(synth: Synth, outputDataL: Float32Array, outputDataR: Float32Array, bufferIndex: number, runLength: number, instrumentState: InstrumentState): void {
        // TODO: If automation is involved, don't assume sliders will stay at zero.
        // @jummbus - ^ Correct, removed the non-zero checks as modulation can change them.

        const usesDistortion: boolean = instrumentState.effectsIncludeType(EffectType.distortion);
        const usesClipping: boolean = instrumentState.effectsIncludeType(EffectType.clipping);
        const usesBitcrusher: boolean = instrumentState.effectsIncludeType(EffectType.bitcrusher);
        const usesEqFilter: boolean = instrumentState.effectsIncludeType(EffectType.eqFilter);
        const usesGain: boolean = instrumentState.effectsIncludeType(EffectType.gain);
        const usesPanning: boolean = instrumentState.effectsIncludeType(EffectType.panning);
        const usesFlanger: boolean = instrumentState.effectsIncludeType(EffectType.flanger);
        const usesChorus: boolean = instrumentState.effectsIncludeType(EffectType.chorus);
        const usesEcho: boolean = instrumentState.effectsIncludeType(EffectType.echo);
		const usesReverb: boolean = instrumentState.effectsIncludeType(EffectType.reverb);
		const usesGranular: boolean = instrumentState.effectsIncludeType(EffectType.granular);
        const usesRingModulation: boolean = instrumentState.effectsIncludeType(EffectType.ringModulation);
        const stereoChannels: number = (instrumentState.synthesizer == Synth.loopableChipSynth || instrumentState.synthesizer == Synth.chipSynth) ? instrumentState.stereoChannels : 0; //TODO: make an instrumentIsStereo function

        let signature: string = "";
        for (let i of instrumentState.effects) {
            signature = signature + i!.type.toString();
            if (i.type == EffectType.panning) signature = signature + i.panningMode.toString();
            else if (i.type == EffectType.clipping) signature = signature + i.clippingType.toString();
        }
        signature = signature + stereoChannels.toString();

        let effectsFunction: Function = Synth.effectsFunctionCache[signature];
        if (effectsFunction == undefined) {
            let effectsSource: string = "return (synth, outputDataL, outputDataR, bufferIndex, runLength, instrumentState) => {";

            const usesDelays: boolean = usesChorus || usesReverb || usesEcho || usesGranular || usesFlanger;

            effectsSource += `
            let effectState = instrumentState.effects[0]

            const tempInstrumentSampleBufferL = synth.tempInstrumentSampleBufferL;
            const tempInstrumentSampleBufferR = synth.tempInstrumentSampleBufferR;

            let mixVolume = +instrumentState.mixVolume;
            const mixVolumeDelta = +instrumentState.mixVolumeDelta;
            let attenuationVolume = +instrumentState.attenuationVolume;
            const attenuationVolumeDelta = +instrumentState.attenuationVolumeDelta;
            `

            if (usesDelays) {
                effectsSource += `

                let delayInputMult = +instrumentState.delayInputMult;
                const delayInputMultDelta = +instrumentState.delayInputMultDelta;`
            }

            if (usesEqFilter) {
                effectsSource += `

                let filtersL = [];
                let filtersR = [];

                let filterCount = [];
                let initialFilterInputL1 = [];
                let initialFilterInputR1 = [];
                let initialFilterInputL2 = [];
                let initialFilterInputR2 = [];
                let inputSampleL = [];
                let inputSampleR = [];
                const applyFilters = Synth.applyFilters;`

                // this is *supposed* to always be included but it is rather inconvenient to do so...
                effectsSource += `

                let eqFilterVolume = [];
                let eqFilterVolumeDelta = [];
                `
            }
            if (usesDistortion) {

                effectsSource += `

                const distortionBaseVolume = +Config.distortionBaseVolume;
                let distortion = [];
                let distortionDelta = [];
                let distortionDrive = [];
                let distortionDriveDelta = [];
                const distortionFractionalResolution = 4.0;
                const distortionOversampleCompensation = distortionBaseVolume / distortionFractionalResolution;
                const distortionFractionalDelay1 = 1.0 / distortionFractionalResolution;
                const distortionFractionalDelay2 = 2.0 / distortionFractionalResolution;
                const distortionFractionalDelay3 = 3.0 / distortionFractionalResolution;
                const distortionFractionalDelayG1 = (1.0 - distortionFractionalDelay1) / (1.0 + distortionFractionalDelay1); // Inlined version of FilterCoefficients.prototype.allPass1stOrderFractionalDelay
                const distortionFractionalDelayG2 = (1.0 - distortionFractionalDelay2) / (1.0 + distortionFractionalDelay2); // Inlined version of FilterCoefficients.prototype.allPass1stOrderFractionalDelay
                const distortionFractionalDelayG3 = (1.0 - distortionFractionalDelay3) / (1.0 + distortionFractionalDelay3); // Inlined version of FilterCoefficients.prototype.allPass1stOrderFractionalDelay
                const distortionNextOutputWeight1 = Math.cos(Math.PI * distortionFractionalDelay1) * 0.5 + 0.5;
                const distortionNextOutputWeight2 = Math.cos(Math.PI * distortionFractionalDelay2) * 0.5 + 0.5;
                const distortionNextOutputWeight3 = Math.cos(Math.PI * distortionFractionalDelay3) * 0.5 + 0.5;
                const distortionPrevOutputWeight1 = 1.0 - distortionNextOutputWeight1;
                const distortionPrevOutputWeight2 = 1.0 - distortionNextOutputWeight2;
                const distortionPrevOutputWeight3 = 1.0 - distortionNextOutputWeight3;

                let distortionFractionalInputL1 = [];
                let distortionFractionalInputL2 = [];
                let distortionFractionalInputL3 = [];
                let distortionFractionalInputR1 = [];
                let distortionFractionalInputR2 = [];
                let distortionFractionalInputR3 = [];
                let distortionPrevInputL = [];
                let distortionPrevInputR = [];
                let distortionNextOutputL = [];
                let distortionNextOutputR = [];

                let distortionReverse = [];
                let distortionNextInputL = [];
                let distortionNextInputR = [];
                let distortionOutputL1 = [];
                let distortionOutputL2 = [];
                let distortionOutputL3 = [];
                let distortionOutputR1 = [];
                let distortionOutputR2 = [];
                let distortionOutputR3 = [];`
            }
            if (usesClipping) {

                effectsSource += `

                const clippingBaseVolume = +Config.clippingBaseVolume;
                let clippingInGain = [];
                let clippingInGainDelta = [];
                let clippingThreshold = [];
                let clippingThresholdDelta = [];

                let clippingThresholdLevel = [];`
            }
            if (usesBitcrusher) {
                effectsSource += `

                let bitcrusherPrevInputL = [];
                let bitcrusherPrevInputR = [];
                let bitcrusherCurrentOutputL = [];
                let bitcrusherCurrentOutputR = [];
                let bitcrusherPhase = [];
                let bitcrusherPhaseDelta = [];
                let bitcrusherPhaseDeltaScale = [];
                let bitcrusherScale = [];
                let bitcrusherScaleScale = [];
                let bitcrusherFoldLevel = [];
                let bitcrusherFoldLevelScale = [];

                let lerpedInputL = [];
                let lerpedInputR = [];

                let bitcrusherWrapLevel = [];
                let wrappedSampleL = [];
                let wrappedSampleR = [];
                let foldedSampleL = [];
                let foldedSampleR = [];
                let scaledSampleL = [];
                let scaledSampleR = [];
                let oldValueL = [];
                let oldValueR = [];
                let newValueL = [];
                let newValueR = [];`
            }
            if (usesFlanger) {
                effectsSource += `

                const flangerMask = synth.flangerDelayBufferMask >>> 0;
                let flangerDelayLineL = [];
                let flangerDelayLineR = [];
                let flangerDelayPos = [];

                let flanger = [];
                let flangerDelta = [];
                let flangerSpeed = [];
                let flangerSpeedDelta = [];
                let flangerDepth = [];
                let flangerDepthDelta = [];
                let flangerFeedback = [];
                let flangerFeedbackDelta = [];

                let flangerPhase = [];
                let flangerRange = [];

                let flangerTapIndexL = [];
                let flangerTapIndexR = [];
                let flangerTapEndL = [];
                let flangerTapEndR = [];
                let flangerTapDeltaL = [];
                let flangerTapDeltaR = [];

                let flangerTapRatioL = []; // you don't know how happy i am that this variable exists
                let flangerTapRatioR = [];
                let flangerTapLA = [];
                let flangerTapLB = [];
                let flangerTapRA = [];
                let flangerTapRB = [];
                let flangerTapL = [];
                let flangerTapR = [];`
            }
            if (usesChorus) {
                effectsSource += `

                const chorusMask = synth.chorusDelayBufferMask >>> 0;
                let chorusDelayLineL = [];
                let chorusDelayLineR = [];
                let chorusDelayPos = [];

                let chorusVoiceMult = [];
                let chorusVoiceMultDelta = [];
                let chorusCombinedMult = [];
                let chorusCombinedMultDelta = [];

                const chorusDuration = +Config.chorusPeriodSeconds;
                const chorusAngle = Math.PI * 2.0 / (chorusDuration * synth.samplesPerSecond);
                const chorusRange = synth.samplesPerSecond * Config.chorusDelayRange;
                const chorusOffset0 = synth.chorusDelayBufferSize - Config.chorusDelayOffsets[0][0] * chorusRange;
                const chorusOffset1 = synth.chorusDelayBufferSize - Config.chorusDelayOffsets[0][1] * chorusRange;
                const chorusOffset2 = synth.chorusDelayBufferSize - Config.chorusDelayOffsets[0][2] * chorusRange;
                const chorusOffset3 = synth.chorusDelayBufferSize - Config.chorusDelayOffsets[1][0] * chorusRange;
                const chorusOffset4 = synth.chorusDelayBufferSize - Config.chorusDelayOffsets[1][1] * chorusRange;
                const chorusOffset5 = synth.chorusDelayBufferSize - Config.chorusDelayOffsets[1][2] * chorusRange;

                let chorusPhase = [];
                let chorusTap0Index = [];
                let chorusTap1Index = [];
                let chorusTap2Index = [];
                let chorusTap3Index = [];
                let chorusTap4Index = [];
                let chorusTap5Index = [];
                let chorusTap0End = [];
                let chorusTap1End = [];
                let chorusTap2End = [];
                let chorusTap3End = [];
                let chorusTap4End = [];
                let chorusTap5End = [];
                let chorusTap0Delta = [];
                let chorusTap1Delta = [];
                let chorusTap2Delta = [];
                let chorusTap3Delta = [];
                let chorusTap4Delta = [];
                let chorusTap5Delta = [];

                let chorusTap0Ratio = [];
                let chorusTap1Ratio = [];
                let chorusTap2Ratio = [];
                let chorusTap3Ratio = [];
                let chorusTap4Ratio = [];
                let chorusTap5Ratio = [];
                let chorusTap0A = [];
                let chorusTap0B = [];
                let chorusTap1A = [];
                let chorusTap1B = [];
                let chorusTap2A = [];
                let chorusTap2B = [];
                let chorusTap3A = [];
                let chorusTap3B = [];
                let chorusTap4A = [];
                let chorusTap4B = [];
                let chorusTap5A = [];
                let chorusTap5B = [];
                let chorusTap0 = [];
                let chorusTap1 = [];
                let chorusTap2 = [];
                let chorusTap3 = [];
                let chorusTap4 = [];
                let chorusTap5 = [];`
            }
            if (usesEcho) {
                effectsSource += `
                let echoMult = [];
                let echoMultDelta = [];

                let echoDelayLineL = [];
                let echoDelayLineR = [];
                let echoMask = [];

                let echoDelayPosL = [];
                let echoDelayPosR = [];
                let echoDelayOffsetStart = [];
                let echoDelayOffsetEnd   = [];
                let echoDelayOffsetRatio = [];
                let echoDelayOffsetRatioDelta = [];
                let echoPingPong = [];

                let echoShelfA1 = [];
                let echoShelfB0 = [];
                let echoShelfB1 = [];
                let echoShelfSampleL = [];
                let echoShelfSampleR = [];
                let echoShelfPrevInputL = [];
                let echoShelfPrevInputR = [];

                let echoNextInputL = [];
                let echoNextInputR = [];
                let echoTapStartIndexL = [];
                let echoTapStartIndexR = [];
                let echoTapEndIndexL   = [];
                let echoTapEndIndexR   = [];
                let echoTapStartL = [];
                let echoTapEndL   = [];
                let echoTapStartR = [];
                let echoTapEndR   = [];
                let echoTapL = [];
                let echoTapR = [];`
            }
            if (usesReverb) {
                effectsSource += `

                const reverbMask = Config.reverbDelayBufferMask >>> 0; //TODO: Dynamic reverb buffer size.
                let reverbDelayLine = [];
                let reverbDelayPos = [];

                let reverb = [];
                let reverbDelta = [];

                let reverbShelfA1 = [];
                let reverbShelfB0 = [];
                let reverbShelfB1 = [];
                let reverbShelfSample0 = [];
                let reverbShelfSample1 = [];
                let reverbShelfSample2 = [];
                let reverbShelfSample3 = [];
                let reverbShelfPrevInput0 = [];
                let reverbShelfPrevInput1 = [];
                let reverbShelfPrevInput2 = [];
                let reverbShelfPrevInput3 = [];

                let reverbDelayPos1 = [];
                let reverbDelayPos2 = [];
                let reverbDelayPos3 = [];
                let reverbSample0 = [];
                let reverbSample1 = [];
                let reverbSample2 = [];
                let reverbSample3 = [];
                let reverbTemp0 = [];
                let reverbTemp1 = [];
                let reverbTemp2 = [];
                let reverbTemp3 = [];
                let reverbShelfInput0 = [];
                let reverbShelfInput1 = [];
                let reverbShelfInput2 = [];
                let reverbShelfInput3 = [];`
            }
            if (usesRingModulation) {
                effectsSource += `

                let ringModMix = [];
                let ringModMixDelta = [];
                let ringModPhase = [];
                let ringModPhaseDelta = [];
                let ringModPhaseDeltaScale = [];
                let ringModWaveformIndex = [];
                let ringModMixFade = [];
                let ringModMixFadeDelta = [];

                let ringModPulseWidth = [];

                let waveform = [];
                let waveformLength = [];
                let ringModOutputL = [];
                let ringModOutputR = [];
                let ringModMixF = [];
                `
            }
            if (usesPanning) {
                effectsSource += `

                const panningMask = synth.panningDelayBufferMask >>> 0;
                let panningDelayLineL = [];
                let panningDelayLineR = [];
                let panningDelayPos = [];
                let panningVolumeL      = [];
                let panningVolumeR      = [];
                let panningVolumeDeltaL = [];
                let panningVolumeDeltaR = [];
                let panningOffsetL      = [];
                let panningOffsetR      = [];
                let panningOffsetDeltaL = [];
                let panningOffsetDeltaR = [];
                let panningRatioL  = [];
                let panningRatioR  = [];
                let panningTapLA   = [];
                let panningTapLB   = [];
                let panningTapRA   = [];
                let panningTapRB   = [];
                let panningTapL    = [];
                let panningTapR    = [];`
            }
            if (usesGain) {
                effectsSource += `

                let gain = [];
                let gainDelta = [];`
            }
            if (usesGranular) {
                effectsSource += `

                let granularWet = [];
                let granularMixDelta = [];
                let granularDry = [];
                let granularDelayLineL = [];
                let granularDelayLineR = [];
                let granularGrains = [];
                let granularGrainCount = [];
                let granularDelayLineLength = [];
                let granularDelayLineMask = [];
                let granularDelayLineIndex = [];
                let usesRandomGrainLocation = [];
                let computeGrains = [];
                let granularOutputL = [];
                let granularOutputR = [];
                `
            }

            for (let i: number = 0; i < instrumentState.effects.length; i++) {
                let effectState: EffectState = instrumentState.effects[i] as EffectState
                effectsSource += `

                effectState = instrumentState.effects[` + i + `];
                effectIndex = ` + i + `;
                `

                if (usesGranular && effectState.type == EffectType.granular) {
                    effectsSource += `

                    granularWet[effectIndex] = effectState.granularMix;
                    granularMixDelta[effectIndex] = effectState.granularMixDelta;
                    granularDry[effectIndex] = 1.0 - granularWet[effectIndex];
                    granularDelayLineL[effectIndex] = effectState.granularDelayLineL;
                    granularDelayLineR[effectIndex] = effectState.granularDelayLineR;
                    granularGrains[effectIndex] = effectState.granularGrains;
                    granularGrainCount[effectIndex] = effectState.granularGrainsLength;
                    granularDelayLineLength[effectIndex] = granularDelayLineL.length;
                    granularDelayLineMask[effectIndex] = granularDelayLineLength[effectIndex] - 1;
                    granularDelayLineIndex[effectIndex] = effectState.granularDelayLineIndex;
                    usesRandomGrainLocation[effectIndex] = effectState.usesRandomGrainLocation;
                    computeGrains[effectIndex] = effectState.computeGrains;
                    effectState.granularDelayLineDirty = true;
                    `
                }
                else if (usesDistortion && effectState.type == EffectType.distortion) {
                    // Distortion can sometimes create noticeable aliasing.
                    // It seems the established industry best practice for distortion antialiasing
                    // is to upsample the inputs ("zero stuffing" followed by a brick wall lowpass
                    // at the original nyquist frequency), perform the distortion, then downsample
                    // (the lowpass again followed by dropping in-between samples). This is
                    // "mathematically correct" in that it preserves only the intended frequencies,
                    // but it has several unfortunate tradeoffs depending on the choice of filter,
                    // introducing latency and/or time smearing, since no true brick wall filter
                    // exists. For the time being, I've opted to instead generate in-between input
                    // samples using fractional delay all-pass filters, and after distorting them,
                    // I "downsample" these with a simple weighted sum.

                    effectsSource += `

                    distortion[effectIndex] = effectState.distortion;
                    distortionDelta[effectIndex] = effectState.distortionDelta;
                    distortionDrive[effectIndex] = effectState.distortionDrive;
                    distortionDriveDelta[effectIndex] = effectState.distortionDriveDelta;
                    distortionReverse[effectIndex] = 1.0 - distortion[effectIndex];

                    distortionFractionalInputL1[effectIndex] = +effectState.distortionFractionalInputL1;
                    distortionFractionalInputL2[effectIndex] = +effectState.distortionFractionalInputL2;
                    distortionFractionalInputL3[effectIndex] = +effectState.distortionFractionalInputL3;
                    distortionFractionalInputR1[effectIndex] = +effectState.distortionFractionalInputR1;
                    distortionFractionalInputR2[effectIndex] = +effectState.distortionFractionalInputR2;
                    distortionFractionalInputR3[effectIndex] = +effectState.distortionFractionalInputR3;
                    distortionPrevInputL[effectIndex] = +effectState.distortionPrevInputL;
                    distortionPrevInputR[effectIndex] = +effectState.distortionPrevInputR;
                    distortionNextOutputL[effectIndex] = +effectState.distortionNextOutputL;
                    distortionNextOutputR[effectIndex] = +effectState.distortionNextOutputR;`
                }
                else if (usesClipping && effectState.type == EffectType.clipping) {
                    // TODO: add an anti-aliasing filter, similar to distortion (?)

                    // also this feels like a good place to mention how the clipping
                    // effect is badly named, because it actually includes a bunch of
                    // different threshold-based distortions (like wavefolding)

                    effectsSource += `

                    clippingInGain[effectIndex] = effectState.clippingInGain;
                    clippingInGainDelta[effectIndex] = effectState.clippingInGainDelta;
                    clippingThreshold[effectIndex] = effectState.clippingThreshold;
                    clippingThresholdDelta[effectIndex] = effectState.clippingThresholdDelta;`
                }
                else if (usesBitcrusher && effectState.type == EffectType.bitcrusher) {
                    effectsSource += `

                    bitcrusherPrevInputL[effectIndex] = +effectState.bitcrusherPrevInputL;
                    bitcrusherPrevInputR[effectIndex] = +effectState.bitcrusherPrevInputR;
                    bitcrusherCurrentOutputL[effectIndex] = +effectState.bitcrusherCurrentOutputL;
                    bitcrusherCurrentOutputR[effectIndex] = +effectState.bitcrusherCurrentOutputR;
                    bitcrusherPhase[effectIndex] = +effectState.bitcrusherPhase;
                    bitcrusherPhaseDelta[effectIndex] = +effectState.bitcrusherPhaseDelta;
                    bitcrusherPhaseDeltaScale[effectIndex] = +effectState.bitcrusherPhaseDeltaScale;
                    bitcrusherScale[effectIndex] = +effectState.bitcrusherScale;
                    bitcrusherScaleScale[effectIndex] = +effectState.bitcrusherScaleScale;
                    bitcrusherFoldLevel[effectIndex] = +effectState.bitcrusherFoldLevel;
                    bitcrusherFoldLevelScale[effectIndex] = +effectState.bitcrusherFoldLevelScale;`
                }
                else if (usesRingModulation && effectState.type == EffectType.ringModulation) {
                    effectsSource += `

                    ringModMix[effectIndex] = +effectState.ringModMix;
                    ringModMixDelta[effectIndex] = +effectState.ringModMixDelta;
                    ringModPhase[effectIndex] = +effectState.ringModPhase;
                    ringModPhaseDelta[effectIndex] = +effectState.ringModPhaseDelta;
                    ringModPhaseDeltaScale[effectIndex] = +effectState.ringModPhaseDeltaScale;
                    ringModWaveformIndex[effectIndex] = +effectState.ringModWaveformIndex;
                    ringModMixFade[effectIndex] = +effectState.ringModMixFade;
                    ringModMixFadeDelta[effectIndex] = +effectState.ringModMixFadeDelta;

                    ringModPulseWidth[effectIndex] = +effectState.ringModPulseWidth;

                    waveform[effectIndex] = Config.operatorWaves[ringModWaveformIndex[effectIndex]].samples;
                    if (ringModWaveformIndex[effectIndex] == 2) {
                        waveform[effectIndex] = Synth.getOperatorWave(ringModWaveformIndex[effectIndex], ringModPulseWidth[effectIndex]).samples;
                    }
                    waveformLength[effectIndex] = waveform[effectIndex].length - 1;
                    `
                }
                else if (usesEqFilter && effectState.type == EffectType.eqFilter) {
                    effectsSource += `

                    filtersL[effectIndex] = effectState.eqFiltersL;
                    filtersR[effectIndex] = effectState.eqFiltersR;
                    filterCount[effectIndex] = effectState.eqFilterCount|0;
                    initialFilterInputL1[effectIndex] = +effectState.initialEqFilterInputL1;
                    initialFilterInputR1[effectIndex] = +effectState.initialEqFilterInputR1;
                    initialFilterInputL2[effectIndex] = +effectState.initialEqFilterInputL2;
                    initialFilterInputR2[effectIndex] = +effectState.initialEqFilterInputR2;

                    eqFilterVolume[effectIndex] = +effectState.eqFilterVolume;
                    eqFilterVolumeDelta[effectIndex] = +effectState.eqFilterVolumeDelta;`
                }
                else if (usesPanning && effectState.type == EffectType.panning) {
                    effectsSource += `

                    panningDelayLineL[effectIndex] = effectState.panningDelayLineL;
                    panningDelayLineR[effectIndex] = effectState.panningDelayLineR;
                    panningDelayPos[effectIndex] = effectState.panningDelayPos & panningMask;
                    panningVolumeL[effectIndex]      = +effectState.panningVolumeL;
                    panningVolumeR[effectIndex]      = +effectState.panningVolumeR;
                    panningVolumeDeltaL[effectIndex] = +effectState.panningVolumeDeltaL;
                    panningVolumeDeltaR[effectIndex] = +effectState.panningVolumeDeltaR;
                    panningOffsetL[effectIndex]      = +effectState.panningOffsetL;
                    panningOffsetR[effectIndex]      = +effectState.panningOffsetR;
                    panningOffsetDeltaL[effectIndex] = 1.0 - effectState.panningOffsetDeltaL;
                    panningOffsetDeltaR[effectIndex] = 1.0 - effectState.panningOffsetDeltaR;`
                }
                else if (usesFlanger && effectState.type == EffectType.flanger) {
                    effectsSource += `

                    flangerDelayLineL[effectIndex] = effectState.flangerDelayLineL;
                    flangerDelayLineR[effectIndex] = effectState.flangerDelayLineR;
                    flangerDelayPos[effectIndex] = effectState.flangerDelayPos & flangerMask;

                    flanger[effectIndex] = effectState.flanger;
                    flangerDelta[effectIndex] = effectState.flangerDelta;
                    flangerSpeed[effectIndex] = effectState.flangerSpeed;
                    flangerSpeedDelta[effectIndex] = effectState.flangerSpeedDelta;
                    flangerDepth[effectIndex] = effectState.flangerDepth;
                    flangerDepthDelta[effectIndex] = effectState.flangerDepthDelta;
                    flangerFeedback[effectIndex] = effectState.flangerFeedback;
                    flangerFeedbackDelta[effectIndex] = effectState.flangerFeedbackDelta;

                    flangerPhase[effectIndex] = effectState.flangerPhase % (Math.PI * 2.0);
                    flangerRange[effectIndex] = flangerDepth[effectIndex];

                    flangerTapIndexL[effectIndex] = flangerDelayPos[effectIndex] - flangerRange[effectIndex] - flangerRange[effectIndex] * Math.cos(flangerPhase[effectIndex]);
                    flangerTapIndexR[effectIndex] = flangerDelayPos[effectIndex] - flangerRange[effectIndex] - flangerRange[effectIndex] * Math.sin(flangerPhase[effectIndex]);
                    flangerPhase[effectIndex] += flangerSpeed[effectIndex] * Config.flangerPeriodMult * runLength;
                    flangerTapEndL[effectIndex] = flangerDelayPos[effectIndex] - flangerRange[effectIndex] - flangerRange[effectIndex] * Math.cos(flangerPhase[effectIndex]) + runLength;
                    flangerTapEndR[effectIndex] = flangerDelayPos[effectIndex] - flangerRange[effectIndex] - flangerRange[effectIndex] * Math.sin(flangerPhase[effectIndex]) + runLength;
                    flangerTapDeltaL[effectIndex] = (flangerTapEndL[effectIndex] - flangerTapIndexL[effectIndex]) / runLength;
                    flangerTapDeltaR[effectIndex] = (flangerTapEndR[effectIndex] - flangerTapIndexR[effectIndex]) / runLength;`
                }
                else if (usesChorus && effectState.type == EffectType.chorus) {
                    effectsSource += `

                    chorusDelayLineL[effectIndex] = effectState.chorusDelayLineL;
                    chorusDelayLineR[effectIndex] = effectState.chorusDelayLineR;
                    effectState.chorusDelayLineDirty = true;
                    chorusDelayPos[effectIndex] = effectState.chorusDelayPos & chorusMask;

                    chorusVoiceMult[effectIndex] = +effectState.chorusVoiceMult;
                    chorusVoiceMultDelta[effectIndex] = +effectState.chorusVoiceMultDelta;
                    chorusCombinedMult[effectIndex] = +effectState.chorusCombinedMult;
                    chorusCombinedMultDelta[effectIndex] = +effectState.chorusCombinedMultDelta;

                    chorusPhase[effectIndex] = effectState.chorusPhase % (Math.PI * 2.0);
                    chorusTap0Index[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset0 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[0][0]);
                    chorusTap1Index[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset1 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[0][1]);
                    chorusTap2Index[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset2 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[0][2]);
                    chorusTap3Index[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset3 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[1][0]);
                    chorusTap4Index[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset4 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[1][1]);
                    chorusTap5Index[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset5 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[1][2]);
                    chorusPhase[effectIndex] += chorusAngle * runLength;
                    chorusTap0End[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset0 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[0][0]) + runLength;
                    chorusTap1End[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset1 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[0][1]) + runLength;
                    chorusTap2End[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset2 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[0][2]) + runLength;
                    chorusTap3End[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset3 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[1][0]) + runLength;
                    chorusTap4End[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset4 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[1][1]) + runLength;
                    chorusTap5End[effectIndex] = chorusDelayPos[effectIndex] + chorusOffset5 - chorusRange * Math.sin(chorusPhase[effectIndex] + Config.chorusPhaseOffsets[1][2]) + runLength;
                    chorusTap0Delta[effectIndex] = (chorusTap0End[effectIndex] - chorusTap0Index[effectIndex]) / runLength;
                    chorusTap1Delta[effectIndex] = (chorusTap1End[effectIndex] - chorusTap1Index[effectIndex]) / runLength;
                    chorusTap2Delta[effectIndex] = (chorusTap2End[effectIndex] - chorusTap2Index[effectIndex]) / runLength;
                    chorusTap3Delta[effectIndex] = (chorusTap3End[effectIndex] - chorusTap3Index[effectIndex]) / runLength;
                    chorusTap4Delta[effectIndex] = (chorusTap4End[effectIndex] - chorusTap4Index[effectIndex]) / runLength;
                    chorusTap5Delta[effectIndex] = (chorusTap5End[effectIndex] - chorusTap5Index[effectIndex]) / runLength;`
                }
                else if (usesEcho && effectState.type == EffectType.echo) {
                    effectsSource += `
                    echoMult[effectIndex] = +effectState.echoMult;
                    echoMultDelta[effectIndex] = +effectState.echoMultDelta;

                    echoDelayLineL[effectIndex] = effectState.echoDelayLineL;
                    echoDelayLineR[effectIndex] = effectState.echoDelayLineR;
                    echoMask[effectIndex] = (echoDelayLineL[effectIndex].length - 1) >>> 0;
                    effectState.echoDelayLineDirty = true;

                    echoDelayPosL[effectIndex] = effectState.echoDelayPosL & echoMask[effectIndex];
                    echoDelayPosR[effectIndex] = effectState.echoDelayPosR & echoMask[effectIndex];
                    echoDelayOffsetStart[effectIndex] = (echoDelayLineL[effectIndex].length - effectState.echoDelayOffsetStart) & echoMask[effectIndex];
                    echoDelayOffsetEnd[effectIndex]   = (echoDelayLineL[effectIndex].length - effectState.echoDelayOffsetEnd) & echoMask[effectIndex];
                    echoDelayOffsetRatio[effectIndex] = +effectState.echoDelayOffsetRatio;
                    echoDelayOffsetRatioDelta[effectIndex] = +effectState.echoDelayOffsetRatioDelta;
                    echoPingPong[effectIndex] = effectState.echoPingPong;

                    echoShelfA1[effectIndex] = +effectState.echoShelfA1;
                    echoShelfB0[effectIndex] = +effectState.echoShelfB0;
                    echoShelfB1[effectIndex] = +effectState.echoShelfB1;
                    echoShelfSampleL[effectIndex] = +effectState.echoShelfSampleL;
                    echoShelfSampleR[effectIndex] = +effectState.echoShelfSampleR;
                    echoShelfPrevInputL[effectIndex] = +effectState.echoShelfPrevInputL;
                    echoShelfPrevInputR[effectIndex] = +effectState.echoShelfPrevInputR;`
                }
                else if (usesReverb && effectState.type == EffectType.reverb) {
                    effectsSource += `

                    reverbDelayLine[effectIndex] = effectState.reverbDelayLine;
                    effectState.reverbDelayLineDirty = true;
                    reverbDelayPos[effectIndex] = effectState.reverbDelayPos & reverbMask;

                    reverb[effectIndex] = +effectState.reverbMult;
                    reverbDelta[effectIndex] = +effectState.reverbMultDelta;

                    reverbShelfA1[effectIndex] = +effectState.reverbShelfA1;
                    reverbShelfB0[effectIndex] = +effectState.reverbShelfB0;
                    reverbShelfB1[effectIndex] = +effectState.reverbShelfB1;
                    reverbShelfSample0[effectIndex] = +effectState.reverbShelfSample0;
                    reverbShelfSample1[effectIndex] = +effectState.reverbShelfSample1;
                    reverbShelfSample2[effectIndex] = +effectState.reverbShelfSample2;
                    reverbShelfSample3[effectIndex] = +effectState.reverbShelfSample3;
                    reverbShelfPrevInput0[effectIndex] = +effectState.reverbShelfPrevInput0;
                    reverbShelfPrevInput1[effectIndex] = +effectState.reverbShelfPrevInput1;
                    reverbShelfPrevInput2[effectIndex] = +effectState.reverbShelfPrevInput2;
                    reverbShelfPrevInput3[effectIndex] = +effectState.reverbShelfPrevInput3;`
                }
                else if (usesGain && effectState.type == EffectType.gain) {
                    effectsSource += `

                    gain[effectIndex] = +effectState.gain;
                    gainDelta[effectIndex] = +effectState.gainDelta;`
                }
            }

            if (stereoChannels == 0) {
                effectsSource += `

                const stopIndex = bufferIndex + runLength;
                for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
                    let sampleL = tempInstrumentSampleBufferL[sampleIndex];
                    let sampleR = tempInstrumentSampleBufferL[sampleIndex];
                    tempInstrumentSampleBufferL[sampleIndex] = 0.0;
                    tempInstrumentSampleBufferR[sampleIndex] = 0.0;`
            } else if (stereoChannels == 1) {
                effectsSource += `

                const stopIndex = bufferIndex + runLength;
                for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
                    let sampleL = tempInstrumentSampleBufferR[sampleIndex];
                    let sampleR = tempInstrumentSampleBufferR[sampleIndex];
                    tempInstrumentSampleBufferL[sampleIndex] = 0.0;
                    tempInstrumentSampleBufferR[sampleIndex] = 0.0;`
            } else if (stereoChannels == 2) {
                effectsSource += `

                const stopIndex = bufferIndex + runLength;
                for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
                    let sampleL = tempInstrumentSampleBufferL[sampleIndex];
                    let sampleR = tempInstrumentSampleBufferR[sampleIndex];
                    tempInstrumentSampleBufferL[sampleIndex] = 0.0;
                    tempInstrumentSampleBufferR[sampleIndex] = 0.0;`
            }

            let hasUsedDelays: boolean = false;

			for (let i: number = 0; i < instrumentState.effects.length; i++) {
                let effectState: EffectState = instrumentState.effects[i];

                effectsSource += `

                effectIndex = ` + i + `;
                `

                if (effectState.type == EffectType.chorus || effectState.type == EffectType.reverb || effectState.type == EffectType.echo || effectState.type == EffectType.granular || effectState.type == EffectType.flanger) hasUsedDelays = true;

                if (usesBitcrusher && effectState.type == EffectType.bitcrusher) {
                    effectsSource += `

                    bitcrusherPhase[effectIndex] += bitcrusherPhaseDelta[effectIndex];
                    if (bitcrusherPhase[effectIndex] < 1.0) {
                        bitcrusherPrevInputL[effectIndex] = sampleL;
                        bitcrusherPrevInputR[effectIndex] = sampleR;
                        sampleL = bitcrusherCurrentOutputL[effectIndex];
                        sampleR = bitcrusherCurrentOutputR[effectIndex];
                    } else {
                        bitcrusherPhase[effectIndex] = bitcrusherPhase[effectIndex] % 1.0;

                        lerpedInputL[effectIndex] = sampleL + (bitcrusherPrevInputL[effectIndex] - sampleL) * (bitcrusherPhase[effectIndex] / bitcrusherPhaseDelta[effectIndex]);
                        lerpedInputR[effectIndex] = sampleR + (bitcrusherPrevInputR[effectIndex] - sampleR) * (bitcrusherPhase[effectIndex] / bitcrusherPhaseDelta[effectIndex]);
                        bitcrusherPrevInputL[effectIndex] = sampleL;
                        bitcrusherPrevInputR[effectIndex] = sampleR;

                        bitcrusherWrapLevel[effectIndex] = bitcrusherFoldLevel[effectIndex] * 4.0;
                        wrappedSampleL[effectIndex] = (((lerpedInputL[effectIndex] + bitcrusherFoldLevel[effectIndex]) % bitcrusherWrapLevel[effectIndex]) + bitcrusherWrapLevel[effectIndex]) % bitcrusherWrapLevel[effectIndex];
                        wrappedSampleR[effectIndex] = (((lerpedInputR[effectIndex] + bitcrusherFoldLevel[effectIndex]) % bitcrusherWrapLevel[effectIndex]) + bitcrusherWrapLevel[effectIndex]) % bitcrusherWrapLevel[effectIndex];
                        foldedSampleL[effectIndex] = bitcrusherFoldLevel[effectIndex] - Math.abs(bitcrusherFoldLevel[effectIndex] * 2.0 - wrappedSampleL[effectIndex]);
                        foldedSampleR[effectIndex] = bitcrusherFoldLevel[effectIndex] - Math.abs(bitcrusherFoldLevel[effectIndex] * 2.0 - wrappedSampleR[effectIndex]);
                        scaledSampleL[effectIndex] = foldedSampleL[effectIndex] / bitcrusherScale[effectIndex];
                        scaledSampleR[effectIndex] = foldedSampleR[effectIndex] / bitcrusherScale[effectIndex];
                        oldValueL[effectIndex] = bitcrusherCurrentOutputL[effectIndex];
                        oldValueR[effectIndex] = bitcrusherCurrentOutputR[effectIndex];
                        newValueL[effectIndex] = (((scaledSampleL[effectIndex] > 0 ? scaledSampleL[effectIndex] + 1 : scaledSampleL[effectIndex])|0)-.5) * bitcrusherScale[effectIndex];
                        newValueR[effectIndex] = (((scaledSampleR[effectIndex] > 0 ? scaledSampleR[effectIndex] + 1 : scaledSampleR[effectIndex])|0)-.5) * bitcrusherScale[effectIndex];

                        sampleL = oldValueL[effectIndex] + (newValueL[effectIndex] - oldValueL[effectIndex]) * (bitcrusherPhase[effectIndex] / bitcrusherPhaseDelta[effectIndex]);
                        sampleR = oldValueR[effectIndex] + (newValueR[effectIndex] - oldValueR[effectIndex]) * (bitcrusherPhase[effectIndex] / bitcrusherPhaseDelta[effectIndex]);
                        bitcrusherCurrentOutputL[effectIndex] = newValueL[effectIndex];
                        bitcrusherCurrentOutputR[effectIndex] = newValueR[effectIndex];
                    }
                    bitcrusherPhaseDelta[effectIndex] *= bitcrusherPhaseDeltaScale[effectIndex];
                    bitcrusherScale[effectIndex] *= bitcrusherScaleScale[effectIndex];
                    bitcrusherFoldLevel[effectIndex] *= bitcrusherFoldLevelScale[effectIndex];`
                }
                else if (usesDistortion && effectState.type == EffectType.distortion) {
                    effectsSource += `

                    distortionNextInputL[effectIndex] = sampleL * distortionDrive[effectIndex];
                    distortionNextInputR[effectIndex] = sampleR * distortionDrive[effectIndex];
                    sampleL = distortionNextOutputL[effectIndex];
                    sampleR = distortionNextOutputR[effectIndex];
                    distortionNextOutputL[effectIndex] = distortionNextInputL[effectIndex] / (distortionReverse[effectIndex] * Math.abs(distortionNextInputL[effectIndex]) + distortion[effectIndex]);
                    distortionNextOutputR[effectIndex] = distortionNextInputR[effectIndex] / (distortionReverse[effectIndex] * Math.abs(distortionNextInputR[effectIndex]) + distortion[effectIndex]);
                    distortionFractionalInputL1[effectIndex] = distortionFractionalDelayG1 * distortionNextInputL[effectIndex] + distortionPrevInputL[effectIndex] - distortionFractionalDelayG1 * distortionFractionalInputL1[effectIndex];
                    distortionFractionalInputL2[effectIndex] = distortionFractionalDelayG2 * distortionNextInputL[effectIndex] + distortionPrevInputL[effectIndex] - distortionFractionalDelayG2 * distortionFractionalInputL2[effectIndex];
                    distortionFractionalInputL3[effectIndex] = distortionFractionalDelayG3 * distortionNextInputL[effectIndex] + distortionPrevInputL[effectIndex] - distortionFractionalDelayG3 * distortionFractionalInputL3[effectIndex];
                    distortionFractionalInputR1[effectIndex] = distortionFractionalDelayG1 * distortionNextInputR[effectIndex] + distortionPrevInputR[effectIndex] - distortionFractionalDelayG1 * distortionFractionalInputR1[effectIndex];
                    distortionFractionalInputR2[effectIndex] = distortionFractionalDelayG2 * distortionNextInputR[effectIndex] + distortionPrevInputR[effectIndex] - distortionFractionalDelayG2 * distortionFractionalInputR2[effectIndex];
                    distortionFractionalInputR3[effectIndex] = distortionFractionalDelayG3 * distortionNextInputR[effectIndex] + distortionPrevInputR[effectIndex] - distortionFractionalDelayG3 * distortionFractionalInputR3[effectIndex];
                    distortionOutputL1[effectIndex] = distortionFractionalInputL1[effectIndex] / (distortionReverse[effectIndex] * Math.abs(distortionFractionalInputL1[effectIndex]) + distortion[effectIndex]);
                    distortionOutputL2[effectIndex] = distortionFractionalInputL2[effectIndex] / (distortionReverse[effectIndex] * Math.abs(distortionFractionalInputL2[effectIndex]) + distortion[effectIndex]);
                    distortionOutputL3[effectIndex] = distortionFractionalInputL3[effectIndex] / (distortionReverse[effectIndex] * Math.abs(distortionFractionalInputL3[effectIndex]) + distortion[effectIndex]);
                    distortionOutputR1[effectIndex] = distortionFractionalInputR1[effectIndex] / (distortionReverse[effectIndex] * Math.abs(distortionFractionalInputR1[effectIndex]) + distortion[effectIndex]);
                    distortionOutputR2[effectIndex] = distortionFractionalInputR2[effectIndex] / (distortionReverse[effectIndex] * Math.abs(distortionFractionalInputR2[effectIndex]) + distortion[effectIndex]);
                    distortionOutputR3[effectIndex] = distortionFractionalInputR3[effectIndex] / (distortionReverse[effectIndex] * Math.abs(distortionFractionalInputR3[effectIndex]) + distortion[effectIndex]);
                    distortionNextOutputL[effectIndex] += distortionOutputL1[effectIndex] * distortionNextOutputWeight1 + distortionOutputL2[effectIndex] * distortionNextOutputWeight2 + distortionOutputL3[effectIndex] * distortionNextOutputWeight3;
                    distortionNextOutputR[effectIndex] += distortionOutputR1[effectIndex] * distortionNextOutputWeight1 + distortionOutputR2[effectIndex] * distortionNextOutputWeight2 + distortionOutputR3[effectIndex] * distortionNextOutputWeight3;
                    sampleL += distortionOutputL1[effectIndex] * distortionPrevOutputWeight1 + distortionOutputL2[effectIndex] * distortionPrevOutputWeight2 + distortionOutputL3[effectIndex] * distortionPrevOutputWeight3;
                    sampleR += distortionOutputR1[effectIndex] * distortionPrevOutputWeight1 + distortionOutputR2[effectIndex] * distortionPrevOutputWeight2 + distortionOutputR3[effectIndex] * distortionPrevOutputWeight3;
                    sampleL *= distortionOversampleCompensation;
                    sampleR *= distortionOversampleCompensation;
                    distortionPrevInputL[effectIndex] = distortionNextInputL[effectIndex];
                    distortionPrevInputR[effectIndex] = distortionNextInputR[effectIndex];
                    distortion[effectIndex] += distortionDelta[effectIndex];
                    distortionDrive[effectIndex] += distortionDriveDelta[effectIndex];`
                }
                else if (usesClipping && effectState.type == EffectType.clipping) {
                    if (effectState.clippingType == 0) {
                        effectsSource += `
                        sampleL *= 1 / clippingInGain[effectIndex];
                        sampleR *= 1 / clippingInGain[effectIndex];

                        clippingThresholdLevel[effectIndex] = (1 - clippingThreshold[effectIndex]) * clippingBaseVolume;

                        //sampleL = Math.abs(sampleL) > Math.abs(clippingThresholdLevel[effectIndex]) ? clippingThresholdLevel[effectIndex] * (sampleL / Math.abs(sampleL)) : (sampleL - (sampleL ** 3) / 3) * 1.5 * clippingThresholdLevel[effectIndex];
                        //sampleR = Math.abs(sampleR) > Math.abs(clippingThresholdLevel[effectIndex]) ? clippingThresholdLevel[effectIndex] * (sampleR / Math.abs(sampleR)) : (sampleR - (sampleR ** 3) / 3) * 1.5 * clippingThresholdLevel[effectIndex];

                        sampleL = Math.tanh(sampleL / clippingThresholdLevel[effectIndex]) * clippingThresholdLevel[effectIndex];
                        sampleR = Math.tanh(sampleR / clippingThresholdLevel[effectIndex]) * clippingThresholdLevel[effectIndex];
                        // tanh... i would much rather use a cubic implementation but i couldnt get that to work

                        sampleL *= clippingInGain[effectIndex] ** 0.5;
                        sampleR *= clippingInGain[effectIndex] ** 0.5;

                        clippingInGain[effectIndex] += clippingInGainDelta[effectIndex];
                        clippingThreshold[effectIndex] += clippingThresholdDelta[effectIndex];
                        `
                    }
                    if (effectState.clippingType == 1) {
                        effectsSource += `
                        sampleL *= 1 / clippingInGain[effectIndex];
                        sampleR *= 1 / clippingInGain[effectIndex];

                        clippingThresholdLevel[effectIndex] = (1 - clippingThreshold[effectIndex]) * clippingBaseVolume;

                        sampleL = Math.abs(sampleL) > Math.abs(clippingThresholdLevel[effectIndex]) ? clippingThresholdLevel[effectIndex] * (sampleL / Math.abs(sampleL)) : sampleL;
                        sampleR = Math.abs(sampleR) > Math.abs(clippingThresholdLevel[effectIndex]) ? clippingThresholdLevel[effectIndex] * (sampleR / Math.abs(sampleR)) : sampleR;

                        sampleL *= clippingInGain[effectIndex] ** 0.5;
                        sampleR *= clippingInGain[effectIndex] ** 0.5;

                        clippingInGain[effectIndex] += clippingInGainDelta[effectIndex];
                        clippingThreshold[effectIndex] += clippingThresholdDelta[effectIndex];
                        `
                    }
                    if (effectState.clippingType == 2) {
                        effectsSource += `
                        sampleL *= 1 / clippingInGain[effectIndex];
                        sampleR *= 1 / clippingInGain[effectIndex];

                        clippingThresholdLevel[effectIndex] = (1 - clippingThreshold[effectIndex]) * clippingBaseVolume;

                        sampleL = Math.sin(sampleL / clippingThresholdLevel[effectIndex]) * clippingThresholdLevel[effectIndex];
                        sampleR = Math.sin(sampleR / clippingThresholdLevel[effectIndex]) * clippingThresholdLevel[effectIndex];

                        sampleL *= clippingInGain[effectIndex] ** 0.5;
                        sampleR *= clippingInGain[effectIndex] ** 0.5;

                        clippingInGain[effectIndex] += clippingInGainDelta[effectIndex];
                        clippingThreshold[effectIndex] += clippingThresholdDelta[effectIndex];
                        `
                    }
                    if (effectState.clippingType == 3) {
                        effectsSource += `
                        sampleL *= 1 / clippingInGain[effectIndex];
                        sampleR *= 1 / clippingInGain[effectIndex];

                        clippingThresholdLevel[effectIndex] = (1 - clippingThreshold[effectIndex]) * clippingBaseVolume;

                        sampleL = (sampleL % clippingThresholdLevel[effectIndex]);
                        sampleR = (sampleR % clippingThresholdLevel[effectIndex]);

                        sampleL *= clippingInGain[effectIndex] ** 0.5;
                        sampleR *= clippingInGain[effectIndex] ** 0.5;

                        clippingInGain[effectIndex] += clippingInGainDelta[effectIndex];
                        clippingThreshold[effectIndex] += clippingThresholdDelta[effectIndex];
                        `
                    }
                }
                else if (usesGain && effectState.type == EffectType.gain) {
                    effectsSource += `

                    sampleL *= gain[effectIndex];
                    sampleR *= gain[effectIndex];
                    `
                }
                else if (usesPanning && effectState.type == EffectType.panning) {
                    effectsSource += `

                    panningDelayLineL[effectIndex][panningDelayPos[effectIndex]] = sampleL;
                    panningDelayLineR[effectIndex][panningDelayPos[effectIndex]] = sampleR;
                    panningRatioL[effectIndex]  = panningOffsetL[effectIndex] % 1;
                    panningRatioR[effectIndex]  = panningOffsetR[effectIndex] % 1;
                    panningTapLA[effectIndex]   = panningDelayLineL[effectIndex][(panningOffsetL[effectIndex]) & panningMask];
                    panningTapLB[effectIndex]   = panningDelayLineL[effectIndex][(panningOffsetL[effectIndex] + 1) & panningMask];
                    panningTapRA[effectIndex]   = panningDelayLineR[effectIndex][(panningOffsetR[effectIndex]) & panningMask];
                    panningTapRB[effectIndex]   = panningDelayLineR[effectIndex][(panningOffsetR[effectIndex] + 1) & panningMask];
                    panningTapL[effectIndex]    = panningTapLA[effectIndex] + (panningTapLB[effectIndex] - panningTapLA[effectIndex]) * panningRatioL[effectIndex];
                    panningTapR[effectIndex]    = panningTapRA[effectIndex] + (panningTapRB[effectIndex] - panningTapRA[effectIndex]) * panningRatioR[effectIndex];
                    `
                    if (effectState.panningMode == 0) {
                        effectsSource += `

                    sampleL = panningTapL[effectIndex] * panningVolumeL[effectIndex];
                    sampleR = panningTapR[effectIndex] * panningVolumeR[effectIndex];
                    panningDelayPos[effectIndex] = (panningDelayPos[effectIndex] + 1) & panningMask;
                    panningVolumeL[effectIndex] += panningVolumeDeltaL[effectIndex];
                    panningVolumeR[effectIndex] += panningVolumeDeltaR[effectIndex];
                    panningOffsetL[effectIndex] += panningOffsetDeltaL[effectIndex];
                    panningOffsetR[effectIndex] += panningOffsetDeltaR[effectIndex];`
                    }
                    else if (effectState.panningMode == 1) {
                        effectsSource += `

                    sampleL = panningTapL[effectIndex] * panningVolumeL[effectIndex] + Math.max(0, panningVolumeL[effectIndex] - panningVolumeR[effectIndex]) * panningTapR[effectIndex];
                    sampleR = panningTapR[effectIndex] * panningVolumeR[effectIndex] + Math.max(0, panningVolumeR[effectIndex] - panningVolumeL[effectIndex]) * panningTapL[effectIndex];
                    panningDelayPos[effectIndex] = (panningDelayPos[effectIndex] + 1) & panningMask;
                    panningVolumeL[effectIndex] += panningVolumeDeltaL[effectIndex];
                    panningVolumeR[effectIndex] += panningVolumeDeltaR[effectIndex];
                    panningOffsetL[effectIndex] += panningOffsetDeltaL[effectIndex];
                    panningOffsetR[effectIndex] += panningOffsetDeltaR[effectIndex];`
                    }
                    else if (effectState.panningMode == 2) {
                        effectsSource += `

                    sampleL = (panningTapL[effectIndex] + panningTapR[effectIndex]) / 2.0
                    sampleR = sampleL
                    sampleL *= panningVolumeL[effectIndex];
                    sampleR *= panningVolumeR[effectIndex];
                    panningDelayPos[effectIndex] = (panningDelayPos[effectIndex] + 1) & panningMask;
                    panningVolumeL[effectIndex] += panningVolumeDeltaL[effectIndex];
                    panningVolumeR[effectIndex] += panningVolumeDeltaR[effectIndex];
                    panningOffsetL[effectIndex] += panningOffsetDeltaL[effectIndex];
                    panningOffsetR[effectIndex] += panningOffsetDeltaR[effectIndex];`
                    }
                }
                else if (usesFlanger && effectState.type == EffectType.flanger) {
                    effectsSource += `

                    flangerTapRatioL[effectIndex] = flangerTapIndexL[effectIndex] % 1;
                    flangerTapRatioR[effectIndex] = flangerTapIndexR[effectIndex] % 1;
                    flangerTapLA[effectIndex] = flangerDelayLineL[effectIndex][(flangerTapIndexL[effectIndex]) & flangerMask];
                    flangerTapLB[effectIndex] = flangerDelayLineL[effectIndex][(flangerTapIndexL[effectIndex] + 1) & flangerMask];
                    flangerTapRA[effectIndex] = flangerDelayLineR[effectIndex][(flangerTapIndexR[effectIndex]) & flangerMask];
                    flangerTapRB[effectIndex] = flangerDelayLineR[effectIndex][(flangerTapIndexR[effectIndex] + 1) & flangerMask];
                    flangerTapL[effectIndex] = flangerTapLA[effectIndex] + (flangerTapLB[effectIndex] - flangerTapLA[effectIndex]) * flangerTapRatioL[effectIndex];
                    flangerTapR[effectIndex] = flangerTapRA[effectIndex] + (flangerTapRB[effectIndex] - flangerTapRA[effectIndex]) * flangerTapRatioR[effectIndex];

                    flangerDelayLineL[effectIndex][flangerDelayPos[effectIndex]] = sampleL * delayInputMult;
                    flangerDelayLineR[effectIndex][flangerDelayPos[effectIndex]] = sampleR * delayInputMult;
                    sampleL = (sampleL + flanger[effectIndex] * flangerTapL[effectIndex]) * (1 - flanger[effectIndex] * Config.flangerVolumeMult);
                    sampleR = (sampleR + flanger[effectIndex] * flangerTapR[effectIndex]) * (1 - flanger[effectIndex] * Config.flangerVolumeMult);
                    flangerDelayLineL[effectIndex][flangerDelayPos[effectIndex]] = flangerDelayLineL[effectIndex][flangerDelayPos[effectIndex]] * (1 - flangerFeedback[effectIndex]) - sampleL * flangerFeedback[effectIndex];
                    flangerDelayLineR[effectIndex][flangerDelayPos[effectIndex]] = flangerDelayLineR[effectIndex][flangerDelayPos[effectIndex]] * (1 - flangerFeedback[effectIndex]) - sampleR * flangerFeedback[effectIndex];
                    flangerDelayPos[effectIndex] = (flangerDelayPos[effectIndex] + 1) & flangerMask;
                    flangerTapIndexL[effectIndex] += flangerTapDeltaL[effectIndex];
                    flangerTapIndexR[effectIndex] += flangerTapDeltaR[effectIndex];

                    flanger[effectIndex] += flangerDelta[effectIndex];
                    flangerSpeed[effectIndex] += flangerSpeedDelta[effectIndex];
                    flangerDepth[effectIndex] += flangerDepthDelta[effectIndex];
                    flangerFeedback[effectIndex] += flangerFeedbackDelta[effectIndex];`
                }
                else if (usesChorus && effectState.type == EffectType.chorus) {
                    effectsSource += `

                    chorusTap0Ratio[effectIndex] = chorusTap0Index[effectIndex] % 1;
                    chorusTap1Ratio[effectIndex] = chorusTap1Index[effectIndex] % 1;
                    chorusTap2Ratio[effectIndex] = chorusTap2Index[effectIndex] % 1;
                    chorusTap3Ratio[effectIndex] = chorusTap3Index[effectIndex] % 1;
                    chorusTap4Ratio[effectIndex] = chorusTap4Index[effectIndex] % 1;
                    chorusTap5Ratio[effectIndex] = chorusTap5Index[effectIndex] % 1;
                    chorusTap0A[effectIndex] = chorusDelayLineL[effectIndex][(chorusTap0Index[effectIndex]) & chorusMask];
                    chorusTap0B[effectIndex] = chorusDelayLineL[effectIndex][(chorusTap0Index[effectIndex] + 1) & chorusMask];
                    chorusTap1A[effectIndex] = chorusDelayLineL[effectIndex][(chorusTap1Index[effectIndex]) & chorusMask];
                    chorusTap1B[effectIndex] = chorusDelayLineL[effectIndex][(chorusTap1Index[effectIndex] + 1) & chorusMask];
                    chorusTap2A[effectIndex] = chorusDelayLineL[effectIndex][(chorusTap2Index[effectIndex]) & chorusMask];
                    chorusTap2B[effectIndex] = chorusDelayLineL[effectIndex][(chorusTap2Index[effectIndex] + 1) & chorusMask];
                    chorusTap3A[effectIndex] = chorusDelayLineR[effectIndex][(chorusTap3Index[effectIndex]) & chorusMask];
                    chorusTap3B[effectIndex] = chorusDelayLineR[effectIndex][(chorusTap3Index[effectIndex] + 1) & chorusMask];
                    chorusTap4A[effectIndex] = chorusDelayLineR[effectIndex][(chorusTap4Index[effectIndex]) & chorusMask];
                    chorusTap4B[effectIndex] = chorusDelayLineR[effectIndex][(chorusTap4Index[effectIndex] + 1) & chorusMask];
                    chorusTap5A[effectIndex] = chorusDelayLineR[effectIndex][(chorusTap5Index[effectIndex]) & chorusMask];
                    chorusTap5B[effectIndex] = chorusDelayLineR[effectIndex][(chorusTap5Index[effectIndex] + 1) & chorusMask];
                    chorusTap0[effectIndex] = chorusTap0A[effectIndex] + (chorusTap0B[effectIndex] - chorusTap0A[effectIndex]) * chorusTap0Ratio[effectIndex];
                    chorusTap1[effectIndex] = chorusTap1A[effectIndex] + (chorusTap1B[effectIndex] - chorusTap1A[effectIndex]) * chorusTap1Ratio[effectIndex];
                    chorusTap2[effectIndex] = chorusTap2A[effectIndex] + (chorusTap2B[effectIndex] - chorusTap2A[effectIndex]) * chorusTap2Ratio[effectIndex];
                    chorusTap3[effectIndex] = chorusTap3A[effectIndex] + (chorusTap3B[effectIndex] - chorusTap3A[effectIndex]) * chorusTap3Ratio[effectIndex];
                    chorusTap4[effectIndex] = chorusTap4A[effectIndex] + (chorusTap4B[effectIndex] - chorusTap4A[effectIndex]) * chorusTap4Ratio[effectIndex];
                    chorusTap5[effectIndex] = chorusTap5A[effectIndex] + (chorusTap5B[effectIndex] - chorusTap5A[effectIndex]) * chorusTap5Ratio[effectIndex];
                    chorusDelayLineL[effectIndex][chorusDelayPos[effectIndex]] = sampleL * delayInputMult;
                    chorusDelayLineR[effectIndex][chorusDelayPos[effectIndex]] = sampleR * delayInputMult;
                    sampleL = chorusCombinedMult[effectIndex] * (sampleL + chorusVoiceMult[effectIndex] * (chorusTap1[effectIndex] - chorusTap0[effectIndex] - chorusTap2[effectIndex]));
                    sampleR = chorusCombinedMult[effectIndex] * (sampleR + chorusVoiceMult[effectIndex] * (chorusTap4[effectIndex] - chorusTap3[effectIndex] - chorusTap5[effectIndex]));
                    chorusDelayPos[effectIndex] = (chorusDelayPos[effectIndex] + 1) & chorusMask;
                    chorusTap0Index[effectIndex] += chorusTap0Delta[effectIndex];
                    chorusTap1Index[effectIndex] += chorusTap1Delta[effectIndex];
                    chorusTap2Index[effectIndex] += chorusTap2Delta[effectIndex];
                    chorusTap3Index[effectIndex] += chorusTap3Delta[effectIndex];
                    chorusTap4Index[effectIndex] += chorusTap4Delta[effectIndex];
                    chorusTap5Index[effectIndex] += chorusTap5Delta[effectIndex];
                    chorusVoiceMult[effectIndex] += chorusVoiceMultDelta[effectIndex];
                    chorusCombinedMult[effectIndex] += chorusCombinedMultDelta[effectIndex];`
                }
                else if (usesEcho && effectState.type == EffectType.echo) {
                    effectsSource += `

                    echoNextInputL[effectIndex] = (sampleL + sampleR) / 2;
                    echoNextInputR[effectIndex] = (sampleL + sampleR) / 2;
                    echoTapStartIndexL[effectIndex] = (echoDelayPosL[effectIndex] + echoDelayOffsetStart[effectIndex]) & echoMask[effectIndex];
                    echoTapStartIndexR[effectIndex] = (echoDelayPosR[effectIndex] + echoDelayOffsetStart[effectIndex]) & echoMask[effectIndex];
                    echoTapEndIndexL[effectIndex]   = (echoDelayPosL[effectIndex] + echoDelayOffsetEnd[effectIndex]) & echoMask[effectIndex];
                    echoTapEndIndexR[effectIndex]   = (echoDelayPosR[effectIndex] + echoDelayOffsetEnd[effectIndex]) & echoMask[effectIndex];
                    echoTapStartL[effectIndex] = echoDelayLineL[effectIndex][echoTapStartIndexL[effectIndex]];
                    echoTapEndL[effectIndex]   = echoDelayLineL[effectIndex][echoTapEndIndexL[effectIndex]];
                    echoTapStartR[effectIndex] = echoDelayLineR[effectIndex][echoTapStartIndexR[effectIndex]];
                    echoTapEndR[effectIndex]   = echoDelayLineR[effectIndex][echoTapEndIndexR[effectIndex]];
                    echoTapL[effectIndex] = (echoTapStartL[effectIndex] + (echoTapEndL[effectIndex] - echoTapStartL[effectIndex]) * echoDelayOffsetRatio[effectIndex]) * echoMult[effectIndex];
                    echoTapR[effectIndex] = (echoTapStartR[effectIndex] + (echoTapEndR[effectIndex] - echoTapStartR[effectIndex]) * echoDelayOffsetRatio[effectIndex]) * echoMult[effectIndex];

                    echoShelfSampleL[effectIndex] = echoShelfB0[effectIndex] * echoTapL[effectIndex] + echoShelfB1[effectIndex] * echoShelfPrevInputL[effectIndex] - echoShelfA1[effectIndex] * echoShelfSampleL[effectIndex];
                    echoShelfSampleR[effectIndex] = echoShelfB0[effectIndex] * echoTapR[effectIndex] + echoShelfB1[effectIndex] * echoShelfPrevInputR[effectIndex] - echoShelfA1[effectIndex] * echoShelfSampleR[effectIndex];
                    echoShelfPrevInputL[effectIndex] = echoTapL[effectIndex];
                    echoShelfPrevInputR[effectIndex] = echoTapR[effectIndex];
                    sampleL += echoShelfSampleL[effectIndex];
                    sampleR += echoShelfSampleR[effectIndex];

                    echoDelayLineL[effectIndex][echoDelayPosL[effectIndex]] = (sampleL * (1 - Math.abs(echoPingPong[effectIndex])) + (echoNextInputL[effectIndex] * Math.max(0, echoPingPong[effectIndex]) + echoShelfSampleR[effectIndex]) * Math.abs(echoPingPong[effectIndex])) * delayInputMult;
                    echoDelayLineR[effectIndex][echoDelayPosR[effectIndex]] = (sampleR * (1 - Math.abs(echoPingPong[effectIndex])) + (echoNextInputR[effectIndex] * Math.max(0, -echoPingPong[effectIndex]) + echoShelfSampleL[effectIndex]) * Math.abs(echoPingPong[effectIndex])) * delayInputMult;
                    echoDelayPosL[effectIndex] = (echoDelayPosL[effectIndex] + 1) & echoMask[effectIndex];
                    echoDelayPosR[effectIndex] = (echoDelayPosR[effectIndex] + 1) & echoMask[effectIndex];
                    echoDelayOffsetRatio[effectIndex] += echoDelayOffsetRatioDelta[effectIndex];
                    echoMult[effectIndex] += echoMultDelta[effectIndex];
                    `
                }
                else if (usesReverb && effectState.type == EffectType.reverb) {
                    effectsSource += `

                    // Reverb, implemented using a feedback delay network with a Hadamard matrix and lowpass filters.
                    // good ratios:    0.555235 + 0.618033 + 0.818 +   1.0 = 2.991268
                    // Delay lengths:  3041     + 3385     + 4481  +  5477 = 16384 = 2^14
                    // Buffer offsets: 3041    -> 6426   -> 10907 -> 16384
                    reverbDelayPos1[effectIndex] = (reverbDelayPos[effectIndex] +  3041) & reverbMask;
                    reverbDelayPos2[effectIndex] = (reverbDelayPos[effectIndex] +  6426) & reverbMask;
                    reverbDelayPos3[effectIndex] = (reverbDelayPos[effectIndex] + 10907) & reverbMask;
                    reverbSample0[effectIndex] = (reverbDelayLine[effectIndex][reverbDelayPos[effectIndex]]);
                    reverbSample1[effectIndex] = reverbDelayLine[effectIndex][reverbDelayPos1[effectIndex]];
                    reverbSample2[effectIndex] = reverbDelayLine[effectIndex][reverbDelayPos2[effectIndex]];
                    reverbSample3[effectIndex] = reverbDelayLine[effectIndex][reverbDelayPos3[effectIndex]];
                    reverbTemp0[effectIndex] = -(reverbSample0[effectIndex] + sampleL) + reverbSample1[effectIndex];
                    reverbTemp1[effectIndex] = -(reverbSample0[effectIndex] + sampleR) - reverbSample1[effectIndex];
                    reverbTemp2[effectIndex] = -reverbSample2[effectIndex] + reverbSample3[effectIndex];
                    reverbTemp3[effectIndex] = -reverbSample2[effectIndex] - reverbSample3[effectIndex];
                    reverbShelfInput0[effectIndex] = (reverbTemp0[effectIndex] + reverbTemp2[effectIndex]) * reverb[effectIndex];
                    reverbShelfInput1[effectIndex] = (reverbTemp1[effectIndex] + reverbTemp3[effectIndex]) * reverb[effectIndex];
                    reverbShelfInput2[effectIndex] = (reverbTemp0[effectIndex] - reverbTemp2[effectIndex]) * reverb[effectIndex];
                    reverbShelfInput3[effectIndex] = (reverbTemp1[effectIndex] - reverbTemp3[effectIndex]) * reverb[effectIndex];
                    reverbShelfSample0[effectIndex] = reverbShelfB0[effectIndex] * reverbShelfInput0[effectIndex] + reverbShelfB1[effectIndex] * reverbShelfPrevInput0[effectIndex] - reverbShelfA1[effectIndex] * reverbShelfSample0[effectIndex];
                    reverbShelfSample1[effectIndex] = reverbShelfB0[effectIndex] * reverbShelfInput1[effectIndex] + reverbShelfB1[effectIndex] * reverbShelfPrevInput1[effectIndex] - reverbShelfA1[effectIndex] * reverbShelfSample1[effectIndex];
                    reverbShelfSample2[effectIndex] = reverbShelfB0[effectIndex] * reverbShelfInput2[effectIndex] + reverbShelfB1[effectIndex] * reverbShelfPrevInput2[effectIndex] - reverbShelfA1[effectIndex] * reverbShelfSample2[effectIndex];
                    reverbShelfSample3[effectIndex] = reverbShelfB0[effectIndex] * reverbShelfInput3[effectIndex] + reverbShelfB1[effectIndex] * reverbShelfPrevInput3[effectIndex] - reverbShelfA1[effectIndex] * reverbShelfSample3[effectIndex];
                    reverbShelfPrevInput0[effectIndex] = reverbShelfInput0[effectIndex];
                    reverbShelfPrevInput1[effectIndex] = reverbShelfInput1[effectIndex];
                    reverbShelfPrevInput2[effectIndex] = reverbShelfInput2[effectIndex];
                    reverbShelfPrevInput3[effectIndex] = reverbShelfInput3[effectIndex];
                    reverbDelayLine[effectIndex][reverbDelayPos1[effectIndex]] = reverbShelfSample0[effectIndex] * delayInputMult;
                    reverbDelayLine[effectIndex][reverbDelayPos2[effectIndex]] = reverbShelfSample1[effectIndex] * delayInputMult;
                    reverbDelayLine[effectIndex][reverbDelayPos3[effectIndex]] = reverbShelfSample2[effectIndex] * delayInputMult;
                    reverbDelayLine[effectIndex][reverbDelayPos[effectIndex] ] = reverbShelfSample3[effectIndex] * delayInputMult;
                    reverbDelayPos[effectIndex] = (reverbDelayPos[effectIndex] + 1) & reverbMask;
                    sampleL += reverbSample1[effectIndex] + reverbSample2[effectIndex] + reverbSample3[effectIndex];
                    sampleR += reverbSample0[effectIndex] + reverbSample2[effectIndex] - reverbSample3[effectIndex];
                    reverb[effectIndex] += reverbDelta[effectIndex];`
                }
                else if (usesEqFilter && effectState.type == EffectType.eqFilter) {
                    effectsSource += `

                    inputSampleL[effectIndex] = sampleL;
                    inputSampleR[effectIndex] = sampleR;
                    sampleL = applyFilters(inputSampleL[effectIndex], initialFilterInputL1[effectIndex], initialFilterInputL2[effectIndex], filterCount[effectIndex], filtersL[effectIndex]);
                    sampleR = applyFilters(inputSampleR[effectIndex], initialFilterInputR1[effectIndex], initialFilterInputR2[effectIndex], filterCount[effectIndex], filtersR[effectIndex]);
                    initialFilterInputL2[effectIndex] = initialFilterInputL1[effectIndex];
                    initialFilterInputR2[effectIndex] = initialFilterInputR1[effectIndex];
                    initialFilterInputL1[effectIndex] = inputSampleL[effectIndex];
                    initialFilterInputR1[effectIndex] = inputSampleR[effectIndex];`

                    effectsSource += `

                    sampleL *= eqFilterVolume[effectIndex];
                    sampleR *= eqFilterVolume[effectIndex];
                    eqFilterVolume[effectIndex] += eqFilterVolumeDelta[effectIndex];`

                    // the implementation of attenuation here, while consistent with beepbox, is
                    // rather strange. Ideally, a chain like [reverb -> eq] should be identical to
                    // a chain like [eq -> reverb], but because of the attenuation, it isn't. I've
                    // been obsessing over this for the past twelve hours so I feel like I should
                    // explain why.
                    //
                    // Firstly, why do we even need attenuation? The reason is because all filters
                    // introduce extra delay, called "group delay." This causes audible ringing
                    // after the input ends, which we generally don't want. For the types of filters
                    // that beepbox uses, the delay is longer the more resonant the frequency is.
                    // The group delay comes at a tradeoff with other characteristics of the filter,
                    // and in general the more specific the filter is in the frequency domain, the
                    // less specific it can be in the time domain. (i.e. filters with sharper
                    // cutoffs have more ringing)
                    //
                    // This is where the attenuation comes in! After the note has finished, it will
                    // cut off any extra delays that come after, which cleanly removes the ringing.
                    // Unfortunately, it also removes delays we *do* want, such as reverb. In
                    // Beepbox, this isn't a problem; the order of operations there goes roughly
                    // [distortion etc. -> post eq -> attenuation -> reverb etc.], so that the
                    // attenuation will always come after the eq and before the delays. In theepbox,
                    // though, the effects can be in any order, and so the attenuation may come
                    // after the delays. My compromise is to only attenuate if there hasn't already
                    // been delays yet, so you get the attenuation as often as possible, but only
                    // up to the point that it doesn't interfere with the other effects.
                    //
                    // In the future, I'd like to implement the Thiran filter (a filter with poor
                    // frequency response but better impulse response) as well as adjustable Q
                    // values so that you, as a musician, can evaluate the tradeoff yourself.

                    if (!hasUsedDelays) {
                        effectsSource += `

                        sampleL *= attenuationVolume;
                        sampleR *= attenuationVolume;
                        `
                    }
				}
				else if (usesRingModulation && effectState.type == EffectType.ringModulation) {
					effectsSource += `

					ringModOutputL[effectIndex] = sampleL * waveform[effectIndex][(ringModPhase[effectIndex]*waveformLength[effectIndex])|0];
					ringModOutputR[effectIndex] = sampleR * waveform[effectIndex][(ringModPhase[effectIndex]*waveformLength[effectIndex])|0];
					ringModMixF[effectIndex] = Math.max(0, ringModMix[effectIndex] * ringModMixFade[effectIndex]);
					sampleL = sampleL * (1 - ringModMixF[effectIndex]) + ringModOutputL[effectIndex] * ringModMixF[effectIndex];
					sampleR = sampleR * (1 - ringModMixF[effectIndex]) + ringModOutputR[effectIndex] * ringModMixF[effectIndex];

					ringModMix[effectIndex] += ringModMixDelta[effectIndex];
					ringModPhase[effectIndex] += ringModPhaseDelta[effectIndex];
					ringModPhase[effectIndex] = ringModPhase[effectIndex] % 1.0;
					ringModPhaseDelta[effectIndex] *= ringModPhaseDeltaScale[effectIndex];
					ringModMixFade[effectIndex] += ringModMixFadeDelta[effectIndex];
					`
				}
				else if (usesGranular && effectState.type == EffectType.granular) {
                    effectsSource += `
                    granularOutputL[effectIndex] = 0;
                    granularOutputR[effectIndex] = 0;
                    for (let grainIndex = 0; grainIndex < granularGrainCount[effectIndex]; grainIndex++) {
                        const grain = granularGrains[effectIndex][grainIndex];
                        if(computeGrains[effectIndex]) {
                            if(grain.delay > 0) {
                                grain.delay--;
                            } else {
                                const grainDelayLinePosition = grain.delayLinePosition;
                                const grainDelayLinePositionInt = grainDelayLinePosition | 0;
                                let grainAgeInSamples = grain.ageInSamples;
                                const grainMaxAgeInSamples = grain.maxAgeInSamples;
                                let grainSampleL = granularDelayLineL[effectIndex][((granularDelayLineIndex[effectIndex] + (granularDelayLineLength[effectIndex] - grainDelayLinePositionInt))    ) & granularDelayLineMask];
                                let grainSampleR = granularDelayLineR[effectIndex][((granularDelayLineIndex[effectIndex] + (granularDelayLineLength[effectIndex] - grainDelayLinePositionInt))    ) & granularDelayLineMask];
                                `
                                if (Config.granularEnvelopeType == GranularEnvelopeType.parabolic) {
                                    effectsSource +=`
                                    const grainEnvelope = grain.parabolicEnvelopeAmplitude;
                                    `
                                } else if (Config.granularEnvelopeType == GranularEnvelopeType.raisedCosineBell) {
                                    effectsSource +=`
                                    const grainEnvelope = grain.rcbEnvelopeAmplitude;
                                    `
                                }
                                effectsSource +=`
                                grainSampleL *= grainEnvelope;
                                grainSampleR *= grainEnvelope;
                                granularOutputL[effectIndex] += grainSampleL;
                                granularOutputR[effectIndex] += grainSampleR;
                                if (grainAgeInSamples > grainMaxAgeInSamples) {
                                    if (granularGrainCount[effectIndex] > 0) {
                                        // Faster equivalent of .pop, ignoring the order in the array.
                                        const lastGrainIndex = granularGrainCount[effectIndex] - 1;
                                        const lastGrain = granularGrains[effectIndex][lastGrainIndex];
                                        granularGrains[effectIndex][grainIndex] = lastGrain;
                                        granularGrains[effectIndex][lastGrainIndex] = grain;
                                        granularGrainCount[effectIndex]--;
                                        grainIndex--;
                                        // ^ Dangerous, since this could end up causing an infinite loop,
                                        // but should be okay in this case.
                                    }
                                } else {
                                    grainAgeInSamples++;
                                    `
                                    if (Config.granularEnvelopeType == GranularEnvelopeType.parabolic) {
                                        // grain.updateParabolicEnvelope();
                                        // Inlined:
                                        effectsSource +=`
                                        grain.parabolicEnvelopeAmplitude += grain.parabolicEnvelopeSlope;
                                        grain.parabolicEnvelopeSlope += grain.parabolicEnvelopeCurve;
                                        `
                                    } else if (Config.granularEnvelopeType == GranularEnvelopeType.raisedCosineBell) {
                                        effectsSource +=`
                                        grain.updateRCBEnvelope();
                                        `
                                    }
                                    effectsSource +=`
                                    grain.ageInSamples = grainAgeInSamples;
                                }
                            }
                        }
                    }
                    granularWet[effectIndex] += granularMixDelta[effectIndex];
                    granularDry[effectIndex] -= granularMixDelta[effectIndex];
                    granularOutputL[effectIndex] *= Config.granularOutputLoudnessCompensation;
                    granularOutputR[effectIndex] *= Config.granularOutputLoudnessCompensation;
                    granularDelayLineL[effectIndex][granularDelayLineIndex[effectIndex]] = sampleL;
                    granularDelayLineR[effectIndex][granularDelayLineIndex[effectIndex]] = sampleR;
                    granularDelayLineIndex[effectIndex] = (granularDelayLineIndex[effectIndex] + 1) & granularDelayLineMask[effectIndex];
                    sampleL = sampleL * granularDry[effectIndex] + granularOutputL[effectIndex] * granularWet[effectIndex];
                    sampleR = sampleR * granularDry[effectIndex] + granularOutputR[effectIndex] * granularWet[effectIndex];
                    `
                }
            }

            effectsSource += `

                    outputDataL[sampleIndex] += sampleL * mixVolume;
                    outputDataR[sampleIndex] += sampleR * mixVolume;
                    mixVolume += mixVolumeDelta;
                    attenuationVolume += attenuationVolumeDelta;`

            if (usesDelays) {
                effectsSource += `

                    delayInputMult += delayInputMultDelta;`
            }

            effectsSource += `
                }

                instrumentState.attenuationVolume = attenuationVolume;
                instrumentState.mixVolume = mixVolume;

                // Avoid persistent denormal or NaN values in the delay buffers and filter history.
                const epsilon = (1.0e-24);`

            if (usesDelays) {
                effectsSource += `

                instrumentState.delayInputMult = delayInputMult;`
            }

            for (let i: number = 0; i < instrumentState.effects.length; i++) {
                let effectState: EffectState = instrumentState.effects[i] as EffectState
                effectsSource += `

                effectState = instrumentState.effects[` + i + `];
                effectIndex = ` + i + `;
                `

                if (usesGranular && effectState.type == EffectType.granular) {
                    effectsSource += `
                        effectState.granularMix = granularWet[effectIndex];
                        effectState.granularGrainsLength = granularGrainCount[effectIndex];
                        effectState.granularDelayLineIndex = granularDelayLineIndex[effectIndex];
                    `
                }
                else if (usesDistortion && effectState.type == EffectType.distortion) {
                    effectsSource += `

                    effectState.distortion = distortion[effectIndex];
                    effectState.distortionDrive = distortionDrive[effectIndex];

                    if (!Number.isFinite(distortionFractionalInputL1[effectIndex]) || Math.abs(distortionFractionalInputL1[effectIndex]) < epsilon) distortionFractionalInputL1[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionFractionalInputL2[effectIndex]) || Math.abs(distortionFractionalInputL2[effectIndex]) < epsilon) distortionFractionalInputL2[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionFractionalInputL3[effectIndex]) || Math.abs(distortionFractionalInputL3[effectIndex]) < epsilon) distortionFractionalInputL3[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionFractionalInputR1[effectIndex]) || Math.abs(distortionFractionalInputR1[effectIndex]) < epsilon) distortionFractionalInputR1[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionFractionalInputR2[effectIndex]) || Math.abs(distortionFractionalInputR2[effectIndex]) < epsilon) distortionFractionalInputR2[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionFractionalInputR3[effectIndex]) || Math.abs(distortionFractionalInputR3[effectIndex]) < epsilon) distortionFractionalInputR3[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionPrevInputL[effectIndex]) || Math.abs(distortionPrevInputL[effectIndex]) < epsilon) distortionPrevInputL[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionPrevInputR[effectIndex]) || Math.abs(distortionPrevInputR[effectIndex]) < epsilon) distortionPrevInputR[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionNextOutputL[effectIndex]) || Math.abs(distortionNextOutputL[effectIndex]) < epsilon) distortionNextOutputL[effectIndex] = 0.0;
                    if (!Number.isFinite(distortionNextOutputR[effectIndex]) || Math.abs(distortionNextOutputR[effectIndex]) < epsilon) distortionNextOutputR[effectIndex] = 0.0;

                    effectState.distortionFractionalInputL1 = distortionFractionalInputL1[effectIndex];
                    effectState.distortionFractionalInputL2 = distortionFractionalInputL2[effectIndex];
                    effectState.distortionFractionalInputL3 = distortionFractionalInputL3[effectIndex];
                    effectState.distortionFractionalInputR1 = distortionFractionalInputR1[effectIndex];
                    effectState.distortionFractionalInputR2 = distortionFractionalInputR2[effectIndex];
                    effectState.distortionFractionalInputR3 = distortionFractionalInputR3[effectIndex];
                    effectState.distortionPrevInputL = distortionPrevInputL[effectIndex];
                    effectState.distortionPrevInputR = distortionPrevInputR[effectIndex];
                    effectState.distortionNextOutputL = distortionNextOutputL[effectIndex];
                    effectState.distortionNextOutputR = distortionNextOutputR[effectIndex];`
                }
                else if (usesClipping && effectState.type == EffectType.clipping) {
                    effectsSource += `

                    effectState.clippingInGain = clippingInGain[effectIndex];
                    effectState.clippingThreshold = clippingThreshold[effectIndex];`
                }
                else if (usesBitcrusher && effectState.type == EffectType.bitcrusher) {
                    effectsSource += `

                    if (Math.abs(bitcrusherPrevInputL[effectIndex]) < epsilon) bitcrusherPrevInputL[effectIndex] = 0.0;
                    if (Math.abs(bitcrusherPrevInputR[effectIndex]) < epsilon) bitcrusherPrevInputR[effectIndex] = 0.0;
                    if (Math.abs(bitcrusherCurrentOutputL[effectIndex]) < epsilon) bitcrusherCurrentOutputL[effectIndex] = 0.0;
                    if (Math.abs(bitcrusherCurrentOutputR[effectIndex]) < epsilon) bitcrusherCurrentOutputR[effectIndex] = 0.0;
                    effectState.bitcrusherPrevInputL = bitcrusherPrevInputL[effectIndex];
                    effectState.bitcrusherPrevInputR = bitcrusherPrevInputR[effectIndex];
                    effectState.bitcrusherCurrentOutputL = bitcrusherCurrentOutputL[effectIndex];
                    effectState.bitcrusherCurrentOutputR = bitcrusherCurrentOutputR[effectIndex];
                    effectState.bitcrusherPhase = bitcrusherPhase[effectIndex];
                    effectState.bitcrusherPhaseDelta = bitcrusherPhaseDelta[effectIndex];
                    effectState.bitcrusherScale = bitcrusherScale[effectIndex];
                    effectState.bitcrusherFoldLevel = bitcrusherFoldLevel[effectIndex];`

                }
                else if (usesRingModulation && effectState.type == EffectType.ringModulation) {
                    effectsSource += `
                    effectState.ringModMix = ringModMix[effectIndex];
                    effectState.ringModMixDelta = ringModMixDelta[effectIndex];
                    effectState.ringModPhase = ringModPhase[effectIndex];
                    effectState.ringModPhaseDelta = ringModPhaseDelta[effectIndex];
                    effectState.ringModPhaseDeltaScale = ringModPhaseDeltaScale[effectIndex];
                    effectState.ringModWaveformIndex = ringModWaveformIndex[effectIndex];
                    effectState.ringModPulseWidth = ringModPulseWidth[effectIndex];
                    effectState.ringModMixFade = ringModMixFade[effectIndex];
                    `
                }
                else if (usesEqFilter && effectState.type == EffectType.eqFilter) {
                    effectsSource += `

                        synth.sanitizeFilters(filtersL[effectIndex]);
                        synth.sanitizeFilters(filtersR[effectIndex]);
                    // The filter input here is downstream from another filter so we
                    // better make sure it's safe too.
                    if (!(initialFilterInputL1[effectIndex] < 100) || !(initialFilterInputL2[effectIndex] < 100) || !(initialFilterInputR1[effectIndex] < 100) || !(initialFilterInputR2[effectIndex] < 100)) {
                        initialFilterInputL1[effectIndex] = 0.0;
                        initialFilterInputR2[effectIndex] = 0.0;
                        initialFilterInputL1[effectIndex] = 0.0;
                        initialFilterInputR2[effectIndex] = 0.0;
                    }
                    if (Math.abs(initialFilterInputL1[effectIndex]) < epsilon) initialFilterInputL1[effectIndex] = 0.0;
                    if (Math.abs(initialFilterInputL2[effectIndex]) < epsilon) initialFilterInputL2[effectIndex] = 0.0;
                    if (Math.abs(initialFilterInputR1[effectIndex]) < epsilon) initialFilterInputR1[effectIndex] = 0.0;
                    if (Math.abs(initialFilterInputR2[effectIndex]) < epsilon) initialFilterInputR2[effectIndex] = 0.0;
                    effectState.initialEqFilterInputL1 = initialFilterInputL1[effectIndex];
                    effectState.initialEqFilterInputL2 = initialFilterInputL2[effectIndex];
                    effectState.initialEqFilterInputR1 = initialFilterInputR1[effectIndex];
                    effectState.initialEqFilterInputR2 = initialFilterInputR2[effectIndex];

                    instrumentState.eqFilterVolume = eqFilterVolume[effectIndex];`
                }
                else if (usesGain && effectState.type == EffectType.gain) {
                    effectsSource += `
                    effectState.gain = gain[effectIndex];
                    `
                }
                else if (usesPanning && effectState.type == EffectType.panning) {
                    effectsSource += `

                    Synth.sanitizeDelayLine(panningDelayLineL[effectIndex], panningDelayPos[effectIndex], panningMask);
                    Synth.sanitizeDelayLine(panningDelayLineR[effectIndex], panningDelayPos[effectIndex], panningMask);
                    effectState.panningDelayPos = panningDelayPos[effectIndex];
                    effectState.panningVolumeL = panningVolumeL[effectIndex];
                    effectState.panningVolumeR = panningVolumeR[effectIndex];
                    effectState.panningOffsetL = panningOffsetL[effectIndex];
                    effectState.panningOffsetR = panningOffsetR[effectIndex];`
                }
                else if (usesFlanger && effectState.type == EffectType.flanger) {
                    effectsSource += `

                    Synth.sanitizeDelayLine(flangerDelayLineL[effectIndex], flangerDelayPos[effectIndex], flangerMask);
                    Synth.sanitizeDelayLine(flangerDelayLineR[effectIndex], flangerDelayPos[effectIndex], flangerMask);
                    effectState.flangerPhase = flangerPhase[effectIndex];
                    effectState.flangerDelayPos = flangerDelayPos[effectIndex];
                    effectState.flanger = flanger[effectIndex];
                    effectState.flangerSpeed = flangerSpeed[effectIndex];
                    effectState.flangerDepth = flangerDepth[effectIndex];
                    effectState.flangerFeedback = flangerFeedback[effectIndex];`
                }
                else if (usesChorus && effectState.type == EffectType.chorus) {
                    effectsSource += `

                    Synth.sanitizeDelayLine(chorusDelayLineL[effectIndex], chorusDelayPos[effectIndex], chorusMask);
                    Synth.sanitizeDelayLine(chorusDelayLineR[effectIndex], chorusDelayPos[effectIndex], chorusMask);
                    effectState.chorusPhase = chorusPhase[effectIndex];
                    effectState.chorusDelayPos = chorusDelayPos[effectIndex];
                    effectState.chorusVoiceMult = chorusVoiceMult[effectIndex];
                    effectState.chorusCombinedMult = chorusCombinedMult[effectIndex];`
                }
                else if (usesEcho && effectState.type == EffectType.echo) {
                    effectsSource += `

                    Synth.sanitizeDelayLine(echoDelayLineL[effectIndex], echoDelayPosL[effectIndex], echoMask[effectIndex]);
                    Synth.sanitizeDelayLine(echoDelayLineR[effectIndex], echoDelayPosR[effectIndex], echoMask[effectIndex]);
                    effectState.echoDelayPosL = echoDelayPosL[effectIndex];
                    effectState.echoDelayPosR = echoDelayPosR[effectIndex];
                    effectState.echoMult = echoMult[effectIndex];
                    effectState.echoDelayOffsetRatio = echoDelayOffsetRatio[effectIndex];

                    if (!Number.isFinite(echoShelfSampleL[effectIndex]) || Math.abs(echoShelfSampleL[effectIndex]) < epsilon) echoShelfSampleL[effectIndex] = 0.0;
                    if (!Number.isFinite(echoShelfSampleR[effectIndex]) || Math.abs(echoShelfSampleR[effectIndex]) < epsilon) echoShelfSampleR[effectIndex] = 0.0;
                    if (!Number.isFinite(echoShelfPrevInputL[effectIndex]) || Math.abs(echoShelfPrevInputL[effectIndex]) < epsilon) echoShelfPrevInputL[effectIndex] = 0.0;
                    if (!Number.isFinite(echoShelfPrevInputR[effectIndex]) || Math.abs(echoShelfPrevInputR[effectIndex]) < epsilon) echoShelfPrevInputR[effectIndex] = 0.0;
                    effectState.echoShelfSampleL = echoShelfSampleL[effectIndex];
                    effectState.echoShelfSampleR = echoShelfSampleR[effectIndex];
                    effectState.echoShelfPrevInputL = echoShelfPrevInputL[effectIndex];
                    effectState.echoShelfPrevInputR = echoShelfPrevInputR[effectIndex];`
                }
                else if (usesReverb && effectState.type == EffectType.reverb) {
                    effectsSource += `

                    Synth.sanitizeDelayLine(reverbDelayLine[effectIndex], reverbDelayPos[effectIndex]        , reverbMask);
                    Synth.sanitizeDelayLine(reverbDelayLine[effectIndex], reverbDelayPos[effectIndex] +  3041, reverbMask);
                    Synth.sanitizeDelayLine(reverbDelayLine[effectIndex], reverbDelayPos[effectIndex] +  6426, reverbMask);
                    Synth.sanitizeDelayLine(reverbDelayLine[effectIndex], reverbDelayPos[effectIndex] + 10907, reverbMask);
                    effectState.reverbDelayPos = reverbDelayPos[effectIndex];
                    effectState.reverbMult = reverb[effectIndex];

                    if (!Number.isFinite(reverbShelfSample0[effectIndex]) || Math.abs(reverbShelfSample0[effectIndex]) < epsilon) reverbShelfSample0[effectIndex] = 0.0;
                    if (!Number.isFinite(reverbShelfSample1[effectIndex]) || Math.abs(reverbShelfSample1[effectIndex]) < epsilon) reverbShelfSample1[effectIndex] = 0.0;
                    if (!Number.isFinite(reverbShelfSample2[effectIndex]) || Math.abs(reverbShelfSample2[effectIndex]) < epsilon) reverbShelfSample2[effectIndex] = 0.0;
                    if (!Number.isFinite(reverbShelfSample3[effectIndex]) || Math.abs(reverbShelfSample3[effectIndex]) < epsilon) reverbShelfSample3[effectIndex] = 0.0;
                    if (!Number.isFinite(reverbShelfPrevInput0[effectIndex]) || Math.abs(reverbShelfPrevInput0[effectIndex]) < epsilon) reverbShelfPrevInput0[effectIndex] = 0.0;
                    if (!Number.isFinite(reverbShelfPrevInput1[effectIndex]) || Math.abs(reverbShelfPrevInput1[effectIndex]) < epsilon) reverbShelfPrevInput1[effectIndex] = 0.0;
                    if (!Number.isFinite(reverbShelfPrevInput2[effectIndex]) || Math.abs(reverbShelfPrevInput2[effectIndex]) < epsilon) reverbShelfPrevInput2[effectIndex] = 0.0;
                    if (!Number.isFinite(reverbShelfPrevInput3[effectIndex]) || Math.abs(reverbShelfPrevInput3[effectIndex]) < epsilon) reverbShelfPrevInput3[effectIndex] = 0.0;
                    effectState.reverbShelfSample0 = reverbShelfSample0[effectIndex];
                    effectState.reverbShelfSample1 = reverbShelfSample1[effectIndex];
                    effectState.reverbShelfSample2 = reverbShelfSample2[effectIndex];
                    effectState.reverbShelfSample3 = reverbShelfSample3[effectIndex];
                    effectState.reverbShelfPrevInput0 = reverbShelfPrevInput0[effectIndex];
                    effectState.reverbShelfPrevInput1 = reverbShelfPrevInput1[effectIndex];
                    effectState.reverbShelfPrevInput2 = reverbShelfPrevInput2[effectIndex];
                    effectState.reverbShelfPrevInput3 = reverbShelfPrevInput3[effectIndex];`
                }
            }

            effectsSource += "}";

            console.log(effectsSource);
            effectsFunction = new Function("Config", "Synth", effectsSource)(Config, Synth);
            Synth.effectsFunctionCache[signature] = effectsFunction;
        }

        effectsFunction(synth, outputDataL, outputDataR, bufferIndex, runLength, instrumentState);
    }

    private static pulseWidthSynth(synth: Synth, bufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrumentState: InstrumentState): void {
        const data: Float32Array = synth.tempInstrumentSampleBufferL!;

        const unisonSign: number = tone.specialIntervalExpressionMult * instrumentState.unisonSign;
        if (instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval) tone.phases[1] = tone.phases[0];
        let phaseDeltaA: number = tone.phaseDeltas[0];
        let phaseDeltaB: number = tone.phaseDeltas[1];
        const phaseDeltaScaleA: number = +tone.phaseDeltaScales[0];
        const phaseDeltaScaleB: number = +tone.phaseDeltaScales[1];
        let expression: number = +tone.expression;
        const expressionDelta: number = +tone.expressionDelta;
        let phaseA: number = (tone.phases[0] % 1);
        let phaseB: number = (tone.phases[1] % 1);

        let pulseWidth: number = tone.pulseWidth;
        const pulseWidthDelta: number = tone.pulseWidthDelta;

        const filters: DynamicBiquadFilter[] = tone.noteFiltersL;
        const filterCount: number = tone.noteFilterCount | 0;
        let initialFilterInput1: number = +tone.initialNoteFilterInputL1;
        let initialFilterInput2: number = +tone.initialNoteFilterInputL2;
        const applyFilters: Function = Synth.applyFilters;

        const stopIndex: number = bufferIndex + roundedSamplesPerTick;
        for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {

            const sawPhaseA: number = phaseA % 1;
            const sawPhaseB: number = (phaseA + pulseWidth) % 1;
            const sawPhaseC: number = phaseB % 1;
            const sawPhaseD: number = (phaseB + pulseWidth) % 1;

            let pulseWaveA: number = sawPhaseB - sawPhaseA;
            let pulseWaveB: number = sawPhaseD - sawPhaseC;

            // This is a PolyBLEP, which smooths out discontinuities at any frequency to reduce aliasing.
            if (!instrumentState.aliases) {
                if (sawPhaseA < phaseDeltaA) {
                    var t = sawPhaseA / phaseDeltaA;
                    pulseWaveA += (t + t - t * t - 1) * 0.5;
                } else if (sawPhaseA > 1.0 - phaseDeltaA) {
                    var t = (sawPhaseA - 1.0) / phaseDeltaA;
                    pulseWaveA += (t + t + t * t + 1) * 0.5;
                }
                if (sawPhaseB < phaseDeltaA) {
                    var t = sawPhaseB / phaseDeltaA;
                    pulseWaveA -= (t + t - t * t - 1) * 0.5;
                } else if (sawPhaseB > 1.0 - phaseDeltaA) {
                    var t = (sawPhaseB - 1.0) / phaseDeltaA;
                    pulseWaveA -= (t + t + t * t + 1) * 0.5;
                }

                if (sawPhaseC < phaseDeltaB) {
                    var t = sawPhaseC / phaseDeltaB;
                    pulseWaveB += (t + t - t * t - 1) * 0.5;
                } else if (sawPhaseC > 1.0 - phaseDeltaB) {
                    var t = (sawPhaseC - 1.0) / phaseDeltaB;
                    pulseWaveB += (t + t + t * t + 1) * 0.5;
                }
                if (sawPhaseD < phaseDeltaB) {
                    var t = sawPhaseD / phaseDeltaB;
                    pulseWaveB -= (t + t - t * t - 1) * 0.5;
                } else if (sawPhaseD > 1.0 - phaseDeltaB) {
                    var t = (sawPhaseD - 1.0) / phaseDeltaB;
                    pulseWaveB -= (t + t + t * t + 1) * 0.5;
                }
            }

            const inputSample: number = pulseWaveA + pulseWaveB * unisonSign;
            const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
            initialFilterInput2 = initialFilterInput1;
            initialFilterInput1 = inputSample;

            phaseA += phaseDeltaA;
            phaseB += phaseDeltaB;
            phaseDeltaA *= phaseDeltaScaleA;
            phaseDeltaB *= phaseDeltaScaleB;
            pulseWidth += pulseWidthDelta;

            const output: number = sample * expression;
            expression += expressionDelta;

            data[sampleIndex] += output;
        }

        tone.phases[0] = phaseA;
        tone.phases[1] = phaseB;
        tone.phaseDeltas[0] = phaseDeltaA;
        tone.phaseDeltas[1] = phaseDeltaB;
        tone.expression = expression;
        tone.pulseWidth = pulseWidth;

        synth.sanitizeFilters(filters);
        tone.initialNoteFilterInputL1 = initialFilterInput1;
        tone.initialNoteFilterInputL2 = initialFilterInput2;
    }

    private static supersawSynth(synth: Synth, bufferIndex: number, runLength: number, tone: Tone, instrumentState: InstrumentState): void {
		const data: Float32Array = synth.tempInstrumentSampleBufferL!;
		const voiceCount: number = Config.supersawVoiceCount|0;

		let phaseDelta: number = tone.phaseDeltas[0];
		const phaseDeltaScale: number = +tone.phaseDeltaScales[0];
		let expression: number = +tone.expression;
		const expressionDelta: number = +tone.expressionDelta;
		let phases: number[] = tone.phases;

		let dynamism: number = +tone.supersawDynamism;
		const dynamismDelta: number = +tone.supersawDynamismDelta;
		const unisonDetunes: number[] = tone.supersawUnisonDetunes;
		let shape: number = +tone.supersawShape;
		const shapeDelta: number = +tone.supersawShapeDelta;
		let delayLength: number = +tone.supersawDelayLength;
		const delayLengthDelta: number = +tone.supersawDelayLengthDelta;
		const delayLine: Float32Array = tone.supersawDelayLine!;
		const delayBufferMask: number = (delayLine.length - 1) >> 0;
		let delayIndex: number = tone.supersawDelayIndex|0;
		delayIndex = (delayIndex & delayBufferMask) + delayLine.length;

		const filters: DynamicBiquadFilter[] = tone.noteFiltersL;
		const filterCount: number = tone.noteFilterCount|0;
		let initialFilterInput1: number = +tone.initialNoteFilterInputL1;
		let initialFilterInput2: number = +tone.initialNoteFilterInputL2;
		const applyFilters: Function = Synth.applyFilters;

		const stopIndex: number = bufferIndex + runLength;
		for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
			// The phase initially starts at a zero crossing so apply
			// the delta before first sample to get a nonzero value.
			let phase: number = (phases[0] + phaseDelta) % 1.0;
			let supersawSample: number = phase - 0.5 * (1.0 + (voiceCount - 1.0) * dynamism);

			// This is a PolyBLEP, which smooths out discontinuities at any frequency to reduce aliasing. 
            if (!instrumentState.aliases) {
                if (phase < phaseDelta) {
                    var t: number = phase / phaseDelta;
                    supersawSample -= (t + t - t * t - 1) * 0.5;
                } else if (phase > 1.0 - phaseDelta) {
                    var t: number = (phase - 1.0) / phaseDelta;
                    supersawSample -= (t + t + t * t + 1) * 0.5;
                }
            }

            phases[0] = phase;

            for (let i: number = 1; i < voiceCount; i++) {
                const detunedPhaseDelta: number = phaseDelta * unisonDetunes[i];
                // The phase initially starts at a zero crossing so apply
                // the delta before first sample to get a nonzero value.
                let phase: number = (phases[i] + detunedPhaseDelta) % 1.0;
                supersawSample += phase * dynamism;

                // This is a PolyBLEP, which smooths out discontinuities at any frequency to reduce aliasing. 
                if (!instrumentState.aliases) {
                    if (phase < detunedPhaseDelta) {
                        const t: number = phase / detunedPhaseDelta;
                        supersawSample -= (t + t - t * t - 1) * 0.5 * dynamism;
                    } else if (phase > 1.0 - detunedPhaseDelta) {
                        const t: number = (phase - 1.0) / detunedPhaseDelta;
                        supersawSample -= (t + t + t * t + 1) * 0.5 * dynamism;
                    }
                }

                phases[i] = phase;
            }

            delayLine[delayIndex & delayBufferMask] = supersawSample;
            const delaySampleTime: number = delayIndex - delayLength;
            const lowerIndex: number = delaySampleTime | 0;
            const upperIndex: number = lowerIndex + 1;
            const delayRatio: number = delaySampleTime - lowerIndex;
            const prevDelaySample: number = delayLine[lowerIndex & delayBufferMask];
            const nextDelaySample: number = delayLine[upperIndex & delayBufferMask];
            const delaySample: number = prevDelaySample + (nextDelaySample - prevDelaySample) * delayRatio;
            delayIndex++;

            const inputSample: number = supersawSample - delaySample * shape;
            const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
            initialFilterInput2 = initialFilterInput1;
            initialFilterInput1 = inputSample;

            phaseDelta *= phaseDeltaScale;
            dynamism += dynamismDelta;
            shape += shapeDelta;
            delayLength += delayLengthDelta;

            const output: number = sample * expression;
            expression += expressionDelta;

            data[sampleIndex] += output;
        }

        tone.phaseDeltas[0] = phaseDelta;
        tone.expression = expression;
        tone.supersawDynamism = dynamism;
        tone.supersawShape = shape;
        tone.supersawDelayLength = delayLength;
        tone.supersawDelayIndex = delayIndex;

		synth.sanitizeFilters(filters);
		tone.initialNoteFilterInputL1 = initialFilterInput1;
		tone.initialNoteFilterInputL2 = initialFilterInput2;
	}

    private static fmSourceTemplate: string[] = (`
		const data = synth.tempInstrumentSampleBufferL;
		const sineWave = Config.sineWave;
			
		// I'm adding 1000 to the phase to ensure that it's never negative even when modulated by other waves because negative numbers don't work with the modulus operator very well.
		let operator#Phase       = +((tone.phases[#] % 1) + 1000) * ` + Config.sineWaveLength + `;
		let operator#PhaseDelta  = +tone.phaseDeltas[#] * ` + Config.sineWaveLength + `;
		let operator#PhaseDeltaScale = +tone.phaseDeltaScales[#];
		let operator#OutputMult  = +tone.operatorExpressions[#];
		const operator#OutputDelta = +tone.operatorExpressionDeltas[#];
		let operator#Output      = +tone.feedbackOutputs[#];
        const operator#Wave      = tone.operatorWaves[#].samples;
		let feedbackMult         = +tone.feedbackMult;
		const feedbackDelta        = +tone.feedbackDelta;
        let expression = +tone.expression;
		const expressionDelta = +tone.expressionDelta;
		
		const filters = tone.noteFiltersL;
		const filterCount = tone.noteFilterCount|0;
		let initialFilterInput1 = +tone.initialNoteFilterInputL1;
		let initialFilterInput2 = +tone.initialNoteFilterInputL2;
		const applyFilters = Synth.applyFilters;
		
		const stopIndex = bufferIndex + roundedSamplesPerTick;
		for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
				// INSERT OPERATOR COMPUTATION HERE
				const fmOutput = (/*operator#Scaled*/); // CARRIER OUTPUTS
				
			const inputSample = fmOutput;
			const sample = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
			initialFilterInput2 = initialFilterInput1;
			initialFilterInput1 = inputSample;
				
				feedbackMult += feedbackDelta;
				operator#OutputMult += operator#OutputDelta;
				operator#Phase += operator#PhaseDelta;
			operator#PhaseDelta *= operator#PhaseDeltaScale;
			
			const output = sample * expression;
			expression += expressionDelta;

			data[sampleIndex] += output;
			}
			
			tone.phases[#] = operator#Phase / ` + Config.sineWaveLength + `;
			tone.phaseDeltas[#] = operator#PhaseDelta / ` + Config.sineWaveLength + `;
			tone.operatorExpressions[#] = operator#OutputMult;
		    tone.feedbackOutputs[#] = operator#Output;
		    tone.feedbackMult = feedbackMult;
		    tone.expression = expression;
			
		synth.sanitizeFilters(filters);
		tone.initialNoteFilterInputL1 = initialFilterInput1;
		tone.initialNoteFilterInputL2 = initialFilterInput2;
		`).split("\n");

	private static operatorSourceTemplate: string[] = (`
		const operator#PhaseMix = operator#Phase/* + operator@Scaled*/;
		const operator#PhaseInt = operator#PhaseMix|0;
		const operator#Index    = operator#PhaseInt & ` + Config.sineWaveMask + `;
		const operator#Sample   = operator#Wave[operator#Index];
		operator#Output         = operator#Sample + (operator#Wave[operator#Index + 1] - operator#Sample) * (operator#PhaseMix - operator#PhaseInt);
		const operator#Scaled   = operator#OutputMult * operator#Output;
		`).split("\n");

	private static noiseSynth(synth: Synth, bufferIndex: number, runLength: number, tone: Tone, instrumentState: InstrumentState): void {
		const data: Float32Array = synth.tempInstrumentSampleBufferL!;
		const wave: Float32Array = instrumentState.waveL!;

		const unisonSign: number = tone.specialIntervalExpressionMult * instrumentState.unisonSign;
		if (instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval) tone.phases[1] = tone.phases[0];
		let phaseDeltaA: number = tone.phaseDeltas[0];
		let phaseDeltaB: number = tone.phaseDeltas[1];
		const phaseDeltaScaleA: number = +tone.phaseDeltaScales[0];
		const phaseDeltaScaleB: number = +tone.phaseDeltaScales[1];
		let expression: number = +tone.expression;
		const expressionDelta: number = +tone.expressionDelta;
		let phaseA: number = (tone.phases[0] % 1) * Config.chipNoiseLength;
		let phaseB: number = (tone.phases[1] % 1) * Config.chipNoiseLength;
		if (tone.phases[0] == 0.0) {
			// Zero phase means the tone was reset, just give noise a random start phase instead.
			phaseA = Math.random() * Config.chipNoiseLength;
			if (instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval) phaseB = phaseA;
		}
		if (tone.phases[1] == 0.0 && !(instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval)) {
			// Zero phase means the tone was reset, just give noise a random start phase instead.
			phaseB = Math.random() * Config.chipNoiseLength;
		}
		const phaseMask: number = Config.chipNoiseLength - 1;
		let noiseSampleA: number = +tone.noiseSampleA;
		let noiseSampleB: number = +tone.noiseSampleB;

		const filters: DynamicBiquadFilter[] = tone.noteFiltersL;
		const filterCount: number = tone.noteFilterCount | 0;
		let initialFilterInput1: number = +tone.initialNoteFilterInputL1;
		let initialFilterInput2: number = +tone.initialNoteFilterInputL2;
		const applyFilters: Function = Synth.applyFilters;

		// This is for a "legacy" style simplified 1st order lowpass filter with
		// a cutoff frequency that is relative to the tone's fundamental frequency.
		const pitchRelativefilterA: number = Math.min(1.0, phaseDeltaA * instrumentState.noisePitchFilterMult);
		const pitchRelativefilterB: number = Math.min(1.0, phaseDeltaB * instrumentState.noisePitchFilterMult);

		const stopIndex: number = bufferIndex + runLength;
		for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
			const waveSampleA: number = wave[phaseA & phaseMask];
			const waveSampleB: number = wave[phaseB & phaseMask];

			noiseSampleA += (waveSampleA - noiseSampleA) * pitchRelativefilterA;
			noiseSampleB += (waveSampleB - noiseSampleB) * pitchRelativefilterB;

			const inputSample: number = noiseSampleA + noiseSampleB * unisonSign;
			const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
			initialFilterInput2 = initialFilterInput1;
			initialFilterInput1 = inputSample;

			phaseA += phaseDeltaA;
			phaseB += phaseDeltaB;
			phaseDeltaA *= phaseDeltaScaleA;
			phaseDeltaB *= phaseDeltaScaleB;

			const output: number = sample * expression;
			expression += expressionDelta;

			data[sampleIndex] += output;
		}

		tone.phases[0] = phaseA / Config.chipNoiseLength;
		tone.phases[1] = phaseB / Config.chipNoiseLength;
		tone.phaseDeltas[0] = phaseDeltaA;
		tone.phaseDeltas[1] = phaseDeltaB;
		tone.expression = expression;
		tone.noiseSampleA = noiseSampleA;
		tone.noiseSampleB = noiseSampleB;

		synth.sanitizeFilters(filters);
		tone.initialNoteFilterInputL1 = initialFilterInput1;
		tone.initialNoteFilterInputL2 = initialFilterInput2;
	}

	private static spectrumSynth(synth: Synth, bufferIndex: number, runLength: number, tone: Tone, instrumentState: InstrumentState): void {
		const data: Float32Array = synth.tempInstrumentSampleBufferL!;
		const wave: Float32Array = instrumentState.waveL!;
		const samplesInPeriod: number = (1 << 7);

		const unisonSign: number = tone.specialIntervalExpressionMult * instrumentState.unisonSign;
		if (instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval) tone.phases[1] = tone.phases[0];
		let phaseDeltaA: number = tone.phaseDeltas[0] * samplesInPeriod;
		let phaseDeltaB: number = tone.phaseDeltas[1] * samplesInPeriod;
		const phaseDeltaScaleA: number = +tone.phaseDeltaScales[0];
		const phaseDeltaScaleB: number = +tone.phaseDeltaScales[1];
		let expression: number = +tone.expression;
		const expressionDelta: number = +tone.expressionDelta;
		let noiseSampleA: number = +tone.noiseSampleA;
		let noiseSampleB: number = +tone.noiseSampleB;

		const filters: DynamicBiquadFilter[] = tone.noteFiltersL;
		const filterCount: number = tone.noteFilterCount | 0;
		let initialFilterInput1: number = +tone.initialNoteFilterInputL1;
		let initialFilterInput2: number = +tone.initialNoteFilterInputL2;
		const applyFilters: Function = Synth.applyFilters;

		let phaseA: number = (tone.phases[0] % 1) * Config.spectrumNoiseLength;
		let phaseB: number = (tone.phases[1] % 1) * Config.spectrumNoiseLength;
		if (tone.phases[0] == 0.0) {
			// Zero phase means the tone was reset, just give noise a random start phase instead.
			phaseA = Synth.findRandomZeroCrossing(wave, Config.spectrumNoiseLength) + phaseDeltaA;
			if (instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval) phaseB = phaseA;
		}
		if (tone.phases[1] == 0.0 && !(instrumentState.unisonVoices == 1 && instrumentState.unisonSpread == 0 && !instrumentState.chord!.customInterval)) {
			// Zero phase means the tone was reset, just give noise a random start phase instead.
			phaseB = Synth.findRandomZeroCrossing(wave, Config.spectrumNoiseLength) + phaseDeltaB;
		}
		const phaseMask: number = Config.spectrumNoiseLength - 1;

		// This is for a "legacy" style simplified 1st order lowpass filter with
		// a cutoff frequency that is relative to the tone's fundamental frequency.
		const pitchRelativefilterA: number = Math.min(1.0, phaseDeltaA);
		const pitchRelativefilterB: number = Math.min(1.0, phaseDeltaB);

		const stopIndex: number = bufferIndex + runLength;
		for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
			const phaseAInt: number = phaseA | 0;
			const phaseBInt: number = phaseB | 0;
			const indexA: number = phaseAInt & phaseMask;
			const indexB: number = phaseBInt & phaseMask;
			let waveSampleA: number = wave[indexA];
			let waveSampleB: number = wave[indexB];
			const phaseRatioA: number = phaseA - phaseAInt;
			const phaseRatioB: number = phaseB - phaseBInt;
			waveSampleA += (wave[indexA + 1] - waveSampleA) * phaseRatioA;
			waveSampleB += (wave[indexB + 1] - waveSampleB) * phaseRatioB;

			noiseSampleA += (waveSampleA - noiseSampleA) * pitchRelativefilterA;
			noiseSampleB += (waveSampleB - noiseSampleB) * pitchRelativefilterB;


			const inputSample: number = noiseSampleA + noiseSampleB * unisonSign;
			const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
			initialFilterInput2 = initialFilterInput1;
			initialFilterInput1 = inputSample;

			phaseA += phaseDeltaA;
			phaseB += phaseDeltaB;
			phaseDeltaA *= phaseDeltaScaleA;
			phaseDeltaB *= phaseDeltaScaleB;

			const output: number = sample * expression;
			expression += expressionDelta;

			data[sampleIndex] += output;
		}

		tone.phases[0] = phaseA / Config.spectrumNoiseLength;
		tone.phases[1] = phaseB / Config.spectrumNoiseLength;
		tone.phaseDeltas[0] = phaseDeltaA / samplesInPeriod;
		tone.phaseDeltas[1] = phaseDeltaB / samplesInPeriod;
		tone.expression = expression;
		tone.noiseSampleA = noiseSampleA;
		tone.noiseSampleB = noiseSampleB;

		synth.sanitizeFilters(filters);
		tone.initialNoteFilterInputL1 = initialFilterInput1;
		tone.initialNoteFilterInputL2 = initialFilterInput2;
	}

	private static drumsetSynth(synth: Synth, bufferIndex: number, runLength: number, tone: Tone, instrumentState: InstrumentState): void {
		const data: Float32Array = synth.tempInstrumentSampleBufferL!;
		let wave: Float32Array = instrumentState.getDrumsetWave(tone.drumsetPitch!);
		const referenceDelta: number = InstrumentState.drumsetIndexReferenceDelta(tone.drumsetPitch!);
		let phaseDelta: number = tone.phaseDeltas[0] / referenceDelta;
		const phaseDeltaScale: number = +tone.phaseDeltaScales[0];
		let expression: number = +tone.expression;
		const expressionDelta: number = +tone.expressionDelta;

		const filters: DynamicBiquadFilter[] = tone.noteFiltersL;
		const filterCount: number = tone.noteFilterCount | 0;
		let initialFilterInput1: number = +tone.initialNoteFilterInputL1;
		let initialFilterInput2: number = +tone.initialNoteFilterInputL2;
		const applyFilters: Function = Synth.applyFilters;

		let phase: number = (tone.phases[0] % 1) * Config.spectrumNoiseLength;
		// Zero phase means the tone was reset, just give noise a random start phase instead.
		if (tone.phases[0] == 0.0) phase = Synth.findRandomZeroCrossing(wave, Config.spectrumNoiseLength) + phaseDelta;
		const phaseMask: number = Config.spectrumNoiseLength - 1;

		const stopIndex: number = bufferIndex + runLength;
		for (let sampleIndex: number = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
			const phaseInt: number = phase | 0;
			const index: number = phaseInt & phaseMask;
			let noiseSample: number = wave[index];
			const phaseRatio: number = phase - phaseInt;
			noiseSample += (wave[index + 1] - noiseSample) * phaseRatio;

			const inputSample: number = noiseSample;
			const sample: number = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
			initialFilterInput2 = initialFilterInput1;
			initialFilterInput1 = inputSample;

			phase += phaseDelta;
			phaseDelta *= phaseDeltaScale;

			const output: number = sample * expression;
			expression += expressionDelta;

			data[sampleIndex] += output;
		}

		tone.phases[0] = phase / Config.spectrumNoiseLength;
		tone.phaseDeltas[0] = phaseDelta * referenceDelta;
		tone.expression = expression;

		synth.sanitizeFilters(filters);
		tone.initialNoteFilterInputL1 = initialFilterInput1;
		tone.initialNoteFilterInputL2 = initialFilterInput2;
	}

    private static modSynth(synth: Synth, stereoBufferIndex: number, roundedSamplesPerTick: number, tone: Tone, instrument: Instrument): void {
        // Note: present modulator value is tone.expressionStarts[0].

        if (!synth.song) return;

        let mod: number = Config.modCount - 1 - tone.pitches[0];

        // Flagged as invalid because unused by current settings, skip
        if (instrument.invalidModulators[mod]) return;

        let setting: number = instrument.modulators[mod];

        // Generate list of used instruments
        let usedChannels: number[] = [];
        let usedInstruments: number[] = [];
        if (Config.modulators[instrument.modulators[mod]].forSong) {
            // Instrument doesn't matter for song, just push a random index to run the modsynth once
            usedInstruments.push(0);
        } else {
            // All
            if (instrument.modInstruments[mod][0] == synth.song.channels[instrument.modChannels[mod][0]].instruments.length) {
                for (let i: number = 0; i < synth.song.channels[instrument.modChannels[mod][0]].instruments.length; i++) {
                    usedInstruments.push(i);
                    usedChannels.push(0);
                }
            }
            // Active
            else if (instrument.modInstruments[mod][0] > synth.song.channels[instrument.modChannels[mod][0]].instruments.length) {
                if (synth.song.getPattern(instrument.modChannels[mod][0], synth.bar) != null) {
                    usedInstruments = synth.song.getPattern(instrument.modChannels[mod][0], synth.bar)!.instruments;
                    usedChannels.push(0);
                }
            } else {
                for (let i: number = 0; i < instrument.modChannels[mod].length; i++) {
                    usedChannels.push(instrument.modChannels[mod][i]);
                    usedInstruments.push(instrument.modInstruments[mod][i]);
                }
            }
        }

        for (let instrumentIndex: number = 0; instrumentIndex < usedInstruments.length; instrumentIndex++) {

            synth.setModValue(tone.expression, tone.expression + tone.expressionDelta, instrument.modChannels[mod][instrumentIndex], usedInstruments[instrumentIndex], setting);

            // If mods are being held (for smoother playback while recording mods), use those values instead.
            for (let i: number = 0; i < synth.heldMods.length; i++) {
                if (Config.modulators[instrument.modulators[mod]].forSong) {
                    if (synth.heldMods[i].setting == setting)
                        synth.setModValue(synth.heldMods[i].volume, synth.heldMods[i].volume, instrument.modChannels[mod][instrumentIndex], usedInstruments[instrumentIndex], setting);
                } else if (synth.heldMods[i].channelIndex == instrument.modChannels[mod][instrumentIndex] && synth.heldMods[i].instrumentIndex == usedInstruments[instrumentIndex] && synth.heldMods[i].setting == setting) {
                    synth.setModValue(synth.heldMods[i].volume, synth.heldMods[i].volume, instrument.modChannels[mod][instrumentIndex], usedInstruments[instrumentIndex], setting);
                }
            }

            // Reset arps, but only at the start of the note
            if (setting == Config.modulators.dictionary["reset arp"].index && synth.tick == 0 && tone.noteStartPart == synth.beat * Config.partsPerBeat + synth.part) {
                synth.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]].arpTime = 0;
            }
            // Reset envelope, but only at the start of the note
            else if (setting == Config.modulators.dictionary["reset envelope"].index && synth.tick == 0 && tone.noteStartPart == synth.beat * Config.partsPerBeat + synth.part) {
                let envelopeTarget = instrument.modEnvelopeNumbers[mod];
                const tgtInstrumentState: InstrumentState = synth.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];
                const tgtInstrument: Instrument = synth.song.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];

                if (tgtInstrument.envelopeCount > envelopeTarget) {
                    tgtInstrumentState.envelopeTime[envelopeTarget] = 0;
                }
            }
            // Denote next bar skip
            else if (setting == Config.modulators.dictionary["next bar"].index) {
                synth.wantToSkip = true;
            }
            // do song eq filter first
            else if (setting == Config.modulators.dictionary["song eq"].index) {
                const tgtSong = synth.song

                let dotTarget = instrument.modFilterTypes[mod] | 0;

                if (dotTarget == 0) { // Morph. Figure out the target filter's X/Y coords for this point. If no point exists with this index, or point types don't match, do lerp-out for this point and lerp-in of a new point

                    let pinIdx: number = 0;
                    const currentPart: number = synth.getTicksIntoBar() / Config.ticksPerPart;
                    while (tone.note!.start + tone.note!.pins[pinIdx].time <= currentPart) pinIdx++;
                    // 0 to 1 based on distance to next morph
                    //let lerpStartRatio: number = (currentPart - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);
                    let lerpEndRatio: number = ((currentPart - tone.note!.start + (roundedSamplesPerTick / (synth.getSamplesPerTick() * Config.ticksPerPart)) * Config.ticksPerPart) - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);

                    // Compute the new settings to go to.
                    if (tgtSong.eqSubFilters[tone.note!.pins[pinIdx - 1].size] != null || tgtSong.eqSubFilters[tone.note!.pins[pinIdx].size] != null) {
                        tgtSong.tmpEqFilterEnd = FilterSettings.lerpFilters(tgtSong.eqSubFilters[tone.note!.pins[pinIdx - 1].size]!, tgtSong.eqSubFilters[tone.note!.pins[pinIdx].size]!, lerpEndRatio);
                    } else {
                        // No mutation will occur to the filter object so we can safely return it without copying
                        tgtSong.tmpEqFilterEnd = tgtSong.eqFilter;
                    }

                } // Target (1 is dot 1 X, 2 is dot 1 Y, etc.)
                else {
                    // Since we are directly manipulating the filter, make sure it is a new one and not an actual one of the instrument's filters
                    for (let i: number = 0; i < Config.filterMorphCount; i++) {
                        if (tgtSong.tmpEqFilterEnd == tgtSong.eqSubFilters[i] && tgtSong.tmpEqFilterEnd != null) {
                            tgtSong.tmpEqFilterEnd = new FilterSettings();
                            tgtSong.tmpEqFilterEnd.fromJsonObject(tgtSong.eqSubFilters[i]!.toJsonObject());
                        }
                    }
                    if (tgtSong.tmpEqFilterEnd == null) {
                        tgtSong.tmpEqFilterEnd = new FilterSettings();
                        tgtSong.tmpEqFilterEnd.fromJsonObject(tgtSong.eqFilter.toJsonObject());
                    }

                    if (tgtSong.tmpEqFilterEnd.controlPointCount > Math.floor((dotTarget - 1) / 2)) {
                        if (dotTarget % 2) { // X
                            tgtSong.tmpEqFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].freq = tone.expression + tone.expressionDelta;
                        } else { // Y
                            tgtSong.tmpEqFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].gain = tone.expression + tone.expressionDelta;
                        }
                    }
                }
            }
            // Extra info for eq filter target needs to be set as well
            else if (setting == Config.modulators.dictionary["post eq"].index) {
                const tgtInstrument = synth.song.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];
                for (let effectIndex: number = 0; effectIndex < tgtInstrument.effects.length; effectIndex++) {
                    const tgtEffect = tgtInstrument.effects[effectIndex] as Effect;

                    if (!tgtEffect.eqFilterType) {

                        let dotTarget = instrument.modFilterTypes[mod] | 0;

                        if (dotTarget == 0) { // Morph. Figure out the target filter's X/Y coords for this point. If no point exists with this index, or point types don't match, do lerp-out for this point and lerp-in of a new point

                            let pinIdx: number = 0;
                            const currentPart: number = synth.getTicksIntoBar() / Config.ticksPerPart;
                            while (tone.note!.start + tone.note!.pins[pinIdx].time <= currentPart) pinIdx++;
                            // 0 to 1 based on distance to next morph
                            //let lerpStartRatio: number = (currentPart - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);
                            let lerpEndRatio: number = ((currentPart - tone.note!.start + (roundedSamplesPerTick / (synth.getSamplesPerTick() * Config.ticksPerPart)) * Config.ticksPerPart) - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);

                            // Compute the new settings to go to.
                            if (tgtEffect.eqSubFilters[tone.note!.pins[pinIdx - 1].size] != null || tgtEffect.eqSubFilters[tone.note!.pins[pinIdx].size] != null) {
                                tgtEffect.tmpEqFilterEnd = FilterSettings.lerpFilters(tgtEffect.eqSubFilters[tone.note!.pins[pinIdx - 1].size]!, tgtEffect.eqSubFilters[tone.note!.pins[pinIdx].size]!, lerpEndRatio);
                            } else {
                                // No mutation will occur to the filter object so we can safely return it without copying
                                tgtEffect.tmpEqFilterEnd = tgtEffect.eqFilter;
                            }

                        } // Target (1 is dot 1 X, 2 is dot 1 Y, etc.)
                        else {
                            // Since we are directly manipulating the filter, make sure it is a new one and not an actual one of the instrument's filters
                            for (let i: number = 0; i < Config.filterMorphCount; i++) {
                                if (tgtEffect.tmpEqFilterEnd == tgtEffect.eqSubFilters[i] && tgtEffect.tmpEqFilterEnd != null) {
                                    tgtEffect.tmpEqFilterEnd = new FilterSettings();
                                    tgtEffect.tmpEqFilterEnd.fromJsonObject(tgtEffect.eqSubFilters[i]!.toJsonObject());
                                }
                            }
                            if (tgtEffect.tmpEqFilterEnd == null) {
                                tgtEffect.tmpEqFilterEnd = new FilterSettings();
                                tgtEffect.tmpEqFilterEnd.fromJsonObject(tgtEffect.eqFilter.toJsonObject());
                            }

                            if (tgtEffect.tmpEqFilterEnd.controlPointCount > Math.floor((dotTarget - 1) / 2)) {
                                if (dotTarget % 2) { // X
                                    tgtEffect.tmpEqFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].freq = tone.expression + tone.expressionDelta;
                                } else { // Y
                                    tgtEffect.tmpEqFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].gain = tone.expression + tone.expressionDelta;
                                }
                            }
                        }
                    }
                }
            }
            // Extra info for note filter target needs to be set as well
            else if (setting == Config.modulators.dictionary["pre eq"].index) {
                const tgtInstrument = synth.song.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];

                if (!tgtInstrument.noteFilterType) {
                    let dotTarget = instrument.modFilterTypes[mod] | 0;

                    if (dotTarget == 0) { // Morph. Figure out the target filter's X/Y coords for this point. If no point exists with this index, or point types don't match, do lerp-out for this point and lerp-in of a new point

                        let pinIdx: number = 0;
                        const currentPart: number = synth.getTicksIntoBar() / Config.ticksPerPart;
                        while (tone.note!.start + tone.note!.pins[pinIdx].time <= currentPart) pinIdx++;
                        // 0 to 1 based on distance to next morph
                        //let lerpStartRatio: number = (currentPart - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);
                        let lerpEndRatio: number = ((currentPart - tone.note!.start + (roundedSamplesPerTick / (synth.getSamplesPerTick() * Config.ticksPerPart)) * Config.ticksPerPart) - tone.note!.pins[pinIdx - 1].time) / (tone.note!.pins[pinIdx].time - tone.note!.pins[pinIdx - 1].time);

                        // Compute the new settings to go to.
                        if (tgtInstrument.noteSubFilters[tone.note!.pins[pinIdx - 1].size] != null || tgtInstrument.noteSubFilters[tone.note!.pins[pinIdx].size] != null) {
                            tgtInstrument.tmpNoteFilterEnd = FilterSettings.lerpFilters(tgtInstrument.noteSubFilters[tone.note!.pins[pinIdx - 1].size]!, tgtInstrument.noteSubFilters[tone.note!.pins[pinIdx].size]!, lerpEndRatio);
                        } else {
                            // No mutation will occur to the filter object so we can safely return it without copying
                            tgtInstrument.tmpNoteFilterEnd = tgtInstrument.noteFilter;
                        }

                    } // Target (1 is dot 1 X, 2 is dot 1 Y, etc.)
                    else {
                        // Since we are directly manipulating the filter, make sure it is a new one and not an actual one of the instrument's filters

                        for (let i: number = 0; i < Config.filterMorphCount; i++) {
                            if (tgtInstrument.tmpNoteFilterEnd == tgtInstrument.noteSubFilters[i] && tgtInstrument.tmpNoteFilterEnd != null) {
                                tgtInstrument.tmpNoteFilterEnd = new FilterSettings();
                                tgtInstrument.tmpNoteFilterEnd.fromJsonObject(tgtInstrument.noteSubFilters[i]!.toJsonObject());
                            }
                        }
                        if (tgtInstrument.tmpNoteFilterEnd == null) {
                            tgtInstrument.tmpNoteFilterEnd = new FilterSettings();
                            tgtInstrument.tmpNoteFilterEnd.fromJsonObject(tgtInstrument.noteFilter.toJsonObject());
                        }

                        if (tgtInstrument.tmpNoteFilterEnd.controlPointCount > Math.floor((dotTarget - 1) / 2)) {
                            if (dotTarget % 2) { // X
                                tgtInstrument.tmpNoteFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].freq = tone.expression + tone.expressionDelta;
                            } else { // Y
                                tgtInstrument.tmpNoteFilterEnd.controlPoints[Math.floor((dotTarget - 1) / 2)].gain = tone.expression + tone.expressionDelta;
                            }
                        }
                    }
                }
            } else if (setting == Config.modulators.dictionary["individual envelope speed"].index) {
                const tgtInstrument = synth.song.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];
                let envelopeTarget = instrument.modEnvelopeNumbers[mod];

                let speed: number = tone.expression + tone.expressionDelta;
                if (tgtInstrument.envelopeCount > envelopeTarget) {
                    if (Number.isInteger(speed)) {
                        tgtInstrument.envelopes[envelopeTarget].tempEnvelopeSpeed = Config.perEnvelopeSpeedIndices[speed];
                    } else {
                        //linear interpolation
                        speed = (1 - (speed % 1)) * Config.perEnvelopeSpeedIndices[Math.floor(speed)] + (speed % 1) * Config.perEnvelopeSpeedIndices[Math.ceil(speed)];
                        tgtInstrument.envelopes[envelopeTarget].tempEnvelopeSpeed = speed;
                    }
                }
            } else if (setting == Config.modulators.dictionary["individual envelope lower bound"].index) {
                const tgtInstrument = synth.song.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];
                let envelopeTarget = instrument.modEnvelopeNumbers[mod];

                let bound: number = tone.expression + tone.expressionDelta;
                if (tgtInstrument.envelopeCount > envelopeTarget) {
                    tgtInstrument.envelopes[envelopeTarget].tempEnvelopeLowerBound = bound / 10;
                }
            } else if (setting == Config.modulators.dictionary["individual envelope upper bound"].index) {
                const tgtInstrument = synth.song.channels[instrument.modChannels[mod][instrumentIndex]].instruments[usedInstruments[instrumentIndex]];
                let envelopeTarget = instrument.modEnvelopeNumbers[mod];

                let bound: number = tone.expression + tone.expressionDelta;
                if (tgtInstrument.envelopeCount > envelopeTarget) {
                    tgtInstrument.envelopes[envelopeTarget].tempEnvelopeUpperBound = bound / 10;
                }
                console.log(tgtInstrument.envelopes[envelopeTarget]);
            }
        }
    }

    public static findRandomZeroCrossing(wave: Float32Array, waveLength: number): number { //literally only public to let typescript compile
        let phase: number = Math.random() * waveLength;
        const phaseMask: number = waveLength - 1;

        // Spectrum and drumset waves sounds best when they start at a zero crossing,
        // otherwise they pop. Try to find a zero crossing.
        let indexPrev: number = phase & phaseMask;
        let wavePrev: number = wave[indexPrev];
        const stride: number = 16;
        for (let attemptsRemaining: number = 128; attemptsRemaining > 0; attemptsRemaining--) {
            const indexNext: number = (indexPrev + stride) & phaseMask;
            const waveNext: number = wave[indexNext];
            if (wavePrev * waveNext <= 0.0) {
                // Found a zero crossing! Now let's narrow it down to two adjacent sample indices.
                for (let i: number = 0; i < stride; i++) {
                    const innerIndexNext: number = (indexPrev + 1) & phaseMask;
                    const innerWaveNext: number = wave[innerIndexNext];
                    if (wavePrev * innerWaveNext <= 0.0) {
                        // Found the zero crossing again! Now let's find the exact intersection.
                        const slope: number = innerWaveNext - wavePrev;
                        phase = indexPrev;
                        if (Math.abs(slope) > 0.00000001) {
                            phase += -wavePrev / slope;
                        }
                        phase = Math.max(0, phase) % waveLength;
                        break;
                    } else {
                        indexPrev = innerIndexNext;
                        wavePrev = innerWaveNext;
                    }
                }
                break;
            } else {
                indexPrev = indexNext;
                wavePrev = waveNext;
            }
        }

        return phase;
    }

    public static instrumentVolumeToVolumeMult(instrumentVolume: number): number {
        return (instrumentVolume == -Config.volumeRange / 2.0) ? 0.0 : Math.pow(2, Config.volumeLogScale * instrumentVolume);
    }
    public static volumeMultToInstrumentVolume(volumeMult: number): number {
        return (volumeMult <= 0.0) ? -Config.volumeRange / 2 : Math.min(Config.volumeRange, (Math.log(volumeMult) / Math.LN2) / Config.volumeLogScale);
    }
    public static noteSizeToVolumeMult(size: number): number {
        return Math.pow(Math.max(0.0, size) / Config.noteSizeMax, 1.5);
    }
    public static volumeMultToNoteSize(volumeMult: number): number {
        return Math.pow(Math.max(0.0, volumeMult), 1 / 1.5) * Config.noteSizeMax;
    }

    public static getOperatorWave(waveform: number, pulseWidth: number) {
        if (waveform != 2) {
            return Config.operatorWaves[waveform];
        }
        else {
            return Config.pwmOperatorWaves[pulseWidth];
        }
    }

    public getSamplesPerTick(): number {
        if (this.song == null) return 0;
        let beatsPerMinute: number = this.song.getBeatsPerMinute();
        if (this.isModActive(Config.modulators.dictionary["tempo"].index)) {
            beatsPerMinute = this.getModValue(Config.modulators.dictionary["tempo"].index);
        }
        return this.getSamplesPerTickSpecificBPM(beatsPerMinute);
    }

    private getSamplesPerTickSpecificBPM(beatsPerMinute: number): number {
        const beatsPerSecond: number = beatsPerMinute / 60.0;
        const partsPerSecond: number = Config.partsPerBeat * beatsPerSecond;
        const tickPerSecond: number = Config.ticksPerPart * partsPerSecond;
        return this.samplesPerSecond / tickPerSecond;
    }

    private sanitizeFilters(filters: DynamicBiquadFilter[]): void {
        let reset: boolean = false;
        for (const filter of filters) {
            const output1: number = Math.abs(filter.output1);
            const output2: number = Math.abs(filter.output2);
            // If either is a large value, Infinity, or NaN, then just reset all filter history.
            if (!(output1 < 100) || !(output2 < 100)) {
                reset = true;
                break;
            }
            if (output1 < epsilon) filter.output1 = 0.0;
            if (output2 < epsilon) filter.output2 = 0.0;
        }
        if (reset) {
            for (const filter of filters) {
                filter.output1 = 0.0;
                filter.output2 = 0.0;
            }
        }
    }

    public static sanitizeDelayLine(delayLine: Float32Array, lastIndex: number, mask: number): void {
        while (true) {
            lastIndex--;
            const index: number = lastIndex & mask;
            const sample: number = Math.abs(delayLine[index]);
            if (Number.isFinite(sample) && (sample == 0.0 || sample >= epsilon)) break;
            delayLine[index] = 0.0;
        }
    }

    public static applyFilters(sample: number, input1: number, input2: number, filterCount: number, filters: DynamicBiquadFilter[]): number {
        for (let i: number = 0; i < filterCount; i++) {
            const filter: DynamicBiquadFilter = filters[i];
            const output1: number = filter.output1;
            const output2: number = filter.output2;
            const a1: number = filter.a1;
            const a2: number = filter.a2;
            const b0: number = filter.b0;
            const b1: number = filter.b1;
            const b2: number = filter.b2;
            sample = b0 * sample + b1 * input1 + b2 * input2 - a1 * output1 - a2 * output2;
            filter.a1 = a1 + filter.a1Delta;
            filter.a2 = a2 + filter.a2Delta;
            if (filter.useMultiplicativeInputCoefficients) {
                filter.b0 = b0 * filter.b0Delta;
                filter.b1 = b1 * filter.b1Delta;
                filter.b2 = b2 * filter.b2Delta;
            } else {
                filter.b0 = b0 + filter.b0Delta;
                filter.b1 = b1 + filter.b1Delta;
                filter.b2 = b2 + filter.b2Delta;
            }
            filter.output2 = output1;
            filter.output1 = sample;
            // Updating the input values is waste if the next filter doesn't exist...
            input2 = output2;
            input1 = output1;
        }
        return sample;
    }

    public computeTicksSinceStart(ofBar: boolean = false) {
        const beatsPerBar = this.song?.beatsPerBar ? this.song?.beatsPerBar : 8;
        if (ofBar) {
            return Config.ticksPerPart * Config.partsPerBeat * beatsPerBar * this.bar;
        } else {
            return this.tick + Config.ticksPerPart * (this.part + Config.partsPerBeat * (this.beat + beatsPerBar * this.bar));
        }
    }
}

// When compiling synth.ts as a standalone module named "beepbox", expose these classes as members to JavaScript:
export { Dictionary, DictionaryArray, FilterType, EnvelopeType, InstrumentType, Transition, Chord, Envelope, Config };
