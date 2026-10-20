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
