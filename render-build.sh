#!/usr/bin/env bash

# Add GitHub token for private package access
echo "//github.com/:_authToken=$GITHUB_TOKEN" > ~/.npmrc
echo "always-auth=true" >> ~/.npmrc

# Rewrite SSH to HTTPS for any Git operations
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
git config --global url."https://github.com/".insteadOf "git@github.com:"

# Remove old SSH cache
rm -f ~/.ssh/known_hosts

# Install dependencies
npm install

# (Optional) Update from git source
npm run update-config
