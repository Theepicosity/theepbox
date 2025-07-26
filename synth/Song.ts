// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { startLoadingSample, sampleLoadingState, SampleLoadingState, sampleLoadEvents, SampleLoadedEvent, SampleLoadingStatus, loadBuiltInSamples, Dictionary, DictionaryArray, toNameMap, FilterType, SustainType, EnvelopeType, InstrumentType, EffectType, MDEffectType, Envelope, Config, effectsIncludeTransition, effectsIncludeChord, effectsIncludePitchShift, effectsIncludeDetune, effectsIncludeVibrato, LFOEnvelopeTypes, RandomEnvelopeTypes } from "./SynthConfig";
import { Preset, EditorConfig } from "../editor/EditorConfig";
import { Channel } from "./Channel";
import { Instrument, LegacySettings } from "./Instrument";
import { Effect } from "./Effect";
import { Note, NotePin, makeNotePin, Pattern } from "./Pattern";
import { FilterSettings, FilterControlPoint } from "./Filter";
import { clamp, validateRange, parseFloatWithDefault, parseIntWithDefault, secondsToFadeInSetting, ticksToFadeOutSetting } from "./utils";
//import { Synth } from "./synth";

function encode32BitNumber(buffer: number[], x: number): void {
    // 0b11_
    buffer.push(base64IntToCharCode[(x >>> (6 * 5)) & 0x3]);
    //      111111_
    buffer.push(base64IntToCharCode[(x >>> (6 * 4)) & 0x3f]);
    //             111111_
    buffer.push(base64IntToCharCode[(x >>> (6 * 3)) & 0x3f]);
    //                    111111_
    buffer.push(base64IntToCharCode[(x >>> (6 * 2)) & 0x3f]);
    //                           111111_
    buffer.push(base64IntToCharCode[(x >>> (6 * 1)) & 0x3f]);
    //                                  111111
    buffer.push(base64IntToCharCode[(x >>> (6 * 0)) & 0x3f]);
}

// @TODO: This is error-prone, because the caller has to remember to increment
// charIndex by 6 afterwards.
function decode32BitNumber(compressed: string, charIndex: number): number {
    let x: number = 0;
    // 0b11_
    x |= base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << (6 * 5);
    //      111111_
    x |= base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << (6 * 4);
    //             111111_
    x |= base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << (6 * 3);
    //                    111111_
    x |= base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << (6 * 2);
    //                           111111_
    x |= base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << (6 * 1);
    //                                  111111
    x |= base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << (6 * 0);
    return x;
}

function encodeUnisonSettings(buffer: number[], v: number, s: number, o: number, e: number, i: number): void {
    // TODO: make these sign bits more efficient (bundle them together)
    buffer.push(base64IntToCharCode[v]);

    // TODO: make these use bitshifts instead for consistency
    buffer.push(base64IntToCharCode[Number((s > 0))]);
    let cleanS = Math.round(Math.abs(s) * 1000);
    let cleanSDivided = Math.floor(cleanS / 63);
    buffer.push(base64IntToCharCode[cleanS % 63], base64IntToCharCode[cleanSDivided % 63], base64IntToCharCode[Math.floor(cleanSDivided / 63)]);

    buffer.push(base64IntToCharCode[Number((o > 0))]);
    let cleanO = Math.round(Math.abs(o) * 1000);
    let cleanODivided = Math.floor(cleanO / 63);
    buffer.push(base64IntToCharCode[cleanO % 63], base64IntToCharCode[cleanODivided % 63], base64IntToCharCode[Math.floor(cleanODivided / 63)]);

    buffer.push(base64IntToCharCode[Number((e > 0))]);
    let cleanE = Math.round(Math.abs(e) * 1000);
    buffer.push(base64IntToCharCode[cleanE % 63], base64IntToCharCode[Math.floor(cleanE / 63)]);

    buffer.push(base64IntToCharCode[Number((i > 0))]);
    let cleanI = Math.round(Math.abs(i) * 1000);
    buffer.push(base64IntToCharCode[cleanI % 63], base64IntToCharCode[Math.floor(cleanI / 63)]);
}

function convertLegacyKeyToKeyAndOctave(rawKeyIndex: number): [number, number] {
    let key: number = clamp(0, Config.keys.length, rawKeyIndex);
    let octave: number = 0;
    // This conversion code depends on C through B being
    // available as keys, of course.
    if (rawKeyIndex === 12) {
        // { name: "C+", isWhiteKey: false, basePitch: 24 }
        key = 0;
        octave = 1;
    } else if (rawKeyIndex === 13) {
        // { name: "G- (actually F#-)", isWhiteKey: false, basePitch: 6 }
        key = 6;
        octave = -1;
    } else if (rawKeyIndex === 14) {
        // { name: "C-", isWhiteKey: true, basePitch: 0 }
        key = 0;
        octave = -1;
    } else if (rawKeyIndex === 15) {
        // { name: "oh no (F-)", isWhiteKey: true, basePitch: 5 }
        key = 5;
        octave = -1;
    }
    return [key, octave];
}

const enum CharCode {
    SPACE = 32,
    HASH = 35,
    PERCENT = 37,
    AMPERSAND = 38,
    PLUS = 43,
    DASH = 45,
    DOT = 46,
    NUM_0 = 48,
    NUM_1 = 49,
    NUM_2 = 50,
    NUM_3 = 51,
    NUM_4 = 52,
    NUM_5 = 53,
    NUM_6 = 54,
    NUM_7 = 55,
    NUM_8 = 56,
    NUM_9 = 57,
    EQUALS = 61,
    A = 65,
    B = 66,
    C = 67,
    D = 68,
    E = 69,
    F = 70,
    G = 71,
    H = 72,
    I = 73,
    J = 74,
    K = 75,
    L = 76,
    M = 77,
    N = 78,
    O = 79,
    P = 80,
    Q = 81,
    R = 82,
    S = 83,
    T = 84,
    U = 85,
    V = 86,
    W = 87,
    X = 88,
    Y = 89,
    Z = 90,
    UNDERSCORE = 95,
    a = 97,
    b = 98,
    c = 99,
    d = 100,
    e = 101,
    f = 102,
    g = 103,
    h = 104,
    i = 105,
    j = 106,
    k = 107,
    l = 108,
    m = 109,
    n = 110,
    o = 111,
    p = 112,
    q = 113,
    r = 114,
    s = 115,
    t = 116,
    u = 117,
    v = 118,
    w = 119,
    x = 120,
    y = 121,
    z = 122,
    LEFT_CURLY_BRACE = 123,
    RIGHT_CURLY_BRACE = 125,
}

const enum SongTagCode {
    beatCount           = CharCode.a, // added in BeepBox URL version 2
	bars                = CharCode.b, // added in BeepBox URL version 2
	songEq              = CharCode.c, // added in BeepBox URL version 2 for vibrato, switched to song eq in Slarmoo's Box 1.3
	fadeInOut           = CharCode.d, // added in BeepBox URL version 3 for transition, switched to fadeInOut in 9
	loopEnd             = CharCode.e, // added in BeepBox URL version 2
	noteFilter          = CharCode.f, // added in BeepBox URL version 3
	barCount            = CharCode.g, // added in BeepBox URL version 3
	unison              = CharCode.h, // added in BeepBox URL version 2
	instrumentCount     = CharCode.i, // added in BeepBox URL version 3
	patternCount        = CharCode.j, // added in BeepBox URL version 3
	key                 = CharCode.k, // added in BeepBox URL version 2
	loopStart           = CharCode.l, // added in BeepBox URL version 2
	reverb              = CharCode.m, // added in BeepBox URL version 5, DEPRECATED
	channelCount        = CharCode.n, // added in BeepBox URL version 6
	channelOctave       = CharCode.o, // added in BeepBox URL version 3
	patterns            = CharCode.p, // added in BeepBox URL version 2
	effects             = CharCode.q, // added in BeepBox URL version 7
	rhythm              = CharCode.r, // added in BeepBox URL version 2
	scale               = CharCode.s, // added in BeepBox URL version 2
	tempo               = CharCode.t, // added in BeepBox URL version 2
	preset              = CharCode.u, // added in BeepBox URL version 7
	volume              = CharCode.v, // added in BeepBox URL version 2
	wave                = CharCode.w, // added in BeepBox URL version 2
	supersaw            = CharCode.x, // added in BeepBox URL version 9 ([UB] was used for chip wave but is now DEPRECATED)
	loopControls        = CharCode.y, // added in BeepBox URL version 7, DEPRECATED, [UB] repurposed for chip wave loop controls
	drumsetEnvelopes    = CharCode.z, // added in BeepBox URL version 7 for filter envelopes, still used for drumset envelopes
	algorithm           = CharCode.A, // added in BeepBox URL version 6
	feedbackAmplitude   = CharCode.B, // added in BeepBox URL version 6
	chord               = CharCode.C, // added in BeepBox URL version 7, DEPRECATED
	detune              = CharCode.D, // added in JummBox URL version 3(?) for detune, DEPRECATED
	envelopes           = CharCode.E, // added in BeepBox URL version 6 for FM operator envelopes, repurposed in 9 for general envelopes.
	feedbackType        = CharCode.F, // added in BeepBox URL version 6
	arpeggioSpeed       = CharCode.G, // added in JummBox URL version 3 for arpeggioSpeed, DEPRECATED
	harmonics           = CharCode.H, // added in BeepBox URL version 7
	stringSustain       = CharCode.I, // added in BeepBox URL version 9
//	                    = CharCode.J,
//	                    = CharCode.K,
	pan                 = CharCode.L, // added between 8 and 9, DEPRECATED
	customChipWave      = CharCode.M, // added in JummBox URL version 1(?) for customChipWave
	songTitle           = CharCode.N, // added in JummBox URL version 1(?) for songTitle
	limiterSettings     = CharCode.O, // added in JummBox URL version 3(?) for limiterSettings
	operatorAmplitudes  = CharCode.P, // added in BeepBox URL version 6
	operatorFrequencies = CharCode.Q, // added in BeepBox URL version 6
	operatorWaves       = CharCode.R, // added in JummBox URL version 4 for operatorWaves
	spectrum            = CharCode.S, // added in BeepBox URL version 7
	startInstrument     = CharCode.T, // added in BeepBox URL version 6
	channelNames        = CharCode.U, // added in JummBox URL version 4(?) for channelNames
	feedbackEnvelope    = CharCode.V, // added in BeepBox URL version 6, DEPRECATED
	pulseWidth          = CharCode.W, // added in BeepBox URL version 7
	aliases             = CharCode.X, // added in JummBox URL version 4 for aliases, DEPRECATED, [UB] repurposed for PWM decimal offset (DEPRECATED as well)
//                      = CharCode.Y,
//	                    = CharCode.Z,
//	                    = CharCode.NUM_0,
//	                    = CharCode.NUM_1,
//	                    = CharCode.NUM_2,
//	                    = CharCode.NUM_3,
//	                    = CharCode.NUM_4,
//	                    = CharCode.NUM_5,
//	                    = CharCode.NUM_6,
//	                    = CharCode.NUM_7,
//	                    = CharCode.NUM_8,
//	                    = CharCode.NUM_9,
//	                    = CharCode.DASH,
//	                    = CharCode.UNDERSCORE,

}

const base64IntToCharCode: ReadonlyArray<number> = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 45, 95];
const base64CharCodeToInt: ReadonlyArray<number> = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 62, 62, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 0, 0, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 0, 0, 0, 0, 63, 0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 0, 0, 0, 0, 0]; // 62 could be represented by either "-" or "." for historical reasons. New songs should use "-".

class BitFieldReader {
    private _bits: number[] = [];
    private _readIndex: number = 0;

    constructor(source: string, startIndex: number, stopIndex: number) {
        for (let i: number = startIndex; i < stopIndex; i++) {
            const value: number = base64CharCodeToInt[source.charCodeAt(i)];
            this._bits.push((value >> 5) & 0x1);
            this._bits.push((value >> 4) & 0x1);
            this._bits.push((value >> 3) & 0x1);
            this._bits.push((value >> 2) & 0x1);
            this._bits.push((value >> 1) & 0x1);
            this._bits.push(value & 0x1);
        }
    }

    public read(bitCount: number): number {
        let result: number = 0;
        while (bitCount > 0) {
            result = result << 1;
            result += this._bits[this._readIndex++];
            bitCount--;
        }
        return result;
    }

    public readLongTail(minValue: number, minBits: number): number {
        let result: number = minValue;
        let numBits: number = minBits;
        while (this._bits[this._readIndex++]) {
            result += 1 << numBits;
            numBits++;
        }
        while (numBits > 0) {
            numBits--;
            if (this._bits[this._readIndex++]) {
                result += 1 << numBits;
            }
        }
        return result;
    }

    public readPartDuration(): number {
        return this.readLongTail(1, 3);
    }

    public readLegacyPartDuration(): number {
        return this.readLongTail(1, 2);
    }

    public readPinCount(): number {
        return this.readLongTail(1, 0);
    }

    public readPitchInterval(): number {
        if (this.read(1)) {
            return -this.readLongTail(1, 3);
        } else {
            return this.readLongTail(1, 3);
        }
    }
}

class BitFieldWriter {
    private _index: number = 0;
    private _bits: number[] = [];

    public clear() {
        this._index = 0;
    }

    public write(bitCount: number, value: number): void {
        bitCount--;
        while (bitCount >= 0) {
            this._bits[this._index++] = (value >>> bitCount) & 1;
            bitCount--;
        }
    }

    public writeLongTail(minValue: number, minBits: number, value: number): void {
        if (value < minValue) throw new Error("value out of bounds");
        value -= minValue;
        let numBits: number = minBits;
        while (value >= (1 << numBits)) {
            this._bits[this._index++] = 1;
            value -= 1 << numBits;
            numBits++;
        }
        this._bits[this._index++] = 0;
        while (numBits > 0) {
            numBits--;
            this._bits[this._index++] = (value >>> numBits) & 1;
        }
    }

    public writePartDuration(value: number): void {
        this.writeLongTail(1, 3, value);
    }

    public writePinCount(value: number): void {
        this.writeLongTail(1, 0, value);
    }

    public writePitchInterval(value: number): void {
        if (value < 0) {
            this.write(1, 1); // sign
            this.writeLongTail(1, 3, -value);
        } else {
            this.write(1, 0); // sign
            this.writeLongTail(1, 3, value);
        }
    }

    public concat(other: BitFieldWriter): void {
        for (let i: number = 0; i < other._index; i++) {
            this._bits[this._index++] = other._bits[i];
        }
    }

    public encodeBase64(buffer: number[]): number[] {

        for (let i: number = 0; i < this._index; i += 6) {
            const value: number = (this._bits[i] << 5) | (this._bits[i + 1] << 4) | (this._bits[i + 2] << 3) | (this._bits[i + 3] << 2) | (this._bits[i + 4] << 1) | this._bits[i + 5];
            buffer.push(base64IntToCharCode[value]);
        }
        return buffer;
    }

    public lengthBase64(): number {
        return Math.ceil(this._index / 6);
    }
}

export interface HeldMod {
    volume: number;
    channelIndex: number;
    instrumentIndex: number;
    setting: number;
    holdFor: number;
}

export class Song {
    private static readonly _format: string = Config.jsonFormat;
    private static readonly _oldestBeepboxVersion: number = 2;
    private static readonly _latestBeepboxVersion: number = 9;
    private static readonly _oldestJummBoxVersion: number = 1;
    private static readonly _latestJummBoxVersion: number = 6;
    private static readonly _oldestGoldBoxVersion: number = 1;
    private static readonly _latestGoldBoxVersion: number = 4;
    private static readonly _oldestUltraBoxVersion: number = 1;
    private static readonly _latestUltraBoxVersion: number = 5;
    private static readonly _oldestSlarmoosBoxVersion: number = 1;
    private static readonly _latestSlarmoosBoxVersion: number = 5;
    // One-character variant detection at the start of URL to distinguish variants such as JummBox, Or Goldbox. "j" and "g" respectively
    //also "u" is ultrabox lol
    private static readonly _variant = 0x74; //"t" ~ theepbox

    public title: string;
    public scale: number;
    public scaleCustom: boolean[] = [];
    public key: number;
    public octave: number;
    public tempo: number;
    public reverb: number;
    public beatsPerBar: number;
    public barCount: number;
    public patternsPerChannel: number;
    public rhythm: number;
    public layeredInstruments: boolean;
    public patternInstruments: boolean;
    public loopStart: number;
    public loopLength: number;
    public pitchChannelCount: number;
    public noiseChannelCount: number;
    public modChannelCount: number;
    public readonly channels: Channel[] = [];
    public limitDecay: number = 4.0;
    public limitRise: number = 4000.0;
    public compressionThreshold: number = 1.0;
    public limitThreshold: number = 1.0;
    public compressionRatio: number = 1.0;
    public limitRatio: number = 1.0;
    public masterGain: number = 1.0;
    public inVolumeCap: number = 0.0;
    public outVolumeCap: number = 0.0;
    public outVolumeCapL: number = 0.0;
    public outVolumeCapR: number = 0.0;
    public eqFilter: FilterSettings = new FilterSettings();
    public eqFilterType: boolean = false;
    public eqFilterSimpleCut: number = Config.filterSimpleCutRange - 1;
    public eqFilterSimplePeak: number = 0;
    public eqSubFilters: (FilterSettings | null)[] = [];
    public tmpEqFilterStart: FilterSettings | null;
    public tmpEqFilterEnd: FilterSettings | null;

    constructor(string?: string) {
        if (string != undefined) {
            this.fromBase64String(string);
        } else {
            this.initToDefault(true);
        }
    }

    // Returns the ideal new pre volume when dragging (max volume for a normal note, a "neutral" value for mod notes based on how they work)
    public getNewNoteVolume = (isMod: boolean, modChannel?: number, modInstrument?: number, modCount?: number): number => {
        if (!isMod || modChannel == undefined || modInstrument == undefined || modCount == undefined)
            return Config.noteSizeMax;
        else {
            // Sigh, the way pitches count up and the visual ordering in the UI are flipped.
            modCount = Config.modCount - modCount - 1;

            const instrument: Instrument = this.channels[modChannel].instruments[modInstrument];
            let vol: number | undefined = Config.modulators[instrument.modulators[modCount]].newNoteVol;

            let currentIndex: number = instrument.modulators[modCount];
            // For tempo, actually use user defined tempo
            let tempoIndex: number = Config.modulators.dictionary["tempo"].index;
            if(currentIndex == tempoIndex) vol = this.tempo - Config.modulators[tempoIndex].convertRealFactor;
            //for effects and envelopes, use the user defined value of the selected instrument (or the default value if all or active is selected)
            if (!Config.modulators[currentIndex].forSong && instrument.modInstruments[modCount][0] < this.channels[instrument.modChannels[modCount][0]].instruments.length) {
                let chorusIndex: number = Config.modulators.dictionary["chorus"].index;
                let reverbIndex: number = Config.modulators.dictionary["reverb"].index;
                let gainIndex: number = Config.modulators.dictionary["gain"].index;
                let panningIndex: number = Config.modulators.dictionary["pan"].index;
                let panDelayIndex: number = Config.modulators.dictionary["pan delay"].index;
                let distortionIndex: number = Config.modulators.dictionary["distortion"].index;
                let detuneIndex: number = Config.modulators.dictionary["detune"].index;
                let vibratoDepthIndex: number = Config.modulators.dictionary["vibrato depth"].index;
                let vibratoSpeedIndex: number = Config.modulators.dictionary["vibrato speed"].index;
                let vibratoDelayIndex: number = Config.modulators.dictionary["vibrato delay"].index;
                let arpSpeedIndex: number = Config.modulators.dictionary["arp speed"].index;
                let bitCrushIndex: number = Config.modulators.dictionary["bit crush"].index;
                let freqCrushIndex: number = Config.modulators.dictionary["freq crush"].index;
                let echoIndex: number = Config.modulators.dictionary["echo"].index;
                let echoDelayIndex: number = Config.modulators.dictionary["echo delay"].index;
                let echoPingPongIndex: number = Config.modulators.dictionary["echo ping pong"].index;
                let pitchShiftIndex: number = Config.modulators.dictionary["pitch shift"].index;
                let ringModIndex: number = Config.modulators.dictionary["ring modulation"].index;
                let ringModHertzIndex: number = Config.modulators.dictionary["ring mod hertz"].index;
                let granularIndex: number = Config.modulators.dictionary["granular"].index;
                let grainAmountIndex: number = Config.modulators.dictionary["grain freq"].index;
                let grainSizeIndex: number = Config.modulators.dictionary["grain size"].index;
                let grainRangeIndex: number = Config.modulators.dictionary["grain range"].index;
                let envSpeedIndex: number = Config.modulators.dictionary["envelope speed"].index;
                let perEnvSpeedIndex: number = Config.modulators.dictionary["individual envelope speed"].index;
                let perEnvLowerIndex: number = Config.modulators.dictionary["individual envelope lower bound"].index;
                let perEnvUpperIndex: number = Config.modulators.dictionary["individual envelope upper bound"].index;
                let instrumentIndex: number = instrument.modInstruments[modCount][0];
                let effectIndex: number = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effectCount; //in a moment i should be working to make this work with mods

                switch (currentIndex) {
                    case chorusIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.chorus - Config.modulators[chorusIndex].convertRealFactor;
                        break;
                    case reverbIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.reverb - Config.modulators[reverbIndex].convertRealFactor;
                        break;
                    case gainIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.gain - Config.modulators[gainIndex].convertRealFactor;
                        break;
                    case panningIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.pan - Config.modulators[panningIndex].convertRealFactor;
                        break;
                    case panDelayIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.panDelay - Config.modulators[panDelayIndex].convertRealFactor;
                        break;
                    case distortionIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.distortion - Config.modulators[distortionIndex].convertRealFactor;
                        break;
                    case detuneIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].detune;
                        break;
                    case vibratoDepthIndex:
                        vol = Math.round(this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].vibratoDepth * 25 - Config.modulators[vibratoDepthIndex].convertRealFactor);
                        break;
                    case vibratoSpeedIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].vibratoSpeed - Config.modulators[vibratoSpeedIndex].convertRealFactor;
                        break;
                    case vibratoDelayIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].vibratoDelay - Config.modulators[vibratoDelayIndex].convertRealFactor;
                        break;
                    case arpSpeedIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].arpeggioSpeed - Config.modulators[arpSpeedIndex].convertRealFactor;
                        break;
                    case bitCrushIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.bitcrusherQuantization - Config.modulators[bitCrushIndex].convertRealFactor;
                        break;
                    case freqCrushIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.bitcrusherFreq - Config.modulators[freqCrushIndex].convertRealFactor;
                        break;
                    case echoIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.echoSustain - Config.modulators[echoIndex].convertRealFactor;
                        break;
                    case echoDelayIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.echoDelay - Config.modulators[echoDelayIndex].convertRealFactor;
                        break;
                    case echoPingPongIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.echoPingPong - Config.modulators[echoPingPongIndex].convertRealFactor;
                        break;
                    case pitchShiftIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].pitchShift;
                        break;
                    case ringModIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.ringModulation - Config.modulators[ringModIndex].convertRealFactor;
                        break;
                    case ringModHertzIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.ringModulationHz - Config.modulators[ringModHertzIndex].convertRealFactor;
                        break;
                    case granularIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.granular - Config.modulators[granularIndex].convertRealFactor;
                        break;
                    case grainAmountIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.grainAmounts - Config.modulators[grainAmountIndex].convertRealFactor;
                        break;
                    case grainSizeIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.grainSize - Config.modulators[grainSizeIndex].convertRealFactor;
                        break;
                    case grainRangeIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].effects[effectIndex]!.grainRange - Config.modulators[grainRangeIndex].convertRealFactor;
                        break;
                    case envSpeedIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].envelopeSpeed - Config.modulators[envSpeedIndex].convertRealFactor;
                        break;
                    case perEnvSpeedIndex:
                        vol = Config.perEnvelopeSpeedToIndices[this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].envelopes[instrument.modEnvelopeNumbers[modCount]].perEnvelopeSpeed] - Config.modulators[perEnvSpeedIndex].convertRealFactor;
                        break;
                    case perEnvLowerIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].envelopes[instrument.modEnvelopeNumbers[modCount]].perEnvelopeLowerBound - Config.modulators[perEnvLowerIndex].convertRealFactor;
                        break;
                    case perEnvUpperIndex:
                        vol = this.channels[instrument.modChannels[modCount][0]].instruments[instrumentIndex].envelopes[instrument.modEnvelopeNumbers[modCount]].perEnvelopeUpperBound - Config.modulators[perEnvUpperIndex].convertRealFactor;
                        break;
                }
            }

            if (vol != undefined)
                return vol;
            else
                return Config.noteSizeMax;
        }
    }


    public getVolumeCap = (isMod: boolean, modChannel?: number, modInstrument?: number, modCount?: number): number => {
        if (!isMod || modChannel == undefined || modInstrument == undefined || modCount == undefined)
            return Config.noteSizeMax;
        else {
            // Sigh, the way pitches count up and the visual ordering in the UI are flipped.
            modCount = Config.modCount - modCount - 1;

            let instrument: Instrument = this.channels[modChannel].instruments[modInstrument];
            let modulator = Config.modulators[instrument.modulators[modCount]];
            let cap: number | undefined = modulator.maxRawVol;

            if (cap != undefined) {
                // For filters, cap is dependent on which filter setting is targeted
                if (modulator.name == "post eq" || modulator.name == "pre eq" || modulator.name == "song eq") {
                    // type 0: number of filter morphs
                    // type 1/odd: number of filter x positions
                    // type 2/even: number of filter y positions
                    cap = Config.filterMorphCount - 1;
                    if (instrument.modFilterTypes[modCount] > 0 && instrument.modFilterTypes[modCount] % 2) {
                        cap = Config.filterFreqRange;
                    } else if (instrument.modFilterTypes[modCount] > 0) {
                        cap = Config.filterGainRange;
                    }
                }
                return cap;
            }
            else
                return Config.noteSizeMax;
        }
    }

    public getVolumeCapForSetting = (isMod: boolean, modSetting: number, filterType?: number): number => {
        if (!isMod)
            return Config.noteSizeMax;
        else {
            let cap: number | undefined = Config.modulators[modSetting].maxRawVol;
            if (cap != undefined) {

                // For filters, cap is dependent on which filter setting is targeted
                if (filterType != undefined && (Config.modulators[modSetting].name == "post eq" || Config.modulators[modSetting].name == "pre eq" || Config.modulators[modSetting].name == "song eq")) {
                    // type 0: number of filter morphs
                    // type 1/odd: number of filter x positions
                    // type 2/even: number of filter y positions
                    cap = Config.filterMorphCount - 1;
                    if (filterType > 0 && filterType % 2) {
                        cap = Config.filterFreqRange;
                    } else if (filterType > 0) {
                        cap = Config.filterGainRange;
                    }
                }

                return cap;
            } else
                return Config.noteSizeMax;
        }
    }

    public getChannelCount(): number {
        return this.pitchChannelCount + this.noiseChannelCount + this.modChannelCount;
    }

    public getMaxInstrumentsPerChannel(): number {
        return Math.max(
            this.layeredInstruments ? Config.layeredInstrumentCountMax : Config.instrumentCountMin,
            this.patternInstruments ? Config.patternInstrumentCountMax : Config.instrumentCountMin);
    }

    public getMaxInstrumentsPerPattern(channelIndex: number): number {
        return this.getMaxInstrumentsPerPatternForChannel(this.channels[channelIndex]);
    }

    public getMaxInstrumentsPerPatternForChannel(channel: Channel): number {
        return this.layeredInstruments
            ? Math.min(Config.layeredInstrumentCountMax, channel.instruments.length)
            : 1;
    }

    public getChannelIsNoise(channelIndex: number): boolean {
        return (channelIndex >= this.pitchChannelCount && channelIndex < this.pitchChannelCount + this.noiseChannelCount);
    }

    public getChannelIsMod(channelIndex: number): boolean {
        return (channelIndex >= this.pitchChannelCount + this.noiseChannelCount);
    }

    public static secondsToFadeInSetting(seconds: number): number {
        return clamp(0, Config.fadeInRange, Math.round((-0.95 + Math.sqrt(0.9025 + 0.2 * seconds / 0.0125)) / 0.1));
    }

    public static ticksToFadeOutSetting(ticks: number): number {
        let lower: number = Config.fadeOutTicks[0];
        if (ticks <= lower) return 0;
        for (let i: number = 1; i < Config.fadeOutTicks.length; i++) {
            let upper: number = Config.fadeOutTicks[i];
            if (ticks <= upper) return (ticks < (lower + upper) / 2) ? i - 1 : i;
            lower = upper;
        }
        return Config.fadeOutTicks.length - 1;
    }

    public initToDefault(andResetChannels: boolean = true): void {
        this.scale = 1;
        this.scaleCustom = [true, false, true, true, false, false, false, true, true, false, true, true];
        //this.scaleCustom = [true, false, false, false, false, false, false, false, false, false, false, false];
        this.key = 0;
        this.octave = 0;
        this.loopStart = 0;
        this.loopLength = 4;
        this.tempo = 151;
        this.reverb = 0;
        this.beatsPerBar = 8;
        this.barCount = 16;
        this.patternsPerChannel = 8;
        this.rhythm = 1;
        this.layeredInstruments = false;
        this.patternInstruments = false;
        this.eqFilter.reset();
        for (let i: number = 0; i < Config.filterMorphCount - 1; i++) {
            this.eqSubFilters[i] = null;
        }

        //This is the tab's display name
        this.title = "Untitled";
        document.title = this.title + " - " + EditorConfig.versionDisplayName;

        if (andResetChannels) {
            this.pitchChannelCount = 4;
            this.noiseChannelCount = 1;
            this.modChannelCount = 0;
            for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                const isNoiseChannel: boolean = channelIndex >= this.pitchChannelCount && channelIndex < this.pitchChannelCount + this.noiseChannelCount;
                const isModChannel: boolean = channelIndex >= this.pitchChannelCount + this.noiseChannelCount;
                if (this.channels.length <= channelIndex) {
                    this.channels[channelIndex] = new Channel();
                    this.channels[channelIndex].color = channelIndex;
                }
                const channel: Channel = this.channels[channelIndex];
                channel.octave = Math.max(4 - channelIndex, 0); // [4, 3, 2, 1, 0]; Descending octaves with drums at zero in last channel.

                for (let pattern: number = 0; pattern < this.patternsPerChannel; pattern++) {
                    if (channel.patterns.length <= pattern) {
                        channel.patterns[pattern] = new Pattern();
                    } else {
                        channel.patterns[pattern].reset();
                    }
                }
                channel.patterns.length = this.patternsPerChannel;

                for (let instrument: number = 0; instrument < Config.instrumentCountMin; instrument++) {
                    if (channel.instruments.length <= instrument) {
                        channel.instruments[instrument] = new Instrument(isNoiseChannel, isModChannel);
                    }
                    channel.instruments[instrument].setTypeAndReset(isModChannel ? InstrumentType.mod : (isNoiseChannel ? InstrumentType.noise : InstrumentType.chip), isNoiseChannel, isModChannel);
                }
                channel.instruments.length = Config.instrumentCountMin;

                for (let bar: number = 0; bar < this.barCount; bar++) {
                    channel.bars[bar] = bar < 16 ? 1 : 0;
                }
                channel.bars.length = this.barCount;
            }
            this.channels.length = this.getChannelCount();
        }
    }

    //This determines the url
    public toBase64String(): string {
        let bits: BitFieldWriter;
        let buffer: number[] = [];

        buffer.push(Song._variant);
        buffer.push(base64IntToCharCode[Song._latestSlarmoosBoxVersion]);

        // Length of the song name string
        buffer.push(SongTagCode.songTitle);
        var encodedSongTitle: string = encodeURIComponent(this.title);
        buffer.push(base64IntToCharCode[encodedSongTitle.length >> 6], base64IntToCharCode[encodedSongTitle.length & 0x3f]);

        // Actual encoded string follows
        for (let i: number = 0; i < encodedSongTitle.length; i++) {
            buffer.push(encodedSongTitle.charCodeAt(i));
        }

        buffer.push(SongTagCode.channelCount, base64IntToCharCode[this.pitchChannelCount], base64IntToCharCode[this.noiseChannelCount], base64IntToCharCode[this.modChannelCount]);
        buffer.push(SongTagCode.scale, base64IntToCharCode[this.scale]);
        if (this.scale == Config.scales["dictionary"]["Custom"].index) {
            for (var i = 1; i < Config.pitchesPerOctave; i++) {
                buffer.push(base64IntToCharCode[this.scaleCustom[i] ? 1 : 0]) // ineffiecent? yes, all we're going to do for now? hell yes
            }
        }
        buffer.push(SongTagCode.key, base64IntToCharCode[this.key], base64IntToCharCode[this.octave - Config.octaveMin]);
        buffer.push(SongTagCode.loopStart, base64IntToCharCode[this.loopStart >> 6], base64IntToCharCode[this.loopStart & 0x3f]);
        buffer.push(SongTagCode.loopEnd, base64IntToCharCode[(this.loopLength - 1) >> 6], base64IntToCharCode[(this.loopLength - 1) & 0x3f]);
        buffer.push(SongTagCode.tempo, base64IntToCharCode[this.tempo >> 6], base64IntToCharCode[this.tempo & 0x3F]);
        buffer.push(SongTagCode.beatCount, base64IntToCharCode[this.beatsPerBar - 1]);
        buffer.push(SongTagCode.barCount, base64IntToCharCode[(this.barCount - 1) >> 6], base64IntToCharCode[(this.barCount - 1) & 0x3f]);
        buffer.push(SongTagCode.patternCount, base64IntToCharCode[(this.patternsPerChannel - 1) >> 6], base64IntToCharCode[(this.patternsPerChannel - 1) & 0x3f]);
        buffer.push(SongTagCode.rhythm, base64IntToCharCode[this.rhythm]);

        // Push limiter settings, but only if they aren't the default!
        buffer.push(SongTagCode.limiterSettings);
        if (this.compressionRatio != 1.0 || this.limitRatio != 1.0 || this.limitRise != 4000.0 || this.limitDecay != 4.0 || this.limitThreshold != 1.0 || this.compressionThreshold != 1.0 || this.masterGain != 1.0) {
            buffer.push(base64IntToCharCode[Math.round(this.compressionRatio < 1 ? this.compressionRatio * 10 : 10 + (this.compressionRatio - 1) * 60)]); // 0 ~ 1.15 uneven, mapped to 0 ~ 20
            buffer.push(base64IntToCharCode[Math.round(this.limitRatio < 1 ? this.limitRatio * 10 : 9 + this.limitRatio)]); // 0 ~ 10 uneven, mapped to 0 ~ 20
            buffer.push(base64IntToCharCode[this.limitDecay]); // directly 1 ~ 30
            buffer.push(base64IntToCharCode[Math.round((this.limitRise - 2000.0) / 250.0)]); // 2000 ~ 10000 by 250, mapped to 0 ~ 32
            buffer.push(base64IntToCharCode[Math.round(this.compressionThreshold * 20)]); // 0 ~ 1.1 by 0.05, mapped to 0 ~ 22
            buffer.push(base64IntToCharCode[Math.round(this.limitThreshold * 20)]); // 0 ~ 2 by 0.05, mapped to 0 ~ 40
            buffer.push(base64IntToCharCode[Math.round(this.masterGain * 50) >> 6], base64IntToCharCode[Math.round(this.masterGain * 50) & 0x3f]); // 0 ~ 5 by 0.02, mapped to 0 ~ 250
        }
        else {
            buffer.push(base64IntToCharCode[0x3f]); // Not using limiter
        }

        //songeq
        buffer.push(SongTagCode.songEq);
        if (this.eqFilter == null) {
            // Push null filter settings
            buffer.push(base64IntToCharCode[0]);
            console.log("Null post eq settings detected in toBase64String for song");
        } else {
            buffer.push(base64IntToCharCode[this.eqFilter.controlPointCount]);
            for (let j: number = 0; j < this.eqFilter.controlPointCount; j++) {
                const point: FilterControlPoint = this.eqFilter.controlPoints[j];
                buffer.push(base64IntToCharCode[point.type], base64IntToCharCode[Math.round(point.freq)], base64IntToCharCode[Math.round(point.gain)]);
            }
        }

        // Push subfilters as well. Skip Index 0, is a copy of the base filter.
        let usingSubFilterBitfield: number = 0;
        for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
            usingSubFilterBitfield |= (+(this.eqSubFilters[j + 1] != null) << j);
        }
        // Put subfilter usage into 2 chars (12 bits)
        buffer.push(base64IntToCharCode[usingSubFilterBitfield >> 6], base64IntToCharCode[usingSubFilterBitfield & 63]);
        // Put subfilter info in for all used subfilters
        for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
            if (usingSubFilterBitfield & (1 << j)) {
                buffer.push(base64IntToCharCode[this.eqSubFilters[j + 1]!.controlPointCount]);
                for (let k: number = 0; k < this.eqSubFilters[j + 1]!.controlPointCount; k++) {
                    const point: FilterControlPoint = this.eqSubFilters[j + 1]!.controlPoints[k];
                    buffer.push(base64IntToCharCode[point.type], base64IntToCharCode[Math.round(point.freq)], base64IntToCharCode[Math.round(point.gain)]);
                }
            }
        }

        buffer.push(SongTagCode.channelNames);
        for (let channel: number = 0; channel < this.getChannelCount(); channel++) {
            // Length of the channel name string
            var encodedChannelName: string = encodeURIComponent(this.channels[channel].name);
            buffer.push(base64IntToCharCode[encodedChannelName.length >> 6], base64IntToCharCode[encodedChannelName.length & 0x3f]);

            // Actual encoded string follows
            for (let i: number = 0; i < encodedChannelName.length; i++) {
                buffer.push(encodedChannelName.charCodeAt(i));
            }
            buffer.push(base64IntToCharCode[this.channels[channel].color % 60]);
        }

        buffer.push(SongTagCode.instrumentCount, base64IntToCharCode[(<any>this.layeredInstruments << 1) | <any>this.patternInstruments]);
        if (this.layeredInstruments || this.patternInstruments) {
            for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                buffer.push(base64IntToCharCode[this.channels[channelIndex].instruments.length - Config.instrumentCountMin]);
            }
        }

        buffer.push(SongTagCode.channelOctave);
        for (let channelIndex: number = 0; channelIndex < this.pitchChannelCount; channelIndex++) {
            buffer.push(base64IntToCharCode[this.channels[channelIndex].octave]);
        }

        //This is for specific instrument stuff to url
        for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
            for (let i: number = 0; i < this.channels[channelIndex].instruments.length; i++) {
                const instrument: Instrument = this.channels[channelIndex].instruments[i];
                buffer.push(SongTagCode.startInstrument, base64IntToCharCode[instrument.type]);
                buffer.push(SongTagCode.volume, base64IntToCharCode[(instrument.volume + Config.volumeRange / 2) >> 6], base64IntToCharCode[(instrument.volume + Config.volumeRange / 2) & 0x3f]);
                buffer.push(SongTagCode.preset, base64IntToCharCode[instrument.preset >> 6], base64IntToCharCode[instrument.preset & 63]);

                buffer.push(SongTagCode.noteFilter);
                buffer.push(base64IntToCharCode[+instrument.noteFilterType]);
                if (instrument.noteFilterType) {
                    buffer.push(base64IntToCharCode[instrument.noteFilterSimpleCut]);
                    buffer.push(base64IntToCharCode[instrument.noteFilterSimplePeak]);
                }
                else {
                    if (instrument.noteFilter == null) {
                        // Push null filter settings
                        buffer.push(base64IntToCharCode[0]);
                        console.log("Null pre eq settings detected in toBase64String for channelIndex " + channelIndex + ", instrumentIndex " + i);
                    } else {
                        buffer.push(base64IntToCharCode[instrument.noteFilter.controlPointCount]);
                        for (let j: number = 0; j < instrument.noteFilter.controlPointCount; j++) {
                            const point: FilterControlPoint = instrument.noteFilter.controlPoints[j];
                            buffer.push(base64IntToCharCode[point.type], base64IntToCharCode[Math.round(point.freq)], base64IntToCharCode[Math.round(point.gain)]);
                        }
                    }

                    // Push subfilters as well. Skip Index 0, is a copy of the base filter.
                    let usingSubFilterBitfield: number = 0;
                    for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
                        usingSubFilterBitfield |= (+(instrument.noteSubFilters[j + 1] != null) << j);
                    }
                    // Put subfilter usage into 2 chars (12 bits)
                    buffer.push(base64IntToCharCode[usingSubFilterBitfield >> 6], base64IntToCharCode[usingSubFilterBitfield & 63]);
                    // Put subfilter info in for all used subfilters
                    for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
                        if (usingSubFilterBitfield & (1 << j)) {
                            buffer.push(base64IntToCharCode[instrument.noteSubFilters[j + 1]!.controlPointCount]);
                            for (let k: number = 0; k < instrument.noteSubFilters[j + 1]!.controlPointCount; k++) {
                                const point: FilterControlPoint = instrument.noteSubFilters[j + 1]!.controlPoints[k];
                                buffer.push(base64IntToCharCode[point.type], base64IntToCharCode[Math.round(point.freq)], base64IntToCharCode[Math.round(point.gain)]);
                            }
                        }
                    }
                }

                //in theepbox, effects are stored in arbitary order. this allows it to have multiple of the same effect!

                buffer.push(SongTagCode.effects, base64IntToCharCode[instrument.effectCount]);
                for (let effectIndex = 0; effectIndex < instrument.effectCount; effectIndex++) {
                    if (instrument.effects[effectIndex] != null) buffer.push(base64IntToCharCode[instrument.effects[effectIndex]!.type & 63]);
                    else {
                        buffer.push(base64IntToCharCode[0]);
                        continue;
                    }

                    let effect: Effect = instrument.effects[effectIndex] as Effect;

                    if (effect.type == EffectType.eqFilter) {
                        buffer.push(base64IntToCharCode[+effect.eqFilterType]);
                        if (effect.eqFilterType) {
                            buffer.push(base64IntToCharCode[effect.eqFilterSimpleCut]);
                            buffer.push(base64IntToCharCode[effect.eqFilterSimplePeak]);
                        }
                        else {
                            if (effect.eqFilter == null) {
                                // Push null filter settings
                                buffer.push(base64IntToCharCode[0]);
                                console.log("Null post eq settings detected in toBase64String for channelIndex " + channelIndex + ", instrumentIndex " + i);
                            }
                            else {
                                buffer.push(base64IntToCharCode[effect.eqFilter.controlPointCount]);
                                for (let j: number = 0; j < effect.eqFilter.controlPointCount; j++) {
                                    const point: FilterControlPoint = effect.eqFilter.controlPoints[j];
                                    buffer.push(base64IntToCharCode[point.type], base64IntToCharCode[Math.round(point.freq)], base64IntToCharCode[Math.round(point.gain)]);
                                }
                            }

                            // Push subfilters as well. Skip Index 0, is a copy of the base filter.
                            let usingSubFilterBitfield: number = 0;
                            for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
                                usingSubFilterBitfield |= (+(effect.eqSubFilters[j + 1] != null) << j);
                            }
                            // Put subfilter usage into 2 chars (12 bits)
                            buffer.push(base64IntToCharCode[usingSubFilterBitfield >> 6], base64IntToCharCode[usingSubFilterBitfield & 63]);
                            // Put subfilter info in for all used subfilters
                            for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
                                if (usingSubFilterBitfield & (1 << j)) {
                                    buffer.push(base64IntToCharCode[effect.eqSubFilters[j + 1]!.controlPointCount]);
                                    for (let k: number = 0; k < effect.eqSubFilters[j + 1]!.controlPointCount; k++) {
                                        const point: FilterControlPoint = effect.eqSubFilters[j + 1]!.controlPoints[k];
                                        buffer.push(base64IntToCharCode[point.type], base64IntToCharCode[Math.round(point.freq)], base64IntToCharCode[Math.round(point.gain)]);
                                    }
                                }
                            }
                        }
                    }
                    else if (effect.type == EffectType.distortion) {
                        buffer.push(base64IntToCharCode[effect.distortion]);
                        // Aliasing is tied into distortion for now
                        buffer.push(base64IntToCharCode[+instrument.aliases]);
                    }
                    else if (effect.type == EffectType.bitcrusher) {
                        buffer.push(base64IntToCharCode[effect.bitcrusherFreq], base64IntToCharCode[effect.bitcrusherQuantization]);
                    }
                    else if (effect.type == EffectType.gain) {
                        buffer.push(base64IntToCharCode[effect.gain >> 6], base64IntToCharCode[effect.gain & 0x3f]);
                    }
                    else if (effect.type == EffectType.panning) {
                        buffer.push(base64IntToCharCode[effect.pan >> 6], base64IntToCharCode[effect.pan & 0x3f]);
                        buffer.push(base64IntToCharCode[effect.panDelay]);
                        buffer.push(base64IntToCharCode[effect.panMode]);
                    }
                    else if (effect.type == EffectType.flanger) {
                        buffer.push(base64IntToCharCode[effect.flanger]);
                        buffer.push(base64IntToCharCode[effect.flangerSpeed]);
                        buffer.push(base64IntToCharCode[effect.flangerDepth]);
                        buffer.push(base64IntToCharCode[effect.flangerFeedback]);
                    }
                    else if (effect.type == EffectType.chorus) {
                        buffer.push(base64IntToCharCode[effect.chorus]);
                    }
                    else if (effect.type == EffectType.echo) { // echo ping pong probably didnt need to have such a massive range. oh well!
                        buffer.push(base64IntToCharCode[effect.echoSustain], base64IntToCharCode[effect.echoDelay], base64IntToCharCode[effect.echoPingPong >> 6], base64IntToCharCode[effect.echoPingPong & 0x3f]);
                    }
                    else if (effect.type == EffectType.reverb) {
                        buffer.push(base64IntToCharCode[effect.reverb]);
                    }
                    else if (effect.type == EffectType.granular) {
                        buffer.push(base64IntToCharCode[effect.granular]);
                        buffer.push(base64IntToCharCode[effect.grainSize]);
                        buffer.push(base64IntToCharCode[effect.grainAmounts]);
                        buffer.push(base64IntToCharCode[effect.grainRange]);
                    }
                    else if (effect.type == EffectType.ringModulation) {
                        buffer.push(base64IntToCharCode[effect.ringModulation]);
                        buffer.push(base64IntToCharCode[effect.ringModulationHz]);
                        buffer.push(base64IntToCharCode[effect.ringModWaveformIndex]);
                        buffer.push(base64IntToCharCode[effect.ringModPulseWidth]);
                        buffer.push(base64IntToCharCode[(effect.ringModHzOffset - Config.rmHzOffsetMin) >> 6], base64IntToCharCode[(effect.ringModHzOffset - Config.rmHzOffsetMin) & 0x3F]);
                    }
                }
                // this is a six bit bitfield
                buffer.push(base64IntToCharCode[instrument.mdeffects & 63]);
                if (effectsIncludeTransition(instrument.mdeffects)) {
                    buffer.push(base64IntToCharCode[instrument.transition]);
                }
                if (effectsIncludeChord(instrument.mdeffects)) {
                    buffer.push(base64IntToCharCode[instrument.chord]);
                    // Custom arpeggio speed... only if the instrument arpeggiates.
                    if (instrument.chord == Config.chords.dictionary["arpeggio"].index) {
                        buffer.push(base64IntToCharCode[instrument.arpeggioSpeed]);
                        buffer.push(base64IntToCharCode[+instrument.fastTwoNoteArp]); // Two note arp setting piggybacks on this
                    }
                    if (instrument.chord == Config.chords.dictionary["monophonic"].index) {
                        buffer.push(base64IntToCharCode[instrument.monoChordTone]); //which note is selected
                    }
                }
                if (effectsIncludePitchShift(instrument.mdeffects)) {
                    buffer.push(base64IntToCharCode[instrument.pitchShift]);
                }
                if (effectsIncludeDetune(instrument.mdeffects)) {
                    buffer.push(base64IntToCharCode[(instrument.detune - Config.detuneMin) >> 6], base64IntToCharCode[(instrument.detune - Config.detuneMin) & 0x3F]);
                }
                if (effectsIncludeVibrato(instrument.mdeffects)) {
                    buffer.push(base64IntToCharCode[instrument.vibrato]);
                    // Custom vibrato settings
                    if (instrument.vibrato == Config.vibratos.length) {
                        buffer.push(base64IntToCharCode[Math.round(instrument.vibratoDepth * 25)]);
                        buffer.push(base64IntToCharCode[instrument.vibratoSpeed]);
                        buffer.push(base64IntToCharCode[Math.round(instrument.vibratoDelay)]);
                        buffer.push(base64IntToCharCode[instrument.vibratoType]);
                    }
                }
                // if (effectsIncludeNoteRange(instrument.effects)) {
                //     buffer.push(base64IntToCharCode[instrument.noteRange]);
                // }

                if (instrument.type != InstrumentType.drumset) {
                    buffer.push(SongTagCode.fadeInOut, base64IntToCharCode[instrument.fadeIn], base64IntToCharCode[instrument.fadeOut]);
                    // Transition info follows transition song tag
                    buffer.push(base64IntToCharCode[+instrument.clicklessTransition]);
                }

                if (instrument.type == InstrumentType.harmonics || instrument.type == InstrumentType.pickedString) {
                    buffer.push(SongTagCode.harmonics);
                    const harmonicsBits: BitFieldWriter = new BitFieldWriter();
                    for (let i: number = 0; i < Config.harmonicsControlPoints; i++) {
                        harmonicsBits.write(Config.harmonicsControlPointBits, instrument.harmonicsWave.harmonics[i]);
                    }
                    harmonicsBits.encodeBase64(buffer);
                }

                if (instrument.type == InstrumentType.chip) {
                    if (instrument.chipWave > 186) {
                        buffer.push(119, base64IntToCharCode[instrument.chipWave - 186]);
                        buffer.push(base64IntToCharCode[3]);
                    }
                    else if (instrument.chipWave > 124) {
                        buffer.push(119, base64IntToCharCode[instrument.chipWave - 124]);
                        buffer.push(base64IntToCharCode[2]);
                    }
                    else if (instrument.chipWave > 62) {
                        buffer.push(119, base64IntToCharCode[instrument.chipWave - 62]);
                        buffer.push(base64IntToCharCode[1]);
                    }
                    else {
                        buffer.push(119, base64IntToCharCode[instrument.chipWave]);
                        buffer.push(base64IntToCharCode[0]);
                    }
                    buffer.push(104, base64IntToCharCode[instrument.unison]);
                    if (instrument.unison == Config.unisons.length) encodeUnisonSettings(buffer, instrument.unisonVoices, instrument.unisonSpread, instrument.unisonOffset, instrument.unisonExpression, instrument.unisonSign);

                    // Repurposed for chip wave loop controls.
                    buffer.push(SongTagCode.loopControls);
                    // The encoding here is as follows:
                    // 0b11111_1
                    //         ^-- isUsingAdvancedLoopControls
                    //   ^^^^^---- chipWaveLoopMode
                    // This essentially allocates 32 different loop modes,
                    // which should be plenty.
                    const encodedLoopMode: number = (
                        (clamp(0, 31 + 1, instrument.chipWaveLoopMode) << 1)
                        | (instrument.isUsingAdvancedLoopControls ? 1 : 0)
                    );
                    buffer.push(base64IntToCharCode[encodedLoopMode]);
                    // The same encoding above is used here, but with the release mode
                    // (which isn't implemented currently), and the backwards toggle.
                    const encodedReleaseMode: number = (
                        (clamp(0, 31 + 1, 0) << 1)
                        | (instrument.chipWavePlayBackwards ? 1 : 0)
                    );
                    buffer.push(base64IntToCharCode[encodedReleaseMode]);
                    encode32BitNumber(buffer, instrument.chipWaveLoopStart);
                    encode32BitNumber(buffer, instrument.chipWaveLoopEnd);
                    encode32BitNumber(buffer, instrument.chipWaveStartOffset);

                } else if (instrument.type == InstrumentType.fm || instrument.type == InstrumentType.fm6op) {
                    if (instrument.type == InstrumentType.fm) {
                        buffer.push(SongTagCode.algorithm, base64IntToCharCode[instrument.algorithm]);
                        buffer.push(SongTagCode.feedbackType, base64IntToCharCode[instrument.feedbackType]);
                    } else {
                        buffer.push(SongTagCode.algorithm, base64IntToCharCode[instrument.algorithm6Op]);
                        if (instrument.algorithm6Op == 0) {
                            buffer.push(SongTagCode.chord, base64IntToCharCode[instrument.customAlgorithm.carrierCount]);
                            buffer.push(SongTagCode.effects);
                            for (let o: number = 0; o < instrument.customAlgorithm.modulatedBy.length; o++) {
                                for (let j: number = 0; j < instrument.customAlgorithm.modulatedBy[o].length; j++) {
                                    buffer.push(base64IntToCharCode[instrument.customAlgorithm.modulatedBy[o][j]]);
                                }
                                buffer.push(SongTagCode.operatorWaves);
                            }
                            buffer.push(SongTagCode.effects);
                        }
                        buffer.push(SongTagCode.feedbackType, base64IntToCharCode[instrument.feedbackType6Op]);
                        if (instrument.feedbackType6Op == 0) {
                            buffer.push(SongTagCode.effects);
                            for (let o: number = 0; o < instrument.customFeedbackType.indices.length; o++) {
                                for (let j: number = 0; j < instrument.customFeedbackType.indices[o].length; j++) {
                                    buffer.push(base64IntToCharCode[instrument.customFeedbackType.indices[o][j]]);
                                }
                                buffer.push(SongTagCode.operatorWaves);
                            }
                            buffer.push(SongTagCode.effects);
                        }
                    }
                    buffer.push(SongTagCode.feedbackAmplitude, base64IntToCharCode[instrument.feedbackAmplitude]);

                    buffer.push(SongTagCode.operatorFrequencies);
                    for (let o: number = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                        buffer.push(base64IntToCharCode[instrument.operators[o].frequency]);
                    }
                    buffer.push(SongTagCode.operatorAmplitudes);
                    for (let o: number = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                        buffer.push(base64IntToCharCode[instrument.operators[o].amplitude]);
                    }
                    buffer.push(SongTagCode.operatorWaves);
                    for (let o: number = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                        buffer.push(base64IntToCharCode[instrument.operators[o].waveform]);
                        // Push pulse width if that type is used
                        if (instrument.operators[o].waveform == 2) {
                            buffer.push(base64IntToCharCode[instrument.operators[o].pulseWidth]);
                        }
                    }
                } else if (instrument.type == InstrumentType.customChipWave) {
                    if (instrument.chipWave > 186) {
                        buffer.push(119, base64IntToCharCode[instrument.chipWave - 186]);
                        buffer.push(base64IntToCharCode[3]);
                    }
                    else if (instrument.chipWave > 124) {
                        buffer.push(119, base64IntToCharCode[instrument.chipWave - 124]);
                        buffer.push(base64IntToCharCode[2]);
                    }
                    else if (instrument.chipWave > 62) {
                        buffer.push(119, base64IntToCharCode[instrument.chipWave - 62]);
                        buffer.push(base64IntToCharCode[1]);
                    }
                    else {
                        buffer.push(119, base64IntToCharCode[instrument.chipWave]);
                        buffer.push(base64IntToCharCode[0]);
                    }
                    buffer.push(104, base64IntToCharCode[instrument.unison]);
                    if (instrument.unison == Config.unisons.length) encodeUnisonSettings(buffer, instrument.unisonVoices, instrument.unisonSpread, instrument.unisonOffset, instrument.unisonExpression, instrument.unisonSign);
                    buffer.push(SongTagCode.customChipWave);
                    // Push custom wave values
                    for (let j: number = 0; j < 64; j++) {
                        buffer.push(base64IntToCharCode[(instrument.customChipWave[j] + 24) as number]);
                    }
                } else if (instrument.type == InstrumentType.noise) {
                    buffer.push(SongTagCode.wave, base64IntToCharCode[instrument.chipNoise]);
                    buffer.push(SongTagCode.unison, base64IntToCharCode[instrument.unison]);
                    if (instrument.unison == Config.unisons.length) encodeUnisonSettings(buffer, instrument.unisonVoices, instrument.unisonSpread, instrument.unisonOffset, instrument.unisonExpression, instrument.unisonSign);
                } else if (instrument.type == InstrumentType.spectrum) {
                    buffer.push(SongTagCode.spectrum);
                    const spectrumBits: BitFieldWriter = new BitFieldWriter();
                    for (let i: number = 0; i < Config.spectrumControlPoints; i++) {
                        spectrumBits.write(Config.spectrumControlPointBits, instrument.spectrumWave.spectrum[i]);
                    }
                    spectrumBits.encodeBase64(buffer);
                    buffer.push(SongTagCode.unison, base64IntToCharCode[instrument.unison]);
                    if (instrument.unison == Config.unisons.length) encodeUnisonSettings(buffer, instrument.unisonVoices, instrument.unisonSpread, instrument.unisonOffset, instrument.unisonExpression, instrument.unisonSign);
                } else if (instrument.type == InstrumentType.drumset) {
                    buffer.push(SongTagCode.drumsetEnvelopes);
                    for (let j: number = 0; j < Config.drumCount; j++) {
                        buffer.push(base64IntToCharCode[instrument.drumsetEnvelopes[j]]);
                    }

                    buffer.push(SongTagCode.spectrum);
                    const spectrumBits: BitFieldWriter = new BitFieldWriter();
                    for (let j: number = 0; j < Config.drumCount; j++) {
                        for (let i: number = 0; i < Config.spectrumControlPoints; i++) {
                            spectrumBits.write(Config.spectrumControlPointBits, instrument.drumsetSpectrumWaves[j].spectrum[i]);
                        }
                    }
                    spectrumBits.encodeBase64(buffer);
                    buffer.push(SongTagCode.unison, base64IntToCharCode[instrument.unison]);
                    if (instrument.unison == Config.unisons.length) encodeUnisonSettings(buffer, instrument.unisonVoices, instrument.unisonSpread, instrument.unisonOffset, instrument.unisonExpression, instrument.unisonSign);
                } else if (instrument.type == InstrumentType.harmonics) {
                    buffer.push(SongTagCode.unison, base64IntToCharCode[instrument.unison]);
                    if (instrument.unison == Config.unisons.length) encodeUnisonSettings(buffer, instrument.unisonVoices, instrument.unisonSpread, instrument.unisonOffset, instrument.unisonExpression, instrument.unisonSign);
                } else if (instrument.type == InstrumentType.pwm) {
                    buffer.push(SongTagCode.pulseWidth, base64IntToCharCode[instrument.pulseWidth]);
                    buffer.push(base64IntToCharCode[instrument.decimalOffset >> 6], base64IntToCharCode[instrument.decimalOffset & 0x3f]);
                    buffer.push(SongTagCode.unison, base64IntToCharCode[instrument.unison]);
                    if (instrument.unison == Config.unisons.length) encodeUnisonSettings(buffer, instrument.unisonVoices, instrument.unisonSpread, instrument.unisonOffset, instrument.unisonExpression, instrument.unisonSign);
                } else if (instrument.type == InstrumentType.supersaw) {
                    buffer.push(SongTagCode.supersaw, base64IntToCharCode[instrument.supersawDynamism], base64IntToCharCode[instrument.supersawSpread], base64IntToCharCode[instrument.supersawShape]);
                    buffer.push(SongTagCode.pulseWidth, base64IntToCharCode[instrument.pulseWidth]);
                    buffer.push(base64IntToCharCode[instrument.decimalOffset >> 6], base64IntToCharCode[instrument.decimalOffset & 0x3f]);
                } else if (instrument.type == InstrumentType.pickedString) {
                    if (Config.stringSustainRange > 0x20 || SustainType.length > 2) {
                        throw new Error("Not enough bits to represent sustain value and type in same base64 character.");
                    }
                    buffer.push(SongTagCode.unison, base64IntToCharCode[instrument.unison]);
                    if (instrument.unison == Config.unisons.length) encodeUnisonSettings(buffer, instrument.unisonVoices, instrument.unisonSpread, instrument.unisonOffset, instrument.unisonExpression, instrument.unisonSign);
                    buffer.push(SongTagCode.stringSustain, base64IntToCharCode[instrument.stringSustain | (instrument.stringSustainType << 5)]);
                } else if (instrument.type == InstrumentType.mod) {
                    // Handled down below. Could be moved, but meh.
                } else {
                    throw new Error("Unknown instrument type.");
                }

                buffer.push(SongTagCode.envelopes, base64IntToCharCode[instrument.envelopeCount]);
                // Added in JB v6: Options for envelopes come next.
                buffer.push(base64IntToCharCode[instrument.envelopeSpeed]);
                for (let envelopeIndex: number = 0; envelopeIndex < instrument.envelopeCount; envelopeIndex++) {
                    buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].target]);
                    if (Config.instrumentAutomationTargets[instrument.envelopes[envelopeIndex].target].maxCount > 1) {
                        buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].index]);
                    }
                    buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].envelope]);
                    //run pitch envelope handling
                    if (Config.newEnvelopes[instrument.envelopes[envelopeIndex].envelope].name == "pitch") {
                        if (!instrument.isNoiseInstrument) {
                            buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].pitchEnvelopeStart >> 6], base64IntToCharCode[instrument.envelopes[envelopeIndex].pitchEnvelopeStart & 0x3f]);
                            buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].pitchEnvelopeEnd >> 6], base64IntToCharCode[instrument.envelopes[envelopeIndex].pitchEnvelopeEnd & 0x3f]);
                        } else {
                            buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].pitchEnvelopeStart]);
                            buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].pitchEnvelopeEnd]);
                        }
                    //random
                    } else if (Config.newEnvelopes[instrument.envelopes[envelopeIndex].envelope].name == "random") {
                        buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].steps]);
                        buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].seed]);
                        buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].waveform]);
                    //lfo
                    } else if (Config.newEnvelopes[instrument.envelopes[envelopeIndex].envelope].name == "lfo") {
                        buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].waveform]);
                        if (instrument.envelopes[envelopeIndex].waveform == LFOEnvelopeTypes.steppedSaw || instrument.envelopes[envelopeIndex].waveform == LFOEnvelopeTypes.steppedTri) {
                            buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].steps]);
                        }
                    }
                    //inverse
                    let checkboxValues: number = +instrument.envelopes[envelopeIndex].discrete;
                    checkboxValues = checkboxValues << 1;
                    checkboxValues += +instrument.envelopes[envelopeIndex].inverse;
                    buffer.push(base64IntToCharCode[checkboxValues] ? base64IntToCharCode[checkboxValues] : base64IntToCharCode[0]);
                    //midbox envelope port
                    if (Config.newEnvelopes[instrument.envelopes[envelopeIndex].envelope].name != "pitch" && Config.newEnvelopes[instrument.envelopes[envelopeIndex].envelope].name != "note size" && Config.newEnvelopes[instrument.envelopes[envelopeIndex].envelope].name != "punch" && Config.newEnvelopes[instrument.envelopes[envelopeIndex].envelope].name != "none") {
                        buffer.push(base64IntToCharCode[Config.perEnvelopeSpeedToIndices[instrument.envelopes[envelopeIndex].perEnvelopeSpeed]]);
                    }
                    buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].perEnvelopeLowerBound * 10]);
                    buffer.push(base64IntToCharCode[instrument.envelopes[envelopeIndex].perEnvelopeUpperBound * 10]);
                }
            }
        }

        buffer.push(SongTagCode.bars);
        bits = new BitFieldWriter();
        let neededBits: number = 0;
        while ((1 << neededBits) < this.patternsPerChannel + 1) neededBits++;
        for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) for (let i: number = 0; i < this.barCount; i++) {
            bits.write(neededBits, this.channels[channelIndex].bars[i]);
        }
        bits.encodeBase64(buffer);

        buffer.push(SongTagCode.patterns);
        bits = new BitFieldWriter();
        const shapeBits: BitFieldWriter = new BitFieldWriter();
        const bitsPerNoteSize: number = Song.getNeededBits(Config.noteSizeMax);
        for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
            const channel: Channel = this.channels[channelIndex];
            const maxInstrumentsPerPattern: number = this.getMaxInstrumentsPerPattern(channelIndex);
            const isNoiseChannel: boolean = this.getChannelIsNoise(channelIndex);
            const isModChannel: boolean = this.getChannelIsMod(channelIndex);
            const neededInstrumentCountBits: number = Song.getNeededBits(maxInstrumentsPerPattern - Config.instrumentCountMin);
            const neededInstrumentIndexBits: number = Song.getNeededBits(channel.instruments.length - 1);

            // Some info about modulator settings immediately follows in mod channels.
            if (isModChannel) {
                const neededModInstrumentIndexBits: number = Song.getNeededBits(this.getMaxInstrumentsPerChannel() + 2);
                for (let instrumentIndex: number = 0; instrumentIndex < channel.instruments.length; instrumentIndex++) {

                    let instrument: Instrument = this.channels[channelIndex].instruments[instrumentIndex];

                    for (let mod: number = 0; mod < Config.modCount; mod++) {
                        const modChannels: number[] = instrument.modChannels[mod];
                        const modInstruments: number[] = instrument.modInstruments[mod];
                        const modSetting: number = instrument.modulators[mod];
                        const modFilter: number = instrument.modFilterTypes[mod];
                        const modEnvelope: number = instrument.modEnvelopeNumbers[mod];

                        // Still using legacy "mod status" format, but doing it manually as it's only used in the URL now.
                        // 0 - For pitch/noise
                        // 1 - (used to be For noise, not needed)
                        // 2 - For song
                        // 3 - None

                        let status: number = Config.modulators[modSetting].forSong ? 2 : 0;
                        if (modSetting == Config.modulators.dictionary["none"].index)
                            status = 3;

                        bits.write(2, status);

                        // Channel/Instrument is only used if the status isn't "song" or "none".
                        if (status == 0 || status == 1) {
                            bits.write(8, modChannels.length);
                            for (let i: number = 0; i < modChannels.length; i++) bits.write(8, modChannels[i]);
                            bits.write(8, modInstruments.length);
                            for (let i: number = 0; i < modInstruments.length; i++) bits.write(neededModInstrumentIndexBits, modInstruments[i]);
                        }

                        // Only used if setting isn't "none".
                        if (status != 3) {
                            bits.write(6, modSetting);
                        }

                        // Write mod filter info, only if this is a filter mod
                        if (Config.modulators[instrument.modulators[mod]].name == "post eq" || Config.modulators[instrument.modulators[mod]].name == "pre eq" || Config.modulators[instrument.modulators[mod]].name == "song eq") {
                            bits.write(6, modFilter);
                        }

                        //write envelope info only if needed
                        if (Config.modulators[instrument.modulators[mod]].name == "individual envelope speed" ||
                            Config.modulators[instrument.modulators[mod]].name == "reset envelope" ||
                            Config.modulators[instrument.modulators[mod]].name == "individual envelope lower bound" ||
                            Config.modulators[instrument.modulators[mod]].name == "individual envelope upper bound"
                        ) {
                            bits.write(6, modEnvelope);
                        }
                    }
                }
            }
            const octaveOffset: number = (isNoiseChannel || isModChannel) ? 0 : channel.octave * Config.pitchesPerOctave;
            let lastPitch: number = (isNoiseChannel ? 4 : octaveOffset);
            const recentPitches: number[] = isModChannel ? [0, 1, 2, 3, 4, 5] : (isNoiseChannel ? [4, 6, 7, 2, 3, 8, 0, 10] : [0, 7, 12, 19, 24, -5, -12]);
            const recentShapes: string[] = [];
            for (let i: number = 0; i < recentPitches.length; i++) {
                recentPitches[i] += octaveOffset;
            }
            for (const pattern of channel.patterns) {
                if (this.patternInstruments) {
                    const instrumentCount: number = validateRange(Config.instrumentCountMin, maxInstrumentsPerPattern, pattern.instruments.length);
                    bits.write(neededInstrumentCountBits, instrumentCount - Config.instrumentCountMin);
                    for (let i: number = 0; i < instrumentCount; i++) {
                        bits.write(neededInstrumentIndexBits, pattern.instruments[i]);
                    }
                }

                if (pattern.notes.length > 0) {
                    bits.write(1, 1);

                    let curPart: number = 0;
                    for (const note of pattern.notes) {

                        // For mod channels, a negative offset may be necessary.
                        if (note.start < curPart && isModChannel) {
                            bits.write(2, 0); // rest, then...
                            bits.write(1, 1); // negative offset
                            bits.writePartDuration(curPart - note.start);
                        }

                        if (note.start > curPart) {
                            bits.write(2, 0); // rest
                            if (isModChannel) bits.write(1, 0); // positive offset, only needed for mod channels
                            bits.writePartDuration(note.start - curPart);
                        }

                        shapeBits.clear();

                        // Old format was:
                        // 0: 1 pitch, 10: 2 pitches, 110: 3 pitches, 111: 4 pitches
                        // New format is:
                        //      0: 1 pitch
                        // 1[XXX]: 3 bits of binary signifying 2+ pitches
                        if (note.pitches.length == 1) {
                            shapeBits.write(1, 0);
                        } else {
                            shapeBits.write(1, 1);
                            shapeBits.write(3, note.pitches.length - 2);
                        }

                        // chip wave start offset is similar but with more bits: 31, to be exact. this is a lot, (and a TODO is probably to make it more efficient) but it is necessary for my purposes
                        if (note.chipWaveStartOffset == 0) {
                            shapeBits.write(1, 0);
                        } else {
                            shapeBits.write(1, 1);
                            shapeBits.write(31, note.chipWaveStartOffset);
                        }

                        shapeBits.writePinCount(note.pins.length - 1);

                        if (!isModChannel) {
                            shapeBits.write(bitsPerNoteSize, note.pins[0].size); // volume
                        }
                        else {
                            shapeBits.write(11, note.pins[0].size); // Modulator value. 11 bits for now = 2048 max mod value?
                        }

                        let shapePart: number = 0;
                        let startPitch: number = note.pitches[0];
                        let currentPitch: number = startPitch;
                        const pitchBends: number[] = [];
                        for (let i: number = 1; i < note.pins.length; i++) {
                            const pin: NotePin = note.pins[i];
                            const nextPitch: number = startPitch + pin.interval;
                            if (currentPitch != nextPitch) {
                                shapeBits.write(1, 1);
                                pitchBends.push(nextPitch);
                                currentPitch = nextPitch;
                            } else {
                                shapeBits.write(1, 0);
                            }
                            shapeBits.writePartDuration(pin.time - shapePart);
                            shapePart = pin.time;
                            if (!isModChannel) {
                                shapeBits.write(bitsPerNoteSize, pin.size);
                            } else {
                                shapeBits.write(11, pin.size);
                            }
                        }

                        const shapeString: string = String.fromCharCode.apply(null, shapeBits.encodeBase64([]));
                        const shapeIndex: number = recentShapes.indexOf(shapeString);
                        if (shapeIndex == -1) {
                            bits.write(2, 1); // new shape
                            bits.concat(shapeBits);
                        } else {
                            bits.write(1, 1); // old shape
                            bits.writeLongTail(0, 0, shapeIndex);
                            recentShapes.splice(shapeIndex, 1);
                        }
                        recentShapes.unshift(shapeString);
                        if (recentShapes.length > 10) recentShapes.pop();

                        const allPitches: number[] = note.pitches.concat(pitchBends);
                        for (let i: number = 0; i < allPitches.length; i++) {
                            const pitch: number = allPitches[i];
                            const pitchIndex: number = recentPitches.indexOf(pitch);
                            if (pitchIndex == -1) {
                                let interval: number = 0;
                                let pitchIter: number = lastPitch;
                                if (pitchIter < pitch) {
                                    while (pitchIter != pitch) {
                                        pitchIter++;
                                        if (recentPitches.indexOf(pitchIter) == -1) interval++;
                                    }
                                } else {
                                    while (pitchIter != pitch) {
                                        pitchIter--;
                                        if (recentPitches.indexOf(pitchIter) == -1) interval--;
                                    }
                                }
                                bits.write(1, 0);
                                bits.writePitchInterval(interval);
                            } else {
                                bits.write(1, 1);
                                bits.write(4, pitchIndex);
                                recentPitches.splice(pitchIndex, 1);
                            }
                            recentPitches.unshift(pitch);
                            if (recentPitches.length > 16) recentPitches.pop();

                            if (i == note.pitches.length - 1) {
                                lastPitch = note.pitches[0];
                            } else {
                                lastPitch = pitch;
                            }
                        }

                        if (note.start == 0) {
                            bits.write(1, note.continuesLastPattern ? 1 : 0);
                        }

                        curPart = note.end;
                    }

                    if (curPart < this.beatsPerBar * Config.partsPerBeat + (+isModChannel)) {
                        bits.write(2, 0); // rest
                        if (isModChannel) bits.write(1, 0); // positive offset
                        bits.writePartDuration(this.beatsPerBar * Config.partsPerBeat + (+isModChannel) - curPart);
                    }
                } else {
                    bits.write(1, 0);
                }
            }
        }
        let stringLength: number = bits.lengthBase64();
        let digits: number[] = [];
        while (stringLength > 0) {
            digits.unshift(base64IntToCharCode[stringLength & 0x3f]);
            stringLength = stringLength >> 6;
        }
        buffer.push(base64IntToCharCode[digits.length]);
        Array.prototype.push.apply(buffer, digits); // append digits to buffer.
        bits.encodeBase64(buffer);

        const maxApplyArgs: number = 64000;
        let customSamplesStr = "";
        if (EditorConfig.customSamples != undefined && EditorConfig.customSamples.length > 0) {
            customSamplesStr = "|" + EditorConfig.customSamples.join("|")

        }
        //samplemark
        if (buffer.length < maxApplyArgs) {
            // Note: Function.apply may break for long argument lists.
            return String.fromCharCode.apply(null, buffer) + customSamplesStr;
            //samplemark
        } else {
            let result: string = "";
            for (let i: number = 0; i < buffer.length; i += maxApplyArgs) {
                result += String.fromCharCode.apply(null, buffer.slice(i, i + maxApplyArgs));
            }
            return result + customSamplesStr;
            //samplemark
        }
    }

    private static _envelopeFromLegacyIndex(legacyIndex: number): Envelope {
        // I swapped the order of "custom"/"steady", now "none"/"note size".
        if (legacyIndex == 0) legacyIndex = 1; else if (legacyIndex == 1) legacyIndex = 0;
        return Config.envelopes[clamp(0, Config.envelopes.length, legacyIndex)];
    }

    public fromBase64String(compressed: string, jsonFormat: string = "auto"): void {
        if (compressed == null || compressed == "") {
            Song._clearSamples();

            this.initToDefault(true);
            return;
        }
        let charIndex: number = 0;
        // skip whitespace.
        while (compressed.charCodeAt(charIndex) <= CharCode.SPACE) charIndex++;
        // skip hash mark.
        if (compressed.charCodeAt(charIndex) == CharCode.HASH) charIndex++;
        // if it starts with curly brace, treat it as JSON.
        if (compressed.charCodeAt(charIndex) == CharCode.LEFT_CURLY_BRACE) {
            this.fromJsonObject(JSON.parse(charIndex == 0 ? compressed : compressed.substring(charIndex)), jsonFormat);
            return;
        }

        const variantTest: number = compressed.charCodeAt(charIndex);
        //I cleaned up these boolean setters with an initial value. Idk why this wasn't done earlier...
        let fromBeepBox: boolean = false;
        let fromJummBox: boolean = false;
        let fromGoldBox: boolean = false;
        let fromUltraBox: boolean = false;
        let fromSlarmoosBox: boolean = false;
        let fromTheepBox: boolean = false;
        // let fromMidbox: boolean;
        // let fromDogebox2: boolean;
        // let fromAbyssBox: boolean;

        // Detect variant here. If version doesn't match known variant, assume it is a vanilla string which does not report variant.
        if (variantTest == 0x74){ //"t"
            fromTheepBox = true
            fromSlarmoosBox = true
            charIndex++;
        } else if (variantTest == 0x6A) { //"j"
            fromJummBox = true;
            charIndex++;
        } else if (variantTest == 0x67) { //"g"
            fromGoldBox = true;
            charIndex++;
        } else if (variantTest == 0x75) { //"u"
            fromUltraBox = true;
            charIndex++;
        } else if (variantTest == 0x64) { //"d"
            fromJummBox = true;
            // to-do: add explicit dogebox2 support
            //fromDogeBox2 = true;
            charIndex++;
        } else if (variantTest == 0x61) { //"a" Abyssbox does urls the same as ultrabox //not quite anymore, but oh well
            fromUltraBox = true;
            charIndex++;
        } else if(variantTest == 0x73){ //"s"
            fromSlarmoosBox = true
            charIndex++;
        } else {
            fromBeepBox = true;
        }

        const version: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
        if (fromBeepBox && (version == -1 || version > Song._latestBeepboxVersion || version < Song._oldestBeepboxVersion)) return;
        if (fromJummBox && (version == -1 || version > Song._latestJummBoxVersion || version < Song._oldestJummBoxVersion)) return;
        if (fromGoldBox && (version == -1 || version > Song._latestGoldBoxVersion || version < Song._oldestGoldBoxVersion)) return;
        if (fromUltraBox && (version == -1 || version > Song._latestUltraBoxVersion || version < Song._oldestUltraBoxVersion)) return;
        if ((fromSlarmoosBox || fromTheepBox) && (version == -1 || version > Song._latestSlarmoosBoxVersion || version < Song._oldestSlarmoosBoxVersion)) return;
        const beforeTwo: boolean = version < 2;
        const beforeThree: boolean = version < 3;
        const beforeFour: boolean = version < 4;
        const beforeFive: boolean = version < 5;
        const beforeSix: boolean = version < 6;
        const beforeSeven: boolean = version < 7;
        const beforeEight: boolean = version < 8;
        const beforeNine: boolean = version < 9;
        this.initToDefault((fromBeepBox && beforeNine) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox)));
        const forceSimpleFilter: boolean = (fromBeepBox && beforeNine || fromJummBox && beforeFive);

        let willLoadLegacySamplesForOldSongs: boolean = false;

        if (fromSlarmoosBox || fromUltraBox || fromGoldBox) {
            compressed = compressed.replaceAll("%7C", "|")
            var compressed_array = compressed.split("|");
            compressed = compressed_array.shift()!;
            if (EditorConfig.customSamples == null || EditorConfig.customSamples.join(", ") != compressed_array.join(", ")) {

                Song._restoreChipWaveListToDefault();

                let willLoadLegacySamples = false;
                let willLoadNintariboxSamples = false;
                let willLoadMarioPaintboxSamples = false;
                const customSampleUrls = [];
                const customSamplePresets: Preset[] = [];
                sampleLoadingState.statusTable = {};
                sampleLoadingState.urlTable = {};
                sampleLoadingState.totalSamples = 0;
                sampleLoadingState.samplesLoaded = 0;
                sampleLoadEvents.dispatchEvent(new SampleLoadedEvent(
                    sampleLoadingState.totalSamples,
                    sampleLoadingState.samplesLoaded
                ));
                for (const url of compressed_array) {
                    if (url.toLowerCase() === "legacysamples") {
                        if (!willLoadLegacySamples) {
                            willLoadLegacySamples = true;
                            customSampleUrls.push(url);
                            loadBuiltInSamples(0);
                        }
                    }
                    else if (url.toLowerCase() === "nintariboxsamples") {
                        if (!willLoadNintariboxSamples) {
                            willLoadNintariboxSamples = true;
                            customSampleUrls.push(url);
                            loadBuiltInSamples(1);
                        }
                    }
                    else if (url.toLowerCase() === "mariopaintboxsamples") {
                        if (!willLoadMarioPaintboxSamples) {
                            willLoadMarioPaintboxSamples = true;
                            customSampleUrls.push(url);
                            loadBuiltInSamples(2);
                        }
                    }

                    else {
                        // UB version 2 URLs and below will be using the old syntax, so we do need to parse it in that case.
                        // UB version 3 URLs should only have the new syntax, though, unless the user has edited the URL manually.
                        const parseOldSyntax: boolean = beforeThree;
                        const ok: boolean = Song._parseAndConfigureCustomSample(url, customSampleUrls, customSamplePresets, sampleLoadingState, parseOldSyntax);
                        if (!ok) {
                            continue;
                        }
                    }
                }
                if (customSampleUrls.length > 0) {
                    EditorConfig.customSamples = customSampleUrls;
                }
                if (customSamplePresets.length > 0) {
                    const customSamplePresetsMap: DictionaryArray<Preset> = toNameMap(customSamplePresets);
                    EditorConfig.presetCategories[EditorConfig.presetCategories.length] = {
                        name: "Custom Sample Presets",
                        presets: customSamplePresetsMap,
                        index: EditorConfig.presetCategories.length,
                    };
                    // EditorConfig.presetCategories.splice(1, 0, {
                    // name: "Custom Sample Presets",
                    // presets: customSamplePresets,
                    // index: EditorConfig.presetCategories.length,
                    // });
                }


            }
            //samplemark
        }

        if (beforeThree && fromBeepBox) {
            // Originally, the only instrument transition was "instant" and the only drum wave was "retro".
            for (const channel of this.channels) {
                channel.instruments[0].transition = Config.transitions.dictionary["interrupt"].index;
                channel.instruments[0].mdeffects |= 1 << MDEffectType.transition;
            }
            this.channels[3].instruments[0].chipNoise = 0;
        }

        let legacySettingsCache: LegacySettings[][] | null = null;
        if ((fromBeepBox && beforeNine) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
            // Unfortunately, old versions of BeepBox had a variety of different ways of saving
            // filter-and-envelope-related parameters in the URL, and none of them directly
            // correspond to the new way of saving these parameters. We can approximate the old
            // settings by collecting all the old settings for an instrument and passing them to
            // convertLegacySettings(), so I use this data structure to collect the settings
            // for each instrument if necessary.
            legacySettingsCache = [];
            for (let i: number = legacySettingsCache.length; i < this.getChannelCount(); i++) {
                legacySettingsCache[i] = [];
                for (let j: number = 0; j < Config.instrumentCountMin; j++) legacySettingsCache[i][j] = {};
            }
        }

        let legacyGlobalReverb: number = 0; // beforeNine reverb was song-global, record that reverb here and adapt it to instruments as needed.

        let instrumentChannelIterator: number = 0;
        let instrumentIndexIterator: number = -1;
        let command: number;
        let useSlowerArpSpeed: boolean = false;
        let useFastTwoNoteArp: boolean = false;
        while (charIndex < compressed.length) switch (command = compressed.charCodeAt(charIndex++)) {
            case SongTagCode.songTitle: {
                // Length of song name string
                var songNameLength = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                this.title = decodeURIComponent(compressed.substring(charIndex, charIndex + songNameLength));
                document.title = this.title + " - " + EditorConfig.versionDisplayName;

                charIndex += songNameLength;
            } break;
            case SongTagCode.channelCount: {
                this.pitchChannelCount = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                this.noiseChannelCount = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                if (fromBeepBox || (fromJummBox && beforeTwo)) {
                    // No mod channel support before jummbox v2
                    this.modChannelCount = 0;
                } else {
                    this.modChannelCount = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                }
                this.pitchChannelCount = validateRange(Config.pitchChannelCountMin, Config.pitchChannelCountMax, this.pitchChannelCount);
                this.noiseChannelCount = validateRange(Config.noiseChannelCountMin, Config.noiseChannelCountMax, this.noiseChannelCount);
                this.modChannelCount = validateRange(Config.modChannelCountMin, Config.modChannelCountMax, this.modChannelCount);

                for (let channelIndex = this.channels.length; channelIndex < this.getChannelCount(); channelIndex++) {
                    this.channels[channelIndex] = new Channel();
                }
                this.channels.length = this.getChannelCount();
                if ((fromBeepBox && beforeNine) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                    for (let i: number = legacySettingsCache!.length; i < this.getChannelCount(); i++) {
                        legacySettingsCache![i] = [];
                        for (let j: number = 0; j < Config.instrumentCountMin; j++) legacySettingsCache![i][j] = {};
                    }
                }
            } break;
            case SongTagCode.scale: {
                this.scale = clamp(0, Config.scales.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                // All the scales were jumbled around by Jummbox. Just convert to free.
                if (this.scale == Config.scales["dictionary"]["Custom"].index) {
                    for (var i = 1; i < Config.pitchesPerOctave; i++) {
                        this.scaleCustom[i] = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] == 1; // ineffiecent? yes, all we're going to do for now? hell yes
                    }
                }
                if (fromBeepBox) this.scale = 0;
            } break;
            case SongTagCode.key: {
                if (beforeSeven && fromBeepBox) {
                    this.key = clamp(0, Config.keys.length, 11 - base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    this.octave = 0;
                } else if (fromBeepBox || fromJummBox) {
                    this.key = clamp(0, Config.keys.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    this.octave = 0;
                } else if (fromGoldBox || (beforeThree && fromUltraBox)) {
                    // GoldBox (so far) didn't introduce any new keys, but old
                    // songs made with early versions of UltraBox share the
                    // same URL format, and those can have more keys. This
                    // shouldn't really result in anything other than 0-11 for
                    // the key and 0 for the octave for GoldBox songs.
                    const rawKeyIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    const [key, octave]: [number, number] = convertLegacyKeyToKeyAndOctave(rawKeyIndex);
                    this.key = key;
                    this.octave = octave;
                } else {
                    this.key = clamp(0, Config.keys.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    this.octave = clamp(Config.octaveMin, Config.octaveMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + Config.octaveMin);
                }
            } break;
            case SongTagCode.loopStart: {
                if (beforeFive && fromBeepBox) {
                    this.loopStart = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                } else {
                    this.loopStart = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                }
            } break;
            case SongTagCode.loopEnd: {
                if (beforeFive && fromBeepBox) {
                    this.loopLength = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                } else {
                    this.loopLength = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 1;
                }
            } break;
            case SongTagCode.tempo: {
                if (beforeFour && fromBeepBox) {
                    this.tempo = [95, 120, 151, 190][base64CharCodeToInt[compressed.charCodeAt(charIndex++)]];
                } else if (beforeSeven && fromBeepBox) {
                    this.tempo = [88, 95, 103, 111, 120, 130, 140, 151, 163, 176, 190, 206, 222, 240, 259][base64CharCodeToInt[compressed.charCodeAt(charIndex++)]];
                } else {
                    this.tempo = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) | (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                }
                this.tempo = clamp(Config.tempoMin, Config.tempoMax + 1, this.tempo);
            } break;
            case SongTagCode.reverb: {
                if (beforeNine && fromBeepBox) {
                    legacyGlobalReverb = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 12;
                    legacyGlobalReverb = clamp(0, Config.reverbRange, legacyGlobalReverb);
                } else if ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox)) {
                    legacyGlobalReverb = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    legacyGlobalReverb = clamp(0, Config.reverbRange, legacyGlobalReverb);
                } else {
                    // Do nothing, BeepBox v9+ do not support song-wide reverb - JummBox still does via modulator.
                }
            } break;
            case SongTagCode.beatCount: {
                if (beforeThree && fromBeepBox) {
                    this.beatsPerBar = [6, 7, 8, 9, 10][base64CharCodeToInt[compressed.charCodeAt(charIndex++)]];
                } else {
                    this.beatsPerBar = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 1;
                }
                this.beatsPerBar = Math.max(Config.beatsPerBarMin, Math.min(Config.beatsPerBarMax, this.beatsPerBar));
            } break;
            case SongTagCode.barCount: {
                const barCount: number = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 1;
                this.barCount = validateRange(Config.barCountMin, Config.barCountMax, barCount);
                for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                    for (let bar = this.channels[channelIndex].bars.length; bar < this.barCount; bar++) {
                        this.channels[channelIndex].bars[bar] = (bar < 4) ? 1 : 0;
                    }
                    this.channels[channelIndex].bars.length = this.barCount;
                }
            } break;
            case SongTagCode.patternCount: {
                let patternsPerChannel: number;
                if (beforeEight && fromBeepBox) {
                    patternsPerChannel = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 1;
                } else {
                    patternsPerChannel = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 1;
                }
                this.patternsPerChannel = validateRange(1, Config.barCountMax, patternsPerChannel);
                const channelCount: number = this.getChannelCount();
                for (let channelIndex: number = 0; channelIndex < channelCount; channelIndex++) {
                    const patterns: Pattern[] = this.channels[channelIndex].patterns;
                    for (let pattern = patterns.length; pattern < this.patternsPerChannel; pattern++) {
                        patterns[pattern] = new Pattern();
                    }
                    patterns.length = this.patternsPerChannel;
                }
            } break;
            case SongTagCode.instrumentCount: {
                if ((beforeNine && fromBeepBox) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                    const instrumentsPerChannel: number = validateRange(Config.instrumentCountMin, Config.patternInstrumentCountMax, base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + Config.instrumentCountMin);
                    this.layeredInstruments = false;
                    this.patternInstruments = (instrumentsPerChannel > 1);

                    for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                        const isNoiseChannel: boolean = channelIndex >= this.pitchChannelCount && channelIndex < this.pitchChannelCount + this.noiseChannelCount;
                        const isModChannel: boolean = channelIndex >= this.pitchChannelCount + this.noiseChannelCount;

                        for (let instrumentIndex: number = this.channels[channelIndex].instruments.length; instrumentIndex < instrumentsPerChannel; instrumentIndex++) {
                            this.channels[channelIndex].instruments[instrumentIndex] = new Instrument(isNoiseChannel, isModChannel);
                        }
                        this.channels[channelIndex].instruments.length = instrumentsPerChannel;
                        if (beforeSix && fromBeepBox) {
                            for (let instrumentIndex: number = 0; instrumentIndex < instrumentsPerChannel; instrumentIndex++) {
                                this.channels[channelIndex].instruments[instrumentIndex].setTypeAndReset(isNoiseChannel ? InstrumentType.noise : InstrumentType.chip, isNoiseChannel, isModChannel);
                            }
                        }

                        for (let j: number = legacySettingsCache![channelIndex].length; j < instrumentsPerChannel; j++) {
                            legacySettingsCache![channelIndex][j] = {};
                        }
                    }
                } else {
                    const instrumentsFlagBits: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    this.layeredInstruments = (instrumentsFlagBits & (1 << 1)) != 0;
                    this.patternInstruments = (instrumentsFlagBits & (1 << 0)) != 0;
                    for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                        let instrumentCount: number = 1;
                        if (this.layeredInstruments || this.patternInstruments) {
                            instrumentCount = validateRange(Config.instrumentCountMin, this.getMaxInstrumentsPerChannel(), base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + Config.instrumentCountMin);
                        }
                        const channel: Channel = this.channels[channelIndex];
                        const isNoiseChannel: boolean = this.getChannelIsNoise(channelIndex);
                        const isModChannel: boolean = this.getChannelIsMod(channelIndex);
                        for (let i: number = channel.instruments.length; i < instrumentCount; i++) {
                            channel.instruments[i] = new Instrument(isNoiseChannel, isModChannel);
                        }
                        channel.instruments.length = instrumentCount;
                    }
                }
            } break;
            case SongTagCode.rhythm: {
                if (!fromUltraBox && !fromSlarmoosBox) {
                    let newRhythm = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    this.rhythm = clamp(0, Config.rhythms.length, newRhythm);
                    if (fromJummBox && beforeThree || fromBeepBox) {
                        if (this.rhythm == Config.rhythms.dictionary["÷3 (triplets)"].index || this.rhythm == Config.rhythms.dictionary["÷6"].index) {
                            useSlowerArpSpeed = true;
                        }
                        if (this.rhythm >= Config.rhythms.dictionary["÷6"].index) {
                            // @TODO: This assumes that 6 and 8 are in that order, but
                            // if someone reorders Config.rhythms that may not be true,
                            // so this check probably should instead look for those
                            // specific rhythms.
                            useFastTwoNoteArp = true;
                        }
                    }
                } else if ((fromSlarmoosBox && beforeFour) || (fromUltraBox && beforeFive)) {
                    const rhythmMap = [1, 1, 0, 1, 2, 3, 4, 5];
                    this.rhythm = clamp(0, Config.rhythms.length, rhythmMap[base64CharCodeToInt[compressed.charCodeAt(charIndex++)]]);
                } else {
                    this.rhythm = clamp(0, Config.rhythms.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                }
            } break;
            case SongTagCode.channelOctave: {
                if (beforeThree && fromBeepBox) {
                    const channelIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    this.channels[channelIndex].octave = clamp(0, Config.pitchOctaves, base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 1);
                    if (channelIndex >= this.pitchChannelCount) this.channels[channelIndex].octave = 0;
                } else if ((beforeNine && fromBeepBox) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                    for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                        this.channels[channelIndex].octave = clamp(0, Config.pitchOctaves, base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 1);
                        if (channelIndex >= this.pitchChannelCount) this.channels[channelIndex].octave = 0;
                    }
                } else {
                    for (let channelIndex: number = 0; channelIndex < this.pitchChannelCount; channelIndex++) {
                        this.channels[channelIndex].octave = clamp(0, Config.pitchOctaves, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    }
                    for (let channelIndex: number = this.pitchChannelCount; channelIndex < this.getChannelCount(); channelIndex++) {
                        this.channels[channelIndex].octave = 0;
                    }
                }
            } break;
            case SongTagCode.startInstrument: {
                instrumentIndexIterator++;
                if (instrumentIndexIterator >= this.channels[instrumentChannelIterator].instruments.length) {
                    instrumentChannelIterator++;
                    instrumentIndexIterator = 0;
                }
                validateRange(0, this.channels.length - 1, instrumentChannelIterator);
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                // JB before v5 had custom chip and mod before pickedString and supersaw were added. Index +2.
                let instrumentType: number = validateRange(0, InstrumentType.length - 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                if ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox)) {
                    if (instrumentType == InstrumentType.pickedString || instrumentType == InstrumentType.supersaw) {
                        instrumentType += 2;
                    }
                }
                // Similar story here, JB before v5 had custom chip and mod before supersaw was added. Index +1.
                else if ((fromJummBox && beforeSix) || (fromGoldBox && !beforeFour) || (fromUltraBox && beforeFive)) {
                    if (instrumentType == InstrumentType.supersaw || instrumentType == InstrumentType.customChipWave || instrumentType == InstrumentType.mod) {
                        instrumentType += 1;
                    }
                }
                instrument.setTypeAndReset(instrumentType, instrumentChannelIterator >= this.pitchChannelCount && instrumentChannelIterator < this.pitchChannelCount + this.noiseChannelCount, instrumentChannelIterator >= this.pitchChannelCount + this.noiseChannelCount);

                // Anti-aliasing was added in BeepBox 3.0 (v6->v7) and JummBox 1.3 (v1->v2 roughly but some leakage possible)
                if (((beforeSeven && fromBeepBox) || (beforeTwo && fromJummBox)) && (instrumentType == InstrumentType.chip || instrumentType == InstrumentType.customChipWave || instrumentType == InstrumentType.pwm)) {
                    instrument.aliases = true;
                    let newEffect: Effect = instrument.addEffect(EffectType.distortion);
                    newEffect.distortion = 0;
                }
                if (useSlowerArpSpeed) {
                    instrument.arpeggioSpeed = 9; // x3/4 speed. This used to be tied to rhythm, but now it is decoupled to each instrument's arp speed slider. This flag gets set when importing older songs to keep things consistent.
                }
                if (useFastTwoNoteArp) {
                    instrument.fastTwoNoteArp = true;
                }

                if (beforeSeven && fromBeepBox) {
                    // instrument.effects = 0;
                    // Chip/noise instruments had arpeggio and FM had custom interval but neither
                    // explicitly saved the chorus setting beforeSeven so enable it here.
                    if (instrument.chord != Config.chords.dictionary["simultaneous"].index) {
                        // Enable chord if it was used.
                        instrument.mdeffects |= 1 << MDEffectType.chord;
                    }
                }
            } break;
            case SongTagCode.preset: {
                const presetValue: number = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) | (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].preset = presetValue;
                // Picked string was inserted before custom chip in JB v5, so bump up preset index.
                if ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox)) {
                    if (this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].preset == InstrumentType.pickedString) {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].preset = InstrumentType.customChipWave;
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].type = InstrumentType.customChipWave;
                    }
                }
                // Similar story, supersaw is also before custom chip (and mod, but mods can't have presets).
                else if ((fromJummBox && beforeSix) || (fromUltraBox && beforeFive)) {
                    if (this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].preset == InstrumentType.supersaw) {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].preset = InstrumentType.customChipWave;
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].type = InstrumentType.customChipWave;
                    }
                    // ultra code for 6-op fm maybe
                    if (this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].preset == InstrumentType.mod) {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].preset = InstrumentType.fm6op;
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].type = InstrumentType.fm6op;
                    }
                }
                // BeepBox directly tweaked "grand piano", but JB kept it the same. The most up to date version is now "grand piano 3"
                if (fromBeepBox && presetValue == EditorConfig.nameToPresetValue("grand piano 1")) {
                    this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].preset = EditorConfig.nameToPresetValue("grand piano 3")!;
                }
            } break;
            case SongTagCode.wave: {
                if (beforeThree && fromBeepBox) {
                    const legacyWaves: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 0];
                    const channelIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    const instrument: Instrument = this.channels[channelIndex].instruments[0];
                    instrument.chipWave = clamp(0, Config.chipWaves.length, legacyWaves[base64CharCodeToInt[compressed.charCodeAt(charIndex++)]] | 0);

                    // Version 2 didn't save any settings for settings for filters, or envelopes,
                    // just waves, so initialize them here I guess.
                    instrument.convertLegacySettings(legacySettingsCache![channelIndex][0], forceSimpleFilter);

                } else if (beforeSix && fromBeepBox) {
                    const legacyWaves: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 0];
                    for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                        for (const instrument of this.channels[channelIndex].instruments) {
                            if (channelIndex >= this.pitchChannelCount) {
                                instrument.chipNoise = clamp(0, Config.chipNoises.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            } else {
                                instrument.chipWave = clamp(0, Config.chipWaves.length, legacyWaves[base64CharCodeToInt[compressed.charCodeAt(charIndex++)]] | 0);
                            }
                        }
                    }
                } else if (beforeSeven && fromBeepBox) {
                    const legacyWaves: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 0];
                    if (instrumentChannelIterator >= this.pitchChannelCount) {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipNoise = clamp(0, Config.chipNoises.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    } else {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, legacyWaves[base64CharCodeToInt[compressed.charCodeAt(charIndex++)]] | 0);
                    }
                } else {
                    if (this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].type == InstrumentType.noise) {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipNoise = clamp(0, Config.chipNoises.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    } else {
                        if (fromSlarmoosBox || fromUltraBox) {
                            const chipWaveReal = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            const chipWaveCounter = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];

                            if (chipWaveCounter == 3) {
                                this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, chipWaveReal + 186);
                            } else if (chipWaveCounter == 2) {
                                this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, chipWaveReal + 124);
                            } else if (chipWaveCounter == 1) {
                                this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, chipWaveReal + 62);
                            } else {
                                this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, chipWaveReal);
                            }

                        } else {
                            this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                    }
                }
            } break;
            case SongTagCode.noteFilter: {
                if ((beforeNine && fromBeepBox) || (beforeFive && fromJummBox) || (beforeFour && fromGoldBox)) {
                    if (beforeSeven && fromBeepBox) {
                        const legacyToCutoff: number[] = [10, 6, 3, 0, 8, 5, 2];
                        //const pregoldToEnvelope: number[] = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 27, 28, 29, 32, 33, 34, 31, 11];
                        const legacyToEnvelope: string[] = ["none", "none", "none", "none", "decay 1", "decay 2", "decay 3"];

                        if (beforeThree && fromBeepBox) {
                            const channelIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            const instrument: Instrument = this.channels[channelIndex].instruments[0];
                            const legacySettings: LegacySettings = legacySettingsCache![channelIndex][0];
                            const legacyFilter: number = [1, 3, 4, 5][clamp(0, legacyToCutoff.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)])];
                            legacySettings.filterCutoff = legacyToCutoff[legacyFilter];
                            legacySettings.filterResonance = 0;
                            legacySettings.filterEnvelope = Config.envelopes.dictionary[legacyToEnvelope[legacyFilter]];
                            instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                        } else if (beforeSix && fromBeepBox) {
                            for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                                for (let i: number = 0; i < this.channels[channelIndex].instruments.length; i++) {
                                    const instrument: Instrument = this.channels[channelIndex].instruments[i];
                                    const legacySettings: LegacySettings = legacySettingsCache![channelIndex][i];
                                    const legacyFilter: number = clamp(0, legacyToCutoff.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 1);
                                    if (channelIndex < this.pitchChannelCount) {
                                        legacySettings.filterCutoff = legacyToCutoff[legacyFilter];
                                        legacySettings.filterResonance = 0;
                                        legacySettings.filterEnvelope = Config.envelopes.dictionary[legacyToEnvelope[legacyFilter]];
                                    } else {
                                        legacySettings.filterCutoff = 10;
                                        legacySettings.filterResonance = 0;
                                        legacySettings.filterEnvelope = Config.envelopes.dictionary["none"];
                                    }
                                    instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                                }
                            }
                        } else {
                            const legacyFilter: number = clamp(0, legacyToCutoff.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                            const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                            legacySettings.filterCutoff = legacyToCutoff[legacyFilter];
                            legacySettings.filterResonance = 0;
                            legacySettings.filterEnvelope = Config.envelopes.dictionary[legacyToEnvelope[legacyFilter]];
                            instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                        }
                    } else {
                        const filterCutoffRange: number = 11;
                        const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                        const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                        legacySettings.filterCutoff = clamp(0, filterCutoffRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                    }
                } else {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    let typeCheck: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    if (fromTheepBox) { //in mods that arent theepbox, pre eq is switched with post eq
                        if (typeCheck == 0) {
                            instrument.noteFilterType = false;
                            typeCheck = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            const originalControlPointCount: number = typeCheck;
                            instrument.noteFilter.controlPointCount = clamp(0, Config.filterMaxPoints + 1, originalControlPointCount);
                            for (let i: number = instrument.noteFilter.controlPoints.length; i < instrument.noteFilter.controlPointCount; i++) {
                                instrument.noteFilter.controlPoints[i] = new FilterControlPoint();
                            }
                            for (let i: number = 0; i < instrument.noteFilter.controlPointCount; i++) {
                                const point: FilterControlPoint = instrument.noteFilter.controlPoints[i];
                                point.type = clamp(0, FilterType.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                point.freq = clamp(0, Config.filterFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                point.gain = clamp(0, Config.filterGainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            }
                            for (let i: number = instrument.noteFilter.controlPointCount; i < originalControlPointCount; i++) {
                                charIndex += 3;
                            }

                            // Get subfilters as well. Skip Index 0, is a copy of the base filter.
                            instrument.noteSubFilters[0] = instrument.noteFilter;
                            let usingSubFilterBitfield: number = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) | (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
                                if (usingSubFilterBitfield & (1 << j)) {
                                    // Number of control points
                                    const originalSubfilterControlPointCount: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                    if (instrument.noteSubFilters[j + 1] == null)
                                        instrument.noteSubFilters[j + 1] = new FilterSettings();
                                    instrument.noteSubFilters[j + 1]!.controlPointCount = clamp(0, Config.filterMaxPoints + 1, originalSubfilterControlPointCount);
                                    for (let i: number = instrument.noteSubFilters[j + 1]!.controlPoints.length; i < instrument.noteSubFilters[j + 1]!.controlPointCount; i++) {
                                        instrument.noteSubFilters[j + 1]!.controlPoints[i] = new FilterControlPoint();
                                    }
                                    for (let i: number = 0; i < instrument.noteSubFilters[j + 1]!.controlPointCount; i++) {
                                        const point: FilterControlPoint = instrument.noteSubFilters[j + 1]!.controlPoints[i];
                                        point.type = clamp(0, FilterType.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                        point.freq = clamp(0, Config.filterFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                        point.gain = clamp(0, Config.filterGainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    }
                                    for (let i: number = instrument.noteSubFilters[j + 1]!.controlPointCount; i < originalSubfilterControlPointCount; i++) {
                                        charIndex += 3;
                                    }
                                }
                            }
                        }
                        else {
                            instrument.noteFilterType = true;
                            instrument.noteFilterSimpleCut = clamp(0, Config.filterSimpleCutRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            instrument.noteFilterSimplePeak = clamp(0, Config.filterSimplePeakRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                    } else {
                        let newEffect: Effect = instrument.addEffect(EffectType.eqFilter);
                        if (fromBeepBox || typeCheck == 0) {
                            newEffect.eqFilterType = false;
                            if (fromJummBox || fromGoldBox || fromUltraBox || fromSlarmoosBox)
                                typeCheck = base64CharCodeToInt[compressed.charCodeAt(charIndex++)]; // Skip to next to get control point count
                                const originalControlPointCount: number = typeCheck;
                            newEffect.eqFilter.controlPointCount = clamp(0, Config.filterMaxPoints + 1, originalControlPointCount);
                            for (let i: number = newEffect.eqFilter.controlPoints.length; i < newEffect.eqFilter.controlPointCount; i++) {
                                newEffect.eqFilter.controlPoints[i] = new FilterControlPoint();
                            }
                            for (let i: number = 0; i < newEffect.eqFilter.controlPointCount; i++) {
                                const point: FilterControlPoint = newEffect.eqFilter.controlPoints[i];
                                point.type = clamp(0, FilterType.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                point.freq = clamp(0, Config.filterFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                point.gain = clamp(0, Config.filterGainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            }
                            for (let i: number = newEffect.eqFilter.controlPointCount; i < originalControlPointCount; i++) {
                                charIndex += 3;
                            }

                            // Get subfilters as well. Skip Index 0, is a copy of the base filter.
                            newEffect.eqSubFilters[0] = newEffect.eqFilter;
                            if ((fromJummBox && !beforeFive) || (fromGoldBox && !beforeFour) || fromUltraBox || fromSlarmoosBox) {
                                let usingSubFilterBitfield: number = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) | (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
                                    if (usingSubFilterBitfield & (1 << j)) {
                                        // Number of control points
                                        const originalSubfilterControlPointCount: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                        if (newEffect.eqSubFilters[j + 1] == null)
                                            newEffect.eqSubFilters[j + 1] = new FilterSettings();
                                        newEffect.eqSubFilters[j + 1]!.controlPointCount = clamp(0, Config.filterMaxPoints + 1, originalSubfilterControlPointCount);
                                        for (let i: number = newEffect.eqSubFilters[j + 1]!.controlPoints.length; i < newEffect.eqSubFilters[j + 1]!.controlPointCount; i++) {
                                            newEffect.eqSubFilters[j + 1]!.controlPoints[i] = new FilterControlPoint();
                                        }
                                        for (let i: number = 0; i < newEffect.eqSubFilters[j + 1]!.controlPointCount; i++) {
                                            const point: FilterControlPoint = newEffect.eqSubFilters[j + 1]!.controlPoints[i];
                                            point.type = clamp(0, FilterType.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                            point.freq = clamp(0, Config.filterFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                            point.gain = clamp(0, Config.filterGainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                        }
                                        for (let i: number = newEffect.eqSubFilters[j + 1]!.controlPointCount; i < originalSubfilterControlPointCount; i++) {
                                            charIndex += 3;
                                        }
                                    }
                                }
                            }
                        }
                        else {
                            newEffect.eqFilterType = true;
                            newEffect.eqFilterSimpleCut = clamp(0, Config.filterSimpleCutRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            newEffect.eqFilterSimplePeak = clamp(0, Config.filterSimplePeakRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                    }
                }
            } break;
            case SongTagCode.loopControls: {
                if (fromSlarmoosBox || fromUltraBox) {
                    if (beforeThree && fromUltraBox) {
                        // Still have to support the old and bad loop control data format written as a test, sigh.
                        const sampleLoopInfoEncodedLength = decode32BitNumber(compressed, charIndex);
                        charIndex += 6;
                        const sampleLoopInfoEncoded = compressed.slice(charIndex, charIndex + sampleLoopInfoEncodedLength);
                        charIndex += sampleLoopInfoEncodedLength;
                        interface SampleLoopInfo {
                            isUsingAdvancedLoopControls: boolean;
                            chipWaveLoopStart: number;
                            chipWaveLoopEnd: number;
                            chipWaveLoopMode: number;
                            chipWavePlayBackwards: boolean;
                            chipWaveStartOffset: number;
                        }
                        interface SampleLoopInfoEntry {
                            channel: number;
                            instrument: number;
                            info: SampleLoopInfo;
                        }
                        const sampleLoopInfo: SampleLoopInfoEntry[] = JSON.parse(atob(sampleLoopInfoEncoded));
                        for (const entry of sampleLoopInfo) {
                            const channelIndex: number = entry["channel"];
                            const instrumentIndex: number = entry["instrument"];
                            const info: SampleLoopInfo = entry["info"];
                            const instrument: Instrument = this.channels[channelIndex].instruments[instrumentIndex];
                            instrument.isUsingAdvancedLoopControls = info["isUsingAdvancedLoopControls"];
                            instrument.chipWaveLoopStart = info["chipWaveLoopStart"];
                            instrument.chipWaveLoopEnd = info["chipWaveLoopEnd"];
                            instrument.chipWaveLoopMode = info["chipWaveLoopMode"];
                            instrument.chipWavePlayBackwards = info["chipWavePlayBackwards"];
                            instrument.chipWaveStartOffset = info["chipWaveStartOffset"];
                            // @TODO: Whenever chipWaveReleaseMode is implemented, it should be set here to the default.
                        }
                    } else {
                        // Read the new loop control data format.
                        // See Song.toBase64String for details on the encodings used here.
                        const encodedLoopMode: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        const isUsingAdvancedLoopControls: boolean = Boolean(encodedLoopMode & 1);
                        const chipWaveLoopMode: number = encodedLoopMode >> 1;
                        const encodedReleaseMode: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        const chipWavePlayBackwards: boolean = Boolean(encodedReleaseMode & 1);
                        // const chipWaveReleaseMode: number = encodedReleaseMode >> 1;
                        const chipWaveLoopStart: number = decode32BitNumber(compressed, charIndex);
                        charIndex += 6;
                        const chipWaveLoopEnd: number = decode32BitNumber(compressed, charIndex);
                        charIndex += 6;
                        const chipWaveStartOffset: number = decode32BitNumber(compressed, charIndex);
                        charIndex += 6;
                        const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                        instrument.isUsingAdvancedLoopControls = isUsingAdvancedLoopControls;
                        instrument.chipWaveLoopStart = chipWaveLoopStart;
                        instrument.chipWaveLoopEnd = chipWaveLoopEnd;
                        instrument.chipWaveLoopMode = chipWaveLoopMode;
                        instrument.chipWavePlayBackwards = chipWavePlayBackwards;
                        instrument.chipWaveStartOffset = chipWaveStartOffset;
                        // instrument.chipWaveReleaseMode = chipWaveReleaseMode;
                    }
                }
                else if (fromGoldBox && !beforeFour && beforeSix) {
                    if (document.URL.substring(document.URL.length - 13).toLowerCase() != "legacysamples") {
                        if (!willLoadLegacySamplesForOldSongs) {
                            willLoadLegacySamplesForOldSongs = true;
                            Config.willReloadForCustomSamples = true;
                            EditorConfig.customSamples = ["legacySamples"];
                            loadBuiltInSamples(0);
                        }
                    }
                    this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + 125);
                } else if ((beforeNine && fromBeepBox) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                    const filterResonanceRange: number = 8;
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                    legacySettings.filterResonance = clamp(0, filterResonanceRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    instrument.convertLegacySettings(legacySettings, forceSimpleFilter);

                }
            } break;
            case SongTagCode.drumsetEnvelopes: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                const pregoldToEnvelope: number[] = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 27, 28, 29, 32, 33, 34, 31, 11];
                if ((beforeNine && fromBeepBox) || (beforeFive && fromJummBox) || (beforeFour && fromGoldBox)) {
                    if ((beforeTwo && fromGoldBox) || (!fromGoldBox && !fromUltraBox && !fromSlarmoosBox)) {

                    }
                    if (instrument.type == InstrumentType.drumset) {
                        for (let i: number = 0; i < Config.drumCount; i++) {
                            let aa: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            if ((beforeTwo && fromGoldBox) || (!fromGoldBox && !fromUltraBox && !fromSlarmoosBox)) aa = pregoldToEnvelope[aa];
                            instrument.drumsetEnvelopes[i] = Song._envelopeFromLegacyIndex(aa).index;
                        }
                    } else {
                        // This used to be used for general filter envelopes.
                        // The presence of an envelope affects how convertLegacySettings
                        // decides the closest possible approximation, so update it.
                        const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                        let aa: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        if ((beforeTwo && fromGoldBox) || (!fromGoldBox && !fromUltraBox && !fromSlarmoosBox)) aa = pregoldToEnvelope[aa];
                        legacySettings.filterEnvelope = Song._envelopeFromLegacyIndex(aa);
                        instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                    }
                } else {
                    // This tag is now only used for drumset filter envelopes.
                    for (let i: number = 0; i < Config.drumCount; i++) {
                        let aa: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        if ((beforeTwo && fromGoldBox) || (!fromGoldBox && !fromUltraBox && !fromSlarmoosBox)) aa = pregoldToEnvelope[aa];
                        if (!fromSlarmoosBox && aa >= 2) aa++; //2 for pitch
                        instrument.drumsetEnvelopes[i] = clamp(0, Config.envelopes.length, aa);
                    }
                }
            } break;
            case SongTagCode.pulseWidth: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                instrument.pulseWidth = clamp(0, Config.pulseWidthRange + (+(fromJummBox)) + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                if (fromBeepBox) {
                    // BeepBox formula
                    instrument.pulseWidth = Math.round(Math.pow(0.5, (7 - instrument.pulseWidth) * Config.pulseWidthStepPower) * Config.pulseWidthRange);

                }

                if ((beforeNine && fromBeepBox) || (beforeFive && fromJummBox) || (beforeFour && fromGoldBox)) {
                    const pregoldToEnvelope: number[] = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 27, 28, 29, 32, 33, 34, 31, 11];
                    const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                    let aa: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    if ((beforeTwo && fromGoldBox) || (!fromGoldBox && !fromUltraBox && !fromSlarmoosBox)) aa = pregoldToEnvelope[aa];
                    legacySettings.pulseEnvelope = Song._envelopeFromLegacyIndex(aa);
                    instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                }

                if ((fromUltraBox && !beforeFour) || fromSlarmoosBox) {
                    instrument.decimalOffset = clamp(0, 99 + 1, (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                }

            } break;
            case SongTagCode.stringSustain: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                const sustainValue: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                instrument.stringSustain = clamp(0, Config.stringSustainRange, sustainValue & 0x1F);
                instrument.stringSustainType = Config.enableAcousticSustain ? clamp(0, SustainType.length, sustainValue >> 5) : SustainType.bright;
            } break;
            case SongTagCode.fadeInOut: {
                if ((beforeNine && fromBeepBox) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                    // this tag was used for a combination of transition and fade in/out.
                    const legacySettings = [
                        { transition: "interrupt", fadeInSeconds: 0.0, fadeOutTicks: -1 },
                        { transition: "normal", fadeInSeconds: 0.0, fadeOutTicks: -3 },
                        { transition: "normal", fadeInSeconds: 0.025, fadeOutTicks: -3 },
                        { transition: "slide in pattern", fadeInSeconds: 0.025, fadeOutTicks: -3 },
                        { transition: "normal", fadeInSeconds: 0.04, fadeOutTicks: 6 },
                        { transition: "normal", fadeInSeconds: 0.0, fadeOutTicks: 48 },
                        { transition: "normal", fadeInSeconds: 0.0125, fadeOutTicks: 72 },
                        { transition: "normal", fadeInSeconds: 0.06, fadeOutTicks: 96 },
                        { transition: "slide in pattern", fadeInSeconds: 0.025, fadeOutTicks: -3 },
                    ];
                    if (beforeThree && fromBeepBox) {
                        const channelIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        const settings = legacySettings[clamp(0, legacySettings.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)])];
                        const instrument: Instrument = this.channels[channelIndex].instruments[0];
                        instrument.fadeIn = secondsToFadeInSetting(settings.fadeInSeconds);
                        instrument.fadeOut = ticksToFadeOutSetting(settings.fadeOutTicks);
                        instrument.transition = Config.transitions.dictionary[settings.transition].index;
                        if (instrument.transition != Config.transitions.dictionary["normal"].index) {
                            // Enable transition if it was used.
                            instrument.mdeffects |= 1 << MDEffectType.transition;
                        }
                    } else if (beforeSix && fromBeepBox) {
                        for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                            for (const instrument of this.channels[channelIndex].instruments) {
                                const settings = legacySettings[clamp(0, legacySettings.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)])];
                                instrument.fadeIn = secondsToFadeInSetting(settings.fadeInSeconds);
                                instrument.fadeOut = ticksToFadeOutSetting(settings.fadeOutTicks);
                                instrument.transition = Config.transitions.dictionary[settings.transition].index;
                                if (instrument.transition != Config.transitions.dictionary["normal"].index) {
                                    // Enable transition if it was used.
                                    instrument.mdeffects |= 1 << MDEffectType.transition;
                                }
                            }
                        }
                    } else if ((beforeFour && !fromGoldBox && !fromUltraBox && !fromSlarmoosBox) || fromBeepBox) {
                        const settings = legacySettings[clamp(0, legacySettings.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)])];
                        const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                        instrument.fadeIn = secondsToFadeInSetting(settings.fadeInSeconds);
                        instrument.fadeOut = ticksToFadeOutSetting(settings.fadeOutTicks);
                        instrument.transition = Config.transitions.dictionary[settings.transition].index;
                        if (instrument.transition != Config.transitions.dictionary["normal"].index) {
                            // Enable transition if it was used.
                            instrument.mdeffects |= 1 << MDEffectType.transition;
                        }
                    } else {
                        const settings = legacySettings[clamp(0, legacySettings.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)])];
                        const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                        instrument.fadeIn = secondsToFadeInSetting(settings.fadeInSeconds);
                        instrument.fadeOut = ticksToFadeOutSetting(settings.fadeOutTicks);
                        instrument.transition = Config.transitions.dictionary[settings.transition].index;

                        // Read tie-note
                        if (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] > 0) {
                            // Set legacy tie over flag, which is only used to port notes in patterns using this instrument as tying.
                            instrument.legacyTieOver = true;

                        }
                        instrument.clicklessTransition = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] ? true : false;

                        if (instrument.transition != Config.transitions.dictionary["normal"].index || instrument.clicklessTransition) {
                            // Enable transition if it was used.
                            instrument.mdeffects |= 1 << MDEffectType.transition;
                        }
                    }
                } else {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.fadeIn = clamp(0, Config.fadeInRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    instrument.fadeOut = clamp(0, Config.fadeOutTicks.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    if (fromJummBox || fromGoldBox || fromUltraBox || fromSlarmoosBox)
                        instrument.clicklessTransition = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] ? true : false;
                }
            } break;
            case SongTagCode.songEq: { //deprecated vibrato tag repurposed for songEq
                if ((beforeNine && fromBeepBox) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                    if (beforeSeven && fromBeepBox) {
                        if (beforeThree && fromBeepBox) {
                            const legacyEffects: number[] = [0, 3, 2, 0];
                            const legacyEnvelopes: string[] = ["none", "none", "none", "tremolo2"];
                            const channelIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            const effect: number = clamp(0, legacyEffects.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            const instrument: Instrument = this.channels[channelIndex].instruments[0];
                            const legacySettings: LegacySettings = legacySettingsCache![channelIndex][0];
                            instrument.vibrato = legacyEffects[effect];
                            if (legacySettings.filterEnvelope == undefined || legacySettings.filterEnvelope.type == EnvelopeType.none) {
                                // Imitate the legacy tremolo with a filter envelope.
                                legacySettings.filterEnvelope = Config.envelopes.dictionary[legacyEnvelopes[effect]];
                                instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                            }
                            if (instrument.vibrato != Config.vibratos.dictionary["none"].index) {
                                // Enable vibrato if it was used.
                                instrument.mdeffects |= 1 << MDEffectType.vibrato;
                            }
                        } else if (beforeSix && fromBeepBox) {
                            const legacyEffects: number[] = [0, 1, 2, 3, 0, 0];
                            const legacyEnvelopes: string[] = ["none", "none", "none", "none", "tremolo5", "tremolo2"];
                            for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                                for (let i: number = 0; i < this.channels[channelIndex].instruments.length; i++) {
                                    const effect: number = clamp(0, legacyEffects.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    const instrument: Instrument = this.channels[channelIndex].instruments[i];
                                    const legacySettings: LegacySettings = legacySettingsCache![channelIndex][i];
                                    instrument.vibrato = legacyEffects[effect];
                                    if (legacySettings.filterEnvelope == undefined || legacySettings.filterEnvelope.type == EnvelopeType.none) {
                                        // Imitate the legacy tremolo with a filter envelope.
                                        legacySettings.filterEnvelope = Config.envelopes.dictionary[legacyEnvelopes[effect]];
                                        instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                                    }
                                    if (instrument.vibrato != Config.vibratos.dictionary["none"].index) {
                                        // Enable vibrato if it was used.
                                        instrument.mdeffects |= 1 << MDEffectType.vibrato;
                                    }
                                    if ((legacyGlobalReverb != 0 || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) && !this.getChannelIsNoise(channelIndex)) {
                                        // Enable reverb if it was used globaly before. (Global reverb was added before the effects option so I need to pick somewhere else to initialize instrument reverb, and I picked the vibrato command.)
                                        let newEffect: Effect = instrument.addEffect(EffectType.reverb);
                                        newEffect.reverb = legacyGlobalReverb;
                                    }
                                }
                            }
                        } else {
                            const legacyEffects: number[] = [0, 1, 2, 3, 0, 0];
                            const legacyEnvelopes: string[] = ["none", "none", "none", "none", "tremolo5", "tremolo2"];
                            const effect: number = clamp(0, legacyEffects.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                            const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                            instrument.vibrato = legacyEffects[effect];
                            if (legacySettings.filterEnvelope == undefined || legacySettings.filterEnvelope.type == EnvelopeType.none) {
                                // Imitate the legacy tremolo with a filter envelope.
                                legacySettings.filterEnvelope = Config.envelopes.dictionary[legacyEnvelopes[effect]];
                                instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                            }
                            if (instrument.vibrato != Config.vibratos.dictionary["none"].index) {
                                // Enable vibrato if it was used.
                                instrument.mdeffects |= 1 << MDEffectType.vibrato;
                            }
                            if (legacyGlobalReverb != 0 || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                                // Enable reverb if it was used globaly before. (Global reverb was added before the effects option so I need to pick somewhere else to initialize instrument reverb, and I picked the vibrato command.)
                                let newEffect: Effect = instrument.addEffect(EffectType.reverb);
                                newEffect.reverb = legacyGlobalReverb;
                            }
                        }
                    } else {
                        const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                        const vibrato: number = clamp(0, Config.vibratos.length + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        instrument.vibrato = vibrato;
                        if (instrument.vibrato != Config.vibratos.dictionary["none"].index) {
                            // Enable vibrato if it was used.
                            instrument.mdeffects |= 1 << MDEffectType.vibrato;
                        }
                        // Custom vibrato
                        if (vibrato == Config.vibratos.length) {
                            instrument.vibratoDepth = clamp(0, Config.modulators.dictionary["vibrato depth"].maxRawVol + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) / 50;
                            instrument.vibratoSpeed = clamp(0, Config.modulators.dictionary["vibrato speed"].maxRawVol + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            instrument.vibratoDelay = clamp(0, Config.modulators.dictionary["vibrato delay"].maxRawVol + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) / 2;
                            instrument.vibratoType = clamp(0, Config.vibratoTypes.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            instrument.mdeffects |= 1 << MDEffectType.vibrato;
                        }
                        // Enforce standard vibrato settings
                        else {
                            instrument.vibratoDepth = Config.vibratos[instrument.vibrato].amplitude;
                            instrument.vibratoSpeed = 10; // Normal speed
                            instrument.vibratoDelay = Config.vibratos[instrument.vibrato].delayTicks / 2;
                            instrument.vibratoType = Config.vibratos[instrument.vibrato].type;
                        }
                    }
                } else {
                    // songeq
                    if (fromSlarmoosBox && !beforeFour) { //double check that it's from a valid version
                        const originalControlPointCount: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        this.eqFilter.controlPointCount = clamp(0, Config.filterMaxPoints + 1, originalControlPointCount);
                        for (let i: number = this.eqFilter.controlPoints.length; i < this.eqFilter.controlPointCount; i++) {
                            this.eqFilter.controlPoints[i] = new FilterControlPoint();
                        }
                        for (let i: number = 0; i < this.eqFilter.controlPointCount; i++) {
                            const point: FilterControlPoint = this.eqFilter.controlPoints[i];
                            point.type = clamp(0, FilterType.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            point.freq = clamp(0, Config.filterFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            point.gain = clamp(0, Config.filterGainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                        for (let i: number = this.eqFilter.controlPointCount; i < originalControlPointCount; i++) {
                            charIndex += 3;
                        }

                        // Get subfilters as well. Skip Index 0, is a copy of the base filter.
                        this.eqSubFilters[0] = this.eqFilter;
                        let usingSubFilterBitfield: number = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) | (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
                            if (usingSubFilterBitfield & (1 << j)) {
                                // Number of control points
                                const originalSubfilterControlPointCount: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                if (this.eqSubFilters[j + 1] == null)
                                    this.eqSubFilters[j + 1] = new FilterSettings();
                                this.eqSubFilters[j + 1]!.controlPointCount = clamp(0, Config.filterMaxPoints + 1, originalSubfilterControlPointCount);
                                for (let i: number = this.eqSubFilters[j + 1]!.controlPoints.length; i < this.eqSubFilters[j + 1]!.controlPointCount; i++) {
                                    this.eqSubFilters[j + 1]!.controlPoints[i] = new FilterControlPoint();
                                }
                                for (let i: number = 0; i < this.eqSubFilters[j + 1]!.controlPointCount; i++) {
                                    const point: FilterControlPoint = this.eqSubFilters[j + 1]!.controlPoints[i];
                                    point.type = clamp(0, FilterType.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    point.freq = clamp(0, Config.filterFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    point.gain = clamp(0, Config.filterGainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                }
                                for (let i: number = this.eqSubFilters[j + 1]!.controlPointCount; i < originalSubfilterControlPointCount; i++) {
                                    charIndex += 3;
                                }
                            }
                        }
                    }
                }
            } break;
            case SongTagCode.arpeggioSpeed: {
                // Deprecated, but supported for legacy purposes
                if ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox)) {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.arpeggioSpeed = clamp(0, Config.modulators.dictionary["arp speed"].maxRawVol + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    instrument.fastTwoNoteArp = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] ? true : false; // Two note arp setting piggybacks on this
                }
                else {
                    // Do nothing, deprecated for now
                }
            } break;
            case SongTagCode.unison: {
                if (beforeThree && fromBeepBox) {
                    const channelIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    const instrument = this.channels[channelIndex].instruments[0];
                    instrument.unison = clamp(0, Config.unisons.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    instrument.unisonVoices = Config.unisons[instrument.unison].voices;
                    instrument.unisonSpread = Config.unisons[instrument.unison].spread;
                    instrument.unisonOffset = Config.unisons[instrument.unison].offset;
                    instrument.unisonExpression = Config.unisons[instrument.unison].expression;
                    instrument.unisonSign = Config.unisons[instrument.unison].sign;
                } else if (beforeSix && fromBeepBox) {
                    for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                        for (const instrument of this.channels[channelIndex].instruments) {
                            const originalValue: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            let unison: number = clamp(0, Config.unisons.length, originalValue);
                            if (originalValue == 8) {
                                // original "custom harmony" now maps to "hum" and "custom interval".
                                unison = 2;
                                instrument.chord = 3;
                            }
                            instrument.unison = unison;
                            instrument.unisonVoices = Config.unisons[instrument.unison].voices;
                            instrument.unisonSpread = Config.unisons[instrument.unison].spread;
                            instrument.unisonOffset = Config.unisons[instrument.unison].offset;
                            instrument.unisonExpression = Config.unisons[instrument.unison].expression;
                            instrument.unisonSign = Config.unisons[instrument.unison].sign;
                        }
                    }
                } else if (beforeSeven && fromBeepBox) {
                    const originalValue: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    let unison: number = clamp(0, Config.unisons.length, originalValue);
                    const instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    if (originalValue == 8) {
                        // original "custom harmony" now maps to "hum" and "custom interval".
                        unison = 2;
                        instrument.chord = 3;
                    }
                    instrument.unison = unison;
                    instrument.unisonVoices = Config.unisons[instrument.unison].voices;
                    instrument.unisonSpread = Config.unisons[instrument.unison].spread;
                    instrument.unisonOffset = Config.unisons[instrument.unison].offset;
                    instrument.unisonExpression = Config.unisons[instrument.unison].expression;
                    instrument.unisonSign = Config.unisons[instrument.unison].sign;
                } else {
                    const instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.unison = clamp(0, Config.unisons.length + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    const unisonLength = (beforeFive || !fromSlarmoosBox) ? 27 : Config.unisons.length; //27 was the old length before I added >2 voice presets
                    if (((fromUltraBox && !beforeFive) || fromSlarmoosBox) && (instrument.unison == unisonLength)) {
                        // if (instrument.unison == Config.unisons.length) {
                        instrument.unison = Config.unisons.length;
                        instrument.unisonVoices = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];

                        const unisonSpreadNegative = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        const unisonSpread: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + ((base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 63)) * 63);

                        const unisonOffsetNegative = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        const unisonOffset: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + ((base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 63)) * 63);

                        const unisonExpressionNegative = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        const unisonExpression: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 63);

                        const unisonSignNegative = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        const unisonSign: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] + (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 63);


                        instrument.unisonSpread = unisonSpread / 1000;
                        if (unisonSpreadNegative == 0) instrument.unisonSpread *= -1;

                        instrument.unisonOffset = unisonOffset / 1000;
                        if (unisonOffsetNegative == 0) instrument.unisonOffset *= -1;

                        instrument.unisonExpression = unisonExpression / 1000;
                        if (unisonExpressionNegative == 0) instrument.unisonExpression *= -1;

                        instrument.unisonSign = unisonSign / 1000;
                        if (unisonSignNegative == 0) instrument.unisonSign *= -1;
                    } else {
                        instrument.unisonVoices = Config.unisons[instrument.unison].voices;
                        instrument.unisonSpread = Config.unisons[instrument.unison].spread;
                        instrument.unisonOffset = Config.unisons[instrument.unison].offset;
                        instrument.unisonExpression = Config.unisons[instrument.unison].expression;
                        instrument.unisonSign = Config.unisons[instrument.unison].sign;
                    }
                }

            } break;
            case SongTagCode.chord: {
                if ((beforeNine && fromBeepBox) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.chord = clamp(0, Config.chords.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    if (instrument.chord != Config.chords.dictionary["simultaneous"].index) {
                        // Enable chord if it was used.
                        instrument.mdeffects |= 1 << MDEffectType.chord;
                    }
                } else {
                    // Do nothing? This song tag code is deprecated for now.
                }
            } break;
            case SongTagCode.effects: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                if ((beforeNine && fromBeepBox) || ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                    instrument.addEffect(base64CharCodeToInt[compressed.charCodeAt(charIndex++)] & ((1 << EffectType.length) - 1));
                    /*
                    if (legacyGlobalReverb == 0 && !((fromJummBox && beforeFive) || (beforeFour && fromGoldBox))) {
                        // Disable reverb if legacy song reverb was zero.
                        instrument.removeEffect(EffectType.reverb);
                    } else if (instrument.effectsIncludeType(EffectType.reverb)) {
                        instrument.reverb = legacyGlobalReverb;
                    }
                    if (instrument.pan != Config.panCenter) {
                        instrument.addEffect(EffectType.panning);
                    }
                    if (instrument.vibrato != Config.vibratos.dictionary["none"].index) {
                        // Enable vibrato if it was used.
                        instrument.mdeffects |= 1 << MDEffectType.vibrato;
                    }
                    if (instrument.detune != Config.detuneCenter) {
                        // Enable detune if it was used.
                        instrument.mdeffects |= 1 << MDEffectType.detune;
                    }
                    if (instrument.aliases)
                        instrument.addEffect(EffectType.distortion);
                    else
                        instrument.removeEffect(EffectType.distortion);
                    instrument.addEffect(EffectType.eqFilter);
                    */
                    //TODO: all this compat stuff, or honestly just remove it idc that much

                    // convertLegacySettings may need to force-enable pre eq, call
                    // it again here to make sure that this override takes precedence.
                    const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                    instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                } else {
                    // if (EffectType.length > 9) throw new Error();
                    const effectCount: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)]
                    if (fromTheepBox) {
                        instrument.effects = [];
                        for (let i: number = 0; i < effectCount; i++) { // this for loop caused me a lot of grief... i dont wanna talk about it
                            let newEffect: Effect = instrument.addEffect(base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            if (newEffect.type == EffectType.eqFilter) {
                                let typeCheck: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                if (typeCheck == 0) {
                                    newEffect.eqFilterType = false;
                                    typeCheck = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                    newEffect.eqFilter.controlPointCount = clamp(0, Config.filterMaxPoints + 1, typeCheck);
                                    for (let i: number = newEffect.eqFilter.controlPoints.length; i < newEffect.eqFilter.controlPointCount; i++) {
                                        newEffect.eqFilter.controlPoints[i] = new FilterControlPoint();
                                    }
                                    for (let i: number = 0; i < newEffect.eqFilter.controlPointCount; i++) {
                                        const point: FilterControlPoint = newEffect.eqFilter.controlPoints[i];
                                        point.type = clamp(0, FilterType.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                        point.freq = clamp(0, Config.filterFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                        point.gain = clamp(0, Config.filterGainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    }
                                    for (let i: number = newEffect.eqFilter.controlPointCount; i < typeCheck; i++) {
                                        charIndex += 3;
                                    }

                                    // Get subfilters as well. Skip Index 0, is a copy of the base filter.
                                    newEffect.eqSubFilters[0] = newEffect.eqFilter;
                                    let usingSubFilterBitfield: number = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) | (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    for (let j: number = 0; j < Config.filterMorphCount - 1; j++) {
                                        if (usingSubFilterBitfield & (1 << j)) {
                                            // Number of control points
                                            const originalSubfilterControlPointCount: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                            if (newEffect.eqSubFilters[j + 1] == null)
                                                newEffect.eqSubFilters[j + 1] = new FilterSettings();
                                            newEffect.eqSubFilters[j + 1]!.controlPointCount = clamp(0, Config.filterMaxPoints + 1, originalSubfilterControlPointCount);
                                            for (let i: number = newEffect.eqSubFilters[j + 1]!.controlPoints.length; i < newEffect.eqSubFilters[j + 1]!.controlPointCount; i++) {
                                                newEffect.eqSubFilters[j + 1]!.controlPoints[i] = new FilterControlPoint();
                                            }
                                            for (let i: number = 0; i < newEffect.eqSubFilters[j + 1]!.controlPointCount; i++) {
                                                const point: FilterControlPoint = newEffect.eqSubFilters[j + 1]!.controlPoints[i];
                                                point.type = clamp(0, FilterType.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                                point.freq = clamp(0, Config.filterFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                                point.gain = clamp(0, Config.filterGainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                            }
                                            for (let i: number = newEffect.eqSubFilters[j + 1]!.controlPointCount; i < originalSubfilterControlPointCount; i++) {
                                                charIndex += 3;
                                            }
                                        }
                                    }
                                } else {
                                    newEffect.eqFilterType = true;
                                    newEffect.eqFilter.reset();
                                    newEffect.eqFilterSimpleCut = clamp(0, Config.filterSimpleCutRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    newEffect.eqFilterSimplePeak = clamp(0, Config.filterSimplePeakRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                }
                            }
                            if (newEffect.type == EffectType.distortion) {
                                if (fromTheepBox) newEffect.distortion = clamp(0, Config.distortionRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                else newEffect.distortion = clamp(0, Config.distortionRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) * 2;
                                if ((fromJummBox && !beforeFive) || fromGoldBox || fromUltraBox || fromSlarmoosBox)
                                    instrument.aliases = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] ? true : false;
                            }
                            if (newEffect.type == EffectType.bitcrusher) {
                                newEffect.bitcrusherFreq = clamp(0, Config.bitcrusherFreqRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.bitcrusherQuantization = clamp(0, Config.bitcrusherQuantizationRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            }
                            if (newEffect.type == EffectType.panning) {
                                if (fromBeepBox) {
                                    // Beepbox has a panMax of 8 (9 total positions), Jummbox has a panMax of 100 (101 total positions)
                                    newEffect.pan = clamp(0, Config.panMax + 1, Math.round(base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * ((Config.panMax) / 8.0)));
                                }
                                else {
                                    newEffect.pan = clamp(0, Config.panMax + 1, (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                }

                                // Now, pan delay follows on new versions of jummbox.
                                if ((fromJummBox && !beforeTwo) || fromGoldBox || fromUltraBox || fromSlarmoosBox) newEffect.panDelay = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                if (fromTheepBox) newEffect.panMode = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            }
                            if (newEffect.type == EffectType.flanger) {
                                newEffect.flanger = clamp(0, Config.flangerRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.flangerSpeed = clamp(0, Config.flangerSpeedRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.flangerDepth = clamp(0, Config.flangerDepthRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.flangerFeedback = clamp(0, Config.flangerFeedbackRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            }
                            if (newEffect.type == EffectType.chorus) {
                                if (fromTheepBox) newEffect.chorus = clamp(0, (Config.chorusRange / 2) + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                else if (fromBeepBox) newEffect.chorus = clamp(0, (Config.chorusRange / 2) + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) * 4;
                                else newEffect.chorus = clamp(0, Config.chorusRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) * 2;
                            }
                            if (newEffect.type == EffectType.gain) {
                                newEffect.gain = clamp(0, Config.volumeRange, (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            }
                            if (newEffect.type == EffectType.echo) {
                                if (!fromTheepBox) newEffect.echoSustain = clamp(0, Config.echoSustainRange / 3, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) * 3;
                                else newEffect.echoSustain = clamp(0, Config.echoSustainRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.echoDelay = clamp(0, Config.echoDelayRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.echoPingPong = clamp(0, Config.panMax + 1, (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            }
                            if (newEffect.type == EffectType.reverb) {
                                if (fromBeepBox) {
                                    newEffect.reverb = clamp(0, Config.reverbRange, Math.round(base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * Config.reverbRange / 3.0));
                                } else {
                                    newEffect.reverb = clamp(0, Config.reverbRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                }
                            }
                            if (newEffect.type == EffectType.granular) {
                                newEffect.granular = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                newEffect.grainSize = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                newEffect.grainAmounts = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                newEffect.grainRange = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            }
                            if (newEffect.type == EffectType.ringModulation) {
                                newEffect.ringModulation = clamp(0, Config.ringModRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.ringModulationHz = clamp(0, Config.ringModHzRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.ringModWaveformIndex = clamp(0, Config.operatorWaves.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.ringModPulseWidth = clamp(0, Config.pulseWidthRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                newEffect.ringModHzOffset = clamp(Config.rmHzOffsetMin, Config.rmHzOffsetMax + 1, (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            }
                        }
                        instrument.mdeffects = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    }
                    else {
                        // i will admit it feels pretty good to describe a feature as "legacy"
                        // hopefully this will inspire me to add more compatability code (although im not 100% sure i got it right here) ~ theepie
                        const legacyEffectTypes: (EffectType | MDEffectType)[] = [EffectType.reverb, EffectType.chorus, EffectType.panning, EffectType.distortion, EffectType.bitcrusher, EffectType.eqFilter, EffectType.echo, MDEffectType.pitchShift, MDEffectType.detune, MDEffectType.vibrato, MDEffectType.transition, MDEffectType.chord, MDEffectType.noteRange, EffectType.ringModulation, EffectType.granular];
                        let bit: number = 0;
                        if (fromSlarmoosBox && !beforeFive) {
                            const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + 18);
                            for (let i = 0; i < 18; i++) {
                                bit = bits.read(1)
                                if (i > 6 && i < 13) instrument.mdeffects &= legacyEffectTypes[bit];
                                else if (bit == 1) instrument.addEffect(legacyEffectTypes[i] as EffectType);
                            }
                        } else {
                            const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + 12);
                            for (let i = 0; i < 12; i++) {
                                bit = bits.read(1)
                                if (i > 6) instrument.mdeffects &= legacyEffectTypes[bit];
                                else if (bit == 1) instrument.addEffect(legacyEffectTypes[i] as EffectType);
                            }
                        }
                        //TODO: add the rest of the compatability code lol
                    }

                    if (effectsIncludeTransition(instrument.mdeffects)) {
                        instrument.transition = clamp(0, Config.transitions.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    }
                    if (effectsIncludeChord(instrument.mdeffects)) {
                        instrument.chord = clamp(0, Config.chords.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        // Custom arpeggio speed... only in JB, and only if the instrument arpeggiates.
                        if (instrument.chord == Config.chords.dictionary["arpeggio"].index && (fromJummBox||fromGoldBox||fromUltraBox||fromSlarmoosBox)) {
                            instrument.arpeggioSpeed = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            instrument.fastTwoNoteArp = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) ? true : false;
                        }
                        if (instrument.chord == Config.chords.dictionary["monophonic"].index && fromSlarmoosBox && !beforeFive) {
                            instrument.monoChordTone = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        }
                    }
                    if (effectsIncludePitchShift(instrument.mdeffects)) {
                        instrument.pitchShift = clamp(0, Config.pitchShiftRange, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    }
                    if (effectsIncludeDetune(instrument.mdeffects)) {
                        if (fromBeepBox) {
                            // Convert from BeepBox's formula
                            instrument.detune = clamp(Config.detuneMin, Config.detuneMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            instrument.detune = Math.round((instrument.detune - 9) * (Math.abs(instrument.detune - 9) + 1) / 2 + Config.detuneCenter);
                        } else {
                            instrument.detune = clamp(Config.detuneMin, Config.detuneMax + 1, (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                    }
                    if (effectsIncludeVibrato(instrument.mdeffects)) {
                        instrument.vibrato = clamp(0, Config.vibratos.length + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);

                        // Custom vibrato
                        if (instrument.vibrato == Config.vibratos.length && (fromJummBox || fromGoldBox || fromUltraBox || fromSlarmoosBox)) {
                            instrument.vibratoDepth = clamp(0, Config.modulators.dictionary["vibrato depth"].maxRawVol + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) / 25;
                            instrument.vibratoSpeed = clamp(0, Config.modulators.dictionary["vibrato speed"].maxRawVol + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            instrument.vibratoDelay = clamp(0, Config.modulators.dictionary["vibrato delay"].maxRawVol + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                            instrument.vibratoType = clamp(0, Config.vibratoTypes.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                        // Enforce standard vibrato settings
                        else {
                            instrument.vibratoDepth = Config.vibratos[instrument.vibrato].amplitude;
                            instrument.vibratoSpeed = 10; // Normal speed
                            instrument.vibratoDelay = Config.vibratos[instrument.vibrato].delayTicks / 2;
                            instrument.vibratoType = Config.vibratos[instrument.vibrato].type;
                        }
                    }
                }
                // Clamp the range...?
                // if (instrument.effects.length != instrument.effectCount) //not sure what to do exactly
            } break;
            case SongTagCode.volume: {
                if (beforeThree && fromBeepBox) {
                    const channelIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    const instrument: Instrument = this.channels[channelIndex].instruments[0];
                    instrument.volume = Math.round(clamp(-Config.volumeRange / 2, 1, -base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 5.0));
                } else if (beforeSix && fromBeepBox) {
                    for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                        for (const instrument of this.channels[channelIndex].instruments) {
                            instrument.volume = Math.round(clamp(-Config.volumeRange / 2, 1, -base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 5.0));
                        }
                    }
                } else if (beforeSeven && fromBeepBox) {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.volume = Math.round(clamp(-Config.volumeRange / 2, 1, -base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 5.0));
                } else if (fromBeepBox) {
                    // Beepbox v9's volume range is 0-7 (0 is max, 7 is mute)
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.volume = Math.round(clamp(-Config.volumeRange / 2, 1, -base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 25.0 / 7.0));
                } else if (!fromTheepBox) {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.volume = Math.round(clamp(-Config.volumeRange / 2, Config.volumeRange / 2 + 1, ((base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) | (base64CharCodeToInt[compressed.charCodeAt(charIndex++)])) - Config.volumeRange / 2) * 2.0);
                } else {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    // shoutouts to later waffling
                    instrument.volume = Math.round(clamp(-Config.volumeRange / 2, Config.volumeRange / 2 + 1, ((base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) | (base64CharCodeToInt[compressed.charCodeAt(charIndex++)])) - Config.volumeRange / 2));
                }
            } break;
            case SongTagCode.pan: { // ideally this tagcode would add a new panning effect. however, there are many other parts of the code that add this aswell! TODO: make this work again? ~ theepie
                /*
                if (beforeNine && fromBeepBox) {
                    // Beepbox has a panMax of 8 (9 total positions), Jummbox has a panMax of 100 (101 total positions)
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.pan = clamp(0, Config.panMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * ((Config.panMax) / 8.0));
                } else if ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox)) {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.pan = clamp(0, Config.panMax + 1, (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    // Pan delay follows on v3 + v4
                    if (fromJummBox && !beforeThree || fromGoldBox || fromUltraBox || fromSlarmoosBox) {
                        instrument.panDelay = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    }
                } else {
                    // Do nothing? This song tag code is deprecated for now.
                } */
            } break;
            case SongTagCode.detune: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];

                if ((fromJummBox && beforeFive) || (beforeFour && fromGoldBox)) {
                    // Before jummbox v5, detune was -50 to 50. Now it is 0 to 400
                    instrument.detune = clamp(Config.detuneMin, Config.detuneMax + 1, ((base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) * 4);
                    instrument.mdeffects |= 1 << MDEffectType.detune;
                } else {
                    // Now in v5, tag code is deprecated and handled thru detune effects.
                }
            } break;
            case SongTagCode.customChipWave: {
                let instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                // Pop custom wave values
                for (let j: number = 0; j < 64; j++) {
                    instrument.customChipWave[j]
                    = clamp(-24, 25, base64CharCodeToInt[compressed.charCodeAt(charIndex++)] - 24);
                }

                let sum: number = 0.0;
                for (let i: number = 0; i < instrument.customChipWave.length; i++) {
                    sum += instrument.customChipWave[i];
                }
                const average: number = sum / instrument.customChipWave.length;

                // Perform the integral on the wave. The chipSynth will perform the derivative to get the original wave back but with antialiasing.
                let cumulative: number = 0;
                let wavePrev: number = 0;
                for (let i: number = 0; i < instrument.customChipWave.length; i++) {
                    cumulative += wavePrev;
                    wavePrev = instrument.customChipWave[i] - average;
                    instrument.customChipWaveIntegral[i] = cumulative;
                }

                // 65th, last sample is for anti-aliasing
                instrument.customChipWaveIntegral[64] = 0.0;

            } break;
            case SongTagCode.limiterSettings: {
                let nextValue: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];

                // Check if limiter settings are used... if not, restore to default
                if (nextValue == 0x3f) {
                    this.restoreLimiterDefaults();
                }
                else {
                    // Limiter is used, grab values
                    this.compressionRatio = (nextValue < 10 ? nextValue / 10 : (1 + (nextValue - 10) / 60));
                    nextValue = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    this.limitRatio = (nextValue < 10 ? nextValue / 10 : (nextValue - 9));
                    this.limitDecay = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    this.limitRise = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)] * 250.0) + 2000.0;
                    this.compressionThreshold = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] / 20.0;
                    this.limitThreshold = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] / 20.0;
                    this.masterGain = ((base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) / 50.0;
                }
            } break;
            case SongTagCode.channelNames: {
                for (let channel: number = 0; channel < this.getChannelCount(); channel++) {
                    // Length of channel name string. Due to some crazy Unicode characters this needs to be 2 bytes...
                    var channelNameLength;
                    if (beforeFour && !fromGoldBox && !fromUltraBox && !fromSlarmoosBox)
                        channelNameLength = base64CharCodeToInt[compressed.charCodeAt(charIndex++)]
                    else
                        channelNameLength = ((base64CharCodeToInt[compressed.charCodeAt(charIndex++)] << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    this.channels[channel].name = decodeURIComponent(compressed.substring(charIndex, charIndex + channelNameLength));

                    charIndex += channelNameLength;

                    if (fromTheepBox) this.channels[channel].color = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                }
            } break;
            case SongTagCode.algorithm: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                if (instrument.type == InstrumentType.fm) {
                    instrument.algorithm = clamp(0, Config.algorithms.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                }
                else {
                    instrument.algorithm6Op = clamp(0, Config.algorithms6Op.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    instrument.customAlgorithm.fromPreset(instrument.algorithm6Op);
                    if (compressed.charCodeAt(charIndex) == SongTagCode.chord) {
                        let carrierCountTemp = clamp(1, Config.operatorCount + 2 + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex + 1)]);
                        charIndex++
                        let tempModArray: number[][] = [];
                        if (compressed.charCodeAt(charIndex + 1) == SongTagCode.effects) {
                            charIndex++
                            let j: number = 0;
                            charIndex++
                            while (compressed.charCodeAt(charIndex) != SongTagCode.effects) {
                                tempModArray[j] = [];
                                let o: number = 0;
                                while (compressed.charCodeAt(charIndex) != SongTagCode.operatorWaves) {
                                    tempModArray[j][o] = clamp(1, Config.operatorCount + 3, base64CharCodeToInt[compressed.charCodeAt(charIndex)]);
                                    o++
                                    charIndex++
                                }
                                j++;
                                charIndex++
                            }
                            instrument.customAlgorithm.set(carrierCountTemp, tempModArray);
                            charIndex++; //????
                        }
                    }
                }
                if ((beforeNine && fromBeepBox) || (beforeFive && fromJummBox) || (beforeFour && fromGoldBox)) {
                    // The algorithm determines the carrier count, which affects how legacy settings are imported.
                    const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                    instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                }
            } break;
            case SongTagCode.supersaw: {
                if (fromGoldBox && !beforeFour && beforeSix) {
                    //is it more useful to save base64 characters or url length?
                    const chipWaveForCompat = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    if ((chipWaveForCompat + 62) > 85) {
                        if (document.URL.substring(document.URL.length - 13).toLowerCase() != "legacysamples") {
                            if (!willLoadLegacySamplesForOldSongs) {
                                willLoadLegacySamplesForOldSongs = true;
                                Config.willReloadForCustomSamples = true;
                                EditorConfig.customSamples = ["legacySamples"];
                                loadBuiltInSamples(0);
                            }
                        }
                    }

                    if ((chipWaveForCompat + 62) > 78) {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, chipWaveForCompat + 63);
                    }
                    else if ((chipWaveForCompat + 62) > 67) {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, chipWaveForCompat + 61);
                    }
                    else if ((chipWaveForCompat + 62) == 67) {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = 40;
                    }
                    else {
                        this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].chipWave = clamp(0, Config.chipWaves.length, chipWaveForCompat + 62);
                    }
                } else {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.supersawDynamism = clamp(0, Config.supersawDynamismMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    instrument.supersawSpread = clamp(0, Config.supersawSpreadMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    instrument.supersawShape = clamp(0, Config.supersawShapeMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                }
            } break;
            case SongTagCode.feedbackType: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                if (instrument.type == InstrumentType.fm) {
                    instrument.feedbackType = clamp(0, Config.feedbacks.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                }
                else {
                    instrument.feedbackType6Op = clamp(0, Config.feedbacks6Op.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    instrument.customFeedbackType.fromPreset(instrument.feedbackType6Op);
                    let tempModArray: number[][] = [];
                    if (compressed.charCodeAt(charIndex) == SongTagCode.effects) {
                        let j: number = 0;
                        charIndex++
                        while (compressed.charCodeAt(charIndex) != SongTagCode.effects) {
                            tempModArray[j] = [];
                            let o: number = 0;
                            while (compressed.charCodeAt(charIndex) != SongTagCode.operatorWaves) {
                                tempModArray[j][o] = clamp(1, Config.operatorCount + 2, base64CharCodeToInt[compressed.charCodeAt(charIndex)]);
                                o++
                                charIndex++
                            }
                            j++;
                            charIndex++
                        }
                        instrument.customFeedbackType.set(tempModArray);
                        charIndex++; //???? weirdly needs to skip the end character or it'll use that next loop instead of like just moving to the next one itself
                    }
                }

            } break;
            case SongTagCode.feedbackAmplitude: {
                this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator].feedbackAmplitude = clamp(0, Config.operatorAmplitudeMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
            } break;
            case SongTagCode.feedbackEnvelope: {
                if ((beforeNine && fromBeepBox) || (beforeFive && fromJummBox) || (beforeFour && fromGoldBox)) {
                    const pregoldToEnvelope: number[] = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 27, 28, 29, 32, 33, 34, 31, 11];
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];

                    let aa: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    if ((beforeTwo && fromGoldBox) || (!fromGoldBox && !fromUltraBox && !fromSlarmoosBox)) aa = pregoldToEnvelope[aa];
                    legacySettings.feedbackEnvelope = Song._envelopeFromLegacyIndex(base64CharCodeToInt[aa]);
                    instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                } else {
                    // Do nothing? This song tag code is deprecated for now.
                }
            } break;
            case SongTagCode.operatorFrequencies: {
                const instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                if (beforeThree && fromGoldBox) {
                    const freqToGold3 = [4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 2, 1, 9, 17, 19, 21, 23, 0, 3];

                    for (let o = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                        instrument.operators[o].frequency = freqToGold3[clamp(0, freqToGold3.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)])];
                    }
                }
                else if (!fromGoldBox && !fromUltraBox && !fromSlarmoosBox) {
                    const freqToUltraBox = [4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16, 18, 20, 23, 27, 2, 1, 9, 17, 19, 21, 23, 0, 3];

                    for (let o = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                        instrument.operators[o].frequency = freqToUltraBox[clamp(0, freqToUltraBox.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)])];
                    }

                }
                else {
                    for (let o = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                        instrument.operators[o].frequency = clamp(0, Config.operatorFrequencies.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    }
                }
            } break;
            case SongTagCode.operatorAmplitudes: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                for (let o: number = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                    instrument.operators[o].amplitude = clamp(0, Config.operatorAmplitudeMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                }
            } break;
            case SongTagCode.envelopes: {
                const pregoldToEnvelope: number[] = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 27, 28, 29, 32, 33, 34, 31, 11];
                const jummToUltraEnvelope: number[] = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23, 24, 25, 58, 59, 60];
                const slarURL3toURL4Envelope: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14];
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                if ((beforeNine && fromBeepBox) || (beforeFive && fromJummBox) || (beforeFour && fromGoldBox)) {
                    const legacySettings: LegacySettings = legacySettingsCache![instrumentChannelIterator][instrumentIndexIterator];
                    legacySettings.operatorEnvelopes = [];
                    for (let o: number = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                        let aa: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        if ((beforeTwo && fromGoldBox) || (fromBeepBox)) aa = pregoldToEnvelope[aa];
                        if (fromJummBox) aa = jummToUltraEnvelope[aa];
                        legacySettings.operatorEnvelopes[o] = Song._envelopeFromLegacyIndex(aa);
                    }
                    instrument.convertLegacySettings(legacySettings, forceSimpleFilter);
                } else {
                    const envelopeCount: number = clamp(0, Config.maxEnvelopeCount + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    // JB v6 adds some envelope options here in the sequence.
                    let envelopeDiscrete: boolean = false;
                    if ((fromJummBox && !beforeSix) || (fromUltraBox && !beforeFive) || (fromSlarmoosBox)) {
                        instrument.envelopeSpeed = clamp(0, Config.modulators.dictionary["envelope speed"].maxRawVol + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        if(!fromSlarmoosBox || beforeFive) {
                            envelopeDiscrete = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) ? true : false;
                        }
                    }
                    for (let i: number = 0; i < envelopeCount; i++) {
                        const target: number = clamp(0, Config.instrumentAutomationTargets.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        let index: number = 0;
                        const maxCount: number = Config.instrumentAutomationTargets[target].maxCount;
                        if (maxCount > 1) {
                            index = clamp(0, maxCount, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                        let aa: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        if ((beforeTwo && fromGoldBox) || (fromBeepBox)) aa = pregoldToEnvelope[aa];
                        if (fromJummBox) aa = jummToUltraEnvelope[aa];
                        if (!fromSlarmoosBox && aa >= 2) aa++; //2 for pitch
                        let updatedEnvelopes: boolean = false;
                        let perEnvelopeSpeed: number = 1;
                        if (!fromSlarmoosBox || beforeThree) {
                            updatedEnvelopes = true;
                            perEnvelopeSpeed = Config.envelopes[aa].speed;
                            aa = Config.envelopes[aa].type; //update envelopes
                        } else if (beforeFour && aa >= 3) aa++; //3 for random
                        let isTremolo2: boolean = false;
                        if ((fromSlarmoosBox && !beforeThree && beforeFour) || updatedEnvelopes) { //remove tremolo2
                            if(aa == 9) isTremolo2 = true;
                            aa = slarURL3toURL4Envelope[aa];
                        }
                        const envelope: number = clamp(0, ((fromSlarmoosBox && !beforeThree || updatedEnvelopes) ? Config.newEnvelopes.length : Config.envelopes.length), aa);
                        let pitchEnvelopeStart: number = 0;
                        let pitchEnvelopeEnd: number = Config.maxPitch;
                        let envelopeInverse: boolean = false;
                        perEnvelopeSpeed = (fromSlarmoosBox && !beforeThree) ? Config.newEnvelopes[envelope].speed : perEnvelopeSpeed;
                        let perEnvelopeLowerBound: number = 0;
                        let perEnvelopeUpperBound: number = 1;
                        let steps: number = 2;
                        let seed: number = 2;
                        let waveform: number = LFOEnvelopeTypes.sine;
                        //pull out unique envelope setting values first, then general ones
                        if (fromSlarmoosBox && !beforeFour) {
                            if (Config.newEnvelopes[envelope].name == "lfo") {
                                waveform = clamp(0, LFOEnvelopeTypes.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                if (waveform == LFOEnvelopeTypes.steppedSaw || waveform == LFOEnvelopeTypes.steppedTri) {
                                    steps = clamp(1, Config.randomEnvelopeStepsMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                }
                            } else if (Config.newEnvelopes[envelope].name == "random") {
                                steps = clamp(1, Config.randomEnvelopeStepsMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                seed = clamp(1, Config.randomEnvelopeSeedMax + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                waveform = clamp(0, RandomEnvelopeTypes.length,base64CharCodeToInt[compressed.charCodeAt(charIndex++)]); //we use waveform for the random type as well
                            }
                        }
                        if (fromSlarmoosBox && !beforeThree) {
                            if (Config.newEnvelopes[envelope].name == "pitch") {
                                if (!instrument.isNoiseInstrument) {
                                    let pitchEnvelopeCompact: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                    pitchEnvelopeStart = clamp(0, Config.maxPitch+1, pitchEnvelopeCompact * 64 + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    pitchEnvelopeCompact = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                                    pitchEnvelopeEnd = clamp(0, Config.maxPitch+1, pitchEnvelopeCompact * 64 + base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                } else {
                                    pitchEnvelopeStart = clamp(0, Config.drumCount, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                    pitchEnvelopeEnd = clamp(0, Config.drumCount, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                                }
                            }
                            let checkboxValues: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            if (fromSlarmoosBox && !beforeFive) {
                                envelopeDiscrete = (checkboxValues >> 1) == 1 ? true : false;
                            }
                            envelopeInverse = (checkboxValues & 1) == 1 ? true : false;
                            if (Config.newEnvelopes[envelope].name != "pitch" && Config.newEnvelopes[envelope].name != "note size" && Config.newEnvelopes[envelope].name != "punch" && Config.newEnvelopes[envelope].name != "none") {
                                perEnvelopeSpeed = Config.perEnvelopeSpeedIndices[base64CharCodeToInt[compressed.charCodeAt(charIndex++)]];
                            }
                            perEnvelopeLowerBound = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] / 10;
                            perEnvelopeUpperBound = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] / 10;
                        }
                        if (!fromSlarmoosBox || beforeFour) { //update tremolo2
                            if (isTremolo2) {
                                waveform = LFOEnvelopeTypes.sine;
                                if (envelopeInverse) {
                                    perEnvelopeUpperBound = Math.floor((perEnvelopeUpperBound / 2) * 10) / 10;
                                    perEnvelopeLowerBound = Math.floor((perEnvelopeLowerBound / 2) * 10) / 10;
                                } else {
                                    perEnvelopeUpperBound = Math.floor((0.5 + (perEnvelopeUpperBound - perEnvelopeLowerBound) / 2) * 10) / 10;
                                    perEnvelopeLowerBound = 0.5;
                                }
                            }
                        }

                        instrument.addEnvelope(target, index, envelope, true, pitchEnvelopeStart, pitchEnvelopeEnd, envelopeInverse, perEnvelopeSpeed, perEnvelopeLowerBound, perEnvelopeUpperBound, steps, seed, waveform, envelopeDiscrete);
                        if (fromSlarmoosBox && beforeThree && !beforeTwo) {
                            let pitchEnvelopeCompact: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            instrument.envelopes[i].pitchEnvelopeStart = pitchEnvelopeCompact * 64 + base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            pitchEnvelopeCompact = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            instrument.envelopes[i].pitchEnvelopeEnd = pitchEnvelopeCompact * 64 + base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                            instrument.envelopes[i].inverse = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] == 1 ? true : false;
                        }
                    }

                    let instrumentPitchEnvelopeStart: number = 0;
                    let instrumentPitchEnvelopeEnd: number = Config.maxPitch;
                    let instrumentEnvelopeInverse: boolean = false;
                    if (fromSlarmoosBox && beforeTwo) {
                        let pitchEnvelopeCompact: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        instrumentPitchEnvelopeStart = pitchEnvelopeCompact * 64 + base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        pitchEnvelopeCompact = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        instrumentPitchEnvelopeEnd = pitchEnvelopeCompact * 64 + base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        instrumentEnvelopeInverse = base64CharCodeToInt[compressed.charCodeAt(charIndex++)] === 1 ? true : false;
                        for (let i: number = 0; i < envelopeCount; i++) {
                            instrument.envelopes[i].pitchEnvelopeStart = instrumentPitchEnvelopeStart;
                            instrument.envelopes[i].pitchEnvelopeEnd = instrumentPitchEnvelopeEnd;
                            instrument.envelopes[i].inverse = Config.envelopes[instrument.envelopes[i].envelope].name == "pitch" ? instrumentEnvelopeInverse : false;
                        }
                    }

                }
            } break;
            case SongTagCode.operatorWaves: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];

                if (beforeThree && fromGoldBox) {
                    for (let o: number = 0; o < Config.operatorCount; o++) {
                        const pre3To3g = [0, 1, 3, 2, 2, 2, 4, 5];
                        const old: number = clamp(0, pre3To3g.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        if (old == 3) {
                            instrument.operators[o].pulseWidth = 5;
                        } else if (old == 4) {
                            instrument.operators[o].pulseWidth = 4;
                        } else if (old == 5) {
                            instrument.operators[o].pulseWidth = 6;
                        }
                        instrument.operators[o].waveform = pre3To3g[old];
                    }
                } else {
                    for (let o: number = 0; o < (instrument.type == InstrumentType.fm6op ? 6 : Config.operatorCount); o++) {
                        if (fromJummBox) {
                            const jummToG = [0, 1, 3, 2, 4, 5];
                            instrument.operators[o].waveform = jummToG[clamp(0, Config.operatorWaves.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)])];
                        } else {
                            instrument.operators[o].waveform = clamp(0, Config.operatorWaves.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                        // Pulse width follows, if it is a pulse width operator wave
                        if (instrument.operators[o].waveform == 2) {
                            instrument.operators[o].pulseWidth = clamp(0, Config.pwmOperatorWaves.length, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                        }
                    }
                }

            } break;
            case SongTagCode.spectrum: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                if (instrument.type == InstrumentType.spectrum) {
                    const byteCount: number = Math.ceil(Config.spectrumControlPoints * Config.spectrumControlPointBits / 6)
                    const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + byteCount);
                    for (let i: number = 0; i < Config.spectrumControlPoints; i++) {
                        instrument.spectrumWave.spectrum[i] = bits.read(Config.spectrumControlPointBits);
                    }
                    instrument.spectrumWave.markCustomWaveDirty();
                    charIndex += byteCount;
                } else if (instrument.type == InstrumentType.drumset) {
                    const byteCount: number = Math.ceil(Config.drumCount * Config.spectrumControlPoints * Config.spectrumControlPointBits / 6)
                    const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + byteCount);
                    for (let j: number = 0; j < Config.drumCount; j++) {
                        for (let i: number = 0; i < Config.spectrumControlPoints; i++) {
                            instrument.drumsetSpectrumWaves[j].spectrum[i] = bits.read(Config.spectrumControlPointBits);
                        }
                        instrument.drumsetSpectrumWaves[j].markCustomWaveDirty();
                    }
                    charIndex += byteCount;
                } else {
                    throw new Error("Unhandled instrument type for spectrum song tag code.");
                }
            } break;
            case SongTagCode.harmonics: {
                const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                const byteCount: number = Math.ceil(Config.harmonicsControlPoints * Config.harmonicsControlPointBits / 6);
                const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + byteCount);
                for (let i: number = 0; i < Config.harmonicsControlPoints; i++) {
                    instrument.harmonicsWave.harmonics[i] = bits.read(Config.harmonicsControlPointBits);
                }
                instrument.harmonicsWave.markCustomWaveDirty();
                charIndex += byteCount;
            } break;
            case SongTagCode.aliases: {
                if ((fromJummBox && beforeFive) || (fromGoldBox && beforeFour)) {
                    const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                    instrument.aliases = (base64CharCodeToInt[compressed.charCodeAt(charIndex++)]) ? true : false;
                    if (instrument.aliases) {
                        let newEffect: Effect = instrument.addEffect(EffectType.distortion);
                        newEffect.distortion = 0;
                    }
                } else {
                    if (fromUltraBox || fromSlarmoosBox) {
                        const instrument: Instrument = this.channels[instrumentChannelIterator].instruments[instrumentIndexIterator];
                        instrument.decimalOffset = clamp(0, 50 + 1, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    }
                }
            }
            break;
            case SongTagCode.bars: {
                let subStringLength: number;
                if (beforeThree && fromBeepBox) {
                    const channelIndex: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    const barCount: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    subStringLength = Math.ceil(barCount * 0.5);
                    const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + subStringLength);
                    for (let i: number = 0; i < barCount; i++) {
                        this.channels[channelIndex].bars[i] = bits.read(3) + 1;
                    }
                } else if (beforeFive && fromBeepBox) {
                    let neededBits: number = 0;
                    while ((1 << neededBits) < this.patternsPerChannel) neededBits++;
                    subStringLength = Math.ceil(this.getChannelCount() * this.barCount * neededBits / 6);
                    const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + subStringLength);
                    for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                        for (let i: number = 0; i < this.barCount; i++) {
                            this.channels[channelIndex].bars[i] = bits.read(neededBits) + 1;
                        }
                    }
                } else {
                    let neededBits: number = 0;
                    while ((1 << neededBits) < this.patternsPerChannel + 1) neededBits++;
                    subStringLength = Math.ceil(this.getChannelCount() * this.barCount * neededBits / 6);
                    const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + subStringLength);
                    for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
                        for (let i: number = 0; i < this.barCount; i++) {
                            this.channels[channelIndex].bars[i] = bits.read(neededBits);
                        }
                    }
                }
                charIndex += subStringLength;
            } break;
            case SongTagCode.patterns: {
                let bitStringLength: number = 0;
                let channelIndex: number;
                let largerChords: boolean = !((beforeFour && fromJummBox) || fromBeepBox);
                let recentPitchBitLength: number = (largerChords ? 4 : 3);
                let recentPitchLength: number = (largerChords ? 16 : 8);
                if (beforeThree && fromBeepBox) {
                    channelIndex = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];

                    // The old format used the next character to represent the number of patterns in the channel, which is usually eight, the default.
                    charIndex++; //let patternCount: number = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];

                    bitStringLength = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                    bitStringLength = bitStringLength << 6;
                    bitStringLength += base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                } else {
                    channelIndex = 0;
                    let bitStringLengthLength: number = validateRange(1, 4, base64CharCodeToInt[compressed.charCodeAt(charIndex++)]);
                    while (bitStringLengthLength > 0) {
                        bitStringLength = bitStringLength << 6;
                        bitStringLength += base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
                        bitStringLengthLength--;
                    }
                }

                const bits: BitFieldReader = new BitFieldReader(compressed, charIndex, charIndex + bitStringLength);
                charIndex += bitStringLength;

                const bitsPerNoteSize: number = Song.getNeededBits(Config.noteSizeMax);
                let songReverbChannel: number = -1;
                let songReverbInstrument: number = -1;
                let songReverbIndex: number = -1;

                // @TODO: Include GoldBox here.
                const shouldCorrectTempoMods: boolean = fromJummBox;
                const jummboxTempoMin: number = 30;

                while (true) {
                    const channel: Channel = this.channels[channelIndex];
                    const isNoiseChannel: boolean = this.getChannelIsNoise(channelIndex);
                    const isModChannel: boolean = this.getChannelIsMod(channelIndex);

                    const maxInstrumentsPerPattern: number = this.getMaxInstrumentsPerPattern(channelIndex);
                    const neededInstrumentCountBits: number = Song.getNeededBits(maxInstrumentsPerPattern - Config.instrumentCountMin);

                    const neededInstrumentIndexBits: number = Song.getNeededBits(channel.instruments.length - 1);

                    // Some info about modulator settings immediately follows in mod channels.
                    if (isModChannel) {
                        let jumfive: boolean = (beforeFive && fromJummBox) || (beforeFour && fromGoldBox)

                        // 2 more indices for 'all' and 'active'
                        const neededModInstrumentIndexBits: number = (jumfive) ? neededInstrumentIndexBits : Song.getNeededBits(this.getMaxInstrumentsPerChannel() + 2);

                        for (let instrumentIndex: number = 0; instrumentIndex < channel.instruments.length; instrumentIndex++) {

                            let instrument: Instrument = channel.instruments[instrumentIndex];

                            for (let mod: number = 0; mod < Config.modCount; mod++) {
                                // Still using legacy "mod status" format, but doing it manually as it's only used in the URL now.
                                // 0 - For pitch/noise
                                // 1 - (used to be For noise, not needed)
                                // 2 - For song
                                // 3 - None
                                let status: number = bits.read(2);

                                switch (status) {
                                    case 0: // Pitch
                                        let modChannelLength: number = bits.read(8);
                                        for (let i: number = 0; i < modChannelLength; i++) instrument.modChannels[mod][i] = clamp(0, this.pitchChannelCount + this.noiseChannelCount + 1, bits.read(8));
                                        let modInstrumentLength: number = bits.read(8);
                                        for (let i: number = 0; i < modInstrumentLength; i++) instrument.modInstruments[mod][i] = clamp(0, this.channels[instrument.modChannels[mod][i]].instruments.length + 2, bits.read(neededModInstrumentIndexBits));
                                        break;
                                    case 1: // Noise
                                        // Getting a status of 1 means this is legacy mod info. Need to add pitch channel count, as it used to just store noise channel index and not overall channel index
                                        instrument.modChannels[mod][0] = this.pitchChannelCount + clamp(0, this.noiseChannelCount + 1, bits.read(8));
                                        instrument.modInstruments[mod][0] = clamp(0, this.channels[instrument.modChannels[mod][0]].instruments.length + 2, bits.read(neededInstrumentIndexBits));
                                        break;
                                    case 2: // For song
                                        instrument.modChannels[mod][0] = -1;
                                        break;
                                    case 3: // None
                                        instrument.modChannels[mod][0] = -2;
                                        break;
                                }

                                // Mod setting is only used if the status isn't "none".
                                if (status != 3) {
                                    instrument.modulators[mod] = bits.read(6);
                                }

                                if (!jumfive && (Config.modulators[instrument.modulators[mod]].name == "post eq" || Config.modulators[instrument.modulators[mod]].name == "pre eq" || Config.modulators[instrument.modulators[mod]].name == "song eq")) {
                                    instrument.modFilterTypes[mod] = bits.read(6);
                                }

                                if (Config.modulators[instrument.modulators[mod]].name == "individual envelope speed" ||
                                    Config.modulators[instrument.modulators[mod]].name == "reset envelope" ||
                                    Config.modulators[instrument.modulators[mod]].name == "individual envelope lower bound" ||
                                    Config.modulators[instrument.modulators[mod]].name == "individual envelope upper bound"
                                ) {
                                    instrument.modEnvelopeNumbers[mod] = bits.read(6);
                                }

                                if (jumfive && instrument.modChannels[mod][0] >= 0) {
                                    let forNoteFilter: boolean = this.channels[instrument.modChannels[mod][0]].instruments[instrument.modInstruments[mod][0]].effectsIncludeType(EffectType.eqFilter);

                                    // For legacy filter cut/peak, need to denote since scaling must be applied
                                    if (instrument.modulators[mod] == 7) {
                                        // Legacy filter cut index
                                        // Check if there is no filter dot on prospective filter. If so, add a low pass at max possible freq.

                                        if (forNoteFilter) {
                                            instrument.modulators[mod] = Config.modulators.dictionary["note filt cut"].index;
                                        }
                                        else {
                                            instrument.modulators[mod] = Config.modulators.dictionary["eq filt cut"].index;
                                        }

                                        instrument.modFilterTypes[mod] = 1; // Dot 1 X

                                    }
                                    else if (instrument.modulators[mod] == 8) {
                                        // Legacy filter peak index
                                        if (forNoteFilter) {
                                            instrument.modulators[mod] = Config.modulators.dictionary["note filt peak"].index;
                                        }
                                        else {
                                            instrument.modulators[mod] = Config.modulators.dictionary["eq filt peak"].index;
                                        }

                                        instrument.modFilterTypes[mod] = 2; // Dot 1 Y
                                    }
                                }
                                else if (jumfive) {
                                    // Check for song reverb mod, which must be handled differently now that it is a multiplier
                                    if (instrument.modulators[mod] == Config.modulators.dictionary["song reverb"].index) {
                                        songReverbChannel = channelIndex;
                                        songReverbInstrument = instrumentIndex;
                                        songReverbIndex = mod;
                                    }
                                }

                                // Based on setting, enable some effects for the modulated instrument. This isn't always set, say if the instrument's pan was right in the center.
                                // Only used on import of old songs, because sometimes an invalid effect can be set in a mod in the new version that is actually unused. In that case,
                                // keeping the mod invalid is better since it preserves the state.
                                if (jumfive && Config.modulators[instrument.modulators[mod]].associatedEffect != EffectType.length) {
                                    this.channels[instrument.modChannels[mod][0]].instruments[instrument.modInstruments[mod][0]].addEffect(Config.modulators[instrument.modulators[mod]].associatedEffect);
                                }
                            }
                        }
                    }

                    // Scalar applied to detune mods since its granularity was upped. Could be repurposed later if any other granularity changes occur.
                    const detuneScaleNotes: number[][] = [];
                    for (let j: number = 0; j < channel.instruments.length; j++) {
                        detuneScaleNotes[j] = [];
                        for (let i: number = 0; i < Config.modCount; i++) {
                            detuneScaleNotes[j][Config.modCount - 1 - i] = 1 + 3 * +(((beforeFive && fromJummBox) || (beforeFour && fromGoldBox)) && isModChannel && (channel.instruments[j].modulators[i] == Config.modulators.dictionary["detune"].index));
                        }
                    }
                    const octaveOffset: number = (isNoiseChannel || isModChannel) ? 0 : channel.octave * 12;
                    let lastPitch: number = ((isNoiseChannel || isModChannel) ? 4 : octaveOffset);
                    const recentPitches: number[] = isModChannel ? [0, 1, 2, 3, 4, 5] : (isNoiseChannel ? [4, 6, 7, 2, 3, 8, 0, 10] : [0, 7, 12, 19, 24, -5, -12]);
                    const recentShapes: any[] = [];
                    for (let i: number = 0; i < recentPitches.length; i++) {
                        recentPitches[i] += octaveOffset;
                    }
                    for (let i: number = 0; i < this.patternsPerChannel; i++) {
                        const newPattern: Pattern = channel.patterns[i];

                        if ((beforeNine && fromBeepBox) || (beforeFive && fromJummBox) || (beforeFour && fromGoldBox)) {
                            newPattern.instruments[0] = validateRange(0, channel.instruments.length - 1, bits.read(neededInstrumentIndexBits));
                            newPattern.instruments.length = 1;
                        } else {
                            if (this.patternInstruments) {
                                const instrumentCount: number = validateRange(Config.instrumentCountMin, maxInstrumentsPerPattern, bits.read(neededInstrumentCountBits) + Config.instrumentCountMin);
                                for (let j: number = 0; j < instrumentCount; j++) {
                                    newPattern.instruments[j] = validateRange(0, channel.instruments.length - 1 + +(isModChannel) * 2, bits.read(neededInstrumentIndexBits));
                                }
                                newPattern.instruments.length = instrumentCount;
                            } else {
                                newPattern.instruments[0] = 0;
                                newPattern.instruments.length = Config.instrumentCountMin;
                            }
                        }

                        if (!(fromBeepBox && beforeThree) && bits.read(1) == 0) {
                            newPattern.notes.length = 0;
                            continue;
                        }

                        let curPart: number = 0;
                        const newNotes: Note[] = newPattern.notes;
                        let noteCount: number = 0;
                        // Due to arbitrary note positioning, mod channels don't end the count until curPart actually exceeds the max
                        while (curPart < this.beatsPerBar * Config.partsPerBeat + (+isModChannel)) {

                            const useOldShape: boolean = bits.read(1) == 1;
                            let newNote: boolean = false;
                            let shapeIndex: number = 0;
                            if (useOldShape) {
                                shapeIndex = validateRange(0, recentShapes.length - 1, bits.readLongTail(0, 0));
                            } else {
                                newNote = bits.read(1) == 1;
                            }

                            if (!useOldShape && !newNote) {
                                // For mod channels, check if you need to move backward too (notes can appear in any order and offset from each other).
                                if (isModChannel) {
                                    const isBackwards: boolean = bits.read(1) == 1;
                                    const restLength: number = bits.readPartDuration();
                                    if (isBackwards) {
                                        curPart -= restLength;
                                    }
                                    else {
                                        curPart += restLength;
                                    }
                                } else {
                                    const restLength: number = (beforeSeven && fromBeepBox)
                                    ? bits.readLegacyPartDuration() * Config.partsPerBeat / Config.rhythms[this.rhythm].stepsPerBeat
                                    : bits.readPartDuration();
                                    curPart += restLength;

                                }
                            } else {
                                let shape: any;
                                if (useOldShape) {
                                    shape = recentShapes[shapeIndex];
                                    recentShapes.splice(shapeIndex, 1);
                                } else {
                                    shape = {};

                                    if (!largerChords) {
                                        // Old format: X 1's followed by a 0 => X+1 pitches, up to 4
                                        shape.pitchCount = 1;
                                        while (shape.pitchCount < 4 && bits.read(1) == 1) shape.pitchCount++;
                                    }
                                    else {
                                        // New format is:
                                        //      0: 1 pitch
                                        // 1[XXX]: 3 bits of binary signifying 2+ pitches
                                        if (bits.read(1) == 1) {
                                            shape.pitchCount = bits.read(3) + 2;
                                        }
                                        else {
                                            shape.pitchCount = 1;
                                        }
                                    }

                                    if (fromTheepBox) {
                                        if (bits.read(1) == 1) {
                                            shape.startOffset = bits.read(31);
                                        }
                                    } else {
                                        shape.startOffset = 0;
                                    }

                                    shape.pinCount = bits.readPinCount();
                                    if (fromBeepBox) {
                                        shape.initialSize = bits.read(2) * 2;
                                    } else if (!isModChannel) {
                                        shape.initialSize = bits.read(bitsPerNoteSize);
                                    } else {
                                        shape.initialSize = bits.read(11);
                                    }

                                    shape.pins = [];
                                    shape.length = 0;
                                    shape.bendCount = 0;
                                    for (let j: number = 0; j < shape.pinCount; j++) {
                                        let pinObj: any = {};
                                        pinObj.pitchBend = bits.read(1) == 1;
                                        if (pinObj.pitchBend) shape.bendCount++;
                                        shape.length += (beforeSeven && fromBeepBox)
                                        ? bits.readLegacyPartDuration() * Config.partsPerBeat / Config.rhythms[this.rhythm].stepsPerBeat
                                        : bits.readPartDuration();
                                        pinObj.time = shape.length;
                                        if (fromBeepBox) {
                                            pinObj.size = bits.read(2) * 2;
                                        } else if (!isModChannel) {
                                            pinObj.size = bits.read(bitsPerNoteSize);
                                        }
                                        else {
                                            pinObj.size = bits.read(11);
                                        }
                                        shape.pins.push(pinObj);
                                    }
                                }
                                recentShapes.unshift(shape);
                                if (recentShapes.length > 10) recentShapes.pop(); // TODO: Use Deque?

                                let note: Note;
                                if (newNotes.length <= noteCount) {
                                    note = new Note(0, curPart, curPart + shape.length, shape.initialSize, false, shape.startOffset);
                                    newNotes[noteCount++] = note;
                                } else {
                                    note = newNotes[noteCount++];
                                    note.start = curPart;
                                    note.end = curPart + shape.length;
                                    note.pins[0].size = shape.initialSize;
                                }

                                let pitch: number;
                                let pitchCount: number = 0;
                                const pitchBends: number[] = []; // TODO: allocate this array only once! keep separate length and iterator index. Use Deque?
                                for (let j: number = 0; j < shape.pitchCount + shape.bendCount; j++) {
                                    const useOldPitch: boolean = bits.read(1) == 1;
                                    if (!useOldPitch) {
                                        const interval: number = bits.readPitchInterval();
                                        pitch = lastPitch;
                                        let intervalIter: number = interval;
                                        while (intervalIter > 0) {
                                            pitch++;
                                            while (recentPitches.indexOf(pitch) != -1) pitch++;
                                            intervalIter--;
                                        }
                                        while (intervalIter < 0) {
                                            pitch--;
                                            while (recentPitches.indexOf(pitch) != -1) pitch--;
                                            intervalIter++;
                                        }
                                    } else {
                                        const pitchIndex: number = validateRange(0, recentPitches.length - 1, bits.read(recentPitchBitLength));
                                        pitch = recentPitches[pitchIndex];
                                        recentPitches.splice(pitchIndex, 1);
                                    }

                                    recentPitches.unshift(pitch);
                                    if (recentPitches.length > recentPitchLength) recentPitches.pop();

                                    if (j < shape.pitchCount) {
                                        note.pitches[pitchCount++] = pitch;
                                    } else {
                                        pitchBends.push(pitch);
                                    }

                                    if (j == shape.pitchCount - 1) {
                                        lastPitch = note.pitches[0];
                                    } else {
                                        lastPitch = pitch;
                                    }
                                }
                                note.pitches.length = pitchCount;
                                pitchBends.unshift(note.pitches[0]); // TODO: Use Deque?
                                const noteIsForTempoMod: boolean = isModChannel && channel.instruments[newPattern.instruments[0]].modulators[Config.modCount - 1 - note.pitches[0]] === Config.modulators.dictionary["tempo"].index;
                                let tempoOffset: number = 0;
                                if (shouldCorrectTempoMods && noteIsForTempoMod) {
                                    tempoOffset = jummboxTempoMin - Config.tempoMin; // convertRealFactor will add back Config.tempoMin as necessary
                                }
                                if (isModChannel) {
                                    note.pins[0].size += tempoOffset;
                                    note.pins[0].size *= detuneScaleNotes[newPattern.instruments[0]][note.pitches[0]];
                                }
                                let pinCount: number = 1;
                                for (const pinObj of shape.pins) {
                                    if (pinObj.pitchBend) pitchBends.shift();

                                    const interval: number = pitchBends[0] - note.pitches[0];
                                    if (note.pins.length <= pinCount) {
                                        if (isModChannel) {
                                            note.pins[pinCount++] = makeNotePin(interval, pinObj.time, pinObj.size * detuneScaleNotes[newPattern.instruments[0]][note.pitches[0]] + tempoOffset);
                                        } else {
                                            note.pins[pinCount++] = makeNotePin(interval, pinObj.time, pinObj.size);
                                        }
                                    } else {
                                        const pin: NotePin = note.pins[pinCount++];
                                        pin.interval = interval;
                                        pin.time = pinObj.time;
                                        if (isModChannel) {
                                            pin.size = pinObj.size * detuneScaleNotes[newPattern.instruments[0]][note.pitches[0]] + tempoOffset;
                                        } else {
                                            pin.size = pinObj.size;
                                        }
                                    }
                                }
                                note.pins.length = pinCount;

                                if (note.start == 0) {
                                    if (!((beforeNine && fromBeepBox) || (beforeFive && fromJummBox) || (beforeFour && fromGoldBox))) {
                                        note.continuesLastPattern = (bits.read(1) == 1);
                                    } else {
                                        if ((beforeFour && !fromUltraBox && !fromSlarmoosBox) || fromBeepBox) {
                                            note.continuesLastPattern = false;
                                        } else {
                                            note.continuesLastPattern = channel.instruments[newPattern.instruments[0]].legacyTieOver;
                                        }
                                    }
                                }

                                curPart = validateRange(0, this.beatsPerBar * Config.partsPerBeat, note.end);
                            }
                        }
                        newNotes.length = noteCount;
                    }

                    if (beforeThree && fromBeepBox) {
                        break;
                    } else {
                        channelIndex++;
                        if (channelIndex >= this.getChannelCount()) break;
                    }
                } // while (true)

                // Correction for old JB songs that had song reverb mods. Change all instruments using reverb to max reverb
                if (((fromJummBox && beforeFive) || (beforeFour && fromGoldBox)) && songReverbIndex >= 0) {
                    for (let channelIndex: number = 0; channelIndex < this.channels.length; channelIndex++) {
                        for (let instrumentIndex: number = 0; instrumentIndex < this.channels[channelIndex].instruments.length; instrumentIndex++) {
                            const instrument: Instrument = this.channels[channelIndex].instruments[instrumentIndex];
                            if (instrument.effectsIncludeType(EffectType.reverb)) {
                                //instrument.reverb = Config.reverbRange - 1;
                            }
                            // Set song reverb via mod to the old setting at song start.
                            if (songReverbChannel == channelIndex && songReverbInstrument == instrumentIndex) {
                                const patternIndex: number = this.channels[channelIndex].bars[0];
                                if (patternIndex > 0) {
                                    // Doesn't work if 1st pattern isn't using the right ins for song reverb...
                                    // Add note to start of pattern
                                    const pattern: Pattern = this.channels[channelIndex].patterns[patternIndex - 1];
                                    let lowestPart: number = 6;
                                    for (const note of pattern.notes) {
                                        if (note.pitches[0] == Config.modCount - 1 - songReverbIndex) {
                                            lowestPart = Math.min(lowestPart, note.start);
                                        }
                                    }

                                    if (lowestPart > 0) {
                                        pattern.notes.push(new Note(Config.modCount - 1 - songReverbIndex, 0, lowestPart, legacyGlobalReverb));
                                    }
                                }
                                else {
                                    // Add pattern
                                    if (this.channels[channelIndex].patterns.length < Config.barCountMax) {
                                        const pattern: Pattern = new Pattern();
                                        this.channels[channelIndex].patterns.push(pattern);
                                        this.channels[channelIndex].bars[0] = this.channels[channelIndex].patterns.length;
                                        if (this.channels[channelIndex].patterns.length > this.patternsPerChannel) {
                                            for (let chn: number = 0; chn < this.channels.length; chn++) {
                                                if (this.channels[chn].patterns.length <= this.patternsPerChannel) {
                                                    this.channels[chn].patterns.push(new Pattern());
                                                }
                                            }
                                            this.patternsPerChannel++;
                                        }
                                        pattern.instruments.length = 1;
                                        pattern.instruments[0] = songReverbInstrument;
                                        pattern.notes.length = 0;
                                        pattern.notes.push(new Note(Config.modCount - 1 - songReverbIndex, 0, 6, legacyGlobalReverb));
                                    }
                                }
                            }
                        }
                    }
                }
            } break;
            default: {
                throw new Error("Unrecognized song tag code " + String.fromCharCode(command) + " at index " + (charIndex - 1) + " " + compressed.substring(/*charIndex - 2*/0, charIndex));
            } break;
        }

        if (Config.willReloadForCustomSamples) {
            window.location.hash = this.toBase64String();
            setTimeout(() => { location.reload(); }, 50);
        }
    }

    private static _isProperUrl(string: string): boolean {
        try {
            if (OFFLINE) {
                return Boolean(string);
            } else {
                return Boolean(new URL(string));
            }
        }
        catch (x) {
            return false;
        }
    }

    // @TODO: Share more of this code with AddSamplesPrompt.
    private static _parseAndConfigureCustomSample(url: string, customSampleUrls: string[], customSamplePresets: Preset[], sampleLoadingState: SampleLoadingState, parseOldSyntax: boolean): boolean {
        const defaultIndex: number = 0;
        const defaultIntegratedSamplesL: Float32Array = Config.chipWaves[defaultIndex].samples;
        const defaultIntegratedSamplesR: Float32Array = Config.chipWaves[defaultIndex].samplesR || Config.chipWaves[defaultIndex].samples;
        const defaultSamplesL: Float32Array = Config.rawRawChipWaves[defaultIndex].samples;
        const defaultSamplesR: Float32Array = Config.rawRawChipWaves[defaultIndex].samplesR || Config.chipWaves[defaultIndex].samples;

        const customSampleUrlIndex: number = customSampleUrls.length;
        customSampleUrls.push(url);
        // This depends on `Config.chipWaves` being the same
        // length as `Config.rawRawChipWaves`.
        const chipWaveIndex: number = Config.chipWaves.length;

        let urlSliced: string = url;

        let customSampleRate: number = 44100;
        let isCustomPercussive: boolean = false;
        let customRootKey: number = 60;
        let presetIsUsingAdvancedLoopControls: boolean = false;
        let presetChipWaveLoopStart: number | null = null;
        let presetChipWaveLoopEnd: number | null = null;
        let presetChipWaveStartOffset: number | null = null;
        let presetChipWaveLoopMode: number | null = null;
        let presetChipWavePlayBackwards: boolean = false;
        let stereoChannels: number = 0;

        let parsedSampleOptions: boolean = false;
        let optionsStartIndex: number = url.indexOf("!");
        let optionsEndIndex: number = -1;
        if (optionsStartIndex === 0) {
            optionsEndIndex = url.indexOf("!", optionsStartIndex + 1);
            if (optionsEndIndex !== -1) {
                const rawOptions: string[] = url.slice(optionsStartIndex + 1, optionsEndIndex).split(",");
                for (const rawOption of rawOptions) {
                    const optionCode: string = rawOption.charAt(0);
                    const optionData: string = rawOption.slice(1, rawOption.length);
                    if (optionCode === "s") {
                        customSampleRate = clamp(8000, 96000 + 1, parseFloatWithDefault(optionData, 44100));
                    } else if (optionCode === "r") {
                        customRootKey = parseFloatWithDefault(optionData, 60);
                    } else if (optionCode === "p") {
                        isCustomPercussive = true;
                    } else if (optionCode === "a") {
                        presetChipWaveLoopStart = parseIntWithDefault(optionData, null);
                        if (presetChipWaveLoopStart != null) {
                            presetIsUsingAdvancedLoopControls = true;
                        }
                    } else if (optionCode === "b") {
                        presetChipWaveLoopEnd = parseIntWithDefault(optionData, null);
                        if (presetChipWaveLoopEnd != null) {
                            presetIsUsingAdvancedLoopControls = true;
                        }
                    } else if (optionCode === "c") {
                        presetChipWaveStartOffset = parseIntWithDefault(optionData, null);
                        if (presetChipWaveStartOffset != null) {
                            presetIsUsingAdvancedLoopControls = true;
                        }
                    } else if (optionCode === "d") {
                        presetChipWaveLoopMode = parseIntWithDefault(optionData, null);
                        if (presetChipWaveLoopMode != null) {
                            // @TODO: Error-prone. This should be automatically
                            // derived from the list of available loop modes.
                            presetChipWaveLoopMode = clamp(0, 3 + 1, presetChipWaveLoopMode);
                            presetIsUsingAdvancedLoopControls = true;
                        }
                    } else if (optionCode === "e") {
                        presetChipWavePlayBackwards = true;
                        presetIsUsingAdvancedLoopControls = true;
                    } else if (optionCode === "m") {
                        stereoChannels = parseIntWithDefault(optionData, 0);
                    }
                }
                urlSliced = url.slice(optionsEndIndex + 1, url.length);
                parsedSampleOptions = true;
            }
        }

        let parsedUrl: URL | string | null = null;
        if (Song._isProperUrl(urlSliced)) {
            if (OFFLINE) {
                parsedUrl = urlSliced;
            } else {
                parsedUrl = new URL(urlSliced);
            }
        }
        else {
            alert(url + " is not a valid url");
            return false;
        }

        if (parseOldSyntax) {
            if (!parsedSampleOptions && parsedUrl != null) {
                if (url.indexOf("@") != -1) {
                    //urlSliced = url.slice(url.indexOf("@"), url.indexOf("@"));
                    urlSliced = url.replaceAll("@", "")
                    if (OFFLINE) {
                        parsedUrl = urlSliced;
                    } else {
                        parsedUrl = new URL(urlSliced);
                    }
                    isCustomPercussive = true;
                }

                function sliceForSampleRate() {
                    urlSliced = url.slice(0, url.indexOf(","));
                    if (OFFLINE) {
                        parsedUrl = urlSliced;
                    } else {
                        parsedUrl = new URL(urlSliced);
                    }
                    customSampleRate = clamp(8000, 96000 + 1, parseFloatWithDefault(url.slice(url.indexOf(",") + 1), 44100));
                    //should this be parseFloat or parseInt?
                    //ig floats let you do decimals and such, but idk where that would be useful
                }

                function sliceForRootKey() {
                    urlSliced = url.slice(0, url.indexOf("!"));
                    if (OFFLINE) {
                        parsedUrl = urlSliced;
                    } else {
                        parsedUrl = new URL(urlSliced);
                    }
                    customRootKey = parseFloatWithDefault(url.slice(url.indexOf("!") + 1), 60);
                }


                if (url.indexOf(",") != -1 && url.indexOf("!") != -1) {
                    if (url.indexOf(",") < url.indexOf("!")) {
                        sliceForRootKey();
                        sliceForSampleRate();
                    }
                    else {
                        sliceForSampleRate();
                        sliceForRootKey();
                    }
                }
                else {
                    if (url.indexOf(",") != -1) {
                        sliceForSampleRate();
                    }
                    if (url.indexOf("!") != -1) {
                        sliceForRootKey();
                    }
                }
            }
        }

        if (parsedUrl != null) {
            // Store in the new format.
            let urlWithNamedOptions = urlSliced;
            const namedOptions: string[] = [];
            if (customSampleRate !== 44100) namedOptions.push("s" + customSampleRate);
            if (customRootKey !== 60) namedOptions.push("r" + customRootKey);
            if (isCustomPercussive) namedOptions.push("p");
            if (presetIsUsingAdvancedLoopControls) {
                if (presetChipWaveLoopStart != null) namedOptions.push("a" + presetChipWaveLoopStart);
                if (presetChipWaveLoopEnd != null) namedOptions.push("b" + presetChipWaveLoopEnd);
                if (presetChipWaveStartOffset != null) namedOptions.push("c" + presetChipWaveStartOffset);
                if (presetChipWaveLoopMode != null) namedOptions.push("d" + presetChipWaveLoopMode);
                if (presetChipWavePlayBackwards) namedOptions.push("e");
            }
            if (stereoChannels !== 0) namedOptions.push("m" + stereoChannels);
            if (namedOptions.length > 0) {
                urlWithNamedOptions = "!" + namedOptions.join(",") + "!" + urlSliced;
            }
            customSampleUrls[customSampleUrlIndex] = urlWithNamedOptions;

            // @TODO: Could also remove known extensions, but it
            // would probably be much better to be able to specify
            // a custom name.
            // @TODO: If for whatever inexplicable reason someone
            // uses an url like `https://example.com`, this will
            // result in an empty name here.
            let name: string;
            if (OFFLINE) {
                //@ts-ignore
                name = decodeURIComponent(parsedUrl.replace(/^([^\/]*\/)+/, ""));
            } else {
                //@ts-ignore
                name = decodeURIComponent(parsedUrl.pathname.replace(/^([^\/]*\/)+/, ""));
            }
            // @TODO: What to do about samples with the same name?
            // The problem with using the url is that the name is
            // user-facing and long names break assumptions of the
            // UI.
            const expression: number = 1.0;
            Config.chipWaves[chipWaveIndex] = {
                name: name,
                expression: expression,
                isCustomSampled: true,
                isPercussion: isCustomPercussive,
                rootKey: customRootKey,
                sampleRate: customSampleRate,
                samples: defaultIntegratedSamplesL,
                samplesR: defaultIntegratedSamplesR,
                stereoChannels: stereoChannels,
                index: chipWaveIndex,
            };
            Config.rawChipWaves[chipWaveIndex] = {
                name: name,
                expression: expression,
                isCustomSampled: true,
                isPercussion: isCustomPercussive,
                rootKey: customRootKey,
                sampleRate: customSampleRate,
                samples: defaultSamplesL,
                samplesR: defaultSamplesR,
                stereoChannels: stereoChannels,
                index: chipWaveIndex,
            };
            Config.rawRawChipWaves[chipWaveIndex] = {
                name: name,
                expression: expression,
                isCustomSampled: true,
                isPercussion: isCustomPercussive,
                rootKey: customRootKey,
                sampleRate: customSampleRate,
                samples: defaultSamplesL,
                samplesR: defaultSamplesR,
                stereoChannels: stereoChannels,
                index: chipWaveIndex,
            };
            const customSamplePresetSettings: Dictionary<any> = {
                "type": "chip",
                "eqFilter": [],
                "effects": [],
                "mdeffects": [],
                "transition": "normal",
                "fadeInSeconds": 0,
                "fadeOutTicks": -3,
                "chord": "harmony",
                "wave": name,
                "unison": "none",
                "envelopes": [],
            };
            if (presetIsUsingAdvancedLoopControls) {
                customSamplePresetSettings["isUsingAdvancedLoopControls"] = true;
                customSamplePresetSettings["chipWaveLoopStart"] = presetChipWaveLoopStart != null ? presetChipWaveLoopStart : 0;
                customSamplePresetSettings["chipWaveLoopEnd"] = presetChipWaveLoopEnd != null ? presetChipWaveLoopEnd : 2;
                customSamplePresetSettings["chipWaveLoopMode"] = presetChipWaveLoopMode != null ? presetChipWaveLoopMode : 0;
                customSamplePresetSettings["chipWavePlayBackwards"] = presetChipWavePlayBackwards;
                customSamplePresetSettings["chipWaveStartOffset"] = presetChipWaveStartOffset != null ? presetChipWaveStartOffset : 0;
            }
            const customSamplePreset: Preset = {
                index: 0, // This should be overwritten by toNameMap, in our caller.
                name: name,
                midiProgram: 80,
                settings: customSamplePresetSettings,
            };
            customSamplePresets.push(customSamplePreset);
            if (!Config.willReloadForCustomSamples) {
                const rawLoopOptions: any = {
                    "isUsingAdvancedLoopControls": presetIsUsingAdvancedLoopControls,
                    "chipWaveLoopStart": presetChipWaveLoopStart,
                    "chipWaveLoopEnd": presetChipWaveLoopEnd,
                    "chipWaveLoopMode": presetChipWaveLoopMode,
                    "chipWavePlayBackwards": presetChipWavePlayBackwards,
                    "chipWaveStartOffset": presetChipWaveStartOffset,
                };
                startLoadingSample(urlSliced, chipWaveIndex, customSamplePresetSettings, rawLoopOptions, customSampleRate);
            }
            sampleLoadingState.statusTable[chipWaveIndex] = SampleLoadingStatus.loading;
            sampleLoadingState.urlTable[chipWaveIndex] = urlSliced;
            sampleLoadingState.totalSamples++;
        }

        return true;
    }

    private static _restoreChipWaveListToDefault(): void {
        Config.chipWaves = toNameMap(Config.chipWaves.slice(0, Config.firstIndexForSamplesInChipWaveList));
        Config.rawChipWaves = toNameMap(Config.rawChipWaves.slice(0, Config.firstIndexForSamplesInChipWaveList));
        Config.rawRawChipWaves = toNameMap(Config.rawRawChipWaves.slice(0, Config.firstIndexForSamplesInChipWaveList));
    }

    private static _clearSamples(): void {
        EditorConfig.customSamples = null;

        Song._restoreChipWaveListToDefault();

        sampleLoadingState.statusTable = {};
        sampleLoadingState.urlTable = {};
        sampleLoadingState.totalSamples = 0;
        sampleLoadingState.samplesLoaded = 0;
        sampleLoadEvents.dispatchEvent(new SampleLoadedEvent(
            sampleLoadingState.totalSamples,
            sampleLoadingState.samplesLoaded
        ));
    }

    public toJsonObject(enableIntro: boolean = true, loopCount: number = 1, enableOutro: boolean = true): Object {
        const channelArray: Object[] = [];
        for (let channelIndex: number = 0; channelIndex < this.getChannelCount(); channelIndex++) {
            const channel: Channel = this.channels[channelIndex];
            const instrumentArray: Object[] = [];
            const isNoiseChannel: boolean = this.getChannelIsNoise(channelIndex);
            const isModChannel: boolean = this.getChannelIsMod(channelIndex);
            for (const instrument of channel.instruments) {
                instrumentArray.push(instrument.toJsonObject());
            }

            const patternArray: Object[] = [];
            for (const pattern of channel.patterns) {
                patternArray.push(pattern.toJsonObject(this, channel, isModChannel));
            }

            const sequenceArray: number[] = [];
            if (enableIntro) for (let i: number = 0; i < this.loopStart; i++) {
                sequenceArray.push(channel.bars[i]);
            }
            for (let l: number = 0; l < loopCount; l++) for (let i: number = this.loopStart; i < this.loopStart + this.loopLength; i++) {
                sequenceArray.push(channel.bars[i]);
            }
            if (enableOutro) for (let i: number = this.loopStart + this.loopLength; i < this.barCount; i++) {
                sequenceArray.push(channel.bars[i]);
            }

            const channelObject: any = {
                "type": isModChannel ? "mod" : (isNoiseChannel ? "drum" : "pitch"),
                "name": channel.name,
                "instruments": instrumentArray,
                "patterns": patternArray,
                "sequence": sequenceArray,
            };
            if (!isNoiseChannel) {
                // For compatibility with old versions the octave is offset by one.
                channelObject["octaveScrollBar"] = channel.octave - 1;
            }
            channelArray.push(channelObject);
        }

        const result: any = {
            "name": this.title,
            "format": Song._format,
            "version": Song._latestSlarmoosBoxVersion,
            "scale": Config.scales[this.scale].name,
            "customScale": this.scaleCustom,
            "key": Config.keys[this.key].name,
            "keyOctave": this.octave,
            "introBars": this.loopStart,
            "loopBars": this.loopLength,
            "beatsPerBar": this.beatsPerBar,
            "ticksPerBeat": Config.rhythms[this.rhythm].stepsPerBeat,
            "beatsPerMinute": this.tempo,
            "reverb": this.reverb,
            "masterGain": this.masterGain,
            "compressionThreshold": this.compressionThreshold,
            "limitThreshold": this.limitThreshold,
            "limitDecay": this.limitDecay,
            "limitRise": this.limitRise,
            "limitRatio": this.limitRatio,
            "compressionRatio": this.compressionRatio,
            //"outroBars": this.barCount - this.loopStart - this.loopLength; // derive this from bar arrays?
            //"patternCount": this.patternsPerChannel, // derive this from pattern arrays?
            "songEq": this.eqFilter.toJsonObject(),
            "layeredInstruments": this.layeredInstruments,
            "patternInstruments": this.patternInstruments,
            "channels": channelArray,
        };

        //song eq subfilters
        for (let i: number = 0; i < Config.filterMorphCount - 1; i++) {
            result["songEq" + i] = this.eqSubFilters[i];
        }

        if (EditorConfig.customSamples != null && EditorConfig.customSamples.length > 0) {
            result["customSamples"] = EditorConfig.customSamples;
        }

        return result;
    }

    public fromJsonObject(jsonObject: any, jsonFormat: string = "auto"): void {
        this.initToDefault(true);
        if (!jsonObject) return;

        //const version: number = jsonObject["version"] | 0;
        //if (version > Song._latestVersion) return; // Go ahead and try to parse something from the future I guess? JSON is pretty easy-going!

        // Code for auto-detect mode; if statements that are lower down have 'higher priority'
        if (jsonFormat == "auto") {
            if (jsonObject["format"] == "BeepBox") {
                // Assume that if there is a "riff" song setting then it must be modbox
                if (jsonObject["riff"] != undefined) {
                    jsonFormat = "modbox";
                }

                // Assume that if there are limiter song settings then it must be jummbox
                // Despite being added in JB 2.1, json export for the limiter settings wasn't added until 2.3
                if (jsonObject["masterGain"] != undefined) {
                    jsonFormat = "jummbox";
                }
            }
        }

        const format: string = (jsonFormat == "auto" ? jsonObject["format"] : jsonFormat).toLowerCase();

        if (jsonObject["name"] != undefined) {
            this.title = jsonObject["name"];
        }

        if (jsonObject["customSamples"] != undefined) {
            const customSamples: string[] = jsonObject["customSamples"];
            if (EditorConfig.customSamples == null || EditorConfig.customSamples.join(", ") != customSamples.join(", ")) {
                // Have to duplicate the work done in Song.fromBase64String
                // early here, because Instrument.fromJsonObject depends on the
                // chip wave list having the correct items already in memory.

                Config.willReloadForCustomSamples = true;

                Song._restoreChipWaveListToDefault();

                let willLoadLegacySamples: boolean = false;
                let willLoadNintariboxSamples: boolean = false;
                let willLoadMarioPaintboxSamples: boolean = false;
                const customSampleUrls: string[] = [];
                const customSamplePresets: Preset[] = [];
                for (const url of customSamples) {
                    if (url.toLowerCase() === "legacysamples") {
                        if (!willLoadLegacySamples) {
                            willLoadLegacySamples = true;
                            customSampleUrls.push(url);
                            loadBuiltInSamples(0);
                        }
                    }
                    else if (url.toLowerCase() === "nintariboxsamples") {
                        if (!willLoadNintariboxSamples) {
                            willLoadNintariboxSamples = true;
                            customSampleUrls.push(url);
                            loadBuiltInSamples(1);
                        }
                    }
                    else if (url.toLowerCase() === "mariopaintboxsamples") {
                        if (!willLoadMarioPaintboxSamples) {
                            willLoadMarioPaintboxSamples = true;
                            customSampleUrls.push(url);
                            loadBuiltInSamples(2);
                        }
                    }

                    else {
                        // When EditorConfig.customSamples is saved in the json
                        // export, it should be using the new syntax, unless
                        // the user has manually modified the URL, so we don't
                        // really need to parse the old syntax here.
                        const parseOldSyntax: boolean = false;
                        Song._parseAndConfigureCustomSample(url, customSampleUrls, customSamplePresets, sampleLoadingState, parseOldSyntax);
                    }
                }
                if (customSampleUrls.length > 0) {
                    EditorConfig.customSamples = customSampleUrls;
                }
                if (customSamplePresets.length > 0) {
                    const customSamplePresetsMap: DictionaryArray<Preset> = toNameMap(customSamplePresets);
                    EditorConfig.presetCategories[EditorConfig.presetCategories.length] = {
                        name: "Custom Sample Presets",
                        presets: customSamplePresetsMap,
                        index: EditorConfig.presetCategories.length,
                    };
                }
            }
        } else {
            // No custom samples, so the only possibility at this point is that
            // we need to load the legacy samples. Let's check whether that's
            // necessary.
            let shouldLoadLegacySamples: boolean = false;
            if (jsonObject["channels"] != undefined) {
                for (let channelIndex: number = 0; channelIndex < jsonObject["channels"].length; channelIndex++) {
                    const channelObject: any = jsonObject["channels"][channelIndex];
                    if (channelObject["type"] !== "pitch") {
                        // Legacy samples can only exist in pitch channels.
                        continue;
                    }
                    if (Array.isArray(channelObject["instruments"])) {
                        const instrumentObjects: any[] = channelObject["instruments"];
                        for (let i: number = 0; i < instrumentObjects.length; i++) {
                            const instrumentObject: any = instrumentObjects[i];
                            if (instrumentObject["type"] !== "chip") {
                                // Legacy samples can only exist in chip wave
                                // instruments.
                                continue;
                            }
                            if (instrumentObject["wave"] == null) {
                                // This should exist if things got saved
                                // correctly, but if they didn't, skip this.
                                continue;
                            }
                            const waveName: string = instrumentObject["wave"];
                            // @TODO: Avoid this duplication.
                            const names: string[] = [
                                "paandorasbox kick",
                                "paandorasbox snare",
                                "paandorasbox piano1",
                                "paandorasbox WOW",
                                "paandorasbox overdrive",
                                "paandorasbox trumpet",
                                "paandorasbox saxophone",
                                "paandorasbox orchestrahit",
                                "paandorasbox detatched violin",
                                "paandorasbox synth",
                                "paandorasbox sonic3snare",
                                "paandorasbox come on",
                                "paandorasbox choir",
                                "paandorasbox overdriveguitar",
                                "paandorasbox flute",
                                "paandorasbox legato violin",
                                "paandorasbox tremolo violin",
                                "paandorasbox amen break",
                                "paandorasbox pizzicato violin",
                                "paandorasbox tim allen grunt",
                                "paandorasbox tuba",
                                "paandorasbox loopingcymbal",
                                "paandorasbox standardkick",
                                "paandorasbox standardsnare",
                                "paandorasbox closedhihat",
                                "paandorasbox foothihat",
                                "paandorasbox openhihat",
                                "paandorasbox crashcymbal",
                                "paandorasbox pianoC4",
                                "paandorasbox liver pad",
                                "paandorasbox marimba",
                                "paandorasbox susdotwav",
                                "paandorasbox wackyboxtts",
                                "paandorasbox peppersteak_1",
                                "paandorasbox peppersteak_2",
                                "paandorasbox vinyl_noise",
                                "paandorasbeta slap bass",
                                "paandorasbeta HD EB overdrive guitar",
                                "paandorasbeta sunsoft bass",
                                "paandorasbeta masculine choir",
                                "paandorasbeta feminine choir",
                                "paandorasbeta tololoche",
                                "paandorasbeta harp",
                                "paandorasbeta pan flute",
                                "paandorasbeta krumhorn",
                                "paandorasbeta timpani",
                                "paandorasbeta crowd hey",
                                "paandorasbeta wario land 4 brass",
                                "paandorasbeta wario land 4 rock organ",
                                "paandorasbeta wario land 4 DAOW",
                                "paandorasbeta wario land 4 hour chime",
                                "paandorasbeta wario land 4 tick",
                                "paandorasbeta kirby kick",
                                "paandorasbeta kirby snare",
                                "paandorasbeta kirby bongo",
                                "paandorasbeta kirby click",
                                "paandorasbeta sonor kick",
                                "paandorasbeta sonor snare",
                                "paandorasbeta sonor snare (left hand)",
                                "paandorasbeta sonor snare (right hand)",
                                "paandorasbeta sonor high tom",
                                "paandorasbeta sonor low tom",
                                "paandorasbeta sonor hihat (closed)",
                                "paandorasbeta sonor hihat (half opened)",
                                "paandorasbeta sonor hihat (open)",
                                "paandorasbeta sonor hihat (open tip)",
                                "paandorasbeta sonor hihat (pedal)",
                                "paandorasbeta sonor crash",
                                "paandorasbeta sonor crash (tip)",
                                "paandorasbeta sonor ride"
                            ];
                            // The difference for these is in the doubled a.
                            const oldNames: string[] = [
                                "pandoraasbox kick",
                                "pandoraasbox snare",
                                "pandoraasbox piano1",
                                "pandoraasbox WOW",
                                "pandoraasbox overdrive",
                                "pandoraasbox trumpet",
                                "pandoraasbox saxophone",
                                "pandoraasbox orchestrahit",
                                "pandoraasbox detatched violin",
                                "pandoraasbox synth",
                                "pandoraasbox sonic3snare",
                                "pandoraasbox come on",
                                "pandoraasbox choir",
                                "pandoraasbox overdriveguitar",
                                "pandoraasbox flute",
                                "pandoraasbox legato violin",
                                "pandoraasbox tremolo violin",
                                "pandoraasbox amen break",
                                "pandoraasbox pizzicato violin",
                                "pandoraasbox tim allen grunt",
                                "pandoraasbox tuba",
                                "pandoraasbox loopingcymbal",
                                "pandoraasbox standardkick",
                                "pandoraasbox standardsnare",
                                "pandoraasbox closedhihat",
                                "pandoraasbox foothihat",
                                "pandoraasbox openhihat",
                                "pandoraasbox crashcymbal",
                                "pandoraasbox pianoC4",
                                "pandoraasbox liver pad",
                                "pandoraasbox marimba",
                                "pandoraasbox susdotwav",
                                "pandoraasbox wackyboxtts",
                                "pandoraasbox peppersteak_1",
                                "pandoraasbox peppersteak_2",
                                "pandoraasbox vinyl_noise",
                                "pandoraasbeta slap bass",
                                "pandoraasbeta HD EB overdrive guitar",
                                "pandoraasbeta sunsoft bass",
                                "pandoraasbeta masculine choir",
                                "pandoraasbeta feminine choir",
                                "pandoraasbeta tololoche",
                                "pandoraasbeta harp",
                                "pandoraasbeta pan flute",
                                "pandoraasbeta krumhorn",
                                "pandoraasbeta timpani",
                                "pandoraasbeta crowd hey",
                                "pandoraasbeta wario land 4 brass",
                                "pandoraasbeta wario land 4 rock organ",
                                "pandoraasbeta wario land 4 DAOW",
                                "pandoraasbeta wario land 4 hour chime",
                                "pandoraasbeta wario land 4 tick",
                                "pandoraasbeta kirby kick",
                                "pandoraasbeta kirby snare",
                                "pandoraasbeta kirby bongo",
                                "pandoraasbeta kirby click",
                                "pandoraasbeta sonor kick",
                                "pandoraasbeta sonor snare",
                                "pandoraasbeta sonor snare (left hand)",
                                "pandoraasbeta sonor snare (right hand)",
                                "pandoraasbeta sonor high tom",
                                "pandoraasbeta sonor low tom",
                                "pandoraasbeta sonor hihat (closed)",
                                "pandoraasbeta sonor hihat (half opened)",
                                "pandoraasbeta sonor hihat (open)",
                                "pandoraasbeta sonor hihat (open tip)",
                                "pandoraasbeta sonor hihat (pedal)",
                                "pandoraasbeta sonor crash",
                                "pandoraasbeta sonor crash (tip)",
                                "pandoraasbeta sonor ride"
                            ];
                            // This mirrors paandorasboxWaveNames, which is unprefixed.
                            const veryOldNames: string[] = [
                                "kick",
                                "snare",
                                "piano1",
                                "WOW",
                                "overdrive",
                                "trumpet",
                                "saxophone",
                                "orchestrahit",
                                "detatched violin",
                                "synth",
                                "sonic3snare",
                                "come on",
                                "choir",
                                "overdriveguitar",
                                "flute",
                                "legato violin",
                                "tremolo violin",
                                "amen break",
                                "pizzicato violin",
                                "tim allen grunt",
                                "tuba",
                                "loopingcymbal",
                                "standardkick",
                                "standardsnare",
                                "closedhihat",
                                "foothihat",
                                "openhihat",
                                "crashcymbal",
                                "pianoC4",
                                "liver pad",
                                "marimba",
                                "susdotwav",
                                "wackyboxtts"
                            ];
                            if (names.includes(waveName)) {
                                shouldLoadLegacySamples = true;
                            } else if (oldNames.includes(waveName)) {
                                shouldLoadLegacySamples = true;
                                // If we see one of these old names, update it
                                // to the corresponding new name.
                                instrumentObject["wave"] = names[oldNames.findIndex(x => x === waveName)];
                            } else if (veryOldNames.includes(waveName)) {
                                if ((waveName === "trumpet" || waveName === "flute") && (format != "paandorasbox")) {
                                    // If we see chip waves named trumpet or flute, and if the format isn't PaandorasBox, we leave them as-is
                                } else {
                                    // There's no other chip waves with ambiguous names like that, so it should
                                    // be okay to assume we'll need to load the legacy samples now.
                                    shouldLoadLegacySamples = true;
                                    // If we see one of these old names, update it
                                    // to the corresponding new name.
                                    instrumentObject["wave"] = names[veryOldNames.findIndex(x => x === waveName)];
                                }
                            }
                        }
                    }
                }
            }
            if (shouldLoadLegacySamples) {
                Config.willReloadForCustomSamples = true;

                Song._restoreChipWaveListToDefault();

                loadBuiltInSamples(0);
                EditorConfig.customSamples = ["legacySamples"];
            } else {
                // We don't need to load the legacy samples, but we may have
                // leftover samples in memory. If we do, clear them.
                if (EditorConfig.customSamples != null && EditorConfig.customSamples.length > 0) {
                    // We need to reload anyway in this case, because (for now)
                    // the chip wave lists won't be correctly updated.
                    Config.willReloadForCustomSamples = true;
                    Song._clearSamples();
                }
            }
        }

        this.scale = 0; // default to free.
        if (jsonObject["scale"] != undefined) {
            const oldScaleNames: Dictionary<string> = {
                "romani :)": "double harmonic :)",
                "romani :(": "double harmonic :(",
                "dbl harmonic :)": "double harmonic :)",
                "dbl harmonic :(": "double harmonic :(",
                "enigma": "strange",
            };
            const scaleName: string = (oldScaleNames[jsonObject["scale"]] != undefined) ? oldScaleNames[jsonObject["scale"]] : jsonObject["scale"];
            const scale: number = Config.scales.findIndex(scale => scale.name == scaleName);
            if (scale != -1) this.scale = scale;
            if (this.scale == Config.scales["dictionary"]["Custom"].index) {
                if (jsonObject["customScale"] != undefined) {
                    for (var i of jsonObject["customScale"].keys()) {
                        this.scaleCustom[i] = jsonObject["customScale"][i];
                    }
                }
            }
        }

        if (jsonObject["key"] != undefined) {
            if (typeof (jsonObject["key"]) == "number") {
                this.key = ((jsonObject["key"] + 1200) >>> 0) % Config.keys.length;
            } else if (typeof (jsonObject["key"]) == "string") {
                const key: string = jsonObject["key"];
                // This conversion code depends on C through B being
                // available as keys, of course.
                if (key === "C+") {
                    this.key = 0;
                    this.octave = 1;
                } else if (key === "G- (actually F#-)") {
                    this.key = 6;
                    this.octave = -1;
                } else if (key === "C-") {
                    this.key = 0;
                    this.octave = -1;
                } else if (key === "oh no (F-)") {
                    this.key = 5;
                    this.octave = -1;
                } else {
                    const letter: string = key.charAt(0).toUpperCase();
                    const symbol: string = key.charAt(1).toLowerCase();
                    const letterMap: Readonly<Dictionary<number>> = { "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11 };
                    const accidentalMap: Readonly<Dictionary<number>> = { "#": 1, "♯": 1, "b": -1, "♭": -1 };
                    let index: number | undefined = letterMap[letter];
                    const offset: number | undefined = accidentalMap[symbol];
                    if (index != undefined) {
                        if (offset != undefined) index += offset;
                        if (index < 0) index += 12;
                        index = index % 12;
                        this.key = index;
                    }
                }
            }
        }

        if (jsonObject["beatsPerMinute"] != undefined) {
            this.tempo = clamp(Config.tempoMin, Config.tempoMax + 1, jsonObject["beatsPerMinute"] | 0);
        }

        if (jsonObject["keyOctave"] != undefined) {
            this.octave = clamp(Config.octaveMin, Config.octaveMax + 1, jsonObject["keyOctave"] | 0);
        }

        let legacyGlobalReverb: number = 0; // In older songs, reverb was song-global, record that here and pass it to Instrument.fromJsonObject() for context.
        if (jsonObject["reverb"] != undefined) {
            legacyGlobalReverb = clamp(0, 32, jsonObject["reverb"] | 0);
        }

        if (jsonObject["beatsPerBar"] != undefined) {
            this.beatsPerBar = Math.max(Config.beatsPerBarMin, Math.min(Config.beatsPerBarMax, jsonObject["beatsPerBar"] | 0));
        }

        let importedPartsPerBeat: number = 4;
        if (jsonObject["ticksPerBeat"] != undefined) {
            importedPartsPerBeat = (jsonObject["ticksPerBeat"] | 0) || 4;
            this.rhythm = Config.rhythms.findIndex(rhythm => rhythm.stepsPerBeat == importedPartsPerBeat);
            if (this.rhythm == -1) {
                this.rhythm = 1; //default rhythm
            }
        }

        // Read limiter settings. Ranges and defaults are based on slider settings

        if (jsonObject["masterGain"] != undefined) {
            this.masterGain = Math.max(0.0, Math.min(5.0, jsonObject["masterGain"] || 0));
        } else {
            this.masterGain = 1.0;
        }

        if (jsonObject["limitThreshold"] != undefined) {
            this.limitThreshold = Math.max(0.0, Math.min(2.0, jsonObject["limitThreshold"] || 0));
        } else {
            this.limitThreshold = 1.0;
        }

        if (jsonObject["compressionThreshold"] != undefined) {
            this.compressionThreshold = Math.max(0.0, Math.min(1.1, jsonObject["compressionThreshold"] || 0));
        } else {
            this.compressionThreshold = 1.0;
        }

        if (jsonObject["limitRise"] != undefined) {
            this.limitRise = Math.max(2000.0, Math.min(10000.0, jsonObject["limitRise"] || 0));
        } else {
            this.limitRise = 4000.0;
        }

        if (jsonObject["limitDecay"] != undefined) {
            this.limitDecay = Math.max(1.0, Math.min(30.0, jsonObject["limitDecay"] || 0));
        } else {
            this.limitDecay = 4.0;
        }

        if (jsonObject["limitRatio"] != undefined) {
            this.limitRatio = Math.max(0.0, Math.min(11.0, jsonObject["limitRatio"] || 0));
        } else {
            this.limitRatio = 1.0;
        }

        if (jsonObject["compressionRatio"] != undefined) {
            this.compressionRatio = Math.max(0.0, Math.min(1.168, jsonObject["compressionRatio"] || 0));
        } else {
            this.compressionRatio = 1.0;
        }

        if (jsonObject["songEq"] != undefined) {
            this.eqFilter.fromJsonObject(jsonObject["songEq"]);
        } else {
            this.eqFilter.reset();
        }

        for (let i: number = 0; i < Config.filterMorphCount - 1; i++) {
            if (jsonObject["songEq" + i]) {
                this.eqSubFilters[i] = jsonObject["songEq" + i];
            } else {
                this.eqSubFilters[i] = null;
            }
        }

        let maxInstruments: number = 1;
        let maxPatterns: number = 1;
        let maxBars: number = 1;
        if (jsonObject["channels"] != undefined) {
            for (const channelObject of jsonObject["channels"]) {
                if (channelObject["instruments"]) maxInstruments = Math.max(maxInstruments, channelObject["instruments"].length | 0);
                if (channelObject["patterns"]) maxPatterns = Math.max(maxPatterns, channelObject["patterns"].length | 0);
                if (channelObject["sequence"]) maxBars = Math.max(maxBars, channelObject["sequence"].length | 0);
            }
        }

        if (jsonObject["layeredInstruments"] != undefined) {
            this.layeredInstruments = !!jsonObject["layeredInstruments"];
        } else {
            this.layeredInstruments = false;
        }
        if (jsonObject["patternInstruments"] != undefined) {
            this.patternInstruments = !!jsonObject["patternInstruments"];
        } else {
            this.patternInstruments = (maxInstruments > 1);
        }
        this.patternsPerChannel = Math.min(maxPatterns, Config.barCountMax);
        this.barCount = Math.min(maxBars, Config.barCountMax);

        if (jsonObject["introBars"] != undefined) {
            this.loopStart = clamp(0, this.barCount, jsonObject["introBars"] | 0);
        }
        if (jsonObject["loopBars"] != undefined) {
            this.loopLength = clamp(1, this.barCount - this.loopStart + 1, jsonObject["loopBars"] | 0);
        }

        const newPitchChannels: Channel[] = [];
        const newNoiseChannels: Channel[] = [];
        const newModChannels: Channel[] = [];
        if (jsonObject["channels"] != undefined) {
            for (let channelIndex: number = 0; channelIndex < jsonObject["channels"].length; channelIndex++) {
                let channelObject: any = jsonObject["channels"][channelIndex];

                const channel: Channel = new Channel();

                let isNoiseChannel: boolean = false;
                let isModChannel: boolean = false;
                if (channelObject["type"] != undefined) {
                    isNoiseChannel = (channelObject["type"] == "drum");
                    isModChannel = (channelObject["type"] == "mod");
                } else {
                    // for older files, assume drums are channel 3.
                    isNoiseChannel = (channelIndex >= 3);
                }
                if (isNoiseChannel) {
                    newNoiseChannels.push(channel);
                } else if (isModChannel) {
                    newModChannels.push(channel);
                }
                else {
                    newPitchChannels.push(channel);
                }

                if (channelObject["octaveScrollBar"] != undefined) {
                    channel.octave = clamp(0, Config.pitchOctaves, (channelObject["octaveScrollBar"] | 0) + 1);
                    if (isNoiseChannel) channel.octave = 0;
                }

                if (channelObject["name"] != undefined) {
                    channel.name = channelObject["name"];
                }
                else {
                    channel.name = "";
                }

                if (Array.isArray(channelObject["instruments"])) {
                    const instrumentObjects: any[] = channelObject["instruments"];
                    for (let i: number = 0; i < instrumentObjects.length; i++) {
                        if (i >= this.getMaxInstrumentsPerChannel()) break;
                        const instrument: Instrument = new Instrument(isNoiseChannel, isModChannel);
                        channel.instruments[i] = instrument;
                        instrument.fromJsonObject(instrumentObjects[i], isNoiseChannel, isModChannel, false, false, legacyGlobalReverb, format);
                    }

                }

                for (let i: number = 0; i < this.patternsPerChannel; i++) {
                    const pattern: Pattern = new Pattern();
                    channel.patterns[i] = pattern;

                    let patternObject: any = undefined;
                    if (channelObject["patterns"]) patternObject = channelObject["patterns"][i];
                    if (patternObject == undefined) continue;

                    pattern.fromJsonObject(patternObject, this, channel, importedPartsPerBeat, isNoiseChannel, isModChannel, format);
                }
                channel.patterns.length = this.patternsPerChannel;

                for (let i: number = 0; i < this.barCount; i++) {
                    channel.bars[i] = (channelObject["sequence"] != undefined) ? Math.min(this.patternsPerChannel, channelObject["sequence"][i] >>> 0) : 0;
                }
                channel.bars.length = this.barCount;
            }
        }

        if (newPitchChannels.length > Config.pitchChannelCountMax) newPitchChannels.length = Config.pitchChannelCountMax;
        if (newNoiseChannels.length > Config.noiseChannelCountMax) newNoiseChannels.length = Config.noiseChannelCountMax;
        if (newModChannels.length > Config.modChannelCountMax) newModChannels.length = Config.modChannelCountMax;
        this.pitchChannelCount = newPitchChannels.length;
        this.noiseChannelCount = newNoiseChannels.length;
        this.modChannelCount = newModChannels.length;
        this.channels.length = 0;
        Array.prototype.push.apply(this.channels, newPitchChannels);
        Array.prototype.push.apply(this.channels, newNoiseChannels);
        Array.prototype.push.apply(this.channels, newModChannels);

        if (Config.willReloadForCustomSamples) {
            window.location.hash = this.toBase64String();
            // The prompt seems to get stuck if reloading is done too quickly.
            setTimeout(() => { location.reload(); }, 50);
        }
    }

    public getPattern(channelIndex: number, bar: number): Pattern | null {
        if (bar < 0 || bar >= this.barCount) return null;
        const patternIndex: number = this.channels[channelIndex].bars[bar];
        if (patternIndex == 0) return null;
        return this.channels[channelIndex].patterns[patternIndex - 1];
    }

    public getBeatsPerMinute(): number {
        return this.tempo;
    }

    public static getNeededBits(maxValue: number): number {
        return 32 - Math.clz32(Math.ceil(maxValue + 1) - 1);
    }

    public restoreLimiterDefaults(): void {
        this.compressionRatio = 1.0;
        this.limitRatio = 1.0;
        this.limitRise = 4000.0;
        this.limitDecay = 4.0;
        this.limitThreshold = 1.0;
        this.compressionThreshold = 1.0;
        this.masterGain = 1.0;
    }
}
