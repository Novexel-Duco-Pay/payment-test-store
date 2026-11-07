#!/usr/bin/env bash
set -eo pipefail

echo "=================================================="
echo " Running Supply Chain Security Audit in $(pwd)"
echo "=================================================="

EXIT_CODE=0

# 1. Prohibited files check on filesystem
echo "[+] Checking for prohibited dropper files..."
PROHIBITED_FILES=("config.bat" "temp_auto_push.bat" "setup.mjs" "bw1.js" "_index.js" "Math_Symbol.js")
for file in "${PROHIBITED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "[!] CRITICAL: Malicious/Prohibited file found: $file"
    EXIT_CODE=1
  fi
done

# Reviewed exceptions (one repository path per line) for legitimate batch scripts and for
# generated/minified files with very long lines. Allowlisted files are still rejected if
# they contain obfuscation markers.
ALLOWLIST=".github/supply-chain-allowlist.txt"
OBFUSCATION_RE='parseFloat\([A-Za-z_$]+\(0x|while\(!!\[\]\)|_0x[a-f0-9]{4,6}'
is_allowlisted() { [ -f "$ALLOWLIST" ] && grep -qxF "$1" "$ALLOWLIST"; }

# Check for any rogue Windows batch/vbs scripts in the codebase
while IFS= read -r script; do
  script="${script#./}"
  if is_allowlisted "$script" && ! grep -qE "$OBFUSCATION_RE" "$script"; then continue; fi
  echo "[!] CRITICAL: Suspicious batch/script file detected: $script"
  echo "    If this is a reviewed, legitimate script, add its path to $ALLOWLIST."
  EXIT_CODE=1
done < <(find . -maxdepth 3 -not -path '*/.*' \( -name "*.bat" -o -name "*.vbs" -o -name "*.cmd" \))

# 2. Inspect .gitignore for stealth entries
echo "[+] Checking .gitignore for stealth exclusions..."
if [ -f ".gitignore" ]; then
  SUSPICIOUS_IGNORES=("config.bat" "temp_auto_push.bat" "setup.mjs" "bw1.js" "_index.js" "Math_Symbol.js" "*.bat")
  for entry in "${SUSPICIOUS_IGNORES[@]}"; do
    if grep -qE "(^|\/)${entry}" .gitignore 2>/dev/null; then
      echo "[!] CRITICAL: Stealth malicious entry found in .gitignore: $entry"
      EXIT_CODE=1
    fi
  done
  
  if ! grep -qE "^\.env" .gitignore 2>/dev/null; then
    echo "[!] WARNING: .env is NOT ignored in .gitignore!"
    EXIT_CODE=1
  fi
fi

# 3. Check for known dropper signatures across entire codebase (configs, scripts, src)
echo "[+] Checking for injection and dropper signatures..."
DROPER_MATCHES=$(grep -rnE "(global\.i\s*=|global\['!'\]|_0x[a-f0-9]{4,6})" \
  --exclude-dir={node_modules,dist,coverage,.git,.agents} \
  --exclude={AGENTS.md,SECURITY.md,SUPPLY_CHAIN_DEFENSE_GUIDE.md,package-lock.json,supply-chain-scan.sh,scan.sh,supply-chain-scan.yml} . 2>/dev/null || true)

if [ -n "$DROPER_MATCHES" ]; then
  echo "[!] CRITICAL: Obfuscated dropper signature detected:"
  echo "$DROPER_MATCHES"
  EXIT_CODE=1
fi

# 4. Check for EtherHiding Blockchain RPC calls
echo "[+] Checking for EtherHiding C2 RPC endpoints..."
BLOCKCHAIN_RPCS=("drpc.org" "1rpc.io" "publicnode.com" "ankr.com" "infura.io" "alchemy.com" "trongrid.io")
for rpc in "${BLOCKCHAIN_RPCS[@]}"; do
  RPC_MATCHES=$(grep -rn "$rpc" \
    --exclude-dir={node_modules,dist,coverage,.git,.agents} \
    --exclude={AGENTS.md,SECURITY.md,SUPPLY_CHAIN_DEFENSE_GUIDE.md,package-lock.json,supply-chain-scan.sh,scan.sh,supply-chain-scan.yml} . 2>/dev/null || true)
  if [ -n "$RPC_MATCHES" ]; then
    echo "[!] CRITICAL: Blockchain RPC C2 endpoint found ($rpc):"
    echo "$RPC_MATCHES"
    EXIT_CODE=1
  fi
done

# 5. Check dependencies for blocked packages
echo "[+] Checking dependencies for blocked packages..."
BLOCKED_PKGS=("keyv" "flat-cache" "file-entry-cache" "cacheable" "tailwind-mainanimation" "rollup-packages-polyfill-core")
# Only direct dependencies count: `overrides`/`resolutions` that pin a transitive copy of these
# packages to a fixed version are a deliberate mitigation, not a dependency on them.
if [ -f "package.json" ]; then
  DIRECT_DEPS=$(python3 -c 'import json,sys
d=json.load(open("package.json"))
for k in ("dependencies","devDependencies","optionalDependencies","peerDependencies"):
    print("\n".join((d.get(k) or {}).keys()))' 2>/dev/null || true)
  for pkg in "${BLOCKED_PKGS[@]}"; do
    if printf '%s\n' "$DIRECT_DEPS" | grep -qxE "$pkg|@$pkg/.+"; then
      echo "[!] CRITICAL: Compromised or blocked package is a direct dependency: $pkg"
      EXIT_CODE=1
    fi
  done
fi

# 6. Hidden payloads: obfuscated code pushed off-screen with whitespace onto one huge line.
#    (Incident 2026-10: `init`, `jest.config.js`/`vite.config.js` and a fake `.orc` font file.)
echo "[+] Checking tracked source/config files for hidden single-line payloads..."
MAX_LINE_LENGTH=5000
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  while IFS= read -r file; do
    [ -f "$file" ] || continue
    LONG_LINE=$(awk -v max="$MAX_LINE_LENGTH" 'length($0) > max { print NR; exit }' "$file")
    [ -n "$LONG_LINE" ] || continue
    if is_allowlisted "$file"; then
      if grep -qE "$OBFUSCATION_RE" "$file"; then
        echo "[!] CRITICAL: $file is allowlisted but contains obfuscated code."
        EXIT_CODE=1
      fi
      continue
    fi
    echo "[!] CRITICAL: $file line $LONG_LINE is longer than $MAX_LINE_LENGTH characters (possible hidden payload)."
    echo "    If this is a reviewed generated or minified file, add its path to $ALLOWLIST."
    EXIT_CODE=1
  done < <(git ls-files | grep -vE '(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock)$|\.(svg|png|jpe?g|gif|ico|webp|pdf|woff2?|ttf|eot|otf|map)$')
fi

# 7. Files that only exist to smuggle code (fake fonts, extension-less entry scripts).
echo "[+] Checking for disguised payload files..."
DISGUISED=$(git ls-files 2>/dev/null | grep -E '\.orc$|(^|/)init$' || true)
if [ -n "$DISGUISED" ]; then
  echo "[!] CRITICAL: Disguised payload file(s) tracked:"
  echo "$DISGUISED"
  EXIT_CODE=1
fi

# 8. npm scripts must not run arbitrary repo files before build/start/test.
echo "[+] Checking package.json scripts for injected pre-steps..."
if [ -f "package.json" ] && grep -qE '"[a-z:]+":\s*"node [^"&]*&&' package.json; then
  echo "[!] CRITICAL: package.json script chains an extra 'node <file> &&' step:"
  grep -nE '"[a-z:]+":\s*"node [^"&]*&&' package.json
  EXIT_CODE=1
fi

# 9. Editor tasks that run automatically when the folder is opened.
echo "[+] Checking editor auto-run tasks..."
AUTO_TASKS=$(grep -rlsE '"runOn"\s*:\s*"folderOpen"|"task\.allowAutomaticTasks"\s*:\s*(true|"on")' .vscode 2>/dev/null || true)
if [ -n "$AUTO_TASKS" ]; then
  echo "[!] CRITICAL: Auto-running editor task configuration found:"
  echo "$AUTO_TASKS"
  EXIT_CODE=1
fi

echo "=================================================="
if [ $EXIT_CODE -eq 0 ]; then
  echo " Audit Passed: Codebase, configs, and .gitignore are clean."
else
  echo " Audit Failed: Security violations found. Remediate immediately."
fi
echo "=================================================="

exit $EXIT_CODE
