# Deprecated: use `npm run build:single` (Node, no Python needed).
import subprocess, sys
sys.exit(subprocess.call(['node', 'scripts/build.mjs', '--single']))
