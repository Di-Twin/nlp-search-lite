#!/usr/bin/env bash

# Setup GitHub authentication via HTTPS with token
echo "//github.com/:_authToken=$GITHUB_TOKEN" > ~/.npmrc
echo "always-auth=true" >> ~/.npmrc

# Force git to use HTTPS+token instead of SSH
git config --global url."https://$GITHUB_TOKEN@github.com/".insteadOf "git@github.com:"
git config --global url."https://$GITHUB_TOKEN@github.com/".insteadOf "ssh://git@github.com/"

# Remove old lock file and node_modules
rm -rf node_modules package-lock.json

# Install dependencies with the new configuration
# Use --no-save flag to avoid modifying package.json
npm install --no-package-lock

# Generate a clean package-lock.json with HTTPS URLs
npm install --package-lock-only

# Now install everything from the clean package-lock.json
npm ci

# Run your update scripts (optional, as npm ci should install everything correctly)
# npm run update-all