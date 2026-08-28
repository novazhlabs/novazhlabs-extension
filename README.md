# NovazhLabs New Tab

A premium Chrome new tab replacement with glassmorphism UI, live video wallpapers, smart search, and customizable shortcuts.

## Features

- **Live Video Wallpapers** — Set animated video backgrounds with loop, sound, and pause-when-inactive controls
- **Glassmorphism UI** — Frosted glass panels with blur effects and smooth animations
- **Smart Search** — Google/Bing/DuckDuckGo support with search history and autocomplete suggestions
- **Quick Shortcuts** — Speed-dial tiles with drag-and-drop reordering, favicon support, and customizable sizes
- **Widgets** — Clock, date, and live weather (no API key required)
- **Customization** — Font family, size, color, and theme options

## Installation

### From Chrome Web Store
Visit the Chrome Web Store listing and click "Add to Chrome".

### Developer Mode
1. Download or clone this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project folder

## Adding Custom Wallpapers

### Using the Generator Script
1. Drop image (jpg, png, gif, webp, bmp, svg) or video (mp4, webm, mov) files into `assets/wallpapers/`
2. Run the generator:
   ```bash
   node generate-wallpapers.js
   ```
   Or on Windows PowerShell:
   ```powershell
   .\generate-wallpapers.ps1
   ```
3. Reload the extension in Chrome

### Manual Method
1. Add media files to `assets/wallpapers/`
2. Edit `assets/wallpapers/index.json` to include your files:
   ```json
   {
     "wallpapers": [
       { "file": "my-video.mp4", "name": "My Wallpaper" }
     ]
   }
   ```
3. Reload the extension

## Permissions

This extension requests the following permissions:
- **storage** — Save your settings and wallpaper preferences
- **bookmarks** — Show your bookmarks in the new tab
- **topSites** — Display your frequently visited sites

## Privacy

- No data is collected or sent to external servers
- All settings are stored locally in your browser
- Weather data uses free public APIs (wttr.in) with no tracking

## License

MIT License

## Author

NovazhLabs — [novazhlabs.ir](https://novazhlabs.ir/)
