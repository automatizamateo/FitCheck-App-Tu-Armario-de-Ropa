# Manual iPhone test checklist

Run on a real iPhone (iOS 16.4 or later) against the GitHub Pages URL. Later phases add more items to this list.

## Phase 1 — Foundation

### Install
- [ ] Opening the URL in Safari for the first time shows the Welcome screen.
- [ ] The "Add to Home Screen" step shows Share → Add to Home Screen instructions.
- [ ] After **Share → Add to Home Screen**, the icon (hanger on a warm beige background) and the name **FitCheck** appear on the Home Screen.
- [ ] Launching from the Home Screen opens full screen, with no Safari address bar.
- [ ] Inside the installed app, the install step and the Settings row show "Installed" / "Yes".
- [ ] The install banner does not appear in the installed app. In Safari it appears and can be hidden for the session.

### Onboarding
- [ ] All 5 steps are reachable with Continue and Back, and the progress dots update.
- [ ] **Finish setup** leads to the Wardrobe tab.
- [ ] Closing and reopening the app skips onboarding.

### Navigation and layout
- [ ] All 5 tabs open: Wardrobe, Outfits, Calendar, Insights, Settings.
- [ ] Nothing hides behind the notch / Dynamic Island or the home indicator.
- [ ] The "+" button appears on Wardrobe and Outfits only.
- [ ] Category chips (Wardrobe) and style chips (Outfits) scroll sideways and can be selected.
- [ ] Dark mode follows the system setting (Control Center → toggle Dark Mode).

### Data persistence
- [ ] In Settings, change "Unused after" and toggle "Keep original photos", then force-quit the app (swipe up) and reopen. The values are kept.
- [ ] Settings → Persistent storage shows **On** (iOS usually grants this to Home Screen apps).

### Offline
- [ ] With the app opened at least once online, turn on **Airplane Mode**, force-quit the app and reopen it. It loads and all tabs work.
- [ ] Turn Airplane Mode off.

### Updates
- [ ] After a new deploy, the app updates within one or two launches.

## Phase 2 spike — segmentation lab

Open it with **Settings → tap the version line at the bottom 5 times**. Use a full-body photo of a person on a plain background.

For each combination, write down the load time, the time for the first "Segment" run and the "Run 5×" times, whether it crashed, and how good the masks look:

| Model | Device | Precision |
| --- | --- | --- |
| B2 | auto (should pick webgpu) | fp16 |
| B2 | wasm | q8 |
| B0 | webgpu | fp16 |
| B0 | wasm | q8 |

- [ ] The download progress bar shows MB, and the second load of the same model is fast because it comes from the cache.
- [ ] "Model cache" lists the model `.onnx` and `ort-wasm-simd-threaded*.wasm`.
- [ ] **Offline:** with a model downloaded, turn on Airplane Mode, force-quit the app, reopen it, open the lab, then load the same model and segment. It works.
- [ ] **Memory:** run "Run 5×" three times in a row with B2 on each device. If the app reloads by itself, a red notice appears at the top of the lab next time.
- [ ] Check the "classes" and "cutout" views: does the person cut-out look clean? Are T-shirt, pants and shoes labelled correctly?

## Phase 2 — Base model & capture

Before you start: update the installed app (open it twice, or delete it and re-add it to the Home Screen). Use Wi-Fi, because the first photo downloads about 70–125 MB of AI models once. Wear tight thermals and stand against a plain wall.

### Create the base model
- [ ] Wardrobe shows a "Create your base model" card. Settings → Base model shows "Create base model".
- [ ] The tips screen shows the photo tips and "One-time download, about N MB".
- [ ] The camera opens on the **rear** camera inside the installed app, and iOS asks for permission. "Switch camera" toggles front/rear, and the front preview is mirrored.
- [ ] A dashed body outline shows for the first photo of each view.
- [ ] The self-timer cycles Off / 3s / 5s / 10s and stays as you set it. The countdown shows big numbers, beeps each second (if the ringer is on) and buzzes on iOS 18+. Tapping the shutter during the countdown cancels it.
- [ ] Processing shows three steps in this order: Removing background, Detecting pose, Refining edges (shown as off on iPhone by default). The first time, it shows download progress in MB.
- [ ] **Write down:** how long the first photo took, including downloads, and how long the 2nd and 3rd took. Then check Settings → Advanced → AI processing → "Last used" (model · gpu/wasm · precision) and the "Refine edges" time.
- [ ] Review: the cut-out looks right (shoulders, arms, between the legs, feet). Use "Pose" to check the skeleton matches your body.
- [ ] Brush: Add / Erase, size slider, **one finger paints, two fingers pinch-zoom and pan without painting**, double-tap resets the view, and Undo / Redo work for 20+ steps. The page never scrolls, bounces, zooms or shows the callout or text selection.
- [ ] Preview shows the checkerboard with Sharp / Soft / Softer edges.
- [ ] Side and back follow automatically (2 of 3, 3 of 3). Choosing a photo from Library also works.
- [ ] Coming from onboarding, finishing takes you to Wardrobe.

### Robustness
- [ ] **Resume:** after confirming the front view, force-quit the app. Reopen it and choose Create base model: it continues at "1 of 3 done".
- [ ] **Retake:** Settings → Base model → Retake side shows the re-alignment warning. The camera shows your previous side cut-out as a faint overlay. After confirming, only that thumbnail changes.
- [ ] **Offline:** after one full run, turn on Airplane Mode, force-quit, reopen, retake one view. Everything works with no downloads.
- [ ] **Memory:** if the app reloads by itself while processing, it opens a **recovery screen** and does not start processing by itself. The screen explains what it switched to (refine off → lighter model → CPU). "Retry with the same photo" processes the same photo again with the lighter setup. Report what the screen said, and copy Settings → Advanced → Debug log.
- [ ] **Refine edges opt-in (iPhone):** in Settings → Advanced, Refine edges says "Auto: off on iPhone and iPad". Choosing "On (may crash)" shows a warning. With it on, processing goes Removing background ✓ → Detecting pose ✓ → Refining edges. If refining fails or takes over 15 s, the review screen still opens with the basic cut-out and a note. If the app gets killed instead, the recovery screen appears and Refine edges is back to Off.
- [ ] **Debug log:** Settings → Advanced → Debug log lists `launch`, `pipeline start`, then `▶`/`✓` lines with ms for each step. Copy works.
- [ ] **One model at a time:** in the debug log, `segment.unloaded` appears before `▶ pose.load`, and `pose.unloaded` after pose. The `[w…]` count is `w0` or `w1`, never higher.
- [ ] **Safe iOS start:** after Reset to automatic (or on a fresh install), the first photo's `pipeline start` line shows `segformer_b0_clothes`, `wasm`, `q8`. After one photo finishes, the next capture session shows `segformer_b2_clothes`, still `wasm`.
- [ ] **Pose fallback:** if pose fails or times out, the review screen still opens with the cut-out and a "line clothes up by hand" note. After two app kills during pose, the recovery screen says pose detection is off, and Settings → Advanced → Detect pose shows Off.
- [ ] Settings → Advanced: switch Background model to B0, or Processor to CPU, and retake a view. It still works, and "Last used" reflects the choice. "Reset to automatic" restores Auto.

### Report back
For each of the 3 views: total seconds, gpu/wasm, refine time, and anything wrong with the cut-out or the gestures.

## Phase 3A — Add item

Before you start: update the app (open it twice). Your base model must exist. Stand in the same spot as for your base model, wearing the item.

### Flow and speed
- [ ] Wardrobe → **+** opens "What are you adding?" with 9 categories. Accessories asks for Cap / Hat, Necklace, Scarf, or Other (with an optional label).
- [ ] The camera shows your **base model** for that view as a faint overlay, says "<Item> · 1 of 3", and has the self-timer, Library and **Skip <view> view**.
- [ ] After processing: review (brush) → **Fit** screen → next view → **Details** → **Save item** → "Saved …" with the garment on your base model → **Add another** goes back to the categories with the last one highlighted.

### Per category (SPEC acceptance: T-shirt, pants, shoes, socks, necklace)
For each one, note whether the cut-out was found automatically, how much brushing it needed, and whether the fit was right before you touched it:
- [ ] **T-shirt:** "Finding the t-shirt" runs, and review shows only the shirt (not arms or face).
- [ ] **Pants:** only the pants. **Shorts** too, if you have some.
- [ ] **Shoes:** both shoes.
- [ ] **Socks** and **Necklace:** no "Finding…" step. Review opens in **Add** mode with a hint; paint the item (pinch to zoom for the necklace chain).
- [ ] **Cap / Hat** or **Scarf**, if you have one.

### Fit on the base model
- [ ] With your pose visible, the garment lands roughly in the right place (shoulders, waist, feet, neck).
- [ ] One finger drags it, two fingers scale and twist it. **Reset** goes back to the automatic fit, and **See-through** shows your base model through it.
- [ ] Cover your shoulders/legs, or use a photo without a person (e.g. the item on a hanger from Library): it says "placed by body area" and puts it in a sensible region.

### Saving, colors, missing views
- [ ] Details: the name is pre-filled (e.g. "Navy T-Shirt") and the color swatches are pre-selected; both are editable. Styles, seasons, brand, notes and favorite work.
- [ ] Skip side and back on one item: Details shows **Missing side, back view**, and it saves.
- [ ] Skipping all three views goes back to the camera with "Add at least one view".

### Robustness
- [ ] **Resume:** after fitting the front view, force-quit. Wardrobe → + offers **Continue your …?**, and Continue goes to the side view.
- [ ] **Debug log** (Settings → Advanced): the item photo shows `pipeline start {"flow":"item",…}`. Socks and necklaces show `"model":"none (brush only)"`, and you see `item front aligned by pose` (or `body area`).
- [ ] If the app reloads by itself while processing an item, the recovery screen appears inside Add item (not the base model), and **Retry** works.
- [ ] **Offline:** in Airplane Mode, add an item. Everything works.

### Report back
For each test item: category, how long processing took, whether it was found automatically, whether the auto fit was right, and approximate brushing/adjusting needed.

