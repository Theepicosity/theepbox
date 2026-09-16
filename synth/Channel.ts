// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { ChannelType } from "./SynthConfig";
import { Instrument } from "./Instrument";
import { Pattern } from "./Pattern";

export class Channel {
    public type: ChannelType;
    public octave: number = 0;
    public readonly instruments: Instrument[] = [];
    public readonly patterns: Pattern[] = [];
    public readonly bars: number[] = [];
    public muted: boolean = false;
    public visible: boolean = true;
    public name: string = "";
    public color: number = 0;
    constructor(type: ChannelType = ChannelType.pitch) {
        this.type = type;
    }
}
