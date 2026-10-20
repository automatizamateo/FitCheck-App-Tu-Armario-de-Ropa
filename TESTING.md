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
