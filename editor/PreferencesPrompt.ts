// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Config } from "../synth/SynthConfig";
import { EditorConfig } from "./EditorConfig";
import { PatternEditor } from "./PatternEditor";
import { SongDocument } from "./SongDocument";
import { Shortcut, DefaultShortcuts } from "./Preferences";
import { Prompt } from "./Prompt";
import { HTML, SVG } from "imperative-html/dist/esm/elements-strict";
import { ColorConfig } from "./ColorConfig";
import { KeyboardLayout } from "./KeyboardLayout";
import { Piano } from "./Piano";
import { Layout } from "./Layout";

const { button, label, div, p, h2, form, input, select, option, optgroup } = HTML;

// taken from some stackexchange answer, it doesnt look good but its better than nothing
const keyboardMap = [
	"",              //  [0]
"",              //  [1]
"",              //  [2]
"CANCEL",        //  [3]
"",              //  [4]
"",              //  [5]
"HELP",          //  [6]
"",              //  [7]
"BACKSPACE",    //  [8]
"TAB",           //  [9]
"",              // [10]
"",              // [11]
"CLEAR",         // [12]
"ENTER",         // [13]
"ENTER_SPECIAL", // [14]
"",              // [15]
"SHIFT",         // [16]
"CONTROL",       // [17]
"ALT",           // [18]
"PAUSE",         // [19]
"CAPS_LOCK",     // [20]
"KANA",          // [21]
"EISU",          // [22]
"JUNJA",         // [23]
"FINAL",         // [24]
"HANJA",         // [25]
"",              // [26]
"ESCAPE",        // [27]
"CONVERT",       // [28]
"NONCONVERT",    // [29]
"ACCEPT",        // [30]
"MODECHANGE",    // [31]
"SPACE",         // [32]
"PAGE_UP",       // [33]
"PAGE_DOWN",     // [34]
"END",           // [35]
"HOME",          // [36]
"LEFT",          // [37]
"UP",            // [38]
"RIGHT",         // [39]
"DOWN",          // [40]
"SELECT",        // [41]
"PRINT",         // [42]
"EXECUTE",       // [43]
"PRINTSCREEN",   // [44]
"INSERT",        // [45]
"DELETE",        // [46]
"",              // [47]
"0",             // [48]
"1",             // [49]
"2",             // [50]
"3",             // [51]
"4",             // [52]
"5",             // [53]
"6",             // [54]
"7",             // [55]
"8",             // [56]
"9",             // [57]
":",         // [58]
";",     // [59]
"<",     // [60]
"+",        // [61]
">",  // [62]
"?", // [63]
"AT",            // [64]
"A",             // [65]
"B",             // [66]
"C",             // [67]
"D",             // [68]
"E",             // [69]
"F",             // [70]
"G",             // [71]
"H",             // [72]
"I",             // [73]
"J",             // [74]
"K",             // [75]
"L",             // [76]
"M",             // [77]
"N",             // [78]
"O",             // [79]
"P",             // [80]
"Q",             // [81]
"R",             // [82]
"S",             // [83]
"T",             // [84]
"U",             // [85]
"V",             // [86]
"W",             // [87]
"X",             // [88]
"Y",             // [89]
"Z",             // [90]
"SUPER",        // [91] Windows Key (Windows) or Command Key (Mac)
"",              // [92]
"CONTEXT_MENU",  // [93]
"",              // [94]
"SLEEP",         // [95]
"NUMPAD0",       // [96]
"NUMPAD1",       // [97]
"NUMPAD2",       // [98]
"NUMPAD3",       // [99]
"NUMPAD4",       // [100]
"NUMPAD5",       // [101]
"NUMPAD6",       // [102]
"NUMPAD7",       // [103]
"NUMPAD8",       // [104]
"NUMPAD9",       // [105]
"MULTIPLY",      // [106]
"ADD",           // [107]
"SEPARATOR",     // [108]
"SUBTRACT",      // [109]
"DECIMAL",       // [110]
"DIVIDE",        // [111]
"F1",            // [112]
"F2",            // [113]
"F3",            // [114]
"F4",            // [115]
"F5",            // [116]
"F6",            // [117]
"F7",            // [118]
"F8",            // [119]
"F9",            // [120]
"F10",           // [121]
"F11",           // [122]
"F12",           // [123]
"F13",           // [124]
"F14",           // [125]
"F15",           // [126]
"F16",           // [127]
"F17",           // [128]
"F18",           // [129]
"F19",           // [130]
"F20",           // [131]
"F21",           // [132]
"F22",           // [133]
"F23",           // [134]
"F24",           // [135]
"",              // [136]
"",              // [137]
"",              // [138]
"",              // [139]
"",              // [140]
"",              // [141]
"",              // [142]
"",              // [143]
"NUM_LOCK",      // [144]
"SCROLL_LOCK",   // [145]
"WIN_OEM_FJ_JISHO",   // [146]
"WIN_OEM_FJ_MASSHOU", // [147]
"WIN_OEM_FJ_TOUROKU", // [148]
"WIN_OEM_FJ_LOYA",    // [149]
"WIN_OEM_FJ_ROYA",    // [150]
"",              // [151]
"",              // [152]
"",              // [153]
"",              // [154]
"",              // [155]
"",              // [156]
"",              // [157]
"",              // [158]
"",              // [159]
"^",    // [160]
"!",   // [161]
"\"",  // [162]
"#",          // [163]
"$",        // [164]
"%",       // [165]
"&",     // [166]
"-",    // [167]
"(",    // [168]
")",   // [169]
"*",      // [170]
"+",          // [171]
"|",          // [172]
"-",  // [173]
"{",  // [174]
"}", // [175]
"~",         // [176]
"",              // [177]
"",              // [178]
"",              // [179]
"",              // [180]
"VOLUME_MUTE",   // [181]
"VOLUME_DOWN",   // [182]
"VOLUME_UP",     // [183]
"",              // [184]
"",              // [185]
";",     // [186]
"=",        // [187]
",",         // [188]
"-",         // [189]
".",        // [190]
"/",         // [191]
"~",    // [192]
"",              // [193]
"",              // [194]
"",              // [195]
"",              // [196]
"",              // [197]
"",              // [198]
"",              // [199]
"",              // [200]
"",              // [201]
"",              // [202]
"",              // [203]
"",              // [204]
"",              // [205]
"",              // [206]
"",              // [207]
"",              // [208]
"",              // [209]
"",              // [210]
"",              // [211]
"",              // [212]
"",              // [213]
"",              // [214]
"",              // [215]
"",              // [216]
"",              // [217]
"",              // [218]
"[",  // [219]
"\\",    // [220]
"]", // [221]
"QUOTE",         // [222]
"",              // [223]
"META",          // [224]
"ALTGR",         // [225]
"",              // [226]
"WIN_ICO_HELP",  // [227]
"WIN_ICO_00",    // [228]
"",              // [229]
"WIN_ICO_CLEAR", // [230]
"",              // [231]
"",              // [232]
"WIN_OEM_RESET",   // [233]
"WIN_OEM_JUMP",    // [234]
"WIN_OEM_PA1",     // [235]
"WIN_OEM_PA2",     // [236]
"WIN_OEM_PA3",     // [237]
"WIN_OEM_WSCTRL",  // [238]
"WIN_OEM_CUSEL",   // [239]
"WIN_OEM_ATTN",    // [240]
"WIN_OEM_FINISH",  // [241]
"WIN_OEM_COPY",    // [242]
"WIN_OEM_AUTO",    // [243]
"WIN_OEM_ENLW",    // [244]
"WIN_OEM_BACKTAB", // [245]
"ATTN",          // [246]
"CRSEL",         // [247]
"EXSEL",         // [248]
"EREOF",         // [249]
"PLAY",          // [250]
"ZOOM",          // [251]
"",              // [252]
"PA1",           // [253]
"WIN_OEM_CLEAR", // [254]
""               // [255]
];

interface Dictionary<T> {
	[K: string]: T;
}

export class PreferencesPrompt implements Prompt {
	private readonly _showFifth: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _notesFlashWhenPlayed: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _frostedGlassBackground: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _showChannels: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _fixChannelColorOrder: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _showInstrumentScrollbars: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _instrumentCopyPaste: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _instrumentImportExport: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _instrumentButtonsAtTop: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _showLetters: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _displayVolumeBar: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _showOscilloscope: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _showSampleLoadingStatus: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _showDescription: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });

	private readonly _layoutForm: HTMLFormElement = form({ style: "display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;" },
		label({ class: "layout-option" },
			  input({ type: "radio", name: "layout", value: "small" }),
			  SVG(`\
			  <svg viewBox="-4 -1 28 22">
			  <rect x="0" y="0" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1"/>
			  <rect x="2" y="2" width="11" height="10" fill="currentColor"/>
			  <rect x="14" y="2" width="4" height="16" fill="currentColor"/>
			  <rect x="2" y="13" width="11" height="5" fill="currentColor"/>
			  </svg>
			  `),
		div("Small"),
		),
		label({ class: "layout-option" },
			  input({ type: "radio", name: "layout", value: "small+" }),
			  SVG(`\
			  <svg viewBox="-4 -1 28 22">
			  <rect x="0" y="0" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1"/>
			  <rect x="2" y="2" width="11" height="10" fill="currentColor"/>
			  <rect x="14" y="2" width="4" height="16" fill="currentColor"/>
			  <rect x="2" y="13" width="11" height="5" fill="currentColor"/>
			  </svg>
			  `),
		div("Small+ (MB)"),
		),
		label({ class: "layout-option" },
			  input({ type: "radio", name: "layout", value: "long" }),
			  SVG(`\
			  <svg viewBox="-1 -1 28 22">
			  <rect x="0" y="0" width="26" height="20" fill="none" stroke="currentColor" stroke-width="1"/>
			  <rect x="2" y="2" width="12" height="10" fill="currentColor"/>
			  <rect x="15" y="2" width="4" height="10" fill="currentColor"/>
			  <rect x="20" y="2" width="4" height="10" fill="currentColor"/>
			  <rect x="2" y="13" width="22" height="5" fill="currentColor"/>
			  </svg>
			  `),
		div("Long"),
		),
		label({ class: "layout-option" },
			  input({ type: "radio", name: "layout", value: "tall" }),
			  SVG(`\
			  <svg viewBox="-1 -1 28 22">
			  <rect x="0" y="0" width="26" height="20" fill="none" stroke="currentColor" stroke-width="1"/>
			  <rect x="11" y="2" width="8" height="16" fill="currentColor"/>
			  <rect x="20" y="2" width="4" height="16" fill="currentColor"/>
			  <rect x="2" y="2" width="8" height="16" fill="currentColor"/>
			  </svg>
			  `),
		div("Tall"),
		),
		label({ class: "layout-option" },
			  input({ type: "radio", name: "layout", value: "wide" }),
			  SVG(`\
			  <svg viewBox="-1 -1 28 22">
			  <rect x="0" y="0" width="26" height="20" fill="none" stroke="currentColor" stroke-width="1"/>
			  <rect x="2" y="2" width="4" height="16" fill="currentColor"/>
			  <rect x="18" y="2" width="2.5" height="16" fill="currentColor"/>
			  <rect x="21.5" y="2" width="2.5" height="16" fill="currentColor"/>
			  <rect x="7" y="2" width="10" height="16" fill="currentColor"/>
			  </svg>
			  `),
		div("Wide (JB)"),
		),
		label({ class: "layout-option" },
			  input({ type: "radio", name: "layout", value: "wide long" }),
			  SVG(`\
			  <svg viewBox="-1 -1 28 22">
			  <rect x="0" y="0" width="26" height="20" fill="none" stroke="currentColor" stroke-width="1"/>
			  <rect x="2" y="2" width="12" height="10" fill="currentColor"/>
			  <rect x="15" y="2" width="4" height="16" fill="currentColor"/>
			  <rect x="20" y="2" width="4" height="16" fill="currentColor"/>
			  <rect x="2" y="13" width="12" height="5" fill="currentColor"/>
			  </svg>
			  `),
		div("Wide Long (AB)"),
		),
		label({ class: "layout-option" },
			  input({ type: "radio", name: "layout", value: "flipped long" }),
			  SVG(`\
			  <svg viewBox="-1 -1 28 22">
			  <rect x="0" y="0" width="26" height="20" fill="none" stroke="currentColor" stroke-width="1"/>
			  <rect x="2" y="2" width="22" height="2" fill="currentColor"/>
			  <rect x="2" y="5" width="4" height="8" fill="currentColor"/>
			  <rect x="7" y="5" width="17" height="8" fill="currentColor"/>
			  <rect x="2" y="14" width="22" height="4" fill="currentColor"/>
			  </svg>
			  `),
			  div("Flipped Long (AB)"),
		),
		label({ class: "layout-option" },
			  input({ type: "radio", name: "layout", value: "focused long" }),
			  SVG(`\
			  <svg viewBox="-1 -1 28 22">
			  <rect x="0" y="0" width="26" height="20" fill="none" stroke="currentColor" stroke-width="1"/>
			  <rect x="2" y="2" width="17" height="10" fill="currentColor"/>
			  <rect x="20" y="2" width="4" height="16" fill="currentColor"/>
			  <rect x="2" y="13" width="17" height="5" fill="currentColor"/>
			  </svg>
			  `),
			  div("Focused long (AB)"),
		),
	);

	private readonly _themeSelect: HTMLSelectElement = select({ style: "width: 100%;" },
		optgroup({ label: "Default Themes" },
			option({ value: "modbox classic" }, "Modbox"),
			option({ value: "forest" }, "Forest"),
			option({ value: "canyon" }, "Canyon"),
			option({ value: "midnight" }, "Midnight"),
			option({ value: "beachcombing" }, "Beachcombing"),
			option({ value: "violet verdant" }, "Violet Verdant"),
			option({ value: "sunset" }, "Sunset"),
			option({ value: "autumn" }, "Autumn"),
			option({ value: "fruit" }, "Shadowfruit"),
			option({ value: "toxic" }, "Toxic"),
			option({ value: "roe" }, "Roe"),
			option({ value: "moonlight" }, "Moonlight"),
			option({ value: "portal" }, "Portal"),
			option({ value: "fusion" }, "Fusion"),
			option({ value: "inverse" }, "Inverse"),
			option({ value: "nebula" }, "Nebula"),
			option({ value: "roe light" }, "Roe Light"),
			option({ value: "amoled dark" }, "High Contrast Dark"),
			option({ value: "energized" }, "Energized"),
			option({ value: "neapolitan" }, "Neapolitan"),
			option({ value: "poly" }, "Poly"),
			option({ value: "blutonium" }, "Blutonium"),
			option({ value: "greyscale" }, "Greyscale"),
			option({ value: "slushie" }, "Slushie"),
		),
		optgroup({ label: "Mod Themes" },
			option({ value: "dark classic" }, "BeepBox Dark"),
			option({ value: "light classic" }, "BeepBox Light"),
			option({ value: "dark competition" }, "BeepBox Competition Dark"),
			option({ value: "jummbox classic" }, "JummBox Dark"),
			option({ value: "sandbox classic" }, "Sandbox"),
			option({ value: "harrybox" }, "Haileybox"),
			option({ value: "brucebox" }, "Brucebox"),
			option({ value: "shitbox 3.0" }, "Shitbox 1.0/3.0"),
			option({ value: "shitbox 2.0" }, "Shitbox 2.0"),
			option({ value: "nerdbox" }, "NerdBox"),
			option({ value: "zefbox" }, "Zefbox"),
			option({ value: "cardboardbox classic" }, "Cardboardbox"),
			option({ value: "blubox classic" }, "Blubox"),
			option({ value: "dogebox classic" }, "Dogebox"),
			option({ value: "wackybox" }, "Wackybox"),
			option({ value: "todbox dark mode" }, "Todbox Dark Mode"),
			option({ value: "mainbox 1.0" }, "Mainbox"),
			option({ value: "microbox" }, "MicroBox"),
			option({ value: "paandorasbox" }, "PaandorasBox"),
			option({ value: "foxbox" }, "FoxBox"),
			option({ value: "midbox" }, "Midbox"),
			option({ value: "dogebox2" }, "Dogebox2"),
			option({ value: "abyssbox classic"}, "AbyssBox Classic"),
			option({ value: "abyssbox light"}, "AbyssBox Light"),
			option({ value: "nepbox" }, "Nepbox"),
			option({ value: "slarmoosbox" }, "Slarmoo's Box"),
			option({ value: "ultrabox dark" }, "UltraBox"),
			option({ value: "custom", hidden: "true" }, "Custom"),
		)
	);

	private readonly _customThemeFileInput: HTMLInputElement = input({ type: "file", accept: "image/*", text: "choose editor background image"});
	private readonly _customThemeFileInput2: HTMLInputElement = input({ type: "file", accept: "image/*", text: "choose website background image" });
	private readonly _colorInput: HTMLInputElement = input({ type: "text", style: "width: auto"});
	private readonly _customThemeFileReset: HTMLButtonElement = button({ style: "height: auto; min-height: var(--button-size);" }, "Reset background image");

	private readonly _autoPlay: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _autoFollow: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _enableNotePreview: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _notesOutsideScale: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	// private readonly _setDefaultScale: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _alwaysFineNoteVol: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _showScrollBar: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _enableChannelMuting: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _displayBrowserUrl: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _closePromptByClickoff: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });

    private readonly _keyboardMode: HTMLSelectElement = select({ style: "width: 100%;" },
        option({ value: "useCapsLockForNotes" }, "use caps lock to play notes"),
        option({ value: "pressControlForShortcuts" }, "press " + EditorConfig.ctrlName + " for shortcuts"),
    );
    private readonly _keyboardLayout: HTMLSelectElement = select({ style: "width: 100%;" },
        option({ value: "wickiHayden" }, "Wicki-Hayden"),
        option({ value: "songScale" }, "selected song scale"),
        option({ value: "pianoAtC" }, "piano starting at C :)"),
        option({ value: "pianoAtA" }, "piano starting at A :("),
        option({ value: "pianoTransposingC" }, "piano transposing C :) to song key"),
        option({ value: "pianoTransposingA" }, "piano transposing A :( to song key"),
    );
    private readonly _bassOffset: HTMLSelectElement = select({ style: "width: 100%;" },
        option({ value: "0" }, "disabled"),
        option({ value: "-1" }, "before"),
        option({ value: "1" }, "after"),
    );
    private readonly _keyboardLayoutPreview: HTMLDivElement = div({ style: "display: grid; row-gap: 4px; margin: 4px auto; font-size: 10px;" });
    private readonly _enableMidi: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
    private readonly _showRecordButton: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
    private readonly _snapRecordedNotesToRhythm: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
    private readonly _ignorePerformedNotesNotInScale: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
    private readonly _metronomeCountIn: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });
	private readonly _metronomeWhileRecording: HTMLInputElement = input({ style: "width: 2em; margin-left: 1em;", type: "checkbox" });

    private readonly _shortenerStrategySelect: HTMLSelectElement = select({ style: "width: 100%;" },
        option({ value: "tinyurl" }, "tinyurl.com"),
        option({ value: "isgd" }, "is.gd"),
        // option({value: "beepboxnet"}, "beepbox.net"),
	);

	private _shortcuts: Dictionary<Shortcut>;
	private readonly _defaultShortcuts: Dictionary<Shortcut> = DefaultShortcuts;
	private _shortcutLabels: HTMLDivElement = div();
	private _recordRebind: string = "";

	private readonly _resetDefaultButton: HTMLButtonElement = button({ style: "height: auto; margin: 1em;" }, "Reset to Defaults");

	private readonly _appearanceAreaButton: HTMLButtonElement = button({ class: "appearanceAreaButton", style: "width:25%;" }, "Appearance");
	private readonly _generalAreaButton: HTMLButtonElement = button({ class: "generalAreaButton", style: "width:25%;" }, "General");
	private readonly _keybindAreaButton: HTMLButtonElement = button({ class: "keybindAreaButton", style: "width:25%;" }, "Shortcuts");

	private readonly _appearanceArea: HTMLDivElement = div({ style: "display: none; overflow-y: visible; overflow-x: hidden;" },
		h2("Appearance"),
		div({ style: "display: flex; flex-direction: row; text-align: left; justify-content: space-between;" },
			div({ style: "width:49.5%;" },
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					'Highlight "fifth" note:',
					div({ style: "width: 50%; text-align: center;" }, this._showFifth),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					'Flash notes when played:',
					div({ style: "width: 50%; text-align: center;" }, this._notesFlashWhenPlayed),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					div({ style: "width: 50%;" }, "Blur background while in prompt:"),
					div({ style: "width: 50%; text-align: center;" }, this._frostedGlassBackground),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Show all channels:",
					div({ style: "width: 50%; text-align: center;" }, this._showChannels),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Preserve channel color order:",
					div({ style: "width: 50%; text-align: center;" }, this._fixChannelColorOrder),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Show instrument scrollbars:",
					div({ style: "width: 50%; text-align: center;" }, this._showInstrumentScrollbars),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
						div({ style: "width: 50%;" }, "Show instrument copy/paste buttons:"),
						div({ style: "width: 50%; text-align: center;" }, this._instrumentCopyPaste),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
						div({ style: "width: 50%;" }, "Show instrument import/export buttons:"),
						div({ style: "width: 50%; text-align: center;" }, this._instrumentImportExport),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					div({ style: "width: 50%;" }, "Show instrument buttons at top:"),
					div({ style: "width: 50%; text-align: center;" }, this._instrumentButtonsAtTop),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Show piano keys:",
					div({ style: "width: 50%; text-align: center;" }, this._showLetters),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Show volume bar:",
					div({ style: "width: 50%; text-align: center;" }, this._displayVolumeBar),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Show oscilloscope:",
					div({ style: "width: 50%; text-align: center;" }, this._showOscilloscope),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Show sample loading status:",
					div({ style: "width: 50%; text-align: center;" }, this._showSampleLoadingStatus),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Show description:",
					div({ style: "width: 50%; text-align: center;" }, this._showDescription),
				),
			),
			div({ style: "width:49.5%;" },
				div({ style: "text-align: center; margin-top: 0.5em; margin-bottom: 0.5em;" }, "Layout:"),
				this._layoutForm,
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Theme:",
					div({ class: "selectContainer", style: "width: 50%; text-align: center;" }, this._themeSelect),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Custom theme data:",
					div({ style: "width: 50%; text-align: center;" }, this._colorInput)
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					div({ style: "width: 50%;" }, "Editor background image:"),
					div({ style: "width: 50%; text-align: center;" }, this._customThemeFileInput)
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					div({ style: "width: 50%;" }, "Website background image:"),
					div({ style: "width: 50%; text-align: center;" }, this._customThemeFileInput2)
				),
				div({ style: "text-align: center; margin-top: 0.5em; margin-bottom: 0.5em;" }, this._customThemeFileReset),
			),
		)
	);

	private readonly _generalArea: HTMLDivElement = div({ style: "overflow-y: visible; overflow-x: hidden;" },
		h2("General"),
		div({ style: "display: flex; flex-direction: row-reverse; text-align: left; justify-content: space-between;" },
			div({ style: "width:49.5%;" },
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Always show recording button:",
					div({ style: "width: 50%; text-align: center;" }, this._showRecordButton),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					div({ style: "width: 50%;" }, "Snap recorded notes to rhythm:"),
					div({ style: "width: 50%; text-align: center;" }, this._snapRecordedNotesToRhythm),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					div({ style: "width: 50%;" }, "Ignore recorded notes outside of the scale:"),
					div({ style: "width: 50%; text-align: center;" }, this._ignorePerformedNotesNotInScale),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Recording keyboard layout:",
					div({ class: "selectContainer", style: "width: 50%; text-align: center;" }, this._keyboardLayout),
				),
				div({ style: "display: flex; margin-top: 0.5em; margin-bottom: 0.5em;" }, this._keyboardLayoutPreview),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-bottom: 0.5em; height: 2em;" },
					"Shortcut / Recording mode:",
					div({ class: "selectContainer", style: "width: 50%; text-align: center;" }, this._keyboardMode),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Enable MIDI performance:",
					div({ style: "width: 50%; text-align: center;" }, this._enableMidi),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Record with metronome:",
					div({ style: "width: 50%; text-align: center;" }, this._metronomeWhileRecording),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					div({ style: "width: 50%;" }, "Count-in recording with metronome:"),
					div({ style: "width: 50%; text-align: center;" }, this._metronomeCountIn),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Bass channel offset:",
					div({ class: "selectContainer", style: "width: 50%; text-align: center;" }, this._bassOffset),
				),
			),
			div({ style: "width:49.5%;" },
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Auto-play on load:",
					div({ style: "width: 50%; text-align: center;" }, this._autoPlay),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					  "Automatically view current bar:",
					  div({ style: "width: 50%; text-align: center;" }, this._autoFollow),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					  "Hear preview of placed notes:",
					  div({ style: "width: 50%; text-align: center;" }, this._enableNotePreview),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					  "Place notes out of scale:",
					  div({ style: "width: 50%; text-align: center;" }, this._notesOutsideScale),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					  "Always use fine note volume:",
					  div({ style: "width: 50%; text-align: center;" }, this._alwaysFineNoteVol),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					"Enable octave scroll bar:",
					div({ style: "width: 50%; text-align: center;" }, this._showScrollBar),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					  "Enable channel muting:",
					  div({ style: "width: 50%; text-align: center;" }, this._enableChannelMuting),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					  "Enable song data in URL:",
					  div({ style: "width: 50%; text-align: center;" }, this._displayBrowserUrl),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					  "Song URL shortener:",
					  div({ class: "selectContainer", style: "width: 50%; text-align: center;" }, this._shortenerStrategySelect),
				),
				label({ style: "display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 0.5em; margin-bottom: 0.5em; height: 2em;" },
					  "Close prompts on click-off:",
					  div({ style: "width: 50%; text-align: center;" }, this._closePromptByClickoff),
				),
			)
		)
	);

	private readonly _keybindArea: HTMLDivElement = div({ style: "display: none;  overflow-y: visible; overflow-x: hidden;" },
		h2("Shortcuts"),
		this._shortcutLabels,
		this._resetDefaultButton,
	);

    private readonly _okayButton: HTMLButtonElement = button({ class: "okayButton", style: "width:45%;" }, "Okay");
    private readonly _cancelButton: HTMLButtonElement = button({ class: "cancelButton" });

	public readonly container: HTMLDivElement = div({ class: "prompt noSelection recordingSetupPrompt", style: "width: 750px; max-height: 90%;" },
		div({ style: "display: flex; flex-direction: row; justify-content: space-evenly;" },
			this._generalAreaButton,
			this._appearanceAreaButton,
			this._keybindAreaButton,
		),
		this._generalArea,
		this._appearanceArea,
		this._keybindArea,
        div({ style: "display: flex; flex-direction: row-reverse; justify-content: space-between;" },
            this._okayButton,
        ),
        this._cancelButton,
    );

	private _lastTheme: string | null = window.localStorage.getItem("colorTheme");
	private _newTheme: boolean = false;
	private _resetCustomTheme: boolean = false;
	private _mustReload: boolean = false;

	constructor(private _doc: SongDocument, private _pattern: PatternEditor, private _pattern2: HTMLDivElement, private _pattern3: HTMLElement) {
		this._showFifth.checked = this._doc.prefs.showFifth;
		this._notesFlashWhenPlayed.checked = this._doc.prefs.notesFlashWhenPlayed;
		this._frostedGlassBackground.checked = this._doc.prefs.frostedGlassBackground;
		this._showChannels.checked = this._doc.prefs.showChannels;
		this._fixChannelColorOrder.checked = this._doc.prefs.fixChannelColorOrder;
		this._showInstrumentScrollbars.checked = this._doc.prefs.showInstrumentScrollbars;
		this._instrumentCopyPaste.checked = this._doc.prefs.instrumentCopyPaste;
		this._instrumentImportExport.checked = this._doc.prefs.instrumentImportExport;
		this._instrumentButtonsAtTop.checked = this._doc.prefs.instrumentButtonsAtTop;
		this._showLetters.checked = this._doc.prefs.showLetters;
		this._displayVolumeBar.checked = this._doc.prefs.displayVolumeBar;
		this._showOscilloscope.checked = this._doc.prefs.showOscilloscope;
		this._showSampleLoadingStatus.checked = this._doc.prefs.showSampleLoadingStatus;
		this._showDescription.checked = this._doc.prefs.showDescription;

		(<any>this._layoutForm.elements)["layout"].value = this._doc.prefs.layout;

		if (this._lastTheme != null) {
			this._themeSelect.value = this._lastTheme;
		}

		this._colorInput.value = this._doc.prefs.customColors || "";

		this._autoPlay.checked = this._doc.prefs.autoPlay;
		this._autoFollow.checked = this._doc.prefs.autoFollow;
		this._enableNotePreview.checked = this._doc.prefs.enableNotePreview;
		this._notesOutsideScale.checked = this._doc.prefs.notesOutsideScale;
		this._alwaysFineNoteVol.checked = this._doc.prefs.alwaysFineNoteVol;
		this._showScrollBar.checked = this._doc.prefs.showScrollBar;
		this._enableChannelMuting.checked = this._doc.prefs.enableChannelMuting;
		this._displayBrowserUrl.checked = this._doc.prefs.displayBrowserUrl;
		this._closePromptByClickoff.checked = this._doc.prefs.closePromptByClickoff;

		this._shortenerStrategySelect.value = this._doc.prefs.shortenerStrategySelect;

        this._keyboardMode.value = this._doc.prefs.pressControlForShortcuts ? "pressControlForShortcuts" : "useCapsLockForNotes";
        this._keyboardLayout.value = this._doc.prefs.keyboardLayout;
        this._bassOffset.value = String(this._doc.prefs.bassOffset);
        this._enableMidi.checked = this._doc.prefs.enableMidi;
        this._showRecordButton.checked = this._doc.prefs.showRecordButton;
        this._snapRecordedNotesToRhythm.checked = this._doc.prefs.snapRecordedNotesToRhythm;
        this._ignorePerformedNotesNotInScale.checked = this._doc.prefs.ignorePerformedNotesNotInScale;
        this._metronomeCountIn.checked = this._doc.prefs.metronomeCountIn;
        this._metronomeWhileRecording.checked = this._doc.prefs.metronomeWhileRecording;

		this._shortcuts = _doc.prefs.shortcuts;
		this._renderShortcuts();
		this._resetDefaultButton.addEventListener("click", this._whenResetDefaultShortcuts);

        setTimeout(() => this._showRecordButton.focus());

		this._appearanceAreaButton.addEventListener("click", this._renderAppearanceArea);
		this._generalAreaButton.addEventListener("click", this._renderGeneralArea);
		this._keybindAreaButton.addEventListener("click", this._renderKeybindArea);
        this._okayButton.addEventListener("click", this._confirm);
        this._cancelButton.addEventListener("click", this._close);
        this.container.addEventListener("keydown", this._whenKeyPressed);

		this._renderKeyboardLayoutPreview();
		this._keyboardLayout.addEventListener("change", this._renderKeyboardLayoutPreview);
		this._bassOffset.addEventListener("change", this._renderKeyboardLayoutPreview);

		this._customThemeFileInput.addEventListener("change", this._whenCustomThemeFileSelected);
		this._customThemeFileInput2.addEventListener("change", this._whenCustomThemeFileSelected2);
		this._customThemeFileReset.addEventListener("click", this._resetCustomThemeFile);
		this._colorInput.addEventListener("change", this._whenColorsChanged);
		this._themeSelect.addEventListener("change", this._previewTheme);
	}

	private _close = (): void => {
		if (!this._newTheme && this._lastTheme != null) {
			ColorConfig.setTheme(this._lastTheme);
		} else if (!this._newTheme) {
			ColorConfig.setTheme(ColorConfig.defaultTheme);
		}
		this._doc.prompt = null;
		this._doc.undo();
		if (this._mustReload) {
			// The prompt seems to get stuck if reloading is done too quickly.
			setTimeout(() => { window.location.reload(); }, 50);
		}
    }

    public cleanUp = (): void => {
        this._okayButton.removeEventListener("click", this._confirm);
        this._cancelButton.removeEventListener("click", this._close);
        this.container.removeEventListener("keydown", this._whenKeyPressed);
    }

    private _whenKeyPressed = (event: KeyboardEvent): void => {
		if (this._recordRebind != "") {
			this._shortcuts[this._recordRebind].keyCode = event.keyCode;
			this._recordRebind = "";
			this._renderShortcuts();
		}
        if ((<Element>event.target).tagName != "BUTTON" && event.keyCode == 13) { // Enter key
            this._confirm();
        }
    }

    private _confirm = (): void => {
		this._doc.prefs.showFifth = this._showFifth.checked;
		this._doc.prefs.notesFlashWhenPlayed = this._notesFlashWhenPlayed.checked;
		this._doc.prefs.frostedGlassBackground = this._frostedGlassBackground.checked;
		this._doc.prefs.showChannels = this._showChannels.checked;
		this._doc.prefs.fixChannelColorOrder = this._fixChannelColorOrder.checked;
		this._doc.prefs.showInstrumentScrollbars = this._showInstrumentScrollbars.checked;
		this._doc.prefs.instrumentCopyPaste = this._instrumentCopyPaste.checked;
		this._doc.prefs.instrumentImportExport = this._instrumentImportExport.checked;
		this._doc.prefs.instrumentButtonsAtTop = this._instrumentButtonsAtTop.checked;
		this._doc.prefs.showLetters = this._showLetters.checked;
		this._doc.prefs.displayVolumeBar = this._displayVolumeBar.checked;
		this._doc.prefs.showOscilloscope = this._showOscilloscope.checked;
		this._doc.prefs.showSampleLoadingStatus = this._showSampleLoadingStatus.checked;
		this._doc.prefs.showDescription = this._showDescription.checked;

		this._doc.prefs.layout = (<any>this._layoutForm.elements)["layout"].value;

		this._doc.prefs.colorTheme = this._themeSelect.value;
		this._newTheme = true

		this._doc.prefs.customColors = this._colorInput.value;

		if (this._resetCustomTheme) {
			this._mustReload = true
			this._doc.prefs.customTheme = null
			this._doc.prefs.customTheme2 = null
			this._pattern._svg.style.backgroundImage = "";
			document.body.style.backgroundImage = "";
			this._pattern2.style.backgroundImage = "";
			this._pattern3.style.backgroundImage = "";
			const secondImage: HTMLElement | null = document.getElementById("secondImage");
			if (secondImage != null) {
				secondImage.style.backgroundImage = "";
			}
		}

		this._doc.prefs.autoPlay = this._autoPlay.checked;
		this._doc.prefs.autoFollow = this._autoFollow.checked;
		this._doc.prefs.enableNotePreview = this._enableNotePreview.checked;
		this._doc.prefs.notesOutsideScale = this._notesOutsideScale.checked;
		this._doc.prefs.alwaysFineNoteVol = this._alwaysFineNoteVol.checked;
		this._doc.prefs.showScrollBar = this._showScrollBar.checked;
		this._doc.prefs.enableChannelMuting = this._enableChannelMuting.checked;
		this._doc.prefs.displayBrowserUrl = this._displayBrowserUrl.checked;
		this._doc.prefs.closePromptByClickoff = this._closePromptByClickoff.checked;

		this._doc.prefs.shortenerStrategySelect = this._shortenerStrategySelect.value;

        this._doc.prefs.pressControlForShortcuts = (this._keyboardMode.value == "pressControlForShortcuts");
        this._doc.prefs.keyboardLayout = this._keyboardLayout.value;
        this._doc.prefs.bassOffset = Number(this._bassOffset.value);
        this._doc.prefs.enableMidi = this._enableMidi.checked;
        this._doc.prefs.showRecordButton = this._showRecordButton.checked;
        this._doc.prefs.snapRecordedNotesToRhythm = this._snapRecordedNotesToRhythm.checked;
        this._doc.prefs.ignorePerformedNotesNotInScale = this._ignorePerformedNotesNotInScale.checked;
        this._doc.prefs.metronomeCountIn = this._metronomeCountIn.checked;
		this._doc.prefs.metronomeWhileRecording = this._metronomeWhileRecording.checked;

		this._doc.prefs.shortcuts = this._shortcuts;

		this._doc.prefs.save();
		Layout.setLayout(this._doc.prefs.layout);
		this._close();
	}

	private _renderAppearanceArea = (event: Event): void => {
		event.preventDefault();
		this._appearanceArea.style.display = "";
		this._generalArea.style.display = "none";
		this._keybindArea.style.display = "none";
	}

	private _renderGeneralArea = (event: Event): void => {
		event.preventDefault();
		this._appearanceArea.style.display = "none";
		this._generalArea.style.display = "";
		this._keybindArea.style.display = "none";
	}

	private _renderKeybindArea = (event: Event): void => {
		event.preventDefault();
		this._appearanceArea.style.display = "none";
		this._generalArea.style.display = "none";
		this._keybindArea.style.display = "";
	}

    private _renderKeyboardLayoutPreview = (): void => {
        while (this._keyboardLayoutPreview.firstChild) {
            this._keyboardLayoutPreview.removeChild(this._keyboardLayoutPreview.firstChild);
        }
        const rowLengths: number[] = [12, 12, 11, 10];
        const scale: ReadonlyArray<boolean> = Config.scales[this._doc.song.scale].flags;
        for (let rowIndex: number = 0; rowIndex < 4; rowIndex++) {
            const row: HTMLDivElement = div({ style: "display: flex;" });
            this._keyboardLayoutPreview.appendChild(row);
            const spacer: HTMLDivElement = div({ style: "width: " + (rowIndex * 12) + "px; height: 20px; flex-shrink: 0;" });
            row.appendChild(spacer);
            for (let colIndex: number = 0; colIndex < rowLengths[rowIndex]; colIndex++) {
                const key: HTMLDivElement = div({ style: `width: 20px; height: 20px; margin: 0 2px; box-sizing: border-box; flex-shrink: 0; display: flex; justify-content: center; align-items: center;` });
                row.appendChild(key);
                const pitch: number | null = KeyboardLayout.keyPosToPitch(this._doc, colIndex, 3 - rowIndex, this._keyboardLayout.value);
                if (pitch != null) {
                    const scalePitch: number = pitch % 12;
                    if (scale[scalePitch]) {
                        if (scalePitch == 0) {
                            key.style.background = ColorConfig.tonic;
                        } else if (scalePitch == 7 && this._doc.prefs.showFifth) {
                            key.style.background = ColorConfig.fifthNote;
                        } else {
                            key.style.background = ColorConfig.pitchBackground;
                        }
                    } else {
                        key.style.border = "2px solid " + ColorConfig.pitchBackground;
                    }

                    if (this._bassOffset.selectedIndex != 0 && pitch <= Piano.getBassCutoffPitch(this._doc)) {
                        key.style.setProperty("filter", "hue-rotate(60deg) brightness(0.5)");
                    }
                    else {
                        key.style.setProperty("filter", "");
                    }

                    const pitchNameIndex: number = (scalePitch + Config.keys[this._doc.song.key].basePitch) % Config.pitchesPerOctave;
                    key.textContent = Piano.getPitchName(pitchNameIndex, scalePitch, Math.floor(pitch / 12));
                }
            }
        }
	}

	private _previewTheme = (): void => {
		ColorConfig.setTheme(this._themeSelect.value);
		this._doc.prefs.customColors = "";
	}

	private _whenColorsChanged = (): void => {
		this._doc.prefs.customColors = this._colorInput.value;
		this._doc.prefs.colorTheme = "custom";
		this._themeSelect.value = "custom";
		this._mustReload = true;
	}

	private _whenCustomThemeFileSelected = (): void => {
		const file: File = this._customThemeFileInput.files![0];
		if (!file) return;
		const reader: FileReader = new FileReader();
		reader.addEventListener("load", (event: Event): void => {
			let base64 = <string>reader.result;
			this._doc.prefs.customTheme = base64;
			this._pattern._svg.style.backgroundImage = `url("${base64}")`;
		});
		reader.readAsDataURL(file);
	}

	private _whenCustomThemeFileSelected2 = (): void => {
		const file: File = this._customThemeFileInput2.files![0];
		if (!file) return;
		const reader: FileReader = new FileReader();
		reader.addEventListener("load", (event: Event): void => {
			let base64 = <string>reader.result;
			this._doc.prefs.customTheme2 = base64
			const value = `url("${base64}")`
			document.body.style.backgroundImage = value;
			this._pattern2.style.backgroundImage = value;
			this._pattern3.style.backgroundImage = value;
			const secondImage: HTMLElement | null = document.getElementById("secondImage");
			if (secondImage != null) {
				secondImage.style.backgroundImage = value;
			}
		});
		reader.readAsDataURL(file);
	}

	private _resetCustomThemeFile = (): void => {
		this._resetCustomTheme = true;
	}

	private _whenSetCtrlKey = (event: Event): void => {
		const element: HTMLInputElement = <HTMLInputElement>event.target;
		const entryIndex: string = element.dataset.index as string;
		const newValue: boolean = element.checked;
		this._shortcuts[entryIndex].ctrlKey = newValue;
		this._renderShortcuts();
	}

	private _whenSetShiftKey = (event: Event): void => {
		const element: HTMLInputElement = <HTMLInputElement>event.target;
		const entryIndex: string = element.dataset.index as string;
		const newValue: boolean = element.checked;
		this._shortcuts[entryIndex].shiftKey = newValue;
		this._renderShortcuts();
	}

	private _whenRecordRebind = (event: Event): void => {
		this._recordRebind = "";
		this._renderShortcuts();
	}

	private _whenSetRebind = (event: Event): void => {
		const element: HTMLButtonElement = <HTMLButtonElement>event.target;
		const entryIndex: string = element.dataset.index as string;
		this._recordRebind = entryIndex;
	}

	private _whenResetDefaultShortcuts = (event: Event): void => {
		let i: string;
		for (i in this._shortcuts) {
			if (this._defaultShortcuts[i]) {
				this._shortcuts[i].keyCode = this._defaultShortcuts[i].keyCode;
				this._shortcuts[i].ctrlKey = this._defaultShortcuts[i].ctrlKey;
				this._shortcuts[i].shiftKey = this._defaultShortcuts[i].shiftKey;
			}
		}
		this._renderShortcuts();
	}

	private _renderShortcuts = (): void => {
		this._shortcutLabels.replaceChildren();
		let i: string;
		for (i in this._shortcuts) {
			if (this._defaultShortcuts[i]) {
				const ctrlKeyBox: HTMLInputElement = input({ style: "width: 1em; margin: 1em;", type: "checkbox" });
				const shiftKeyBox: HTMLInputElement = input({ style: "width: 1em; margin: 1em;", type: "checkbox" });
				const recordRebindButton: HTMLButtonElement = button({ style: "height: auto; margin: 1em;" }, "Hold to Rebind");

				ctrlKeyBox.checked = this._shortcuts[i].ctrlKey;
				shiftKeyBox.checked = this._shortcuts[i].shiftKey;

				this._shortcutLabels.appendChild(div({ style: `display: flex; flex-direction: row; height: 2em; justify-content: space-between; align-items: center; margin: 2px; border: 2px solid ${ColorConfig.uiWidgetBackground}; border-radius: 4px;` },
					p({style: "margin: 1em;"}, this._shortcuts[i].displayName),
					div({style: "display: flex; flex-direction: row; width: 60%;"},
						div( "ctrl", ctrlKeyBox),
						div( "shift", shiftKeyBox),
						div( recordRebindButton),
						div({ style: "margin: 1em" }, keyboardMap[this._shortcuts[i].keyCode]),
					),
				));
				ctrlKeyBox.dataset.index = i;
				shiftKeyBox.dataset.index = i;
				recordRebindButton.dataset.index = i;
				ctrlKeyBox.addEventListener("change", this._whenSetCtrlKey);
				shiftKeyBox.addEventListener("change", this._whenSetShiftKey);
				recordRebindButton.addEventListener("mousedown", this._whenSetRebind);
				recordRebindButton.addEventListener("click", this._whenRecordRebind);
			}
		}
	}
}
