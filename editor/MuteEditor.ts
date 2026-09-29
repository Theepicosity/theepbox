// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { SongDocument } from "./SongDocument";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { ColorConfig } from "./ColorConfig";
import { InputBox } from "./HTMLWrapper";
import { ChangeChannelOrder, ChangeChannelName, ChangeRemoveChannel, ChangeAddChannelFolder, ChangeMinimizeChannelFolder } from "./changes";
import { ChannelType, Config } from "../synth/SynthConfig";
import { Channel } from "../synth/Channel";
import { SongEditor } from "./SongEditor";
import { TrackEditor } from "./TrackEditor";

//namespace beepbox {
export class MuteEditor {

    private _cornerFiller: HTMLDivElement = HTML.div({ style: `background: ${ColorConfig.editorBackground}; position: sticky; bottom: 0; left: 0; width: 32px; height: 30px;` });

    private readonly _buttons: HTMLDivElement[] = [];
    private readonly _channelCounts: HTMLDivElement[] = [];
    private readonly _channelNameDisplay: HTMLDivElement = HTML.div({ style: `background-color: ${ColorConfig.uiWidgetFocus}; white-space:nowrap; display: none; transform:translate(20px); width: auto; pointer-events: none; position: absolute; border-radius: 0.2em; z-index: 2;`, "color": ColorConfig.primaryText }, "");
    public readonly _channelNameInput: InputBox = new InputBox(HTML.input({ style: `color: ${ColorConfig.primaryText}; background-color: ${ColorConfig.uiWidgetFocus}; margin-top: -2px; display: none; width: 6em; position: absolute; border-radius: 0.2em; z-index: 2;`, "color": ColorConfig.primaryText }, ""), this._doc, (oldValue: string, newValue: string) => new ChangeChannelName(this._doc, oldValue, newValue));

    private readonly _channelDropDown: HTMLSelectElement = HTML.select({ style: "width: 0px; left: 19px; height: 19px; position:absolute; opacity:0" },
        HTML.option({ value: "rename" }, "Rename..."),
        HTML.option({ value: "addFolder" }, "Add to folder"),
        HTML.option({ value: "removeFolder" }, "Remove from folder"),
        HTML.option({ value: "chnUp" }, "Move up"),
        HTML.option({ value: "chnDown" }, "Move down"),
        HTML.option({ value: "chnMute" }, "Mute"),
        HTML.option({ value: "chnUnmute" }, "Unmute"),
        HTML.option({ value: "chnSolo" }, "Solo"),
        HTML.option({ value: "chnShow" }, "Make visible"),
        HTML.option({ value: "chnHide" }, "Make invisible"),
        HTML.option({ value: "chnOnlyShow" }, "Make only visible"),

        HTML.option({ value: "chnFolMute" }, "Mute folder"),
        HTML.option({ value: "chnFolUnmute" }, "Unmute folder"),
        HTML.option({ value: "chnFolSoli" }, "Soli folder"),
        HTML.option({ value: "chnFolShow" }, "Make folder visible"),
        HTML.option({ value: "chnFolHide" }, "Make folder invisible"),
        HTML.option({ value: "chnFolOnlyShow" }, "Only make folder visible"),
        HTML.option({ value: "chnMin" }, "Minimize folder"),
        HTML.option({ value: "chnMax" }, "Maximize folder"),

        HTML.option({ value: "chnInsert" }, "Insert below"),
        HTML.option({ value: "chnDelete" }, "Delete"),
    );

    public readonly container: HTMLElement = HTML.div({ class: "muteEditor", style: "position: sticky; padding-top: " + Config.barEditorHeight + "px;" }, this._channelNameDisplay, this._channelNameInput.input, this._channelDropDown);

    private _editorHeight: number = 128;
    private _renderedPitchChannels: number = 0;
    private _renderedNoiseChannels: number = 0;
    private _renderedModChannels: number = 0;
    private _renderedActiveChannelCount: number = 0;
    private _channelDropDownChannel: number = 0;
    private _channelDropDownOpen: boolean = false;
    private _channelDropDownLastState: boolean = false;

    constructor(private _doc: SongDocument, private _editor: SongEditor, private _trackEditor: TrackEditor) {
        this.container.addEventListener("click", this._onClick);
        this.container.addEventListener("mousemove", this._onMouseMove);
        this.container.addEventListener("mouseleave", this._onMouseLeave);

        this._channelDropDown.selectedIndex = -1;
        this._channelDropDown.addEventListener("change", this._channelDropDownHandler);
        this._channelDropDown.addEventListener("mousedown", this._channelDropDownGetOpenedPosition);
        this._channelDropDown.addEventListener("blur", this._channelDropDownBlur);
        this._channelDropDown.addEventListener("click", this._channelDropDownClick);

        this._channelNameInput.input.addEventListener("change", this._channelNameInputHide);
        this._channelNameInput.input.addEventListener("blur", this._channelNameInputHide);
        this._channelNameInput.input.addEventListener("mousedown", this._channelNameInputClicked);
        this._channelNameInput.input.addEventListener("input", this._channelNameInputWhenInput);
    }

    private _channelNameInputWhenInput = (): void => {
        let newValue = this._channelNameInput.input.value;
        if (newValue.length > 15) {
            this._channelNameInput.input.value = newValue.substring(0, 15);
        }
    }

    private _channelNameInputClicked = (event: MouseEvent): void => {
        event.stopPropagation();
    }

    private _channelNameInputHide = (): void => {
        this._channelNameInput.input.style.setProperty("display", "none");
        this._channelNameDisplay.style.setProperty("display", "none");
    }

    private _channelDropDownClick = (event: MouseEvent): void => {
        this._channelDropDownOpen = !this._channelDropDownLastState;
        this._channelDropDownGetOpenedPosition(event);
        //console.log("click " + this._channelDropDownOpen);
    }

    private _channelDropDownBlur = (): void => {
        this._channelDropDownOpen = false;
        this._channelNameDisplay.style.setProperty("display", "none");
        //console.log("blur " + this._channelDropDownOpen);
    }

    private _channelDropDownGetOpenedPosition = (event: MouseEvent): void => {

        this._channelDropDownLastState = this._channelDropDownOpen;

        for (let i: number = 0; i < this._trackEditor.patternTops.length; i++) {
            if (parseInt(this._channelDropDown.style.getPropertyValue("top")) > this._trackEditor.patternTops[i]) this._channelDropDownChannel = Math.min(this._doc.song.getChannelCount() - 1, i);
            else break;
        }
        this._doc.muteEditorChannel = this._channelDropDownChannel;

        this._channelNameDisplay.style.setProperty("display", "");

        // if the channel is muted, show the unmute option
        if (this._doc.song.channels[this._channelDropDownChannel].muted == true) {
            this._channelDropDown.options[5].hidden = true;
            this._channelDropDown.options[6].removeAttribute("hidden");
        }
        else {
            this._channelDropDown.options[6].hidden = true;
            this._channelDropDown.options[5].removeAttribute("hidden");
        }
        if (!this._doc.prefs.showChannels) {
            this._channelDropDown.options[8].hidden = true;
            this._channelDropDown.options[9].hidden = true;
            this._channelDropDown.options[10].hidden = true;
        }
        else if (this._doc.song.channels[this._channelDropDownChannel].visible == true) {
            this._channelDropDown.options[8].hidden = true;
            this._channelDropDown.options[9].removeAttribute("hidden");
            this._channelDropDown.options[10].removeAttribute("hidden");
        }
        else {
            this._channelDropDown.options[9].hidden = true;
            this._channelDropDown.options[8].removeAttribute("hidden");
            this._channelDropDown.options[10].removeAttribute("hidden");
        }
        if (!this._doc.prefs.enableChannelFolders) {
            this._channelDropDown.options[1].hidden = true;
            this._channelDropDown.options[2].hidden = true;
        }
        else if (this._doc.song.channels[this._channelDropDownChannel].folder == 0) {
            this._channelDropDown.options[2].hidden = true;
            this._channelDropDown.options[1].removeAttribute("hidden");
        }
        else {
            this._channelDropDown.options[1].hidden = true;
            this._channelDropDown.options[2].removeAttribute("hidden");
        }

        // find out if any channels in the folder are muted, and if so, enable to option to unmute all (and do this for the other options too!)
        let anyChannelMuted: boolean = false;
        let anyChannelUnmuted: boolean = false;
        let anyChannelShown: boolean = false;
        let anyChannelHidden: boolean = false;
        for (let i: number = 0; i < this._doc.song.channels.length; i++) {
            let channel: Channel = this._doc.song.channels[i];
            if (channel.folder == this._doc.song.channels[this._channelDropDownChannel].folder) {
                if (channel.muted) anyChannelMuted = true;
                else anyChannelUnmuted = true;
                if (channel.visible) anyChannelShown = true;
                else anyChannelHidden = true;
            }
        }

        if (anyChannelMuted) {
            this._channelDropDown.options[12].removeAttribute("hidden");
        } else {
            this._channelDropDown.options[12].hidden = true;
        }
        if (anyChannelUnmuted) {
            this._channelDropDown.options[11].removeAttribute("hidden");
        } else {
            this._channelDropDown.options[11].hidden = true;
        }
        if (this._doc.prefs.showChannels) {
            if (anyChannelShown) {
                this._channelDropDown.options[15].removeAttribute("hidden");
            } else {
                this._channelDropDown.options[15].hidden = true;
            }
            if (anyChannelHidden) {
                this._channelDropDown.options[14].removeAttribute("hidden");
            } else {
                this._channelDropDown.options[14].hidden = true;
            }
            this._channelDropDown.options[16].removeAttribute("hidden");
        }
        else {
            this._channelDropDown.options[14].hidden = true;
            this._channelDropDown.options[15].hidden = true;
            this._channelDropDown.options[16].hidden = true;
        }

        if (this._doc.minimizedFolders.includes(this._doc.song.channels[this._channelDropDownChannel].folder)) {
            this._channelDropDown.options[17].hidden = true;
            this._channelDropDown.options[18].removeAttribute("hidden");
        }
        else {
            this._channelDropDown.options[18].hidden = true;
            this._channelDropDown.options[17].removeAttribute("hidden");
        }

        // if a channel isnt in a folder i will just hide these attributes tbh
        if (this._doc.song.channels[this._channelDropDownChannel].folder == 0 || !this._doc.prefs.enableChannelFolders) {
            this._channelDropDown.options[11].hidden = true;
            this._channelDropDown.options[12].hidden = true;
            this._channelDropDown.options[13].hidden = true;
            this._channelDropDown.options[14].hidden = true;
            this._channelDropDown.options[15].hidden = true;
            this._channelDropDown.options[16].hidden = true;
            this._channelDropDown.options[17].hidden = true;
            this._channelDropDown.options[18].hidden = true;
        }
        else {
            this._channelDropDown.options[13].removeAttribute("hidden");
        }

        // Check if channel is at limit, in which case another can't be inserted
        if ((this._doc.song.channels[this._channelDropDownChannel].type == ChannelType.pitch && this._doc.song.pitchChannelCount == Config.pitchChannelCountMax)
            || (this._doc.song.channels[this._channelDropDownChannel].type == ChannelType.noise && this._doc.song.noiseChannelCount == Config.noiseChannelCountMax)
            || (this._doc.song.channels[this._channelDropDownChannel].type == ChannelType.mod && this._doc.song.modChannelCount == Config.modChannelCountMax)) {
            this._channelDropDown.options[19].disabled = true;
        }
        else {
            this._channelDropDown.options[19].disabled = false;
        }

        // Also check if a channel is eligible to move up or down based on the song's channel settings.
        if (this._channelDropDownChannel == 0) {
            this._channelDropDown.options[3].disabled = true;
        }
        else {
            this._channelDropDown.options[3].disabled = false;
        }
        if (this._channelDropDownChannel == this._doc.song.getChannelCount() - 1) {
            this._channelDropDown.options[4].disabled = true;
        }
        else {
            this._channelDropDown.options[4].disabled = false;
        }

        // Also, can't delete the last pitch channel.
        if (this._doc.song.pitchChannelCount == 1 && this._channelDropDownChannel == 0) {
            this._channelDropDown.options[20].disabled = true;
        }
        else {
            this._channelDropDown.options[20].disabled = false;
        }
    }

    private _channelDropDownHandler = (event: Event): void => {
        this._channelNameDisplay.style.setProperty("display", "none");
        this._channelDropDown.style.setProperty("display", "none");
        this._channelDropDownOpen = false;
        event.stopPropagation();
        //console.log("handler " + this._channelDropDownOpen);

        switch (this._channelDropDown.value) {
            case "rename":
                this._channelNameInput.input.style.setProperty("display", "");
                this._channelNameInput.input.style.setProperty("transform", this._channelNameDisplay.style.getPropertyValue("transform"));
                if (this._channelNameDisplay.textContent != null) {
                    this._channelNameInput.input.value = this._channelNameDisplay.textContent;
                }
                else {
                    this._channelNameInput.input.value = "";
                }
                this._channelNameInput.input.select();
                break;
            case "addFolder":
            case "removeFolder":
                this._doc.record(new ChangeAddChannelFolder(this._doc, this._channelDropDownChannel, this._channelDropDownChannel));
                break;
            case "chnUp":
                this._doc.record(new ChangeChannelOrder(this._doc, this._channelDropDownChannel, this._channelDropDownChannel, -1));
                break;
            case "chnDown":
                this._doc.record(new ChangeChannelOrder(this._doc, this._channelDropDownChannel, this._channelDropDownChannel, 1));
                break;
            case "chnMute":
            case "chnUnmute":
                this._doc.song.channels[this._channelDropDownChannel].muted = !this._doc.song.channels[this._channelDropDownChannel].muted;
                this.render();
                break;
            case "chnFolMute":
                for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                    if (this._doc.song.channels[this._channelDropDownChannel].folder == this._doc.song.channels[channel].folder) this._doc.song.channels[channel].muted = true;
                }
                this.render();
                break;
            case "chnFolUnmute":
                for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                    if (this._doc.song.channels[this._channelDropDownChannel].folder == this._doc.song.channels[channel].folder) this._doc.song.channels[channel].muted = false;
                }
                this.render();
                break;
            case "chnSolo": {
                // Check for any channel not matching solo pattern
                let shouldSolo: boolean = false;
                for (let channel: number = 0; channel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channel++) {
                    if (this._doc.song.channels[channel].muted == (channel == this._channelDropDownChannel)) {
                        shouldSolo = true;
                        channel = this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount;
                    }
                }
                if (shouldSolo) {
                    for (let channel: number = 0; channel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channel++) {
                        this._doc.song.channels[channel].muted = (channel != this._channelDropDownChannel);
                    }
                }
                else {
                    for (let channel: number = 0; channel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channel++) {
                        this._doc.song.channels[channel].muted = false;
                    }
                }
                this.render();
                break;
            }
            case "chnFolSoli": {
                let shouldSoloFol: boolean = false;
                for (let channel: number = 0; channel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channel++) {
                    if (this._doc.song.channels[channel].muted == (this._doc.song.channels[this._channelDropDownChannel].folder == this._doc.song.channels[channel].folder)) {
                        shouldSoloFol = true;
                        channel = this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount;
                    }
                }
                if (shouldSoloFol) {
                    for (let channel: number = 0; channel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channel++) {
                        this._doc.song.channels[channel].muted = (this._doc.song.channels[this._channelDropDownChannel].folder != this._doc.song.channels[channel].folder);
                    }
                }
                else {
                    for (let channel: number = 0; channel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channel++) {
                        this._doc.song.channels[channel].muted = false;
                    }
                }
                this.render();
                break;
            }
            case "chnHide":
            case "chnShow":
                this._doc.song.channels[this._channelDropDownChannel].visible = !this._doc.song.channels[this._channelDropDownChannel].visible;
                this._doc.notifier.changed();
                this.render();
                break;
            case "chnFolHide":
                for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                    if (this._doc.song.channels[this._channelDropDownChannel].folder == this._doc.song.channels[channel].folder) this._doc.song.channels[channel].visible = false;
                }
                this.render();
                break;
            case "chnFolShow":
                for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                    if (this._doc.song.channels[this._channelDropDownChannel].folder == this._doc.song.channels[channel].folder) this._doc.song.channels[channel].visible = true;
                }
                this.render();
                break;
            case "chnOnlyShow":
                let shouldShow: boolean = false;
                for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                    if (this._doc.song.channels[channel].visible == (channel != this._channelDropDownChannel)) {
                        shouldShow = true;
                        channel = this._doc.song.getChannelCount();
                    }
                }
                if (shouldShow) {
                    for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                        this._doc.song.channels[channel].visible = (channel == this._channelDropDownChannel);
                    }
                }
                else {
                    for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                        this._doc.song.channels[channel].visible = true;
                    }
                }
                this._doc.notifier.changed();
                this.render();
                break;
            case "chnFolOnlyShow":
                let shouldShowFol: boolean = false;
                for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                    if (this._doc.song.channels[channel].visible == (this._doc.song.channels[this._channelDropDownChannel].folder == this._doc.song.channels[channel].folder)) {
                        shouldShowFol = true;
                        channel = this._doc.song.getChannelCount();
                    }
                }
                if (shouldShowFol) {
                    for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                        this._doc.song.channels[channel].visible = (this._doc.song.channels[this._channelDropDownChannel].folder != this._doc.song.channels[channel].folder);
                    }
                }
                else {
                    for (let channel: number = 0; channel < this._doc.song.getChannelCount(); channel++) {
                        this._doc.song.channels[channel].visible = false;
                    }
                }
                this._doc.notifier.changed();
                this.render();
                break;
            case "chnMax":
                this._doc.record(new ChangeMinimizeChannelFolder(this._doc, this._channelDropDownChannel, true));
                break;
            case "chnMin":
                this._doc.record(new ChangeMinimizeChannelFolder(this._doc, this._channelDropDownChannel));
                break;
            case "chnInsert": {
                this._doc.channel = this._channelDropDownChannel;
                this._doc.selection.resetBoxSelection();
                this._doc.selection.insertChannel();
                break;
            }
            case "chnDelete": {
                this._doc.record(new ChangeRemoveChannel(this._doc, this._channelDropDownChannel, this._channelDropDownChannel));

                break;
            }
        }
        if (this._channelDropDown.value != "rename")
            this._editor.refocusStage();

        this._channelDropDown.selectedIndex = -1;
    }

    private _onClick = (event: MouseEvent): void => {

        const index = this._buttons.indexOf(<HTMLDivElement>event.target);
        if (index == -1) return;
        let xPos: number = event.clientX - this._buttons[0].getBoundingClientRect().left;
        if (xPos < 21.0) {
            if (event.shiftKey) this._doc.song.channels[index].visible = !this._doc.song.channels[index].visible;
            else this._doc.song.channels[index].muted = !this._doc.song.channels[index].muted;
        }
        this._doc.notifier.changed();
    }

    private _onMouseMove = (event: MouseEvent): void => {
        const index = this._buttons.indexOf(<HTMLDivElement>event.target);
        if (index == -1) {
            if (!this._channelDropDownOpen && event.target != this._channelNameDisplay && event.target != this._channelDropDown) {
                this._channelNameDisplay.style.setProperty("display", "none");
                this._channelDropDown.style.setProperty("display", "none");
                this._channelDropDown.style.setProperty("width", "0px");
            }
            return;
        }
        if (this._channelDropDownOpen && this._channelNameDisplay.style.getPropertyValue("display") == "none" && this._channelNameInput.input.style.getPropertyValue("display") == "none") {
            this._channelDropDownOpen = false;
        }
        let xPos: number = event.clientX - this._buttons[0].getBoundingClientRect().left;
        if (xPos >= 21.0) {
            if (!this._channelDropDownOpen) {
                // Mouse over chn. number
                this._channelDropDown.style.setProperty("display", "");
                var height = this._trackEditor.channels[this._channelDropDownChannel].patternHeight;
                this._channelNameDisplay.style.setProperty("transform", "translate(20px, " + (height / 4 + height * index) + "px)");

                if (this._doc.song.channels[index].name != "") {
                    this._channelNameDisplay.textContent = this._doc.song.channels[index].name;
                    this._channelNameDisplay.style.setProperty("display", "");
                }
                else {
                    if (this._doc.song.channels[index].type === ChannelType.pitch) {
                        this._channelNameDisplay.textContent = "Pitch " + (index + 1);
                    } else if (this._doc.song.channels[index].type === ChannelType.noise) {
                        this._channelNameDisplay.textContent = "Noise " + (index + 1);
                    } else if (this._doc.song.channels[index].type === ChannelType.mod) {
                        this._channelNameDisplay.textContent = "Mod " + (index + 1);
                    }
                    // The name set will only show up when this becomes visible, e.g. when the dropdown is opened.
                    this._channelNameDisplay.style.setProperty("display", "none");
                }

                this._channelDropDown.style.top = (this._trackEditor.patternTops[index] + 2) + "px";
                this._channelDropDown.style.setProperty("width", "15px");
            }
        }
        else {
            if (!this._channelDropDownOpen) {
                this._channelNameDisplay.style.setProperty("display", "none");
                this._channelDropDown.style.setProperty("display", "none");
                this._channelDropDown.style.setProperty("width", "0px");
            }
        }
    }

    private _onMouseLeave = (event: MouseEvent): void => {
        if (!this._channelDropDownOpen) {
            this._channelNameDisplay.style.setProperty("display", "none");
            this._channelDropDown.style.setProperty("width", "0px");
        }
    }

    public onKeyUp(event: KeyboardEvent): void {
        switch (event.keyCode) {
            case 27: // esc
                this._channelDropDownOpen = false;
                //console.log("close");
                this._channelNameDisplay.style.setProperty("display", "none");
                break;
            case 13: // enter
                this._channelDropDownOpen = false;
                //console.log("close");
                this._channelNameDisplay.style.setProperty("display", "none");
                break;
            default:
                break;
        }
    }

    public render(): void {
        if (!this._doc.prefs.enableChannelMuting) return;
        let activeChannelCount: number = this._doc.song.getChannelCount()

        for (let y: number = 0; y < this._doc.song.getChannelCount(); y++) {
            if ((this._doc.minimizedFolders.includes(this._doc.song.channels[y].folder)
            && this._doc.song.channels[y-1] && this._doc.song.channels[y].folder == this._doc.song.channels[y-1].folder)) activeChannelCount -= 1
        }

        if (this._buttons.length != this._doc.song.getChannelCount()) {
            for (let y: number = this._buttons.length; y < this._doc.song.getChannelCount(); y++) {

                const channelCountText: HTMLDivElement = HTML.div({ class: "noSelection muteButtonText", style: "display: table-cell; -webkit-text-stroke: 1.5px; vertical-align: middle; text-align: center; -webkit-user-select: none; -webkit-touch-callout: none; -moz-user-select: none; -ms-user-select: none; user-select: none; pointer-events: none; width: 12px; height: 20px; transform: translate(0px, 1px);" });
                const muteButton: HTMLDivElement = HTML.div({ class: "mute-button", title: "Mute (M), Mute All (⇧M), Solo (S), Exclude (⇧S)", style: `display: block; pointer-events: none; width: 16px; height: 20px; transform: translate(2px, 1px);` });

                const muteContainer: HTMLDivElement = HTML.div({ style: `align-items: center; height: 20px; margin: 0px; display: table; flex-direction: row; justify-content: space-between;` }, [
                    muteButton,
                    channelCountText,
                ]);


                this.container.appendChild(muteContainer);
                this._buttons[y] = muteContainer;
                this._channelCounts[y] = channelCountText;
            }

            for (let y: number = this._doc.song.getChannelCount(); y < this._buttons.length; y++) {
                this.container.removeChild(this._buttons[y]);
            }
            this._buttons.length = this._doc.song.getChannelCount();

            this.container.appendChild(this._cornerFiller);
        }

        if (activeChannelCount != this._renderedActiveChannelCount) {
            for (let y: number = 0; y < this._doc.song.getChannelCount(); y++) {
                if ((this._doc.minimizedFolders.includes(this._doc.song.channels[y].folder)
                    && this._doc.song.channels[y-1] && this._doc.song.channels[y].folder == this._doc.song.channels[y-1].folder)) this._buttons[y].style.visibility = "hidden"
                else this._buttons[y].style.visibility = "visible"
            }
            this._renderedActiveChannelCount = activeChannelCount
        }

        for (let y: number = 0; y < this._doc.song.getChannelCount(); y++) {
            if (this._doc.song.channels[y].muted) {
                this._buttons[y].children[0].classList.add("muted");


                if (this._doc.song.channels[y].visible) {
                    if (this._doc.song.channels[y].type === ChannelType.pitch) this._channelCounts[y].style.color = ColorConfig.trackEditorBgPitch;
                    else if (this._doc.song.channels[y].type === ChannelType.noise) this._channelCounts[y].style.color = ColorConfig.trackEditorBgNoise;
                    else if (this._doc.song.channels[y].type === ChannelType.mod) this._channelCounts[y].style.color = ColorConfig.trackEditorBgMod;
                }
                else {
                    if (this._doc.song.channels[y].type === ChannelType.pitch) this._channelCounts[y].style.color = ColorConfig.trackEditorBgPitchDim;
                    else if (this._doc.song.channels[y].type === ChannelType.noise) this._channelCounts[y].style.color = ColorConfig.trackEditorBgNoiseDim;
                    else if (this._doc.song.channels[y].type === ChannelType.mod) this._channelCounts[y].style.color = ColorConfig.trackEditorBgModDim;
                }
            } else {
                this._buttons[y].children[0].classList.remove("muted");

                if (this._doc.song.channels[y].visible) {
                    if (this._doc.song.channels[y].type === ChannelType.pitch) this._channelCounts[y].style.color = ColorConfig.trackEditorBgPitch;
                    else if (this._doc.song.channels[y].type === ChannelType.noise) this._channelCounts[y].style.color = ColorConfig.trackEditorBgNoise;
                    else if (this._doc.song.channels[y].type === ChannelType.mod) this._channelCounts[y].style.color = ColorConfig.trackEditorBgMod;
                }
                else {
                    if (this._doc.song.channels[y].type === ChannelType.pitch) this._channelCounts[y].style.color = ColorConfig.trackEditorBgPitchDim;
                    else if (this._doc.song.channels[y].type === ChannelType.noise) this._channelCounts[y].style.color = ColorConfig.trackEditorBgNoiseDim;
                    else if (this._doc.song.channels[y].type === ChannelType.mod) this._channelCounts[y].style.color = ColorConfig.trackEditorBgModDim;
                }
            }
        }

        for (let y: number = 0; y < this._doc.song.getChannelCount(); y++) {
            this._buttons[y].style.marginTop = ((this._trackEditor.channels[y].patternHeight - 20) / 2) + "px";
            this._buttons[y].style.marginBottom = ((this._trackEditor.channels[y].patternHeight - 20) / 2) + "px";
        }

        for (let y: number = 0; y < this._doc.song.getChannelCount(); y++) {
            if (this._doc.song.channels[y].type === ChannelType.mod) {
                this._buttons[y].children[0].classList.add("modMute");
            }
            else {
                this._buttons[y].children[0].classList.remove("modMute");
            }
        }

        if (this._renderedModChannels != this._doc.song.modChannelCount || this._renderedPitchChannels != this._doc.song.pitchChannelCount || this._renderedNoiseChannels != this._doc.song.noiseChannelCount) {
            for (let y: number = 0; y < this._doc.song.getChannelCount(); y++) {
                let val: number = (y + 1);
                this._channelCounts[y].textContent = val + "";
                this._channelCounts[y].style.fontSize = (val >= 10) ? "xx-small" : "inherit";
            }
            this._renderedPitchChannels = this._doc.song.pitchChannelCount;
            this._renderedNoiseChannels = this._doc.song.noiseChannelCount;
            this._renderedModChannels = this._doc.song.modChannelCount;
        }

        this._editorHeight = this._trackEditor.patternTops[this._doc.song.getChannelCount()];
        this._channelNameDisplay.style.setProperty("display", "none");
        this.container.style.height = (this._editorHeight + 16) + "px";

        // if (ChannelRow.patternHeight < 27) {
        //     this._channelNameDisplay.style.setProperty("margin-top", "-2px");
        //     this._channelDropDown.style.setProperty("margin-top", "-4px");
        //     this._channelNameInput.input.style.setProperty("margin-top", "-4px");
        //
        // }
        // else if (ChannelRow.patternHeight < 30) {
        //     this._channelNameDisplay.style.setProperty("margin-top", "-1px");
        //     this._channelDropDown.style.setProperty("margin-top", "-3px");
        //     this._channelNameInput.input.style.setProperty("margin-top", "-3px");
        // }
        // else {
        //     this._channelNameDisplay.style.setProperty("margin-top", "0px");
        //     this._channelDropDown.style.setProperty("margin-top", "0px");
        //     this._channelNameInput.input.style.setProperty("margin-top", "-2px");
        // }
    }
}
//}
