#!/bin/bash
set -e

BOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$BOOK_DIR/build/急不可耐程序员的Bevy与Rust指南.epub"

echo "=== Building mdbook ==="
mdbook build

echo ""
echo "=== Building EPUB ==="
mkdir -p "$BOOK_DIR/build"
pandoc "$BOOK_DIR/src/index.md" \
  "$BOOK_DIR/src/chapter-01.md" \
  "$BOOK_DIR/src/chapter-02.md" \
  "$BOOK_DIR/src/chapter-03.md" \
  "$BOOK_DIR/src/chapter-04.md" \
  "$BOOK_DIR/src/chapter-05.md" \
  "$BOOK_DIR/src/chapter-06.md" \
  "$BOOK_DIR/src/chapter-07.md" \
  "$BOOK_DIR/src/chapter-08.md" \
  "$BOOK_DIR/src/chapter-09.md" \
  "$BOOK_DIR/src/chapter-10.md" \
  "$BOOK_DIR/src/chapter-11.md" \
  "$BOOK_DIR/src/chapter-12.md" \
  --metadata-file="$BOOK_DIR/theme/epub-metadata.yaml" \
  --css="$BOOK_DIR/theme/epub-vars.css" \
  --css="$BOOK_DIR/theme/custom.css" \
  --resource-path="$BOOK_DIR/src:$BOOK_DIR/theme" \
  --toc --toc-depth=2 \
  -o "$OUTPUT"

echo ""
echo "✅ mdbook: build/book/index.html"
echo "✅ EPUB:  $OUTPUT"
echo "   ($(du -h "$OUTPUT" | cut -f1))"