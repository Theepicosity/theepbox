// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {Scale, Config} from "../synth/SynthConfig";
import {ColorConfig} from "../editor/ColorConfig";

export interface Shortcut {
	displayName: string;
	keyCode: number;
	shiftKey: boolean;
	ctrlKey: boolean;
	//you are never supposed to have to hold the control key for a shortcut (with the only exception being ctrl+space and ctrl+p for recording) however many mods include shortcuts which violate this rule...
}

interface Dictionary<T> {
	[K: string]: T;
}



export const DefaultShortcuts: Dictionary<Shortcut> = {
	"play": { displayName: "Play", keyCode: 32, shiftKey: false, ctrlKey: false }, // space
	"playAtCursor": { displayName: "Play At Cursor", keyCode: 32, shiftKey: true, ctrlKey: false }, // shift + space
	"record": { displayName: "Record", keyCode: 32, shiftKey: false, ctrlKey: true }, // ctrl + space
	"stopRecording": { displayName: "Stop Recording", keyCode: 80, shiftKey: false, ctrlKey: true }, // ctrl + p
	"openSongPlayer": { displayName: "Open in Song Player", keyCode: 80, shiftKey: true, ctrlKey: false }, // shift + p
	"newSong": { displayName: "New Song", keyCode: 192, shiftKey: true, ctrlKey: false }, // shift + `
	"songRecovery": { displayName: "Open Song Recovery", keyCode: 192, shiftKey: false, ctrlKey: false }, // ` very conveniently the same key as "new song"
	"undo": { displayName: "Undo", keyCode: 90, shiftKey: false, ctrlKey: false }, // z
	"redo": { displayName: "Redo", keyCode: 89, shiftKey: false, ctrlKey: false }, // y
	"cutPattern": { displayName: "Cut Notes", keyCode: 88, shiftKey: false, ctrlKey: false }, // x
	"editBeatsPerBar": { displayName: "Edit Beats Per Bar", keyCode: 66, shiftKey: true, ctrlKey: false }, // shift + b
	"loopPattern": { displayName: "Loop Pattern", keyCode: 66, shiftKey: false, ctrlKey: false }, // b
	"copyInstrument": { displayName: "Copy Instrument", keyCode: 67, shiftKey: false, ctrlKey: false }, // shift + c
	"copyPattern": { displayName: "Copy Notes", keyCode: 67, shiftKey: false, ctrlKey: false }, // c
	"insertBarNext": { displayName: "Insert Bar After", keyCode: 13, shiftKey: false, ctrlKey: false }, // enter
	"insertBarPrev": { displayName: "Insert Bar Before", keyCode: 13, shiftKey: true, ctrlKey: false }, // shift + enter
	"insertChannelNext": { displayName: "Insert Channel After", keyCode: 13, shiftKey: false, ctrlKey: true }, // ctrl + enter
	"insertChannelPrev": { displayName: "Insert Channel Before", keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	"deleteBar": { displayName: "Delete Bar", keyCode: 8, shiftKey: false, ctrlKey: false }, // backspace
	"deleteChannel": { displayName: "Delete Channel", keyCode: 8, shiftKey: false, ctrlKey: true }, // ctrl + backspace
	"selectAll": { displayName: "Select All", keyCode: 65, shiftKey: false, ctrlKey: false }, // a
	"selectChannel": { displayName: "Select Channel", keyCode: 65, shiftKey: true, ctrlKey: false }, // shift + a
	"duplicatePattern": { displayName: "Duplicate Pattern", keyCode: 68, shiftKey: false, ctrlKey: false }, // d
	"editSongEQ": { displayName: "Edit Song EQ", keyCode: 69, shiftKey: false, ctrlKey: false }, // e
	"generateEuclideanRhythm": { displayName: "Generate Euclidean Rhythm", keyCode: 69, shiftKey: true, ctrlKey: false }, // shift + e
	"snapPlayheadToBeginning": { displayName: "Snap Playhead To Beginning", keyCode: 70, shiftKey: true, ctrlKey: false }, // f
	"snapPlayheadToLoopStart": { displayName: "Snap Playhead To Loop Start", keyCode: 70, shiftKey: true, ctrlKey: false }, // shift + f
	"openAllFMDropdowns": { displayName: "Open All FM Dropdowns", keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	"snapPlayheadToSelected": { displayName: "Snap Playhead To Selected Pattern", keyCode: 72, shiftKey: false, ctrlKey: false }, // h
	"hideChannel": { displayName: "Hide Channel", keyCode: 75, shiftKey: true, ctrlKey: false }, // k
	"onlyShowChannel": { displayName: "Only Show Channel", keyCode: 74, shiftKey: false, ctrlKey: false }, // j
	"editLimiter": { displayName: "Edit Limiter Options", keyCode: 76, shiftKey: true, ctrlKey: false }, // shift + l
	"editSongLength": { displayName: "Edit Song Length", keyCode: 76, shiftKey: false, ctrlKey: false }, // l
	"muteChannel": { displayName: "Mute Channel", keyCode: 77, shiftKey: false, ctrlKey: false }, // m
	"muteAll": { displayName: "Mute All", keyCode: 77, shiftKey: true, ctrlKey: false }, // shift + m
	"newPattern": { displayName: "New Pattern", keyCode: 78, shiftKey: false, ctrlKey: false }, // n
	"newPatternFromEmpty": { displayName: "New Pattern From Empty", keyCode: 78, shiftKey: true, ctrlKey: false }, // shift + n
	"editChannelSettings": { displayName: "Edit Channel Settings", keyCode: 81, shiftKey: false, ctrlKey: false }, // q
	"editCustomSamples": { displayName: "Edit Custom Samples", keyCode: 81, shiftKey: true, ctrlKey: false }, // shift + q
	"soloChannel": { displayName: "Solo Channel", keyCode: 83, shiftKey: false, ctrlKey: false }, // s
	"export": { displayName: "Export", keyCode: 83, shiftKey: true, ctrlKey: false }, // shift + s
	"import": { displayName: "Import", keyCode: 79, shiftKey: true, ctrlKey: false }, // shift + o
	"pastePattern": { displayName: "Paste Notes", keyCode: 86, shiftKey: false, ctrlKey: false }, // v
	"pasteInstrument": { displayName: "Paste Instrument", keyCode: 86, shiftKey: true, ctrlKey: false }, // shift + v
	"pastePatternNumbers": { displayName: "Paste Pattern Number", keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	"moveNotesSideways": { displayName: "Move Notes Sideways", keyCode: 87, shiftKey: false, ctrlKey: false }, // w
	"exportInstrument": { displayName: "Export Instrument", keyCode: 73, shiftKey: true, ctrlKey: false }, // shift + i
	"randomInstrument": { displayName: "Random Instrument", keyCode: 82, shiftKey: false, ctrlKey: false }, // r
	"nextBar": { displayName: "Next Bar", keyCode: 221, shiftKey: false, ctrlKey: false }, // ]
	"prevBar": { displayName: "Previous Bar", keyCode: 219, shiftKey: false, ctrlKey: false }, // [
	"transposeDown": { displayName: "Transpose Down", keyCode: 189, shiftKey: false, ctrlKey: false }, // -
	"transposeUp": { displayName: "Transpose Up", keyCode: 187, shiftKey: false, ctrlKey: false }, // +
	"transposeOctaveDown": { displayName: "Transpose Octave Down", keyCode: 189, shiftKey: true, ctrlKey: false }, // shift + -
	"transposeOctaveUp": { displayName: "Transpose Octave Up", keyCode: 187, shiftKey: true, ctrlKey: false }, // shift + +
	"removePattern": { displayName: "Remove Pattern", keyCode: 46, shiftKey: false, ctrlKey: false }, // delete
	"patternUp": { displayName: "Move Up", keyCode: 38, shiftKey: false, ctrlKey: false }, // up
	"selectionUp": { displayName: "Extend Selection Up", keyCode: 38, shiftKey: true, ctrlKey: false }, // shift + up
	"moveChannelUp": { displayName: "Move Channel Up", keyCode: 38, shiftKey: false, ctrlKey: true }, // ctrl + up
	"patternDown": { displayName: "Move Down", keyCode: 40, shiftKey: false, ctrlKey: false }, // down
	"selectionDown": { displayName: "Extend Selection Down", keyCode: 40, shiftKey: true, ctrlKey: false }, // shift + down
	"moveChannelDown": { displayName: "Move Channel Down", keyCode: 40, shiftKey: false, ctrlKey: true }, // ctrl + down
	"patternLeft": { displayName: "Move Left", keyCode: 37, shiftKey: false, ctrlKey: false }, // left
	"selectionLeft": { displayName: "Extend Selection Left", keyCode: 37, shiftKey: true, ctrlKey: false }, // shift + left
	"patternRight": { displayName: "Move Right", keyCode: 39, shiftKey: false, ctrlKey: false }, // right
	"selectionRight": { displayName: "Extend Selection Right", keyCode: 39, shiftKey: true, ctrlKey: false }, // shift + right

	"jummbify": { displayName: "Jummbify", keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	"slarmooify": { displayName: "Slarmooify", keyCode: 0, shiftKey: false, ctrlKey: false }, // unbound
	// what to do about aliases? redo should also be shift+z; for now i will just ignore this since most people wont use more than one key combo for the same thing.
	// another note: avoid having both shift & ctrl as modifiers cuz that totally just breaks
	// also some of these hotkeys use alt as a modifier; these ones are rarely used so i will leave them unbound
	// ~ theepie
}

export class Preferences {
	public static readonly defaultVisibleOctaves: number = 3;
	
	public customTheme: string | null;
	public customTheme2: string | null;
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
		this.keyboardLayout = window.localStorage.getItem("keyboardLayout") || "pianoAtC";
		this.bassOffset = (+(<any>window.localStorage.getItem("bassOffset"))) || 0;
		this.layout = window.localStorage.getItem("layout") || "small+";
		this.colorTheme = window.localStorage.getItem("colorTheme") || ColorConfig.defaultTheme;
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
		window.localStorage.setItem("keyboardLayout", this.keyboardLayout);
		window.localStorage.setItem("bassOffset", String(this.bassOffset));
		window.localStorage.setItem("layout", this.layout);
		window.localStorage.setItem("colorTheme", this.colorTheme);
		window.localStorage.setItem("customTheme", this.customTheme!);
		window.localStorage.setItem("customTheme2", this.customTheme2!);
		window.localStorage.setItem("volume", String(this.volume));
		window.localStorage.setItem("visibleOctaves", String(this.visibleOctaves));
		window.localStorage.setItem("shortcuts", JSON.stringify(this.shortcuts));
		
	}
}
