#!/bin/sh
# Runs the engine checks with macOS's built-in JavaScriptCore (no Node needed).
cd "$(dirname "$0")"
JSC=${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc}
"$JSC" tests/checks.js
