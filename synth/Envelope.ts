// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Config, LFOEnvelopeTypes, EnvelopeType, Envelope, AutomationTarget } from "./SynthConfig";
import { clamp } from "./utils";
export class EnvelopeSettings {
    public target: number = 0;
    public index: number = 0;
    public envelope: number = 0;
    //slarmoo's box 1.0
    public pitchEnvelopeStart: number;
    public pitchEnvelopeEnd: number;
    public inverse: boolean;
    //midbox
    public perEnvelopeSpeed: number = Config.envelopes[this.envelope].speed;
    public perEnvelopeLowerBound: number = 0;
    public perEnvelopeUpperBound: number = 1;
    //modulation support
    public tempEnvelopeSpeed: number | null = null;
    public tempEnvelopeLowerBound: number | null = null;
    public tempEnvelopeUpperBound: number | null = null;
    //pseudo random
    public steps: number = 2;
    public seed: number = 2;
    //lfo and random types
    public waveform: number = LFOEnvelopeTypes.sine;
    //moved discrete into here
    public discrete: boolean = false;

    constructor(public isNoiseEnvelope: boolean) {
        this.reset();
    }

    reset(): void {
        this.target = 0;
        this.index = 0;
        this.envelope = 0;
        this.pitchEnvelopeStart = 0;
        this.pitchEnvelopeEnd = this.isNoiseEnvelope ? Config.drumCount - 1 : Config.maxPitch;
        this.inverse = false;
        this.isNoiseEnvelope = false;
        this.perEnvelopeSpeed = Config.envelopes[this.envelope].speed;
        this.perEnvelopeLowerBound = 0;
        this.perEnvelopeUpperBound = 1;
        this.tempEnvelopeSpeed = null;
        this.tempEnvelopeLowerBound = null;
        this.tempEnvelopeUpperBound = null;
        this.steps = 2;
        this.seed = 2;
        this.waveform = LFOEnvelopeTypes.sine;
        this.discrete = false;
    }

    public toJsonObject(): Object {
        const envelopeObject: any = {
            "target": Config.instrumentAutomationTargets[this.target].name,
            "envelope": Config.newEnvelopes[this.envelope].name,
            "inverse": this.inverse,
            "perEnvelopeSpeed": this.perEnvelopeSpeed,
            "perEnvelopeLowerBound": this.perEnvelopeLowerBound,
            "perEnvelopeUpperBound": this.perEnvelopeUpperBound,
            "discrete": this.discrete,
        };
        if (Config.instrumentAutomationTargets[this.target].maxCount > 1) {
            envelopeObject["index"] = this.index;
        }
        if (Config.newEnvelopes[this.envelope].name == "pitch") {
            envelopeObject["pitchEnvelopeStart"] = this.pitchEnvelopeStart;
            envelopeObject["pitchEnvelopeEnd"] = this.pitchEnvelopeEnd;
        } else if (Config.newEnvelopes[this.envelope].name == "random") {
            envelopeObject["steps"] = this.steps;
            envelopeObject["seed"] = this.seed;
            envelopeObject["waveform"] = this.waveform;
        } else if (Config.newEnvelopes[this.envelope].name == "lfo") {
            envelopeObject["waveform"] = this.waveform;
            envelopeObject["steps"] = this.steps;
        }
        return envelopeObject;
    }

    public fromJsonObject(envelopeObject: any, format: string): void {
        this.reset();

        let target: AutomationTarget = Config.instrumentAutomationTargets.dictionary[envelopeObject["target"]];
        if (target == null) target = Config.instrumentAutomationTargets.dictionary["noteVolume"];
        this.target = target.index;

        let envelope: Envelope = Config.envelopes.dictionary["none"];
        let isTremolo2: Boolean = false;
        if (format == "slarmoosbox" || format == "theepbox") {
            if (envelopeObject["envelope"] == "tremolo2") {
                envelope = Config.newEnvelopes[EnvelopeType.lfo];
                isTremolo2 = true;
            } else if (envelopeObject["envelope"] == "tremolo") {
                envelope = Config.newEnvelopes[EnvelopeType.lfo];
                isTremolo2 = false;
            } else {
                envelope = Config.newEnvelopes.dictionary[envelopeObject["envelope"]];
            }
        } else {
            if (Config.envelopes.dictionary[envelopeObject["envelope"]].type == EnvelopeType.tremolo2) {
                envelope = Config.newEnvelopes[EnvelopeType.lfo];
                isTremolo2 = true;
            } else if (Config.newEnvelopes[Math.max(Config.envelopes.dictionary[envelopeObject["envelope"]].type - 1, 0)].index > EnvelopeType.lfo){
                envelope = Config.newEnvelopes[Config.envelopes.dictionary[envelopeObject["envelope"]].type - 1];
            } else {
                envelope = Config.newEnvelopes[Config.envelopes.dictionary[envelopeObject["envelope"]].type];
            }
        }

        if (envelope == undefined) {
            if (Config.envelopes.dictionary[envelopeObject["envelope"]].type == EnvelopeType.tremolo2) {
                envelope = Config.newEnvelopes[EnvelopeType.lfo];
                isTremolo2 = true;
            } else if (Config.newEnvelopes[Math.max(Config.envelopes.dictionary[envelopeObject["envelope"]].type - 1, 0)].index > EnvelopeType.lfo) {
                envelope = Config.newEnvelopes[Config.envelopes.dictionary[envelopeObject["envelope"]].type - 1];
            } else {
                envelope = Config.newEnvelopes[Config.envelopes.dictionary[envelopeObject["envelope"]].type];
            }
        }
        if (envelope == null) envelope = Config.envelopes.dictionary["none"];
        this.envelope = envelope.index;

        if (envelopeObject["index"] != undefined) {
            this.index = clamp(0, Config.instrumentAutomationTargets[this.target].maxCount, envelopeObject["index"] | 0);
        } else {
            this.index = 0;
        }

        if (envelopeObject["pitchEnvelopeStart"] != undefined) {
            this.pitchEnvelopeStart = clamp(0, this.isNoiseEnvelope ? Config.drumCount : Config.maxPitch + 1, envelopeObject["pitchEnvelopeStart"]);
        } else {
            this.pitchEnvelopeStart = 0;
        }

        if (envelopeObject["pitchEnvelopeEnd"] != undefined) {
            this.pitchEnvelopeEnd = clamp(0, this.isNoiseEnvelope ? Config.drumCount : Config.maxPitch + 1, envelopeObject["pitchEnvelopeEnd"]);
        } else {
            this.pitchEnvelopeEnd = this.isNoiseEnvelope ? Config.drumCount : Config.maxPitch;
        }

        this.inverse = Boolean(envelopeObject["inverse"]);

        if (envelopeObject["perEnvelopeSpeed"] != undefined) {
            this.perEnvelopeSpeed = envelopeObject["perEnvelopeSpeed"];
        } else {
            this.perEnvelopeSpeed = Config.envelopes.dictionary[envelopeObject["envelope"]].speed;
        }

        if (envelopeObject["perEnvelopeLowerBound"] != undefined) {
            this.perEnvelopeLowerBound = clamp(Config.perEnvelopeBoundMin, Config.perEnvelopeBoundMax + 1, envelopeObject["perEnvelopeLowerBound"]);
        } else {
            this.perEnvelopeLowerBound = 0;
        }

        if (envelopeObject["perEnvelopeUpperBound"] != undefined) {
            this.perEnvelopeUpperBound = clamp(Config.perEnvelopeBoundMin, Config.perEnvelopeBoundMax + 1, envelopeObject["perEnvelopeUpperBound"]);
        } else {
            this.perEnvelopeUpperBound = 1;
        }

        //convert tremolo2 settings into lfo
        if (isTremolo2) {
            if (this.inverse) {
                this.perEnvelopeUpperBound = Math.floor((this.perEnvelopeUpperBound / 2) * 10) / 10;
                this.perEnvelopeLowerBound = Math.floor((this.perEnvelopeLowerBound / 2) * 10) / 10;
            } else {
                this.perEnvelopeUpperBound = Math.floor((0.5 + (this.perEnvelopeUpperBound - this.perEnvelopeLowerBound) / 2) * 10) / 10;
                this.perEnvelopeLowerBound = 0.5;
            }
        }

        if (envelopeObject["steps"] != undefined) {
            this.steps = clamp(1, Config.randomEnvelopeStepsMax + 1, envelopeObject["steps"]);
        } else {
            this.steps = 2;
        }

        if (envelopeObject["seed"] != undefined) {
            this.seed = clamp(1, Config.randomEnvelopeSeedMax + 1, envelopeObject["seed"]);
        } else {
            this.seed = 2;
        }

        if (envelopeObject["waveform"] != undefined) {
            this.waveform = envelopeObject["waveform"];
        } else {
            this.waveform = LFOEnvelopeTypes.sine;
        }

        if (envelopeObject["discrete"] != undefined) {
            this.discrete = envelopeObject["discrete"];
        } else {
            this.discrete = false;
        }
    }
}
