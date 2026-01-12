# The Rust Book: AI Coding Agent Instructions

## Project Overview

This is an **experimental fork** of "The Rust Programming Language" book, adding interactive features like quizzes and highlighting. It's maintained by the Cognitive Engineering Lab at <https://rust-book.cs.brown.edu/>. The codebase combines:
- mdBook-based book content ([src/](../src/))
- Custom mdBook preprocessors ([packages/](../packages/))
- JavaScript/TypeScript interactive extensions ([js-extensions/](../js-extensions/))
- Hundreds of Rust code examples ([listings/](../listings/))

## Critical Build Dependencies

This project requires **specific versions** of tools that aren't managed by standard Rust toolchains:

```bash
# Required external tools (check .github/workflows/main.yml for current versions)
mdbook --version              # Currently 0.4.51
mdbook-quiz --version         # Currently 0.4.0  
mdbook-aquascope --version    # Currently 0.3.8
pnpm --version                # Node package manager
```

**Before building:** Always check [.github/workflows/main.yml](workflows/main.yml) for exact versions used in CI. Version mismatches cause silent rendering failures.

## Building the Book

### Fastest path (recommended)
```bash
cargo make build  # requires cargo-make
```

### Manual build (when debugging)
```bash
# 1. Install local mdbook preprocessors
cargo install --locked --path packages/mdbook-trpl-listing
cargo install --locked --path packages/mdbook-trpl-note

# 2. Build JavaScript extensions (must happen first)
cd js-extensions
pnpm init-repo  # installs deps + builds all packages
cd ..

# 3. Build the book
mdbook build

# Output: book/index.html
```

### Live development
```bash
cargo make watch  # runs mdbook serve + pnpm watch in parallel
```

## Architecture & Component Interactions

### Content Flow Pipeline
```
Markdown source (src/*.md) 
  → mdbook-trpl-note (converts >Note: to <section class="note">)
  → mdbook-trpl-listing (adds file names to code blocks)
  → mdbook-quiz (embeds interactive quizzes from quizzes/*.toml)
  → mdbook-aquascope (ownership visualization)
  → HTML output (book/)
  → JS extensions inject at runtime (feedback, telemetry, consent-form)
```

**Key insight:** Preprocessors run in the order defined in [book.toml](../book.toml). The `trpl-note` and `trpl-listing` preprocessors transform Markdown → HTML before mdBook's renderer sees it.

### Custom Markdown Extensions

**Note sections** - Transform blockquotes starting with "Note:" into semantic HTML:
```markdown
> Note: This is important information.
```
Becomes `<section class="note" aria-role="note">...</section>` via `mdbook-trpl-note`.

**Code listings** - Automatically add filename headers:
```markdown
<span class="filename">Filename: src/main.rs</span>

\`\`\`rust
fn main() { }
\`\`\`
```
The `mdbook-trpl-listing` preprocessor handles this transformation.

**Quizzes** - Embed interactive quizzes using TOML definitions:
```markdown
{{#quiz ../quizzes/ch03-01-variables-and-mutability-sec1-variables.toml}}
```

### JavaScript Extensions Structure

Located in [js-extensions/packages/](../js-extensions/packages/):
- **feedback/** - User feedback widgets
- **telemetry/** - Analytics tracking
- **consent-form/** - GDPR/privacy consent management

Built as separate pnpm packages with shared TypeScript config. Each builds to `dist/index.js` + `dist/index.css`, referenced in [book.toml](../book.toml)'s `additional-js` and `additional-css`.

## Code Examples Management

### Listings Directory Structure
All code examples live in `listings/chXX-topic-name/listing-XX-YY/`:
- Each listing is a complete, **buildable** Rust project
- Uses edition = "2024" (see [listings/ch02-guessing-game-tutorial/listing-02-01/Cargo.toml](../listings/ch02-guessing-game-tutorial/listing-02-01/Cargo.toml))
- Examples must compile successfully (verified in CI)

### Testing Code Examples
```bash
cd packages/trpl
mdbook test --library-path packages/trpl/target/debug/deps
```

This runs doctests on code blocks embedded in the book content. Failure = outdated examples or broken Markdown.

## Style & Formatting Conventions

### Prose Style ([style-guide.md](../style-guide.md))
- **Title case** for headings: `## Generating a Secret Number`
- **Italics** for terms: `is an *associated function*` (not 'associated function')
- **No parentheses** when mentioning methods in prose: `read_line` not `read_line()`
- **Hard wrap at 80 characters**
- Avoid mixing code/non-code: ``Remember when we wrote `use std::io`?`` ✓ vs. ``Remember when we `use`d `std::io`?`` ✗

### Code Formatting
- Rust code: `rustfmt` (auto-installed with Rust toolchain)
- Markdown/other: `dprint` (install via `cargo install dprint`)
- Apply both before committing

## Testing & CI Workflow

The CI pipeline ([.github/workflows/main.yml](workflows/main.yml)) runs:
1. **Rust tests** - `cargo test` for tools/mdbook-trpl packages
2. **Book build** - Full mdbook build with all preprocessors
3. **Spellcheck** - `ci/spellcheck.sh` against `ci/dictionary.txt`
4. **Shellcheck** - Validates all shell scripts
5. **Local path lint** - Ensures no hardcoded file paths leak into content

**Adding words to dictionary:** Append to [ci/dictionary.txt](../ci/dictionary.txt) in sorted order (e.g., `BTreeMap`, `rustc`).

## Contribution Constraints

**This is a print book** - Changes face high friction:
- Synced with No Starch Press print editions
- Content snapshots in [nostarch/](../nostarch/) - **DO NOT edit these files**
- Major revisions align with Rust Editions (multi-year cycles)
- Between editions: only error corrections accepted

**Workflow:** Edit files in [src/](../src/), never in [nostarch/](../nostarch/).

## Common Development Tasks

### Adding a new chapter quiz
1. Create `quizzes/chXX-YY-section-name.toml`
2. Follow format from [quizzes/example-quiz.toml](../quizzes/example-quiz.toml)
3. Embed in chapter: `{{#quiz ../quizzes/chXX-YY-section-name.toml}}`
4. Test: `cargo make build && open book/chXX-YY-section-name.html`

### Updating a code listing
1. Edit in `listings/chXX-topic/listing-XX-YY/`
2. Verify it builds: `cd listings/chXX-topic/listing-XX-YY && cargo build`
3. Update corresponding content in `src/chXX-YY-section.md`
4. Run `mdbook test` to verify inline code still works

### Debugging preprocessor issues
```bash
# Test individual preprocessors
mdbook-trpl-note supports html
mdbook-trpl-listing supports html

# View preprocessor output
mdbook build --verbose
```

## File Locations Quick Reference

- **Book content:** [src/](../src/)
- **Quiz definitions:** [quizzes/](../quizzes/)
- **Code examples:** [listings/](../listings/)
- **Custom preprocessors:** [packages/mdbook-trpl-listing/](../packages/mdbook-trpl-listing/), [packages/mdbook-trpl-note/](../packages/mdbook-trpl-note/)
- **Interactive features:** [js-extensions/packages/](../js-extensions/packages/)
- **Build config:** [book.toml](../book.toml), [Makefile.toml](../Makefile.toml)
- **CI configuration:** [.github/workflows/main.yml](workflows/main.yml)
