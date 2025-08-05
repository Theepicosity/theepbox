// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Config } from "../synth/SynthConfig";
import { EditorConfig } from "./EditorConfig";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { ColorConfig } from "./ColorConfig";
import { KeyboardLayout } from "./KeyboardLayout";
import { Piano } from "./Piano";

const { button, label, div, p, a, h2, input, select, option } = HTML;

export class ShortcutPrompt implements Prompt {
    private _shortcuts: Array;
    private _shortcutLabels: HTMLDivElement = div();

    private readonly _okayButton: HTMLButtonElement = button({ class: "okayButton", style: "width:45%;" }, "Okay");
    private readonly _cancelButton: HTMLButtonElement = button({ class: "cancelButton" });
    public readonly container: HTMLDivElement = div({ class: "prompt noSelection shortcutPrompt", style: "width: 600px; text-align: right; max-height: 90%;" },
        h2({ style: "align-self: center;" }, "Rebind Shortcuts"),
        div({ style: "display: grid; overflow-y: auto; overflow-x: hidden; flex-shrink: 1;" },
            this._shortcutLabels,
        ),
        div({ style: "display: flex; flex-direction: row-reverse; justify-content: space-between;" },
            this._okayButton,
        ),
        this._cancelButton,
    );

    constructor(private _doc: SongDocument) {
        this._shortcuts = _doc.prefs.shortcuts;
        console.log(this._shortcuts)
        let i: string;
        for (i in this._shortcuts) {
            this._shortcutLabels.appendChild(div({ style: "display: flex; flex-direction: row; height: 2em; justify-content: space-between;" },
                p(this._shortcuts[i].displayName),
                div({style: "display: flex; flex-direction: row;"},
                    //input({ type: "checkbox" }),
                    p({ style: "margin: 1em" }, (this._shortcuts[i].shiftKey ? "ctrl" : "") + " " + (this._shortcuts[i].shiftKey ? "shift" : "") + " " + this._shortcuts[i].keyCode),
                ),
            ));
        }

        this._okayButton.addEventListener("click", this._confirm);
        this._cancelButton.addEventListener("click", this._close);
        this.container.addEventListener("keydown", this._whenKeyPressed);
    }

    private _close = (): void => {
        this._doc.undo();
    }

    public cleanUp = (): void => {
        this._okayButton.removeEventListener("click", this._confirm);
        this._cancelButton.removeEventListener("click", this._close);
        this.container.removeEventListener("keydown", this._whenKeyPressed);
    }

    private _whenKeyPressed = (event: KeyboardEvent): void => {
        if ((<Element>event.target).tagName != "BUTTON" && event.keyCode == 13) { // Enter key
            this._confirm();
        }
    }

    private _confirm = (): void => {
        this._doc.prefs.save();
        this._close();
    }
}
