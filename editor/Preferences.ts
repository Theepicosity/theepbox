// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {Scale, Config} from "../synth/SynthConfig";
import {ColorConfig} from "../editor/ColorConfig";

export interface Shortcut {
	displayName: string;
	category: number;
	keyCode: number;
	shiftKey: boolean;
	ctrlKey: boolean;
	//you are never supposed to have to hold the control key for a shortcut (with the only exception being ctrl+space and ctrl+p for recording) however many mods include shortcuts which violate this rule...
}

export const enum ShortcutCategory {
	playback,
	edit,
	selection,
	settings,
	file,
	_length,
}

interface Dictionary<T> {
	[K: string]: T;
}

export const DefaultShortcuts: Dictionary<Shortcut> = {
	"play": { displayName: "Play", category: ShortcutCategory.playback, keyCode: 32, shiftKey: false, ctrlKey: false }, // space
	"playAtCursor": { displayName: "Play At Cursor", category: ShortcutCategory.playback, keyCode: 32, shiftKey: true, ctrlKey: false }, // shift + space
	"record": { displayName: "Record", category: ShortcutCategory.playback, keyCode: 32, shiftKey: false, ctrlKey: true }, // ctrl + space
	"stopRecording": { displayName: "Stop Recording", category: ShortcutCategory.playback, keyCode: 80, shiftKey: false, ctrlKey: true }, // ctrl + p
	"openSongPlayer": { displayName: "Open in Song Player", category: ShortcutCategory.file, keyCode: 80, shiftKey: true, ctrlKey: false }, // shift + p
	"newSong": { displayName: "New Song", category: ShortcutCategory.file, keyCode: 192, shiftKey: true, ctrlKey: false }, // shift + `
	"songRecovery": { displayName: "Open Song Recovery", category: ShortcutCategory.file, keyCode: 192, shiftKey: false, ctrlKey: false }, // ` very conveniently the same key as "new song"
	"undo": { displayName: "Undo", category: ShortcutCategory.edit, keyCode: 90, shiftKey: false, ctrlKey: false }, // z
	"redo": { displayName: "Redo", category: ShortcutCategory.edit, keyCode: 89, shiftKey: false, ctrlKey: false }, // y
	"cutPattern": { displayName: "Cut Notes", category: ShortcutCategory.edit, keyCode: 88, shiftKey: false, ctrlKey: false }, // x
	"editBeatsPerBar": { displayName: "Edit Beats Per Bar", category: ShortcutCategory.settings, keyCode: 66, shiftKey: true, ctrlKey: false }, // shift + b
	"loopPattern": { displayName: "Loop Pattern", category: ShortcutCategory.playback, keyCode: 66, shiftKey: false, ctrlKey: false }, // b
	"copyInstrument": { displayName: "Copy Instrument", category: ShortcutCategory.edit, keyCode: 67, shiftKey: true, ctrlKey: false }, // shift + c
	"copyPattern": { displayName: "Copy Notes", category: ShortcutCategory.edit, keyCode: 67, shiftKey: false, ctrlKey: false }, // c
	"insertBarNext": { displayName: "Insert Bar After", category: ShortcutCategory.edit, keyCode: 13, shiftKey: false, ctrlKey: false }, // enter
	"insertBarPrev": { displayName: "Insert Bar Before", category: ShortcutCategory.edit, keyCode: 13, shiftKey: true, ctrlKey: false }, // shift + enter
	"insertChannelNext": { displayName: "Insert Channel After", category: ShortcutCategory.edit, keyCode: 13, shiftKey: false, ctrlKey: true }, // ctrl + enter
	"insertChannelPrev": { displayName: "Insert Channel Before", category: ShortcutCategory.edit, keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	"deleteBar": { displayName: "Delete Bar", category: ShortcutCategory.edit, keyCode: 8, shiftKey: false, ctrlKey: false }, // backspace
	"deleteChannel": { displayName: "Delete Channel", category: ShortcutCategory.edit, keyCode: 8, shiftKey: false, ctrlKey: true }, // ctrl + backspace
	"selectAll": { displayName: "Select All", category: ShortcutCategory.edit, keyCode: 65, shiftKey: false, ctrlKey: false }, // a
	"selectChannel": { displayName: "Select Channel", category: ShortcutCategory.edit, keyCode: 65, shiftKey: true, ctrlKey: false }, // shift + a
	"duplicatePattern": { displayName: "Duplicate Pattern", category: ShortcutCategory.edit, keyCode: 68, shiftKey: false, ctrlKey: false }, // d
	"editSongEQ": { displayName: "Edit Song EQ", category: ShortcutCategory.settings, keyCode: 69, shiftKey: false, ctrlKey: false }, // e
	"generateEuclideanRhythm": { displayName: "Generate Euclidean Rhythm", category: ShortcutCategory.edit, keyCode: 69, shiftKey: true, ctrlKey: false }, // shift + e
	"snapPlayheadToBeginning": { displayName: "Snap Playhead To Beginning", category: ShortcutCategory.playback, keyCode: 70, shiftKey: false, ctrlKey: false }, // f
	"snapPlayheadToLoopStart": { displayName: "Snap Playhead To Loop Start", category: ShortcutCategory.playback, keyCode: 70, shiftKey: true, ctrlKey: false }, // shift + f
	"nextBar": { displayName: "Next Bar", category: ShortcutCategory.playback, keyCode: 221, shiftKey: false, ctrlKey: false }, // ]
	"prevBar": { displayName: "Previous Bar", category: ShortcutCategory.playback, keyCode: 219, shiftKey: false, ctrlKey: false }, // [
	"openAllFMDropdowns": { displayName: "Open All FM Dropdowns", category: ShortcutCategory.settings, keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	"snapPlayheadToSelected": { displayName: "Snap Playhead To Selected Pattern", category: ShortcutCategory.playback, keyCode: 72, shiftKey: false, ctrlKey: false }, // h
	"hideChannel": { displayName: "Hide Channel", category: ShortcutCategory.playback, keyCode: 75, shiftKey: true, ctrlKey: false }, // k
	"onlyShowChannel": { displayName: "Only Show Channel", category: ShortcutCategory.playback, keyCode: 74, shiftKey: false, ctrlKey: false }, // j
	"editLimiter": { displayName: "Edit Limiter Options", category: ShortcutCategory.settings, keyCode: 76, shiftKey: true, ctrlKey: false }, // shift + l
	"editSongLength": { displayName: "Edit Song Length", category: ShortcutCategory.settings, keyCode: 76, shiftKey: false, ctrlKey: false }, // l
	"muteChannel": { displayName: "Mute Channel", category: ShortcutCategory.playback, keyCode: 77, shiftKey: false, ctrlKey: false }, // m
	"muteAll": { displayName: "Mute All", category: ShortcutCategory.playback, keyCode: 77, shiftKey: true, ctrlKey: false }, // shift + m
	"newPattern": { displayName: "New Pattern", category: ShortcutCategory.edit, keyCode: 78, shiftKey: false, ctrlKey: false }, // n
	"newPatternFromEmpty": { displayName: "New Pattern From Empty", category: ShortcutCategory.edit, keyCode: 78, shiftKey: true, ctrlKey: false }, // shift + n
	"editChannelSettings": { displayName: "Edit Channel Settings", category: ShortcutCategory.settings, keyCode: 81, shiftKey: false, ctrlKey: false }, // q
	"editCustomSamples": { displayName: "Edit Custom Samples", category: ShortcutCategory.settings, keyCode: 81, shiftKey: true, ctrlKey: false }, // shift + q
	"soloChannel": { displayName: "Solo Channel", category: ShortcutCategory.playback, keyCode: 83, shiftKey: false, ctrlKey: false }, // s
	"export": { displayName: "Export", category: ShortcutCategory.file, keyCode: 83, shiftKey: true, ctrlKey: false }, // shift + s
	"import": { displayName: "Import", category: ShortcutCategory.file, keyCode: 79, shiftKey: true, ctrlKey: false }, // shift + o
	"pastePattern": { displayName: "Paste Notes", category: ShortcutCategory.edit, keyCode: 86, shiftKey: false, ctrlKey: false }, // v
	"pasteInstrument": { displayName: "Paste Instrument", category: ShortcutCategory.edit, keyCode: 86, shiftKey: true, ctrlKey: false }, // shift + v
	"pastePatternNumbers": { displayName: "Paste Pattern Number", category: ShortcutCategory.edit, keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	"moveNotesSideways": { displayName: "Move Notes Sideways", category: ShortcutCategory.edit, keyCode: 87, shiftKey: false, ctrlKey: false }, // w
	"exportInstrument": { displayName: "Export Instrument", category: ShortcutCategory.file, keyCode: 73, shiftKey: true, ctrlKey: false }, // shift + i
	//"randomInstrument": { displayName: "Random Instrument", category: ShortcutCategory.playback, keyCode: 82, shiftKey: false, ctrlKey: false }, // r
	"transposeDown": { displayName: "Transpose Down", category: ShortcutCategory.edit, keyCode: 189, shiftKey: false, ctrlKey: false }, // -
	"transposeUp": { displayName: "Transpose Up", category: ShortcutCategory.edit, keyCode: 187, shiftKey: false, ctrlKey: false }, // +
	"transposeOctaveDown": { displayName: "Transpose Octave Down", category: ShortcutCategory.edit, keyCode: 189, shiftKey: true, ctrlKey: false }, // shift + -
	"transposeOctaveUp": { displayName: "Transpose Octave Up", category: ShortcutCategory.edit, keyCode: 187, shiftKey: true, ctrlKey: false }, // shift + +
	"removePattern": { displayName: "Remove Pattern", category: ShortcutCategory.edit, keyCode: 46, shiftKey: false, ctrlKey: false }, // delete
	"patternUp": { displayName: "Move Up", category: ShortcutCategory.selection, keyCode: 38, shiftKey: false, ctrlKey: false }, // up
	"selectionUp": { displayName: "Extend Selection Up", category: ShortcutCategory.selection, keyCode: 38, shiftKey: true, ctrlKey: false }, // shift + up
	"moveChannelUp": { displayName: "Move Channel Up", category: ShortcutCategory.selection, keyCode: 38, shiftKey: false, ctrlKey: true }, // ctrl + up
	"patternDown": { displayName: "Move Down", category: ShortcutCategory.selection, keyCode: 40, shiftKey: false, ctrlKey: false }, // down
	"selectionDown": { displayName: "Extend Selection Down", category: ShortcutCategory.selection, keyCode: 40, shiftKey: true, ctrlKey: false }, // shift + down
	"moveChannelDown": { displayName: "Move Channel Down", category: ShortcutCategory.selection, keyCode: 40, shiftKey: false, ctrlKey: true }, // ctrl + down
	"patternLeft": { displayName: "Move Left", category: ShortcutCategory.selection, keyCode: 37, shiftKey: false, ctrlKey: false }, // left
	"selectionLeft": { displayName: "Extend Selection Left", category: ShortcutCategory.selection, keyCode: 37, shiftKey: true, ctrlKey: false }, // shift + left
	"patternRight": { displayName: "Move Right", category: ShortcutCategory.selection, keyCode: 39, shiftKey: false, ctrlKey: false }, // right
	"selectionRight": { displayName: "Extend Selection Right", category: ShortcutCategory.selection, keyCode: 39, shiftKey: true, ctrlKey: false }, // shift + right

	"jummbify": { displayName: "Jummbify", category: ShortcutCategory.file, keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	"slarmooify": { displayName: "Slarmooify", category: ShortcutCategory.file, keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	// what to do about aliases? redo should also be shift+z; for now i will just ignore this since most people wont use more than one key combo for the same thing.
	// another note: avoid having both shift & ctrl as modifiers cuz that totally just breaks
	// also some of these hotkeys use alt as a modifier; these ones are rarely used so i will leave them unbound
	// ~ theepie
}

export class Preferences {
	public static readonly defaultVisibleOctaves: number = 3;
	public static readonly defaultCustomColors: string = `:root {
		--page-margin: black;
		--editor-background: black;
		--hover-preview: white;
		--playhead: white;
		--primary-text: white;
		--secondary-text: #999;
		--inverted-text: black;
		--text-selection: rgba(119,68,255,0.99);
		--box-selection-fill: rgba(255,255,255,0.2);
		--loop-accent: #74f;
		--link-accent: #98f;
		--ui-widget-background: #444;
		--ui-widget-focus: #777;
		--pitch-background: #444;
		--tonic: #864;
		--fifth-note: #468;
		--white-piano-key: #bbb;
		--black-piano-key: #444;
		--white-piano-key-text: #131200;
		--black-piano-key-text: #fff;
		--use-color-formula: false;
		--track-editor-bg-pitch: #444;
		--track-editor-bg-pitch-dim: #333;
		--track-editor-bg-noise: #444;
		--track-editor-bg-noise-dim: #333;
		--track-editor-bg-mod: #234;
		--track-editor-bg-mod-dim: #123;
		--multiplicative-mod-slider: #456;
		--overwriting-mod-slider: #654;
		--indicator-primary: #74f;
		--indicator-secondary: #444;
		--select2-opt-group: #585858;
		--input-box-outline: #333;
		--mute-button-normal: #ffa033;
		--mute-button-mod: #9a6bff;
		--pitch1-secondary-channel: #0099A1;
		--pitch1-primary-channel:   #25F3FF;
		--pitch1-secondary-note:    #00BDC7;
		--pitch1-primary-note:      #92F9FF;
		--pitch2-secondary-channel: #A1A100;
		--pitch2-primary-channel:   #FFFF25;
		--pitch2-secondary-note:    #C7C700;
		--pitch2-primary-note:      #FFFF92;
		--pitch3-secondary-channel: #C75000;
		--pitch3-primary-channel:   #FF9752;
		--pitch3-secondary-note:    #FF771C;
		--pitch3-primary-note:      #FFCDAB;
		--pitch4-secondary-channel: #00A100;
		--pitch4-primary-channel:   #50FF50;
		--pitch4-secondary-note:    #00C700;
		--pitch4-primary-note:      #A0FFA0;
		--pitch5-secondary-channel: #D020D0;
		--pitch5-primary-channel:   #FF90FF;
		--pitch5-secondary-note:    #E040E0;
		--pitch5-primary-note:      #FFC0FF;
		--pitch6-secondary-channel: #7777B0;
		--pitch6-primary-channel:   #A0A0FF;
		--pitch6-secondary-note:    #8888D0;
		--pitch6-primary-note:      #D0D0FF;
		--pitch7-secondary-channel: #8AA100;
		--pitch7-primary-channel:   #DEFF25;
		--pitch7-secondary-note:    #AAC700;
		--pitch7-primary-note:      #E6FF92;
		--pitch8-secondary-channel: #DF0019;
		--pitch8-primary-channel:   #FF98A4;
		--pitch8-secondary-note:    #FF4E63;
		--pitch8-primary-note:      #FFB2BB;
		--pitch9-secondary-channel: #00A170;
		--pitch9-primary-channel:   #50FFC9;
		--pitch9-secondary-note:    #00C78A;
		--pitch9-primary-note:      #83FFD9;
		--pitch10-secondary-channel:#A11FFF;
		--pitch10-primary-channel:  #CE8BFF;
		--pitch10-secondary-note:   #B757FF;
		--pitch10-primary-note:     #DFACFF;
		--noise1-secondary-channel: #6F6F6F;
		--noise1-primary-channel:   #AAAAAA;
		--noise1-secondary-note:    #A7A7A7;
		--noise1-primary-note:      #E0E0E0;
		--noise2-secondary-channel: #996633;
		--noise2-primary-channel:   #DDAA77;
		--noise2-secondary-note:    #CC9966;
		--noise2-primary-note:      #F0D0BB;
		--noise3-secondary-channel: #4A6D8F;
		--noise3-primary-channel:   #77AADD;
		--noise3-secondary-note:    #6F9FCF;
		--noise3-primary-note:      #BBD7FF;
		--noise4-secondary-channel: #7A4F9A;
		--noise4-primary-channel:   #AF82D2;
		--noise4-secondary-note:    #9E71C1;
		--noise4-primary-note:      #D4C1EA;
		--noise5-secondary-channel: #607837;
		--noise5-primary-channel:   #A2BB77;
		--noise5-secondary-note:    #91AA66;
		--noise5-primary-note:      #C5E2B2;
		--mod1-secondary-channel:   #339955;
		--mod1-primary-channel:     #77fc55;
		--mod1-secondary-note:      #77ff8a;
		--mod1-primary-note:        #cdffee;
		--mod2-secondary-channel:   #993355;
		--mod2-primary-channel:     #f04960;
		--mod2-secondary-note:      #f057a0;
		--mod2-primary-note:        #ffb8de;
		--mod3-secondary-channel:   #553399;
		--mod3-primary-channel:     #8855fc;
		--mod3-secondary-note:      #aa64ff;
		--mod3-primary-note:	    #f8ddff;
		--mod4-secondary-channel:   #a86436;
		--mod4-primary-channel:     #c8a825;
		--mod4-secondary-note:      #e8ba46;
		--mod4-primary-note:        #fff6d3;
		--mod-label-primary:        #999;
		--mod-label-secondary-text: #333;
		--mod-label-primary-text:   black;
		--disabled-note-primary:    #999;
		--disabled-note-secondary:  #666; }`
	
	public customTheme: string | null;
	public customTheme2: string | null;
	public customColors: string | null;
	public autoPlay: boolean;
	public autoFollow: boolean;
	public enableNotePreview: boolean;
	public showFifth: boolean = true;
	public notesOutsideScale: boolean;
	public defaultScale: number;
	public showLetters: boolean;
	public showChannels: boolean;
	public showScrollBar: boolean;
	public alwaysFineNoteVol: boolean;
	public displayVolumeBar: boolean;
	public instrumentCopyPaste: boolean;
	public instrumentImportExport: boolean;
	public instrumentButtonsAtTop: boolean;
	public enableChannelMuting: boolean;
	public colorTheme: string;
	public fixChannelColorOrder: boolean;
	public layout: string;
	public displayBrowserUrl: boolean;
	public volume: number = 75;
	public visibleOctaves: number = Preferences.defaultVisibleOctaves;
	public pressControlForShortcuts: boolean;
	public keyboardLayout: string;
	public bassOffset: number;
	public enableMidi: boolean;
	public showRecordButton: boolean;
	public snapRecordedNotesToRhythm: boolean;
	public ignorePerformedNotesNotInScale: boolean;
	public metronomeCountIn: boolean;
	public metronomeWhileRecording: boolean;
	public notesFlashWhenPlayed: boolean;
	public showOscilloscope: boolean;
	public showSampleLoadingStatus: boolean;
	public showDescription: boolean;
	public showInstrumentScrollbars: boolean;
	public closePromptByClickoff: boolean;
	public frostedGlassBackground: boolean;
	public shortenerStrategySelect: string;

	public shortcuts: Dictionary<Shortcut>;
	
	constructor() {
		this.reload();
	}
	
	public reload(): void {
		this.autoPlay = window.localStorage.getItem("autoPlay") == "true";
		this.autoFollow = window.localStorage.getItem("autoFollow") == "true";
		this.enableNotePreview = window.localStorage.getItem("enableNotePreview") != "false";
		this.showFifth = window.localStorage.getItem("showFifth") != "false";
		this.notesOutsideScale = window.localStorage.getItem("notesOutsideScale") == "true";
		this.showLetters = window.localStorage.getItem("showLetters") != "false";
		this.showChannels = window.localStorage.getItem("showChannels") != "false";
		this.showScrollBar = window.localStorage.getItem("showScrollBar") != "false";
		this.alwaysFineNoteVol = window.localStorage.getItem("alwaysFineNoteVol") == "true";
		this.displayVolumeBar = window.localStorage.getItem("displayVolumeBar") != "false";
		this.instrumentCopyPaste = window.localStorage.getItem("instrumentCopyPaste") != "false";
		this.instrumentImportExport = window.localStorage.getItem("instrumentImportExport") == "true";
		this.instrumentButtonsAtTop = window.localStorage.getItem("instrumentButtonsAtTop") != "false"
		this.enableChannelMuting = window.localStorage.getItem("enableChannelMuting") != "false";
		this.fixChannelColorOrder = window.localStorage.getItem("fixChannelColorOrder") != "false";
		this.displayBrowserUrl = window.localStorage.getItem("displayBrowserUrl") != "false";
		this.pressControlForShortcuts = window.localStorage.getItem("pressControlForShortcuts") == "true";
		this.enableMidi = window.localStorage.getItem("enableMidi") != "false";
		this.showRecordButton = window.localStorage.getItem("showRecordButton") == "true";
		this.snapRecordedNotesToRhythm = window.localStorage.getItem("snapRecordedNotesToRhythm") == "true";
		this.ignorePerformedNotesNotInScale = window.localStorage.getItem("ignorePerformedNotesNotInScale") == "true";
		this.metronomeCountIn = window.localStorage.getItem("metronomeCountIn") != "false";
		this.metronomeWhileRecording = window.localStorage.getItem("metronomeWhileRecording") != "false";
		this.notesFlashWhenPlayed = window.localStorage.getItem("notesFlashWhenPlayed") == "true";
		this.showOscilloscope = window.localStorage.getItem("showOscilloscope") != "false";
		this.showSampleLoadingStatus = window.localStorage.getItem("showSampleLoadingStatus") != "false";
		this.showDescription = window.localStorage.getItem("showDescription") != "false";
		this.showInstrumentScrollbars = window.localStorage.getItem("showInstrumentScrollbars") == "true";
		this.closePromptByClickoff = window.localStorage.getItem("closePromptByClickoff") == "true";
		this.frostedGlassBackground = window.localStorage.getItem("frostedGlassBackground") == "true";
		this.shortenerStrategySelect = window.localStorage.getItem("shortenerStrategySelect") || "tinyurl";
		this.keyboardLayout = window.localStorage.getItem("keyboardLayout") || "pianoAtC";
		this.bassOffset = (+(<any>window.localStorage.getItem("bassOffset"))) || 0;
		this.layout = window.localStorage.getItem("layout") || "small+";
		this.colorTheme = window.localStorage.getItem("colorTheme") || ColorConfig.defaultTheme;
		this.customColors = window.localStorage.getItem("customColors") || "";
		this.customTheme = window.localStorage.getItem("customTheme");
        this.customTheme2 = window.localStorage.getItem("customTheme2");
		this.visibleOctaves = ((<any>window.localStorage.getItem("visibleOctaves")) >>> 0) || Preferences.defaultVisibleOctaves;
		this.shortcuts = window.localStorage.getItem("shortcuts") != null ? JSON.parse(window.localStorage.getItem("shortcuts") as string) : DefaultShortcuts;
		
		const defaultScale: Scale | undefined = Config.scales.dictionary[window.localStorage.getItem("defaultScale")!];
		this.defaultScale = (defaultScale != undefined) ? defaultScale.index : 1;
		
		if (window.localStorage.getItem("volume") != null) {
			this.volume = Math.min(<any>window.localStorage.getItem("volume") >>> 0, 75);
		}
		
	}
	
	public save(): void {
		window.localStorage.setItem("autoPlay", this.autoPlay ? "true" : "false");
		window.localStorage.setItem("autoFollow", this.autoFollow ? "true" : "false");
		window.localStorage.setItem("enableNotePreview", this.enableNotePreview ? "true" : "false");
		window.localStorage.setItem("showFifth", this.showFifth ? "true" : "false");
		window.localStorage.setItem("notesOutsideScale", this.notesOutsideScale ? "true" : "false");
		window.localStorage.setItem("defaultScale", Config.scales[this.defaultScale].name);
		window.localStorage.setItem("showLetters", this.showLetters ? "true" : "false");
		window.localStorage.setItem("showChannels", this.showChannels ? "true" : "false");
		window.localStorage.setItem("showScrollBar", this.showScrollBar ? "true" : "false");
		window.localStorage.setItem("alwaysFineNoteVol", this.alwaysFineNoteVol ? "true" : "false");
		window.localStorage.setItem("displayVolumeBar", this.displayVolumeBar ? "true" : "false");
		window.localStorage.setItem("enableChannelMuting", this.enableChannelMuting ? "true" : "false");
		window.localStorage.setItem("fixChannelColorOrder", this.fixChannelColorOrder ? "true" : "false");
		window.localStorage.setItem("instrumentCopyPaste", this.instrumentCopyPaste ? "true" : "false");
		window.localStorage.setItem("instrumentImportExport", this.instrumentImportExport ? "true" : "false");
		window.localStorage.setItem("instrumentButtonsAtTop", this.instrumentButtonsAtTop ? "true" : "false");
		window.localStorage.setItem("displayBrowserUrl", this.displayBrowserUrl ? "true" : "false");
		window.localStorage.setItem("pressControlForShortcuts", this.pressControlForShortcuts ? "true" : "false");
		window.localStorage.setItem("enableMidi", this.enableMidi ? "true" : "false");
		window.localStorage.setItem("showRecordButton", this.showRecordButton ? "true" : "false");
		window.localStorage.setItem("snapRecordedNotesToRhythm", this.snapRecordedNotesToRhythm ? "true" : "false");
		window.localStorage.setItem("ignorePerformedNotesNotInScale", this.ignorePerformedNotesNotInScale ? "true" : "false");
		window.localStorage.setItem("metronomeCountIn", this.metronomeCountIn ? "true" : "false");
		window.localStorage.setItem("metronomeWhileRecording", this.metronomeWhileRecording ? "true" : "false");
		window.localStorage.setItem("notesFlashWhenPlayed", this.notesFlashWhenPlayed ? "true" : "false");
		window.localStorage.setItem("showOscilloscope", this.showOscilloscope ? "true" : "false");
		window.localStorage.setItem("showSampleLoadingStatus", this.showSampleLoadingStatus ? "true" : "false");
		window.localStorage.setItem("showDescription", this.showDescription ? "true" : "false");
		window.localStorage.setItem("showInstrumentScrollbars", this.showInstrumentScrollbars ? "true" : "false");
		window.localStorage.setItem("closePromptByClickoff", this.closePromptByClickoff ? "true" : "false");
		window.localStorage.setItem("frostedGlassBackground", this.frostedGlassBackground ? "true" : "false");
		window.localStorage.setItem("shortenerStrategySelect", this.shortenerStrategySelect);
		window.localStorage.setItem("keyboardLayout", this.keyboardLayout);
		window.localStorage.setItem("bassOffset", String(this.bassOffset));
		window.localStorage.setItem("layout", this.layout);
		window.localStorage.setItem("colorTheme", this.colorTheme);
		window.localStorage.setItem("customColors", this.customColors || "");
		window.localStorage.setItem("customTheme", this.customTheme!);
		window.localStorage.setItem("customTheme2", this.customTheme2!);
		window.localStorage.setItem("volume", String(this.volume));
		window.localStorage.setItem("visibleOctaves", String(this.visibleOctaves));
		window.localStorage.setItem("shortcuts", JSON.stringify(this.shortcuts));
	}
}
