// Global keyboard shortcuts.

/** Ctrl+K (Windows / Linux) or ⌘K (macOS) opens the command palette. */
export const isPaletteShortcut = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
