# To Do List

A Windows-first desktop productivity app built with Electron, React, and TypeScript.

## What It Does

- Add tasks from the main window or a compact quick-add window
- Keep the app alive in the system tray so reminders can continue in the background
- Schedule local desktop notifications for reminders
- Click a notification to bring the app forward and focus the matching task
- Edit task details, snooze reminders, and mark tasks complete
- Persist tasks locally with `electron-store`

## Development

```bash
npm install
npm start
```

## Checks

```bash
npm run lint
npm run package
npm run make
```

## Build Output

Windows packaging artifacts are written to:

```text
out/make
```
