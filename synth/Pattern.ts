// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Config } from "./SynthConfig";
import { Instrument } from "./Instrument";
import { clamp } from "./synth";
import { Channel } from "./Channel";
import { Song } from "./Song";

export interface NotePin {
    interval: number;
    time: number;
    size: number;
}

export function makeNotePin(interval: number, time: number, size: number): NotePin {
    return { interval: interval, time: time, size: size };
}

export class Note {
    public pitches: number[];
    public pins: NotePin[];
    public start: number;
    public end: number;
    public continuesLastPattern: boolean;
    public chipWaveStartOffset: number;

    public constructor(pitch: number, start: number, end: number, size: number, fadeout: boolean = false, chipWaveStartOffset: number = 0) {
        this.pitches = [pitch];
        this.pins = [makeNotePin(0, 0, size), makeNotePin(0, end - start, fadeout ? 0 : size)];
        this.start = start;
        this.end = end;
        this.continuesLastPattern = false;
        this.chipWaveStartOffset = chipWaveStartOffset;
    }

    public pickMainInterval(): number {
        let longestFlatIntervalDuration: number = 0;
        let mainInterval: number = 0;
        for (let pinIndex: number = 1; pinIndex < this.pins.length; pinIndex++) {
            const pinA: NotePin = this.pins[pinIndex - 1];
            const pinB: NotePin = this.pins[pinIndex];
            if (pinA.interval == pinB.interval) {
                const duration: number = pinB.time - pinA.time;
                if (longestFlatIntervalDuration < duration) {
                    longestFlatIntervalDuration = duration;
                    mainInterval = pinA.interval;
                }
            }
        }
        if (longestFlatIntervalDuration == 0) {
            let loudestSize: number = 0;
            for (let pinIndex: number = 0; pinIndex < this.pins.length; pinIndex++) {
                const pin: NotePin = this.pins[pinIndex];
                if (loudestSize < pin.size) {
                    loudestSize = pin.size;
                    mainInterval = pin.interval;
                }
            }
        }
        return mainInterval;
    }

    public clone(): Note {
        const newNote: Note = new Note(-1, this.start, this.end, 3);
        newNote.pitches = this.pitches.concat();
        newNote.pins = [];
        for (const pin of this.pins) {
            newNote.pins.push(makeNotePin(pin.interval, pin.time, pin.size));
        }
        newNote.continuesLastPattern = this.continuesLastPattern;
        return newNote;
    }

    public getEndPinIndex(part: number): number {
        let endPinIndex: number;
        for (endPinIndex = 1; endPinIndex < this.pins.length - 1; endPinIndex++) {
            if (this.pins[endPinIndex].time + this.start > part) break;
        }
        return endPinIndex;
    }
}

export class Pattern {
    public notes: Note[] = [];
    public readonly instruments: number[] = [0];

    public cloneNotes(): Note[] {
        const result: Note[] = [];
        for (const note of this.notes) {
            result.push(note.clone());
        }
        return result;
    }

    public reset(): void {
        this.notes.length = 0;
        this.instruments[0] = 0;
        this.instruments.length = 1;
    }

    public toJsonObject(song: Song, channel: Channel, isModChannel: boolean): any {
        const noteArray: Object[] = [];
        for (const note of this.notes) {
            // Only one ins per pattern is enforced in mod channels.
            let instrument: Instrument = song.instruments[this.instruments[0]];
            let mod: number = Math.max(0, Config.modCount - note.pitches[0] - 1);
            let volumeCap: number = song.getVolumeCapForSetting(isModChannel, instrument.modulators[mod], instrument.modFilterTypes[mod]);
            const pointArray: Object[] = [];
            for (const pin of note.pins) {
                let useVol: number = isModChannel ? Math.round(pin.size) : Math.round(pin.size * 100 / volumeCap);
                pointArray.push({
                    "tick": (pin.time + note.start) * Config.rhythms[song.rhythm].stepsPerBeat / Config.partsPerBeat,
                                "pitchBend": pin.interval,
                                "volume": useVol,
                                "forMod": isModChannel,
                });
            }

            const noteObject: any = {
                "pitches": note.pitches,
                "points": pointArray,
            };
            if (note.start == 0) {
                noteObject["continuesLastPattern"] = note.continuesLastPattern;
            }
            noteArray.push(noteObject);
        }

        const patternObject: any = { "notes": noteArray };
        if (song.patternInstruments) {
            patternObject["instruments"] = this.instruments.map(i => i + 1);
        }
        return patternObject;
    }

    public fromJsonObject(patternObject: any, song: Song, channel: Channel, importedPartsPerBeat: number, isNoiseChannel: boolean, isModChannel: boolean, jsonFormat: string = "auto"): void {
        const format: string = jsonFormat.toLowerCase();

        if (song.patternInstruments) {
            if (Array.isArray(patternObject["instruments"])) {
                const instruments: any[] = patternObject["instruments"];
                const instrumentCount: number = clamp(Config.instrumentCountMin, song.getMaxInstrumentsPerPatternForChannel(channel) + 1, instruments.length);
                for (let j: number = 0; j < instrumentCount; j++) {
                    this.instruments[j] = clamp(0, song.instruments.length, (instruments[j] | 0) - 1);
                }
                this.instruments.length = instrumentCount;
            } else {
                this.instruments[0] = clamp(0, song.instruments.length, (patternObject["instrument"] | 0) - 1);
                this.instruments.length = 1;
            }
        }

        if (patternObject["notes"] && patternObject["notes"].length > 0) {
            const maxNoteCount: number = Math.min(song.beatsPerBar * Config.partsPerBeat * (isModChannel ? Config.modCount : 1), patternObject["notes"].length >>> 0);

            // TODO: Consider supporting notes specified in any timing order, sorting them and truncating as necessary.
            //let tickClock: number = 0;
            for (let j: number = 0; j < patternObject["notes"].length; j++) {
                if (j >= maxNoteCount) break;

                const noteObject = patternObject["notes"][j];
                if (!noteObject || !noteObject["pitches"] || !(noteObject["pitches"].length >= 1) || !noteObject["points"] || !(noteObject["points"].length >= 2)) {
                    continue;
                }

                const note: Note = new Note(0, 0, 0, 0);
                note.pitches = [];
                note.pins = [];

                for (let k: number = 0; k < noteObject["pitches"].length; k++) {
                    const pitch: number = noteObject["pitches"][k] | 0;
                    if (note.pitches.indexOf(pitch) != -1) continue;
                    note.pitches.push(pitch);
                    if (note.pitches.length >= Config.maxChordSize) break;
                }
                if (note.pitches.length < 1) continue;

                //let noteClock: number = tickClock;
                let startInterval: number = 0;

                let instrument: Instrument = song.instruments[this.instruments[0]];
                let mod: number = Math.max(0, Config.modCount - note.pitches[0] - 1);

                for (let k: number = 0; k < noteObject["points"].length; k++) {
                    const pointObject: any = noteObject["points"][k];
                    if (pointObject == undefined || pointObject["tick"] == undefined) continue;
                    const interval: number = (pointObject["pitchBend"] == undefined) ? 0 : (pointObject["pitchBend"] | 0);

                    const time: number = Math.round((+pointObject["tick"]) * Config.partsPerBeat / importedPartsPerBeat);

                    // Only one instrument per pattern allowed in mod channels.
                    let volumeCap: number = song.getVolumeCapForSetting(isModChannel, instrument.modulators[mod], instrument.modFilterTypes[mod]);

                    // The strange volume formula used for notes is not needed for mods. Some rounding errors were possible.
                    // A "forMod" signifier was added to new JSON export to detect when the higher precision export was used in a file.
                    let size: number;
                    if (pointObject["volume"] == undefined) {
                        size = volumeCap;
                    } else if (pointObject["forMod"] == undefined) {
                        size = Math.max(0, Math.min(volumeCap, Math.round((pointObject["volume"] | 0) * volumeCap / 100)));
                    }
                    else {
                        size = ((pointObject["forMod"] | 0) > 0) ? Math.round(pointObject["volume"] | 0) : Math.max(0, Math.min(volumeCap, Math.round((pointObject["volume"] | 0) * volumeCap / 100)));
                    }

                    if (time > song.beatsPerBar * Config.partsPerBeat) continue;
                    if (note.pins.length == 0) {
                        //if (time < noteClock) continue;
                        note.start = time;
                        startInterval = interval;
                    } else {
                        //if (time <= noteClock) continue;
                    }
                    //noteClock = time;

                    note.pins.push(makeNotePin(interval - startInterval, time - note.start, size));
                }
                if (note.pins.length < 2) continue;

                note.end = note.pins[note.pins.length - 1].time + note.start;

                const maxPitch: number = isNoiseChannel ? Config.drumCount - 1 : Config.maxPitch;
                let lowestPitch: number = maxPitch;
                let highestPitch: number = 0;
                for (let k: number = 0; k < note.pitches.length; k++) {
                    note.pitches[k] += startInterval;
                    if (note.pitches[k] < 0 || note.pitches[k] > maxPitch) {
                        note.pitches.splice(k, 1);
                        k--;
                    }
                    if (note.pitches[k] < lowestPitch) lowestPitch = note.pitches[k];
                    if (note.pitches[k] > highestPitch) highestPitch = note.pitches[k];
                }
                if (note.pitches.length < 1) continue;

                for (let k: number = 0; k < note.pins.length; k++) {
                    const pin: NotePin = note.pins[k];
                    if (pin.interval + lowestPitch < 0) pin.interval = -lowestPitch;
                    if (pin.interval + highestPitch > maxPitch) pin.interval = maxPitch - highestPitch;
                    if (k >= 2) {
                        if (pin.interval == note.pins[k - 1].interval &&
                            pin.interval == note.pins[k - 2].interval &&
                            pin.size == note.pins[k - 1].size &&
                            pin.size == note.pins[k - 2].size) {
                            note.pins.splice(k - 1, 1);
                        k--;
                            }
                    }
                }

                if (note.start == 0) {
                    note.continuesLastPattern = (noteObject["continuesLastPattern"] === true);
                } else {
                    note.continuesLastPattern = false;
                }

                if ((format != "ultrabox" && format != "slarmoosbox") && instrument.modulators[mod] == Config.modulators.dictionary["tempo"].index) {
                    for (const pin of note.pins) {
                        const oldMin: number = 30;
                        const newMin: number = 1;
                        const old: number = pin.size + oldMin;
                        pin.size = old - newMin; // convertRealFactor will add back newMin as necessary
                    }
                }

                this.notes.push(note);
            }
        }
    }
}
