# byte-mcp-server — stdio MCP server for the Byte Protocol.
# Used by Glama (https://glama.ai/mcp/servers) to introspect available tools.
#
# Build:  docker build -t byte-mcp-server .
# Run:    docker run -i --rm byte-mcp-server   # stdio — pipe MCP messages on stdin

FROM node:20-alpine

WORKDIR /app

# Copy the lockfile too so the build is REPRODUCIBLE. `npm ci` installs the exact
# locked versions (and fails loudly if package.json/lock drift) instead of re-resolving
# `^` ranges against live npm on every rebuild — so an upstream publish can't silently
# break a future Glama re-inspection. --ignore-scripts is safe (no native postinstall
# needed); --omit=dev drops typescript/@types (dist/ is prebuilt + committed).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# dist/ is the compiled output checked into the repo (see package.json "main").
COPY dist/ ./dist/

# Stdio MCP — no port to expose. The container runs as long as stdin is open.
ENTRYPOINT ["node", "dist/index.js"]
