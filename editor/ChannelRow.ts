// Copyright (C) 2021 John Nesky, distributed under the MIT license.

import { ChannelType } from "../synth/SynthConfig";
import { Pattern } from "../synth/Pattern";
import { ColorConfig, ChannelColors } from "./ColorConfig";
import { SongDocument } from "./SongDocument";
import { HTML } from "imperative-html/dist/esm/elements-strict";

export class Box {
    private readonly _text: Text = document.createTextNode("");
    private readonly _label: HTMLElement = HTML.div({ class: "channelBoxLabel" }, this._text);
    public readonly container: HTMLElement = HTML.div({ class: "channelBox", style: `margin: 1px; height: 28px;` }, this._label);
    private _renderedIndex: number = -1;
    private _renderedLabelColor: string = "?";
    private _renderedVisibility: string = "?";
    private _renderedNumberVisibility: string = "?";
    private _renderedBorderLeft: string = "?";
    private _renderedBorderRight: string = "?";
    private _renderedBackgroundColor: string = "?";
    constructor(channel: number, color: string) {
        this.container.style.background = ColorConfig.uiWidgetBackground;
        this._label.style.color = color;
    }

    public setWidth(width: number): void {
        this.container.style.width = (width - 2) + "px"; // there's a 1 pixel margin on either side.
    }

    public setHeight(height: number): void {
        this.container.style.height = (height - 2) + "px"; // there's a 1 pixel margin on either side.
    }

    public setIndex(index: number, selected: boolean, dim: boolean, color: string, isNoise: boolean, isMod: boolean, numberVisibility: string): void {
        if (this._renderedIndex != index) {
            if (index >= 100) {
                this._label.setAttribute("font-size", "16");
                this._label.style.setProperty("transform", "translate(0px, -1.5px)");
            }
            else {
                this._label.setAttribute("font-size", "20");
                this._label.style.setProperty("transform", "translate(0px, 0px)");
            }

            this._renderedIndex = index;
            this._text.data = String(index);
        }
        let useColor: string = selected ? ColorConfig.c_invertedText : color;
        if (this._renderedLabelColor != useColor) {
            this._label.style.color = useColor;
            this._renderedLabelColor = useColor;
        }
        if (this._renderedNumberVisibility != numberVisibility) {
            this._label.style.visibility = numberVisibility;
            this._renderedNumberVisibility = numberVisibility;
        }
        if (!selected) {
            if (isNoise)
                color = dim ? ColorConfig.c_trackEditorBgNoiseDim : ColorConfig.c_trackEditorBgNoise;
            else if (isMod)
                color = dim ? ColorConfig.c_trackEditorBgModDim : ColorConfig.c_trackEditorBgMod;
            else
                color = dim ? ColorConfig.c_trackEditorBgPitchDim : ColorConfig.c_trackEditorBgPitch;
        }
        color = selected ? color : (index == 0) ? "none" : color;
        if (this._renderedBackgroundColor != color) {
            this.container.style.background = color;
            this._renderedBackgroundColor = color;
        }
    }
    // These cache the value given to them, since they're apparently quite
    // expensive to set.
    public setVisibility(visibility: string): void {
        if (this._renderedVisibility != visibility) {
            this.container.style.visibility = visibility;
            this._renderedVisibility = visibility;
        }
    }
    public setBorderLeft(borderLeft: string): void {
        if (this._renderedBorderLeft != borderLeft) {
            this.container.style.setProperty("border-left", borderLeft);
            this._renderedBorderLeft = borderLeft;
        }
    }
    public setBorderRight(borderRight: string): void {
        if (this._renderedBorderRight != borderRight) {
            this.container.style.setProperty("border-right", borderRight);
            this._renderedBorderRight = borderRight;
        }
    }
}

export class ChannelRow {
    public patternHeight: number = 28;
    public patternTop: number = 0;

    private _beginsFolder: boolean = false;
    private _isInFolder: boolean = false;
    private _renderedBarWidth: number = -1;
    private _boxes: Box[] = [];

    public readonly container: HTMLElement = HTML.div({ class: "channelRow" });

    constructor(private readonly _doc: SongDocument, public readonly index: number, public readonly color: number) { }

    public render(): void {
        this.patternHeight = this._doc.getChannelHeight();

        const barWidth: number = this._doc.getBarWidth();
        if (this._boxes.length != this._doc.song.barCount) {
            for (let x: number = this._boxes.length; x < this._doc.song.barCount; x++) {
                const box: Box = new Box(this.index, ColorConfig.getChannelColor(this._doc.song, this.color, this.index, this._doc.prefs.fixChannelColorOrder).secondaryChannel);
                box.setWidth(barWidth);
                this.container.appendChild(box.container);
                this._boxes[x] = box;
            }
            for (let x: number = this._doc.song.barCount; x < this._boxes.length; x++) {
                this.container.removeChild(this._boxes[x].container);
            }
            this._boxes.length = this._doc.song.barCount;
        }

        if (this._renderedBarWidth != barWidth) {
            this._renderedBarWidth = barWidth;
            for (let x: number = 0; x < this._boxes.length; x++) {
                this._boxes[x].setWidth(barWidth);
            }
        }

        if (this._doc.prefs.enableChannelFolders) {
            if (this._doc.song.channels[this.index - 1] && this._doc.song.channels[this.index - 1].folder != this._doc.song.channels[this.index].folder) this._beginsFolder = true;
            else if (!this._doc.song.channels[this.index - 1] && this._doc.song.channels[this.index].folder != 0) this._beginsFolder = true;
            else this._beginsFolder = false;
            if (this._doc.song.channels[this.index].folder != 0) this._isInFolder = true;
            else this._isInFolder = false;

            if (this._doc.minimizedFolders.includes(this._doc.song.channels[this.index].folder)) {
                this.patternHeight = 4
            }

            for (let x: number = 0; x < this._boxes.length; x++) {
                this._boxes[x].setHeight(this.patternHeight);
                if (this._beginsFolder) {
                    this._boxes[x].container.style.marginTop = "5px";
                    // basically the hackiest hack possible
                    if (this._isInFolder) this._boxes[x].container.style.boxShadow = "0 -5px 0 " + ColorConfig.getArbitaryChannelColor("mod", this._doc.song.channels[this.index].folder - 1).secondaryChannel + "60";
                }
            }

            if (this._beginsFolder) this.patternHeight += 4;
            if (this._isInFolder) this.container.style.backgroundColor = ColorConfig.getArbitaryChannelColor("mod", this._doc.song.channels[this.index].folder - 1).secondaryChannel + "30";
        } else {
            this._isInFolder = false;
            this._doc.minimizedFolders = [];
            for (let x: number = 0; x < this._boxes.length; x++) {
                this._boxes[x].setHeight(this.patternHeight);
            }
        }

        for (let i: number = 0; i < this._boxes.length; i++) {
            const pattern: Pattern | null = this._doc.song.getPattern(this.index, i);
            const selected: boolean = (i == this._doc.bar && this.index == this._doc.channel);
            const dim: boolean = (pattern == null || pattern.notes.length == 0);

            const box: Box = this._boxes[i];
            if (i < this._doc.song.barCount) {
                const colors: ChannelColors = ColorConfig.getChannelColor(this._doc.song, this.color, this.index, this._doc.prefs.fixChannelColorOrder);
                const useColor = dim && !selected ? colors.secondaryChannel : colors.primaryChannel
                if (!this._doc.minimizedFolders.includes(this._doc.song.channels[this.index].folder)) {
                    box.setIndex(this._doc.song.channels[this.index].bars[i], selected, dim, useColor,
                    this._doc.song.channels[this.index].type === ChannelType.noise, this._doc.song.channels[this.index].type === ChannelType.mod, "visible");
                } else {
                    box.setIndex(this._doc.song.channels[this.index].bars[i], selected, dim, useColor,
                    this._doc.song.channels[this.index].type === ChannelType.noise, this._doc.song.channels[this.index].type === ChannelType.mod, "hidden");
                }
                box.setVisibility("visible");
            } else {
                box.setVisibility("hidden");
            }
            if (i == this._doc.synth.loopBarStart) {
                box.setBorderLeft(`1px dashed ${ColorConfig.uiWidgetFocus}`);
            }
            else {
                box.setBorderLeft("none");
            }
            if (i == this._doc.synth.loopBarEnd) {
                box.setBorderRight(`1px dashed ${ColorConfig.uiWidgetFocus}`);
            }
            else {
                box.setBorderRight("none");
            }
        }
    }
}
