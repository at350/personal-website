#!/usr/bin/env bash
# Prints the tree id of the media snapshot as it currently sits in the
# working tree: src/lib/media/live.json plus everything under
# public/media/thumbs/, and nothing else.
#
# This is the one definition of "the snapshot" that both workflows share. The
# overlay action prints it after laying the live snapshot over the checkout,
# and refresh-media.yml prints it again after the refresh script has run; the
# two ids differ exactly when the script changed something. The same tree is
# what gets published: the media-snapshot branch is a single parentless
# commit whose tree is this one, which is why the branch holds only these two
# paths and nothing of main.
#
# The paths are added to a scratch index rather than the repository's own,
# so main's checkout — and the diff a human might be looking at — is never
# touched. An index file that does not exist yet is how git spells "start
# from empty".
set -euo pipefail

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
export GIT_INDEX_FILE="$scratch/index"

git add --force -- src/lib/media/live.json
# git tracks files, not directories: a run whose every image failed to mirror
# leaves the thumbs directory empty (or absent), and `git add` refuses a
# pathspec that matches no file. Such a snapshot simply has no thumbs tree.
if [ -d public/media/thumbs ] && [ -n "$(ls -A public/media/thumbs)" ]; then
  git add --force -- public/media/thumbs
fi
git write-tree
