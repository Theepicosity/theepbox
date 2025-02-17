// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

//import { Instrument } from "./Instrument";
import { Pattern } from "./Pattern";

export class Channel {
    public octave: number = 0;
    //public readonly instruments: Instrument[] = [];
    public readonly patterns: Pattern[] = [];
    public readonly bars: number[] = [];
    public muted: boolean = false;
    public name: string = "";
}
