# Play in range

Repeats a part of a lesson, such as one sentence or a question and its answer, over and over. It works the same in the audio and video players, because both use `PlayerLayout`.

## How it works for the user

**Turning it on.** Tap **Range** in the menu under the controls. The button turns blue, and the range starts as the **highlighted subtitle line**:

| Where playback is | The range |
| --- | --- |
| On a line | That line, from its start to its end |
| Before the first line (intro) | The first line |
| In a gap between lines | The line still highlighted, i.e. the previous one |
| After the last line | The last line |
| No subtitles (an empty transcript, or it failed to load) | **The current time to 10 s later**, capped at the lesson end, with the toast "No subtitles here. Use ◎ to set Start and End." With under 0.5 s left, it uses the last 10 s instead. |

**When the button is grayed out.** Range is disabled until the media is loaded and the transcript has finished loading, so it never picks the wrong line.

**Start and End controls.** While a range is on, the **±5 s buttons are replaced** by `Start: 0:12 ◎` and `End: 0:18 ◎`, on either side of Play.
- **◎ Start** moves Start to the current playback time, rounded to 0.1 s.
- **◎ End** moves End to the current time, then jumps back to Start so you hear the new loop right away.
- **Order is never blocked.** Setting Start at or after End moves End to the end of the lesson ("End moved to the end of the lesson."). Setting End at or before Start moves Start to 0:00 ("Start moved to the beginning."). A range is at least 0.5 s long.

**Long-press a subtitle line** to stretch the range to include it. Start becomes the earlier of the two starts, and End the later of the two ends. A normal tap still seeks. TalkBack users get this as the line action "Add to repeat range".

**Which lines are marked.** Lines that overlap the range are indented, with a 3 pt blue (`#0A84FF`) line in the gap on the left. The text keeps its usual colors. (The line must stay inside the transcript's ScrollView: an earlier version used a negative margin, and Android clipped it.)

**Looping.** When playback runs across End from inside the range, it jumps back to Start and keeps playing.
- **Seeking past End, or before Start, doesn't loop or clear the range.** That's how you find a new point for ◎: drag the seek bar past End, play, and tap End ◎ at the right moment.
- **Play while paused at, or up to 0.5 s after, End** starts the range again.

**Turning it off.** Tap **Range** again. The ±5 s buttons return and playback continues normally.

**Not saved.** The range isn't remembered; closing the player clears it.

**Hidden answers** stay blurred on every loop, so you can keep trying to answer.

## Where the code lives

| File | What it does |
| --- | --- |
| `src/hooks/usePlayRange.ts` (new) | `usePlayRange({ currentTime, playing, onSeek })` keeps `range` and runs the loop. Pure helpers: `lineEnd`, `rangeForLine`, `initialRange`, `rangeWithoutLines`, `extendRange`, `withStart`, `withEnd`. |
| `src/components/player/PlayerLayout.tsx` | The Range menu button, the `RangeEnd` controls in place of ±5 s, toasts, and Play restarting the range. |
| `src/components/Transcript.tsx` | `range` and `onLineLongPress` props, `lineInRange`, the blue left line, and the accessibility action. |
| `src/components/Icon.tsx` | `repeat` and `setPoint` (◎, Material `radio_button_checked`). |

**How the loop is detected.** It's a natural crossing, not a jump. Between two time updates:
- the previous time was before End;
- the new time is within 0.05 s of End, or past it;
- the step is under 1.5 s.

A seek is a bigger step, so it doesn't count. After jumping back, ticks are ignored until the time is below End again, so it never seeks twice.

**Lines with broken timing.** A line whose end isn't after its start ends where the next line starts, or at the lesson end.

## Known limitations

- **It can overshoot End a little.** Time updates arrive every 250 ms, so playback can run up to about 0.25 s past End before jumping back.
- **Locked screen.** The loop runs in JavaScript on time updates. Whether it keeps looping with the screen locked hasn't been tested on a phone yet; if Android throttles JS, a loop may be late or missed.
