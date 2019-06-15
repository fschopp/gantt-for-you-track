#!/bin/bash

# -----------------------------------------------------------------------------
# Replaces the 'gh-pages' branch
#
# This script is meant to be run from the project root directory.
#
# Usage:
# src/scripts/gh_pages.sh
# -----------------------------------------------------------------------------

set -e # Fail on error
set -u # Fail on uninitialized

if [ ! -f package.json ]; then
    echo "Must run from root directory (containing file 'package.json')"
    exit 1
fi

revision=$(git rev-parse --short=7 HEAD)
if ! git diff-index --quiet HEAD -- ; then
    revision="${revision} (uncommitted changes)"
fi

echo "Will commit to branch 'gh-pages'..."

localrepo=$(pwd)
email=$(git config user.email)
name=$(git config user.name)

# Create a new git repository for later force-push to gh-pages branch
mkdir -p target/gh-pages
cd target/gh-pages
git init
git checkout -b gh-pages
git config --local user.email "${email}"
git config --local user.name "${name}"

# Tell GitHub not to run the page through Jekyll
touch .nojekyll

# Copy contents of the target directories that we want to publish on gh-pages
cp -Rf "${localrepo}/target/site/" .
cp -Rf "${localrepo}/target/doc" .
mkdir coverage
cp -Rf "${localrepo}/target/coverage/lcov-report/" coverage/

# Add site and commit
git add --force --all
git commit -m "Site for revision ${revision}"
git push "${localrepo}" +gh-pages

echo "Successfully replaced branch 'gh-pages'."
