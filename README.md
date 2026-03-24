# JS ObjEx (Object Expander)

Dynamically expands JS/TS objects in VS Code for maximum readability. Context-aware, MongoDB-optimized, no static printWidth.

<video autoplay muted>
  <source src="./demo.mp4" type="video/mp4">
</video>

Simple nested objects stay on one line. Complex ones get expanded. You decide what "complex" means.

---

## ✨ Features

- **Smart expansion**: objects/arrays expand based on how complex they actually are, not just blindly
- **Context-aware**: respects your editor's ruler, word wrap column, and indentation style (tabs or spaces)
- **Works with** JavaScript, TypeScript, JSX, TSX, JSON, and JSONC
- **Toggle with one key**: expand, collapse, or toggle any object at your cursor
- **Format on save**: optionally auto-expand complex objects every time you save
- **Right-click menu**: all commands available from the editor context menu


---

## Commands

| Command | Shortcut | What it does |
|---|---|---|
| **Smart Expand** | `Ctrl+Shift+E` | Expands the object/array at your cursor |
| **Smart Collapse** | `Ctrl+Shift+C` | Collapses it back to one line |
| **Toggle** | `Ctrl+Shift+T` | Expands if collapsed, collapses if expanded |

> **Mac users:** Replace `Ctrl` with `Cmd`.

You can also find all three commands in the right-click context menu when editing JS/TS/JSON files.

---

## ⚙️ Settings

Open your settings (`Ctrl+,`) and search for "JS ObjEx", or add these directly to your `settings.json`:

| Setting | Default | Description |
|---|---|---|
| `jsObjectExpander.complexityThreshold` | `40` | How complex an object needs to be before it gets expanded. Lower = more aggressive. |
| `jsObjectExpander.trailingCommas` | `"always"` | `"always"` adds trailing commas, `"never"` removes them, `"preserve"` leaves them as-is. |
| `jsObjectExpander.maxExpandDepth` | `10` | How deep into nested objects to go when expanding recursively. |
| `jsObjectExpander.collapseOnSingleProperty` | `true` | Keep `{ singleKey: value }` on one line inside bigger objects. |
| `jsObjectExpander.formatOnSave` | `false` | Auto-expand complex objects whenever you save. |

---

## 💡 How It Works (the short version)

1. **Find the object**: locates the `{ }` or `[ ]` enclosing your cursor, correctly skipping over strings, comments, and template literals
2. **Score its complexity**: a quick heuristic based on length, number of entries, and nesting depth
3. **Decide what to expand**: each nested structure is expanded only if it's complex enough, keeping simple sub-objects inline so your code stays readable
4. **Respect your setup**: uses your editor's tab size, indent style, and column ruler to format everything properly

---

## Installation

### From the VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "JS ObjEx"
4. Click Install

**Alternatively**

### From Source

```bash
git clone https://github.com/yourusername/js-object-expander.git
cd js-object-expander
npm install
npm run compile
vsce package
# Then install the .vsix file manually
```

---

## 🚀 Usage Examples

### Example 1: MongoDB Query with Nested Objects

**Before:**
```javascript
db.users.insertOne({ _id: 101, name: "Ali", contact: { email: "ali@example.com", phone: "0123456789" }, address: { city: "Alexandria", zip: 21500 }, roles: ["admin", "editor"], active: true });
```

Place your cursor anywhere inside the outer `{ }` and press `Ctrl+Shift+E`:

**After:**
```javascript
db.users.insertOne({
  _id: 101,
  name: "Ali",
  contact: { email: "ali@example.com", phone: "0123456789" },
  address: { city: "Alexandria", zip: 21500 },
  roles: ["admin", "editor"],
  active: true,
});
```

Notice that simple nested objects like `contact` and `address` stay inline because they fit comfortably on one line.

### Example 2: Array of Objects with Varying Complexity

**Before:**
```javascript
const users = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob", meta: { role: "admin", permissions: ["read", "write", "delete"], lastLogin: "2024-03-15", department: "Engineering" } }, { id: 3, name: "Charlie" }];
```

Press `Ctrl+Shift+E` with cursor inside the array:

**After:**
```javascript
const users = [
  { id: 1, name: "Alice" },
  {
    id: 2,
    name: "Bob",
    meta: {
      role: "admin",
      permissions: ["read", "write", "delete"],
      lastLogin: "2024-03-15",
      department: "Engineering",
    },
  },
  { id: 3, name: "Charlie" },
];
```

Only complex entries get expanded; simple ones remain inline.

### Example 3: Toggle Between Expanded and Collapsed

```javascript
const config = { port: 3000, host: "localhost", ssl: { enabled: true, cert: "/path/to/cert", key: "/path/to/key" } };
```

Press `Ctrl+Shift+T` (Toggle):

**First toggle (expands):**
```javascript
const config = {
  port: 3000,
  host: "localhost",
  ssl: { enabled: true, cert: "/path/to/cert", key: "/path/to/key" },
};
```

Press `Ctrl+Shift+T` again (collapses):
```javascript
const config = { port: 3000, host: "localhost", ssl: { enabled: true, cert: "/path/to/cert", key: "/path/to/key" } };
```

---

## ⚙️ Extended Configuration Guide

All settings can be configured in VS Code's settings (`Ctrl+,`) or in `settings.json`:

### complexityThreshold
- **Default:** `40`
- **Type:** number
- **Range:** `0–100+`
- **Description:** Controls how aggressively the extension expands objects. Lower values expand more objects. A JSON object like `{ a: 1, b: 2 }` might score 15, while a complex MongoDB document scores 60–80.
- **Example:**
  ```json
  "jsObjectExpander.complexityThreshold": 30  // More aggressive expansion
  ```

### trailingCommas
- **Default:** `"always"`
- **Type:** string (`"always"` | `"never"` | `"preserve"`)
- **Description:** Controls trailing comma behavior in expanded output.
  - `"always"`: Adds trailing commas to match prettier configs
  - `"never"`: Removes trailing commas
  - `"preserve"`: Leaves them as they are
- **Example:**
  ```json
  "jsObjectExpander.trailingCommas": "never"
  ```

### maxExpandDepth
- **Default:** `10`
- **Type:** number
- **Description:** Maximum nesting depth to recursively expand. Prevents extremely deep expansions that may reduce readability.
- **Example:**
  ```json
  "jsObjectExpander.maxExpandDepth": 5  // Limit to 5 levels deep
  ```

### collapseOnSingleProperty
- **Default:** `true`
- **Type:** boolean
- **Description:** When `true`, objects with a single property stay on one line within larger structures (e.g., `{ role: "admin" }`). When `false`, even single-property objects get expanded if the parent is complex.
- **Example:**
  ```json
  "jsObjectExpander.collapseOnSingleProperty": false
  ```

### formatOnSave
- **Default:** `false`
- **Type:** boolean
- **Description:** When `true`, the extension automatically expands complex objects in the entire file whenever you save. Useful for enforcing consistent formatting on your team.
- **Example:**
  ```json
  "jsObjectExpander.formatOnSave": true
  ```

---

## 🐛 Known Issues

- **Large files:** Expanding objects in very large files (10k+ lines) may be slow on the first scan. Subsequent operations are faster.
- **Closure patterns:** Objects inside immediately-invoked function expressions (IIFE) may not always be detected correctly if the syntax is highly unusual.
- **Template literals with braces:** Content inside template literals is properly skipped, but extremely complex escape sequences may occasionally confuse the parser.
- **Mixed line endings:** Files with mixed `\r\n` and `\n` line endings may have formatting quirks. Use a consistent line ending throughout your file.

**Workaround:** If you encounter an issue, try:
1. Manually collapsing the object to one line first
2. Then using the expand command

---

## 🤝 Contributing

We welcome contributions! To help improve JS ObjEx:

### Getting Started with Development

1. Clone the repository
2. Run `npm install` to install dependencies
3. Open the project in VS Code
4. Press `F5` to launch the extension in debug mode

### Running Tests

```bash
npm run test
```

Tests are written with Mocha and located in `src/test/`.

### Development Workflow

- **Watch mode:** `npm run watch` — continuously rebuilds TypeScript and bundles with esbuild
- **Compile:** `npm run compile` — one-time build
- **Package:** `vsce package` — creates a `.vsix` file for local installation

### Code Style

- Use TypeScript with strict mode enabled
- Keep functions small and focused
- Comment complex logic, especially in `objectExpander.ts`
- Follow existing code patterns for consistency

### Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Write or update tests if needed
5. Commit with a clear message
6. Push to your fork
7. Open a pull request with a description of your changes

### Reporting Bugs

If you find a bug:

1. Check if it's already reported in [Issues](https://github.com/yourusername/js-object-expander/issues)
2. If not, create a new issue with:
   - A clear title
   - Steps to reproduce
   - Expected vs. actual behavior
   - Your environment (OS, VS Code version, extension version)

### Suggesting Features

Feature suggestions are welcome! Open an issue with the `enhancement` label and describe:
- The use case
- How it would improve your workflow
- Any implementation ideas (optional)

---

## 📄 License

MIT
