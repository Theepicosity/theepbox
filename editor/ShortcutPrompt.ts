// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { SongDocument } from "./SongDocument";
import { Shortcut, DefaultShortcuts } from "./Preferences";
import { Prompt } from "./Prompt";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { ColorConfig } from "./ColorConfig";

const { button, div, p, h2, input } = HTML;

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

export class ShortcutPrompt implements Prompt {
    private _shortcuts: Dictionary<Shortcut>;
    private readonly _defaultShortcuts: Dictionary<Shortcut> = DefaultShortcuts;
    private _shortcutLabels: HTMLDivElement = div();
    private _recordRebind: string = "";

    private readonly _resetDefaultButton: HTMLButtonElement = button({ style: "height: auto; margin: 1em;" }, "Reset to Defaults");
    private readonly _okayButton: HTMLButtonElement = button({ class: "okayButton", style: "width:45%;" }, "Okay");
    private readonly _cancelButton: HTMLButtonElement = button({ class: "cancelButton" });
    public readonly container: HTMLDivElement = div({ class: "prompt noSelection shortcutPrompt", style: "width: 600px; text-align: right; max-height: 90%;" },
        h2({ style: "align-self: center;" }, "Rebind Shortcuts"),
        div({ style: "display: grid; overflow-y: auto; overflow-x: hidden; flex-shrink: 1;" },
            this._shortcutLabels,
            this._resetDefaultButton,
        ),
        div({ style: "display: flex; flex-direction: row-reverse; justify-content: space-between;" },
            this._okayButton,
        ),
        this._cancelButton,
    );

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

    private _whenResetDefault = (event: Event): void => {
        let i: string;
        for (i in this._shortcuts) {
            this._shortcuts[i].keyCode = this._defaultShortcuts[i].keyCode;
            this._shortcuts[i].ctrlKey = this._defaultShortcuts[i].ctrlKey;
            this._shortcuts[i].shiftKey = this._defaultShortcuts[i].shiftKey;
        }
        this._renderShortcuts();
    }

    constructor(private _doc: SongDocument) {
        this._shortcuts = _doc.prefs.shortcuts;
        this._renderShortcuts();

        this._okayButton.addEventListener("click", this._confirm);
        this._cancelButton.addEventListener("click", this._close);
        this._resetDefaultButton.addEventListener("click", this._whenResetDefault);
        this.container.addEventListener("keydown", this._whenKeyPressed);
    }

    private _renderShortcuts = (): void => {
        this._shortcutLabels.replaceChildren();
        let i: string;
        for (i in this._shortcuts) {
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

    private _close = (): void => {
        this._doc.undo();
    }

    public cleanUp = (): void => {
        this._okayButton.removeEventListener("click", this._confirm);
        this._cancelButton.removeEventListener("click", this._close);
        this._resetDefaultButton.removeEventListener("click", this._whenResetDefault);
        this.container.removeEventListener("keydown", this._whenKeyPressed);
    }

    private _whenKeyPressed = (event: KeyboardEvent): void => {
        if (this._recordRebind != "") {
            this._shortcuts[this._recordRebind].keyCode = event.keyCode;
            this._recordRebind = "";
            this._renderShortcuts();
        }
        else if ((<Element>event.target).tagName != "BUTTON" && event.keyCode == 13) { // Enter key
            this._confirm();
        }
    }

    private _confirm = (): void => {
        this._doc.prefs.shortcuts = this._shortcuts;
        this._doc.prefs.save();
        this._close();
    }
}
