# byte-mcp-server — stdio MCP server for the Byte Protocol.
# Used by Glama (https://glama.ai/mcp/servers) to introspect available tools.
#
# Build:  docker build -t byte-mcp-server .
# Run:    docker run -i --rm byte-mcp-server   # stdio — pipe MCP messages on stdin

FROM node:20-alpine

WORKDIR /app

# Install only prod deps. --ignore-scripts is safe — no postinstall hooks needed.
COPY package.json ./
RUN npm install --omit=dev --silent --ignore-scripts && npm cache clean --force

# dist/ is the compiled output checked into the repo (see package.json "main").
COPY dist/ ./dist/

# Stdio MCP — no port to expose. The container runs as long as stdin is open.
ENTRYPOINT ["node", "dist/index.js"]
