#!/usr/bin/env bash

# Force npm to use HTTPS + token for GitHub
echo "//github.com/:_authToken=$GITHUB_TOKEN" > ~/.npmrc
echo "always-auth=true" >> ~/.npmrc

# Block SSH fallback
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
git config --global url."https://github.com/".insteadOf "git@github.com:"

# Install
npm install

npm run update-all
