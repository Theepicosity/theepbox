/*
Copyright (C) 2012 John Nesky

Permission is hereby granted, free of charge, to any person obtaining a copy of 
this software and associated documentation files (the "Software"), to deal in 
the Software without restriction, including without limitation the rights to 
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies 
of the Software, and to permit persons to whom the Software is furnished to do 
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all 
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE 
SOFTWARE.
*/

package beepbox.editor {
	import beepbox.synth.*;
	
	public class ChangeTransposeTone extends Change {
		protected var doc: Document;
		protected var tone: Tone;
		protected var oldStart: int;
		protected var newStart: int;
		protected var oldEnd: int;
		protected var newEnd: int;
		protected var oldPins: Array;
		protected var newPins: Array;
		protected var oldNotes: Array;
		protected var newNotes: Array;
		public function ChangeTransposeTone(doc: Document, tone: Tone, upward: Boolean) {
			super(false);
			this.doc = doc;
			this.tone = tone;
			oldPins = tone.pins;
			newPins = [];
			oldNotes = tone.notes;
			newNotes = [];
			
			var i: int;
			var j: int;
			
			for (i = 0; i < oldNotes.length; i++) {
				var note: int = oldNotes[i];
				if (upward) {
					for (j = note + 1; j <= Music.maxPitch; j++) {
						if (doc.channel == 3 || Music.scaleFlags[doc.song.scale][j%12] == true) {
							note = j;
							break;
						}
					}
				} else {
					for (j = note - 1; j >= 0; j--) {
						if (doc.channel == 3 || Music.scaleFlags[doc.song.scale][j%12] == true) {
							note = j;
							break;
						}
					}
				}
				
				var foundMatch: Boolean = false;
				for (j = 0; j < newNotes.length; j++) {
					if (newNotes[j] == note) {
						foundMatch = true;
						break;
					}
				}
				if (!foundMatch) newNotes.push(note);
			}
			
			var min: int = 0;
			var max: int = Music.maxPitch;
			
			for (i = 1; i < newNotes.length; i++) {
				var diff: int = newNotes[0] - newNotes[i];
				if (min < diff) min = diff;
				if (max > diff + Music.maxPitch) max = diff + Music.maxPitch;
			}
			
			for each (var oldPin: TonePin in oldPins) {
				var interval: int = oldPin.interval + oldNotes[0];
				
				if (interval < min) interval = min;
				if (interval > max) interval = max;
				if (upward) {
					for (i = interval + 1; i <= max; i++) {
						if (doc.channel == 3 || Music.scaleFlags[doc.song.scale][i%12] == true) {
							interval = i;
							break;
						}
					}
				} else {
					for (i = interval - 1; i >= min; i--) {
						if (doc.channel == 3 || Music.scaleFlags[doc.song.scale][i%12] == true) {
							interval = i;
							break;
						}
					}
				}
				interval -= newNotes[0];
				newPins.push(new TonePin(interval, oldPin.time, oldPin.volume));
			}
			
			if (newPins[0].interval != 0) throw new Error("wrong pin start interval");
			
			for (i = 1; i < newPins.length - 1; ) {
				if (newPins[i-1].interval == newPins[i].interval && 
				    newPins[i].interval == newPins[i+1].interval && 
				    newPins[i-1].volume == newPins[i].volume && 
				    newPins[i].volume == newPins[i+1].volume)
				{
					newPins.splice(i, 1);
				} else {
					i++;
				}
			}
			
			doForwards();
			didSomething();
		}
		
		protected override function doForwards(): void {
			tone.pins = newPins;
			tone.notes = newNotes;
			doc.changed();
		}
		
		protected override function doBackwards(): void {
			tone.pins = oldPins;
			tone.notes = oldNotes;
			doc.changed();
		}
	}
}