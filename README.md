# JYU Room Gazer 🏫 🔍

Check available rooms at the University of Jyväskylä.

## Features ✨

- 🗺️ Browse rooms by campus and building
- 📅 Check all building rooms availability for a specific date and time
- 🔍 Search rooms by name or type
- 📍 View building location on map

## How to Use 🚀

1. Select a campus (optional) and building
2. Choose date, time and duration
3. Click "Check Availability" to see which rooms are free
4. Click "Reserve" to book a room through JYU's calendar system

## Development Setup 🛠️

1. Install dependencies:

```bash
npm install
```

2. Build CSS:

```bash
# For development
npm run build

# For production (minified)
npx tailwindcss -i ./input.css -o ./styles.css --minify
```

3. Make changes to `input.css` for custom styles
4. Always rebuild CSS after making changes to Tailwind classes in HTML or custom styles

## Project Structure 📁

- `index.html` - Main HTML file
- `app.js` - Application logic
- `input.css` - Source CSS file with Tailwind directives and custom styles
- `styles.css` - Generated CSS file (don't edit directly)

## Credits 📝

Uses data from:

- JYU Navi (https://navi.jyu.fi/)
- JYU Room Reservation System (https://kovs-calendar.app.jyu.fi/)

Built with HTML, JavaScript and Tailwind CSS 💙
